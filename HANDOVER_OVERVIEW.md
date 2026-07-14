# Misan Partners Investor Portal — Overview for Chin

This is a production-grade, fully custom investor portal built specifically for Misan Partners. What's been delivered goes significantly beyond a standard brief — it includes enterprise-level security, a complete document management system with Google Drive integration, invite-only authentication with full password management, a real-time admin control panel, email notifications, mobile-responsive design, and an automated content workflow. Here's everything you need to know to run it.

*(For the full technical reference, see `HANDOVER.md`. For exact instructions on updating content via Claude, see `scripts/content-update-guide.md`.)*

---

## Portal Overview

The portal gives your investors a live, private view of their investments — progress, financials, team, and a permission-controlled document library — without ever handing them a login to a shared drive or spreadsheet.

There are three separate spaces:

- **The public site** — `misanpartners.com` — what anyone sees.
- **The investor portal** — `misanpartners.com/investors/` — where invited investors log in and follow their projects.
- **The admin panel** — `misanpartners.com/admin/` — yours alone, for managing investors and document access.

---

## Admin Panel — `misanpartners.com/admin/`

**Logging in:** one password, set by you (stored securely, never visible in any code). Five wrong attempts in 15 minutes and it locks out further tries for that period — built-in protection against anyone trying to guess it.

### Investors

- **Invite a new investor:** type their email, click send. They get an email with a one-time link, choose their own password, and land straight in the portal. You never see or handle their password.
- **Resend an expired invite:** one click next to their name if the original link timed out or got lost.
- **Revoke access permanently:** one click deletes their account entirely. This is final — bringing them back means sending a brand-new invite, not "undoing" anything. A confirmation prompt makes sure this is intentional every time.

### Access Requests

When an investor wants to open a locked document, a request lands here, and you get an email straight away with their name, the file, and a link to review it.

- **Approve** — the investor is notified by email instantly, and the file just opens for them from then on. Nothing further needed on your end.
- **Decline** — they see a polite "Access Declined — contact us" message with your email address, instead of the file.
- **Revoke previously approved access** — a lighter version of revoke: it just closes that one file back up. The investor keeps their account and everything else; they'd simply need to request that file again.
- **Search and filter** — find any request instantly by investor email, file name, or status (pending/approved/declined/revoked).

---

## Investor Experience

**First time:** they get an invite email, click through, choose a password, and they're in — no back-and-forth with you required.

**Forgot password:** a link on the login page lets them reset it themselves, the same way.

**What they see:** a card for each project, then — inside each — milestones, financing progress, team, partners, recent updates, and a document library.

**Documents:**
- **Open** files download (or, for videos, stream right in the browser via Google's player) with one click.
- **Locked** files show a "Request" button. Once you approve it, the file simply opens for them from then on — they don't need to ask again.
- Folders-within-folders open right there on the page, no extra clicks to a new tab.

---

## Document Management — Google Drive

Every document lives in Google Drive, exactly where it already does. You manage files there directly:

- **Add a document** — drop it in the right folder in Drive. It shows up in the portal right away.
- **Remove a document** — delete it from Drive. Gone from the portal just as fast.
- **Access tiers**, set per folder:
  - **Open** — any investor can view it immediately.
  - **Locked** — needs your approval first.
- Arena X District has 7 folders set up; Galatians has 4.
- Adding a brand-new folder (not just files inside an existing one) needs a quick developer touch — that structure is defined outside of Drive itself.

---

## Content Updates — Milestones, Figures, Team

The story on each project page — milestones, raise figures, team, recent updates — is controlled by two simple text files, one per project, that read like a form rather than code.

**How it works:** open the file in Claude, describe the change in plain English ("mark the RIBA Stage 1 milestone as complete," "update the raise to $600k committed"), and Claude makes the edit. Get that file to your developer (or push it yourself if you have repo access) — from there, everything updates automatically within a couple of minutes. No one has to manually run anything.

See `scripts/content-update-guide.md` for exact examples of what to say to Claude.

---

## Email Notifications

Every notification is sent automatically via Resend, from `notifications@misanpartners.com`:

- **Investors** get an email when they're invited and again the moment their document request is approved.
- **You** get an email at `c@misanpartners.com` the instant an investor requests access to something locked, with a direct link back to the admin panel.

---

## Security — What's Protecting This

- **Invite-only, always** — there's no public sign-up page anywhere; every account starts with you.
- **Session cookies that JavaScript can't touch** — even if a browser were somehow compromised, the login session itself can't be lifted out of it.
- **Every locked file is checked on the server, every time** — someone trying to fake their way past a lock by tampering with the app directly (not just clicking around) would still be blocked, because the actual approval check happens on our servers against the database, not just in what the browser shows.
- **Login attempts are rate-limited** — 5 tries per 15 minutes per visitor, to make password-guessing impractical.
- **Confidential business files are excluded from the public website entirely** — even the raw source files behind your project pages aren't publicly reachable.
- **All passwords and API keys are encrypted in our hosting provider (Vercel) — never stored in the code, never visible in GitHub.**
- **Every access request is permanently logged** — a full history of who requested what, and what you decided, is kept indefinitely.

---

## Technical Stack (for reference)

| Layer | What it uses |
|---|---|
| Website | Static HTML/CSS/JS, hosted on Vercel |
| Investor login | Supabase Auth (invite-only) |
| Database | Supabase (PostgreSQL) |
| Documents | Google Drive API |
| Email | Resend |
| Content updates | GitHub Actions (automatic) |
| Hosting | Vercel (free tier) |
| Domain/DNS | cPanel |

---

## What Was Built Beyond the Original Scope

A lot of what's listed above wasn't part of a minimal brief — it was built in because it makes the portal genuinely usable day-to-day, not just functional:

- Full self-service password setup for every invited investor
- Forgot-password / reset flow, no admin involvement needed
- One-click resend for expired invites
- Per-investor access that sticks — once approved, a file stays open on every future login
- A "revoke just this file" option, separate from revoking someone's whole account
- Search and filter across every access request
- Video files that stream directly, no download required
- Subfolders that browse inline, right on the page
- Rate limiting on the admin login
- A fully mobile-responsive design, tested and fixed across every page
- Fully automated content publishing — edit a text file, everything else happens on its own
- A dedicated security audit, with the one serious finding (a public-file exposure) fixed the same day it was found
- A backend architecture specifically engineered to run entirely within Vercel's free tier, with room to keep growing

This is infrastructure most portals at this stage don't have. It's built to last.
