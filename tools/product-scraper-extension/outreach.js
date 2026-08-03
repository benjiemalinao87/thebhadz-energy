// Popup-side controller for the Outreach tab: load the profile, dry-run the page
// to learn the brand and what would be filled, compose a draft, then fill on click.
//
// The engine itself lives in fill.js and runs inside the page — this file only
// decides what to send it and how to report back.

const O = (id) => document.getElementById(id);

let oProfile = { ...MACC_PROFILE_DEFAULTS };
let oPlan = null;      // last dry-run report
let oTabId = null;

function oStatus(msg, kind) {
  const el = O('oStatus');
  el.textContent = msg || '';
  el.className = 'status' + (kind ? ' ' + kind : '');
}

async function oActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/**
 * Runs the engine in every frame of the page — brand contact forms are very often
 * an embedded iframe — and merges the per-frame reports into one.
 */
async function oRun(fn, payload) {
  const results = await chrome.scripting.executeScript({
    target: { tabId: oTabId, allFrames: true },
    func: fn,
    args: [payload],
  });
  const merged = { ok: true, brand: '', filled: [], skipped: [], notes: [], restored: 0 };
  for (const r of results || []) {
    const v = r && r.result;
    if (!v) continue;
    if (!merged.brand && v.brand) merged.brand = v.brand;
    if (v.filled) merged.filled.push(...v.filled);
    if (v.skipped) merged.skipped.push(...v.skipped);
    if (v.notes) merged.notes.push(...v.notes);
    if (v.restored) merged.restored += v.restored;
  }
  return merged;
}

function oCompose() {
  const tpl = maccTemplateById(O('oTemplate').value);
  const built = tpl.build(oProfile, { brand: O('oBrand').value.trim() });
  O('oMessage').value = built.long;
  O('oMessage').dataset.short = built.short;
  O('oMessage').dataset.subject = built.subject;
  O('oMessage').dataset.dirty = '';
  O('oHint').textContent = tpl.hint;
}

function oMissingProfile() {
  const need = ['firstName', 'lastName', 'email', 'phone'];
  return need.filter((k) => !String(oProfile[k] || '').trim());
}

function oRenderReport(rep, dry) {
  const box = O('oReport');
  if (!rep.filled.length && !rep.skipped.length) { box.hidden = true; return; }
  const rows = [];
  for (const f of rep.filled) {
    rows.push('<li><b>' + oEsc(f.label) + '</b> ' + (dry ? '←' : '✓') + ' ' + oEsc(f.value) + '</li>');
  }
  const notable = rep.skipped.filter((s) => s.reason !== 'field not recognised' && s.reason !== 'dropdown not recognised');
  for (const s of notable) {
    rows.push('<li class="muted"><b>' + oEsc(s.label) + '</b> — ' + oEsc(s.reason) + '</li>');
  }
  const unknown = rep.skipped.length - notable.length;
  if (unknown) rows.push('<li class="muted">' + unknown + ' other field(s) not recognised — fill those by hand.</li>');
  for (const n of rep.notes) rows.push('<li class="muted">' + oEsc(n) + '</li>');
  box.innerHTML = '<ul>' + rows.join('') + '</ul>';
  box.hidden = false;
}

function oEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

async function oScan() {
  const tab = await oActiveTab();
  oTabId = tab && tab.id;
  if (!tab || !/^https?:/i.test(tab.url || '')) {
    O('oSrcline').textContent = 'Extensions can’t touch this page — open the brand’s contact form first.';
    O('oFill').disabled = true;
    return;
  }
  const tpl = maccTemplateById(O('oTemplate').value);
  try {
    oPlan = await oRun(maccFillPage, {
      profile: oProfile,
      message: '(your draft)',
      dryRun: true,
      role: tpl.role,
      inquiry: tpl.inquiry,
    });
  } catch (e) {
    O('oSrcline').textContent = 'Couldn’t read this page — the site may block extensions on it.';
    O('oFill').disabled = true;
    return;
  }
  if (!O('oBrand').value) O('oBrand').value = oPlan.brand || '';
  const n = oPlan.filled.length;
  O('oSrcline').textContent = n
    ? n + ' field' + (n === 1 ? '' : 's') + ' on this page can be filled from your profile.'
    : 'No recognisable form fields here — check you’re on the contact page.';
  oCompose();
}

async function oFill() {
  const missing = oMissingProfile();
  if (missing.length) {
    oStatus('Add your ' + missing.join(', ') + ' in settings first — those are what the form wants.', 'err');
    return;
  }
  const tpl = maccTemplateById(O('oTemplate').value);
  O('oFill').disabled = true;
  oStatus('Filling…');
  try {
    const rep = await oRun(maccFillPage, {
      profile: oProfile,
      message: O('oMessage').value,
      messageShort: O('oMessage').dataset.short || '',
      subject: O('oMessage').dataset.subject || '',
      role: tpl.role,
      inquiry: tpl.inquiry,
      overwrite: O('oOverwrite').checked,
      dryRun: false,
    });
    oRenderReport(rep, false);
    oStatus(rep.filled.length
      ? 'Filled ' + rep.filled.length + ' field(s) — read it over, tick any consent boxes, then send it yourself.'
      : 'Nothing matched. Fill the form by hand, or use Copy for the message.', rep.filled.length ? 'ok' : 'warn');
  } catch (e) {
    oStatus('Fill failed: ' + (e && e.message ? e.message : e), 'err');
  }
  O('oFill').disabled = false;
}

async function oUndo() {
  try {
    const rep = await oRun(maccUndoFill, {});
    oStatus(rep.restored ? 'Put ' + rep.restored + ' field(s) back.' : 'Nothing to undo on this page.', 'ok');
    O('oReport').hidden = true;
  } catch (e) {
    oStatus('Undo failed: ' + (e && e.message ? e.message : e), 'err');
  }
}

async function oCopyDraft() {
  try {
    await navigator.clipboard.writeText(O('oMessage').value);
    oStatus('Draft copied.', 'ok');
  } catch (e) {
    oStatus('Clipboard blocked: ' + e.message, 'err');
  }
}

window.maccOutreachInit = async function maccOutreachInit() {
  const sel = O('oTemplate');
  sel.innerHTML = MACC_TEMPLATES.map((t) => '<option value="' + t.id + '">' + oEsc(t.label) + '</option>').join('');

  const stored = await chrome.storage.sync.get({ outreachProfile: null, lastTemplate: '' });
  oProfile = { ...MACC_PROFILE_DEFAULTS, ...(stored.outreachProfile || {}) };
  if (stored.lastTemplate) sel.value = stored.lastTemplate;

  const missing = oMissingProfile();
  if (missing.length) {
    O('oProfileWarn').hidden = false;
    O('oProfileWarn').textContent = 'Your profile is missing: ' + missing.join(', ') + '. Open settings (⚙) to add them — the drafts read as unfinished without them.';
  }

  sel.addEventListener('change', () => {
    chrome.storage.sync.set({ lastTemplate: sel.value });
    oCompose();   // picking a different message is an explicit request to redraft
  });
  // Changing the brand rewrites the greeting — but not over edits you typed.
  O('oMessage').addEventListener('input', () => { O('oMessage').dataset.dirty = '1'; });
  O('oBrand').addEventListener('change', () => {
    if (O('oMessage').dataset.dirty === '1') {
      oStatus('Brand updated. Your edited draft was left alone — switch the message type to redraft it.', 'warn');
      return;
    }
    oCompose();
  });
  O('oFill').addEventListener('click', oFill);
  O('oUndo').addEventListener('click', oUndo);
  O('oCopy').addEventListener('click', oCopyDraft);

  await oScan();
};
