# MVP 1 Development Guide — Job Capture + Kanban

Product promise: Find a job → capture it with the browser extension → save it automatically → track it on a Kanban board.

This guide breaks MVP 1 into 8 sequential phases. Each phase has a clear goal, deliverables, and a "done when" checkpoint. Build in order — don't skip ahead.

## 🧱 Recommended Tech Stack
| Layer | Technology | Why |
|---|---|---|
| Web app | Next.js 14+ (App Router), TypeScript | Full-stack React framework, great DX, easy Vercel deploy |
| Styling / UI | Tailwind CSS + shadcn/ui | Fast, consistent, accessible components (dialogs, dropdowns, toasts) |
| Drag & drop | @dnd-kit/core | Modern, accessible, actively maintained (better than react-beautiful-dnd, which is unmaintained) |
| Backend API | Node.js + NestJS (or Next.js Route Handlers if you want one repo) | NestJS gives clean modular structure, good for a "real" portfolio project; Next.js API routes are faster to ship if you want a monorepo |
| Database | Self-hosted PostgreSQL (Docker locally, managed/self-managed instance in production) | Full control over schema, no vendor lock-in, you own the whole data layer |
| ORM | Prisma | Type-safe queries, migrations, works identically against any Postgres instance |
| Auth | Custom JWT auth: bcrypt/argon2 for password hashing, jsonwebtoken (or @nestjs/jwt) for access/refresh tokens | You build and own the entire auth flow — register, login, hashing, token issuance/refresh — no third-party auth provider |
| Extension | Chrome Extension, Manifest V3, TypeScript + React | Required for modern Chrome Web Store submissions |
| Extension bundler | Vite + @crxjs/vite-plugin (or Plasmo) | Plasmo = fastest to start; Vite+CRXJS = more control |
| State/data fetching (web) | TanStack Query (React Query) | Handles caching, refetch, optimistic updates for Kanban drag events |
| Validation | Zod | Shared schema validation between extension, API, and frontend |
| Deployment | Vercel (web), Render/Fly.io/VPS (API), a managed Postgres instance or your own Postgres on a VPS (DB), Chrome Web Store (extension) | |

Decision to make early: one repo (monorepo with Next.js API routes) vs. separate NestJS backend. For a portfolio piece, a separate NestJS API demonstrates more backend skill. For speed, Next.js API routes in one repo is faster to ship. This guide assumes the separate-backend path but notes the shortcut where relevant.

Note on going fully self-built: dropping Supabase means you're responsible for three things it would otherwise hand you for free — password hashing/token issuance (Phase 2), enforcing per-user data isolation entirely in your API layer instead of via database-level Row-Level Security (Phase 1/6), and running/backing up Postgres yourself (Phase 0/7). None of this is hard, but it does mean there's no database-level safety net if an API query forgets to filter by user_id — so that check has to be disciplined and, ideally, tested.

## Phase 0 — Planning & Environment Setup
Goal: Have all accounts, repos, and local tooling ready before writing feature code.

**Tasks:**
- Run PostgreSQL locally via Docker (`docker run -e POSTGRES_PASSWORD=... -p 5432:5432 postgres:16`) or install it natively — note the connection string.
- Design the initial DB schema (see Phase 1) as an ERD before touching code.
- Set up three repos (or one monorepo with `/web`, `/api`, `/extension` folders): `jobtracker-web`, `jobtracker-api`, `jobtracker-extension`.
- Set up `.env` files (never commit secrets): `DATABASE_URL` (Postgres connection string), `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRY` (e.g. 15m), `JWT_REFRESH_EXPIRY` (e.g. 7d).
- Set up linting/formatting once for all repos: ESLint + Prettier + TypeScript strict mode.
- Create a shared types package (or just a shared `types.ts` file duplicated across repos for MVP1) with the Job and User interfaces, so the extension, API, and web app agree on the same shape.
- Initialize Prisma in the API repo (`npx prisma init`), pointing `DATABASE_URL` at your local Postgres instance.

**Done when:** you can run `npm run dev` on an empty Next.js app, an empty NestJS app, and load an unpacked empty extension in Chrome, all pointing at the same local Postgres database via Prisma.

## Phase 1 — Database & Backend API
Goal: A working, authenticated REST API backed by PostgreSQL, with no UI yet — testable via Postman/curl.

**Database schema**
```sql
create table users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique not null,
  password_hash text not null,
  created_at timestamptz default now()
);

create type job_status as enum (
  'SAVED', 'APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN'
);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade not null,
  title text not null,
  company text not null,
  location text,
  url text,
  source text,               -- 'linkedin' | 'indeed' | 'generic' | 'manual'
  description text,
  salary text,
  employment_type text,      -- 'full-time' | 'contract' | etc.
  status job_status not null default 'SAVED',
  notes text,
  saved_at timestamptz default now(),
  applied_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_jobs_user_id on jobs(user_id);
create index idx_jobs_status on jobs(status);
```

Since there's no managed database-level Row-Level Security here, per-user isolation is enforced entirely in your API layer: every Prisma query on jobs must include `where: { user_id: req.user.id, ... }`. Write a small `jobs.repository.ts` wrapper that always injects `user_id` so no individual route handler can forget it — treat this as your single most important security control and set the pattern now, before writing the CRUD routes below.

**API endpoints**
```
POST   /auth/register
POST   /auth/login
GET    /auth/me

POST   /jobs                 -- create (used by extension "Save Job" and manual form)
GET    /jobs                 -- list, with ?status=&search=&source= query params
GET    /jobs/:id
PATCH  /jobs/:id             -- edit fields
PATCH  /jobs/:id/status      -- move card between Kanban columns
DELETE /jobs/:id
```

**Backend tasks**
- Scaffold NestJS with modules: AuthModule, JobsModule, UsersModule.
- Connect to your self-hosted Postgres via Prisma. Run `npx prisma migrate dev` to create the tables from Phase 1's schema.
- Implement `/auth/register`: validate input, hash the password with bcrypt (or argon2), insert the user, return an access token + refresh token.
- Implement `/auth/login`: look up the user by email, compare the password with `bcrypt.compare`, issue a short-lived access token (e.g. 15 min) and a longer-lived refresh token (e.g. 7 days), both signed with `@nestjs/jwt` using separate secrets.
- Implement a POST `/auth/refresh` endpoint that exchanges a valid refresh token for a new access token, and store refresh tokens (or their hashes) server-side so they can be revoked on logout.
- Implement an auth guard that verifies the access token from the `Authorization: Bearer <token>` header and attaches `req.user`. Never trust a `user_id` sent in the request body — always derive it from the verified token.
- Implement the jobs CRUD endpoints, scoped to `req.user.id` on every query (via the repository wrapper from Phase 1).
- Add input validation with Zod or class-validator DTOs on every endpoint.
- Add CORS config allowing your web app origin and `chrome-extension://<your-extension-id>`.
- Add basic rate limiting (e.g. `@nestjs/throttler`) on `/auth/*` and `/jobs` POST — this matters more without a managed auth provider, since brute-forcing login is now entirely your problem to defend against.

**Done when:** you can curl register → login → get a token → create a job → list jobs → update status → delete a job, all scoped correctly to that user, with a second test user unable to see the first user's jobs.

## Phase 2 — Authentication (Web)
Goal: A working login/register flow on the website, tokens stored securely, protected routes.

**Tasks:**
- Build `/login` and `/register` pages (simple forms, no need for polish yet) that call your NestJS `/auth/register` and `/auth/login` endpoints.
- Store the access token in memory (React state/context) and the refresh token in an httpOnly cookie set by the API — avoid localStorage for tokens where you can, to reduce XSS exposure.
- Add an API client wrapper (e.g. a thin fetch/axios instance) that attaches the access token to every request and, on a 401, calls `/auth/refresh` once and retries before giving up.
- Use Next.js middleware to protect `/dashboard/*` routes — redirect unauthenticated users to `/login`.
- Add a logout action that clears the refresh token cookie and revokes it server-side.
- Google OAuth is optional for MVP1 given you're already building custom auth — if you want it, it's a separate `/auth/google` flow (Passport's passport-google-oauth20 strategy in NestJS) and can be deferred without blocking the rest of MVP1.

**Done when:** a new user can register, get redirected to an empty dashboard, log out, and log back in — and visiting `/dashboard` while logged out redirects to `/login`.

## Phase 3 — Web Dashboard: Kanban Board
Goal: The core UI — a working, draggable Kanban board reading/writing real data from the API.

**Tasks:**
- Build the dashboard layout: top stats bar (Total / Applied / Interviews / Offers), search bar, "+ Add Job" button, Kanban columns.
- Fetch jobs with TanStack Query, grouped client-side by status into the 7 columns (SAVED, APPLIED, SCREENING, INTERVIEW, OFFER, REJECTED, WITHDRAWN).
- Implement drag-and-drop with `@dnd-kit`: on drop, optimistically update the UI, then call `PATCH /jobs/:id/status`; roll back on error (toast notification).
- Build the compact Job Card component: title, company, location, source icon, applied date, salary badge (optional).
- Build the Job Details modal/page: full description, notes (editable textarea with save), status dropdown, edit/delete buttons, "Open Original Job" link.
- Build the Add Job manual form (title, company, location, URL, salary, source dropdown, status dropdown) — this is your fallback path when the extension isn't used.
- Implement search (title/company/location) and filters (status, source, date) — client-side filtering is fine for MVP1 volumes; move to server-side filtering only if job counts get large.
- Wire the stats bar to simple counts derived from the fetched jobs (no need for a separate analytics endpoint yet).

**Done when:** you can add a job manually, see it appear in SAVED, drag it through every column to OFFER, edit its notes, and delete it — all persisting correctly on page refresh.

## Phase 4 — Browser Extension: Job Capture
Goal: A Chrome extension that reads a job page and lets the user save it to their account in one click.

**Architecture**
```
extension/
├── manifest.json
├── popup/              → React UI shown on click (Save Job / Mark Applied)
├── content-scripts/    → injected into job pages, extracts job data
├── background/         → service worker, handles API calls + auth token storage
└── parsers/
    ├── linkedin.ts
    ├── indeed.ts
    └── generic.ts       → fallback using JSON-LD / OpenGraph / meta tags
```

**Tasks:**
- Scaffold with Plasmo or Vite+CRXJS, Manifest V3, storage, activeTab, and host permissions for LinkedIn/Indeed + `<all_urls>` for the generic parser (be ready to justify broad host permissions in the Chrome Web Store review).
- Build the content script: detects it's on a job page, runs the matching parser (`linkedin.ts`, `indeed.ts`, or falls back to `generic.ts` reading JSON-LD JobPosting schema / OpenGraph tags), and returns a structured job object matching your shared Job type.
- Build the popup UI: shows the extracted title/company/location, with [ Save Job ] and [ Mark as Applied ] buttons. If extraction is incomplete, allow the user to edit fields inline before saving.
- Build the background service worker: holds the auth token (obtained via an extension login flow — simplest MVP1 approach is "log in on the website, extension reads a token via chrome.storage synced through a small `/extension/token` endpoint or a content-script bridge on your own domain"), and makes the actual `POST /jobs` call.
- Add extension login: simplest path for MVP1 is a dedicated `/extension-login` page on your website that, once authenticated, posts the session token to the extension via `chrome.runtime.sendMessage` — avoid re-implementing a separate login form inside the popup if you can reuse the web session.
- Handle the LinkedIn parser specifically (highest priority site): extract title, company, location, salary (if shown), job ID from URL.
- Handle the Indeed parser similarly.
- Handle the generic parser: read `<script type="application/ld+json">` for JobPosting schema first (most reliable), fall back to OpenGraph meta tags, fall back to page `<title>` + best-guess DOM scraping.

**Done when:** on a real LinkedIn job posting, clicking the extension icon shows the correct title/company/location pre-filled, and clicking "Save Job" creates the row in your database and it's visible in the web dashboard within a few seconds.

## Phase 5 — Application Detection
Goal: Automatically flip a job to APPLIED when possible, with a reliable manual fallback everywhere else.

**Tasks:**
- LinkedIn Easy Apply: content script watches for the LinkedIn "Application sent" confirmation modal/element appearing in the DOM (via MutationObserver) after the user completes the Easy Apply flow. When detected, call `PATCH /jobs/:id/status` with APPLIED.
- Indeed: similarly watch for their post-submit confirmation screen/element.
- External application flows (most companies' own ATS pages): these are the hardest to detect reliably — don't over-invest here for MVP1. Instead, when the user clicks "Apply" from your popup, set an internal "watching" flag for that tab; if the tab navigates away and later shows signs of a thank-you/confirmation page (URL patterns like `/thank-you`, `/confirmation`, or text matches like "application received"), prompt the fallback below. Otherwise just rely on manual confirmation.
- Manual fallback: always show [ ✓ Mark as Applied ] in the popup for any saved job. This must work on 100% of sites — it's your safety net and the feature that makes the product usable even where detection fails.
- Set `applied_at` server-side when status transitions to APPLIED (don't trust a client-supplied timestamp).
- Be explicit in your UI copy that detection is best-effort ("We'll try to detect your application automatically — you can always confirm manually").

**Done when:** Scenario A (save), Scenario B (auto-detected apply on LinkedIn), Scenario C (manual "Mark as Applied" on a random company site), and Scenario D (fully manual job entry) all work end-to-end, matching the four MVP1 user scenarios.

## Phase 6 — Integration, Edge Cases & Security Hardening
Goal: Make the whole pipeline robust, not just "happy path" functional.

**Tasks:**
- Auth on every layer: confirm the extension, API, and web app all reject requests with missing/invalid/expired tokens with proper 401s. Since there's no database-level RLS as a safety net here, write integration tests that specifically try to fetch/edit/delete User A's jobs while authenticated as User B, and confirm every route rejects it — this is your substitute for defense-in-depth.
- Duplicate save prevention: if the user clicks "Save Job" twice on the same URL, either update the existing row or warn them, rather than creating duplicates (simple version: unique constraint on `(user_id, url)` where `url` is not null).
- Error states: no internet, API down, extraction failure (empty title/company) — the popup should degrade gracefully to the manual-edit form rather than silently failing.
- Loading/empty states: empty Kanban columns, loading skeletons, "no jobs match your search" state.
- Input sanitization: strip/escape any HTML pulled from job descriptions before rendering (avoid stored XSS from scraped content) — render descriptions as plain text or sanitized markdown, never `dangerouslySetInnerHTML` on raw scraped content.
- CORS/CSP: lock down the extension's `manifest.json` `host_permissions` to only what you actually parse; tighten API CORS to your real domains.
- Logging: basic server-side logging of failed extraction attempts (which site, which parser) so you know which sites to add support for next.

**Done when:** you've manually tried to break the flow (double-saving, logging out mid-save, bad network, malformed job pages) and nothing corrupts data or leaks another user's jobs.

## Phase 7 — Deployment & Chrome Web Store Submission
Goal: Ship it — real users can install the extension and use the live website.

**Tasks:**
- Deploy the Next.js web app to Vercel; set production env vars.
- Deploy the NestJS API to Render/Fly.io/a small VPS; set production env vars, enable HTTPS.
- Provision production Postgres: either a managed Postgres add-on (Render/Fly/Railway Postgres) for less ops overhead, or your own instance on a VPS if you want full control — either way, run `npx prisma migrate deploy` against it and set up automated backups before real users touch it.
- Build the extension for production (`npm run build`), zip it, and submit to the Chrome Web Store: write a clear privacy policy (required — you're reading page content and storing job data), justify host permissions in the listing, add screenshots of the popup and dashboard.
- Smoke-test the full production pipeline: install the published (or unlisted/testing) extension, sign up fresh, save a real LinkedIn job, confirm it appears on the live dashboard.
- Set up minimal uptime/error monitoring (e.g. Vercel/Render built-in logs, or a free Sentry tier) so you notice breakage instead of a user reporting it first.

**Done when:** a friend, with no help from you, can install the extension from the store link, create an account on the live site, save a job from LinkedIn, and see it move through the Kanban board.

## ✅ MVP 1 — Definition of Done
MVP1 is complete only when this entire loop works reliably, every time:

1. User finds a job
2. → clicks the extension
3. → job is correctly extracted (LinkedIn / Indeed / generic)
4. → "Save Job" → appears in SAVED on the dashboard
5. → user applies
6. → status becomes APPLIED (auto-detected on LinkedIn/Indeed, or manually confirmed anywhere else)
7. → user can drag the card through SCREENING → INTERVIEW → OFFER
8. → user can search, filter, edit notes, and delete jobs
9. → all of this is scoped strictly to the logged-in user

❌ **Do not build yet (explicitly out of scope for MVP1)**
AI job matching · AI CV analysis · AI cover letters · CV builder · job recommendations · automatic job searching · email/WhatsApp integration · mobile app · advanced analytics · billing/subscriptions · 20+ platform parsers · automatic application submission.

Everything in that list belongs to MVP2 and MVP3 — don't start it until the loop above is genuinely stable in production.
