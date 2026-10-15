/**
 * Manhole-Mitra Command Center
 *
 * Secure architecture:
 * ESP32 -> Blynk Cloud -> Blynk webhook -> this backend -> SSE -> custom website
 *
 * The browser never receives a Blynk device token. All Blynk secrets live only
 * in .env / Render environment variables.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

function loadEnv(file = path.join(__dirname, '.env')) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const clean = line.trim();
    if (!clean || clean.startsWith('#')) continue;
    const split = clean.indexOf('=');
    if (split < 1) continue;
    const key = clean.slice(0, split).trim();
    const value = clean.slice(split + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnv();

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
const CONTROL_KEY = process.env.CONTROL_KEY || '';
const BLYNK_SERVER = (process.env.BLYNK_SERVER || 'https://blr1.blynk.cloud').replace(/\/$/, '');
const BLYNK_DEVICE_TOKEN = process.env.BLYNK_DEVICE_TOKEN || '';
const POLL_BLYNK = String(process.env.POLL_BLYNK || 'false').toLowerCase() === 'true';
const POLL_INTERVAL_MS = Math.max(2000, Number(process.env.POLL_INTERVAL_MS || 5000));
const DEMO_MODE = String(process.env.DEMO_MODE || 'true').toLowerCase() === 'true';

const sseClients = new Set();
const coverLabels = ['COVER OK', 'COVER MISSING', 'COVER TILTED', 'RESET REQUIRED'];
const riskLabels = ['NORMAL', 'CAUTION', 'HIGH INTERNAL WATER', 'SENSOR FAULT'];

const state = {
  deviceName: 'MM 001 College Main Gate',
  source: DEMO_MODE ? 'demo' : 'waiting',
  heartbeat: 0,
  online: false,
  coverStatus: 0,
  internalDepth: 0,
  internalRisk: 0,
  probeGap: 0,
  lastUpdated: null,
  history: [],
  events: []
};

const nowISO = () => new Date().toISOString();
const safeNumber = (value, min, max) => {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : null;
};
function constantTimeEquals(candidate, expected) {
  if (!candidate || !expected) return false;
  const a = Buffer.from(String(candidate));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function classifyEvent(code) {
  const item = String(code || '').toLowerCase();
  if (item.includes('cover') || item.includes('flood')) return 'critical';
  if (item.includes('fault') || item.includes('rising')) return 'warning';
  return 'info';
}
function addEvent(code, message, type = classifyEvent(code), timestamp = nowISO()) {
  state.events.unshift({ id: crypto.randomUUID(), code: String(code), message: String(message), type, timestamp });
  state.events = state.events.slice(0, 40);
}
function addHistory(value, timestamp = nowISO()) {
  state.history.push({ value: Number(value), timestamp });
  state.history = state.history.slice(-72);
}
function serializableState() {
  return {
    ...state,
    coverLabel: coverLabels[state.coverStatus] || 'UNKNOWN',
    riskLabel: riskLabels[state.internalRisk] || 'UNKNOWN'
  };
}
function writeSse(event, payload) {
  const message = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    try { client.write(message); } catch (_) { sseClients.delete(client); }
  }
}
function broadcastState() { writeSse('state', serializableState()); }
function markLive(source = 'live', timestamp = nowISO()) {
  state.source = source;
  state.lastUpdated = timestamp;
  broadcastState();
}

function applyPin(pinRaw, valueRaw, source = 'live', timestamp = nowISO()) {
  const pin = String(pinRaw || '').trim().toUpperCase();
  let changed = false;
  if (pin === 'V0' || pin === '0') {
    const value = safeNumber(valueRaw, 0, 1);
    if (value !== null) { state.heartbeat = value; state.online = value === 1; changed = true; }
  } else if (pin === 'V1' || pin === '1') {
    const value = safeNumber(valueRaw, 0, 3);
    if (value !== null) { state.coverStatus = value; changed = true; }
  } else if (pin === 'V2' || pin === '2') {
    const value = safeNumber(valueRaw, 0, 1000);
    if (value !== null) { state.internalDepth = value; addHistory(value, timestamp); changed = true; }
  } else if (pin === 'V5' || pin === '5') {
    const value = safeNumber(valueRaw, 0, 3);
    if (value !== null) { state.internalRisk = value; changed = true; }
  } else if (pin === 'V6' || pin === '6') {
    const value = safeNumber(valueRaw, 0, 1000);
    if (value !== null) { state.probeGap = value; changed = true; }
  } else if (pin === 'V8' || pin === '8') {
    // Dedicated raw integer cover state from ESP32; avoids Blynk Enum-label mapping differences.
    const value = safeNumber(valueRaw, 0, 3);
    if (value !== null) { state.coverStatus = value; changed = true; }
  } else if (pin === 'V9' || pin === '9') {
    // Dedicated raw integer water-risk state from ESP32; avoids Blynk Enum-label mapping differences.
    const value = safeNumber(valueRaw, 0, 3);
    if (value !== null) { state.internalRisk = value; changed = true; }
  }
  if (changed) markLive(source, timestamp);
  return changed;
}
function applyWebhook(payload, query) {
  if (payload.device_name) state.deviceName = String(payload.device_name);
  const pin = payload.pin || payload.vPin || payload.vpin || payload.device_pin || query.pin || query.vPin;
  const value = payload.value ?? payload.pinValue ?? payload.device_pinValue ?? query.value;
  const timestamp = payload.timestamp || payload.timestamp_iso8601 || nowISO();
  if (pin !== undefined && value !== undefined) return applyPin(pin, value, 'live', timestamp);

  let updated = false;
  for (const [key, value] of Object.entries(payload)) {
    if (/^V(0|1|2|5|6)$/i.test(key)) updated = applyPin(key, value, 'live', timestamp) || updated;
  }
  return updated;
}
function applyEvent(payload, query) {
  const code = payload.code || payload.event || payload.event_code || payload.name || query.code || 'device_event';
  const message = payload.message || payload.description || payload.event_description || query.message || `Event received: ${code}`;
  if (payload.device_name) state.deviceName = String(payload.device_name);
  addEvent(code, message, classifyEvent(code), payload.timestamp || payload.timestamp_iso8601 || nowISO());
  markLive('live');
}

async function pollBlynk() {
  if (!POLL_BLYNK || !BLYNK_DEVICE_TOKEN) return;
  try {
    // Blynk stores the last virtual-pin values even after hardware disconnects.
    // Query actual connection state separately so the custom website never treats stale V0=1 as live hardware.
    const connectionEndpoint = `${BLYNK_SERVER}/external/api/isHardwareConnected?token=${encodeURIComponent(BLYNK_DEVICE_TOKEN)}`;
    const connectionResponse = await fetch(connectionEndpoint);
    if (!connectionResponse.ok) throw new Error(`connection check: Blynk returned HTTP ${connectionResponse.status}`);
    const connectionText = (await connectionResponse.text()).trim().replace(/^\"|\"$/g, '');
    const actualHardwareOnline = connectionText === 'true';

    // V8/V9 are raw Integer bridge streams specifically created for this website.
    // Do not use V1/V5 here because Blynk Enum labels can differ from their raw API representation.
    for (const pin of ['V0', 'V2', 'V6', 'V8', 'V9']) {
      const endpoint = `${BLYNK_SERVER}/external/api/get?token=${encodeURIComponent(BLYNK_DEVICE_TOKEN)}&${pin}`;
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error(`${pin}: Blynk returned HTTP ${response.status}`);
      const raw = (await response.text()).trim();
      let value = raw;
      try { const parsed = JSON.parse(raw); value = Array.isArray(parsed) ? parsed[0] : parsed; } catch (_) { /* Blynk may return a plain numeric value. */ }
      applyPin(pin, value, 'live', nowISO());
    }

    // Override cached V0 status with Blynk's real hardware lifecycle value.
    state.online = actualHardwareOnline;
    state.source = 'live';
    state.lastUpdated = nowISO();
    broadcastState();
  } catch (error) {
    console.error(`[Blynk polling] ${error.message}`);
  }
}

function seedDemo() {
  state.heartbeat = 1;
  state.online = true;
  state.coverStatus = 0;
  state.internalRisk = 0;
  state.internalDepth = 32;
  state.probeGap = 118;
  state.lastUpdated = nowISO();
  const base = Date.now();
  for (let i = 30; i >= 0; i--) {
    const value = 23 + Math.sin(i / 3.4) * 3.2 + (30 - i) * 0.24;
    addHistory(value, new Date(base - i * 60_000).toISOString());
  }
  addEvent('system_ready', 'Website preview is active. Waiting for Blynk webhook or polling data.', 'info');
}
if (DEMO_MODE) seedDemo();

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 1_000_000) req.destroy();
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        const type = String(req.headers['content-type'] || '');
        if (type.includes('application/x-www-form-urlencoded')) return resolve(Object.fromEntries(new URLSearchParams(raw)));
        try { return resolve(JSON.parse(raw)); } catch (_) { return resolve({ raw }); }
      } catch (error) { reject(error); }
    });
  });
}
function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}
function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'self'; form-action 'self'");
}
function serveStatic(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'application/javascript; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.ico':'image/x-icon' }[ext] || 'application/octet-stream';
  fs.readFile(filePath, (error, data) => {
    if (error) { res.writeHead(404); return res.end('Not found'); }
    setSecurityHeaders(res);
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store' });
    res.end(data);
  });
}
function webhookAuthorized(url, req) {
  return constantTimeEquals(url.searchParams.get('secret') || req.headers['x-manhole-secret'], WEBHOOK_SECRET);
}
function controlAuthorized(req, body) {
  return constantTimeEquals(req.headers['x-control-key'] || body.controlKey, CONTROL_KEY);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const method = req.method || 'GET';

  if (method === 'GET' && url.pathname === '/health') return sendJson(res, 200, { ok: true, service: 'manhole-mitra-command-center' });
  if (method === 'GET' && url.pathname === '/api/state') return sendJson(res, 200, serializableState());
  if (method === 'GET' && url.pathname === '/api/stream') {
    setSecurityHeaders(res);
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    res.write(`event: state\ndata: ${JSON.stringify(serializableState())}\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }
  if (method === 'POST' && url.pathname === '/api/blynk/webhook') {
    if (!webhookAuthorized(url, req)) return sendJson(res, 401, { error: 'Invalid webhook secret.' });
    try {
      const payload = await readBody(req);
      const updated = applyWebhook(payload, Object.fromEntries(url.searchParams));
      return sendJson(res, 200, { ok: true, updated });
    } catch (error) { return sendJson(res, 400, { error: error.message }); }
  }
  if (method === 'POST' && url.pathname === '/api/blynk/event') {
    if (!webhookAuthorized(url, req)) return sendJson(res, 401, { error: 'Invalid webhook secret.' });
    try { applyEvent(await readBody(req), Object.fromEntries(url.searchParams)); return sendJson(res, 200, { ok: true }); }
    catch (error) { return sendJson(res, 400, { error: error.message }); }
  }
  if (method === 'POST' && url.pathname === '/api/control/reset') {
    try {
      const body = await readBody(req);
      if (!controlAuthorized(req, body)) return sendJson(res, 401, { error: 'Incorrect control key.' });
      if (!BLYNK_DEVICE_TOKEN) return sendJson(res, 503, { error: 'BLYNK_DEVICE_TOKEN is not configured on this server.' });
      const endpoint = `${BLYNK_SERVER}/external/api/update?token=${encodeURIComponent(BLYNK_DEVICE_TOKEN)}&V10=1`;
      const response = await fetch(endpoint, { method: 'GET' });
      if (!response.ok) throw new Error(`Blynk returned HTTP ${response.status}`);
      addEvent('maintenance_reset_requested', 'Website requested a V10 maintenance reset. ESP32 will validate cover safety.', 'info');
      markLive(state.source === 'waiting' ? 'live' : state.source);
      return sendJson(res, 200, { ok: true, message: 'V10 reset request sent to Blynk. The ESP32 will reject it if cover sensors are unsafe.' });
    } catch (error) { return sendJson(res, 502, { error: error.message }); }
  }

  const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  const localPath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!localPath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  serveStatic(res, localPath);
});

setInterval(() => writeSse('ping', { timestamp: nowISO() }), 25_000);
server.listen(PORT, () => {
  console.log(`Manhole-Mitra Command Center running on http://0.0.0.0:${PORT}`);
  console.log(`Webhook endpoint: /api/blynk/webhook (secret via X-Manhole-Secret header)`);
  if (POLL_BLYNK && BLYNK_DEVICE_TOKEN) {
    console.log(`Blynk polling fallback enabled every ${POLL_INTERVAL_MS} ms`);
    pollBlynk();
    setInterval(pollBlynk, POLL_INTERVAL_MS);
  }
});
