const $ = (id) => document.getElementById(id);

function setStatus(msg, kind) {
  const el = $('status');
  el.textContent = msg || '';
  el.className = 'status' + (kind ? ' ' + kind : '');
}

async function load() {
  const s = await chrome.storage.sync.get({ webhookUrl: '', secret: '' });
  $('webhookUrl').value = s.webhookUrl;
  $('secret').value = s.secret;
  refreshQueue();
}

async function saveSettings() {
  const webhookUrl = $('webhookUrl').value.trim();
  const secret = $('secret').value.trim();
  await chrome.storage.sync.set({ webhookUrl, secret });
  if (webhookUrl && !/^https:\/\/script\.google\.com\/.+\/exec$/.test(webhookUrl)) {
    setStatus('Saved — but that doesn’t look like an Apps Script /exec URL, double-check it.', 'warn');
  } else {
    setStatus('Settings saved ✓', 'ok');
  }
}

async function sendTest() {
  await saveSettings();
  if (!$('webhookUrl').value.trim()) {
    setStatus('Paste the Web App URL first.', 'err');
    return;
  }
  $('testBtn').disabled = true;
  setStatus('Sending test row…');
  const resp = await chrome.runtime.sendMessage({ type: 'testConnection' });
  $('testBtn').disabled = false;
  if (resp && resp.ok) setStatus('Test row added ✓ — check the “Products” tab of your sheet.', 'ok');
  else setStatus('Test failed: ' + ((resp && resp.error) || 'unknown error'), 'err');
}

async function refreshQueue() {
  const { queue = [] } = await chrome.storage.local.get('queue');
  $('queueMsg').textContent = queue.length
    ? queue.length + ' row(s) captured offline, waiting to upload.'
    : 'Empty — every captured row has been uploaded.';
}

async function retryNow() {
  $('retryBtn').disabled = true;
  const resp = await chrome.runtime.sendMessage({ type: 'retryQueue' });
  $('retryBtn').disabled = false;
  if (resp && resp.ok) setStatus(resp.flushed ? 'Uploaded ' + resp.flushed + ' row(s) ✓' : 'Queue is empty.', 'ok');
  else setStatus('Retry failed: ' + ((resp && resp.error) || 'unknown error'), 'err');
  refreshQueue();
}

async function clearQueue() {
  if (!confirm('Delete all locally queued rows? They have NOT been uploaded to the sheet.')) return;
  await chrome.runtime.sendMessage({ type: 'clearQueue' });
  refreshQueue();
  setStatus('Queue cleared.', 'ok');
}

document.addEventListener('DOMContentLoaded', () => {
  $('saveBtn').addEventListener('click', saveSettings);
  $('testBtn').addEventListener('click', sendTest);
  $('retryBtn').addEventListener('click', retryNow);
  $('clearBtn').addEventListener('click', clearQueue);
  load();
});
