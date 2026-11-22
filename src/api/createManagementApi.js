import http from 'node:http';
import { readFile } from 'node:fs/promises';
const dashboardDir = new URL('../dashboard/', import.meta.url);

/** Local-only management API. No registration or ownership provisioning routes. */
export function createManagementApi({ authStore, accessController, now = () => Date.now(), maxBodyBytes = 2048, auditLog } = {}) {
  if (!authStore?.authenticate || !authStore?.login || !accessController?.authorize) {
    throw new Error('Authentication store and access controller required');
  }
  const loginAttempts = new Map();
  const audit = (event, fields) => {
    if (!auditLog) return;
    // Do not expose logging failures or sensitive request data to clients.
    void auditLog.record(event, fields).catch(() => {});
  };
  const send = (res, code, data) => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY', 'content-security-policy': "default-src 'none'; frame-ancestors 'none'" });
    res.end(JSON.stringify(data));
  };
  const readBody = async req => {
    let size = 0, data = '';
    for await (const chunk of req) {
      size += chunk.length;
      if (size > maxBodyBytes) throw Object.assign(new Error('Body too large'), { status: 413 });
      data += chunk;
    }
    try { return JSON.parse(data || '{}'); }
    catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
  };
  const handler = async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const path = url.pathname;
      // Reject browser cross-origin writes even if a token is compromised elsewhere.
      if (req.headers.origin) {
        let origin;
        try { origin = new URL(req.headers.origin); } catch { return send(res, 403, { error: 'Forbidden origin' }); }
        const authority = req.headers.host;
        if (!authority || origin.host !== authority || !['http:', 'https:'].includes(origin.protocol)) {
          return send(res, 403, { error: 'Forbidden origin' });
        }
      }
      if (req.method === 'OPTIONS') return send(res, 405, { error: 'Method not allowed' });
      if (req.method === 'GET' && (path === '/dashboard' || path === '/dashboard/' || path === '/dashboard/app.js' || path === '/dashboard/style.css')) {
        const file = path.endsWith('app.js') ? 'app.js' : path.endsWith('style.css') ? 'style.css' : 'index.html';
        const content = await readFile(new URL(file, dashboardDir));
        res.writeHead(200, {
          'content-type': file.endsWith('.js') ? 'text/javascript; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
          'referrer-policy': 'no-referrer',
          'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
          'x-frame-options': 'DENY'
        });
        return res.end(content);
      }
      if (req.method === 'GET' && path === '/health') return send(res, 200, { ok: true, uptimeSeconds: Math.floor(process.uptime()) });
      if (req.method === 'POST' && path === '/auth/login') {
        const ip = req.socket.remoteAddress || 'unknown';
        const key = ip; // global per-IP throttle, including unknown user IDs
        const recent = (loginAttempts.get(key) || []).filter(t => now() - t < 15 * 60_000);
        if (recent.length >= 5) { audit('login_throttled'); return send(res, 429, { error: 'Too many login attempts' }); }
        recent.push(now()); loginAttempts.set(key, recent);
        // Bound memory use even if many distinct clients contact the local API.
        if (loginAttempts.size > 1024) {
          for (const [address, timestamps] of loginAttempts) {
            if (!timestamps.some(t => now() - t < 15 * 60_000)) loginAttempts.delete(address);
          }
          if (loginAttempts.size > 1024) loginAttempts.delete(loginAttempts.keys().next().value);
        }
        const body = await readBody(req);
        try {
          const result = await authStore.login(body.userId, body.password);
          audit('login_success', { userId: result.userId });
          return send(res, 200, result);
        } catch { audit('login_failure'); return send(res, 401, { error: 'Invalid credentials' }); }
      }
      const match = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '');
      if (!match) return send(res, 401, { error: 'Unauthenticated' });
      let principal;
      try { principal = authStore.authenticate(match[1]).userId; }
      catch { return send(res, 401, { error: 'Unauthenticated' }); }
      if (req.method === 'POST' && path === '/auth/logout') {
        await authStore.logout(match[1]); audit('logout', { userId: principal }); return send(res, 200, { ok: true });
      }
      if (req.method === 'GET' && path === '/sessions') {
        const sessions = accessController.sessions.listSessions()
          .filter(s => { try { accessController.authorize(principal, s.id); return true; } catch { return false; } })
          .map(s => ({ sessionId: s.id, status: accessController.getStatus(principal, s.id) }));
        return send(res, 200, { sessions });
      }
      const route = /^\/sessions\/([a-zA-Z0-9_-]{1,64})(?:\/(status|qr|qr-image|connect|disconnect|pair))?$/.exec(path);
      if (!route) return send(res, 404, { error: 'Not found' });
      const [, sessionId, action = 'status'] = route;
      try { accessController.authorize(principal, sessionId); }
      catch { audit('access_denied', { userId: principal, sessionId }); return send(res, 404, { error: 'Not found' }); }
      if (req.method === 'GET' && action === 'status') return send(res, 200, { sessionId, status: accessController.getStatus(principal, sessionId) });
      if (req.method === 'GET' && action === 'qr-image') {
        const qr = accessController.getQR(principal, sessionId);
        if (!qr) return send(res, 404, { error: 'QR not available yet' });
        const { default: QRCode } = await import('qrcode');
        const svg = await QRCode.toString(qr, { type: 'svg', margin: 2, width: 280 });
        res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox" });
        return res.end(svg);
      }
      if (req.method === 'GET' && action === 'qr') return send(res, 200, { sessionId, qr: accessController.getQR(principal, sessionId) });
      if (req.method === 'POST' && action === 'connect') { const result = await accessController.connect(principal, sessionId); audit('session_connect', { userId: principal, sessionId }); return send(res, 200, result); }
      if (req.method === 'POST' && action === 'disconnect') { const disconnected = await accessController.disconnect(principal, sessionId); audit('session_disconnect', { userId: principal, sessionId }); return send(res, 200, { disconnected }); }
      if (req.method === 'POST' && action === 'pair') {
        const body = await readBody(req);
        if (typeof body.phoneNumber !== 'string') return send(res, 400, { error: 'Invalid phone number' });
        const result = await accessController.requestPairingCode(principal, sessionId, body.phoneNumber); audit('pairing_requested', { userId: principal, sessionId }); return send(res, 200, result);
      }
      return send(res, 405, { error: 'Method not allowed' });
    } catch (error) {
      if (error.status === 413 || error.status === 400) return send(res, error.status, { error: error.message });
      // Never leak internal stack traces or WhatsApp credentials to clients.
      return send(res, 500, { error: 'Operation failed' });
    }
  };
  const server = http.createServer(handler);
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  return server;
}

/** Deliberately refuses public binds without a separate reviewed deployment design. */
export async function listenLocal(api, { port = 8787, host = '127.0.0.1' } = {}) {
  if (host !== '127.0.0.1' && host !== '::1') throw new Error('Management API must bind to loopback');
  return new Promise((resolve, reject) => {
    api.once('error', reject);
    api.listen(port, host, () => { api.off('error', reject); resolve(api.address()); });
  });
}
