const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.set('trust proxy', true);
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const HMAC_SECRET = process.env.DUAN_SECRET || 'duan-dev-secret-cambia-esto';
const PORT = process.env.PORT || 3000;

// ============================================================
// Supabase (mismo proyecto de Sakura) — service_role key
// ============================================================
const SUPABASE_URL = 'https://nrwwwhgsyfrrunobupha.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5yd3d3aGdzeWZycnVub2J1cGhhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDY3NjUxNCwiZXhwIjoyMTAwMjUyNTE0fQ.jG9x6JQ8KSIt7d6cnHOJOeEWuKTxvYz1clU6bZf6t1g';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================================
// Clave para entrar al panel oculto de administración.
// Cambiala por algo random y larga que solo sepas vos.
// ============================================================
const ADMIN_KEY = 'DuanJaixu';
// ============================================================

const DEMO_SITE_KEY = 'duan_demo_sitekey_0001';
const DEMO_SECRET_KEY = 'duan_demo_secret_0001';

(async () => {
  const { data } = await supabase.from('duan_site_keys').select('site_key').eq('site_key', DEMO_SITE_KEY).maybeSingle();
  if (!data) {
    await supabase.from('duan_site_keys').insert({ site_key: DEMO_SITE_KEY, secret_key: DEMO_SECRET_KEY });
  }
})();

function sign(data) {
  return crypto.createHmac('sha256', HMAC_SECRET).update(data).digest('hex');
}
function genKey(prefix) {
  return `${prefix}_${crypto.randomBytes(16).toString('hex')}`;
}
function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return req.ip || (req.connection && req.connection.remoteAddress) || 'unknown';
}
function ipHash(ip) {
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

// --- Site keys (Supabase) ---
async function getSiteKeyRow(siteKey) {
  const { data } = await supabase.from('duan_site_keys').select('*').eq('site_key', siteKey).maybeSingle();
  return data;
}
async function siteKeyExists(siteKey) {
  return (await getSiteKeyRow(siteKey)) !== null;
}
async function createSiteKeyPair() {
  const siteKey = genKey('duan_site');
  const secretKey = genKey('duan_secret');
  await supabase.from('duan_site_keys').insert({ site_key: siteKey, secret_key: secretKey });
  return { siteKey, secretKey };
}
// registra que la site key se usó de verdad (el widget se cargó en una página real)
async function touchUsage(sitekey) {
  const row = await getSiteKeyRow(sitekey);
  if (!row) return;
  await supabase.from('duan_site_keys').update({
    uses: (row.uses || 0) + 1,
    last_used_at: new Date().toISOString(),
  }).eq('site_key', sitekey);
}
async function touchVerified(sitekey) {
  const row = await getSiteKeyRow(sitekey);
  if (!row) return;
  await supabase.from('duan_site_keys').update({
    verified: (row.verified || 0) + 1,
  }).eq('site_key', sitekey);
}

// --- Reputación por IP (Supabase) ---
async function getIpStats(ip) {
  const hash = ipHash(ip);
  const { data } = await supabase.from('duan_ip_stats').select('*').eq('ip_hash', hash).maybeSingle();
  return data || { ip_hash: hash, fails: 0, blocked_until: null };
}
async function ipBlockInfo(ip) {
  const s = await getIpStats(ip);
  const until = s.blocked_until ? new Date(s.blocked_until).getTime() : 0;
  const blocked = until > Date.now();
  return { blocked, retryInMs: blocked ? until - Date.now() : 0 };
}
async function registerFail(ip) {
  const s = await getIpStats(ip);
  const fails = s.fails + 1;
  let blockedUntil = s.blocked_until;
  if (fails >= 4) {
    blockedUntil = new Date(Date.now() + 15_000 * Math.min(fails - 3, 8)).toISOString();
  }
  await supabase.from('duan_ip_stats').upsert({
    ip_hash: ipHash(ip), fails, blocked_until: blockedUntil, updated_at: new Date().toISOString(),
  });
}
async function registerSuccess(ip) {
  await supabase.from('duan_ip_stats').upsert({
    ip_hash: ipHash(ip), fails: 0, blocked_until: null, updated_at: new Date().toISOString(),
  });
}

// --- Challenges usados (Supabase) ---
async function isChallengeUsed(id) {
  const { data } = await supabase.from('duan_used_challenges').select('id').eq('id', id).maybeSingle();
  return !!data;
}
async function markChallengeUsed(id) {
  await supabase.from('duan_used_challenges').insert({ id });
}

// --- Rate limit por IP, en memoria (corta duración, no crítico persistir) ---
const rateBuckets = new Map();
function rateLimited(ip, bucketKey, max, windowMs) {
  const key = `${bucketKey}:${ip}`;
  const now = Date.now();
  const arr = (rateBuckets.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  rateBuckets.set(key, arr);
  return arr.length > max;
}

app.get('/api/ping', (req, res) => res.json({ ok: true, ts: Date.now() }));

app.post('/api/keys', async (req, res) => {
  const { siteKey, secretKey } = await createSiteKeyPair();
  res.json({ siteKey, secretKey });
});

app.post('/api/duan/precheck', async (req, res) => {
  const ip = getClientIp(req);

  const block = await ipBlockInfo(ip);
  if (block.blocked) return res.json({ success: false, blocked: true, retryInMs: block.retryInMs });
  if (rateLimited(ip, 'precheck', 30, 60_000)) return res.status(429).json({ error: 'demasiadas_solicitudes' });

  const { sitekey, mouseMovements, timeOnPage, webdriver, languages, plugins, screenW, screenH, touch } = req.body || {};
  if (!sitekey || !(await siteKeyExists(sitekey))) return res.status(400).json({ error: 'sitekey_invalida' });
  await touchUsage(sitekey);

  const stats = await getIpStats(ip);

  let risk = 0;
  if (webdriver) risk += 60;
  if (!mouseMovements || mouseMovements < 2) risk += 20;
  if (typeof timeOnPage === 'number' && timeOnPage < 800) risk += 20;
  if (!languages) risk += 10;
  if (plugins === 0) risk += 10;
  if (!touch && screenW === 800 && screenH === 600) risk += 15;
  risk += Math.min(stats.fails * 10, 40);

  if (risk < 20) {
    const now = Date.now();
    const tokenPayload = `${sitekey}.${now}.verified`;
    const token = Buffer.from(`${tokenPayload}.${sign(tokenPayload)}`).toString('base64');
    await registerSuccess(ip);
    await touchVerified(sitekey);
    return res.json({ success: true, frictionless: true, token });
  }

  res.json({ success: false, needsChallenge: true });
});

app.get('/api/duan/challenge', async (req, res) => {
  const ip = getClientIp(req);

  const block = await ipBlockInfo(ip);
  if (block.blocked) return res.status(429).json({ error: 'ip_bloqueada', retryInMs: block.retryInMs });
  if (rateLimited(ip, 'challenge', 20, 60_000)) return res.status(429).json({ error: 'demasiadas_solicitudes' });

  const { sitekey } = req.query;
  if (!sitekey || !(await siteKeyExists(sitekey))) return res.status(400).json({ error: 'sitekey_invalida' });

  const id = crypto.randomBytes(8).toString('hex');
  const target = 40 + Math.floor(Math.random() * 200);
  const issuedAt = Date.now();
  const payload = `${id}.${target}.${issuedAt}.${sitekey}.${ipHash(ip)}`;
  const sig = sign(payload);

  res.json({ id, target, issuedAt, sitekey, sig });
});

app.post('/api/duan/verify', async (req, res) => {
  const ip = getClientIp(req);

  const block = await ipBlockInfo(ip);
  if (block.blocked) return res.json({ success: false, reason: 'ip_bloqueada', retryInMs: block.retryInMs });
  if (rateLimited(ip, 'verify', 20, 60_000)) return res.status(429).json({ error: 'demasiadas_solicitudes' });

  const {
    id, target, issuedAt, sitekey, sig,
    achieved, movements, trusted,
    webdriver, languages, plugins, screenW, screenH, touch, online,
  } = req.body || {};

  const fail = async (reason) => {
    await registerFail(ip);
    return res.json({ success: false, reason });
  };

  if (!id || !sitekey || !(await siteKeyExists(sitekey))) return fail('sitekey_invalida');
  if (await isChallengeUsed(id)) return fail('challenge_reutilizado');

  const payload = `${id}.${target}.${issuedAt}.${sitekey}.${ipHash(ip)}`;
  if (sign(payload) !== sig) return fail('firma_invalida_o_ip_distinta');

  const now = Date.now();
  const elapsed = now - issuedAt;
  if (elapsed > 2 * 60 * 1000) return fail('challenge_expirado');
  if (elapsed < 350) return fail('demasiado_rapido');

  await markChallengeUsed(id);

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
    await registerFail(ip);
    return res.json({ success: false, score, reasons });
  }

  await registerSuccess(ip);
  await touchVerified(sitekey);
  const tokenPayload = `${sitekey}.${now}.verified`;
  const token = Buffer.from(`${tokenPayload}.${sign(tokenPayload)}`).toString('base64');
  res.json({ success: true, score, token });
});

app.post('/api/duan/siteverify', async (req, res) => {
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

  const row = await getSiteKeyRow(sitekey);
  const validSecret = row && row.secret_key === secret;
  const validSig = sig === expected;
  const notExpired = Date.now() - Number(ts) < 10 * 60 * 1000;

  res.json({ success: Boolean(validSecret && validSig && notExpired && verdict === 'verified') });
});

// --- Panel oculto: sin link en ningún menú, solo se entra con la URL directa ---
app.get('/api/admin/keys', async (req, res) => {
  if (req.query.key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'no autorizado' });
  }
  const { data, error } = await supabase
    .from('duan_site_keys')
    .select('site_key, created_at, uses, verified, last_used_at')
    .order('last_used_at', { ascending: false, nullsFirst: false });

  if (error) return res.status(500).json({ error: error.message });

  const keys = data.map((row) => ({
    siteKey: row.site_key,
    createdAt: row.created_at,
    uses: row.uses || 0,
    verified: row.verified || 0,
    lastUsedAt: row.last_used_at,
  }));

  res.json({ keys });
});

app.listen(PORT, () => console.log(`Duan corriendo en el puerto ${PORT}`));
