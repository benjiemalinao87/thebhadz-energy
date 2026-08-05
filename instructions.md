# Goals — Command Center

## 1. Project Overview
Founder Goals: countable Mission-aligned outcomes (leads, deposits, surveys, sold, manual) with timeline, assignee, kanban + timeline views, urgency colors, and dashboard progress. Replaces the Jobs “Company tasks” tab.

## 2. Core Functionalities
- CRUD goals via `/api/goals` (D1 `goals` table, auto-migrate)
- Auto-count progress for leads / deposits / surveys / sold; manual otherwise
- Board + Timeline views; owner from session; assignee from active users
- Urgency: hit / ok / risk / miss from pace vs end date
- Sidebar + Apps + dashboard panel + Next actions roll-up
- Company tasks removed from Jobs UI

## 3. Docs and Libraries
- Plain HTML/CSS/JS; Cloudflare Pages Functions + D1
- Patterns: finance dialog CRUD, jobs SPA-safe init, `_pages.js` section registry

## 4. Current File Structure
- `funnel/functions/api/goals.js`
- `funnel/internal/goals.html`
- `funnel/internal/assets/goals.{js,css}`
- Wired: `_pages.js`, `index.html` rail, `apps.html`, `activity.js`, `dashboard.js`, `next-actions.js`, `schema.sql`
