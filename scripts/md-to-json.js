#!/usr/bin/env node
/*
 * Converts AXD_source.md / Galatians_source.md (project root) into the JSON
 * files the portal reads (investors/data/axd.json, investors/data/galatians.json).
 *
 * Only the fields covered by the documented markdown sections (see
 * scripts/README.md) are regenerated on each run. Every other existing JSON
 * field — including data_room folder id/number/title/tier/drive_url — is
 * preserved untouched by merging onto the current JSON rather than
 * rebuilding it from scratch.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const SOURCES = [
  { md: 'AXD_source.md', json: 'investors/data/axd.json' },
  { md: 'Galatians_source.md', json: 'investors/data/galatians.json' },
];

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseSections(mdText) {
  const lines = mdText.split(/\r?\n/);
  const sections = {};
  let current = null;

  lines.forEach((line) => {
    const h2 = line.match(/^##\s+(.+?)\s*$/);
    if (h2) {
      current = h2[1].trim();
      sections[current] = sections[current] || [];
      return;
    }
    if (current) sections[current].push(line);
  });

  return sections;
}

function parseKeyValueLines(lines) {
  const obj = {};
  lines.forEach((raw) => {
    const line = raw.trim();
    if (!line) return;
    const idx = line.indexOf(':');
    if (idx === -1) return;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    obj[key] = value;
  });
  return obj;
}

function parseBasics(lines, existing) {
  const kv = parseKeyValueLines(lines);
  return {
    id: kv.ID || existing.id,
    subsidiary: kv.Subsidiary || existing.subsidiary,
    name: kv.Name || existing.name,
    tagline: kv.Tagline || existing.tagline,
    stage: kv.Stage || existing.stage,
  };
}

function parseRaise(lines, existing) {
  const kv = parseKeyValueLines(lines);
  const raise = { ...(existing.raise || {}) };

  if (kv['Phase label'] != null) raise.phase_label = kv['Phase label'];
  if (kv.Target != null) raise.target_usd = Number(kv.Target.replace(/[^0-9.-]/g, ''));
  if (kv.Committed != null) raise.committed_usd = Number(kv.Committed.replace(/[^0-9.-]/g, ''));
  if (kv.Pipeline != null) raise.pipeline_usd = Number(kv.Pipeline.replace(/[^0-9.-]/g, ''));
  if (kv['Pipeline note'] != null) raise.pipeline_note = kv['Pipeline note'];

  return raise; // tranches (if any) are preserved via the spread above
}

function parseHeadlineStats(lines) {
  const kv = parseKeyValueLines(lines);
  return Object.entries(kv).map(([label, value]) => ({ label, value }));
}

function parsePeopleList(lines) {
  return lines
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [name, role] = l.split('|').map((s) => (s || '').trim());
      return { name, role: role || '' };
    });
}

function normalizeStatus(raw) {
  const s = raw.trim().toLowerCase().replace(/\s+/g, '_');
  if (s === 'complete' || s === 'done') return 'complete';
  if (s === 'in_progress') return 'in_progress';
  if (s === 'upcoming') return 'upcoming';
  return s;
}

function parseMilestones(lines, existing) {
  const existingList = existing.milestones || [];
  let counter = 0;

  return lines
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^\[(.+?)\]\s*(.+)$/);
      if (!m) return null;

      const status = normalizeStatus(m[1]);
      const [date, title, progressRaw, note] = m[2].split('|').map((s) => (s || '').trim());
      counter += 1;

      const match = existingList.find((e) => e.title === title && e.date === date);
      const milestone = {
        id: (match && match.id) || `m${counter}`,
        title,
        date,
        status,
      };

      if (progressRaw) {
        const pct = parseInt(progressRaw.replace(/[^0-9]/g, ''), 10);
        if (!Number.isNaN(pct)) milestone.progress_pct = pct;
      }
      if (note) milestone.note = note;

      return milestone;
    })
    .filter(Boolean);
}

function parseUpdates(lines, existing) {
  const existingList = existing.updates || [];

  return lines
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [date, title, summary] = l.split('|').map((s) => (s || '').trim());
      const match = existingList.find((e) => e.date === date && e.title === title);

      return {
        id: (match && match.id) || `u-${slugify(date)}`,
        date,
        title,
        summary: summary || '',
        document_id: match ? match.document_id : null,
      };
    });
}

function parseDocuments(lines, existing) {
  const existingFolders = (existing.data_room && existing.data_room.folders) || [];
  const updatedFolders = existingFolders.map((folder) => ({
    ...folder,
    documents: folder.documents ? [...folder.documents] : [],
  }));

  const subSections = [];
  let current = null;

  lines.forEach((raw) => {
    const h3 = raw.match(/^###\s+(.+?)\s*$/);
    if (h3) {
      current = { heading: h3[1].trim(), lines: [] };
      subSections.push(current);
      return;
    }
    if (current) current.lines.push(raw);
  });

  subSections.forEach((sec) => {
    const numMatch = sec.heading.match(/^(\d+)/);
    const number = numMatch ? numMatch[1].padStart(2, '0') : null;
    const titlePart = sec.heading.replace(/^\d+\s*[·.\-]?\s*/, '').trim();

    const folder = (number && updatedFolders.find((f) => f.number === number))
      || updatedFolders.find((f) => (f.title || '').toLowerCase() === titlePart.toLowerCase());

    if (!folder) return; // unknown folder in the markdown — folders themselves are Drive-managed, not created here

    const docLines = sec.lines.map((l) => l.trim()).filter((l) => l.startsWith('-'));
    const noDocsMarker = sec.lines.some((l) => /\(no documents/i.test(l));

    if (!docLines.length) {
      if (noDocsMarker) folder.documents = [];
      return; // no bullet lines and no explicit "(no documents)" marker — leave existing documents untouched
    }

    const existingDocs = folder.documents || [];
    folder.documents = docLines.map((l) => {
      const content = l.replace(/^-+\s*/, '');
      const [title, type, date] = content.split('|').map((s) => (s || '').trim());
      const match = existingDocs.find((d) => d.title === title);

      return {
        id: (match && match.id) || `d-${slugify(title)}`,
        title,
        type: type || '',
        date: date || '',
      };
    });
  });

  return {
    ...(existing.data_room || {}),
    folders: updatedFolders,
  };
}

function convert(mdPath, jsonPath) {
  const mdText = fs.readFileSync(mdPath, 'utf8');
  const existingJson = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const sections = parseSections(mdText);

  const result = { ...existingJson };
  const updatedKeys = [];

  if (sections.Basics) {
    Object.assign(result, parseBasics(sections.Basics, existingJson));
    updatedKeys.push('basics (id/subsidiary/name/tagline/stage)');
  }
  if (sections.Raise) {
    result.raise = parseRaise(sections.Raise, existingJson);
    updatedKeys.push('raise');
  }
  if (sections['Headline stats']) {
    result.headline_stats = parseHeadlineStats(sections['Headline stats']);
    updatedKeys.push('headline_stats');
  }
  if (sections.Team) {
    result.team = parsePeopleList(sections.Team);
    updatedKeys.push('team');
  }
  if (sections.Partners) {
    result.partners = parsePeopleList(sections.Partners);
    updatedKeys.push('partners');
  }
  if (sections.Milestones) {
    result.milestones = parseMilestones(sections.Milestones, existingJson);
    updatedKeys.push('milestones');
  }
  if (sections.Updates) {
    result.updates = parseUpdates(sections.Updates, existingJson);
    updatedKeys.push('updates');
  }

  const docSectionLines = sections.Documents || sections['Data Room'];
  if (docSectionLines) {
    result.data_room = parseDocuments(docSectionLines, existingJson);
    updatedKeys.push('data_room.folders[].documents');
  }

  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2) + '\n');

  return updatedKeys;
}

function main() {
  let converted = 0;

  SOURCES.forEach(({ md, json }) => {
    const mdPath = path.join(ROOT, md);
    const jsonPath = path.join(ROOT, json);

    if (!fs.existsSync(mdPath)) {
      console.log(`[md-to-json] SKIP — ${md} not found at project root.`);
      return;
    }

    const updatedKeys = convert(mdPath, jsonPath);
    converted += 1;
    console.log(`[md-to-json] ${md} -> ${json}`);
    console.log(`[md-to-json]   updated: ${updatedKeys.length ? updatedKeys.join(', ') : '(no recognized sections found)'}`);
  });

  console.log(`[md-to-json] Done. ${converted} file(s) converted.`);
}

main();
