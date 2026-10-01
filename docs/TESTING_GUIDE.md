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

## Quick smoke path (5 minutes)

1. `docker compose up -d` → `curl http://localhost:3000/api` = 200.
2. `cd backend && npm test` = all green.
3. Browser `/register` (CAPTCHA auto-passes) → lands on `/dashboard`.
4. `/dashboard/jobs` → create + edit + delete a job.
5. `curl` login without `turnstileToken` → 400 (CAPTCHA enforced).
6. Seed admin → `/admin/login` → open `users` + `audit-logs`.
7. Cleanup test users.
