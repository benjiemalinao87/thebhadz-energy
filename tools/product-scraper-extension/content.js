// Extractor injected on demand by the popup (activeTab + scripting) — it never runs
// automatically. Must remain a single IIFE expression: the object it evaluates to is
// what chrome.scripting.executeScript hands back to popup.js, so it may only contain
// JSON-serializable values.
(() => {
  const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  const first = (...vals) => {
    for (const v of vals) {
      const c = clean(v);
      if (c) return c;
    }
    return '';
  };

  // ?cap_site= lets the offline test fixtures exercise a site module from file://,
  // where location.hostname is empty.
  let forcedSite = null;
  try { forcedSite = new URLSearchParams(location.search).get('cap_site'); } catch (e) { /* noop */ }
  const host = location.hostname.toLowerCase();
  const site = forcedSite || (
    /(^|\.)alibaba\.com$/.test(host) ? 'alibaba'
      : /(^|\.)aliexpress\./.test(host) ? 'aliexpress'
        : /(^|\.)facebook\.com$/.test(host) ? 'facebook'
          : (/(^|\.)shopee\./.test(host) || /(^|\.)lazada\./.test(host)) ? 'shop-sea'
            : 'generic');

  const selection = clean(window.getSelection ? String(window.getSelection()) : '');
  const bodyText = ((document.body && document.body.innerText) || '').slice(0, 300000);
  // Facebook's page chrome is full of words like "Location", so free-text scans are
  // only trusted against the user's own selection there.
  const scanText = site === 'facebook' ? selection : bodyText;

  const meta = {};
  for (const m of document.querySelectorAll('meta[property], meta[name], meta[itemprop]')) {
    const k = (m.getAttribute('property') || m.getAttribute('name') || m.getAttribute('itemprop') || '').toLowerCase();
    const v = m.getAttribute('content');
    if (k && v && !(k in meta)) meta[k] = clean(v);
  }

  const ldProducts = [];
  const walkLd = (node, depth) => {
    if (!node || depth > 6) return;
    if (Array.isArray(node)) { for (const n of node) walkLd(n, depth + 1); return; }
    if (typeof node !== 'object') return;
    const t = node['@type'];
    const types = Array.isArray(t) ? t : [t];
    if (types.some((x) => typeof x === 'string' && /product/i.test(x))) ldProducts.push(node);
    for (const k of ['@graph', 'mainEntity', 'itemListElement', 'item']) if (node[k]) walkLd(node[k], depth + 1);
  };
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try { walkLd(JSON.parse(s.textContent), 0); } catch (e) { /* malformed JSON-LD is common; skip */ }
  }
  const ld = ldProducts[0] || {};
  let ldOffers = ld.offers;
  if (Array.isArray(ldOffers)) ldOffers = ldOffers[0];
  if (!ldOffers || typeof ldOffers !== 'object') ldOffers = {};

  const NUM = '\\d{1,3}(?:[ ,]?\\d{3})*(?:\\.\\d+)?';
  const CUR = '(?:US\\s?\\$|USD|PHP|₱|RMB|CN¥|CNY|¥|€|£|\\$|(?<=\\s|^)P(?=\\d))';
  const PRICE_RE = new RegExp(
    CUR + '\\s?' + NUM +
    '(?:\\s?[-–—~]\\s?' + CUR + '?\\s?' + NUM + ')?' +
    '(?:\\s?\\/\\s?[A-Za-z]+)?'
  );
  const findPrice = (...texts) => {
    for (const t of texts) {
      if (!t) continue;
      const m = String(t).match(PRICE_RE);
      if (m) return clean(m[0]);
    }
    return '';
  };
  const currencyOf = (text) => {
    const t = String(text || '');
    if (/₱|PHP/i.test(t) || /(?:^|\s)P\d/.test(t)) return 'PHP';
    if (/US\s?\$|USD/i.test(t)) return 'USD';
    if (/RMB|CN¥|CNY|¥/.test(t)) return 'CNY';
    if (/€/.test(t)) return 'EUR';
    if (/£/.test(t)) return 'GBP';
    if (/\$/.test(t)) return 'USD';
    return '';
  };

  let priceElText = '';
  {
    let n = 0;
    for (const el of document.querySelectorAll('[itemprop="price"], [data-price], [class*="price" i]')) {
      if (++n > 60) break;
      const t = clean(el.getAttribute('content') || el.innerText);
      const m = t && t.match(PRICE_RE);
      if (m) { priceElText = m[0]; break; }
    }
  }

  const brandOf = (b) => (b && typeof b === 'object' ? clean(b.name) : clean(b));
  const stripSiteSuffix = (t) => {
    let out = clean(t).replace(/^\(\d+\)\s*/, '');
    for (let i = 0; i < 3; i++) {
      const next = out.replace(/\s*[-|–—·]\s*(?:Alibaba\.com|AliExpress(?:\.com)?[^|]*|Facebook|Marketplace|Shopee[^|]*|Lazada[^|]*)\s*$/i, '');
      if (next === out) break;
      out = next;
    }
    return out;
  };
  const h1El = document.querySelector('h1');

  let ldImage = ld.image;
  if (Array.isArray(ldImage)) ldImage = ldImage[0];
  if (ldImage && typeof ldImage === 'object') ldImage = ldImage.url;
  let seller = ldOffers.seller;
  if (Array.isArray(seller)) seller = seller[0];

  const fields = {
    product: first(ld.name, stripSiteSuffix(meta['og:title'] || ''), h1El && h1El.innerText, stripSiteSuffix(document.title)),
    brand: first(brandOf(ld.brand), meta['product:brand'], meta['og:brand'], meta['brand']),
    description: cut(first(selection, ld.description, meta['og:description'], meta['description']), 1500),
    cost: '',
    currency: '',
    location: '',
    supplier: first(seller && typeof seller === 'object' ? seller.name : seller),
    moq: '',
    image: first(ldImage, meta['og:image'])
  };

  const ldCur = clean(ldOffers.priceCurrency);
  let ldPriceText = '';
  if (ldOffers.price != null && clean(ldOffers.price)) ldPriceText = clean(ldOffers.price);
  else if (ldOffers.lowPrice != null && clean(ldOffers.lowPrice)) {
    ldPriceText = clean(ldOffers.lowPrice) +
      (ldOffers.highPrice != null && clean(ldOffers.highPrice) ? '–' + clean(ldOffers.highPrice) : '');
  }
  if (ldPriceText) {
    fields.cost = ldCur ? ldCur + ' ' + ldPriceText : ldPriceText;
    fields.currency = ldCur || currencyOf(fields.cost);
  }
  if (!fields.cost) {
    const amt = first(meta['product:price:amount'], meta['og:price:amount']);
    const cur = first(meta['product:price:currency'], meta['og:price:currency']);
    if (amt) { fields.cost = cur ? cur + ' ' + amt : amt; fields.currency = cur; }
  }
  if (!fields.cost) fields.cost = findPrice(selection, priceElText, scanText);
  if (!fields.currency) fields.currency = currencyOf(fields.cost);

  const moqM = scanText.match(/(?:min(?:imum|\.)?\s*order(?:\s*quantity)?|MOQ|min\.?\s*qty)\s*[:：]?\s*([^\n]{1,60})/i);
  if (moqM) fields.moq = clean(moqM[1]);
  const locM = scanText.match(/(?:ships?\s+from|located\s+in|location)\s*[:：]?\s*([^\n.;|·]{2,80})/i);
  if (locM) fields.location = clean(locM[1]);

  const other = [];
  const warnings = [];

  if (site === 'alibaba' || site === 'aliexpress') {
    if (!fields.supplier) {
      const el = document.querySelector('a[href*="company_profile"], [class*="company-name" i], [data-company-name], a[href*="/store/"]');
      if (el) fields.supplier = clean(el.getAttribute('data-company-name') || el.innerText);
    }
    if (!fields.supplier) {
      for (const s of document.scripts) {
        const t = s.textContent;
        if (!t || t.indexOf('ompanyName') === -1) continue;
        const m = t.match(/"(?:sellerC|c)ompanyName"\s*:\s*"([^"]{2,120})"/);
        if (m) { fields.supplier = clean(m[1]); break; }
      }
    }
    const yrs = bodyText.match(/(\d{1,2})\s*yrs?\s*\.?\s*([A-Z]{2})\b/);
    if (!fields.location) {
      const provM = bodyText.match(/\b([A-Z][A-Za-z]+(?:\s[A-Z][A-Za-z]+)?,\s*(?:China|Vietnam|India|Philippines|Thailand|Malaysia|Indonesia|Turkey|South Korea|Japan|Taiwan|Hong Kong))\b/);
      const CC = { CN: 'China', VN: 'Vietnam', IN: 'India', PH: 'Philippines', TH: 'Thailand', MY: 'Malaysia', ID: 'Indonesia', TR: 'Turkey', KR: 'South Korea', JP: 'Japan', TW: 'Taiwan', HK: 'Hong Kong', US: 'United States' };
      if (provM) fields.location = clean(provM[1]);
      else if (yrs && CC[yrs[2]]) fields.location = CC[yrs[2]];
    }
    if (yrs) other.push('Supplier tenure: ' + yrs[1] + ' yrs on ' + (site === 'alibaba' ? 'Alibaba' : 'AliExpress'));
  }

  if (site === 'facebook') {
    const fbCtx = clean(stripSiteSuffix(document.title));
    if (fbCtx && fbCtx.length <= 90) other.push('FB page/group: ' + fbCtx);
    if (/\/marketplace\/item\//.test(location.pathname)) {
      if (!fields.product) fields.product = fbCtx;
      if (!fields.cost) {
        fields.cost = findPrice(bodyText);
        fields.currency = fields.currency || currencyOf(fields.cost);
      }
      const lm = bodyText.match(/Listed[^\n]{0,80}?\bin\s+([^\n.;|·]{2,60})/i);
      if (lm && !fields.location) fields.location = clean(lm[1]);
    } else {
      // Feed/group posts: obfuscated DOM, so the selection IS the extractor.
      if (!ld.name && !meta['og:title']) fields.product = '';
      if (!selection) warnings.push('Facebook posts can’t be auto-read reliably — highlight the post text, then click the extension again.');
    }
    if (selection && !fields.location) {
      const pm = selection.match(/(?:location|pickup|pick\s*up|area|loc)\s*[:：]?\s*([^\n,.;|·]{2,60})/i);
      if (pm) fields.location = clean(pm[1]);
    }
  }

  if (ld.sku) other.push('SKU: ' + clean(ld.sku));
  if (ld.aggregateRating && ld.aggregateRating.ratingValue) {
    other.push('Rating: ' + clean(ld.aggregateRating.ratingValue) +
      (ld.aggregateRating.reviewCount ? ' · ' + clean(ld.aggregateRating.reviewCount) + ' reviews' : ''));
  }
  if (ldOffers.availability) other.push('Availability: ' + clean(String(ldOffers.availability).replace(/^https?:\/\/schema\.org\//i, '')));
  if (meta['og:site_name'] && site === 'generic') other.push('Site: ' + meta['og:site_name']);

  return {
    ok: true,
    site,
    host: location.hostname,
    url: location.href,
    pageTitle: clean(document.title),
    hasSelection: !!selection,
    signals: { jsonLd: ldProducts.length > 0, og: !!meta['og:title'] },
    fields,
    other,
    warnings
  };
})();
