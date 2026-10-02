> ⚠️ **SUPERSEDED — do not build from this file.**
> This document reflects the *original* 2-MVP roadmap. The plan has since been reorganized into a full **MVP 1 → MVP 7** roadmap, where the scope described here was redistributed and expanded:
> MVP2 = Job Search Copilot (profile + AI match on typed skills, no CV), MVP3 = CV Builder & Parser (upload + Docker-sandboxed LaTeX PDF), MVP4 = Cover Letter Builder, MVP5 = Monetization (Stripe), MVP6 = Application Memory & Advanced Intelligence, MVP7 = Design Enhancement & i18n.
> The current source of truth is [`docs/MASTER_ROADMAP_MVP1-7.md`](./MASTER_ROADMAP_MVP1-7.md). Kept only for historical reference.

---

MVP 2 & MVP 3 Development Guide — Job Search Copilot
This continues directly from the MVP 1 guide. Don't start MVP 2 until MVP 1's core loop (capture → save → Kanban → applied, across Phases 0–6) is genuinely stable in production. Admin, Google auth, CAPTCHA, UI polish and deployment (MVP1 Phases 7–12) can happen before or in parallel with MVP2 — they don't block it, but the core loop does.

Same stack as MVP1 throughout: Next.js + Tailwind + shadcn/ui (web), NestJS + Prisma + self-hosted PostgreSQL (api), Chrome MV3 + TypeScript + React (extension). New pieces are called out per phase.

🧱 Tech Stack — New Pieces for MVP2 & MVP3
Base stack is unchanged from MVP1 (Next.js + Tailwind + shadcn/ui, NestJS + Prisma + self-hosted PostgreSQL, Chrome MV3 extension). This table covers only what MVP2/MVP3 add on top.

Layer	Technology	Used in	Why
AI provider	Anthropic API or OpenAI API, called server-side only	MVP2 Phase 0, 2, 3 · MVP3 Phase 5	Key never reaches the browser or extension (AGENTS.md rule #5); one AiModule wraps every call
AI output validation	Zod	MVP2 Phase 0, 2	Model responses are parsed as untrusted input, not trusted structured data
File storage (CVs)	Local disk in dev; an S3-compatible bucket (e.g. Cloudflare R2, MinIO, Backblaze B2) in production	MVP2 Phase 1	Keeps file storage self-hosted/cheap, consistent with "no vendor lock-in" from MVP1
PDF text extraction	pdf-parse	MVP2 Phase 1	Extracts CV text server-side for AI matching
DOCX text extraction	mammoth	MVP2 Phase 1	Same, for .docx CVs
File upload handling	@nestjs/platform-express + multer, with a strict file-type/size filter	MVP2 Phase 1	Validates real file content, not just the client's claimed MIME type
Scheduled jobs	@nestjs/schedule (@Cron)	MVP2 Phase 4	Daily follow-up reminder sweep; no separate job-queue infra needed at this scale
Charts	Recharts	MVP2 Phase 5 (analytics), MVP3 Phase 4 (comparison)	Same library as the MVP1 admin dashboard — one charting dependency for the whole app
Fuzzy/string matching	fast-levenshtein or string-similarity	MVP3 Phase 2 (duplicate detection), company-name normalization (MVP2 Phase 6)	Lightweight, no extra AI cost for near-duplicate checks
Similarity scoring	Plain Jaccard overlap on extracted skill sets (no new library)	MVP3 Phase 3	Avoids standing up an embeddings/vector pipeline just for MVP3; revisit only if this proves too coarse
Notifications (in-app)	A notifications table + the existing TanStack Query polling/refetch — no push infra	MVP2 Phase 4	Email/push notifications are explicitly out of scope per the original MVP1 doc
Rate limiting (AI)	@nestjs/throttler, plus the ai_calls_this_month counter from Phase 0	MVP2 Phase 0, 7 · MVP3 Phase 7	Protects against both abuse and runaway AI spend
Decision to make early (MVP2 Phase 0): which AI provider to standardize on. Anthropic's and OpenAI's APIs are both viable here; pick one, wrap it behind AiModule so swapping later doesn't touch Phases 1–8's calling code.

🟡 MVP 2 — Job Search Copilot
Product promise: Stop just storing applications — start helping the user understand them.

MVP2 adds a user profile/CV layer and an AI layer on top of the existing Kanban, plus the analytics and reminders that make the tracker genuinely useful over weeks of job-hunting.

MVP 2 — Phase 0: Prerequisites & AI Integration Planning
Goal: Decide how AI features are powered before building any of them, since every later MVP2 phase depends on this.

Decisions to make:

AI provider: an LLM API (e.g. the Anthropic or OpenAI API) called server-side only. Never call the AI provider directly from the extension or the web client — the API key must never reach the browser.
Where AI calls live: a dedicated AiModule in the NestJS API, with one service per capability (JobMatchService, CoverLetterService) so later phases don't duplicate prompt-building and parsing logic.
Cost control: cache match results per (job_id) so re-opening a job doesn't re-call the AI; add a per-user daily/monthly cap on AI calls (cover letters and match scores) to avoid runaway cost from one account.
Structured output: prompt the model to return strict JSON (match score, matched skills, missing skills) and validate it with Zod before storing — never store or display unvalidated model output as if it were structured data.
Database additions:

alter table users
  add column ai_calls_this_month int not null default 0,
  add column ai_calls_reset_at timestamptz;
Done when: a throwaway POST /ai/ping endpoint round-trips a prompt through your chosen provider, server-side, with a Zod-validated response and a basic per-user rate limit in front of it.

MVP 2 — Phase 1: Profile & CV Management
Goal: The user has one profile and can store multiple CV versions, each usable later for matching and for tagging applications.

Database:

create table user_profiles (
  user_id uuid primary key references users(id) on delete cascade,
  headline text,
  years_experience int,
  skills text[],              -- normalized skill list, used for fast matching
  bio text,
  updated_at timestamptz default now()
);

create table cvs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade not null,
  label text not null,         -- "Full-Stack Developer", "DevOps", etc.
  file_url text,                -- stored file (local disk/S3-compatible bucket)
  parsed_text text,             -- extracted text, used for AI matching
  is_default boolean default false,
  created_at timestamptz default now()
);

alter table jobs add column cv_id uuid references cvs(id);
Backend tasks:

PUT /profile — update headline, years of experience, skills, bio.
POST /cvs — upload a CV file (PDF/DOCX), extract plain text server-side (e.g. pdf-parse for PDFs, mammoth for DOCX), store both the file and the extracted text.
GET /cvs, PATCH /cvs/:id (rename, set default), DELETE /cvs/:id.
PATCH /jobs/:id extended to accept cv_id, so an application can record which CV was used.
Validate file type/size server-side (don't trust the client's claimed MIME type); scan for obviously malicious uploads before storing.
Frontend tasks:

/profile page: editable headline, experience, skills (tag input), bio.
/profile/cvs section: list of CVs with label, default toggle, upload button, delete.
In the Add Job form and Job Details view, add a "CV used" dropdown sourced from the user's CVs.
Empty state prompting the user to add their profile/CV before using AI matching (Phase 2 depends on this).
Done when: a user can fill in their profile, upload two CVs, mark one default, and tag a saved job with a specific CV — all persisted and visible on refresh.

MVP 2 — Phase 2: AI Job Match
Goal: When viewing a job, show a match score plus which required skills the user has and which they're missing.

Database:

alter table jobs
  add column match_score int,              -- 0-100
  add column match_skills_matched text[],
  add column match_skills_missing text[],
  add column match_computed_at timestamptz;
Backend tasks:

JobMatchService.computeMatch(job, profile, cvText): builds a prompt from the job description + user skills/CV text, asks the model for a JSON result { score, matchedSkills[], missingSkills[] }, validates with Zod, clamps score to 0–100.
POST /jobs/:id/match — triggers computation (uses the job's cv_id if set, else the default CV), stores the result and match_computed_at, returns it. Idempotent/cached: skip recomputation if match_computed_at is recent and the job description/CV haven't changed.
Enforce the per-user AI-call cap from Phase 0 here.
Graceful degradation: if the AI call fails or times out, return a clear "match unavailable" state rather than blocking the rest of the job view.
Frontend tasks:

Job Details view: a match panel — score (e.g. a ring/badge, color-coded), "✓ matched skills" and "⚠ missing skills" lists, with a "Recompute" button.
Extension popup: show the match score inline when the user is viewing a job page, computed via the same endpoint (requires the job to already be saved, or computed on an unsaved extraction before save).
Kanban card: optional small match-score badge on the compact card.
Loading and error states for the match panel (AI calls are slower than normal CRUD — don't block the rest of the page on them).
Done when: opening a saved job with a profile/CV set shows an accurate-looking score and skill breakdown within a few seconds, refreshing a job that hasn't changed doesn't re-call the AI, and a job with no CV set prompts the user to add one instead of erroring.

MVP 2 — Phase 3: AI Cover Letter Generation
Goal: Generate a tailored, editable cover letter draft from the user's profile/CV and the job description — the user always reviews before using it.

Database:

create table cover_letters (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade not null,
  content text not null,
  generated_at timestamptz default now(),
  edited boolean default false
);
Backend tasks:

CoverLetterService.generate(job, profile, cvText): prompt built from job title/company/description + profile/CV, returns plain-text draft (not JSON — this one is free-form prose).
POST /jobs/:id/cover-letter — generates and stores a draft, enforces the AI-call cap.
GET /jobs/:id/cover-letters, PATCH /cover-letters/:id (user edits are saved, edited = true), DELETE /cover-letters/:id.
Strip/escape anything the model might echo back from the job description before rendering (same XSS discipline as MVP1 Phase 6).
Frontend tasks:

In Job Details: [ Generate Cover Letter ] button → loading state → editable textarea with the draft, Save/Discard/Regenerate actions.
Clearly label it as an AI draft the user should review and personalize before sending — never auto-send or auto-attach it anywhere.
Keep a small history (previous drafts for the same job) so regenerating doesn't destroy an edited version the user liked.
Done when: generating a cover letter for a real job produces a coherent, job-specific draft, editing and saving it persists correctly, and regenerating doesn't silently overwrite an edited draft without confirmation.

MVP 2 — Phase 4: Follow-up Reminders
Goal: Nudge the user to follow up on applications that have gone quiet.

Database:

alter table jobs
  add column follow_up_at timestamptz,
  add column follow_up_sent boolean default false;
Backend tasks:

When a job transitions to APPLIED (MVP1 Phase 5's status-update endpoint), set follow_up_at = applied_at + interval '7 days' by default (configurable per user later).
A scheduled job (NestJS @Cron, or a lightweight worker) runs daily: finds jobs where follow_up_at <= now() and follow_up_sent = false and status = 'APPLIED', and creates an in-app notification (simplest MVP2 version — no email yet, that's explicitly out of scope per the original MVP1 doc).
GET /notifications, PATCH /notifications/:id/read.
Let the user disable follow-up reminders per job (e.g. after withdrawing) and set a custom follow-up date.
Frontend tasks:

A small notification bell in the dashboard header with an unread count.
Job card/detail shows an upcoming or overdue follow-up badge.
"Follow up" action on the job: marks follow_up_sent = true, optionally logs a note.
Done when: a job applied to 7+ days ago with no status change surfaces a reminder, marking it handled clears the badge, and reminders respect per-job overrides.

MVP 2 — Phase 5: Analytics Dashboard
Goal: Turn raw job counts into insight — response rate, interview rate, sources, trends over time.

Backend tasks:

GET /analytics/summary — aggregates: total applications, responses (any status beyond APPLIED), interviews, offers, response rate, interview rate.
GET /analytics/by-source — counts grouped by source (LinkedIn, Indeed, generic, manual).
GET /analytics/timeline?range=week|month — applications per period, for a trend chart.
Keep these as read-only aggregation queries scoped to req.user.id — same isolation discipline as every other endpoint.
Frontend tasks:

An /analytics page (or an expanded Dashboard section): stat cards (response rate, interview rate), a bar/line chart of applications over time, a breakdown chart of applications by source (Recharts, consistent with the admin charts from MVP1 Phase 7).
Date-range filter (last 30/90 days, all time).
Keep the MVP1 Dashboard's simple stat cards as-is; this is an additional, deeper page — don't bloat the home dashboard.
Done when: the analytics page shows accurate response/interview rates and a trend chart that matches manually-counted data for a test account.

MVP 2 — Phase 6: Company History
Goal: See every application to the same company in one place.

Backend tasks:

GET /companies — distinct companies the user has applied to, with counts per status.
GET /companies/:name/jobs — all jobs for that company (case-insensitive match; consider normalizing company names on save to reduce duplicates like "Google" vs "Google Inc.").
Frontend tasks:

A "Companies" view (list, searchable) showing company name, application count, and a mini status breakdown.
Clicking a company shows all jobs applied to there, reusing the Job Card component.
Link to this view from a job's details page ("See all applications to ABC Company").
Done when: applying to the same company under three different job titles correctly groups them under one company view with accurate per-status counts.

MVP 2 — Phase 7: Integration, Testing & Hardening
Goal: The same discipline MVP1 Phase 6 applied to the core loop, now applied to the AI/analytics layer.

Tasks:

Confirm every new endpoint (/profile, /cvs, /jobs/:id/match, /jobs/:id/cover-letter, /notifications, /analytics/*, /companies) is scoped to req.user.id — write the same cross-user access tests as MVP1 Phase 6.
Load-test AI endpoints aren't trivially abusable: confirm the per-user AI-call cap actually blocks excess calls, and that a 429/limit response is clear to the frontend.
File upload hardening for CVs: size limits, MIME validation, virus-scan hook if feasible, storage outside the web root.
Confirm AI failures (timeout, provider error, malformed JSON from the model) degrade gracefully everywhere they're used, with no raw provider errors leaked to the client.
Cost monitoring: log AI call volume/cost per day so a runaway loop or abuse is visible quickly.
Done when: you've tried to break every new feature (huge CV uploads, rapid-fire match requests, cross-user ID guessing on /cvs/:id) and nothing corrupts data, leaks cross-user info, or silently burns AI budget.

MVP 2 — Phase 8: Rollout
Goal: Ship MVP2 features to real users without disrupting the MVP1 loop that's already working.

Tasks:

Feature-flag new sections (Profile/CVs, AI Match, Cover Letters, Analytics, Companies) if you want to roll out gradually rather than all at once.
Update the onboarding checklist from MVP1 Phase 8 with a new step: "Add your profile & CV" once Phase 1 ships.
Update the privacy policy: you're now sending job descriptions and CV content to a third-party AI provider — disclose this plainly.
Smoke-test the full MVP2 loop end-to-end on production: profile → CV upload → match score on a real job → cover letter draft → follow-up reminder fires → analytics reflect real activity → company grouping is correct.
Done when: a real user can go from an empty profile to a matched, cover-lettered application with an active follow-up reminder, without touching any MVP1 functionality's behavior.

🟣 MVP 3 — Job Application Memory & Advanced Intelligence
Product promise: The extension becomes a personal memory for the user's entire job search, not just a logger.

MVP3 assumes MVP2's profile, CV, and AI-match infrastructure already exists — every phase below builds directly on it.

MVP 3 — Phase 0: Prerequisites
Goal: Confirm the ground MVP3 stands on.

Checklist before starting:

MVP2's AI infrastructure (AiModule, per-user call caps, Zod-validated structured output) is in place and reliable.
Company History (MVP2 Phase 6) is working, since Application Memory extends it.
Decide the autonomy boundary now, in writing, before building anything: every MVP3 feature that touches AI or automation surfaces information or a draft for the user to review — none of them submit, send, or act on the user's behalf without an explicit confirm click. This mirrors MVP1's "never auto-submit applications" rule and extends it to MVP3's smarter features.
Done when: this boundary is written into AGENTS.md (or equivalent) so no later phase quietly crosses it.

MVP 3 — Phase 1: Application Memory
Goal: When the user opens a job at a company they've interacted with before, surface that history immediately — in the extension, not just on the website.

Backend tasks:

GET /companies/:name/history?excludeJobId= — returns prior applications to that company: title, date, outcome/status.
Extend the extension's job-detection response (from MVP1 Phase 4's capture flow) with an optional companyHistory lookup, called right after a job is extracted on-page.
Extension tasks:

In the popup, when a job is detected for a company with prior history, show a compact history card: "You applied here before — [Title], [date], [status]."
If the prior application was REJECTED, show it plainly but neutrally — this is information, not a recommendation to skip applying.
Frontend tasks:

Same history card reused in the web app's Job Details view and the manual Add Job form (lookup by company name as the user types).
Done when: opening a LinkedIn posting for a company you've previously applied to shows the correct prior application(s) in the extension popup within the normal capture flow, with no extra click required.

MVP 3 — Phase 2: Duplicate Job Detection
Goal: Recognize when the same posting resurfaces and flag it instead of silently creating a second card.

Backend tasks:

On POST /jobs (save), check for an existing job for this user with the same url, or — for reposted listings with a new URL — a fuzzy match on (company, title) normalized (lowercased, punctuation-stripped) within a configurable time window (e.g. 90 days).
If a likely duplicate is found, return a 409-style response with the existing job's id and basic info, rather than silently creating a new row (this generalizes the simple unique-constraint approach from MVP1 Phase 6 to the fuzzy-match case).
Extension/Frontend tasks:

Popup/Add-Job form: if the API flags a likely duplicate, show "You may have already saved this job" with a link to the existing card, and let the user confirm "No, this is a different posting" to save anyway.
Done when: re-saving the exact same URL is blocked with a clear prompt, and saving a reposted listing (same company/title, new URL) within the time window is flagged rather than silently duplicated.

MVP 3 — Phase 3: Similar Job Detection
Goal: Surface other saved/applied jobs with overlapping requirements, so the user can see patterns in what they're applying to.

Backend tasks:

SimilarJobsService: compute similarity between a job and the user's existing jobs using the skills already extracted during AI matching (MVP2 Phase 2) — simplest approach is skill-set overlap (e.g. Jaccard similarity) rather than a new embedding pipeline, to avoid extra AI cost for this phase.
GET /jobs/:id/similar — returns the top 3–5 most similar prior jobs with a similarity indicator.
Frontend/Extension tasks:

Job Details view: a "Similar jobs you've saved" panel.
Keep this read-only and informational — no scoring judgment implied ("better" or "worse"), just overlap.
Done when: a newly viewed job correctly surfaces 2–3 genuinely related prior jobs (overlapping title/skills) for an account with reasonable history, and shows nothing rather than forced/irrelevant matches when there isn't enough data.

MVP 3 — Phase 4: Job Comparison View
Goal: Let the user compare match scores and key details across a few jobs side by side, as information — not a recommendation engine.

Frontend tasks:

A "Compare" selection mode on the Kanban or Companies view: pick 2–4 jobs.
A comparison table: match score, matched/missing skills, salary, location, status, source — side by side.
No ranking, no "best choice" label — present the data and let the user decide, consistent with the MVP3 autonomy boundary from Phase 0.
Done when: selecting several saved jobs produces a clear side-by-side comparison with accurate data for each.

MVP 3 — Phase 5: Advanced Application Assistant
Goal: Chain the existing pieces (detect → match → pick CV → draft cover letter → track → set follow-up) into one guided flow — with a mandatory human review step before anything is finalized.

Backend tasks:

ApplicationAssistantService.prepare(jobId): orchestrates calls to the existing JobMatchService, a CV-selection step (pick the user's CV with the highest skill overlap for this job, or their default if none stands out), and CoverLetterService — returns a single bundled "application packet" (match data + suggested CV + cover letter draft), without changing the job's status or saving anything as final yet.
POST /jobs/:id/assistant/accept — only this endpoint actually commits the CV selection and cover letter, and only after the user has seen and approved the packet.
Frontend tasks:

A guided panel: "Prepare Application" → shows match score, suggested CV (with the option to change it), the cover letter draft (editable) → [ Review & Accept ] button.
Nothing is saved as the job's "used CV" or stored cover letter until the user explicitly accepts — this is the phase where the Phase 0 autonomy boundary matters most, since this feature could easily drift toward "just submit it for me" if built carelessly.
After acceptance, offer to set/confirm the follow-up reminder (MVP2 Phase 4) as the last step.
Done when: running the assistant on a real job produces a sensible packet, nothing is persisted until the user clicks Accept, and the accepted CV/cover letter show up correctly on the job exactly as reviewed — no silent edits between preview and save.

MVP 3 — Phase 6: Expanded Platform Support
Goal: Broaden the extension beyond LinkedIn/Indeed/generic (MVP1 Phase 4) to more job platforms, now that the parser pattern is proven.

Tasks:

Add dedicated parsers for 2–3 more platforms based on real usage data (MVP1 Phase 6's extraction-failure logging tells you which sites to prioritize) — common next candidates: Glassdoor, Wellfound, a major regional job board relevant to your users.
Each new parser follows the existing parsers/<site>.ts pattern and shared CapturedJob type (AGENTS.md conventions) — don't special-case the UI per platform.
Extend the Phase 5 (MVP1) application-detection logic per new platform where a clear confirmation pattern exists; otherwise rely on the existing manual fallback and generic watcher.
Update host_permissions incrementally and re-justify them in your Chrome Web Store listing per MVP1 Phase 12's hardening note.
Done when: each newly supported platform correctly extracts title/company/location on a handful of real postings, with the same manual-fallback safety net as every other site.

MVP 3 — Phase 7: Hardening, Privacy & Safety Guardrails
Goal: MVP3 handles more AI-derived and cross-job data than MVP2 — make sure the extra surface area doesn't become extra risk.

Tasks:

Re-run the cross-user isolation tests from MVP2 Phase 7 against every new MVP3 endpoint (/companies/:name/history, /jobs/:id/similar, /jobs/:id/assistant/*).
Confirm the Duplicate Detection and Similar Jobs features never leak data between users — similarity/duplicate checks must only ever compare a user's own jobs against their own jobs, never across accounts.
Audit every AI-assisted feature against the Phase 0 autonomy boundary: nothing auto-submits, auto-sends, or auto-finalizes without an explicit user action. Write this check into your test suite, not just documentation.
Extend the privacy policy: company-history matching, duplicate/similarity detection, and the application assistant all process the user's own accumulated data — be specific about what's compared to what, and that nothing is shared across users.
Re-check AI cost caps (MVP2 Phase 0) now that Phase 5's assistant can trigger multiple AI calls (match + cover letter) in one guided flow — rate-limit the whole flow, not just its individual calls.
Done when: you've tried to find a path where an MVP3 feature acts without explicit user confirmation, or surfaces one user's data to another, and found none.

MVP 3 — Phase 8: Rollout
Goal: Ship MVP3 the same deliberate way MVP2 shipped.

Tasks:

Feature-flag Application Memory, Duplicate/Similar Detection, Comparison, and the Advanced Assistant if rolling out gradually.
Update onboarding/tips (MVP1 Phase 8) to mention the new capabilities once they're stable.
Smoke-test end-to-end: reopen a company you've applied to before → see history → save a near-duplicate posting → get flagged → view similar jobs → compare two jobs → run the assistant → accept → reminder set.
Done when: that full walkthrough works on production for a real account, and nothing from MVP1 or MVP2's behavior has regressed.

💰 Pricing & Tiers
This is a product/business decision, not a dev phase — build it whenever it makes sense relative to the phases above (most teams wire up billing after MVP2's AI features exist, since AI usage is the main cost driver). Included here because it shaped the feature boundaries throughout MVP1–3.

Tier	Price	Includes	Gated by
Free	$0	Extension, Kanban, manual + auto-detected capture, up to ~50 tracked jobs, basic stats	A plan column on users + a job-count check on POST /jobs
Pro	~$5–10/month	Unlimited tracked jobs, AI job matching, multiple CVs, follow-up reminders, full analytics, company history	AiModule calls and /analytics/*, /cvs check plan = 'pro' or higher
Premium	~$15/month	Everything in Pro + AI cover letters, Application Memory, duplicate/similar detection, job comparison, the Advanced Application Assistant	Same gating pattern, applied to MVP3 endpoints
Implementation notes:

Add plan (free | pro | premium) and plan_renews_at to users; a PlanGuard (parallel to the RolesGuard from MVP1 Phase 7) checks it on gated routes.
Keep the free tier's 50-job cap as a simple count check — it's also a natural place to prompt an upgrade in the UI ("You've saved 48/50 jobs — upgrade for unlimited").
Payments: Stripe Checkout + a webhook (/billing/webhook) updating plan/plan_renews_at is the standard, low-maintenance path — don't build custom billing logic.
The free tier should still feel genuinely useful on its own (full MVP1 functionality) — Pro/Premium gate MVP2/MVP3 features, not the core loop.
Admins (MVP1 Phase 7) bypass plan checks entirely; don't let a lapsed admin subscription lock them out of the admin panel.
🗺️ Full roadmap recap
MVP 1 (0–12)   Capture → Kanban → Admin → Dashboard home → Google auth → CAPTCHA → Premium UI → Deploy
     ↓
MVP 2 (0–8)    Profile/CVs → AI Match → Cover Letters → Reminders → Analytics → Company History → Harden → Rollout
     ↓
MVP 3 (0–8)    Application Memory → Duplicate Detection → Similar Jobs → Comparison → Advanced Assistant →
               Expanded Platforms → Harden/Privacy → Rollout
The rule that applies at every stage: don't start the next MVP's phases until the current one's "done when" checkpoints are genuinely true in production — not just locally, not just in the happy path.