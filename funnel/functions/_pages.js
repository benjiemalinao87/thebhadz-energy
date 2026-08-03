/**
 * Which sections of the Command Center an account may see.
 *
 * One registry, used three ways:
 *   - functions/internal/_middleware.js refuses hidden PAGES;
 *   - functions/api/_middleware.js refuses the hidden pages' APIs;
 *   - the browser (sidebar + Team & access) reads it from /api/session and /api/users,
 *     so the nav and the permission editor can never drift from what is enforced.
 *
 * Hiding is a deny-list on the user row (`users.hidden_pages`, JSON array of keys).
 * Empty means full access, which is what every founder gets by default — this exists
 * for installers, interns, bookkeepers and anyone else who should see a slice.
 *
 * Hiding the sidebar link alone would be theatre: an installer could type
 * /internal/finance or call /api/finance directly. That is why every section lists
 * the API paths that carry its data, and both middlewares check them.
 */

/**
 * Note on /internal/apps.html — the navigation surface reached from the rail's single Apps
 * entry. It is deliberately absent from the list below, which is what keeps it reachable:
 * sectionForPage() returns null for a slug in no section, and the internal middleware
 * treats that as always-available. Hiding it would strand an account with no route to the
 * tools it may still use. It carries no data of its own and filters its own tiles through
 * this same registry (assets/section-visibility.js), so a hidden section's tile disappears
 * from the grid while the grid itself stays open.
 */
export const SECTIONS = [
  {
    key: "next-actions",
    label: "Next actions (roll-up)",
    group: "Operations",
    // Reads /api/leads, /api/install-ops and /api/projects rather than owning data.
    // Those APIs stay individually gated, so hiding a section still hides its rows
    // here — the page degrades to what the account may actually see.
    pages: ["next-actions"],
    apis: [],
  },
  {
    key: "leads",
    label: "Contacts / leads pipeline",
    group: "Operations",
    pages: ["leads"],
    apis: ["/api/leads"],
  },
  {
    key: "meetings",
    label: "Meeting log + recordings",
    group: "Operations",
    pages: ["meetings"],
    apis: ["/api/recordings"],
  },
  {
    key: "mail",
    label: "Company mailbox",
    group: "Operations",
    pages: ["mail"],
    apis: ["/api/mail"],
  },
  {
    key: "notes",
    label: "Team notes",
    group: "Operations",
    pages: ["notes"],
    apis: ["/api/notes", "/api/note-image"],
  },
  {
    key: "documents",
    label: "Documents (library)",
    group: "Operations",
    pages: ["docs"],
    apis: ["/api/documents", "/api/document-file"],
  },
  {
    key: "projects",
    label: "Jobs & project board",
    group: "Operations",
    // /api/jobs is the installation workspace (jobs, their checklists, stage history);
    // /api/projects is the company-task half of the same page. Both belong to this
    // section, so hiding it closes the page AND the data behind it.
    pages: ["projects"],
    apis: ["/api/jobs", "/api/projects"],
  },
  {
    key: "install-ops",
    label: "Install operations",
    group: "Operations",
    pages: ["install-ops"],
    apis: ["/api/install-ops"],
  },
  {
    key: "quotes",
    label: "Quote builder (customer pricing)",
    group: "Operations",
    // Its own section rather than a page under install-ops: this is the one tool that
    // sets the price a customer sees, so it can be granted to whoever sells and
    // withheld from whoever only installs.
    pages: ["quote-builder"],
    apis: ["/api/quote", "/api/price-items", "/api/quote-settings"],
  },
  {
    key: "finance",
    label: "Finance & runway (money)",
    group: "Money",
    pages: ["finance"],
    apis: ["/api/finance", "/api/finance-receipt"],
  },
  {
    key: "founder-lab",
    label: "Strategy lab",
    group: "Strategy",
    pages: ["founder-lab"],
    apis: ["/api/founder-lab"],
  },
  {
    key: "strategy",
    label: "Strategy, market, decks, charter",
    group: "Strategy",
    pages: [
      "strategy",
      "market",
      "strategy-deck-en",
      "strategy-deck-tl",
      "support-moat",
      "principles",
      "founder-charter",
      "founders",
    ],
    apis: [],
  },
  {
    key: "legal",
    label: "Legal, SEC filings & net metering",
    group: "Company",
    pages: [
      "sec-registration",
      "erc-net-metering",
      "by-laws-template",
      "articles-of-incorporation-template",
      "treasurers-affidavit-template",
      "secretarys-certificate-template",
      "founders-agreement-term-sheet",
    ],
    apis: ["/api/checklist"],
  },
  {
    key: "field",
    label: "Field intelligence (competitors, map, ads)",
    group: "Research",
    pages: ["competitors", "research-workbook", "map", "roof-check", "ad-library"],
    apis: [],
  },
  {
    key: "captures",
    label: "Product captures (supplier sourcing)",
    group: "Research",
    pages: ["captures"],
    apis: ["/api/captures"],
  },
  {
    key: "engineering",
    label: "Engineering file (panel design, BOM, build)",
    group: "Engineering",
    pages: ["overview", "designer", "build-guide", "bom", "sourcing"],
    apis: [],
  },
  {
    key: "team",
    label: "Team & access (own password)",
    group: "System",
    pages: ["team"],
    apis: [],
    // Never hideable: this is where everyone changes their own password, and where a
    // new account with a temporary one is sent at first sign-in. Hiding it would lock
    // that person out of their own login. Account administration on the page is gated
    // by role instead — a limited account sees only its own login and activity.
    alwaysOn: true,
  },
];

export const SECTION_KEYS = SECTIONS.map((section) => section.key);
/** Sections that may actually be switched off — everything except the always-on ones. */
export const HIDEABLE_KEYS = SECTIONS.filter((section) => !section.alwaysOn).map((section) => section.key);

/** The section a page slug belongs to, or null for always-available pages. */
export function sectionForPage(slug) {
  const wanted = String(slug || "").toLowerCase();
  if (!wanted) return null;
  for (const section of SECTIONS) {
    if (section.pages.indexOf(wanted) !== -1) return section;
  }
  return null;
}

/** The section an /api/* path belongs to, or null if the endpoint isn't section-bound. */
export function sectionForApi(pathname) {
  const path = String(pathname || "").replace(/\/+$/, "");
  for (const section of SECTIONS) {
    if (section.apis.indexOf(path) !== -1) return section;
  }
  return null;
}

/**
 * Keep only real, hideable keys, de-duplicated — never trust a list from the browser.
 * Always-on sections are dropped here rather than rejected, so a stale checkbox can't
 * fail a whole save.
 */
export function normalizeHiddenPages(value) {
  const input = Array.isArray(value) ? value : [];
  const seen = [];
  for (const raw of input) {
    const key = String(raw || "").trim().toLowerCase();
    if (HIDEABLE_KEYS.indexOf(key) !== -1 && seen.indexOf(key) === -1) seen.push(key);
  }
  return seen;
}

/** Parse the stored JSON column defensively — a bad value must not lock anyone out. */
export function parseHiddenPages(json) {
  if (Array.isArray(json)) return normalizeHiddenPages(json);
  try {
    return normalizeHiddenPages(JSON.parse(String(json || "[]")));
  } catch {
    return [];
  }
}

/** Is this section hidden from this user? Always-on sections never are. */
export function isSectionHidden(user, key) {
  if (!user || !key) return false;
  if (HIDEABLE_KEYS.indexOf(key) === -1) return false;
  const hidden = Array.isArray(user.hidden_pages) ? user.hidden_pages : parseHiddenPages(user.hidden_pages);
  return hidden.indexOf(key) !== -1;
}

/** The registry as the browser needs it (no API paths — the UI only labels sections). */
export function sectionsForClient() {
  return SECTIONS.map((section) => ({
    key: section.key,
    label: section.label,
    group: section.group,
    pages: section.pages,
    always_on: !!section.alwaysOn,
  }));
}
