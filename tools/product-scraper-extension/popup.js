const $ = (id) => document.getElementById(id);
// capturedAt + the FIELDS order in funnel/functions/api/captures.js. Only the
// "Copy row" TSV uses it (Save posts a JSON object), but keeping the two in step
// means a pasted row lines up with an exported one.
const COLS = ['capturedAt', 'brand', 'product', 'description', 'cost', 'currency', 'location', 'supplier', 'moq', 'source', 'url', 'image', 'other', 'notes'];

function setStatus(msg, kind) {
  const el = $('status');
  el.textContent = msg || '';
  el.className = 'status' + (kind ? ' ' + kind : '');
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function fill(d) {
  const f = d.fields || {};
  const set = (id, v) => { const el = $(id); if (v && !el.value) el.value = v; };
  set('product', f.product);
  set('brand', f.brand);
  set('cost', f.cost);
  set('currency', f.currency);
  set('location', f.location);
  set('supplier', f.supplier);
  set('moq', f.moq);
  set('description', f.description);
  set('other', (d.other || []).join('\n'));
  set('image', f.image);
  if (d.url) $('url').value = d.url;

  const bits = [d.host || d.site];
  if (d.signals && d.signals.jsonLd) bits.push('structured product data');
  else if (d.signals && d.signals.og) bits.push('page meta');
  if (d.hasSelection) bits.push('your text selection');
  $('srcline').textContent = 'Read from: ' + bits.filter(Boolean).join(' · ');

  const warn = (d.warnings || []).join(' ');
  $('warn').hidden = !warn;
  $('warn').textContent = warn;
}

async function extract() {
  const tab = await activeTab();
  if (!tab) return;
  if (!$('url').value) $('url').value = tab.url || '';
  if (!/^https?:/i.test(tab.url || '')) {
    $('srcline').textContent = 'This page can’t be read by extensions — fill the fields in manually.';
    return;
  }
  try {
    const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    const data = results && results[0] && results[0].result;
    if (!data || !data.ok) throw new Error('no result');
    fill(data);
  } catch (e) {
    $('srcline').textContent = 'Couldn’t auto-read this page — fill in what matters and save.';
  }
}

function collectRow() {
  const v = (id) => $(id).value.trim();
  let source = '';
  try { source = new URL(v('url')).hostname; } catch (e) { /* leave blank */ }
  return {
    capturedAt: new Date().toISOString(),
    brand: v('brand'),
    product: v('product'),
    description: v('description'),
    cost: v('cost'),
    currency: v('currency'),
    location: v('location'),
    supplier: v('supplier'),
    moq: v('moq'),
    source,
    url: v('url'),
    image: v('image'),
    other: v('other'),
    notes: v('notes')
  };
}

function showAppLink(text, url) {
  const a = $('appLink');
  a.textContent = text;
  a.href = url;
  a.hidden = false;
}

async function save() {
  const row = collectRow();
  if (!row.product && !row.description) {
    setStatus('Add at least a product name or description first.', 'err');
    return;
  }
  const { appUrl } = await chrome.storage.sync.get({ appUrl: '' });
  if (!appUrl) {
    setStatus('Not connected yet — open settings and paste your Command Center URL.', 'err');
    $('openOptions2').hidden = false;
    return;
  }
  $('save').disabled = true;
  $('appLink').hidden = true;
  setStatus('Saving…');
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'save', row });
    if (resp && resp.ok) {
      setStatus('Saved to the Command Center ✓', 'ok');
      showAppLink('View captures in the Command Center →', appUrl + '/internal/captures');
    } else if (resp && resp.queued && resp.error === 'not-signed-in') {
      setStatus('You’re signed out of the Command Center — row queued (' + resp.queueSize + ' waiting). Sign in, then hit “Retry queued”.', 'warn');
      showAppLink('Open the Command Center to sign in →', appUrl + '/internal/');
    } else if (resp && resp.queued) {
      setStatus('App unreachable — row queued on this device (' + resp.queueSize + ' waiting). Use “Retry queued” when back online.', 'warn');
    } else {
      setStatus('Save failed: ' + ((resp && resp.error) || 'unknown error'), 'err');
    }
  } catch (e) {
    setStatus('Save failed: ' + (e && e.message ? e.message : e), 'err');
  }
  $('save').disabled = false;
  refreshQueue();
}

async function copyRow() {
  const row = collectRow();
  const tsv = COLS.map((k) => String(row[k] || '').replace(/[\t\r\n]+/g, ' ')).join('\t');
  try {
    await navigator.clipboard.writeText(tsv);
    setStatus('Copied as a tab-separated row — paste straight into a spreadsheet.', 'ok');
  } catch (e) {
    setStatus('Clipboard blocked: ' + e.message, 'err');
  }
}

async function refreshQueue() {
  const { queue = [] } = await chrome.storage.local.get('queue');
  $('queueRow').hidden = queue.length === 0;
  $('queueMsg').textContent = queue.length + ' captured row' + (queue.length === 1 ? '' : 's') + ' waiting to upload';
}

async function retryQueue() {
  $('retry').disabled = true;
  const resp = await chrome.runtime.sendMessage({ type: 'retryQueue' });
  $('retry').disabled = false;
  // A long queue uploads in batches, so a failure can follow partial success.
  const stalled = (msg) => (resp && resp.flushed
    ? 'Uploaded ' + resp.flushed + ' row(s), then stopped — ' + msg.charAt(0).toLowerCase() + msg.slice(1)
    : msg);
  if (resp && resp.ok) setStatus(resp.flushed ? 'Uploaded ' + resp.flushed + ' queued row(s) ✓' : 'Queue is empty.', 'ok');
  else if (resp && resp.error === 'not-signed-in') {
    const { appUrl } = await chrome.storage.sync.get({ appUrl: '' });
    setStatus(stalled('Still signed out of the Command Center — sign in, then retry.'), 'warn');
    if (appUrl) showAppLink('Open the Command Center to sign in →', appUrl + '/internal/');
  } else setStatus(stalled('Still unreachable: ' + ((resp && resp.error) || 'unknown error')), 'warn');
  refreshQueue();
}

function clearAutoFields() {
  for (const id of ['product', 'brand', 'cost', 'currency', 'location', 'supplier', 'moq', 'description', 'other', 'image', 'url']) $(id).value = '';
}

// Each tab does its page work once, on first view: opening the popup to write an
// outreach draft shouldn't run the product extractor over a contact page, and vice
// versa. The last tab used is remembered, so the popup opens where you left it.
let capturePrimed = false;
let outreachPrimed = false;

function activateTab(name) {
  const outreach = name === 'outreach';
  $('paneCapture').hidden = outreach;
  $('paneOutreach').hidden = !outreach;
  $('tabCapture').classList.toggle('is-on', !outreach);
  $('tabOutreach').classList.toggle('is-on', outreach);
  chrome.storage.local.set({ lastTab: outreach ? 'outreach' : 'capture' });
  if (!outreach && !capturePrimed) { capturePrimed = true; extract(); }
  if (outreach && !outreachPrimed && window.maccOutreachInit) { outreachPrimed = true; window.maccOutreachInit(); }
}

document.addEventListener('DOMContentLoaded', async () => {
  $('form').addEventListener('submit', (e) => { e.preventDefault(); save(); });
  $('save').addEventListener('click', save);
  $('copy').addEventListener('click', copyRow);
  $('reextract').addEventListener('click', () => { clearAutoFields(); setStatus(''); extract(); });
  $('retry').addEventListener('click', retryQueue);
  $('openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());
  $('openOptions2').addEventListener('click', () => chrome.runtime.openOptionsPage());
  $('tabCapture').addEventListener('click', () => activateTab('capture'));
  $('tabOutreach').addEventListener('click', () => activateTab('outreach'));
  refreshQueue();
  const { lastTab = 'capture' } = await chrome.storage.local.get('lastTab');
  activateTab(lastTab);
});
