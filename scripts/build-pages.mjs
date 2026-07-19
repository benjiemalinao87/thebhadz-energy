#!/usr/bin/env node
/**
 * Single-source page generator.
 *
 * Solar City runs two "views" of the same engineering-file content:
 *   - the public/root site   (repo root,        brand "Solar City",        relative asset paths)
 *   - the internal Command Center (funnel/internal/, brand "BADJJ Energy Systems", /internal/ absolute paths)
 *
 * Historically these were two hand-maintained copies of the same HTML, and they drifted
 * (see git history — 8-93 line diffs per page before this script existed). This script makes
 * content/ the single source of truth: edit the partial once, run this script, both sites update.
 *
 * NOT every page is generated. Pages that are genuinely different implementations per site
 * (projects.html — a live D1-backed board internally vs. a static doc-styled page at root;
 * index.html — a hero landing page at root vs. the bespoke Command Center dashboard internally)
 * stay hand-maintained on both sides. Only put a page in content/pages.json if its content
 * really is meant to be identical across both sites.
 *
 * Usage:  node scripts/build-pages.mjs           (writes both sites)
 *         node scripts/build-pages.mjs --check   (exits 1 if generated output would differ
 *                                                  from what's on disk — use in CI / pre-commit)
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CONTENT_DIR = join(ROOT, 'content');
const TEMPLATE = readFileSync(join(ROOT, 'templates/shell.html'), 'utf8');
const CHECK = process.argv.includes('--check');

const pages = JSON.parse(readFileSync(join(CONTENT_DIR, 'pages.json'), 'utf8'));
const WORKSPACE_REDESIGN_PAGES = new Set([
  'overview', 'designer', 'build-guide', 'bom', 'strategy', 'sourcing', 'market',
  'competitors', 'map', 'roof-check', 'ad-library', 'founders',
]);

// SC-07 Project board is NOT in content/pages.json (it's a different implementation per
// site — see note above) but both sites' nav still needs to list it in position, pointing
// at each site's own hand-maintained projects.html.
const PROJECTS_NAV = { navCode: 'SC-07', navLabel: 'Project board', rootFile: 'projects.html', internalFile: 'projects.html' };

function navRows(entries, site) {
  return entries.map(e => {
    const href = site === 'root' ? e.rootFile : `/internal/${e.internalFile}`;
    return `      <a href="${href}"><span class="code">${e.navCode}</span>${e.navLabel}</a>`;
  }).join('\n');
}

// Build the ordered nav list once: pages.json order, with Project board spliced back in
// right after "market" (its historical SC-07 slot, between SC-06 and SC-08).
const marketIdx = pages.findIndex(p => p.id === 'market');
const navEntries = [
  ...pages.slice(0, marketIdx + 1),
  PROJECTS_NAV,
  ...pages.slice(marketIdx + 1),
];

const FOOTERS = {
  standard: 'REV A · 2026-07<br>\n      TARGET: 400&nbsp;W · 108HC M10<br>\n      SITE: PHILIPPINES',
  biliran:  'REV A · 2026-07<br>\n      MARKET: BILIRAN · BILECO<br>\n      SITE: PHILIPPINES',
};

const BRAND = {
  root: {
    name: 'Solar City',
    assetPrefix: '',
    homeHref: 'index.html',
    brandMark: '<span class="wordmark">Solar City</span>\n        <span class="sub">MODULE ENGINEERING FILE</span>',
    favicon: '',
    footerExtra: '',
  },
  internal: {
    name: 'BADJJ',
    assetPrefix: '/internal/',
    homeHref: '/internal/overview.html',
    brandMark: '<img class="logo-mark" src="/assets/img/badjj-logo.png" alt="BADJJ"><span class="brand-text"><span class="wordmark">BADJJ</span>\n        <span class="sub">MODULE ENGINEERING FILE</span></span>',
    favicon: '<link rel="icon" href="/assets/img/badjj-favicon.png">\n',
    footerExtra: `\n      <div style="margin-top:12px;border-top:1px solid #26324a;padding-top:12px">
        <a href="/internal/" style="color:#8fa0b5;text-decoration:none">↩ Founder home</a><br>
        <a href="/api/founder-logout" style="color:#8fa0b5;text-decoration:none">Log out</a>
      </div>`,
  },
};

function repath(html, assetPrefix) {
  if (!assetPrefix) return html;
  return html
    .replace(/href="assets\//g, `href="${assetPrefix}assets/`)
    .replace(/src="assets\//g,  `src="${assetPrefix}assets/`)
    .replace(/href="vendor\//g, `href="${assetPrefix}vendor/`)
    .replace(/src="vendor\//g,  `src="${assetPrefix}vendor/`);
}

function render(entry, site) {
  const b = BRAND[site];
  const main = readFileSync(join(CONTENT_DIR, `${entry.id}.html`), 'utf8').trimEnd()
    .replaceAll('{{BRAND}}', b.name);
  const headExtraPath = join(CONTENT_DIR, `${entry.id}.head.html`);
  const scriptsPath = join(CONTENT_DIR, `${entry.id}.scripts.html`);
  const headExtra = existsSync(headExtraPath) ? readFileSync(headExtraPath, 'utf8').trimEnd() : '';
  const trailing = existsSync(scriptsPath) ? readFileSync(scriptsPath, 'utf8').trimEnd() : '';

  const brandSuffix = entry.id === 'overview' ? '' : ` — ${site === 'root' ? 'Solar City' : 'BADJJ Energy Systems'}`;
  const title = entry.id === 'overview'
    ? (site === 'root' ? 'Solar City — Module Engineering File' : 'BADJJ Energy Systems — Module Engineering File')
    : `${entry.titleBase}${brandSuffix}`;

  const extraLinks = (entry.extraLinks || [])
    .map(l => `<link rel="stylesheet" href="${b.assetPrefix}${l}">`)
    .join('\n');
  const useWorkspaceRedesign = site === 'internal' && WORKSPACE_REDESIGN_PAGES.has(entry.id);
  const workspaceLink = useWorkspaceRedesign
    ? '<link rel="stylesheet" href="/internal/assets/workspace-redesign.css">\n'
    : '';
  const themeScript = site === 'internal'
    ? '<script src="/internal/assets/theme.js"></script>'
    : '';
  const mainClass = useWorkspaceRedesign
    ? ` workspace-page workspace-${entry.id}`
    : '';

  let out = TEMPLATE
    .replace('{{TITLE}}', title)
    .replace('{{THEME_SCRIPT}}', themeScript)
    .replace('{{ASSET_PREFIX}}', b.assetPrefix)
    .replace('{{FAVICON}}', b.favicon)
    .replace('{{EXTRA_LINKS}}', extraLinks ? extraLinks + '\n' : '')
    .replace('{{HEAD_EXTRA}}', headExtra ? headExtra + '\n' : '')
    .replace('{{WORKSPACE_LINK}}', workspaceLink)
    .replace('{{HOME_HREF}}', b.homeHref)
    .replace('{{BRAND_MARK}}', b.brandMark)
    .replace('{{NAV_ITEMS}}', navRows(navEntries, site))
    .replace('{{FOOTER_BODY}}', '      ' + FOOTERS[entry.footer] + b.footerExtra)
    .replace('{{MAIN_CLASS}}', mainClass)
    .replace('{{MAIN}}', repath(main, b.assetPrefix))
    .replace('{{TRAILING_SCRIPTS}}', repath(trailing, b.assetPrefix));

  return out.trimEnd() + '\n';
}

let mismatches = 0;
let written = 0;

for (const entry of pages) {
  const rootOut = render(entry, 'root');
  const internalOut = render(entry, 'internal');

  const rootPath = join(ROOT, entry.rootFile);
  const internalPath = join(ROOT, 'funnel/internal', entry.internalFile);

  for (const [path, content] of [[rootPath, rootOut], [internalPath, internalOut]]) {
    const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
    if (current === content) continue;
    if (CHECK) {
      console.error(`OUT OF DATE: ${path.replace(ROOT + '/', '')}`);
      mismatches++;
    } else {
      writeFileSync(path, content);
      console.log(`wrote ${path.replace(ROOT + '/', '')}`);
      written++;
    }
  }
}

if (CHECK) {
  if (mismatches > 0) {
    console.error(`\n${mismatches} file(s) out of date. Run: node scripts/build-pages.mjs`);
    process.exit(1);
  }
  console.log('All generated pages are up to date.');
} else {
  console.log(`\nDone. ${written} file(s) written (unchanged files skipped).`);
}
