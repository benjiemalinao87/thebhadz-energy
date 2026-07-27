// Service worker: owns the POST to the Apps Script web app so an in-flight save
// survives the popup closing, and keeps the offline queue + toolbar badge.

async function getSettings() {
  return chrome.storage.sync.get({ webhookUrl: '', secret: '' });
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

async function postRows(rows, extra) {
  const { webhookUrl, secret } = await getSettings();
  if (!webhookUrl) return { ok: false, error: 'no-webhook' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    // text/plain avoids a CORS preflight, which Apps Script web apps can't answer.
    const res = await fetch(webhookUrl, {
      method: 'POST',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ secret, rows }, extra || {}))
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, error: 'HTTP ' + res.status, network: res.status >= 500 };
    let parsed;
    try { parsed = JSON.parse(text); } catch (e) {
      return { ok: false, error: 'Unexpected response (a Google login page?) — redeploy the web app with access set to “Anyone”.' };
    }
    if (parsed && parsed.ok) return parsed;
    return { ok: false, error: (parsed && parsed.error) || 'Apps Script reported failure' };
  } catch (e) {
    const msg = e && e.name === 'AbortError' ? 'Timed out after 20s' : String((e && e.message) || e);
    return { ok: false, error: msg, network: true };
  } finally {
    clearTimeout(timer);
  }
}

async function handleSave(row) {
  const r = await postRows([row]);
  if (r.ok) return { ok: true, added: r.added };
  if (r.error === 'no-webhook') return r;
  const queue = await getQueue();
  queue.push(row);
  await setQueue(queue);
  return { ok: false, queued: true, queueSize: queue.length, error: r.error };
}

async function handleRetry() {
  const queue = await getQueue();
  if (!queue.length) return { ok: true, flushed: 0, queueSize: 0 };
  const r = await postRows(queue);
  if (r.ok) {
    await setQueue([]);
    return { ok: true, flushed: queue.length, queueSize: 0 };
  }
  return { ok: false, error: r.error, queueSize: queue.length };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const run = async () => {
    if (!msg || !msg.type) return { ok: false, error: 'empty message' };
    if (msg.type === 'save') return handleSave(msg.row);
    if (msg.type === 'retryQueue') return handleRetry();
    if (msg.type === 'testConnection') return postRows([], { test: true });
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
