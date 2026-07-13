# MD → JSON conversion

The investor portal reads `investors/data/axd.json` and `investors/data/galatians.json`.
Instead of editing those JSON files by hand, edit the plain-language source files at the
project root — `AXD_source.md` and `Galatians_source.md` — and run the converter.

## How to run

```
npm run md-to-json
```

This reads `AXD_source.md` and `Galatians_source.md` from the project root and rewrites
`investors/data/axd.json` and `investors/data/galatians.json` to match. It logs which
sections it updated for each file.

On every push to `main` that touches either source file, a GitHub Actions workflow
(`.github/workflows/md-to-json.yml`) runs this same conversion automatically and commits
the regenerated JSON back to `main` — so in the normal flow you never need to run this by
hand; it's here for local testing/preview before you push.

## ⚠️ Never edit the JSON files directly

`investors/data/axd.json` and `investors/data/galatians.json` are **generated output**.
Any manual edit made directly to them will be silently overwritten the next time someone
edits the source markdown and the converter runs (locally or via CI). Always make content
changes in `AXD_source.md` / `Galatians_source.md` instead.

**Important caveat:** the converter only regenerates the fields listed below. A handful of
fields that exist in the JSON today — `subsidiary_color`, `entities`, `dfi_conversations`,
and (Galatians-only) `format`, `casting`, `investors` — are **not** covered by any markdown
section yet. The converter preserves whatever value is currently in the JSON for those
fields rather than touching them, so for now they still have to be edited directly in the
JSON file if they ever need to change. Let the person who set this up know if you want
markdown sections added for these too.

## Editing the source markdown files

Each file is split into `## Section` headings. Only the sections below are recognized —
anything else (a top-level `# Title`, extra prose, etc.) is ignored.

### `## Basics`
```
## Basics
ID: axd
Subsidiary: Misan Spaces
Name: Arena X District
Tagline: West Africa's first 15,000-seat arena, in a 9.25 ha mixed-use district. Alaro City, Lagos.
Stage: Pre-Development
```
One `Key: Value` line per field. Maps to the top-level `id`, `subsidiary`, `name`,
`tagline`, `stage` fields.

### `## Raise`
```
## Raise
Phase label: Phase 1 Pre-Development
Target: 3000000
Committed: 550000
Pipeline: 2450000
Pipeline note: Gap to target ($3M target less $550k committed)
```
Numbers can be typed plain (`3000000`) — commas/currency symbols are stripped
automatically. Note: `raise.tranches` (the Seed/Tranche 2/Full close breakdown) isn't
covered here and is preserved from the existing JSON as-is.

### `## Headline stats`
```
## Headline stats
Stage: Pre-Development
Round: $3M Phase 1
Committed: $550k
Targeted open: 2033
```
Each `Key: Value` line becomes one `{ label, value }` card, in the order written.

### `## Team` / `## Partners`
```
## Team
Chin Okeke | Founder
Kelechi Odu | Design Partner
```
One person per line: `Name | Role`.

### `## Milestones`
```
## Milestones
[complete] Oct 2024 | Site secured · 9.25 ha, Alaro City
[in progress] May 2026 | Kéré RIBA Stage 1 · internal review | 25% | Week 2 of 8-week review before authorising Stage 2.
[upcoming] Q2 2026 | Quantity Surveyor engagement
```
Format: `[status] date | title` — with two optional trailing fields for an in-progress
milestone: `| progress% | note`. Leave a field blank (`| |`) to skip progress but still
give a note. Status can be written `complete`, `in progress` (or `in_progress`), or
`upcoming` — it's normalized automatically.

### `## Updates`
```
## Updates
May 2026 | May 2026 investor update | Brian Efa joins as CFO. Corporate structure complete. ...
```
Format: `date | title | summary`.

### `## Documents` (or `## Data Room`)
```
## Documents
### 01 · AXD Overview
- AXD Investor Update · May 2026 | PDF | May 2026
- AXD Investment Proposition | PDF | Dec 2025

### 02 · Investment Terms
(no documents — managed via Google Drive)
```
Each `### NN · Folder Title` sub-heading is matched against an **existing** folder in the
JSON by number, falling back to matching by title. **Folders themselves (id, number,
title, tier, and Google Drive `drive_url`) are never created or changed here** — only that
folder's `documents` list is replaced with the bullet lines under its heading, one
document per line: `- Title | Type | Date`.

If a folder heading has no bullet lines under it and no `(no documents...)` line, its
existing document list is left untouched. Write `(no documents ...)` explicitly if you
want to clear it out.

Since most folders are already wired to a live Google Drive folder (`drive_url` set), this
section usually only matters for folders that don't have one yet — the portal fetches live
file listings from Drive directly for anything that does.
