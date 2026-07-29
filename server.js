const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const HMAC_SECRET = process.env.DUAN_SECRET || 'duan-dev-secret-cambia-esto';
const PORT = process.env.PORT || 3000;

// --- Almacenamiento en memoria (se resetea si el server se reinicia) ---
// Para producción real con persistencia, migrar esto a Supabase u otra DB.
const siteKeys = new Map(); // siteKey -> secretKey
const usedChallenges = new Set(); // evita reusar el mismo challenge

// Site key de demo, ya cargada para que el widget de la landing funcione ya mismo
const DEMO_SITE_KEY = 'duan_demo_sitekey_0001';
const DEMO_SECRET_KEY = 'duan_demo_secret_0001';
siteKeys.set(DEMO_SITE_KEY, DEMO_SECRET_KEY);

function sign(data) {
  return crypto.createHmac('sha256', HMAC_SECRET).update(data).digest('hex');
}

function genKey(prefix) {
  return `${prefix}_${crypto.randomBytes(16).toString('hex')}`;
}

// --- El widget usa esto para saber si hay conexión real con el server ---
app.get('/api/ping', (req, res) => res.json({ ok: true, ts: Date.now() }));

// --- Generar par de llaves para usar Duan en otro sitio ---
// Demo: sin autenticación. En producción, proteger este endpoint (login, rate limit, etc).
app.post('/api/keys', (req, res) => {
  const siteKey = genKey('duan_site');
  const secretKey = genKey('duan_secret');
  siteKeys.set(siteKey, secretKey);
  res.json({ siteKey, secretKey });
});

// --- Generar un challenge (rompecabezas) firmado ---
app.get('/api/duan/challenge', (req, res) => {
  const { sitekey } = req.query;
  if (!sitekey || !siteKeys.has(sitekey)) {
    return res.status(400).json({ error: 'sitekey inválida' });
  }

  const id = crypto.randomBytes(8).toString('hex');
  const target = 40 + Math.floor(Math.random() * 200); // posición objetivo en px
  const issuedAt = Date.now();
  const payload = `${id}.${target}.${issuedAt}.${sitekey}`;
  const sig = sign(payload);

  res.json({ id, target, issuedAt, sitekey, sig });
});

// --- Verificar el intento del usuario (arrastre + señales de comportamiento) ---
app.post('/api/duan/verify', (req, res) => {
  const {
    id, target, issuedAt, sitekey, sig, // datos del challenge original
    achieved,                           // posición final donde soltó la pieza
    movements,                          // [{x, t}, ...] muestreo del arrastre
    trusted,                            // si todos los eventos fueron isTrusted
    webdriver, languages, plugins, screenW, screenH, touch,
    online,
  } = req.body || {};

  const fail = (reason) => res.json({ success: false, reason });

  if (!id || !sitekey || !siteKeys.has(sitekey)) return fail('sitekey_invalida');
  if (usedChallenges.has(id)) return fail('challenge_reutilizado');

  const payload = `${id}.${target}.${issuedAt}.${sitekey}`;
  if (sign(payload) !== sig) return fail('firma_invalida');

  const now = Date.now();
  const elapsed = now - issuedAt;
  if (elapsed > 2 * 60 * 1000) return fail('challenge_expirado');
  if (elapsed < 350) return fail('demasiado_rapido'); // ningún humano arrastra en <350ms

  usedChallenges.add(id);
  setTimeout(() => usedChallenges.delete(id), 5 * 60 * 1000);

  let score = 0; // 0 = humano, 100 = bot
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
    // un movimiento humano real varía de velocidad; uno perfectamente uniforme es sospechoso
    if (variance < 0.0005) { score += 30; reasons.push('velocidad_demasiado_uniforme'); }
  }

  if (!languages) { score += 15; reasons.push('sin_idiomas_declarados'); }
  if (plugins === 0) { score += 10; reasons.push('sin_plugins'); }
  if (!touch && screenW === 800 && screenH === 600) { score += 20; reasons.push('resolucion_tipica_headless'); }

  score = Math.min(score, 100);
  const success = score < 45;

  let token = null;
  if (success) {
    const tokenPayload = `${sitekey}.${now}.verified`;
    token = Buffer.from(`${tokenPayload}.${sign(tokenPayload)}`).toString('base64');
  }

  res.json({ success, score, reasons: success ? [] : reasons, token });
});

// --- El backend del SITIO que usa Duan valida el token acá con su secretKey ---
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
