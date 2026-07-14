# Updating Portal Content with Claude — A Guide for Chin

Everything on a project page — milestones, raise figures, team, recent updates — lives in one simple text file per project:

- **Arena X District** → `AXD_source.md`
- **Galatians** → `Galatians_source.md`

These files read like a form, not code. You never touch the portal's actual code or the JSON files it runs on — you just describe the change you want in plain English, and Claude edits the source file for you.

## The workflow, every time

1. **Open the relevant source file in Claude** (drag it in, paste its contents, or ask Claude to open it if it already has access to the project).
2. **Tell Claude what you want changed**, in plain English — see examples below.
3. **Review what Claude changed** — it'll show you the before/after.
4. **Get the updated file into the project.** If you have access to push to the GitHub repository yourself, do that. Otherwise, send the updated file to your developer.
5. **That's it.** Once the file lands on the `main` branch, an automated process (GitHub Actions) converts it into what the portal actually displays and publishes it — usually within a couple of minutes. Nobody needs to run a command by hand.

You do not need to understand the exact formatting rules to use this — that's what Claude is for. The examples below are just so you know what a good request sounds like.

---

## Example 1 — Adding a milestone

**What to say to Claude:**

> "In AXD_source.md, add a new completed milestone: 'Quantity Surveyor engaged' dated June 2026. Mark it as complete."

Claude will find the `## Milestones` section and add a line like:

```
[complete] Jun 2026 | Quantity Surveyor engaged
```

**Marking an existing milestone as done**, e.g. moving one from "in progress" to "complete":

> "In AXD_source.md, change the milestone 'Kéré RIBA Stage 1 · internal review' to complete, and update the date to July 2026."

**Adding a milestone with a progress note** (for something still in progress):

> "In Galatians_source.md, add an in-progress milestone: 'Location scouting — Lagos' dated Q3 2026, at 40% complete, with the note 'Three sites shortlisted, final decision pending.'"

---

## Example 2 — Updating raise / financing figures

**What to say to Claude:**

> "In AXD_source.md, update the Raise section: committed is now $700,000, pipeline is now $2,300,000."

Claude will update the `## Raise` section's `Committed:` and `Pipeline:` lines. It'll also usually offer to update the matching `Committed` figure in the `## Headline stats` section so the two stay consistent — say yes, or point it out yourself if it doesn't.

**Updating the headline stats directly:**

> "In AXD_source.md, under Headline stats, change 'Committed' to $700k."

---

## Example 3 — Adding a team member

**What to say to Claude:**

> "In Galatians_source.md, add a new team member: 'Ada Obi' as 'Line Producer', after Chin Okeke."

Claude will add a line to the `## Team` section:

```
Ada Obi | Line Producer
```

**Removing someone from the team:**

> "In AXD_source.md, remove Kelechi Odu from the Team section."

**Adding a partner** works the same way, just mention "Partners" instead of "Team":

> "In AXD_source.md, add 'Firstbank Nigeria' as a Partner with the role 'Banking Partner'."

---

## Example 4 — Adding a recent update

**What to say to Claude:**

> "In AXD_source.md, add a new update dated July 2026 titled 'July 2026 investor update', with this summary: 'Quantity Surveyor engaged. Financing conversations advancing with two DFIs. On track for Phase 1 close by Q4.'"

---

## What you can update this way

Milestones (including status and progress %), raise/financing figures, team members, partners, headline stats, recent updates, and basic project info (name, tagline, stage).

## What you can't update this way

- **The document library folder structure and access tiers** (which folders exist, whether they're Open or Locked) — that's set outside these files and needs a developer.
- **Documents themselves** — those are managed directly in Google Drive, not through these files at all.
- A handful of fields not yet wired into this format (DFI conversation stages beyond adding new ones, casting/investor lists for Galatians, entity names) — if you need one of these changed, just ask; it may need a direct developer edit rather than going through Claude.

If you're ever unsure whether something belongs in the source file or needs a developer, just ask Claude — it can tell you which category your request falls into before making any change.
