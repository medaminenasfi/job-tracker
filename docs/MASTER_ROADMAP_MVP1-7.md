# Full Development Guide — MVP 1 to MVP 7

One continuous build plan, in order. Each MVP stands on the one before it; **don't start an MVP until the previous one's phases are genuinely done in production**, not just locally.

---

## Why this order (read before building)

You asked for CV building, CV parsing, cover letters, monetization, memory/intelligence features, and design/language — split across 6 MVPs with good architecture. Here's the structure and the two decisions that make the dependencies work:

- **MVP2's AI Job Match doesn't require an uploaded CV.** It matches a job description against the skills the user types directly into their profile. This lets MVP2 ship a complete, useful "Job Search Copilot" on its own, before any file upload, LaTeX, or sandboxing exists.
- **MVP3 (CV Builder & Parser)** later enriches that same match service with real CV text once it exists — one `JobMatchService`, two data sources over time, no rework.

```
MVP 1   Job Capture + Kanban (extension, Kanban, admin, auth, CAPTCHA, deploy)
   ↓
MVP 2   Job Search Copilot (profile, AI match on typed skills, reminders, analytics, company history)
   ↓
MVP 3   CV Builder & Parser (upload+parse existing CVs, admin LaTeX templates, Docker-sandboxed PDF builder)
   ↓
MVP 4   Cover Letter Builder (AI drafts + optional LaTeX PDF export, reuses MVP3's sandbox)
   ↓
MVP 5   Monetization (plans, Stripe billing, feature gating — built once there's something worth paying for)
   ↓
MVP 6   Job Application Memory & Advanced Intelligence (memory, duplicates, similar jobs, comparison, the
        Advanced Assistant — which now really orchestrates MVP3+MVP4, not a placeholder)
   ↓
MVP 7   Design Enhancement & Language Support (premium UI/animations + English/French i18n, applied across
        everything built in MVP1–6)
```

> **Why this order specifically:** Monetization sits right after the CV Builder (MVP5, not earlier) because CV Builder + Cover Letter Builder are your strongest paid features — billing logic built before they exist has nothing real to gate. Design polish and language support come last (MVP7) because they're cross-cutting passes over the entire product — doing them earlier means redoing them every time a new MVP adds screens.

---

## 🧱 Master Tech Stack

### Base stack (MVP1, unchanged throughout)

| Layer | Technology |
| --- | --- |
| Web app | Next.js 14+ (App Router), TypeScript |
| Styling / UI | Tailwind CSS + shadcn/ui |
| Drag & drop | `@dnd-kit/core` |
| Backend API | NestJS |
| Database | Self-hosted PostgreSQL |
| ORM | Prisma |
| Auth | Custom JWT (bcrypt/argon2 + access/refresh tokens) |
| Extension | Chrome MV3, TypeScript + React |
| Extension bundler | Vite + `@crxjs/vite-plugin` (or Plasmo) |
| Data fetching | TanStack Query |
| Validation | Zod |
| CAPTCHA | Cloudflare Turnstile (free) |
| Deployment | Vercel (web), Render/Fly.io/VPS (api), managed/self Postgres, Chrome Web Store |

### New pieces by MVP

| Layer | Technology | Introduced in | Why |
| --- | --- | --- | --- |
| AI provider | Anthropic or OpenAI API, server-side only | MVP2 Phase 0 | Powers job matching here; reused by CV parsing, cover letters, and the Advanced Assistant later — one `AiModule`, one place the key lives |
| AI output validation | Zod | MVP2 Phase 0 | Model responses are untrusted input until validated |
| File storage | S3-compatible bucket (Cloudflare R2 / MinIO / Backblaze B2), local disk in dev | MVP3 Phase 1 | Stores uploaded CVs and generated PDFs |
| PDF/DOCX text extraction | `pdf-parse`, `mammoth` | MVP3 Phase 1 | Raw text from uploaded CVs, feeds AI parsing |
| Job queue | BullMQ + Redis | MVP3 Phase 4 | Decouples slow LaTeX compilation from the request thread; reused by Cover Letter PDF export (MVP4) |
| LaTeX engine | TeX Live (minimal install), `pdflatex -no-shell-escape` | MVP3 Phase 4 | Compiles admin-authored templates |
| Sandbox runtime | Docker: a separate, network-disabled, non-root, read-only-FS container per compile job | MVP3 Phase 4 | Isolates LaTeX compilation — see MVP3 for the Dockerfile |
| LaTeX escaping | A dedicated escape function for `\ { } $ & # _ % ~ ^` | MVP3 Phase 4 | The real defense against LaTeX injection; the sandbox is defense-in-depth, not a substitute |
| Scheduled jobs | `@nestjs/schedule` (`@Cron`) | MVP2 Phase 3 | Daily follow-up reminder sweep |
| Charts | Recharts | MVP2 Phase 4 | Analytics, later reused by MVP6 comparison and MVP5 billing usage charts |
| Fuzzy/string matching | `fast-levenshtein` or `string-similarity` | MVP6 Phase 2 | Duplicate-job detection |
| Payments | Stripe Checkout + webhooks | MVP5 Phase 2 | Standard, low-maintenance billing path |
| Animation | Framer Motion | MVP7 Phase 1–2 | Sidebar, page transitions, drag overlays |
| i18n (web) | `next-intl` | MVP7 Phase 5 | App Router-native, locale-prefixed routing |

---

# 🟢 MVP 1 — Job Capture + Kanban

> **Product promise:** Find a job → capture it with the browser extension → save it automatically → track it on a Kanban board.

This guide breaks MVP 1 into 13 sequential phases (0–12): core product (0–6), admin system (7), user dashboard home (8), Google auth (9), CAPTCHA bot protection with Cloudflare Turnstile (10), premium UI/animations (11), and deployment (12). Each phase has a clear goal, deliverables, and a "done when" checkpoint. **Build in order — don't skip ahead.**

## MVP 1 — Tech Stack Recap

*(Full detail in the Master Tech Stack above; this is MVP1's own slice for reference.)*

| Layer | Technology | Why |
| --- | --- | --- |
| Web app | Next.js 14+ (App Router), TypeScript | Full-stack React framework, great DX, easy Vercel deploy |
| Styling / UI | Tailwind CSS + shadcn/ui | Fast, consistent, accessible components (dialogs, dropdowns, toasts) |
| Drag & drop | `@dnd-kit/core` | Modern, accessible, actively maintained (better than react-beautiful-dnd, which is unmaintained) |
| Backend API | Node.js + NestJS (or Next.js Route Handlers if you want one repo) | NestJS gives clean modular structure, good for a "real" portfolio project; Next.js API routes are faster to ship if you want a monorepo |
| Database | Self-hosted PostgreSQL (Docker locally, managed/self-managed instance in production) | Full control over schema, no vendor lock-in, you own the whole data layer |
| ORM | Prisma | Type-safe queries, migrations, works identically against any Postgres instance |
| Auth | Custom JWT auth: bcrypt/argon2 for password hashing, `jsonwebtoken` (or `@nestjs/jwt`) for access/refresh tokens | You build and own the entire auth flow — register, login, hashing, token issuance/refresh — no third-party auth provider |
| Extension | Chrome Extension, Manifest V3, TypeScript + React | Required for modern Chrome Web Store submissions |
| Extension bundler | Vite + `@crxjs/vite-plugin` (or Plasmo) | Plasmo = fastest to start; Vite+CRXJS = more control |
| State/data fetching (web) | TanStack Query (React Query) | Handles caching, refetch, optimistic updates for Kanban drag events |
| Validation | Zod | Shared schema validation between extension, API, and frontend |
| Animation | Framer Motion | Sidebar collapse, sliding active indicator (`layoutId`), page transitions, drag overlays |
| Icons / theming / toasts | `lucide-react`, `next-themes`, `sonner` | Consistent icons, dark mode, polished notifications |
| Charts | Recharts | Admin overview and dashboard charts |
| CAPTCHA | Cloudflare Turnstile (free) + `@marsidev/react-turnstile` | Bot protection on login/register, verified server-side (Phase 10) |
| Google sign-in | `passport-google-oauth20` (NestJS) or `google-auth-library` | Adds "Continue with Google" on top of your own JWT sessions (Phase 9) |
| Deployment | Vercel (web), Render/Fly.io/VPS (API), a managed Postgres instance or your own Postgres on a VPS (DB), Chrome Web Store (extension) | |

> **Decision to make early:** one repo (monorepo with Next.js API routes) vs. separate NestJS backend. For a portfolio piece, a separate NestJS API demonstrates more backend skill. For speed, Next.js API routes in one repo is faster to ship. This guide assumes the separate-backend path but notes the shortcut where relevant.

> **Note on going fully self-built:** dropping Supabase means you're responsible for three things it would otherwise hand you for free — password hashing/token issuance (Phase 2), enforcing per-user data isolation entirely in your API layer instead of via database-level Row-Level Security (Phase 1/6), and running/backing up Postgres yourself (Phase 0/7). None of this is hard, but it does mean there's no database-level safety net if an API query forgets to filter by `user_id` — so that check has to be disciplined and, ideally, tested.

### MVP 1 — Phase 0: Planning & Environment Setup

**Goal:** Have all accounts, repos, and local tooling ready before writing feature code.

**Tasks:**

- Run PostgreSQL locally via Docker (`docker run -e POSTGRES_PASSWORD=... -p 5432:5432 postgres:16`) or install it natively — note the connection string.
- Design the initial DB schema (see Phase 1) as an ERD before touching code.
- Set up three repos (or one monorepo with `/web`, `/api`, `/extension` folders): `jobtracker-web`, `jobtracker-api`, `jobtracker-extension`.
- Set up `.env` files (never commit secrets):
  - `DATABASE_URL` (Postgres connection string), `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRY` (e.g. `15m`), `JWT_REFRESH_EXPIRY` (e.g. `7d`).
- Set up linting/formatting once for all repos: ESLint + Prettier + TypeScript strict mode.
- Create a shared types package (or just a shared `types.ts` file duplicated across repos for MVP1) with the `Job` and `User` interfaces, so the extension, API, and web app agree on the same shape.
- Initialize Prisma in the API repo (`npx prisma init`), pointing `DATABASE_URL` at your local Postgres instance.

> ✅ **Done when:** you can run `npm run dev` on an empty Next.js app, an empty NestJS app, and load an unpacked empty extension in Chrome, all pointing at the same local Postgres database via Prisma.

### MVP 1 — Phase 1: Database & Backend API

**Goal:** A working, authenticated REST API backed by PostgreSQL, with no UI yet — testable via Postman/curl.

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

Since there's no managed database-level Row-Level Security here, per-user isolation is enforced entirely in your API layer: every Prisma query on `jobs` must include `where: { user_id: req.user.id, ... }`. Write a small `jobs.repository.ts` wrapper that always injects `user_id` so no individual route handler can forget it — treat this as your single most important security control and set the pattern now, before writing the CRUD routes below.

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

- Scaffold NestJS with modules: `AuthModule`, `JobsModule`, `UsersModule`.
- Connect to your self-hosted Postgres via Prisma. Run `npx prisma migrate dev` to create the tables from Phase 1's schema.
- Implement `/auth/register`: validate input, hash the password with bcrypt (or argon2), insert the user, return an access token + refresh token.
- Implement `/auth/login`: look up the user by email, compare the password with `bcrypt.compare`, issue a short-lived access token (e.g. 15 min) and a longer-lived refresh token (e.g. 7 days), both signed with `@nestjs/jwt` using separate secrets.
- Implement a `POST /auth/refresh` endpoint that exchanges a valid refresh token for a new access token, and store refresh tokens (or their hashes) server-side so they can be revoked on logout.
- Implement an auth guard that verifies the access token from the `Authorization: Bearer <token>` header and attaches `req.user`. Never trust a `user_id` sent in the request body — always derive it from the verified token.
- Implement the jobs CRUD endpoints, scoped to `req.user.id` on every query (via the repository wrapper from Phase 1).
- Add input validation with Zod or class-validator DTOs on every endpoint.
- Add CORS config allowing your web app origin and `chrome-extension://<your-extension-id>`.
- Add basic rate limiting (e.g. `@nestjs/throttler`) on `/auth/*` and `/jobs POST` — this matters more without a managed auth provider, since brute-forcing login is now entirely your problem to defend against.

> ✅ **Done when:** you can curl register → login → get a token → create a job → list jobs → update status → delete a job, all scoped correctly to that user, with a second test user unable to see the first user's jobs.

### MVP 1 — Phase 2: Authentication (Web)

**Goal:** A working login/register flow on the website, tokens stored securely, protected routes.

**Tasks:**

- Build `/login` and `/register` pages (simple forms, no need for polish yet) that call your NestJS `/auth/register` and `/auth/login` endpoints.
- Store the access token in memory (React state/context) and the refresh token in an httpOnly cookie set by the API — avoid localStorage for tokens where you can, to reduce XSS exposure.
- Add an API client wrapper (e.g. a thin fetch/axios instance) that attaches the access token to every request and, on a 401, calls `/auth/refresh` once and retries before giving up.
- Use Next.js middleware to protect `/dashboard/*` routes — redirect unauthenticated users to `/login`.
- Add a logout action that clears the refresh token cookie and revokes it server-side.
- Google sign-in is added later in Phase 9 — build email/password first, and design the `users` table so a password is not the only way in.

> ✅ **Done when:** a new user can register, get redirected to an empty dashboard, log out, and log back in — and visiting `/dashboard` while logged out redirects to `/login`.

### MVP 1 — Phase 3: Web Dashboard: Kanban Board

**Goal:** The core UI — a working, draggable Kanban board reading/writing real data from the API.

**Tasks:**

- Build the dashboard layout: top stats bar (Total / Applied / Interviews / Offers), search bar, "+ Add Job" button, Kanban columns.
- Fetch jobs with TanStack Query, grouped client-side by status into the 7 columns (SAVED, APPLIED, SCREENING, INTERVIEW, OFFER, REJECTED, WITHDRAWN).
- Implement drag-and-drop with `@dnd-kit`: on drop, optimistically update the UI, then call `PATCH /jobs/:id/status`; roll back on error (toast notification).
- Build the compact Job Card component: title, company, location, source icon, applied date, salary badge (optional).
- Build the Job Details modal/page: full description, notes (editable textarea with save), status dropdown, edit/delete buttons, "Open Original Job" link.
- Build the Add Job manual form (title, company, location, URL, salary, source dropdown, status dropdown) — this is your fallback path when the extension isn't used.
- Implement search (title/company/location) and filters (status, source, date) — client-side filtering is fine for MVP1 volumes; move to server-side filtering only if job counts get large.
- Wire the stats bar to simple counts derived from the fetched jobs (no need for a separate analytics endpoint yet).

> ✅ **Done when:** you can add a job manually, see it appear in SAVED, drag it through every column to OFFER, edit its notes, and delete it — all persisting correctly on page refresh.

### MVP 1 — Phase 4: Browser Extension: Job Capture

**Goal:** A Chrome extension that reads a job page and lets the user save it to their account in one click.

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

- Scaffold with Plasmo or Vite+CRXJS, Manifest V3, `storage`, `activeTab`, and host permissions for LinkedIn/Indeed + `<all_urls>` for the generic parser (be ready to justify broad host permissions in the Chrome Web Store review).
- Build the content script: detects it's on a job page, runs the matching parser (`linkedin.ts`, `indeed.ts`, or falls back to `generic.ts` reading JSON-LD JobPosting schema / OpenGraph tags), and returns a structured job object matching your shared `Job` type.
- Build the popup UI: shows the extracted title/company/location, with **[ Save Job ]** and **[ Mark as Applied ]** buttons. If extraction is incomplete, allow the user to edit fields inline before saving.
- Build the background service worker: holds the auth token (obtained via an extension login flow — simplest MVP1 approach is "log in on the website, extension reads a token via `chrome.storage` synced through a small `/extension/token` endpoint or a content-script bridge on your own domain"), and makes the actual `POST /jobs` call.
- Add extension login: simplest path for MVP1 is a dedicated `/extension-login` page on your website that, once authenticated, posts the session token to the extension via `chrome.runtime.sendMessage` — avoid re-implementing a separate login form inside the popup if you can reuse the web session.
- Handle the LinkedIn parser specifically (highest priority site): extract title, company, location, salary (if shown), job ID from URL.
- Handle the Indeed parser similarly.
- Handle the generic parser: read `<script type="application/ld+json">` for JobPosting schema first (most reliable), fall back to OpenGraph meta tags, fall back to page `<title>` + best-guess DOM scraping.

> ✅ **Done when:** on a real LinkedIn job posting, clicking the extension icon shows the correct title/company/location pre-filled, and clicking "Save Job" creates the row in your database and it's visible in the web dashboard within a few seconds.

### MVP 1 — Phase 5: Application Detection

**Goal:** Automatically flip a job to APPLIED when possible, with a reliable manual fallback everywhere else.

**Tasks:**

- **LinkedIn Easy Apply:** content script watches for the LinkedIn "Application sent" confirmation modal/element appearing in the DOM (via `MutationObserver`) after the user completes the Easy Apply flow. When detected, call `PATCH /jobs/:id/status` with APPLIED.
- **Indeed:** similarly watch for their post-submit confirmation screen/element.
- **External application flows** (most companies' own ATS pages): these are the hardest to detect reliably — don't over-invest here for MVP1. Instead, when the user clicks "Apply" from your popup, set an internal "watching" flag for that tab; if the tab navigates away and later shows signs of a thank-you/confirmation page (URL patterns like `/thank-you`, `/confirmation`, or text matches like "application received"), prompt the fallback below. Otherwise just rely on manual confirmation.
- **Manual fallback:** always show **[ ✓ Mark as Applied ]** in the popup for any saved job. This must work on 100% of sites — it's your safety net and the feature that makes the product usable even where detection fails.
- Set `applied_at` server-side when status transitions to APPLIED (don't trust a client-supplied timestamp).
- Be explicit in your UI copy that detection is best-effort ("We'll try to detect your application automatically — you can always confirm manually").

> ✅ **Done when:** Scenario A (save), Scenario B (auto-detected apply on LinkedIn), Scenario C (manual "Mark as Applied" on a random company site), and Scenario D (fully manual job entry) all work end-to-end, matching the four MVP1 user scenarios.

### MVP 1 — Phase 6: Integration, Edge Cases & Security Hardening

**Goal:** Make the whole pipeline robust, not just "happy path" functional.

**Tasks:**

- **Auth on every layer:** confirm the extension, API, and web app all reject requests with missing/invalid/expired tokens with proper 401s. Since there's no database-level RLS as a safety net here, write integration tests that specifically try to fetch/edit/delete User A's jobs while authenticated as User B, and confirm every route rejects it — this is your substitute for defense-in-depth.
- **Duplicate save prevention:** if the user clicks "Save Job" twice on the same URL, either update the existing row or warn them, rather than creating duplicates (simple version: unique constraint on `(user_id, url)` where `url` is not null).
- **Error states:** no internet, API down, extraction failure (empty title/company) — the popup should degrade gracefully to the manual-edit form rather than silently failing.
- **Loading/empty states:** empty Kanban columns, loading skeletons, "no jobs match your search" state.
- **Input sanitization:** strip/escape any HTML pulled from job descriptions before rendering (avoid stored XSS from scraped content) — render descriptions as plain text or sanitized markdown, never `dangerouslySetInnerHTML` on raw scraped content.
- **CORS/CSP:** lock down the extension's `manifest.json` `host_permissions` to only what you actually parse; tighten API CORS to your real domains.
- **Logging:** basic server-side logging of failed extraction attempts (which site, which parser) so you know which sites to add support for next.

> ✅ **Done when:** you've manually tried to break the flow (double-saving, logging out mid-save, bad network, malformed job pages) and nothing corrupts data or leaks another user's jobs.

### MVP 1 — Phase 7: Admin System (Roles, Admin Login, Admin Dashboard)

**Goal:** A separate, protected admin area where an administrator can see and manage every user and every job on the platform.

**Security decision first: how do admins get created?**

You asked for admin login and register. A public "register as admin" page is the single most dangerous thing you could ship — anyone could make themselves an admin and read every user's data. Use one of these instead:

- **Seed script (recommended for MVP1):** `npm run seed:admin` reads `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env` and creates the first admin. Nobody registers as admin through the UI.
- **Admin invite (for additional admins):** an existing admin generates a one-time, expiring invite link/code (`/admin/register?token=...`). The register page only works with a valid, unused token. This gives you an "admin register" screen without the hole.
- Regular `/auth/register` must always create `role = USER` — never accept a `role` field from the request body.

**Database changes (Prisma migration)**

```sql
create type user_role as enum ('USER', 'ADMIN');
create type account_status as enum ('ACTIVE', 'SUSPENDED');

alter table users
  add column role user_role not null default 'USER',
  add column account_status account_status not null default 'ACTIVE',
  add column last_login_at timestamptz;

create table admin_invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text unique not null,
  created_by uuid references users(id),
  expires_at timestamptz not null,
  used_at timestamptz
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references users(id),
  action text not null,          -- 'USER_SUSPENDED', 'USER_DELETED', 'JOB_DELETED', ...
  target_type text,
  target_id uuid,
  created_at timestamptz default now()
);
```

**Admin API (all under `/admin/*`)**

```
POST   /admin/auth/login            -- same credentials check, rejects non-ADMIN users
POST   /admin/auth/register         -- requires valid invite token
POST   /admin/invites               -- create invite (admin only)

GET    /admin/stats                 -- totals: users, jobs, jobs by status, signups per week
GET    /admin/users                 -- paginated, search by name/email, filter by role/status
GET    /admin/users/:id             -- profile + job counts
PATCH  /admin/users/:id/status      -- suspend / reactivate
PATCH  /admin/users/:id/role        -- promote / demote (cannot demote yourself)
DELETE /admin/users/:id             -- delete user + cascade jobs (cannot delete yourself)
GET    /admin/jobs                  -- all jobs across users, paginated, filter by user/status/source
GET    /admin/jobs/:id
DELETE /admin/jobs/:id
GET    /admin/audit-logs
```

**Backend tasks**

- Add `role` to the JWT payload; build a `RolesGuard` + `@Roles('ADMIN')` decorator. Always re-check role from the database for destructive admin actions rather than trusting only the token (a demoted admin's old token would otherwise keep working until it expires).
- Apply `JwtAuthGuard` + `RolesGuard` at the `AdminModule` controller level so no admin route can be added without protection.
- Create a separate `admin.repository.ts` for cross-user queries. The normal `jobs.repository.ts` stays strictly user-scoped — this is the one deliberate exception to the "every query is scoped to `req.user.id`" rule, and it lives in one auditable place.
- Block login for SUSPENDED accounts in `/auth/login` and in the auth guard (so a suspended user's still-valid token stops working immediately).
- Write an `audit_logs` row for every mutating admin action (suspend, role change, delete).
- Add safety rails: an admin cannot delete/demote/suspend themselves, and the last remaining admin cannot be removed.
- Stricter rate limiting on `/admin/auth/*`.

**Frontend tasks (Next.js)**

- Routes: `/admin/login`, `/admin/register` (invite only), and a protected `/admin` layout with its own sidebar (Overview, Users, Jobs, Audit Log, Settings). Middleware redirects non-admins away from `/admin/*`.
- **Overview page:** stat cards (total users, new users this week, total jobs, applied/interview/offer counts) + a simple signups-per-week chart (Recharts) + status distribution.
- **Users page:** searchable, paginated table (name, email, role, status, jobs count, joined, last login) with row actions: view, suspend/reactivate, promote/demote, delete (confirmation dialog).
- **User detail page:** profile, their job counts by status, and a read-only list of their jobs.
- **Jobs page:** all jobs across users, filter by user/status/source, delete for spam/abuse.
- **Audit log page:** who did what, when.
- Make the admin area visually distinct (e.g. a badge or accent colour in the sidebar) so an admin never confuses it with the user app.

**Privacy note**

Admins reading users' job data is a privacy matter. Mention it in your privacy policy, keep admin job views read-only except for deletion, and rely on the audit log.

> ✅ **Done when:** the seeded admin can log in at `/admin/login`, see platform-wide stats, search and suspend a test user (who is then immediately locked out), and a normal user visiting `/admin` is redirected away and gets 403 on every `/admin/*` API call.

### MVP 1 — Phase 8: User Dashboard Home (Simple Overview + Website Info)

**Goal:** Turn the user's Dashboard page into a helpful, simple home — quick stats plus a bit of information about the product — while the Kanban stays on the "Job Track" page.

You already have the stat cards, Status Breakdown, and Recent Jobs. Keep them and add:

- **Greeting + getting-started checklist** (shown until completed): ✅ Create account · ☐ Install the browser extension · ☐ Save your first job · ☐ Mark a job as Applied. Derive completion from real data.
- **Install extension card:** short explanation of what the extension does, with an "Install extension" button (Chrome Web Store link, or "coming soon" during development).
- **How it works card:** three steps — Find a job → Save it with one click → Track it on the board.
- **Tips card:** 2–3 rotating tips ("Add notes after every call", "Use 'Mark as Applied' if auto-detect misses").
- **Activity summary:** applications this week / this month, and a small "last 7 days" sparkline.
- **Announcements area:** a small "What's new" box fed by a simple announcements table (or a hardcoded JSON file for MVP1) that admins can later edit from the admin panel.
- **Empty state:** if the user has 0 jobs, replace the stats with a friendly onboarding illustration and a single "Add your first job" button.
- Keep the page light: one aggregated endpoint `GET /dashboard/summary` returning all counts and recent jobs, instead of several requests.
- **Parameters/Settings page:** profile (name, email), change password, connected accounts (Google — see Phase 9), and delete account.

> ✅ **Done when:** a brand-new user sees the onboarding checklist and empty state; a user with data sees accurate stats, recent jobs, and the info cards; and the whole page loads from one API call.

### MVP 1 — Phase 9: Google Authentication

**Goal:** "Continue with Google" on both login and register, coexisting with email/password, with safe account linking.

**Setup**

In Google Cloud Console: create a project → OAuth consent screen → OAuth client ID (Web application). Add authorized redirect URIs for local and production. Store `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` only in the API's `.env` (AGENTS.md rule #5).

**Prisma migration:**

```sql
alter table users
  add column google_id text unique,
  add column avatar_url text,
  add column auth_provider text not null default 'local',  -- 'local' | 'google'
  alter column password_hash drop not null;               -- Google-only users have no password
```

**Flow (recommended: server-side redirect flow)**

```
[Continue with Google] → GET /auth/google → Google consent
   → GET /auth/google/callback (API verifies, finds/creates user)
   → API issues YOUR access + refresh tokens (same as email login)
   → redirect to web app /dashboard
```

Use Passport `passport-google-oauth20` in NestJS (or `google-auth-library` if you prefer the client-side ID-token flow). Either way, the app's own JWTs remain the only session mechanism — Google is just an identity check.

**Tasks**

- `GET /auth/google` and `GET /auth/google/callback` endpoints.
- **Account linking rule:** if the Google email matches an existing local account, link it (set `google_id`) only if Google reports the email as verified; otherwise reject. Never create a duplicate user for the same email.
- Google users are always created with `role = USER`; suspended accounts are refused here too.
- Guard against OAuth CSRF with the `state` parameter (Passport handles this if sessions/state are configured).
- Add "Continue with Google" buttons to `/login` and `/register` (and **not** to the admin login — keep admin on password + invite).
- **Parameters page:** show "Connected: Google", allow setting a password for Google-only accounts, and only allow unlinking if a password exists.
- **Extension:** no extra work — the extension logs in through the web session (`/extension-login`), so Google users are covered automatically.

> ✅ **Done when:** a new user can register via Google, log out, log back in via Google; a user who registered with email can link Google with the same verified email and end up with one account; and the extension works for both.

### MVP 1 — Phase 10: Bot Protection: CAPTCHA on Login/Register (Cloudflare Turnstile, Free)

**Goal:** Block automated login/registration attacks (credential stuffing, brute force, fake signups) with a CAPTCHA that is verified on both the frontend and the backend. The frontend widget alone protects nothing — a bot can skip your UI and call the API directly, so **the backend must verify every token**.

**Why Cloudflare Turnstile**

Turnstile is Cloudflare's free CAPTCHA alternative. Per Cloudflare's plans page, the Free plan has unlimited challenges, up to 20 widgets per account and 10 hostnames per widget, and it works on its own — you do not need to move your DNS or site to Cloudflare. Most visitors never see a puzzle: in Managed mode it is automatic or at most a checkbox. It is a good fit for MVP1 (free, no tracking-heavy behaviour, simple API).

| Option | Cost | Notes |
| --- | --- | --- |
| Cloudflare Turnstile (recommended) | Free, unlimited challenges | No puzzles, simple server verify call |
| hCaptcha | Free basic tier | Good alternative if you want a fallback provider |
| Google reCAPTCHA | Free only up to a monthly cap | Sets Google cookies, more friction |

**How the flow works**

```
Browser                     Your API                    Cloudflare
   │  1. load widget ─────────────────────────────────────▶│
   │◀─────────── 2. token (single use, ~5 min) ────────────│
   │  3. POST /auth/login {email, password, turnstileToken}│
   │──────────────▶│                                        │
   │               │ 4. POST siteverify {secret, token, ip} ▶│
   │               │◀──────────── 5. {success: true/false} ─│
   │◀── 6. login proceeds only if success ── │
```

Tokens are single-use and expire after about 5 minutes, so a new token is needed for every attempt.

#### Step 1 — Create the widget and keys

1. Create a free Cloudflare account → Turnstile → Add widget.
2. Name it (e.g. `jobtracker-auth`), add hostnames (`localhost` for dev, then your real domains), choose mode **Managed**.
3. Copy the **Site Key** (public) and **Secret Key** (private).
4. Create separate widgets for dev and production so you can rotate/monitor them independently.

**Environment variables:**

```bash
# web/.env.local
NEXT_PUBLIC_TURNSTILE_SITE_KEY=...

# api/.env  (never exposed to the browser or the extension — AGENTS.md rule #5)
TURNSTILE_SECRET_KEY=...
```

#### Step 2 — Frontend (Next.js)

- Install the React wrapper: `npm i @marsidev/react-turnstile`.
- Build a reusable `<TurnstileField />` component around `<Turnstile siteKey=... />` that exposes `token`, `onSuccess`, `onExpire`, `onError`, and a `reset()` via ref.
- Add it to `/login`, `/register`, and `/admin/login` (set a different `options.action` for each: `login`, `register`, `admin_login`).
- Disable the submit button until a token exists; show a small "Verifying…" state.
- Send the token in the request body as `turnstileToken`.
- Call `reset()` after every failed submit — the old token is spent, so without a reset the user is stuck.
- Handle widget errors gracefully ("Verification failed, please refresh") and support dark/light theme (`theme="auto"`).
- **Do not** add the CAPTCHA to Google sign-in (Google already vets the user) or to the extension (it reuses the web session).

#### Step 3 — Backend (NestJS)

Create a `TurnstileService` and a `TurnstileGuard`:

```ts
// turnstile.service.ts (core idea)
async verify(token: string, ip?: string, expectedAction?: string) {
  if (!token || token.length > 2048) return false;
  const body = new URLSearchParams({
    secret: process.env.TURNSTILE_SECRET_KEY!,
    response: token,
    ...(ip ? { remoteip: ip } : {}),
  });
  const res = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    { method: 'POST', body, signal: AbortSignal.timeout(5000) },
  );
  const data = await res.json();
  if (!data.success) return false;
  if (expectedAction && data.action !== expectedAction) return false;
  // optionally: check data.hostname is one of your domains
  return true;
}
```

**Tasks:**

- Apply the guard to `POST /auth/login`, `POST /auth/register`, and `POST /admin/auth/login` **before** any password check or database lookup (cheap rejection first).
- Read the token from `turnstileToken` in the body, the client IP from the request (behind a proxy, configure Nest/Express `trust proxy` correctly), and pass an expected action per route.
- Verify the action and hostname returned by Cloudflare match what you expect, so a token issued on another site/form can't be replayed here.
- **Fail closed:** if the siteverify call errors or times out, reject the request (503 with a friendly message). Never let requests through because the CAPTCHA service is down.
- Return a generic error (400 CAPTCHA verification failed) — do not reveal whether the email exists.
- Log failures (IP, route, Cloudflare error-codes such as `missing-input-response`, `invalid-input-response`, `timeout-or-duplicate`) for monitoring.
- Keep the secret key server-side only; never log it.

#### Step 4 — Layered defense (CAPTCHA is not enough alone)

Keep these in place, they complement the CAPTCHA:

- Rate limiting on `/auth/*` (Phase 1) — stricter per IP and per email.
- Temporary lockout / progressive delay after repeated failed logins for the same account.
- Optional progressive mode: show the CAPTCHA only after N failed attempts on login (always keep it on register).
- Password hashing cost tuned (bcrypt/argon2) so brute force is slow even if a bot gets through.

#### Step 5 — Security headers / CSP

If you use a Content-Security-Policy on the web app, allow `https://challenges.cloudflare.com` in `script-src`, `frame-src`, and `connect-src`. Without this the widget silently fails to load.

#### Step 6 — Local development & testing

**Never disable verification with an "if dev, skip" flag that could leak into production.** Use Cloudflare's official test keys instead:

| Purpose | Site key | Secret key |
| --- | --- | --- |
| Always passes | `1x00000000000000000000AA` | `1x0000000000000000000000000000000AA` |
| Always fails | `2x00000000000000000000AB` | `2x0000000000000000000000000000000AA` |
| Forces interactive challenge | `3x00000000000000000000FF` | — |

**Tests to write:**

- Unit test `TurnstileService` with a mocked fetch (success, `success:false`, timeout, wrong action).
- E2E: login with the always-pass keys succeeds; with the always-fail secret returns 400; missing token returns 400; replaying the same token fails.
- Confirm a direct curl to `/auth/login` without a token is rejected — this proves backend enforcement, not just UI.

#### Step 7 — Deployment notes

- Add your production domains to the widget's hostname list (free plan: up to 10 per widget).
- Set the production site key/secret in Vercel and your API host; rebuild the web app after changing the public key.
- Update your privacy policy to mention Cloudflare Turnstile is used for bot protection.

> ✅ **Done when:** login, register, and admin login all require a valid Turnstile token in the browser and the API rejects any request without a valid, unexpired, correctly-scoped token (verified with curl); the widget resets after failed attempts; and login still works with Google and via the extension.

### MVP 1 — Phase 11: Premium UI/UX & Animations

**Goal:** Make the app feel polished and modern — cohesive design system, animated sidebar, smooth transitions — without hurting performance or accessibility.

**11.1 Design system foundations**

- Define design tokens as CSS variables (Tailwind theme): a refined neutral palette + one brand accent, consistent radius (e.g. 12px cards), a spacing scale, and soft layered shadows instead of heavy borders.
- Typography: one quality font via `next/font` (Inter, Geist, or Plus Jakarta Sans), a clear scale (page title / section / body / caption), tabular numbers for stats.
- Replace the emoji sidebar icons with a single icon set (`lucide-react`) for a consistent look.
- Add dark mode (`next-themes`) with tokens defined for both themes; toggle in the sidebar footer or Parameters.

**11.2 Sidebar animation**

- Collapsible sidebar (expanded ↔ icon-only), width animated with Framer Motion (spring or 200–250ms ease-out); remember the state in localStorage.
- Active-item indicator that slides between items using Framer Motion's `layoutId` (a shared pill/background that glides to the selected item).
- Hover micro-interactions: subtle background fade, icon nudge, tooltip labels when collapsed.
- Staggered fade-in of nav items on first load.
- Mobile: sidebar becomes a slide-in drawer with a backdrop and a hamburger button; close on route change.
- User card + Log out pinned to the bottom, with a small avatar (Google avatar if available, initials otherwise).

**11.3 Page & component polish**

- Page transitions: short fade/slide-up on route change (Framer Motion `AnimatePresence`), 150–250ms.
- Stat cards: animated count-up on load, subtle hover lift.
- Kanban: smooth drag overlay with lift/rotation and shadow, animated drop placement, column highlight when a card hovers over it, coloured status accents (you already have per-column tints — refine them), empty-column illustrations ("Drop a job here").
- Cards & modals: job details as a slide-over panel (right side) with animated open/close; shadcn Dialog animations tuned.
- Loading: replace spinners with skeleton screens shaped like the real content.
- Feedback: toast notifications (`sonner`) for save/move/delete/undo; button loading states; inline form validation with helpful messages.
- Charts (admin + dashboard): consistent palette, animated entry, tooltips.
- Landing page: hero section with product screenshot/mock, feature grid, "How it works", CTA, footer — same design tokens.

**11.4 Accessibility & performance guardrails**

- Respect `prefers-reduced-motion` — disable or shorten animations for those users.
- Keep animations to `transform`/`opacity` (GPU-friendly); avoid animating layout-heavy properties.
- Keyboard navigation and visible focus rings everywhere (including Kanban: dnd-kit's keyboard sensor).
- Check colour contrast in both themes; run Lighthouse and aim for 90+ on Performance/Accessibility.
- Lazy-load heavy pieces (charts, admin routes) with dynamic imports.

> ✅ **Done when:** the sidebar collapses/expands smoothly with a gliding active indicator on desktop and works as a drawer on mobile, dark/light themes both look intentional, every list has skeleton + empty states, and Lighthouse accessibility is 90+.

### MVP 1 — Phase 12: Deployment & Chrome Web Store Submission

**Goal:** Ship it — real users can install the extension and use the live website.

**Tasks:**

- Deploy the Next.js web app to Vercel; set production env vars.
- Deploy the NestJS API to Render/Fly.io/a small VPS; set production env vars, enable HTTPS.
- Provision production Postgres: either a managed Postgres add-on (Render/Fly/Railway Postgres) for less ops overhead, or your own instance on a VPS if you want full control — either way, run `npx prisma migrate deploy` against it and set up automated backups before real users touch it.
- Build the extension for production (`npm run build`), zip it, and submit to the Chrome Web Store: write a clear privacy policy (required — you're reading page content and storing job data), justify host permissions in the listing, add screenshots of the popup and dashboard.
- Smoke-test the full production pipeline: install the published (or unlisted/testing) extension, sign up fresh, save a real LinkedIn job, confirm it appears on the live dashboard.
- Set up minimal uptime/error monitoring (e.g. Vercel/Render built-in logs, or a free Sentry tier) so you notice breakage instead of a user reporting it first.

> ✅ **Done when:** a friend, with no help from you, can install the extension from the store link, create an account on the live site, save a job from LinkedIn, and see it move through the Kanban board.

## ✅ MVP 1 — Definition of Done

MVP1 is complete only when this entire loop works reliably, every time:

```
User finds a job
   → clicks the extension
   → job is correctly extracted (LinkedIn / Indeed / generic)
   → "Save Job" → appears in SAVED on the dashboard
   → user applies
   → status becomes APPLIED (auto-detected on LinkedIn/Indeed, or manually confirmed anywhere else)
   → user can drag the card through SCREENING → INTERVIEW → OFFER
   → user can search, filter, edit notes, and delete jobs
   → all of this is scoped strictly to the logged-in user
   → user can also sign in with Google
   → login/register are protected by a CAPTCHA verified on the backend
   → an admin can log in separately, see all users and jobs, and suspend/manage accounts
```

## ❌ Do not build yet (explicitly out of scope for MVP1)

AI job matching · AI CV analysis · AI cover letters · CV builder · job recommendations · automatic job searching · email/WhatsApp integration · mobile app · advanced analytics · billing/subscriptions · 20+ platform parsers · automatic application submission.

Everything in that list belongs to MVP2 and MVP3 — don't start it until the loop above is genuinely stable in production.

---

# 🟡 MVP 2 — Job Search Copilot

> **Product promise:** Stop just storing applications — start helping the user understand them.

**Scope note:** this MVP deliberately does **not** include CV upload, parsing, or building — that's MVP3. Job matching here runs on the skills the user types directly into their profile, so MVP2 is a complete, shippable product on its own, before any file handling or LaTeX exists.

### MVP 2 — Phase 0: Prerequisites & AI Integration Planning

**Goal:** Decide how AI is powered before anything depends on it.

**Tasks:**

- Pick one AI provider (Anthropic or OpenAI API), called server-side only — the key never reaches the extension or the browser.
- Create a dedicated `AiModule` in NestJS with one service per capability, starting with `JobMatchService`. Every later MVP (CV parsing, cover letters, the Advanced Assistant) adds a service here, not a parallel integration.
- Cost control: cache match results per job, add a per-user monthly AI-call cap.
- Structured output: the model always returns strict JSON, validated with Zod before being stored or shown — never trust unvalidated model output as structured data.

**Database:**

```sql
alter table users
  add column ai_calls_this_month int not null default 0,
  add column ai_calls_reset_at timestamptz;
```

> ✅ **Done when:** a throwaway `POST /ai/ping` round-trips through the provider server-side, with Zod validation and a rate limit in front of it.

### MVP 2 — Phase 1: User Profile

**Goal:** A profile with enough structure to power matching, without any file upload yet.

**Database:**

```sql
create table user_profiles (
  user_id uuid primary key references users(id) on delete cascade,
  headline text,
  years_experience int,
  skills text[],          -- the single source of truth for matching until MVP3 adds CVs
  bio text,
  updated_at timestamptz default now()
);
```

**Backend:** `PUT /profile`, `GET /profile` — all fields above, scoped to `req.user.id`.

**Frontend:** `/profile` page: headline, years of experience, a tag input for skills, bio. Empty state nudging the user to fill this in before trying AI matching.

> ✅ **Done when:** a user can set a headline, experience, and a skills list, and it persists and is editable on refresh.

### MVP 2 — Phase 2: AI Job Match

**Goal:** Show a match score and matched/missing skills for a job, computed from the profile above.

**Database:**

```sql
alter table jobs
  add column match_score int,
  add column match_skills_matched text[],
  add column match_skills_missing text[],
  add column match_computed_at timestamptz;
```

**Backend tasks:**

- `JobMatchService.computeMatch(job, profile)`: prompt built from the job description + `profile.skills/headline/experience`, returns `{ score, matchedSkills[], missingSkills[] }`, Zod-validated, score clamped 0–100.
- `POST /jobs/:id/match` — cached by `match_computed_at`; skip recomputation if nothing relevant changed.
- Enforce the Phase 0 AI-call cap.
- Graceful degradation on AI failure/timeout — "match unavailable," never block the rest of the job view.

**Frontend:** Job Details match panel (score badge, matched/missing skill lists, Recompute button); optional small badge on the Kanban card; the extension popup shows the score inline for a saved job.

> **Note for MVP3:** when CV Builder ships, `computeMatch` gains an optional `cvText` argument and prefers it over profile skills alone when a CV is linked to the job — same function, richer input, nothing here needs to be rebuilt.

> ✅ **Done when:** opening a job with a filled-in profile returns an accurate-looking score within a few seconds, and re-opening an unchanged job doesn't re-call the AI.

### MVP 2 — Phase 3: Follow-up Reminders

**Goal:** Nudge the user to follow up on applications that have gone quiet.

**Database:**

```sql
alter table jobs
  add column follow_up_at timestamptz,
  add column follow_up_sent boolean default false;
```

**Tasks:**

- On transition to APPLIED, set `follow_up_at = applied_at + interval '7 days'` by default.
- Daily `@Cron` job finds overdue, unsent reminders and creates an in-app notification (no email — out of scope, per MVP1).
- `GET /notifications`, `PATCH /notifications/:id/read`; let the user set a custom follow-up date or disable it per job.
- Notification bell in the header with an unread count; follow-up badge on the job card/detail.

> ✅ **Done when:** a job applied to 7+ days ago with no change surfaces a reminder, and marking it handled clears the badge.

### MVP 2 — Phase 4: Analytics Dashboard

**Goal:** Response rate, interview rate, sources, trend over time.

**Backend:** `GET /analytics/summary`, `GET /analytics/by-source`, `GET /analytics/timeline?range=` — all scoped to `req.user.id`.

**Frontend:** an `/analytics` page with stat cards, a trend chart and a by-source chart (Recharts), date-range filter. Keep the MVP1 Dashboard's simple stats as they are — this is a separate, deeper page.

> ✅ **Done when:** the analytics page's numbers match a manual count for a test account.

### MVP 2 — Phase 5: Company History

**Goal:** See every application to one company together.

**Backend:** `GET /companies`, `GET /companies/:name/jobs` (case-insensitive match; normalize company names on save to reduce "Google" vs "Google Inc." duplicates).

**Frontend:** a searchable Companies view with per-status counts; link to it from Job Details.

> ✅ **Done when:** three jobs at the same company group correctly with accurate status counts.

### MVP 2 — Phase 6: Integration, Testing & Hardening

**Tasks:**

- Cross-user isolation tests on every new endpoint (`/profile`, `/jobs/:id/match`, `/notifications`, `/analytics/*`, `/companies`), same discipline as MVP1 Phase 6.
- Confirm the AI-call cap actually blocks excess calls with a clear error.
- Confirm AI failures degrade gracefully everywhere, with no raw provider errors leaked to the client.
- Log AI call volume/cost per day.

> ✅ **Done when:** you've tried to break every new endpoint and nothing leaks cross-user data or silently burns AI budget.

### MVP 2 — Phase 7: Rollout

**Tasks:** feature-flag if rolling out gradually; add "Fill in your profile" to the MVP1 onboarding checklist; update the privacy policy (job descriptions and profile data now go to a third-party AI provider); smoke-test profile → match score → reminder → analytics → company grouping end-to-end on production.

> ✅ **Done when:** a real user can go from an empty profile to a matched application with an active reminder, with nothing from MVP1 regressed.

---

# 🟢 MVP 3 — CV Builder & Parser

> **Product promise:** Upload a CV and get structured data back, or build a polished one from scratch using an admin-designed template — safely.

This is the **most security-sensitive MVP in the whole guide**, because it's the only one that compiles user-influenced content (LaTeX) rather than just storing or displaying it. Two rules apply to every phase below and are **non-negotiable**, the same way AGENTS.md treats "never trust a client-supplied `user_id`":

1. **User-supplied values are never interpreted as LaTeX commands** — only escaped, literal text.
2. **Compilation always happens in an isolated, network-disabled, resource-limited Docker container** — never in the API process itself.

### MVP 3 — Phase 0: Prerequisites

**Checklist:** MVP2's `AiModule` and AI-call cap are working; file storage (local disk in dev, S3-compatible bucket in production) is provisioned; Docker is available on the API host (or a dedicated worker host) for Phase 4's sandbox.

### MVP 3 — Phase 1: CV Upload & Text Extraction

**Goal:** A user can upload an existing CV (PDF/DOCX) and have its raw text stored.

**Database:**

```sql
create table cvs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade not null,
  label text not null,              -- "Full-Stack Developer", "DevOps", etc.
  source text not null default 'uploaded', -- 'uploaded' | 'built' (set in Phase 5)
  file_url text,
  parsed_text text,
  is_default boolean default false,
  created_at timestamptz default now()
);
alter table jobs add column cv_id uuid references cvs(id);
```

**Backend:** `POST /cvs` (upload, extract text via `pdf-parse`/`mammoth`, validate real file type/size server-side — never trust the client's claimed MIME type), `GET /cvs`, `PATCH /cvs/:id` (rename/set default), `DELETE /cvs/:id`.

**Frontend:** `/profile/cvs`: list, upload, default toggle, delete; CV dropdown added to Add Job / Job Details (reuses the `cv_id` field).

> ✅ **Done when:** uploading a PDF or DOCX CV stores both the file and its extracted text, and a user can manage multiple CVs with one marked default.

### MVP 3 — Phase 2: CV Parsing — Rule-Based (Free) + AI-Assisted (Pro)

**Goal:** Turn the raw text from Phase 1 into structured fields. Two tiers, same output shape, so nothing downstream (Phase 5's form, MVP2's match enrichment) cares which one ran.

**Database:**

```sql
alter table cvs
  add column structured_data jsonb,       -- { fullName, email, phone, experience[], education[], skills[] }
  add column parse_method text,           -- 'rule_based' | 'ai'
  add column parse_status text not null default 'pending',  -- 'pending' | 'parsed' | 'partial' | 'failed'
  add column parsed_at timestamptz;
```

#### 2a — Rule-based parser (free, default for every tier)

No AI call, no cost, runs synchronously on upload.

**`CvRuleParserService.parse(text)` tasks:**

- **Contact info:** regex for email (`[\w.+-]+@[\w-]+\.[\w.-]+`), phone (a permissive international pattern), and LinkedIn/portfolio URLs.
- **Section detection:** scan for common header keywords (Experience/Expérience, Education/Formation, Skills/Compétences, case-insensitive, matched against a maintained keyword list rather than hardcoded English-only strings — this also sets up MVP7's French support later) and split the text into sections at those boundaries.
- **Experience/education entries within a section:** split on blank lines or bullet markers, then pull a date range via regex (`\b(19|20)\d{2}\b` pairs, "Present"/"Présent") from each entry — title/company/description stay as the raw entry text rather than being further decomposed, since reliably splitting "Title at Company" without AI is unreliable.
- **Skills:** split the skills section on commas/bullets/newlines into a flat list.
- Set `parse_method = 'rule_based'`. If section detection finds nothing recognizable (no headers matched), set `parse_status = 'failed'` rather than returning an empty-looking structure — triggers the Phase 1 plain-text fallback.
- If some sections parse and others don't, use `parse_status = 'partial'` and only fill the fields that were found — never fabricate a field that wasn't in the text.

**Frontend:** same structured preview as before, with a note when `parse_method = 'rule_based'` ("Didn't catch everything? Pro parsing handles unusual formats better.") — this is also where Phase 2b's upgrade path surfaces.

> ✅ **Done when:** a cleanly-formatted single-page CV with standard section headers parses correctly with zero AI calls, and a CV with no recognizable headers fails cleanly into the plain-text fallback rather than returning garbage.

#### 2b — AI-assisted parser (Pro tier, MVP5 Phase 3 gates this)

For CVs the rule-based parser can't handle well — creative layouts, multi-column PDFs, unconventional section naming.

**Tasks:** `CvAiParserService.parse(text)` sends `parsed_text` through `AiModule` with a prompt requesting the same JSON shape as 2a, Zod-validated before storing; sets `parse_method = 'ai'`; enforces the Phase 0 AI-call cap. `POST /cvs/:id/parse?method=ai` triggers it explicitly — never silently, since it costs money and counts against the cap.

**Frontend:** a **[ Try AI Parsing ]** button shown when the rule-based result is partial/failed, or always available to Pro+ users as a one-click re-parse; gated by `PlanGuard` (MVP5 Phase 1) once billing exists — before MVP5 ships, it's available to everyone since there's no plan system yet to gate it with.

> ✅ **Done when:** running AI parsing on a CV the rule-based parser handled poorly produces a visibly more complete structured result, and a free-plan user (post-MVP5) is blocked from triggering it with a clear upgrade prompt.

### MVP 3 — Phase 3: Admin LaTeX Template Management

**Goal:** Admins author and manage the CV templates users can build from.

**Database:**

```sql
create table cv_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  preview_image_url text,
  latex_source text not null,   -- {{placeholder}} syntax, admin-authored only
  language text not null default 'en',  -- used by MVP7's localization
  is_active boolean default true,
  created_by uuid references users(id),
  created_at timestamptz default now()
);
```

**Backend:** `POST/GET/PATCH/DELETE /admin/cv-templates`, gated by `RolesGuard('ADMIN')` (MVP1 Phase 7). `latex_source` is only ever written by an admin — never accepted from a user-facing endpoint. Define a small, fixed placeholder set (`{{fullName}}`, `{{headline}}`, `{{experience}}`, `{{education}}`, `{{skills}}`, etc.) and document it — don't let templates embed arbitrary macros beyond this set.

**Frontend (admin panel, MVP1 Phase 7 area):** template list, `.tex` upload/edit, preview image, active toggle, and a **Preview** action that compiles the template with sample data through the real pipeline (Phase 4) before it can go active.

> ✅ **Done when:** an admin can add a template and see it correctly rendered via Preview before activating it.

### MVP 3 — Phase 4: Sandboxed Compilation Pipeline (Docker)

**Goal:** Compile a template + user data into a PDF, safely. This is where the two non-negotiable rules from the top of this MVP get implemented.

**Flow:**

```
Compile request → escape every field value → merge into template's {{placeholders}}
   → enqueue job (BullMQ + Redis) → worker container picks it up
   → pdflatex -no-shell-escape -interaction=nonstopmode -halt-on-error (inside the container, no network, 10–15s timeout)
   → PDF → file storage → status = ready (or failed, with a generic error message)
```

**1. Escaping (the actual defense).** Before any value is substituted into the `.tex` source, escape every LaTeX special character: `\ { } $ & # _ % ~ ^` (e.g. `&` → `\&`, `_` → `\_`, `%` → `\%`). Never string-concatenate raw user input into `.tex` source — this single function is what stops LaTeX injection; the container below is defense-in-depth on top of it, **not a replacement for it**.

**2. The Docker sandbox.** A minimal worker image, built and run like this:

```dockerfile
# worker/Dockerfile
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      texlive-latex-base texlive-latex-recommended texlive-fonts-recommended \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --no-create-home --uid 10001 texworker
USER texworker
WORKDIR /job

ENTRYPOINT ["pdflatex", "-no-shell-escape", "-interaction=nonstopmode", "-halt-on-error"]
```

**Notes:**

- `texlive-latex-base` + `-recommended` + `-fonts-recommended` is enough for standard CV templates — don't install `texlive-full`, it's unnecessarily large and pulls in packages you don't need.
- The container runs as a non-root user (`texworker`), never root.
- `-no-shell-escape` is always on — this is what stops a template or an escaped-but-still-malformed input from shelling out.

Run each compile job like this (from the NestJS worker process, via `dockerode` or a plain `docker run` shell-out with fixed, non-interpolated flags):

```bash
docker run --rm \
  --network none \
  --read-only \
  --tmpfs /job:rw,size=16m \
  --memory 256m --cpus 1 \
  --pids-limit 64 \
  --security-opt no-new-privileges \
  --cap-drop ALL \
  -v "$JOB_TEX_FILE":/job/input.tex:ro \
  jobtracker/latex-worker:latest /job/input.tex
```

- `--network none`: the container can't reach anything, ever.
- `--read-only` + a small tmpfs for `/job`: nothing persists after the container exits; there's no disk to tamper with.
- `--memory`/`--cpus`/`--pids-limit`: bounds a runaway or fork-bombing document.
- `--cap-drop ALL` + `--security-opt no-new-privileges`: no Linux capabilities beyond the bare minimum, no privilege escalation even if something inside the container is compromised.
- Wrap the whole `docker run` with a wall-clock timeout (10–15s) in the Node process that invokes it, and kill/`docker rm -f` the container if it's exceeded.

**3. Backend orchestration tasks:**

- `POST /cvs/build` (or similar) enqueues a BullMQ job with the escaped, merged `.tex` source.
- The worker pulls the job, writes it to a per-job temp file, runs the `docker run` command above, and reads back `/job/output.pdf` on success.
- On success: upload the PDF to file storage, mark the job record `status = 'ready'`. On failure: store a generic `error_message` — never surface raw pdflatex output to the user, since compiler logs can include internal file paths.
- Rate-limit generation per user separately from the AI-call cap — compiling is CPU/container-expensive, not AI-expensive.
- Wipe the per-job temp directory immediately after each run, success or failure.

> ✅ **Done when:** a template with fields containing `&`, `%`, `_`, and backslashes compiles with those characters rendered literally; a deliberately malicious field value (e.g. attempting `\input{/etc/passwd}` or `\write18{...}`) produces ordinary literal text in the PDF, not a compiler-level effect; and killing the API process mid-compile doesn't leave an orphaned, resource-holding container behind (confirm `docker ps` is clean after a forced timeout).

### MVP 3 — Phase 5: CV Builder UI & Generation Flow

**Goal:** The user-facing side of Phases 3–4.

**Database:**

```sql
create table generated_cvs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade not null,
  template_id uuid references cv_templates(id) not null,
  field_values jsonb not null,
  pdf_url text,
  status text not null default 'queued',  -- 'queued' | 'compiling' | 'ready' | 'failed'
  error_message text,
  created_at timestamptz default now()
);
```

**Frontend:**

- `/cv-builder`: template gallery (`preview_image_url`), pick one.
- A form pre-filled from the user's profile (MVP2 Phase 1) and a selected parsed CV (Phase 2), fully editable before generating.
- **[ Generate PDF ]** → status indicator (queued/compiling) → download link once ready, or a clear error if failed.
- Generated CVs appear in `/profile/cvs` alongside uploaded ones (`source = 'built'`) and can be set as a job's `cv_id` — one unified CV list, two ways to populate it.

> ✅ **Done when:** a user can go from template pick to a downloaded, correctly rendered PDF end-to-end.

### MVP 3 — Phase 6: Enrich AI Job Match with CV Data

**Goal:** Close the loop back to MVP2 — once a real CV exists, matching should use it.

**Tasks:**

- Extend `JobMatchService.computeMatch` (MVP2 Phase 2) to accept an optional `cvText`/`structuredData` argument, preferring it over bare profile skills when the job has a linked `cv_id`.
- No new endpoint needed — `POST /jobs/:id/match` just passes richer input when available.
- Re-run Phase 2's "Done when" check with a real CV linked to a job and confirm the match score reflects CV content, not just the profile's skill tags.

> ✅ **Done when:** linking a CV to a job and recomputing the match produces a visibly more detailed/accurate result than the profile-only version from MVP2.

### MVP 3 — Phase 7: Hardening

**Tasks:**

- Cross-user isolation tests on `/cvs/*`, `/admin/cv-templates/*`, and the build/generate endpoints.
- File upload hardening: size limits, real MIME validation, storage outside the web root.
- **LaTeX injection test suite** — a fixed set of adversarial field values (command injection attempts, `\input`, `\write18`, deeply nested braces, extremely long strings) run through the real pipeline on every CI run, asserting the output is always literal text or a clean failure, never a compiler exploit or a hung container.
- Container escape hygiene: confirm `--network none` and `--read-only` are actually applied (not just configured) by inspecting a running job's container during a test compile.
- Confirm a hung/forced-timeout compile never leaves an orphaned container (see Phase 4's Done-when).

> ✅ **Done when:** the injection test suite passes and a manual container inspection during a test job confirms no network access and a read-only filesystem.

### MVP 3 — Phase 8: Rollout

**Tasks:** feature-flag if rolling out gradually; update the privacy policy (CV content is sent to a third-party AI provider for parsing); smoke-test the full loop on production: upload → parse → correct a field → pick a template → generate → download → link to a job → see an improved match score.

> ✅ **Done when:** that full walkthrough works on production with nothing from MVP1/MVP2 regressed.

---

# 🟣 MVP 4 — Cover Letter Builder

> **Product promise:** A tailored cover letter draft for any job, in seconds — always reviewed and edited by the user before it's considered final.

### MVP 4 — Phase 0: Prerequisites

**Checklist:** MVP2's `AiModule` is working; MVP3's CV data (structured or plain-text) is available to pull context from; MVP3's Docker LaTeX sandbox exists if you want PDF export (Phase 2) — the plain-text draft (Phase 1) works without it.

### MVP 4 — Phase 1: AI Cover Letter Generation

**Goal:** Generate an editable, job-specific draft.

**Database:**

```sql
create table cover_letters (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade not null,
  content text not null,
  generated_at timestamptz default now(),
  edited boolean default false
);
```

**Backend:** `CoverLetterService.generate(job, profile, cvText)` — prompt built from job title/company/description + the user's profile (MVP2) and CV text (MVP3), returns plain-text prose (not JSON, unlike the match service). `POST /jobs/:id/cover-letter` generates and stores a draft, enforces the AI-call cap. `GET /jobs/:id/cover-letters`, `PATCH /cover-letters/:id` (edits persist, `edited = true`), `DELETE /cover-letters/:id`. Strip/escape anything echoed back from the job description before rendering (same XSS discipline as MVP1 Phase 6).

**Frontend:** in Job Details, **[ Generate Cover Letter ]** → loading → editable textarea with Save/Discard/Regenerate. Clearly labeled as an AI draft to review and personalize — **never auto-sent or auto-attached anywhere**. Keep prior drafts so regenerating doesn't destroy an edited version without confirmation.

> ✅ **Done when:** generating for a real job produces a coherent, job-specific draft, edits persist, and regenerating never silently overwrites an edited draft.

### MVP 4 — Phase 2: LaTeX Cover Letter Templates (Optional PDF Export)

**Goal:** Let the user export a cover letter as a polished PDF using the same admin-template + sandbox infrastructure already built in MVP3, instead of standing up a second pipeline.

**Tasks:**

- Extend `cv_templates` (MVP3 Phase 3) with a `template_type` column (`'cv' | 'cover_letter'`), or add a parallel `cover_letter_templates` table if you'd rather keep the admin UI fully separate — either is fine; reusing one table with a type column is the leaner option given it's the same compile pipeline either way.
- Admin authors cover-letter `.tex` templates with a smaller placeholder set (`{{fullName}}`, `{{date}}`, `{{companyName}}`, `{{bodyText}}`).
- Generation reuses MVP3 Phase 4's compilation pipeline exactly — same escaping function, same Docker sandbox, same job queue. No new security surface is introduced here; this phase is purely wiring, not new infrastructure.
- `generated_cvs` (MVP3 Phase 5) gains a sibling `generated_cover_letters` table with the same shape (`template_id`, `field_values`, `pdf_url`, `status`, `error_message`).
- **Frontend:** on a generated/edited cover letter, an optional "Export as PDF" action → template picker (cover-letter templates only) → same queued/compiling/ready flow as the CV Builder.

> ✅ **Done when:** a user can export an edited cover letter draft as a correctly formatted PDF, using the exact same sandbox guarantees validated in MVP3 Phase 7 — no separate injection test suite needed here since nothing new was built, but re-run MVP3's suite against the cover-letter template path as a regression check.

### MVP 4 — Phase 3: Pairing Cover Letters with Job Applications

**Goal:** Make it obvious which cover letter (and which CV) went with which application.

**Tasks:**

- `jobs` already has `cv_id` (MVP3 Phase 1); add `cover_letter_id uuid references cover_letters(id)`.
- `PATCH /jobs/:id` accepts `cover_letter_id`.
- Job Details shows both the CV used and the cover letter used, with links to view/edit either.

> ✅ **Done when:** a job's details page clearly shows both artifacts used for that specific application, and changing either updates correctly.

### MVP 4 — Phase 4: Hardening

**Tasks:** cross-user isolation tests on `/jobs/:id/cover-letter*` and the export endpoints; confirm the AI-call cap and the compile rate limit both apply correctly to cover-letter actions (they share the caps with CV generation — don't let one feature's usage silently exempt the other from the same limits).

> ✅ **Done when:** you've tried to break the new endpoints and nothing leaks cross-user data or bypasses the shared usage caps.

### MVP 4 — Phase 5: Rollout

**Tasks:** feature-flag if rolling out gradually; smoke-test on production: generate a draft → edit it → export as PDF → attach both CV and cover letter to a job → confirm both show correctly on the job's details page.

> ✅ **Done when:** that walkthrough works on production with MVP1–3 unaffected.

---

# 💰 MVP 5 — Monetization

> **Product promise:** The free tier is genuinely useful on its own; Pro and Premium gate the expensive, AI/compilation-heavy features that now exist thanks to MVP2–4.

This MVP comes right after the CV Builder (MVP3) and Cover Letter Builder (MVP4) on purpose — they're the strongest paid features, and billing logic built before they existed would have nothing real to gate.

### MVP 5 — Phase 0: Planning & Tiers

Decide the tiers up front:

| Tier | Price | Includes |
| --- | --- | --- |
| **Free** | $0 | Extension, Kanban, manual + auto-detected capture, up to ~50 tracked jobs, basic stats |
| **Pro** | ~$5–10/month | Unlimited tracked jobs, AI job matching, AI-assisted CV parsing (free tier gets rule-based parsing), multiple CVs, follow-up reminders, full analytics, company history |
| **Premium** | ~$15/month | Everything in Pro + the CV Builder, Cover Letter Builder (incl. PDF export), Application Memory, duplicate/similar detection, job comparison, the Advanced Application Assistant |

**Decisions:** Stripe Checkout + webhooks (not custom billing logic); monthly billing to start, annual later if demand shows up; the free tier's 50-job cap is a simple count check, not a plan-gated feature per se — it's the one limit that applies even to Free.

### MVP 5 — Phase 1: Plan Data Model & Guard

**Database:**

```sql
alter table users
  add column plan text not null default 'free',  -- 'free' | 'pro' | 'premium'
  add column plan_renews_at timestamptz,
  add column stripe_customer_id text;
```

**Backend:** a `PlanGuard` (parallel to MVP1's `RolesGuard`) + a `@RequiresPlan('pro')` decorator, checked server-side on every gated route — never trust a plan value from the client. Admins (MVP1 Phase 7) bypass plan checks entirely.

> ✅ **Done when:** a manually-set plan value on a test user correctly allows/blocks the right routes.

### MVP 5 — Phase 2: Stripe Integration

**Tasks:**

- `POST /billing/checkout` creates a Stripe Checkout session for the chosen plan, redirects the user to Stripe.
- `POST /billing/webhook` handles `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted` — updates plan/`plan_renews_at` accordingly. **Verify the Stripe signature on every webhook call; reject anything that doesn't verify.**
- `POST /billing/portal` creates a Stripe Customer Portal session for self-service plan changes/cancellation.
- Store `stripe_customer_id` on first checkout; never create a duplicate Stripe customer for the same user.

> ✅ **Done when:** a full test-mode subscribe → webhook updates plan → downgrade/cancel → webhook reverts to free cycle works end-to-end against Stripe's test environment.

### MVP 5 — Phase 3: Feature Gating Across the Product

**Goal:** Apply `PlanGuard` consistently to every feature from MVP2–4.

**Tasks:**

- Gate `/jobs/:id/match`, `/cvs/:id/parse` behind **pro**.
- Gate `/cvs/build` (MVP3 Phase 5), `/jobs/:id/cover-letter` + export (MVP4), `/companies/:name/history`, `/jobs/:id/similar`, `/jobs/:id/assistant/*` (MVP6) behind **premium**.
- Enforce the free tier's 50-job cap on `POST /jobs`.
- Return a clear, consistent "upgrade required" response shape from every gated route, so the frontend can show one reusable upgrade prompt rather than custom handling per feature.

> ✅ **Done when:** a free-plan test user is correctly blocked from every Pro/Premium route with a clear response, and a pro user is correctly blocked from Premium-only routes.

### MVP 5 — Phase 4: Billing UI & Upgrade Flow

**Frontend tasks:**

- A `/billing` / Parameters section: current plan, renewal date, **[ Upgrade ]** / **[ Manage Billing ]** buttons (the latter opens the Stripe Customer Portal).
- Inline upgrade prompts at the moment a gated feature is blocked (e.g. "AI matching is a Pro feature" with a direct upgrade link), rather than only a generic pricing page.
- The free tier's job-count progress ("48/50 jobs saved") as a natural, non-nagging upgrade nudge.
- A public `/pricing` page comparing the three tiers.

> ✅ **Done when:** a user can go from a blocked feature to a completed Stripe checkout to that feature working, without leaving confused at any step.

### MVP 5 — Phase 5: Hardening

**Tasks:**

- **Webhook idempotency** — Stripe can resend events; handle duplicate `event.id`s without double-applying a plan change.
- Confirm a lapsed/canceled subscription correctly downgrades access (not just the displayed plan label) on the next relevant check, not just at webhook time.
- Cross-user isolation on `/billing/*` — a user can never trigger a checkout or portal session for another user's Stripe customer.
- Load-test that `PlanGuard` checks don't noticeably slow down the hot paths (Kanban, job list) — cache the plan on the request's JWT claims if the extra DB lookup becomes measurable, re-validating on each token refresh.

> ✅ **Done when:** you've tried to break billing (replayed webhooks, a canceled sub that should lose access, cross-user portal access) and nothing grants unpaid access or double-charges.

### MVP 5 — Phase 6: Rollout

**Tasks:** switch Stripe from test to live mode; update the privacy policy and terms with billing/payment data handling; smoke-test one real low-value subscription end-to-end in production before announcing pricing publicly.

> ✅ **Done when:** a real payment, a real webhook, and real feature access all line up correctly in production.

---

# 🟣 MVP 6 — Job Application Memory & Advanced Intelligence

> **Product promise:** The extension becomes a personal memory for the user's entire job search, not just a logger.

Builds on MVP2's matching, MVP3's CV data, and MVP4's cover letters — the Advanced Assistant (Phase 5) now genuinely orchestrates real features instead of being a placeholder.

### MVP 6 — Phase 0: Prerequisites

**Checklist:** MVP2 (matching), MVP3 (CVs), MVP4 (cover letters) all stable in production. **Decide the autonomy boundary now, in writing, before building anything:** every feature in this MVP that touches AI or automation surfaces information or a draft for the user to review — none of them submit, send, or act on the user's behalf without an explicit confirm click. This mirrors MVP1's "never auto-submit applications" rule. Write it into AGENTS.md so no later phase quietly crosses it.

### MVP 6 — Phase 1: Application Memory

**Goal:** Surface prior interactions with a company immediately when a job for that company is opened — in the extension, not just the website.

**Backend:** `GET /companies/:name/history?excludeJobId=` — prior applications: title, date, outcome. Extend the extension's job-detection response (MVP1 Phase 4) with this lookup.

**Extension/Frontend:** a compact history card in the popup and in Job Details ("You applied here before — [Title], [date], [status]"); if the prior result was REJECTED, show it neutrally — information, not a recommendation.

> ✅ **Done when:** opening a posting for a company with prior history shows it correctly in the extension popup with no extra click.

### MVP 6 — Phase 2: Duplicate Job Detection

**Goal:** Flag resurfaced postings instead of silently duplicating them.

**Backend:** on save, check for the same `url`, or a fuzzy match on normalized `(company, title)` within a configurable window (e.g. 90 days) using `fast-levenshtein`/`string-similarity`. Return a 409-style response with the existing job's info rather than creating a new row.

**Extension/Frontend:** "You may have already saved this job" prompt with a link to the existing card; "No, this is different" to save anyway.

> ✅ **Done when:** an exact-URL resave is blocked, and a reposted listing (new URL, same company/title) within the window is flagged, not silently duplicated.

### MVP 6 — Phase 3: Similar Job Detection

**Goal:** Surface saved/applied jobs with overlapping requirements.

**Backend:** `SimilarJobsService` using skill-set overlap (Jaccard similarity) on the skills already extracted during matching (MVP2/MVP3) — no new embeddings pipeline. `GET /jobs/:id/similar` returns the top 3–5 with a similarity indicator.

**Frontend:** a read-only "Similar jobs you've saved" panel — no "better/worse" judgment implied.

> ✅ **Done when:** a newly viewed job surfaces genuinely related prior jobs, or nothing when there isn't enough data — never a forced/irrelevant match.

### MVP 6 — Phase 4: Job Comparison View

**Goal:** Compare 2–4 jobs side by side as information, not a recommendation engine.

**Frontend:** a "Compare" selection mode on Kanban/Companies; a table of match score, matched/missing skills, salary, location, status, source. No ranking label — consistent with the Phase 0 autonomy boundary.

> ✅ **Done when:** selecting several jobs produces an accurate side-by-side table.

### MVP 6 — Phase 5: Advanced Application Assistant

**Goal:** Chain detect → match → pick CV → draft cover letter → track → set follow-up into one guided flow, with a mandatory human review step.

**Backend:** `ApplicationAssistantService.prepare(jobId)` orchestrates the real `JobMatchService` (MVP2/3), a CV-selection step (highest skill overlap among the user's CVs from MVP3, or their default), and `CoverLetterService` (MVP4) — returns a bundled "application packet" **without** changing the job's status or saving anything as final. `POST /jobs/:id/assistant/accept` is the only endpoint that commits the CV selection and cover letter, and only after the user has reviewed the packet.

**Frontend:** a guided panel — "Prepare Application" → match score, suggested CV (changeable), editable cover letter draft → **[ Review & Accept ]**. Nothing persists until Accept. After acceptance, offer to confirm the follow-up reminder (MVP2 Phase 3) as the last step.

> ✅ **Done when:** running the assistant produces a sensible packet, nothing persists before Accept, and the accepted CV/cover letter match exactly what was reviewed.

### MVP 6 — Phase 6: Expanded Platform Support

**Goal:** Broaden beyond LinkedIn/Indeed/generic (MVP1 Phase 4).

**Tasks:** add 2–3 more parsers based on real extraction-failure logging (MVP1 Phase 6) — e.g. Glassdoor, Wellfound; follow the existing `parsers/<site>.ts` pattern; extend MVP1 Phase 5's application-detection per platform where a confirmation pattern exists, else rely on the manual fallback; update `host_permissions` incrementally and re-justify them in the Chrome Web Store listing.

> ✅ **Done when:** each new platform correctly extracts title/company/location on real postings, with the same manual-fallback safety net.

### MVP 6 — Phase 7: Hardening, Privacy & Safety Guardrails

**Tasks:**

- Cross-user isolation tests on every new endpoint (`/companies/:name/history`, `/jobs/:id/similar`, `/jobs/:id/assistant/*`).
- Confirm duplicate/similarity checks only ever compare a user's own jobs against their own — never across accounts.
- Audit every AI-assisted feature against the Phase 0 autonomy boundary and write the check into the test suite, not just documentation.
- Extend the privacy policy for company-history matching, duplicate/similarity detection, and the Assistant.
- Re-check AI cost caps now that the Assistant can trigger multiple AI calls (match + cover letter) in one flow — rate-limit the whole flow, not just its individual calls.

> ✅ **Done when:** you've tried to find a path where a feature here acts without explicit confirmation or leaks data across users, and found none.

### MVP 6 — Phase 8: Rollout

**Tasks:** feature-flag if rolling out gradually; update onboarding/tips; smoke-test end-to-end: reopen a known company → see history → save a near-duplicate → get flagged → view similar jobs → compare two → run the Assistant → accept → reminder set.

> ✅ **Done when:** that walkthrough works on production with nothing from MVP1–5 regressed.

---

# 🔵 MVP 7 — Design Enhancement & Language Support

> **Product promise:** The same product, polished and fully usable in English or French — applied as one pass across everything built in MVP1–6, not redone piecemeal along the way.

This is deliberately last: it's a cross-cutting pass over the Kanban, the CV Builder, the Cover Letter Builder, the admin panel, and the billing UI alike. Doing it earlier would mean redoing it every time a new MVP added screens.

### MVP 7 — Phase 0: Design System Foundations

**Tasks:**

- Design tokens as CSS variables: a refined neutral palette + one brand accent, consistent radius, a spacing scale, soft layered shadows instead of heavy borders.
- One quality font via `next/font` (Inter, Geist, or Plus Jakarta Sans), a clear type scale, tabular numbers for stats.
- Replace ad-hoc icons with one icon set (`lucide-react`) everywhere — Kanban, admin, CV Builder, billing.
- Dark mode (`next-themes`) with tokens defined for both themes.

> ✅ **Done when:** every screen across MVP1–6 pulls from the same token set — no page with its own one-off colors or spacing.

### MVP 7 — Phase 1: Sidebar & Navigation Animation

**Tasks:**

- Collapsible sidebar (expanded ↔ icon-only), animated with Framer Motion, state remembered in localStorage.
- Active-item indicator that slides between items via `layoutId`.
- Hover micro-interactions, staggered fade-in on first load.
- Mobile: sidebar becomes a slide-in drawer with a backdrop.
- Nav now includes entries for CV Builder, Cover Letter Builder, Billing, and Analytics — all added since MVP1's original sidebar.

> ✅ **Done when:** the sidebar collapses/expands smoothly with a gliding active indicator on desktop and works as a drawer on mobile, covering every section added through MVP6.

### MVP 7 — Phase 2: Page & Component Polish

**Tasks:**

- Page transitions (`AnimatePresence`), 150–250ms.
- Animated stat-card count-ups; hover lift.
- Kanban: smooth drag overlay, animated drop placement, column highlight, empty-column illustrations.
- CV Builder: animated template gallery, a polished "compiling…" state for Phase 4's queued/compiling/ready flow (MVP3).
- Billing: a clean plan-comparison layout, a tasteful upgrade prompt component reused everywhere a gated feature is blocked (MVP5 Phase 3).
- Loading states everywhere as skeleton screens shaped like the real content, not spinners.
- Toast notifications (`sonner`) for save/move/delete/undo/generate actions.
- A landing page covering the full product: Kanban, AI matching, CV Builder, Cover Letter Builder, pricing.

> ✅ **Done when:** every list has skeleton + empty states, and the CV Builder's generation flow and the billing upgrade flow both feel as polished as the Kanban.

### MVP 7 — Phase 3: Accessibility & Performance

**Tasks:** respect `prefers-reduced-motion`; animate only `transform`/`opacity`; keyboard navigation and visible focus rings everywhere, including Kanban's keyboard drag sensor; contrast checks in both themes; Lighthouse 90+ on Performance/Accessibility; lazy-load heavy routes (charts, admin, CV Builder) with dynamic imports.

> ✅ **Done when:** Lighthouse accessibility is 90+ across the Kanban, CV Builder, and billing pages.

### MVP 7 — Phase 4: i18n Planning

**Decisions:**

- `next-intl` for the web app, locale-prefixed routes (`/en`, `/fr`).
- NestJS responses with user-facing strings (error messages) go through a matching server-side dictionary, same keys as the frontend.
- **Scope boundary:** UI strings and admin-authored templates (CV, cover letter) are translated content; user-entered data (job titles, notes, CV/cover-letter text) is **never auto-translated** — localize the app, not the user's own words.

**Database:**

```sql
alter table users add column locale text not null default 'en';
```

> ✅ **Done when:** the scope boundary is written into AGENTS.md before translation work starts.

### MVP 7 — Phase 5: Web App UI Translation

**Tasks:** extract every hardcoded string across MVP1–6's pages into `messages/en.json` / `messages/fr.json`, including the admin panel, billing, and CV/Cover Letter Builders added since MVP1; a language switcher persisting to `users.locale`; locale-aware date/number formatting; missing-key fallback to English rather than a blank or broken UI.

> ✅ **Done when:** switching languages reflows the entire app — Kanban, admin, CV Builder, billing — into French with no untranslated strings, and a deliberately-missing key falls back cleanly to English.

### MVP 7 — Phase 6: Template & AI Content Localization

**Tasks:**

- Use `cv_templates.language` (MVP3 Phase 3) and the cover-letter templates' equivalent (MVP4 Phase 2) to show only the user's locale's templates in the CV Builder and Cover Letter export gallery.
- Pass `locale` into the AI prompts for job matching (MVP2 Phase 2) and cover letter generation (MVP4 Phase 1) so matched/missing skill labels and generated drafts come back in the right language.
- Admin template management gets a language filter and a "Duplicate as…" action to help admins create a French variant from an English template.

> ✅ **Done when:** a French-locale user sees only French templates, generates a French cover letter, and sees match-skill labels in French.

### MVP 7 — Phase 7: Extension Localization

**Tasks:** the extension reads `locale` from the authenticated web session (MVP1 Phase 4's extension-login flow); localize the popup's static strings and detection-related messages; job data scraped from job sites is **never translated** — only the extension's own UI chrome.

> ✅ **Done when:** a French-locale user sees a French popup when saving jobs, with job capture itself unaffected.

### MVP 7 — Phase 8: Hardening & Rollout

**Tasks:**

- Have legal/compliance pages (privacy policy, terms, pricing) reviewed by a native French speaker, not just the AI-assisted first translation pass used for product strings.
- Confirm locale switching doesn't affect auth or data scoping — a regression pass against the cross-user isolation tests from every prior MVP is enough; no new isolation logic is introduced here.
- Add new locale strings to CI/lint so a future PR adding UI text without a translation key fails the build.
- Final full-product smoke test in French: register → set locale → build a French CV from a French template → get a French cover letter → upgrade to Premium → see the French billing page → everything else from MVP1–6 still works, in French.

> ✅ **Done when:** that full French walkthrough passes on production, and the English walkthrough from every prior MVP still passes unchanged.

---

## 🗺️ Full Roadmap Recap

```
MVP 1 (0–12)   Capture → Kanban → Admin → Dashboard home → Google auth → CAPTCHA → Premium UI pass* → Deploy
MVP 2 (0–7)    Profile → AI Match (typed skills) → Reminders → Analytics → Company History → Harden → Rollout
MVP 3 (0–8)    CV Upload/Parse → Admin LaTeX Templates → Docker Sandbox Compiler → CV Builder UI →
               Match Enrichment → Harden → Rollout
MVP 4 (0–5)    AI Cover Letters → LaTeX Export (reuses MVP3 sandbox) → CV+Letter Pairing → Harden → Rollout
MVP 5 (0–6)    Tiers → Plan Model/Guard → Stripe → Feature Gating → Billing UI → Harden → Rollout
MVP 6 (0–8)    App. Memory → Duplicate Detection → Similar Jobs → Comparison → Advanced Assistant →
               Expanded Platforms → Harden/Privacy → Rollout
MVP 7 (0–8)    Design Tokens → Sidebar Animation → Component Polish → A11y/Perf →
               i18n Planning → Web UI Translation → Template/AI Localization → Extension i18n → Rollout
```

<sup>\*MVP1 Phase 11's premium-UI pass is the first design iteration; MVP7 is the full, product-wide version once every later MVP's screens exist.</sup>

> **The rule that applies at every stage, unchanged since MVP1:** don't start the next MVP until the current one's "done when" checkpoints are genuinely true in production — not just locally, not just in the happy path.
