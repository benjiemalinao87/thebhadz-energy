# thebhadz-energy

Interactive technical documentation, customer funnel, and founder command center for
**BADJJ Energy Systems** — designing, building, and scaling production of our own ~400W
residential solar panels (module assembly from purchased cells), plus a source-and-install
revenue arm.

Static site — plain HTML/CSS/JS + D3, **no build step, no framework**. D3 is vendored
locally (`vendor/d3.min.js`), never loaded from a CDN. Everything works offline from the
local filesystem.

## Layout

### Public engineering file (repo root)
The SC-00–06 documentation, readable standalone and deep-linkable. Open `index.html`.

| File | Section |
| --- | --- |
| `index.html` | SC-00 · Overview — the two-model plan |
| `designer.html` | SC-01 · Interactive panel designer (D3) |
| `build-guide.html` | SC-02 · Step-by-step build guide |
| `bom.html` | SC-03 · Bill of materials + suppliers (PH / SE-Asia sourcing) |
| `strategy.html` | SC-04 · Manufacturing & logistics strategy |
| `sourcing.html` | SC-05 · Source & install (Model B) |
| `market.html` | SC-06 · Market, packaging & pricing |

Shared styles in `assets/style.css`; shared nav/layout in `assets/site.js`.

### Customer funnel + founder command center (`funnel/`)
A self-contained conversion funnel that deploys to **Cloudflare Pages**, plus the
founder-only internal CRM and command center.

- `funnel/index.html` — public landing page selling the three ₱99,500 homeowner packages.
- `funnel/login.html` — founder access gate.
- `funnel/internal/` — founder command center: dashboard (`index.html`), **Contacts CRM**
  (`leads.html`), meeting log, principles, and internal copies of the SC docs.
- `funnel/functions/` — Cloudflare Pages Functions: HMAC-signed founder auth, and the
  `/api/leads` CRM endpoint (list / update stage / update notes / delete) backed by D1.
- `funnel/schema.sql` — D1 (SQLite) schema for the leads pipeline.
- `funnel/wrangler.toml` — Cloudflare Pages + D1/R2 bindings.

The command center and Contacts table use a dark "monitor / terminal" design system;
the public funnel uses a separate warm, sunlit, mobile-first system.

## The two models

- **Model A — the moat** (SC-01…04): build our own ~400W half-cut monocrystalline modules
  from purchased cells. Long-term defensibility.
- **Model B — the engine** (SC-05…06): source what's uneconomical to reproduce and earn as
  the installer. Near-term revenue and Model A's sales channel.

## Running locally

No install needed for the static docs — just open `index.html` in a browser.

For the funnel with working auth + CRM endpoints (D1-backed), run under Wrangler:

```sh
cd funnel
npx wrangler pages dev .
```

The founder area requires two secrets set as environment variables (never committed):
`FOUNDER_PASSWORD` and `AUTH_SECRET`.

## Deployment

The `funnel/` directory deploys to Cloudflare Pages. The static engineering file at the
repo root can be hosted on any static host (Cloudflare Pages, Railway, etc.) — it's a copy
operation. See `funnel/README.md` for the full deploy and wire-up steps.
