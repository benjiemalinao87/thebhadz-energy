const $ = (id) => document.getElementById(id);

function setStatus(msg, kind) {
  const el = $('status');
  el.textContent = msg || '';
  el.className = 'status' + (kind ? ' ' + kind : '');
}

// Whatever the founder pastes (with /internal, trailing slash, etc.) is reduced to
// the origin — the API path is fixed at /api/captures on that origin.
function normalizeOrigin(input) {
  try { return new URL(String(input).trim()).origin; } catch (e) { return ''; }
}

async function load() {
  const s = await chrome.storage.sync.get({ appUrl: '' });
  $('appUrl').value = s.appUrl;
  refreshQueue();
}

async function saveSettings() {
  const raw = $('appUrl').value.trim();
  if (!raw) {
    await chrome.storage.sync.set({ appUrl: '' });
    setStatus('Cleared — no Command Center configured.', 'warn');
    return false;
  }
  const origin = normalizeOrigin(raw.includes('://') ? raw : 'https://' + raw);
  if (!origin) {
    setStatus('That doesn’t look like a URL — expected something like https://app.example.com', 'err');
    return false;
  }
  // Ask for the host permission BEFORE any other await: permissions.request must
  // run while the click still counts as a user gesture.
  let granted = false;
  try {
    granted = await chrome.permissions.request({ origins: [origin + '/*'] });
  } catch (e) {
    granted = false;
  }
  await chrome.storage.sync.set({ appUrl: origin });
  $('appUrl').value = origin;
  if (granted) setStatus('Saved ✓ — the extension may now talk to ' + origin, 'ok');
  else setStatus('Saved, but the site permission was declined — saving captures will fail until you re-save and allow it.', 'warn');
  return granted;
}

async function testConnection() {
  const { appUrl } = await chrome.storage.sync.get({ appUrl: '' });
  if (!appUrl) { setStatus('Paste the Command Center URL and save first.', 'err'); return; }
  $('testBtn').disabled = true;
  setStatus('Testing…');
  const resp = await chrome.runtime.sendMessage({ type: 'testConnection' });
  $('testBtn').disabled = false;
  if (resp && resp.ok) {
    setStatus('Connected ✓ — signed in, captures API reachable. Rows will appear on /internal/captures.', 'ok');
  } else if (resp && resp.error === 'not-signed-in') {
    setStatus('The app is reachable, but you’re not signed in — open the Command Center, sign in with your founder login, then test again.', 'warn');
  } else {
    setStatus('Test failed: ' + ((resp && resp.error) || 'unknown error'), 'err');
  }
}

async function openApp() {
  const { appUrl } = await chrome.storage.sync.get({ appUrl: '' });
  if (!appUrl) { setStatus('Paste the Command Center URL and save first.', 'err'); return; }
  chrome.tabs.create({ url: appUrl + '/internal/' });
}

async function refreshQueue() {
  const { queue = [] } = await chrome.storage.local.get('queue');
  $('queueMsg').textContent = queue.length
    ? queue.length + ' row(s) captured offline or signed out, waiting to upload.'
    : 'Empty — every captured row has been uploaded.';
}

async function retryNow() {
  $('retryBtn').disabled = true;
  const resp = await chrome.runtime.sendMessage({ type: 'retryQueue' });
  $('retryBtn').disabled = false;
  if (resp && resp.ok) setStatus(resp.flushed ? 'Uploaded ' + resp.flushed + ' row(s) ✓' : 'Queue is empty.', 'ok');
  else if (resp && resp.error === 'not-signed-in') setStatus('Still signed out — open the Command Center, sign in, then retry.', 'warn');
  else setStatus('Retry failed: ' + ((resp && resp.error) || 'unknown error'), 'err');
  refreshQueue();
}

async function clearQueue() {
  if (!confirm('Delete all locally queued rows? They have NOT been uploaded to the Command Center.')) return;
  await chrome.runtime.sendMessage({ type: 'clearQueue' });
  refreshQueue();
  setStatus('Queue cleared.', 'ok');
}

document.addEventListener('DOMContentLoaded', () => {
  $('saveBtn').addEventListener('click', saveSettings);
  $('testBtn').addEventListener('click', testConnection);
  $('openAppBtn').addEventListener('click', openApp);
  $('retryBtn').addEventListener('click', retryNow);
  $('clearBtn').addEventListener('click', clearQueue);
  load();
});
