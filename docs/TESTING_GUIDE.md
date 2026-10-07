# Job Tracker — Full Testing Guide (Phases 1–10)

How to verify every feature end to end. Run the automated suites first (fast, catches
most regressions), then the manual scenarios for the flows you touched.

Endpoints are served under the global prefix `api`. Ports:

| Service  | URL                       | Notes                                   |
| -------- | ------------------------- | --------------------------------------- |
| Frontend | http://localhost:3001     | Next.js dev, proxies `/api/*` to backend |
| Backend  | http://localhost:3000/api | NestJS                                   |
| Postgres | localhost:5432            | db `jobtracker`, user `postgres`         |
| pgAdmin  | http://localhost:5050     |                                          |

---

## 0. Prerequisites — boot the stack

```bash
cd "<repo root>"
docker compose up -d            # postgres + backend + front (+ pgadmin)
docker compose ps               # all should be Up / healthy
docker compose logs backend --tail 20   # expect: "Backend running on http://localhost:3000/api"
```

Health check:

```bash
curl -i http://localhost:3000/api        # Phase 1-2: 200 OK
```

> After editing **backend** source, `nest --watch` does not reliably detect bind-mount
> changes on Docker Desktop (Windows). Run `docker compose restart backend`.
> After editing `docker-compose.yml` `environment:`, run `docker compose up -d`
> (recreate), not just restart.

---

## 1. Automated test suites (run these every time)

```bash
# Backend (NestJS + Jest): unit + integration, 121 tests
cd backend && npm test
# Turnstile/CAPTCHA only:
cd backend && npx jest src/auth/turnstile
# Coverage:
cd backend && npm run test:cov

# Extension (Chrome MV3 + Vitest): parsers + save flow
cd extension && npm test
cd extension && npm run typecheck

# Frontend (Next.js): type check (no test runner configured)
cd front && npx tsc --noEmit
```

All green = Phases 3–10 logic (auth, jobs, validation, dedup, admin, dashboard,
Google OAuth, CAPTCHA) is internally consistent.

---

## 2. Auth — register / login / refresh / logout / me (Phases 3–4)

Base URL `http://localhost:3000/api`. `turnstileToken: "XXXX.DUMMY.TOKEN"` is
Cloudflare's always-pass test token (see Phase 10).

```bash
# Register (expect 201 + accessToken)
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"user1@example.com","password":"secret123","turnstileToken":"XXXX.DUMMY.TOKEN"}'

# Login (expect 200 + accessToken, sets refreshToken cookie)
curl -s -i -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user1@example.com","password":"secret123","turnstileToken":"XXXX.DUMMY.TOKEN"}'

# Save the access token, then:
TOKEN="<accessToken>"

# /me (expect 200 with your user)
curl -s http://localhost:3000/api/auth/me -H "Authorization: Bearer $TOKEN"

# Refresh (expect 200, rotates the refresh cookie)
curl -s -i -X POST http://localhost:3000/api/auth/refresh   # uses the httpOnly cookie

# Logout (expect 200, clears cookie)
curl -s -i -X POST http://localhost:3000/api/auth/logout -H "Authorization: Bearer $TOKEN"
```

**Security checks:**
- Wrong password → **401 "Invalid credentials"** (generic — must NOT reveal whether the email exists).
- Duplicate email on register → **4xx** with a generic message.
- `/me` with no/garbage token → **401**.
- Password < 6 chars on register → **400** (Zod validation).

**Browser:** `/register` then `/login` then confirm redirect to `/dashboard`; log out returns to `/login`.

---

## 3. Rate limiting (Phase 3/4 + Phase 10)

Global throttle is 60 req/60s. Admin login is tighter: **5/60s**.

```bash
# Hammer admin login 6+ times rapidly → 6th should be 429 Too Many Requests
for i in $(seq 1 7); do
  curl -s -o /dev/null -w "%{http_code} " -X POST http://localhost:3000/api/admin/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"x@y.z","password":"whatever1","turnstileToken":"XXXX.DUMMY.TOKEN"}'
done; echo
```

---

## 4. Jobs CRUD (Phase 4)

Requires a user `Authorization: Bearer $TOKEN`.

```bash
# Create
curl -s -X POST http://localhost:3000/api/jobs -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Frontend Dev","company":"Acme","url":"https://acme.com/job/1","status":"SAVED"}'

# List (only YOUR jobs)
curl -s http://localhost:3000/api/jobs -H "Authorization: Bearer $TOKEN"

# Get one
curl -s http://localhost:3000/api/jobs/<id> -H "Authorization: Bearer $TOKEN"

# Update
curl -s -X PATCH http://localhost:3000/api/jobs/<id> -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"title":"Senior Frontend Dev"}'

# Change status
curl -s -X PATCH http://localhost:3000/api/jobs/<id>/status -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"status":"APPLIED"}'

# Delete
curl -s -X DELETE http://localhost:3000/api/jobs/<id> -H "Authorization: Bearer $TOKEN"
```

**Validation / security (Phase 6):**
- Missing required fields / bad enum status → **400** with field messages (Zod).
- **Isolation:** with a second user's token, `GET /jobs/<id>` of user1's job → **404/403** (never leaks another user's row).
- **SQL injection:** `PATCH /jobs/<id>` with `{"title":"'; DROP TABLE jobs;--"}` → stored as a literal string, table intact (parameterized queries).
- **Duplicate prevention (Phase 6):** create the same `url` twice → second is deduped (upsert / unique index), no duplicate row.
- **Server logging:** a deliberately malformed save attempt logs server-side (check `docker compose logs backend`).

**Browser:** `/dashboard/jobs` — create, edit, drag to reorder (dnd-kit), change status, delete; empty/loading/error states render.

---

## 5. Chrome extension (Phases 4–6)

```bash
cd extension && npm run build     # produces dist/
```

1. Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → select `extension/dist`.
2. Pin the extension, open its popup.
3. **Parser test (Phase 5):** visit a LinkedIn / Indeed / generic job posting → popup auto-detects title+company (JSON-LD / site parsers). Confirm fields populate.
4. **Save flow:** click Save → job appears under `/dashboard/jobs` for the logged-in user.
5. **Login bridge (Phase 4):** if not logged in, popup routes you to `/extension-login` on the web app; after signing in, return to the extension and save works.
6. **Application detection (Phase 5):** on a supported "applied" confirmation page, detection marks the job APPLIED; the popup's **[Mark as Applied]** manual fallback works when auto-detection can't.
7. **No match (Phase 6):** on a random page, popup shows the "no job detected" state (not a crash).

> The extension intentionally has **no CAPTCHA** (Phase 10 excludes it).

---

## 6. Admin area (Phase 7 + dual-session Phase 7/8)

Seed an admin (env-driven, never hardcode secrets):

```bash
# set in root .env or inline:
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=secret123 ADMIN_NAME=Admin \
  docker compose exec -T backend npm run seed:admin
```

Admin auth (separate scope — `adminRefreshToken` cookie):

```bash
curl -s -i -X POST http://localhost:3000/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"secret123","turnstileToken":"XXXX.DUMMY.TOKEN"}'
ATOKEN="<admin accessToken>"

curl -s http://localhost:3000/api/admin/auth/me -H "Authorization: Bearer $ATOKEN"
curl -s http://localhost:3000/api/admin/stats -H "Authorization: Bearer $ATOKEN"
curl -s http://localhost:3000/api/admin/users -H "Authorization: Bearer $ATOKEN"
curl -s http://localhost:3000/api/admin/audit-logs -H "Authorization: Bearer $ATOKEN"

# Invite an admin
curl -s -X POST http://localhost:3000/api/admin/invites -H "Authorization: Bearer $ATOKEN" \
  -H "Content-Type: application/json" -d '{"email":"admin2@example.com"}'

# User management
curl -s -X PATCH http://localhost:3000/api/admin/users/<id>/status -H "Authorization: Bearer $ATOKEN" \
  -H "Content-Type: application/json" -d '{"status":"SUSPENDED"}'
curl -s -X PATCH http://localhost:3000/api/admin/users/<id>/role -H "Authorization: Bearer $ATOKEN" \
  -H "Content-Type: application/json" -d '{"role":"ADMIN"}'
curl -s -X DELETE http://localhost:3000/api/admin/users/<id> -H "Authorization: Bearer $ATOKEN"

# Admin view/delete any job
curl -s http://localhost:3000/api/admin/jobs -H "Authorization: Bearer $ATOKEN"
curl -s -X DELETE http://localhost:3000/api/admin/jobs/<id> -H "Authorization: Bearer $ATOKEN"
```

**RBAC / security checks:**
- A normal **USER** token hitting any `/api/admin/*` route → **403 Forbidden** (RolesGuard).
- Unauthenticated `/api/admin/*` → **401**.
- Suspending a user then having them call `/api/jobs` → blocked (suspended check in JWT/session).
- Every admin mutation writes an **audit log** row → verify via `/api/admin/audit-logs`.
- `/admin/register` requires a valid **invite** (no open admin self-signup).

**Dual session (key Phase 7/8 behaviour):** in one browser, log in as a normal user at
`/dashboard` AND as an admin at `/admin`. They use independent tokens/cookies
(`refreshToken` vs `adminRefreshToken`), so one must **not** log the other out. Refreshing
one session leaves the other intact.

**Browser:** `/admin/login` (dark theme + CAPTCHA) → panel: overview/stats, `users`,
`users/[id]`, `jobs`, `audit-logs`.

---

## 7. Dashboard summary + settings (Phase 8)

```bash
curl -s http://localhost:3000/api/dashboard/summary -H "Authorization: Bearer $TOKEN"
# expect counts by status (SAVED/APPLIED/INTERVIEW/...), totals
```

**Browser:**
- `/dashboard` home shows the summary cards. **Cold-load test:** hard-refresh `/dashboard`
  — the summary must NOT flash a 401 (DashboardGuard withholds children until the session
  restore finishes). In Network tab expect `refresh → me → summary`, all 2xx.
- `/dashboard/settings`:
  - Change password (`PATCH /api/users/password`) → old password required, new one works on next login.
  - Delete account (`DELETE /api/users/me`) → user + their jobs gone, session cleared.
  - Update profile (`PATCH /api/users/profile`).
  - Extension toggle/flag present.

---

## 8. Google OAuth (Phase 9)

Requires real Google creds (see below). Test keys do not apply here.

```bash
# Kick off the flow (redirects to Google)
curl -s -i http://localhost:3000/api/auth/google
# Callback is handled by Google → /api/auth/google/callback → sets cookies → redirects to /dashboard
```

**Browser:**
- `/login` and `/register` show **"Continue with Google"** (`GoogleButton`). Click → Google
  consent → lands on `/dashboard`, user created with `auth_provider=google`, `google_id`,
  `avatar_url`, nullable `password_hash`.
- An OAuth failure redirects back with `?error=...`; the register/login page surfaces the
  message (`readUrlError`).
- **Link/unlink:** `/dashboard/settings` → connected accounts. `DELETE /api/users/google`
  unlinks — but a user with **no password** and no Google link must be prevented from
  locking themselves out (null-hash guard).
- A Google user cannot be turned into a password login without setting one; `changePassword`
  relaxes the "old password" requirement for passwordless Google accounts.

**Env for Google (root `.env`, recreate backend+front):**
```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback
```
In Google Cloud Console: create OAuth **Web** credentials, add authorized redirect URI
`http://localhost:3000/api/auth/google/callback`.

---

## 9. Cloudflare Turnstile CAPTCHA (Phase 10)

Applied to `POST /api/auth/login`, `/api/auth/register`, `/api/admin/auth/login`.
**Not** on Google sign-in, **not** on the extension.

```bash
# A) No token → must be BLOCKED (400)
curl -i -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"x@y.z","password":"whatever1"}'
# → 400 "CAPTCHA verification failed"

# B) Always-pass dummy token → passes CAPTCHA (401 invalid creds is the CORRECT result)
curl -i -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"x@y.z","password":"whatever1","turnstileToken":"XXXX.DUMMY.TOKEN"}'
# → 401 (proves CAPTCHA passed, reached real auth)

# C) Full register happy path → 201 + accessToken
curl -i -X POST http://localhost:3000/api/auth/register -H "Content-Type: application/json" \
  -d '{"name":"Cap Ten","email":"cap@example.com","password":"secret123","turnstileToken":"XXXX.DUMMY.TOKEN"}'
```

**Fail-closed test (critical):** point `TURNSTILE_SECRET_KEY` at the always-fails secret
`2x0000000000000000000000000000000AA` (and site key `2x00000000000000000000AB`), then
`docker compose up -d backend`. Login/register must return **400 "CAPTCHA verification failed"**.
Unset the secret entirely → **503 "CAPTCHA verification unavailable"** — requests are
NEVER waved through when CAPTCHA is down.

**Interactive-challenge test:** set `NEXT_PUBLIC_TURNSTILE_SITE_KEY=3x00000000000000000000FF`,
`docker compose up -d front` (public key is inlined at build time) → widget shows a click-to-verify.

**Browser:** `/register`, `/login`, `/admin/login` render the widget. The submit button is
disabled / shows "Verifying…" until a token exists, then enables. After a failed login the
widget resets (a used token can't be replayed). With the default always-pass key it verifies
silently — that is normal, not a bug.

**Cloudflare test keys (public, documented — not secrets):**

| Behaviour          | Site key                     | Secret key                          |
| ------------------ | ---------------------------- | ----------------------------------- |
| Always passes      | `1x00000000000000000000AA`   | `1x0000000000000000000000000000000AA` |
| Always fails       | `2x00000000000000000000AB`   | `2x0000000000000000000000000000000AA` |
| Forces interactive | `3x00000000000000000000FF`   | (any)                               |

---

## 10. Cross-cutting security checklist (AGENTS.md §13)

- [ ] No secret/password/token is ever returned in a response body or logged.
- [ ] Generic auth errors (no "email exists" / "wrong password" distinction).
- [ ] All DB access is parameterized (SQL injection attempt stored as literal).
- [ ] User data isolation: user A cannot read/modify user B's jobs.
- [ ] RBAC: USER → 403 on `/admin/*`; unauthenticated → 401.
- [ ] Rate limits enforced (429 after threshold).
- [ ] CAPTCHA fails closed (400/503, never bypassed when misconfigured/down).
- [ ] Refresh cookies are httpOnly, correctly scoped (`refreshToken` vs `adminRefreshToken`), single-flight rotation (no orphaned tokens on cold load).
- [ ] Secrets live in the gitignored root `.env`, not committed.

---

## 11. Test-data cleanup

```bash
# Remove throwaway users created during testing (cascades to their jobs)
docker compose exec -T postgres psql -U postgres -d jobtracker \
  -c "DELETE FROM users WHERE email IN ('user1@example.com','cap@example.com','cap10test@example.com');"
```

> Note: the database is `jobtracker` (not `jobtracker_db`).

---

## 12. MVP3 — CV Builder & Parser (Phases 0–3)

> Restart the backend after any DDL change (`docker compose restart backend`) —
> `initSchema` only runs at boot, so new tables/columns appear then.

### Phase 0 — Prerequisites

```bash
# AI module + monthly cap work: fill profile headline/skills, add a job with a
# description → a match score appears (OpenRouter free tier; 429 is upstream).
# Local file storage: any upload below creates backend/uploads/cvs/.
# Docker on the host is only needed from Phase 4 (LaTeX sandbox).
docker compose ps          # backend/front/postgres Up
```

### Phase 1 — CV upload & text extraction

```bash
# Upload a real PDF and a .docx (UI: /dashboard/profile/cvs)
TOKEN=<user accessToken>
curl -X POST http://localhost:3000/api/cvs -H "Authorization: Bearer $TOKEN" \
  -F "file=@cv.pdf" -F "label=Full-Stack"      # 201, parse_status set
curl http://localhost:3000/api/cvs -H "Authorization: Bearer $TOKEN"        # list
curl http://localhost:3000/api/cvs/<id> -H "Authorization: Bearer $TOKEN"    # detail
curl -X PATCH http://localhost:3000/api/cvs/<id> -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"label":"Renamed","is_default":true}'
curl -X DELETE http://localhost:3000/api/cvs/<id> -H "Authorization: Bearer $TOKEN"

# Negative cases (each must be rejected, not silently accepted)
curl -X POST http://localhost:3000/api/cvs -H "Authorization: Bearer $TOKEN" \
  -F "file=@notes.txt;type=application/pdf"    # fake magic bytes → 400
head -c 6MB /dev/urandom > big.pdf             # over CV_MAX_SIZE_MB → 400
# Another user's CV id → 404; jobs.cv_id of another user's CV → 400/404
```

UI checks: rename, mark default (only one default per user), delete; CV dropdown
in Add Job / Job Details lists only your own CVs.

#### PDF text extraction (poppler)

PDFs are extracted with `pdftotext -layout`, not with the JS extractor. Word and
Google Docs exports store each word as its own text-showing operator with the
space implied by position, so a string-concatenating extractor yields
`SeniorFull-StackEngineer` and the parser then stops recognising section
headers — which is what pushes skills into Experience. `pdf-parse` is kept only
as a logged degraded fallback when the binary is missing.

```bash
docker exec jobtracker_backend sh -c "command -v pdftotext"   # /usr/bin/pdftotext
# Missing → the backend logs a warning and falls back to pdf-parse; the upload
# still succeeds but the parsed text has glued words. Do not "fix" that in the
# parser — install poppler-utils (both backend images already do).
```

What to check on a real PDF:

- `structured_data.fullName` is `Mohamed Amine Nasfi`, not `MohamedAmineNasfi`.
- A two-column entry keeps its gap: `Freelance    À distance`.
- Skills land in `structured_data.skills`, not in `experience`. A French CV has
  **two** skills blocks (`Compétences Techniques` then `Langues`); both are kept
  and appended, so dropping either one would silently lose the technologies.

```bash
# Automated (real poppler, real fixtures):
cd backend
CV_INTEGRATION=1 npx jest src/cvs/pdf-text.integration
# The backend container has poppler, so run it there when the host lacks it:
docker exec jobtracker_backend sh -c "cd /app && CV_INTEGRATION=1 npx jest src/cvs/pdf-text.integration"
```

Two fixtures in `backend/test/fixtures/`, both hand-built and uncompressed:

| Fixture | Proves |
|---|---|
| `run-together-words.pdf` | spacing is reconstructed (`Senior Full-Stack Engineer`) |
| `accented-french.pdf` | accented headers survive (`Compétences Techniques`) — a wrong output encoding makes every French header unmatchable |

`.docx` is unaffected: it still goes through `mammoth`, which needs none of this.

### Phase 2 — Parsing (rule-based + AI)

```bash
# Rule-based (free, synchronous, runs on upload): re-run explicitly with
curl -X POST "http://localhost:3000/api/cvs/<id>/parse?method=rule" \
  -H "Authorization: Bearer $TOKEN"            # parse_method=rule_based
# AI (explicit, costs a call, counts against AI_MONTHLY_CALL_CAP):
curl -X POST "http://localhost:3000/api/cvs/<id>/parse?method=ai" \
  -H "Authorization: Bearer $TOKEN"            # parse_method=ai
curl -X POST "http://localhost:3000/api/cvs/<id>/parse?method=nope" \
  -H "Authorization: Bearer $TOKEN"            # 400 method must be rule|ai
```

- Clean single-page CV with standard headers → `parse_status=parsed`, zero AI calls.
- CV with no recognizable headers → `failed` (plain-text fallback), never garbage.
- Multi-column/creative CV → `partial` → **Try AI Parsing** button appears.
- Free tier is slow/rate-limited: a timeout returns **504** "AI provider timed
  out…" and is retried twice internally (1s/2s backoff). Raise `AI_TIMEOUT_MS`
  for long CVs. Exhausting `AI_MONTHLY_CALL_CAP` → 429.

### Phase 3 — Admin LaTeX templates

```bash
ADMIN=<admin accessToken>
# Placeholder catalogue (allowed set, documented for admins)
curl http://localhost:3000/api/admin/cv-templates/placeholders -H "Authorization: Bearer $ADMIN"
curl "http://localhost:3000/api/admin/cv-templates?include_inactive=true" -H "Authorization: Bearer $ADMIN"

curl -X POST http://localhost:3000/api/admin/cv-templates -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Classic","latex_source":"{{fullName}}\n{{email}}","language":"en"}'

curl -X POST http://localhost:3000/api/admin/cv-templates/preview -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' \
  -d '{"latex_source":"Name: {{fullName}} \\ Company: {{headline}}"}'   # merged, escaped .tex

curl -X PATCH http://localhost:3000/api/admin/cv-templates/<id> -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' -d '{"is_active":false}'
curl -X DELETE http://localhost:3000/api/admin/cv-templates/<id> -H "Authorization: Bearer $ADMIN"
```

Rejections (all must be 400, nothing saved):

```bash
# Unknown placeholder → "Unknown placeholder …"
-d '{"name":"X","latex_source":"{{user_email}}"}'
# Dangerous LaTeX primitive → "forbidden LaTeX primitive \input"
-d '{"name":"X","latex_source":"\\input{/etc/passwd}"}'
-d '{"name":"X","latex_source":"\\immediate\\write18{rm -rf /}"}'
-d '{"name":"X","latex_source":"\\usepackage{shellesc}"}'
# Unbalanced token / empty / oversized source / bad language
-d '{"name":"X","latex_source":"{{fullName"}'
-d '{"name":"X","latex_source":""}'
-d '{"name":"X","latex_source":"{{fullName}}","language":"de"}'
```

UI checks (`/admin/login` → **CV Templates**): list, New template, `.tex` upload,
placeholder chips, Preview with sample data, Edit, Activate/Deactivate, confirm
Delete. Authorization: normal user → 403 on every `/api/admin/cv-templates*`
call and `/admin/cv-templates` redirects to `/admin/login`.

The editor also has to make authoring failures actionable:

- **List** — every row shows its preview image or an explicit *No preview image*
  placeholder (never a silent gap), an `ACTIVE` badge, and the name.
- **Pre-activation checklist** — three requirements are listed with a tick each:
  has a name, a Preview that compiled, only documented placeholders. Everything
  outstanding is listed at once and names the specific token
  (`{{projects}}`), never just "invalid placeholders". Editing the source after a
  successful preview re-opens the "preview compiles" requirement, because the
  previous render says nothing about the current source.
- **`.tex` editor** — line-numbered gutter, and a compile failure marks the line
  pdflatex blamed (`Line 4: Unknown LaTeX command…`). Only a whitelisted line
  number and message are returned; the raw log never reaches the client.
- **Preview pane** — `Compiling…` / `Up to date` / `Error`. On error the last
  good render stays on screen under a dismissible banner; dismissing one error
  does not silence the next, different one.

```bash
# A failing compile still answers 200/201 with the degraded body, so check
# image + latexError rather than the status code:
#   {"image":null,"error":"…","latexError":{"line":4,"message":"…"}}
```

### Adding a real-world template (e.g. a Word-mirroring LaTeX CV)

The pasted source is the **whole document**, so keep its `\documentclass`,
preamble and `\newcommand` definitions. Three rules:

1. **Only the 8 fixed placeholders** exist: `{{fullName}}`, `{{headline}}`,
   `{{email}}`, `{{phone}}`, `{{links}}`, `{{experience}}`, `{{education}}`,
   `{{skills}}`. Hard-coded personal data must be replaced by them; a
   `{{summary}}` section has no placeholder, so fold it into `{{headline}}` or drop it.
2. **`\usepackage` is allowlisted** (`ALLOWED_LATEX_PACKAGES` in
   `backend/src/latex/latex-template.ts`). Typography/layout packages are fine;
   `shellesc`, `filecontents`, `fontspec` and anything else return **400**
   "Template may not load the LaTeX package ...".
3. **Remove `\input{glyphtounicode}`** (and `\pdfgentounicode`): the file is not in
   any Debian TeX Live package, and it only affects PDF text extraction, not the
   rendering. `\input` stays blocked anyway because it is a file-read primitive.

Packages the sandbox image provides: `texlive-latex-base`, `-recommended`,
`-extra` (titlesec, enumitem, fullpage) and `-fonts-recommended`, plus
`poppler-utils`. After changing `worker/Dockerfile`, rebuild (§13) or the new
packages will not be found and the template fails with **422**.

4. **A placeholder replaces the whole `{{...}}`, braces included.** If the
   placeholder sits directly inside another group or straight after a macro
   name, that group's braces disappear and the compile dies with
   "Undefined control sequence". Put a space on each side:

   ```latex
   \resumeItem{ {{experience}} }        % NOT \resumeItem{{experience}}
   \underline{ {{email}} }              % NOT \underline{{email}}
   ```

   `\newcommand{\resumeItem}[1]{\item{{#1}}}` needs no change: `{{#1}}` is a
   macro parameter, not a placeholder, so it is left untouched.

5. **Comments are inert, so placeholders in them are ignored.** TeX discards
   everything from `%` to the end of the line, so a header comment listing the
   placeholders is safe and is *not* substituted. This matters because a
   multi-line value substituted into a comment would end that comment line and
   dump the rest of the value into the preamble, which fails with "Missing
   `\begin{document}`". For the same reason a blocked primitive or package named
   in a comment does not reject the template. `\%` is a literal percent, not a
   comment start, so a placeholder after `\%` still substitutes.

6. **Multi-line fields need `\obeylines` to become separate lines.** A newline
   in a field value is just a space to LaTeX, so without it a three-line
   Experience renders as one run-on bullet. Wrap the placeholder:

   ```latex
   {\obeylines
   \begin{itemize}[leftmargin=0.24in, label={}]
     \item {{experience}}
   \end{itemize}
   }
   ```

   Then one line per entry in the form becomes one line on the CV. Verified with
   `pdftotext` in the sandbox: three lines in, three lines out.

A ready-to-use version of the Word-mirroring template above is committed at
`docs/templates/resume-blue-accent.tex` — it applies all six rules, including
`\obeylines` on every multi-line section. Reference source:
`docs/TESTING_GUIDE.md` §12 (template authoring).

---

## 13. MVP3 — Phase 4: Sandboxed LaTeX compilation

### Enable it (opt-in; the default stack has no Docker socket in the API)

```bash
# 1. Build the sandbox image once (texlive, non-root uid 10001, pdflatex entrypoint,
#    poppler-utils for the Phase 6 preview). Re-run this after pulling Phase 6:
#    an image built before it lacks pdftoppm and every preview returns 422 with
#    "The template could not be compiled." while final PDF builds still succeed.
docker build -t jobtracker/latex-worker:latest worker/

# 2. Restart the API with the socket overlay
#    (adds /var/run/docker.sock + LATEX_* env; nothing else changes)
docker compose -f docker-compose.yml -f docker-compose.latex.yml up -d backend
docker compose logs -f backend | grep -i latex      # sandbox warnings only
```

Without the overlay, `POST /api/cvs/build` answers **503** "PDF generation is not
available on this server right now" and nothing else changes.

Env (all optional, see `backend/.env.example`):
`DOCKER_SOCKET=/var/run/docker.sock`, `LATEX_WORKER_IMAGE=jobtracker/latex-worker:latest`,
`LATEX_COMPILE_TIMEOUT_MS=15000`.

### Build a PDF

```bash
TOKEN=<user accessToken>
TPL=<active template id from GET /api/admin/cv-templates>

curl -X POST http://localhost:3000/api/cvs/build -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"template_id":"'"$TPL"'","fields":{"fullName":"Ada Lovelace","headline":"Engineer & Analyst_100%","email":"ada@example.com"}}'
# → {"id":"<uuid>","status":"queued",...}

curl http://localhost:3000/api/cvs/build/<id> -H "Authorization: Bearer $TOKEN"
# poll: queued → compiling → ready | failed
curl -o out.pdf http://localhost:3000/api/cvs/build/<id>/file -H "Authorization: Bearer $TOKEN"
curl -X DELETE http://localhost:3000/api/cvs/build/<id> -H "Authorization: Bearer $TOKEN"
```

### Rejections and edge cases (all must fail safely)

```bash
-d '{"template_id":"not-a-uuid"}'                  # 400
-d '{"template_id":"'"$TPL"'","fields":{"evil":"x"}}' # 400 unknown placeholder
-d '{"template_id":"'"$TPL"'","fields":{"fullName":"x".repeat(500)}}' # 400 too long
# inactive/unknown template_id                     # 404
# another user's build id (GET /file, DELETE)      # 404, never a download
# 11th build within the hour from one IP           # 429 (@Throttle 10/h, separate from AI cap)
```

Sandbox behaviour to confirm:

```bash
docker ps -a --filter name=jobtracker-latex            # empty: every job container is removed
docker run --rm jobtracker/latex-worker:latest --help 2>/dev/null | head -2   # pdflatex flags baked in
```

- **Escaping**: build with `fullName = "A_B & \input{/etc/passwd}"`. The build must
  still succeed and the PDF must show the literal text — unescaped `_`/`&` would
  abort `pdflatex`, so a successful build is the proof that escaping ran.
- **Timeout**: set `LATEX_COMPILE_TIMEOUT_MS=1000` and build a template with a huge
  `experience` blob → `status=failed` with "Compilation took too long…" and the
  container force-removed.
- **Broken template**: `POST /api/admin/cv-templates` with valid syntax but a
  missing package (e.g. `\includegraphics{logo}`) → `failed` with "The template
  could not be compiled." No `pdflatex` log, no host path in the message.
- **Isolation**: the sandbox runs with `--network none`, all capabilities dropped,
  `no-new-privileges`, uid `10001`, tmpfs-only scratch space and no host mounts —
  files travel through the Docker archive API, so nothing on the host is readable
  from inside the job.

### Automated checks

```bash
cd backend
npx jest src/latex                       # unit tests (no Docker needed)
LATEX_INTEGRATION=1 npx jest src/latex   # + real containers (needs the image)
# Windows/Docker Desktop: $env:DOCKER_SOCKET='\\.\pipe\docker_engine'
```

---

## 14. MVP3 — Phase 5: CV Builder UI & generation flow

### Prerequisites

Phase 4 must be enabled (§13) — the builder is the only user of the sandbox.
An active template (Phase 3) must exist; without one the gallery says
"No templates available".

### Walkthrough (browser)

1. `/cv-builder` (also linked from the sidebar and from **My CVs** → *Build a CV*).
2. The gallery lists active templates with their `preview_image_url`. Pick one.
3. The form is pre-filled from the account (`name`, `email`), the profile
   (`headline`, `skills`) and, if selected under **Pre-fill from**, a saved CV's
   parsed content. Everything stays editable.
4. **Generate PDF** → `queued` → `compiling` → **Download PDF**.
5. The generated CV now appears in `/dashboard/profile/cvs` with the
   *Built from template* badge, can be renamed / set as default / downloaded, and
   is selectable as a job's `cv_id` (`/dashboard/jobs` → open a job → CV).

```bash
# Same flow through the API (token + active template id)
curl http://localhost:3000/api/cv-templates -H "Authorization: Bearer $TOKEN"
# → [{"id":"...","name":"Classic","description":...,"preview_image_url":...,"language":"en"}]
#    (active templates only, and never their LaTeX source)

curl http://localhost:3000/api/cvs -H "Authorization: Bearer $TOKEN"
# → the generated CV appears with "source":"built"
```

### Edge and error cases

| Case | Expected |
| --- | --- |
| No active template | Gallery shows the empty state, no *Generate PDF* |
| Build fails (timeout / broken template) | Status card shows the server's message and *Try again*; no PDF |
| Value over the field cap | *Generate PDF* disabled, per-field error shown |
| Build never settles | Polling stops after ~3 min and reports "This is taking too long" |
| 11th build in an hour from one IP | 429 (`@Throttle(10/hour)`), surfaced in the form |
| Another user's build id | 404 on `GET /api/cvs/build/:id`, `/file` and `DELETE` |
| Deleting a generated CV from *My CVs* | Removes the row, the build record and the PDF (both delete routes) |
| AI parsing on a generated CV | 400 "generated from a template and has no text to parse"; the UI hides the button |

Affordances that must not be silent — every one of these states a *reason*
rather than leaving the user with a control that does nothing:

| Case | Expected |
| --- | --- |
| No saved CVs yet | Pre-fill dropdown is empty and says so, rather than looking broken |
| Saved CV parsed with `parse_status=partial` | Badge *Needs review* + **Try AI Parsing** banner |
| Parsed but a section came out empty | That section is flagged as uncertain, not silently blank |
| Uploaded PDF that yielded no sections | Badge *Plain text only*, AI parsing offered |
| Name missing on an upload | Label is optional; the server derives one (`Name — Headline`, else `Name`, else `CV uploaded YYYY-MM-DD`) and the user can rename it |
| **Generate PDF** clicked with no name | Disabled **and** states "Add a full name to generate your CV." |
| Value over the field cap | Disabled **and** names the field that is too long |
| PDF ready | *Download PDF* becomes a real link and stays visible after the click |
| Preview pane | `Compiling…` / `Up to date` / `Error`, template name shown with a *Change template* link |
| Experience/education entry with no dates | Inline, non-blocking *Missing dates? Add e.g. (2021 - Present)* nudge |

### Automated checks

```bash
cd backend
npx jest src/latex src/cvs     # gallery query, build→CV registration, delete cascade
cd ../front
npx vitest run src/app/cv-builder src/app/dashboard/profile/cvs
```

---

## 15. MVP3 — Phase 6: Live split-view preview

### Prerequisites

Phase 4 must be enabled (§13) — the preview renders through the **same** sandbox,
so without the Docker socket overlay the pane degrades instead of drawing:

- **User builder** (`/cv-builder`): `POST /api/cvs/build/preview` answers **503**
  and the pane keeps its last good image (or idle state) with an inline note.
- **Admin editor** (`/admin/cv-templates`): `POST /api/admin/cv-templates/preview`
  still returns **200** with `image: null` + a user-safe `error`, so the merged
  source text stays visible and the editor remains usable.

Extra env (all optional): `LATEX_PREVIEW_TIMEOUT_MS` (default `8000`, shorter than
the final-build timeout) and `LATEX_PREVIEW_CACHE_TTL_MS` (default `30000`; `0`
disables the cache).

### Walkthrough (browser)

1. `/cv-builder` → pick a template. Fields on the left, **Live preview** on the
   right. Pause typing for ~0.7s → the pane shows *Rendering…* then the compiled
   PNG. Keep typing → each pause supersedes the last request; the image updates
   within about a second of stopping.
2. `/admin/cv-templates` → **New template** (or *Edit*). The `.tex` source is on
   the left, **Live preview (sample data)** on the right, rendered against the
   fixed sample CV. The old *Preview with sample data* button is gone — preview is
   continuous now.
3. **Generate PDF** (user) / **Create·Save** (admin) are still separate, explicit
   steps. The preview is ephemeral: it is never written to `generated_cvs` or to
   permanent storage, and the admin's in-progress source is only persisted on save.

```bash
# User preview (returns a base64 PNG data URL, not a stored file)
curl -X POST http://localhost:3000/api/cvs/build/preview \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"template_id":"'"$TPL"'","fields":{"fullName":"Ada Lovelace"}}'
# → {"image":"data:image/png;base64,...","cached":false}   (second identical call → "cached":true)

# Admin preview (accepts an in-progress latex_source; also returns merged text)
curl -X POST http://localhost:3000/api/admin/cv-templates/preview \
  -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
  -d '{"latex_source":"\\documentclass{article}\\begin{document}{{fullName}}\\end{document}"}'
# → {"placeholders":["fullName"],"latex":"Ada Lovelace","image":"data:image/png;base64,...","error":null}
```

### Edge and error cases

| Case | Expected |
| --- | --- |
| Rapid typing (many keystrokes, no pause) | Debounce collapses them; **at most 1–2** real compiles, not one per character |
| Newer edit while a preview is in flight | Client aborts the old request (AbortController); server **supersedes** it — the stale one is discarded with **409** and never renders a container |
| Identical request within the TTL | Served from cache (`"cached":true`), no second compile |
| Sandbox down / unavailable | User: **503**; Admin: **200** with `image:null` + `error`. Pane keeps the last good image and shows a note with *Try again* |
| Compile fails (broken template) | **422** with a generic message; no `pdflatex` log or host path leaks |
| Malicious field value (`\input{/etc/passwd}`, `\write18{whoami}`) | Neutralized **exactly** as in Phase 4 — the preview shows literal text; the injection re-run proves escaping ran on the preview path too |
| 61st preview in a minute from one IP | **429** (`@Throttle(60/min)`, far more generous than the final-build `10/hour`) |
| Browser tab closed mid-typing | No orphaned container: the request is aborted client-side, and the sandbox job always force-removes itself (§13) within the 8s preview timeout |

Security invariants to confirm (unchanged from Phase 4 — the preview is **not** a
separate, weaker engine): every value is escaped with the same `escapeLatex`,
compilation happens only inside the locked-down Docker sandbox, and errors are
generic. Per-scope concurrency is capped so one user/admin can have at most one
preview compiling at a time.

### Automated checks

```bash
cd backend
npx jest src/latex src/admin    # compilePreview, cache + supersede, admin graceful degradation
LATEX_INTEGRATION=1 npx jest src/latex   # + real PNG rasterization & injection-inertness
cd ../front
npx vitest run src/components/SplitPreviewPane.test.tsx \
  src/app/cv-builder src/app/admin
```

---

## Quick smoke path (5 minutes)

1. `docker compose up -d` → `curl http://localhost:3000/api` = 200.
2. `cd backend && npm test` = all green.
3. Browser `/register` (CAPTCHA auto-passes) → lands on `/dashboard`.
4. `/dashboard/jobs` → create + edit + delete a job.
5. `curl` login without `turnstileToken` → 400 (CAPTCHA enforced).
6. Seed admin → `/admin/login` → open `users` + `audit-logs`.
7. `/dashboard/profile/cvs` → upload a PDF → rule-based parse badge appears.
8. Admin → `/admin/cv-templates` → create + preview + delete a template.
9. Phase 4 (needs `docker-compose.latex.yml`): `POST /api/cvs/build` → poll to
   `ready` → download the PDF.
10. Phase 6: in `/cv-builder`, edit a field and pause ~1s → the right-hand pane
    renders the compiled PNG; keep typing → it supersedes and re-renders, and no
    container is left behind (`docker ps -a --filter name=jobtracker-latex`).
11. Cleanup test users.
