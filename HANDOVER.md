# Misan Partners Investor Portal — Technical & Operational Handover

This document is the complete reference for the Misan Partners investor portal: what it is, how it's built, how to operate it day-to-day, and how to make changes safely. It's written for whoever is responsible for keeping the portal running — whether that's Chin, a future developer, or both.

For a shorter, non-technical version of this document, see `HANDOVER_OVERVIEW.md`. For step-by-step instructions on updating content via Claude, see `scripts/content-update-guide.md`.

---

## 1. Portal Overview

The portal is a private, invite-only web application that gives Misan Partners' investors a live view of their investments — project progress, financials, team, and a permission-gated data room of supporting documents — without ever giving them a login to a spreadsheet or a shared Drive folder directly.

There are three distinct surfaces:

| Surface | URL | Who it's for |
|---|---|---|
| Public marketing site | `https://misanpartners.com/` | Anyone |
| Investor portal | `https://misanpartners.com/investors/` | Invited investors only |
| Admin panel | `https://misanpartners.com/admin/` | Chin only |

The investor portal itself has these key pages, all reached after logging in:
- `https://misanpartners.com/investors/portal/` — the investor's project list ("portal home")
- `https://misanpartners.com/investors/portal/axd/` — Arena X District project page
- `https://misanpartners.com/investors/portal/galatians/` — Galatians project page
- `https://misanpartners.com/investors/setup` — password setup/reset page (reached only via an emailed link, never navigated to directly)

---

## 2. Architecture & Tech Stack

- **Frontend:** static HTML/CSS/JavaScript — no framework, no build step. Pages are rendered by a shared `assets/js/portal.js`, which fetches project data and renders it into the page at load time.
- **Hosting:** Vercel (free/Hobby tier). Every push to the `main` branch on GitHub deploys automatically.
- **Authentication (investors):** Supabase Auth, invite-only. There is no public sign-up form anywhere in the app.
- **Authentication (admin):** a single shared password (`ADMIN_PASSWORD`), checked against a cookie — deliberately simple since there's only one admin user (Chin). See the Security section for the tradeoffs of this design.
- **Database:** Supabase PostgreSQL — currently one table, `access_requests`, which tracks every document access request an investor has ever made (with row-level security enabled).
- **Documents:** Google Drive, accessed via the Drive API using an OAuth 2.0 refresh token (no per-request login to Google). File listings and downloads are fetched live from Drive — the portal never stores document files itself.
- **Email:** Resend, sending from `notifications@misanpartners.com`.
- **Content pipeline:** two Markdown "source" files (`AXD_source.md`, `Galatians_source.md`) are converted into the JSON files the portal actually reads, by a small Node script (`scripts/md-to-json.js`), run automatically by a GitHub Actions workflow whenever either source file changes on `main`.

### Serverless functions

Vercel's free tier caps a deployment at 12 serverless functions. The API is deliberately consolidated into a small number of files, each internally routing multiple endpoints, to stay well under that limit with room to grow:

| File | Handles |
|---|---|
| `api/auth/[...action].js` | `/api/auth/login`, `logout`, `verify`, `exchange`, `setpassword`, `resetpassword`, `google/callback` |
| `api/admin/[action].js` | `/api/admin/login`, `requests`, `approve`, `investors`, `invite`, `revoke` |
| `api/drive/files.js` | List files in a Drive folder |
| `api/drive/download.js` | Stream/redirect a file download |
| `api/drive/request.js` | Investor requests access to a locked file |
| `api/drive/access.js` | Check an investor's approval status for a specific file |

That's 6 functions total today — 6 of headroom remains before the 12-function limit. If new API functionality is added later, prefer extending one of the existing consolidated files over creating a new one, or watch the function count if you do.

### Environment variables (names only — actual values live only in Vercel)

| Variable | Purpose |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Supabase project connection (service-role key — full admin access, never expose client-side) |
| `ADMIN_PASSWORD` | The single admin panel password |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_REFRESH_TOKEN` | Google Drive OAuth credentials |
| `RESEND_API_KEY` | Email sending |
| `NODE_ENV` | Standard Node environment flag |

None of these are ever committed to the repository. Locally, they live in `.env.local` (gitignored). In production, they're set directly in the Vercel project's Environment Variables settings — encrypted at rest, never visible in the deployed code or the GitHub repo.

---

## 3. Admin Panel

**URL:** `https://misanpartners.com/admin/`

### Logging in
A single password gate (no email/username) protects the whole panel. The password is the `ADMIN_PASSWORD` environment variable in Vercel. After 5 incorrect attempts from the same IP address within 15 minutes, further attempts are blocked with a "Too many attempts" response until the window resets — this protects against automated password-guessing.

### Investors section
Shows every investor account, with email, when their account was created, and when they last signed in (or "Never signed in" if they haven't yet).

- **Invite a new investor:** enter their email in the "Send Invite" field and submit. Supabase emails them a one-time link. Clicking it takes them to the password-setup page, where they choose their own password and land directly in the portal — Chin never sees or sets an investor's password.
- **Resend an expired invite:** click "Resend Invite" next to any investor's row, confirm the dialog. This calls the exact same invite mechanism as a fresh invite, so it works whether the original link expired or was simply never used.
- **Revoke an investor's access permanently:** click "Revoke Access" next to their row. This is a **destructive, irreversible action** — it fully deletes their Supabase account. To restore access afterward requires sending them a brand-new invite from scratch, not "un-revoking" anything. A confirmation dialog spells this out before it happens.

### Access Requests section
Shows every request an investor has made to open a locked (or mixed-tier) document, with investor email, file name, project, date, and current status.

- **When an investor requests a locked document:** a row appears here with status "pending," and Chin gets an email at `c@misanpartners.com` with the investor's email, the file/project name, and a link back to the admin panel.
- **Approve:** click "Approve." The investor receives an email notification immediately, and the next time they open that project's data room, the file shows as "OPEN ↓" — no further action needed from them.
- **Decline:** click "Decline." The investor sees "Access Declined · contact us" (with a clickable `mailto:` link to `c@misanpartners.com`) instead of a request button when they view that file — it's a dead end by design; if they need to try again, they'd need to reach out.
- **Revoke previously approved access:** for an already-approved row, click "Revoke." This is a *different, much lighter* action than revoking an investor's whole account — it just flips that one file's status back, and the investor sees the request button again the next time they view it (they can request it again). Their account and everything else they have access to is untouched.
- **Search and filter:** the search box filters by investor email or file name (case-insensitive, live as you type); the status dropdown filters to All/Pending/Approved/Declined/Revoked. The list refreshes automatically every 60 seconds.

---

## 4. Investor Experience

### First login (invite flow)
1. Investor receives an invite email from Supabase (subject/content is the Supabase default template unless customized in the Supabase dashboard under Authentication → Email Templates → Invite User — this has **not** been customized yet).
2. Clicking the link lands them on `/investors/` with a token in the URL, which immediately redirects to `/investors/setup` carrying that token through.
3. They set a password (minimum 8 characters, confirmed twice) and are logged straight into the portal.

### Forgot password
A "Forgot password?" link on the login page reveals an email field. Submitting it triggers Supabase to send a reset email (via the same `/investors/setup` page, using its `recovery` token type), where they set a new password and land in the portal — no admin involvement needed.

### What they see
- **Portal home:** a card per project (currently Arena X District and Galatians), each showing subsidiary, tagline, stage, headline stats, and funding progress.
- **Project pages:** milestones timeline, financing breakdown (confirmed vs. pipeline, tranches), team, partners, DFI conversations (where applicable), recent updates, and the data room.

### Data room documents
- **Open files:** a single "OPEN ↓" click downloads (or, for video files, opens Google Drive's streaming preview — no download needed) the file directly. No approval required.
- **Locked (and Mixed-tier) files:** show "REQUEST →." Clicking it submits a request (see Admin Panel above). While pending, it shows "Requested ✓" (greyed out). Once approved, it automatically becomes "OPEN ↓" the next time that folder is viewed — the investor doesn't need to do anything else. If declined, it shows "Access Declined · contact us."

  *Accuracy note: the "Mixed" tier is described in places as meaning individual files within the folder carry their own tier, but in the current implementation every file in a Mixed folder is treated exactly like Locked — Google Drive doesn't expose which specific files should be open vs. locked, so there's no way today to make some files in a Mixed folder open and others locked automatically. If true per-file control is needed, that's a developer task, not a Drive-folder setting.*

- **Subfolders** (a folder inside a folder) show a "VIEW →" button that expands inline to show that subfolder's contents, without leaving the page or opening a new tab.
- **Approval status persists:** once approved, a file stays open on every subsequent login — it's not a one-time unlock.

---

## 5. Document Management — Google Drive

All actual document files live in Google Drive, in the folders originally shared for OAuth access. Chin manages the files directly in Drive — the portal reads from Drive live, it does not store copies.

- **Adding a document:** upload it into the correct project's correct folder in Drive. It appears in the portal's data room the next time that folder is viewed (typically instant — there's no caching step).
- **Removing a document:** delete it from Drive. It disappears from the portal the same way.
- **Permission tiers**, set per *folder* (not per file, with the Mixed caveat above):
  - **Open** — any logged-in investor can view/download instantly, no approval.
  - **Locked** — investor must request access; Chin approves or declines in the admin panel.
  - **Mixed** — currently behaves exactly like Locked (see note above).
- **Current folder structure:**
  - **Arena X District (AXD):** 7 folders — AXD Overview (Open), Investment Terms (Locked), Corporate & Legal (Locked), Design & Technical (Locked), Market & Feasibility (Mixed), Financial Model (Locked), Team & Partners (Open).
  - **Galatians:** 4 folders — Pitch & Vision (Open), Script & Treatment (Locked), Budget & Finance (Locked), Investment & Legal (Locked).
- **Adding a new folder or changing a folder's tier** requires a developer — the folder list, numbering, and tier assignment live in `investors/data/axd.json` / `investors/data/galatians.json` (or their markdown sources), not in Drive itself. Drive only controls what's *inside* an existing folder.

---

## 6. Content Updates — Milestones, Updates, Raise Figures

Everything on a project page *except* the data room documents (milestones, raise figures, team, headline stats, recent updates, DFI conversations) is controlled by two plain-language source files at the project root: `AXD_source.md` and `Galatians_source.md`.

**The workflow:**
1. Open the relevant source file in Claude (it reads like a simple form — see `scripts/content-update-guide.md` for exact examples of what to type).
2. Describe the change in plain English; Claude edits the file.
3. Get the updated file into the GitHub repository — either by sending it to the developer to commit, or by pushing it directly if you have repo access.
4. A GitHub Actions workflow (`.github/workflows/md-to-json.yml`) detects the change automatically, regenerates the corresponding JSON file, and commits it back to `main` — no one needs to run any command by hand. This typically completes within a couple of minutes, and Vercel redeploys automatically once it does.

**What can be updated this way:** milestones (including status and progress %), raise/financing figures, team members, partners, headline stats, recent updates, and basic project info (name, tagline, stage). **What can't:** the data room folder structure and tiers (developer task — see above), and a handful of fields not yet wired into the markdown format (`entities`, `subsidiary_color`, and Galatians' `casting`/`investors`/`format`) — these still require a direct, careful JSON edit by a developer if they ever need to change.

---

## 7. Email Notifications

All email is sent via **Resend**, from `notifications@misanpartners.com`.

| Event | Recipient | Content |
|---|---|---|
| Invite / resend invite | Investor | Supabase's default invite email with a one-time setup link |
| Password reset requested | Investor | Supabase's default reset email with a one-time link |
| Document access request submitted | Chin (`c@misanpartners.com`) | Investor email, file/project name, link to admin panel |
| Document access approved | Investor | Confirmation + link to log in and view the file |

If an email fails to send (e.g. Resend API issue) or `RESEND_API_KEY` isn't set, the underlying action (approval, request, invite) still completes successfully — email delivery never blocks the actual functionality.

---

## 8. Security

This system went through a dedicated security audit; see the git history for the full report ("Security audit fixes" commit and surrounding conversation). Summary of what's in place:

- **Invite-only access** — there is no public signup path anywhere for investor accounts.
- **HttpOnly, Secure, SameSite=Strict cookies** for all sessions (`misan_session`, `misan_refresh`, `misan_admin`) — JavaScript running in the browser (including any injected via XSS) cannot read them, and they're never sent over plain HTTP.
- **Server-side tier enforcement** — file downloads independently re-verify approval status against the database using the investor's authenticated session; the client-supplied "tier" parameter is only ever trusted for the literal value `open`, so it cannot be tampered with to bypass a locked file.
- **Rate limiting** on the admin login (5 attempts / 15 minutes / IP address) to resist password-guessing. Note: this limiter is in-memory, so it resets if the serverless function cold-starts and isn't shared across concurrent server instances — it's a meaningful deterrent, not an unbreakable one. A persistent-store-backed limiter (Vercel KV/Upstash) would be the next step if this ever needs to be hardened further.
- **Confidential source files excluded from the public deployment** via `.vercelignore` — `AXD_source.md`, `Galatians_source.md`, and this handover documentation are never served as public static files, even though this is a build-less static site that would otherwise expose the entire repository root.
- **All API keys and secrets live only in Vercel's encrypted environment variables** — never in the codebase, never in GitHub, confirmed via a full grep of the entire git history.
- **Row-level security enabled** on the `access_requests` table in Supabase.
- **Full audit trail** — every access request (including revoked/declined ones) remains in the `access_requests` table indefinitely as a historical record; nothing is deleted on decline or revoke, only its status changes.

**Known, deliberate tradeoff:** the admin panel's session cookie value is literally the `ADMIN_PASSWORD` itself, not a separate derived token — simple by design, appropriate for a single trusted admin user, but it does mean that if that cookie were ever intercepted, the attacker would have the actual master password (fixing that requires rotating the password, not just logging out). Worth revisiting if the admin panel ever needs to support multiple admin users.

---

## 9. Repository Structure

```
/                           — public marketing site (index.html, etc.)
investors/                  — investor-facing pages (login, portal, setup)
investors/data/             — generated JSON (axd.json, galatians.json) — never edit directly
admin/                       — admin panel (single-page app)
api/auth/, api/admin/, api/drive/  — serverless functions
assets/                     — shared CSS/JS/fonts/images
scripts/                    — md-to-json.js converter + documentation
.github/workflows/          — GitHub Actions (auto content conversion)
supabase/migrations/        — database schema
AXD_source.md, Galatians_source.md  — editable content sources (excluded from public deployment)
```

## 10. Deployment & Operations

- **Deployment is automatic:** every push to `main` on GitHub triggers a Vercel deployment. There is no manual deploy step.
- **Content changes** (via the markdown source files) also auto-deploy, via the GitHub Actions conversion step described in Section 6.
- **To check on things:** the Vercel dashboard shows deployment status and function logs (useful for diagnosing any API errors); the Supabase dashboard shows the `access_requests` table directly and the investor user list under Authentication.
- **If something breaks:** check Vercel's function logs first (most API endpoints log meaningful context on failure), then Supabase's logs, then Google Cloud Console for the Drive API credentials if document-related.

---

## 11. What Was Delivered Beyond Original Scope

- Full password setup flow for invited investors (not just "login with a temp password")
- Forgot password / self-service reset flow
- Resend an expired invite directly from the admin panel
- Per-investor, per-file access status that persists across logins (approved stays open; no re-requesting each time)
- Revoke access on a previously-approved file (distinct from revoking a whole account)
- Admin search and filter by investor email, file name, and status
- Video streaming via Google Drive's native player (no download required)
- Inline subfolder browsing in the data room
- Rate limiting on admin login
- Full mobile-responsive design across every page, audited and fixed at 375px width
- GitHub Actions auto-deployment of content changes (edit a markdown file, everything else is automatic)
- A dedicated security audit, with the public-file-exposure finding fixed immediately
- A consolidated API architecture, engineered specifically to stay within Vercel's free-tier function limits with room for future growth
