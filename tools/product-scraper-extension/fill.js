// Form-fill engine. Loaded into the POPUP but never executed there: the two
// functions below are handed to chrome.scripting.executeScript, which serialises
// them with Function.prototype.toString and runs the source inside the page. They
// therefore may not reference ANY outer scope — no imports, no shared helpers, no
// constants from templates.js. Everything they need arrives in `payload`, and
// everything they return must be JSON-serialisable.
//
// Injection is on click only (activeTab), same as content.js — nothing here runs
// while you browse.
//
// Two hard rules, deliberately not configurable:
//   1. It never submits. It fills; you read what it wrote and click send yourself.
//   2. It never touches passwords, captchas, checkboxes or radios. Consent boxes
//      and "I am not a robot" are yours to tick knowingly.

/**
 * @param payload {profile, message, messageShort, subject, role, inquiry,
 *                 overwrite, dryRun}
 * @returns a report of what was (or would be) written, plus the detected brand.
 */
function maccFillPage(payload) {
  const P = (payload && payload.profile) || {};
  const DRY = !!(payload && payload.dryRun);
  const OVERWRITE = !!(payload && payload.overwrite);
  const ROLE_PREF = (payload && payload.role) || ['installer', 'distributor', 'dealer', 'partner'];
  const INQUIRY_PREF = (payload && payload.inquiry) || ['partner', 'business', 'sales', 'product'];

  const norm = (s) => String(s == null ? '' : s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Brand name for the greeting: og:site_name is usually the clean marketing name
  // ("Sungrow"), the hostname is the reliable fallback ("deyeinverter" -> "Deye").
  const brandFromPage = () => {
    const og = document.querySelector('meta[property="og:site_name"]');
    let raw = og && og.getAttribute('content');
    if (!raw) {
      const app = document.querySelector('meta[name="application-name"]');
      raw = app && app.getAttribute('content');
    }
    if (raw) {
      const c = String(raw).replace(/\s+/g, ' ').trim();
      if (c && c.length <= 40) return c;
    }
    let host = location.hostname.toLowerCase().replace(/^www\./, '');
    host = host.split('.')[0];
    host = host.replace(/(inverter|solar|power|energy|group|global|tech)$/i, '');
    if (!host) return '';
    return host.charAt(0).toUpperCase() + host.slice(1);
  };

  const VALUES = {
    firstName: P.firstName || '',
    lastName: P.lastName || '',
    fullName: [P.firstName, P.lastName].filter(Boolean).join(' '),
    email: P.email || '',
    phone: P.phone || '',
    company: P.company || '',
    jobTitle: P.jobTitle || '',
    website: P.website || '',
    address: P.address || '',
    city: P.city || '',
    state: P.state || '',
    country: P.country || '',
    zip: P.zip || '',
    subject: (payload && payload.subject) || '',
    message: (payload && payload.message) || '',
  };

  // First match wins, so order is the specification: postal before the generic
  // "code" skip, first/last name before the bare "name", city before the
  // catch-all address.
  const RULES = [
    ['zip', /\b(zip|postal code|postcode|post code|postal)\b/],
    ['email', /\b(e ?mail|email address)\b/],
    ['phone', /\b(phone|telephone|mobile|tel|whatsapp|cellphone|contact number)\b/],
    ['firstName', /\b(first name|given name|forename|fname|firstname)\b/],
    ['lastName', /\b(last name|surname|family name|lname|lastname)\b/],
    ['jobTitle', /\b(job title|position|designation|your role|job function)\b/],
    ['company', /\b(company|organisation|organization|business name|firm|employer)\b/],
    ['website', /\b(website|web site|homepage|url|company site)\b/],
    ['country', /\b(country|nation)\b/],
    ['state', /\b(state|province|prefecture|region)\b/],
    ['city', /\b(city|town|municipality)\b/],
    ['address', /\b(address|street|addr)\b/],
    ['subject', /\b(subject|topic|title)\b/],
    ['message', /\b(message|comment|comments|inquiry|enquiry|description|details|detail|requirement|requirements|demand|remarks|question|content|how can we help|tell us)\b/],
    // Last resort for a bare "Name *" field, only once first/last have had their say.
    ['fullName', /^(name|your name|full name|contact name|contact person)$/],
  ];

  const SELECT_RULES = [
    ['country', /\b(country|nation|region)\b/, ['philippines', 'philippine']],
    ['state', /\b(state|province|prefecture)\b/, ['biliran']],
    ['role', /\b(describes you|i am a|i am|you are|user type|customer type|your role|role|identity|type of (user|customer|partner)|capacity)\b/, null],
    ['focus', /\b(business focus|business type|industry|segment|application|market)\b/, ['residential', 'rooftop', 'household', 'solar', 'pv', 'other']],
    ['inquiry', /\b(inquiry|enquiry|topic|purpose|reason|subject|interest|request type|i want to)\b/, null],
    ['source', /\b(how did you (learn|hear|find)|hear about|find us|source|referral)\b/, ['search engine', 'search', 'internet', 'online', 'website', 'web', 'other']],
  ];

  // Never fill: not ours to answer, or actively harmful to guess at.
  const SKIP = /\b(password|passwd|captcha|verification|verify|security code|confirm|coupon|promo|card number|cvv|cvc|search|quantity|qty)\b/;
  const SKIP_STANDALONE = /^(code|search)$/;

  // A caption element must describe THIS field: one that contains a form control is
  // the previous row, and a <legend>/heading describes the whole group. Reading
  // either is how "City" ends up labelled "Country" and how a fieldset legend
  // mentioning a captcha poisons every field under it.
  const captionNear = (start, hops) => {
    let sib = start;
    for (let i = 0; sib && i < hops; i++, sib = sib.previousElementSibling) {
      if (/^(script|style|legend|h1|h2|h3|h4|h5|h6)$/i.test(sib.tagName)) continue;
      if (sib.querySelector && sib.querySelector('input, select, textarea')) continue;
      const t = (sib.textContent || '').replace(/\s+/g, ' ').trim();
      if (t && t.length <= 80) return t;
    }
    return '';
  };

  const labelParts = (el) => {
    const bits = [];
    const push = (v) => {
      const c = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
      if (c && c.length <= 120) bits.push(c);
    };
    push(el.getAttribute('autocomplete'));
    push(el.getAttribute('name'));
    push(el.getAttribute('id'));
    push(el.getAttribute('placeholder'));
    push(el.getAttribute('aria-label'));
    push(el.getAttribute('data-name'));
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      for (const id of labelledBy.split(/\s+/)) {
        const n = document.getElementById(id);
        if (n) push(n.textContent);
      }
    }
    if (el.id) {
      try {
        const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
        if (l) push(l.textContent);
      } catch (e) { /* exotic ids */ }
    }
    const wrapping = el.closest('label');
    if (wrapping) push(wrapping.textContent);
    // Visible caption sitting directly above the control — how most of these forms
    // are built (Sungrow renders "Country / Region" as a plain div above the
    // <select>, and a <select> can't carry a placeholder).
    push(captionNear(el.previousElementSibling, 3));
    // One level out, and only for a control that told us nothing about itself —
    // at that distance the text is as likely to belong to the neighbouring field.
    if (!bits.length && el.parentElement) push(captionNear(el.parentElement.previousElementSibling, 2));
    return bits.map(norm).filter(Boolean);
  };

  const hits = (parts, re) => parts.some((p) => re.test(p));

  const usable = (el) => {
    if (el.disabled || el.readOnly) return false;
    const type = String(el.type || '').toLowerCase();
    if (['hidden', 'submit', 'button', 'reset', 'image', 'file', 'checkbox', 'radio', 'password', 'range', 'color'].includes(type)) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const st = getComputedStyle(el);
    return st.visibility !== 'hidden' && st.display !== 'none' && st.opacity !== '0';
  };

  const isBlank = (el) => !String(el.value == null ? '' : el.value).trim();

  // A <select> sitting on its placeholder ("Select your inquiry type") counts as
  // blank; one the site genuinely pre-selected does not, so we leave real choices
  // alone unless the founder ticked "overwrite".
  const selectIsBlank = (el) => {
    const opt = el.selectedOptions && el.selectedOptions[0];
    if (!opt) return true;
    if (!String(opt.value || '').trim()) return true;
    if (el.selectedIndex <= 0) return true;
    return /^(please )?(select|choose|pick|--|none)\b/.test(norm(opt.textContent));
  };

  const setValue = (el, value) => {
    // React and Vue track the value through the prototype setter; assigning
    // el.value directly leaves their state stale and the field reverts on submit.
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value); else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const mark = (el) => {
    if (!window.__maccFillUndo) window.__maccFillUndo = [];
    return (prevValue) => {
      window.__maccFillUndo.push({
        el,
        prevValue,
        prevOutline: el.style.outline,
        prevOffset: el.style.outlineOffset,
      });
      el.style.outline = '2px solid #f59e0b';
      el.style.outlineOffset = '1px';
    };
  };

  const shortLabel = (parts, el) => {
    const pick = parts.find((p) => p.length > 2 && p.length < 40 && / /.test(p)) || parts[0] || el.name || el.type;
    return String(pick).slice(0, 40);
  };

  // Cut at a word boundary — a partnership pitch severed mid-word reads worse than
  // one that stops cleanly a few words early.
  const clip = (s, n) => {
    if (s.length <= n) return s;
    const t = s.slice(0, n);
    const sp = t.lastIndexOf(' ');
    return (sp > n * 0.6 ? t.slice(0, sp) : t).trim();
  };

  // "Only fill each thing once" has to mean once PER FORM: a page with a contact
  // form and a newsletter box has two Email fields, and both are legitimate.
  const scopeOf = (el) => el.form || el.closest('form, fieldset, section') || document.body;
  const usedByScope = new Map();
  const usedIn = (el) => {
    const scope = scopeOf(el);
    let set = usedByScope.get(scope);
    if (!set) { set = new Set(); usedByScope.set(scope, set); }
    return set;
  };

  const brand = brandFromPage();
  const report = { ok: true, brand, url: location.href, filled: [], skipped: [], notes: [] };

  const controls = Array.from(document.querySelectorAll('input, textarea, select'));
  if (!controls.length) return report;

  for (const el of controls) {
    if (!usable(el)) continue;
    const parts = labelParts(el);
    if (!parts.length) continue;

    if (hits(parts, SKIP) || parts.some((p) => SKIP_STANDALONE.test(p))) {
      report.skipped.push({ label: shortLabel(parts, el), reason: 'not ours to answer' });
      continue;
    }

    const blank = el instanceof HTMLSelectElement ? selectIsBlank(el) : isBlank(el);
    if (!blank && !OVERWRITE) {
      report.skipped.push({ label: shortLabel(parts, el), reason: 'already has a value' });
      continue;
    }

    if (el instanceof HTMLSelectElement) {
      let kind = null;
      let wanted = null;
      for (const [k, re, prefs] of SELECT_RULES) {
        if (hits(parts, re)) { kind = k; wanted = prefs; break; }
      }
      if (kind === 'role') wanted = ROLE_PREF;
      if (kind === 'inquiry') wanted = INQUIRY_PREF;
      const options = Array.from(el.options || []);
      // Unlabelled select that lists Philippines is a country picker, whatever it
      // calls itself.
      if (!kind && options.some((o) => /philippines/.test(norm(o.textContent)))) {
        kind = 'country';
        wanted = ['philippines'];
      }
      if (!kind || !wanted || !wanted.length) {
        if (!kind) report.skipped.push({ label: shortLabel(parts, el), reason: 'dropdown not recognised' });
        continue;
      }
      // Index 0 with an empty value is the "Select your…" placeholder, never an answer.
      const selectable = options.filter((o, i) => !o.disabled && (i > 0 || String(o.value || '').trim()));
      let chosen = null;
      for (const want of wanted) {
        chosen = selectable.find((o) => norm(o.textContent).includes(want) || norm(o.value).includes(want));
        if (chosen) break;
      }
      if (!chosen) {
        report.skipped.push({ label: shortLabel(parts, el), reason: 'no matching option' });
        continue;
      }
      report.filled.push({ label: shortLabel(parts, el), key: kind, value: (chosen.textContent || '').trim().slice(0, 60) });
      if (!DRY) {
        const record = mark(el);
        const prev = el.value;
        setValue(el, chosen.value);
        record(prev);
      }
      continue;
    }

    const isArea = el instanceof HTMLTextAreaElement;
    const used = usedIn(el);
    let key = null;
    for (const [k, re] of RULES) {
      if (used.has(k) && k !== 'message') continue;
      if (hits(parts, re)) { key = k; break; }
    }
    // An unlabelled textarea on a contact page is the message box.
    if (!key && isArea) key = 'message';
    if (!key) {
      report.skipped.push({ label: shortLabel(parts, el), reason: 'field not recognised' });
      continue;
    }
    // A single-line "message" input is a subject line in disguise more often than not.
    if (key === 'message' && !isArea && VALUES.subject) key = 'subject';

    let value = VALUES[key] || '';
    if (!value) {
      report.skipped.push({ label: shortLabel(parts, el), reason: 'nothing in your profile for this' });
      continue;
    }

    const cap = Number(el.maxLength) > 0 ? Number(el.maxLength) : 0;
    if (cap && value.length > cap) {
      const short = (payload && payload.messageShort) || '';
      if (key === 'message' && short && short.length <= cap) {
        value = short;
        report.notes.push('The message box caps at ' + cap + ' characters — used the short version.');
      } else if (key === 'message' && short) {
        value = clip(short, cap);
        report.notes.push('The message box caps at ' + cap + ' characters — even the short draft was cut. Read it before sending, or use Copy and email them instead.');
      } else {
        value = clip(value, cap);
        report.notes.push('“' + shortLabel(parts, el) + '” caps at ' + cap + ' characters — the text was cut to fit. Check it before sending.');
      }
    }

    report.filled.push({ label: shortLabel(parts, el), key, value: value.slice(0, 60) });
    used.add(key);
    if (!DRY) {
      const record = mark(el);
      const prev = el.value;
      setValue(el, value);
      record(prev);
    }
  }

  if (!DRY && report.filled.length) {
    const undo = window.__maccFillUndo || [];
    setTimeout(() => {
      for (const r of undo) {
        try { r.el.style.outline = r.prevOutline; r.el.style.outlineOffset = r.prevOffset; } catch (e) { /* gone */ }
      }
    }, 8000);
  }

  return report;
}

/** Restores every value this extension wrote into this frame, newest first. */
function maccUndoFill() {
  const undo = window.__maccFillUndo || [];
  let restored = 0;
  for (let i = undo.length - 1; i >= 0; i--) {
    const r = undo[i];
    try {
      const el = r.el;
      const proto = el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(el, r.prevValue); else el.value = r.prevValue;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.style.outline = r.prevOutline;
      el.style.outlineOffset = r.prevOffset;
      restored++;
    } catch (e) { /* the field went away with a re-render */ }
  }
  window.__maccFillUndo = [];
  return { ok: true, restored };
}
