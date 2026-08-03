// Service worker: owns the POST to the Command Center's /api/captures so an
// in-flight save survives the popup closing, and keeps the offline queue + badge.
//
// Auth: requests are sent with credentials:'include', so the founder's own
// sc_founder session cookie signs them — the same login as /internal, giving
// per-founder attribution and the activity log for free. That requires the
// founder to be signed in to the Command Center in this browser profile, and the
// extension to hold (optional) host permission for the app's origin — both are
// arranged by the options page.

// Must not exceed MAX_BATCH in funnel/functions/api/captures.js — a larger POST is
// rejected wholesale (422), which for the queue means it can never drain.
const MAX_BATCH = 50;

async function getSettings() {
  return chrome.storage.sync.get({ appUrl: '' });
}

function capturesEndpoint(appUrl) {
  return appUrl.replace(/\/+$/, '') + '/api/captures';
}

async function getQueue() {
  const { queue = [] } = await chrome.storage.local.get('queue');
  return queue;
}

async function setQueue(queue) {
  await chrome.storage.local.set({ queue });
  await updateBadge(queue.length);
}

async function updateBadge(n) {
  try {
    await chrome.action.setBadgeText({ text: n ? String(n) : '' });
    if (n) await chrome.action.setBadgeBackgroundColor({ color: '#b45309' });
  } catch (e) { /* badge is cosmetic */ }
}

async function callApp(method, query, body) {
  const { appUrl } = await getSettings();
  if (!appUrl) return { ok: false, error: 'no-app' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(capturesEndpoint(appUrl) + (query || ''), {
      method,
      credentials: 'include',
      signal: ctrl.signal,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    if (res.status === 401) return { ok: false, error: 'not-signed-in' };
    const text = await res.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch (e) {
      return { ok: false, error: 'Unexpected response from ' + new URL(capturesEndpoint(appUrl)).host + ' — is the URL your Command Center deployment?' };
    }
    if (!res.ok) return { ok: false, error: (parsed && parsed.error) || 'HTTP ' + res.status, network: res.status >= 500 };
    if (parsed && parsed.ok) return parsed;
    return { ok: false, error: (parsed && parsed.error) || 'The app reported failure' };
  } catch (e) {
    const msg = e && e.name === 'AbortError' ? 'Timed out after 20s' : String((e && e.message) || e);
    return { ok: false, error: msg, network: true };
  } finally {
    clearTimeout(timer);
  }
}

async function handleSave(row) {
  const r = await callApp('POST', '', { rows: [row] });
  if (r.ok) return { ok: true, added: r.added };
  if (r.error === 'no-app') return r;
  // Auth lapses and network failures both queue: the capture is preserved, the
  // founder signs in (or gets signal back) and hits "Retry queued".
  const queue = await getQueue();
  queue.push(row);
  await setQueue(queue);
  return { ok: false, queued: true, queueSize: queue.length, error: r.error };
}

async function handleRetry() {
  let flushed = 0;
  for (;;) {
    const queue = await getQueue();
    if (!queue.length) return { ok: true, flushed, queueSize: 0 };
    const slice = queue.slice(0, MAX_BATCH);
    const r = await callApp('POST', '', { rows: slice });
    if (!r.ok) return { ok: false, error: r.error, queueSize: queue.length, flushed };
    // Re-read instead of reusing `queue`: a save landing mid-flush appends to the
    // tail, and the rows just uploaded are always at the head.
    await setQueue((await getQueue()).slice(slice.length));
    flushed += slice.length;
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const run = async () => {
    if (!msg || !msg.type) return { ok: false, error: 'empty message' };
    if (msg.type === 'save') return handleSave(msg.row);
    if (msg.type === 'retryQueue') return handleRetry();
    if (msg.type === 'testConnection') return callApp('GET', '?limit=1');
    if (msg.type === 'clearQueue') { await setQueue([]); return { ok: true }; }
    return { ok: false, error: 'unknown message: ' + msg.type };
  };
  run().then(sendResponse, (e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
  return true; // keep the message channel open for the async response
});

chrome.runtime.onStartup.addListener(async () => {
  await updateBadge((await getQueue()).length);
  handleRetry().catch(() => {});
});

chrome.runtime.onInstalled.addListener(async () => {
  await updateBadge((await getQueue()).length);
});
