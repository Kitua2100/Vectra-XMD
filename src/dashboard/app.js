let token = null;
let selected = null;
let qrUrl = null;
const $ = id => document.getElementById(id);
function notice(message) { $('notice').textContent = message; }
function clearQR() { if (qrUrl) URL.revokeObjectURL(qrUrl); qrUrl = null; $('qrImage').removeAttribute('src'); $('qrArea').hidden = true; }
function reset() { token = null; selected = null; clearQR(); $('pairResult').textContent = ''; $('workspace').hidden = true; $('login').hidden = false; $('password').value = ''; }
async function request(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, cache: 'no-store' });
  if (response.status === 401 && token) { reset(); throw new Error('Session expired. Sign in again.'); }
  if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || `Request failed (${response.status})`); }
  return response;
}
async function json(path, options) { return (await request(path, options)).json(); }
async function refresh() {
  const { sessions } = await json('/sessions');
  const container = $('sessions'); container.replaceChildren();
  if (!sessions.length) { const p = document.createElement('p'); p.textContent = 'No sessions assigned. Ask your administrator to provision one.'; container.append(p); }
  for (const item of sessions) {
    const b = document.createElement('button'); b.className = 'session';
    const title = document.createElement('strong'); title.textContent = item.sessionId;
    const status = document.createElement('span'); status.textContent = item.status;
    b.append(title, status); b.addEventListener('click', () => { selected = item.sessionId; clearQR(); $('pairResult').textContent = ''; $('detailTitle').textContent = item.sessionId; $('detailStatus').textContent = `Status: ${item.status}`; $('details').hidden = false; }); container.append(b);
  }
  if (selected) { const current = sessions.find(s => s.sessionId === selected); if (current) $('detailStatus').textContent = `Status: ${current.status}`; else { selected = null; $('details').hidden = true; clearQR(); } }
}
async function action(name, payload) { if (!selected) return; await json(`/sessions/${encodeURIComponent(selected)}/${name}`, { method: 'POST', ...(payload ? { body: JSON.stringify(payload) } : {}) }); await refresh(); }
$('loginForm').addEventListener('submit', async e => { e.preventDefault(); try { const data = await json('/auth/login', { method: 'POST', body: JSON.stringify({ userId: $('userId').value, password: $('password').value }) }); token = data.token; $('password').value = ''; $('login').hidden = true; $('workspace').hidden = false; await refresh(); notice('Signed in. Your token is held in memory only.'); } catch (err) { notice(err.message); } });
$('refresh').addEventListener('click', () => refresh().catch(err => notice(err.message)));
$('logout').addEventListener('click', async () => { try { await json('/auth/logout', { method: 'POST' }); } catch {} reset(); notice('Logged out.'); });
$('connect').addEventListener('click', () => action('connect').then(() => notice('Connection initiated. Refresh for updates.')).catch(err => notice(err.message)));
$('disconnect').addEventListener('click', () => action('disconnect').then(() => { clearQR(); notice('Disconnected.'); }).catch(err => notice(err.message)));
$('showQr').addEventListener('click', async () => { try { clearQR(); const response = await request(`/sessions/${encodeURIComponent(selected)}/qr-image`); qrUrl = URL.createObjectURL(await response.blob()); $('qrImage').src = qrUrl; $('qrArea').hidden = false; notice('Keep this QR code private.'); } catch (err) { notice(err.message); } });
$('pairForm').addEventListener('submit', async e => { e.preventDefault(); try { const result = await json(`/sessions/${encodeURIComponent(selected)}/pair`, { method: 'POST', body: JSON.stringify({ phoneNumber: $('phone').value }) }); $('pairResult').textContent = `Pairing code: ${result.code}`; notice('Enter this code in WhatsApp. Never share it.'); } catch (err) { notice(err.message); } });
window.addEventListener('pagehide', clearQR);

// Poll only session status; never poll sensitive QR or pairing-code endpoints.
setInterval(() => { if (token && !document.hidden) refresh().catch(() => {}); }, 15_000);
