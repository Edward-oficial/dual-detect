const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');

const app = express();
app.set('trust proxy', true); // necesario en Render para leer la IP real del visitante
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const HMAC_SECRET = process.env.DUAN_SECRET || 'duan-dev-secret-cambia-esto';
const PORT = process.env.PORT || 3000;

// --- Almacenamiento en memoria (se resetea si el server se reinicia) ---
const siteKeys = new Map(); // siteKey -> secretKey
const usedChallenges = new Set(); // evita reusar el mismo challenge
const ipStats = new Map(); // ip -> { fails, blockedUntil }
const rateBuckets = new Map(); // "endpoint:ip" -> [timestamps]

const DEMO_SITE_KEY = 'duan_demo_sitekey_0001';
const DEMO_SECRET_KEY = 'duan_demo_secret_0001';
siteKeys.set(DEMO_SITE_KEY, DEMO_SECRET_KEY);

function sign(data) {
  return crypto.createHmac('sha256', HMAC_SECRET).update(data).digest('hex');
}
function genKey(prefix) {
  return `${prefix}_${crypto.randomBytes(16).toString('hex')}`;
}

// --- IP real del visitante ---
// Render pone al server detrás de un proxy: con trust_proxy activado,
// express ya resuelve req.ip correctamente a partir de X-Forwarded-For.
function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return req.ip || (req.connection && req.connection.remoteAddress) || 'unknown';
}
function ipHash(ip) {
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

// --- Reputación por IP: bloqueo temporal tras fallos repetidos ---
function isBlocked(ip) {
  const s = ipStats.get(ip);
  return !!(s && s.blockedUntil && Date.now() < s.blockedUntil);
}
function registerFail(ip) {
  const s = ipStats.get(ip) || { fails: 0, blockedUntil: 0 };
  s.fails += 1;
  if (s.fails >= 4) {
    s.blockedUntil = Date.now() + 15_000 * Math.min(s.fails - 3, 8); // se escalona: 15s, 30s, 45s...
  }
  ipStats.set(ip, s);
}
function registerSuccess(ip) {
  ipStats.set(ip, { fails: 0, blockedUntil: 0 });
}

// --- Rate limit simple por IP, sin dependencias extra ---
function rateLimited(ip, bucketKey, max, windowMs) {
  const key = `${bucketKey}:${ip}`;
  const now = Date.now();
  const arr = (rateBuckets.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  rateBuckets.set(key, arr);
  return arr.length > max;
}

app.get('/api/ping', (req, res) => res.json({ ok: true, ts: Date.now() }));

app.post('/api/keys', (req, res) => {
  const siteKey = genKey('duan_site');
  const secretKey = genKey('duan_secret');
  siteKeys.set(siteKey, secretKey);
  res.json({ siteKey, secretKey });
});

// --- Paso 1: chequeo silencioso (como el checkbox de hCaptcha) ---
// Si el riesgo es bajo, verifica sin pedir nada más ("frictionless").
// Si el riesgo es medio/alto, pide resolver el rompecabezas.
app.post('/api/duan/precheck', (req, res) => {
  const ip = getClientIp(req);

  if (isBlocked(ip)) {
    const s = ipStats.get(ip);
    return res.json({ success: false, blocked: true, retryInMs: s.blockedUntil - Date.now() });
  }
  if (rateLimited(ip, 'precheck', 30, 60_000)) {
    return res.status(429).json({ error: 'demasiadas_solicitudes' });
  }

  const {
    sitekey, mouseMovements, timeOnPage, webdriver,
    languages, plugins, screenW, screenH, touch,
  } = req.body || {};

  if (!sitekey || !siteKeys.has(sitekey)) return res.status(400).json({ error: 'sitekey_invalida' });

  const stats = ipStats.get(ip) || { fails: 0 };

  let risk = 0;
  if (webdriver) risk += 60;
  if (!mouseMovements || mouseMovements < 2) risk += 20;
  if (typeof timeOnPage === 'number' && timeOnPage < 800) risk += 20;
  if (!languages) risk += 10;
  if (plugins === 0) risk += 10;
  if (!touch && screenW === 800 && screenH === 600) risk += 15;
  risk += Math.min(stats.fails * 10, 40); // mala reputación de la IP suma riesgo

  if (risk < 20) {
    const now = Date.now();
    const tokenPayload = `${sitekey}.${now}.verified`;
    const token = Buffer.from(`${tokenPayload}.${sign(tokenPayload)}`).toString('base64');
    registerSuccess(ip);
    return res.json({ success: true, frictionless: true, token });
  }

  res.json({ success: false, needsChallenge: true });
});

// --- Paso 2 (solo si hizo falta): challenge del rompecabezas, atado a la IP ---
app.get('/api/duan/challenge', (req, res) => {
  const ip = getClientIp(req);

  if (isBlocked(ip)) {
    const s = ipStats.get(ip);
    return res.status(429).json({ error: 'ip_bloqueada', retryInMs: s.blockedUntil - Date.now() });
  }
  if (rateLimited(ip, 'challenge', 20, 60_000)) {
    return res.status(429).json({ error: 'demasiadas_solicitudes' });
  }

  const { sitekey } = req.query;
  if (!sitekey || !siteKeys.has(sitekey)) return res.status(400).json({ error: 'sitekey_invalida' });

  const id = crypto.randomBytes(8).toString('hex');
  const target = 40 + Math.floor(Math.random() * 200);
  const issuedAt = Date.now();
  // el challenge queda firmado atado a la IP que lo pidió: si alguien lo reenvía
  // desde otra IP (por ejemplo, un pool de bots resolviendo para otros), la firma no cierra
  const payload = `${id}.${target}.${issuedAt}.${sitekey}.${ipHash(ip)}`;
  const sig = sign(payload);

  res.json({ id, target, issuedAt, sitekey, sig });
});

app.post('/api/duan/verify', (req, res) => {
  const ip = getClientIp(req);

  if (isBlocked(ip)) {
    const s = ipStats.get(ip);
    return res.json({ success: false, reason: 'ip_bloqueada', retryInMs: s.blockedUntil - Date.now() });
  }
  if (rateLimited(ip, 'verify', 20, 60_000)) {
    return res.status(429).json({ error: 'demasiadas_solicitudes' });
  }

  const {
    id, target, issuedAt, sitekey, sig,
    achieved, movements, trusted,
    webdriver, languages, plugins, screenW, screenH, touch, online,
  } = req.body || {};

  const fail = (reason) => {
    registerFail(ip);
    return res.json({ success: false, reason });
  };

  if (!id || !sitekey || !siteKeys.has(sitekey)) return fail('sitekey_invalida');
  if (usedChallenges.has(id)) return fail('challenge_reutilizado');

  const payload = `${id}.${target}.${issuedAt}.${sitekey}.${ipHash(ip)}`;
  if (sign(payload) !== sig) return fail('firma_invalida_o_ip_distinta');

  const now = Date.now();
  const elapsed = now - issuedAt;
  if (elapsed > 2 * 60 * 1000) return fail('challenge_expirado');
  if (elapsed < 350) return fail('demasiado_rapido');

  usedChallenges.add(id);
  setTimeout(() => usedChallenges.delete(id), 5 * 60 * 1000);

  let score = 0;
  const reasons = [];

  if (Math.abs(achieved - target) > 6) { score += 100; reasons.push('pieza_mal_ubicada'); }
  if (!online) { score += 40; reasons.push('sin_conexion_reportada'); }
  if (webdriver) { score += 60; reasons.push('webdriver_detectado'); }
  if (trusted === false) { score += 60; reasons.push('eventos_no_confiables'); }
  if (!Array.isArray(movements) || movements.length < 6) { score += 35; reasons.push('pocos_puntos_de_movimiento'); }

  if (Array.isArray(movements) && movements.length >= 2) {
    const deltas = [];
    for (let i = 1; i < movements.length; i++) {
      const dt = movements[i].t - movements[i - 1].t;
      const dx = movements[i].x - movements[i - 1].x;
      if (dt > 0) deltas.push(dx / dt);
    }
    const avg = deltas.reduce((a, b) => a + b, 0) / (deltas.length || 1);
    const variance = deltas.reduce((a, b) => a + (b - avg) ** 2, 0) / (deltas.length || 1);
    if (variance < 0.0005) { score += 30; reasons.push('velocidad_demasiado_uniforme'); }
  }

  if (!languages) { score += 15; reasons.push('sin_idiomas_declarados'); }
  if (plugins === 0) { score += 10; reasons.push('sin_plugins'); }
  if (!touch && screenW === 800 && screenH === 600) { score += 20; reasons.push('resolucion_tipica_headless'); }

  score = Math.min(score, 100);
  const success = score < 45;

  if (!success) {
    registerFail(ip);
    return res.json({ success: false, score, reasons });
  }

  registerSuccess(ip);
  const tokenPayload = `${sitekey}.${now}.verified`;
  const token = Buffer.from(`${tokenPayload}.${sign(tokenPayload)}`).toString('base64');
  res.json({ success: true, score, token });
});

app.post('/api/duan/siteverify', (req, res) => {
  const { token, secret } = req.body || {};
  if (!token || !secret) return res.status(400).json({ success: false });

  let decoded;
  try {
    decoded = Buffer.from(token, 'base64').toString('utf8');
  } catch {
    return res.json({ success: false });
  }

  const parts = decoded.split('.');
  const sig = parts.pop();
  const [sitekey, ts, verdict] = parts;
  const expected = sign(`${sitekey}.${ts}.${verdict}`);

  const validSecret = siteKeys.get(sitekey) === secret;
  const validSig = sig === expected;
  const notExpired = Date.now() - Number(ts) < 10 * 60 * 1000;

  res.json({ success: Boolean(validSecret && validSig && notExpired && verdict === 'verified') });
});

app.listen(PORT, () => console.log(`Duan corriendo en el puerto ${PORT}`));
