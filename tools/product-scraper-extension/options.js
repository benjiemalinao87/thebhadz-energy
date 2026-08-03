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

function profileStatus(msg, kind) {
  const el = $('profileStatus');
  el.textContent = msg || '';
  el.className = 'status' + (kind ? ' ' + kind : '');
}

async function loadProfile() {
  const { outreachProfile } = await chrome.storage.sync.get({ outreachProfile: null });
  const p = { ...MACC_PROFILE_DEFAULTS, ...(outreachProfile || {}) };
  $('profileGrid').innerHTML = MACC_PROFILE_FIELDS
    .map((f) => '<label>' + f.label +
      '<input id="p_' + f.key + '" placeholder="' + f.placeholder.replace(/"/g, '&quot;') + '" spellcheck="false"></label>')
    .join('');
  for (const f of MACC_PROFILE_FIELDS) $('p_' + f.key).value = p[f.key] || '';
}

async function saveProfile() {
  const p = {};
  for (const f of MACC_PROFILE_FIELDS) p[f.key] = $('p_' + f.key).value.trim();
  await chrome.storage.sync.set({ outreachProfile: p });
  const missing = ['firstName', 'lastName', 'email', 'phone'].filter((k) => !p[k]);
  if (missing.length) profileStatus('Saved — still missing ' + missing.join(', ') + ', which most forms require.', 'warn');
  else profileStatus('Profile saved ✓', 'ok');
}

/** Pulls name + email from the founder's Command Center account. */
async function fillFromAccount() {
  profileStatus('Asking the Command Center…');
  const resp = await chrome.runtime.sendMessage({ type: 'whoami' });
  if (!resp || !resp.ok) {
    profileStatus(resp && resp.error === 'not-signed-in'
      ? 'Not signed in to the Command Center in this browser — sign in there, then try again.'
      : 'Couldn’t reach the Command Center: ' + ((resp && resp.error) || 'unknown error'), 'err');
    return;
  }
  const user = resp.user || {};
  const parts = String(user.name || '').trim().split(/\s+/);
  if (parts.length && parts[0] && !$('p_firstName').value) $('p_firstName').value = parts[0];
  if (parts.length > 1 && !$('p_lastName').value) $('p_lastName').value = parts.slice(1).join(' ');
  if (user.email && !$('p_email').value) $('p_email').value = user.email;
  profileStatus('Filled in from your account — check it, add your phone, then Save profile.', 'ok');
}

async function load() {
  const s = await chrome.storage.sync.get({ appUrl: '' });
  $('appUrl').value = s.appUrl;
  $('version').textContent = chrome.runtime.getManifest().version;
  loadProfile();
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
  // Chrome throws (rather than returning false) when the origin matches nothing in
  // the manifest's optional_host_permissions — a different failure from "the founder
  // clicked Deny", and one no amount of re-saving will fix.
  let blocked = false;
  try {
    granted = await chrome.permissions.request({ origins: [origin + '/*'] });
  } catch (e) {
    granted = false;
    blocked = true;
  }
  await chrome.storage.sync.set({ appUrl: origin });
  $('appUrl').value = origin;
  if (granted) setStatus('Saved ✓ — the extension may now talk to ' + origin, 'ok');
  else if (blocked) {
    setStatus('Saved, but this build isn’t allowed to talk to ' + origin +
      ' — add it to "optional_host_permissions" in manifest.json, reload the extension on chrome://extensions, then save again.', 'err');
  } else setStatus('Saved, but the site permission was declined — saving captures will fail until you re-save and allow it.', 'warn');
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
  // A long queue uploads in batches of 50, so a failure can follow partial success.
  const partial = resp && resp.flushed ? 'Uploaded ' + resp.flushed + ' row(s), then stopped. ' : '';
  if (resp && resp.ok) setStatus(resp.flushed ? 'Uploaded ' + resp.flushed + ' row(s) ✓' : 'Queue is empty.', 'ok');
  else if (resp && resp.error === 'not-signed-in') setStatus(partial + 'Still signed out — open the Command Center, sign in, then retry.', 'warn');
  else setStatus(partial + 'Retry failed: ' + ((resp && resp.error) || 'unknown error'), 'err');
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
  $('profileSaveBtn').addEventListener('click', saveProfile);
  $('profileFillBtn').addEventListener('click', fillFromAccount);
  $('testBtn').addEventListener('click', testConnection);
  $('openAppBtn').addEventListener('click', openApp);
  $('retryBtn').addEventListener('click', retryNow);
  $('clearBtn').addEventListener('click', clearQueue);
  load();
});
