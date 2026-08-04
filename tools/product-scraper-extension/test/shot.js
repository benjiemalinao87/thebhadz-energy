// Renders the REAL popup — actual popup.html markup, actual assets/ui.css — into the
// iframe on shot.html, with the Outreach tab open and realistic content, so the Chrome
// Web Store screenshot shows the product rather than a drawing of it.
//
// The popup's own scripts are stripped: they call chrome.tabs / chrome.scripting, which
// do not exist outside an extension. Everything they would have populated is filled in
// here instead. Markup and styling stay genuine, so this cannot drift away from the real
// popup without the screenshot visibly changing.
//
// Must be served over HTTP (fetch of popup.html is blocked on file://). See test/shot.sh.

const PROFILE = {
  firstName: 'Benjie', lastName: 'Malinao', jobTitle: 'Co-founder',
  email: 'official@macc-inc.com', phone: '+63 955 723 5093',
  company: 'MACC Systems & Engineering Inc.', website: 'https://macc-inc.com',
  address: 'Talustusan, Naval, Biliran', city: 'Naval', state: 'Biliran',
  country: 'Philippines', zip: '',
};

const draft = maccTemplateById('biliran-comarketing').build(PROFILE, { brand: 'Sungrow' });

document.getElementById('mockMsg').textContent = draft.long.slice(0, 250) + '…';

(async () => {
  const html = await (await fetch('../popup.html')).text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const s of doc.querySelectorAll('script')) s.remove();
  // srcdoc resolves relative URLs against THIS page (/test/), so the popup's
  // "icons/icon32.png" would 404 and render as a broken image in the shot.
  for (const img of doc.querySelectorAll('img[src]')) {
    img.setAttribute('src', '/' + img.getAttribute('src').replace(/^\.?\//, ''));
  }

  const frame = document.getElementById('pop');
  frame.srcdoc = '<!doctype html><meta charset="utf-8">' +
    '<link rel="stylesheet" href="/assets/ui.css">' +
    '<body class="popup">' + doc.body.innerHTML + '</body>';

  frame.addEventListener('load', () => {
    const d = frame.contentDocument;
    const $ = (id) => d.getElementById(id);

    // Outreach tab active, Capture hidden — the state the screenshot is showing.
    $('paneCapture').hidden = true;
    $('paneOutreach').hidden = false;
    $('tabCapture').classList.remove('is-on');
    $('tabOutreach').classList.add('is-on');

    $('oTemplate').innerHTML = MACC_TEMPLATES
      .map((t) => '<option>' + t.label + '</option>').join('');
    $('oHint').textContent = MACC_TEMPLATES[0].hint;
    $('oBrand').value = 'Sungrow';
    $('oMessage').value = draft.long;
    $('oSrcline').textContent = '11 fields on this page can be filled from your profile.';

    $('oStatus').textContent = 'Filled 11 fields — read it over, tick any consent boxes, then send it yourself.';
    $('oStatus').className = 'status ok';

    const report = $('oReport');
    report.hidden = false;
    report.innerHTML = '<ul>' + [
      ['first name', 'Benjie'], ['last name', 'Malinao'],
      ['email', 'official@macc-inc.com'], ['phone', '+63 955 723 5093'],
      ['inquiry type', 'Become a partner'],
    ].map(([k, v]) => '<li><b>' + k + '</b> ✓ ' + v + '</li>').join('') +
      '<li class="muted"><b>verification code</b> — not ours to answer</li></ul>';

    // Shrink the draft box until the whole popup fits the canvas — a popup clipped
    // by the frame edge reads as a rendering bug rather than a product.
    $('oMessage').rows = 6;
    const fit = Math.min(760, d.body.scrollHeight + 2);
    frame.style.height = fit + 'px';

    document.documentElement.dataset.ready = '1';
  });
})();
