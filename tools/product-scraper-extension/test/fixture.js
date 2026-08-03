// Drives fill.js against form-fixture.html with a stand-in profile, and asserts the
// handful of behaviours that would actually hurt if they broke. Keeping this as a
// plain page means no test runner and no dependencies, same as the rest of the repo.

const PROFILE = {
  firstName: 'Test', lastName: 'Founder', jobTitle: 'Co-founder',
  email: 'test@macc-inc.com', phone: '+63 955 723 5093',
  company: 'MACC Systems & Engineering Inc.', website: 'https://macc-inc.com',
  address: 'Talustusan, Naval, Biliran', city: 'Naval', state: 'Biliran',
  country: 'Philippines', zip: '',
};

const EXPECT = [
  ['fills first name', (r) => r.filled.some((f) => f.key === 'firstName' && f.value === 'Test')],
  ['fills last name', (r) => r.filled.some((f) => f.key === 'lastName')],
  ['fills email', (r) => r.filled.some((f) => f.key === 'email')],
  ['fills phone', (r) => r.filled.some((f) => f.key === 'phone')],
  ['fills city with the city, not the country', (r) => r.filled.some((f) => f.key === 'city' && f.value === 'Naval')],
  ['picks Philippines for country', (r) => r.filled.some((f) => f.key === 'country' && /philippines/i.test(f.value))],
  ['picks a role option', (r) => r.filled.some((f) => f.key === 'role')],
  ['picks Residential for business focus', (r) => r.filled.some((f) => f.key === 'focus' && /residential/i.test(f.value))],
  ['picks a partner-ish inquiry type', (r) => r.filled.some((f) => f.key === 'inquiry' && /partner/i.test(f.value))],
  ['answers "how did you learn"', (r) => r.filled.some((f) => f.key === 'source')],
  ['fills the message textarea', (r) => r.filled.filter((f) => f.key === 'message').length >= 1],
  ['fills the bare "Name *" field', (r) => r.filled.some((f) => f.key === 'fullName')],
  ['fills Address', (r) => r.filled.some((f) => f.key === 'address')],
  ['SKIPS the captcha "Code *"', (r) => !r.filled.some((f) => /code/i.test(f.label))],
  ['SKIPS the password field', (r) => !r.filled.some((f) => /password/i.test(f.label))],
  ['SKIPS the search box', (r) => !r.filled.some((f) => /search/i.test(f.label))],
  ['SKIPS the checkbox', (r) => !r.filled.some((f) => /agree|privacy/i.test(f.label))],
  ['leaves the pre-filled Company alone', () => document.querySelector('input[placeholder="Company"]').value === 'Should not be overwritten'],
  ['fills Email in BOTH forms (per-form scoping)', (r) => r.filled.filter((f) => f.key === 'email').length === 2],
  ['fills Telephone in the second form', (r) => r.filled.some((f) => f.key === 'phone' && /telephone/i.test(f.label))],
  ['uses the short draft whole in the 700-char box', (r) => r.notes.some((n) => /used the short version/i.test(n))],
  ['clips the 300-char box and says so', (r) => r.notes.some((n) => /even the short draft was cut/i.test(n))],
  ['clips at a word boundary, not mid-word', () => {
    const el = document.querySelector('textarea[maxlength="300"]');
    if (!el.value || el.value.length > 300) return false;
    // The clipped text must be a whole-word prefix of the short draft: the very next
    // character in the original has to be whitespace, never the rest of a word.
    const flat = (s) => s.replace(/\s+/g, ' ').trim();
    const full = flat(window.__shortDraft || '');
    const got = flat(el.value);
    return full.startsWith(got) && /^\s|^$/.test(full.slice(got.length));
  }],
];

function render(report) {
  const lines = [];
  let pass = 0;
  for (const [name, check] of EXPECT) {
    let ok = false;
    try { ok = !!check(report); } catch (e) { ok = false; }
    if (ok) pass++;
    lines.push((ok ? 'PASS  ' : 'FAIL  ') + name);
  }
  lines.push('');
  lines.push(pass + '/' + EXPECT.length + ' checks passed');
  lines.push('');
  lines.push('--- filled ---');
  for (const f of report.filled) lines.push('  ' + f.key.padEnd(12) + ' [' + f.label + '] = ' + f.value);
  lines.push('--- skipped ---');
  for (const s of report.skipped) lines.push('  [' + s.label + '] ' + s.reason);
  if (report.notes.length) {
    lines.push('--- notes ---');
    for (const n of report.notes) lines.push('  ' + n);
  }
  lines.push('');
  lines.push('brand detected: ' + (report.brand || '(none)'));
  document.getElementById('out').textContent = lines.join('\n');
  window.__fixtureResult = { pass, total: EXPECT.length, report };
}

function run() {
  const tpl = maccTemplateById('biliran-comarketing');
  const built = tpl.build(PROFILE, { brand: 'Sungrow' });
  window.__shortDraft = built.short;
  render(maccFillPage({
    profile: PROFILE,
    message: built.long,
    messageShort: built.short,
    subject: built.subject,
    role: tpl.role,
    inquiry: tpl.inquiry,
    overwrite: false,
    dryRun: false,
  }));
}

document.getElementById('run').addEventListener('click', run);
// ?auto=1 runs it on load, so headless Chrome (`--dump-dom`) can read the report
// out of #out without a driver. See test/README.md.
if (/[?&]auto=1/.test(location.search)) run();
document.getElementById('undo').addEventListener('click', () => {
  const r = maccUndoFill();
  document.getElementById('out').textContent = 'Restored ' + r.restored + ' field(s).';
});
