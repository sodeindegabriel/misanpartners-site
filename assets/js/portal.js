/* Misan Partners — investor portal
 * Reads project JSON files and renders home + project pages.
 * Replace the front-end-only data load below with a backend call when
 * Gabriel wires real auth + per-investor data.
 */
(function(){
  'use strict';

  // ---------------------- helpers ----------------------

  const $ = (sel, el = document) => el.querySelector(sel);
  const fmtUSD = n => {
    if (n == null) return '';
    if (n >= 1e6) return '$' + (n/1e6).toFixed(n%1e6===0?0:1) + 'M';
    if (n >= 1e3) return '$' + Math.round(n/1e3) + 'k';
    return '$' + n;
  };
  const tierLabel = t => t === 'open' ? 'Open' : t === 'locked' ? 'Locked · admin approval' : 'Mixed · open + locked';
  const escapeHTML = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
  ));

  function extractFolderId(driveUrl){
    if (!driveUrl) return null;
    const m = driveUrl.match(/\/folders\/([^/?#]+)/);
    return m ? m[1] : null;
  }

  const MIME_TYPE_LABELS = {
    'application/pdf': 'PDF',
    'application/vnd.google-apps.document': 'Doc',
    'application/vnd.google-apps.spreadsheet': 'Sheet',
    'application/vnd.google-apps.presentation': 'Slides',
    'application/vnd.google-apps.folder': 'Folder',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Doc',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'Slides',
    'application/msword': 'Doc',
    'application/vnd.ms-excel': 'Sheet',
    'application/zip': 'Zip',
    'text/csv': 'CSV',
    'text/plain': 'Text'
  };

  function mimeToType(mimeType){
    if (!mimeType) return 'File';
    if (MIME_TYPE_LABELS[mimeType]) return MIME_TYPE_LABELS[mimeType];
    if (mimeType.indexOf('image/') === 0) return mimeType.split('/')[1].toUpperCase();
    const last = mimeType.split('/').pop().split('.').pop();
    return last ? last.toUpperCase() : 'File';
  }

  // MISAN wordmark SVG (re-used in topbar)
  function markSVG(){
    return '<svg class="mark" viewBox="0 0 524.43 84.91" xmlns="http://www.w3.org/2000/svg" fill="#fff" role="img" aria-label="MISAN">'
      + window.MISAN_PATHS.map(d => '<path d="'+d+'"/>').join('')
      + '</svg>';
  }

  function topbar(crumbHTML){
    return `<div class="topbar">
      ${markSVG()}
      <div class="crumbs">${crumbHTML}</div>
      <div class="spacer"></div>
      <a href="../index.html" class="signout">Sign out</a>
    </div>`;
  }

  function footer(){
    return `<footer class="foot">Confidential · Investors only</footer>`;
  }

  // ---------------------- data load ----------------------

  async function fetchJSON(id) {
    const url = `/investors/data/${id}.json`;
    try {
      const r = await fetch(url, { credentials: 'include' });
      const contentType = r.headers.get('content-type') || '';
      if (r.status === 401 || (r.redirected && !contentType.includes('application/json'))) {
        window.location.href = '/investors/';
        return null;
      }
      if (!r.ok) {
        return null;
      }
      return await r.json();
    } catch (err) {
      return null;
    }
  }

  async function loadProjects(){
    const list = ['axd', 'galatians'];
    const out = [];
    for (const id of list){
      try { out.push(await fetchJSON(id)); }
      catch(e){ console.error('Project load failed:', id, e); }
    }
    return out;
  }

  // ---------------------- data room (live Google Drive) ----------------------

  function fileRowHTML(file, tier){
    const type = mimeToType(file.mimeType);
    const isFolder = file.mimeType === 'application/vnd.google-apps.folder';

    if (isFolder){
      return `<div class="dr-row">
        <span class="n">${escapeHTML(file.name)}</span>
        <span class="meta">${escapeHTML(type)}</span>
        <a href="#" class="open-l dr-folder-open-btn" data-file-id="${escapeHTML(file.id)}" data-file-name="${escapeHTML(file.name)}">VIEW →</a>
      </div><div class="dr-sublist" style="display:none;margin-left:4px;padding-left:14px;border-left:1px solid rgba(255,255,255,.07)"></div>`;
    }

    const isVideo = (file.mimeType || '').startsWith('video/');
    const action = tier !== 'open'
      ? `<a href="#" class="lock-l dr-request-btn" data-file-id="${escapeHTML(file.id)}" data-file-name="${escapeHTML(file.name)}">REQUEST →</a>`
      : `<a href="#" class="open-l dr-download-btn" data-file-id="${escapeHTML(file.id)}" data-tier="${escapeHTML(tier)}">${isVideo ? 'PLAY ▶' : 'Open ↓'}</a>`;
    return `<div class="dr-row">
      <span class="n">${escapeHTML(file.name)}</span>
      <span class="meta">${escapeHTML(type)}</span>
      ${action}
    </div>`;
  }

  async function checkFileAccess(btn){
    const fileId = btn.dataset.fileId;

    try {
      const res = await fetch('/api/drive/access?fileId=' + encodeURIComponent(fileId), { credentials: 'include' });
      if (res.status === 401){
        window.location.href = '/investors/';
        return;
      }
      if (!res.ok) return;

      const { status } = await res.json();

      if (status === 'approved'){
        const openBtn = document.createElement('a');
        openBtn.href = '#';
        openBtn.className = 'open-l dr-download-btn';
        openBtn.dataset.fileId = fileId;
        openBtn.dataset.tier = 'open';
        openBtn.textContent = 'OPEN ↓';
        openBtn.addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          handleDownload(openBtn.dataset.fileId, openBtn.dataset.tier, openBtn);
        });
        btn.replaceWith(openBtn);
      } else if (status === 'pending'){
        btn.textContent = 'Requested ✓';
        btn.dataset.done = 'true';
        btn.style.color = 'rgba(255,255,255,.35)';
        btn.style.pointerEvents = 'none';
      }
      // status === 'none' — leave the button as the default "REQUEST →"
    } catch(e){
      console.error('Access check failed:', fileId, e);
    }
  }

  function bindRowActions(containerEl){
    containerEl.querySelectorAll('.dr-download-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        handleDownload(btn.dataset.fileId, btn.dataset.tier, btn);
      });
    });
    containerEl.querySelectorAll('.dr-request-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        handleRequestAccess(btn, btn.dataset.fileId, btn.dataset.fileName);
      });
      checkFileAccess(btn);
    });
    containerEl.querySelectorAll('.dr-folder-open-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        handleFolderOpen(btn.dataset.fileId, btn.dataset.fileName, btn);
      });
    });
  }

  function renderFolderFiles(folderEl, files, tier){
    const listEl = folderEl.querySelector('.dr-list');
    const countEl = folderEl.querySelector('.count');
    folderEl.dataset.tier = tier;
    if (countEl) countEl.textContent = files.length + ' ' + (files.length === 1 ? 'document' : 'documents');
    listEl.innerHTML = files.length
      ? files.map(f => fileRowHTML(f, tier)).join('')
      : '<div class="dr-row"><span class="n" style="color:rgba(255,255,255,.4)">No files in this folder.</span></div>';
    bindRowActions(listEl);
  }

  function showFolderError(folderEl, message){
    const listEl = folderEl.querySelector('.dr-list');
    const countEl = folderEl.querySelector('.count');
    if (countEl) countEl.textContent = '—';
    listEl.innerHTML = '<div class="dr-row"><span class="n" style="color:rgba(251,191,36,.85)">' + escapeHTML(message) + '</span></div>';
  }

  async function loadFolderFiles(folderEl, folder, projectName){
    const listEl = folderEl.querySelector('.dr-list');
    const folderId = extractFolderId(folder.drive_url);

    if (!folderId){
      const countEl = folderEl.querySelector('.count');
      if (countEl) countEl.textContent = '0 documents';
      listEl.innerHTML = '<div class="dr-row"><span class="n" style="color:rgba(255,255,255,.4)">No files available.</span></div>';
      return;
    }

    try {
      const res = await fetch('/api/drive/files?folderId=' + encodeURIComponent(folderId), { credentials: 'include' });
      if (res.status === 401){
        window.location.href = '/investors/';
        return;
      }
      if (!res.ok){
        showFolderError(folderEl, 'Could not load files.');
        return;
      }
      const files = await res.json();
      folderEl.dataset.projectName = projectName;
      renderFolderFiles(folderEl, files, folder.tier);
    } catch(e){
      console.error('Drive file list failed:', folder.id, e);
      showFolderError(folderEl, 'Could not load files.');
    }
  }

  async function handleFolderOpen(fileId, fileName, btn){
    const rowEl = btn.closest('.dr-row');
    const sublistEl = rowEl.nextElementSibling;
    if (!sublistEl) return;

    if (sublistEl.dataset.loaded === 'true'){
      sublistEl.style.display = sublistEl.style.display === 'none' ? 'block' : 'none';
      return;
    }

    const folderEl = btn.closest('.dr-folder');
    const tier = (folderEl && folderEl.dataset.tier) || 'open';

    sublistEl.style.display = 'block';
    sublistEl.innerHTML = '<div class="dr-row"><span class="n" style="color:rgba(255,255,255,.4)">Loading…</span></div>';

    try {
      const res = await fetch('/api/drive/files?folderId=' + encodeURIComponent(fileId), { credentials: 'include' });
      if (res.status === 401){
        window.location.href = '/investors/';
        return;
      }
      if (!res.ok){
        sublistEl.innerHTML = '<div class="dr-row"><span class="n" style="color:rgba(251,191,36,.85)">Could not load files.</span></div>';
        return;
      }
      const files = await res.json();
      sublistEl.innerHTML = files.length
        ? files.map(f => fileRowHTML(f, tier)).join('')
        : '<div class="dr-row"><span class="n" style="color:rgba(255,255,255,.4)">No files in this folder.</span></div>';
      bindRowActions(sublistEl);
      sublistEl.dataset.loaded = 'true';
    } catch(e){
      console.error('Subfolder load failed:', fileId, e);
      sublistEl.innerHTML = '<div class="dr-row"><span class="n" style="color:rgba(251,191,36,.85)">Could not load files.</span></div>';
    }
  }

  async function handleDownload(fileId, tier, btn) {
    if (tier !== 'open') return;
    const url = `/api/drive/download?fileId=${encodeURIComponent(fileId)}&tier=${encodeURIComponent(tier)}`;
    const original = btn.textContent;
    try {
      btn.textContent = 'Opening…';
      btn.style.pointerEvents = 'none';
      // Open in new tab — browser handles Content-Disposition: attachment natively
      window.open(url, '_blank');
    } catch (err) {
      alert('Download failed. Please try again.');
    } finally {
      btn.textContent = original;
      btn.style.pointerEvents = '';
    }
  }

  async function handleRequestAccess(btn, fileId, fileName){
    if (btn.dataset.busy || btn.dataset.done) return;
    btn.dataset.busy = 'true';

    const folderEl = btn.closest('.dr-folder');
    const projectName = (folderEl && folderEl.dataset.projectName) || '';
    const original = btn.textContent;
    btn.textContent = 'Requesting...';

    try {
      const res = await fetch('/api/drive/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId, fileName, projectName }),
        credentials: 'include'
      });
      if (res.status === 401){
        window.location.href = '/investors/';
        return;
      }
      if (!res.ok){
        btn.textContent = original;
        delete btn.dataset.busy;
        alert('Request failed. Please try again.');
        return;
      }
      btn.textContent = 'Requested ✓';
      btn.dataset.done = 'true';
      delete btn.dataset.busy;
    } catch(e){
      btn.textContent = original;
      delete btn.dataset.busy;
      alert('Request failed. Please try again.');
    }
  }

  // ---------------------- portal home ----------------------

  function renderHome(projects){
    const cards = projects.map(p => {
      const color = p.subsidiary_color || 'cyan';
      const latest = (p.updates && p.updates[0]) || null;

      // pull two stats to show on the card
      const s = p.headline_stats || [];
      const a = s[0] || {label:'', value:''};
      const b = s.find(x => /committed|equity/i.test(x.label)) || s[2] || {label:'', value:''};

      const committed = p.raise && p.raise.committed_usd;
      const target = p.raise && p.raise.target_usd;
      const pct = (committed && target) ? Math.round((committed/target)*100) : 0;

      return `<a class="card ${color}" href="portal/${p.id}/index.html">
        <div class="card-head">
          <div class="card-sub">${p.subsidiary}</div>
          <h2 class="card-title">${p.name}</h2>
          <p class="card-line">${p.tagline}</p>
          <div class="status-pill ${color==='cyan'?'green':'amber'}"><span class="dot"></span>${p.stage}</div>
        </div>
        <div class="card-stats">
          <div><div class="stat-l">${a.label}</div><div class="stat-v">${a.value}</div></div>
          <div><div class="stat-l">${b.label}</div><div class="stat-v">${b.value}</div></div>
        </div>
        <div class="card-bar">
          <div class="bar"><div class="fill" style="width:${pct}%"></div></div>
          <div class="bar-label">${fmtUSD(committed)} of ${fmtUSD(target)} · ${pct}%</div>
        </div>
        ${latest ? `<div class="card-foot">
          <div class="ko">Latest update · ${latest.date}</div>
          <div class="title">${latest.title}</div>
          <div class="sub">${(latest.summary||'').slice(0,140)}${latest.summary && latest.summary.length>140?'…':''}</div>
          <div class="cta">View progress →</div>
        </div>` : ''}
      </a>`;
    }).join('');

    document.body.innerHTML = `
      ${topbar('<a href="../index.html">Misan</a><span class="sep">/</span><span>Investors</span>')}
      <div class="amb"></div>
      <main class="portal">
        <div class="wrap">
          <section class="welcome">
            <div class="kicker">Welcome back</div>
            <h1>Your projects</h1>
            <p class="lede">Two active investments. Latest progress and documents below.</p>
          </section>
          <section class="cards">${cards}</section>
        </div>
        ${footer()}
      </main>`;
  }

  // ---------------------- project page ----------------------

  function renderProject(p){
    const color = p.subsidiary_color || 'cyan';
    const stats = (p.headline_stats || []).map(s =>
      `<div><div class="l">${s.label}</div><div class="v">${s.value}</div></div>`).join('');

    const milestones = (p.milestones || []).map(m => {
      const cls = `mile ${m.status}` + (color==='cyan' && m.status==='in_progress' ? ' cyan' : '');
      const progressBar = m.progress_pct ? `
        <div class="progress"><div class="fill" style="width:${m.progress_pct}%"></div></div>
        <div class="progress-label">${m.progress_pct}% complete</div>` : '';
      const note = m.note ? `<div class="note">${m.note}</div>` : '';
      const dateLabel = m.status === 'in_progress' ? 'In progress · ' + m.date
                      : m.status === 'upcoming'    ? 'Upcoming · '    + m.date
                      :                              'Done · '         + m.date;
      return `<div class="${cls}">
        <div class="dot"></div>
        <div class="date">${dateLabel}</div>
        <div class="title">${m.title}</div>
        ${note}${progressBar}
      </div>`;
    }).join('');

    const updates = (p.updates || []).map(u => `
      <div class="update">
        <div class="d">${u.date}</div>
        <div class="t">${u.title}</div>
        <div class="s">${u.summary || ''}</div>
      </div>`).join('');

    // financing
    const r = p.raise || {};
    const targetUSD = r.target_usd || 0;
    const confirmedPct = targetUSD ? Math.min(100, (r.committed_usd||0)/targetUSD*100) : 0;
    const pipelinePct  = targetUSD ? Math.min(100 - confirmedPct, (r.pipeline_usd||0)/targetUSD*100) : 0;

    const tranches = (r.tranches || []).map(t => `
      <div class="tranche ${t.status}">
        <div class="l">${t.label}</div>
        <div class="v">${fmtUSD(t.usd)}</div>
        <div class="s">${t.status.replace('_',' ')}</div>
      </div>`).join('');

    const finBlock = `
      <div class="block">
        <div class="section-l" style="margin-bottom:14px">Financing</div>
        <div class="stat-l" style="font-size:10px;letter-spacing:.22em;color:rgba(255,255,255,.4);text-transform:uppercase">Progress to target</div>
        <div class="fin-bar">
          <div class="confirmed" style="width:${confirmedPct}%"></div>
          <div class="pipeline"  style="width:${pipelinePct}%"></div>
        </div>
        <div class="fin-bar-label">${fmtUSD(r.committed_usd)} confirmed · ${fmtUSD(r.pipeline_usd)} in pipeline · ${fmtUSD(targetUSD)} target</div>
        ${tranches ? `<div class="tranches">${tranches}</div>` : ''}
        ${p.investors ? `
          <div class="fin-list">
            <div class="stat-l" style="font-size:10px;letter-spacing:.22em;color:rgba(255,255,255,.4);text-transform:uppercase;margin-bottom:6px">Confirmed · ${fmtUSD(p.investors.reduce((s,i)=>s+(i.usd||0),0))}</div>
            ${p.investors.map(i => `<div class="fin-row"><span class="n">${i.name}</span><span class="a">${fmtUSD(i.usd)}</span></div>`).join('')}
          </div>` : ''}
      </div>`;

    const dfiBlock = (p.dfi_conversations && p.dfi_conversations.length) ? `
      <div class="block">
        <div class="section-l" style="margin-bottom:12px">DFI Conversations</div>
        ${p.dfi_conversations.map(d => `
          <div class="dfi-row">
            <div class="dfi-name">${d.name}</div>
            <div class="dfi-stage">${d.stage}</div>
          </div>`).join('')}
      </div>` : '';

    const teamBlock = (p.team && p.team.length) ? `
      <div class="block">
        <div class="section-l" style="margin-bottom:12px">Team</div>
        <div class="people">${p.team.map(t => `
          <div class="person"><span class="n">${t.name}</span><span class="r">${t.role}</span></div>`).join('')}</div>
      </div>` : '';

    const partnersBlock = (p.partners && p.partners.length) ? `
      <div class="block">
        <div class="section-l" style="margin-bottom:12px">Partners</div>
        <div class="people">${p.partners.map(t => `
          <div class="person"><span class="n">${t.name}</span><span class="r">${t.role}</span></div>`).join('')}</div>
      </div>` : '';

    // data room
    const drFolders = (p.data_room && p.data_room.folders) || [];
    const folders = drFolders.map(f => {
      const hasDrive = !!f.drive_url;
      const loadingRow = '<div class="dr-row"><span class="n" style="color:rgba(255,255,255,.4)">Loading files…</span></div>';
      return `<div class="dr-folder ${f.tier}" data-folder="${f.id}">
        <div class="num">${f.number}</div>
        <div class="title">${f.title}</div>
        <div class="tier">${tierLabel(f.tier)}</div>
        <div class="count">${hasDrive ? 'Loading…' : '0 documents'}</div>
        <div class="action">${f.tier==='locked' ? 'Request →' : 'Open ↓'}</div>
        <div class="dr-list">${hasDrive ? loadingRow : ''}</div>
      </div>`;
    }).join('');

    document.body.innerHTML = `
      ${topbar(`<a href="../../index.html">Misan</a><span class="sep">/</span><a href="../../index.html">Investors</a><span class="sep">/</span><span>${p.name}</span>`)}
      <div class="amb"></div>
      <main class="portal proj ${color}">
        <div class="wrap">
          <a class="back" href="../../index.html">← All projects</a>
          <div class="proj-sub">${p.subsidiary}</div>
          <h1>${p.name}</h1>
          <p class="lede">${p.tagline}</p>
          ${p.entities ? `<div class="entities">${p.entities.join(' · ')}</div>` : ''}

          <div class="stat-strip">${stats}</div>

          <div class="cols">
            <div>
              <div class="section-l">Milestones</div>
              <div class="timeline">${milestones}</div>
            </div>
            <div>
              <div class="section-l">Recent updates</div>
              <div class="block" style="padding:8px 26px">${updates}</div>
              ${finBlock}
              ${dfiBlock}
              ${teamBlock}
              ${partnersBlock}
            </div>
          </div>

          <section class="data-room">
            <div class="dr-head">
              <div>
                <div class="section-l" style="margin-bottom:4px">Data room</div>
                <div class="h">${(p.data_room && p.data_room.folders ? p.data_room.folders.length : 0)} folders · tap to expand</div>
              </div>
            </div>
            <div class="dr-grid">${folders}</div>
          </section>
        </div>
        ${footer()}
      </main>`;

    // folder expand/collapse
    document.querySelectorAll('.dr-folder').forEach(f => {
      f.addEventListener('click', e => {
        e.preventDefault();
        f.classList.toggle('expanded');
      });
    });

    // live Google Drive file listing per folder
    document.querySelectorAll('.dr-folder').forEach((folderEl, i) => {
      const folder = drFolders[i];
      if (folder && folder.drive_url) {
        loadFolderFiles(folderEl, folder, p.name);
      }
    });
  }

  // ---------------------- boot ----------------------

  window.PortalApp = {
    initHome: async function(){
      try {
        const projects = await loadProjects();
        renderHome(projects);
      } catch(e){
        console.error(e);
        document.body.innerHTML = '<div style="padding:80px;color:#fff;font-family:Inter">Could not load projects.</div>';
      }
    },
    initProject: async function(id){
      try {
        const p = await fetchJSON(id);
        document.title = p.name + ' — Misan Partners';
        renderProject(p);
      } catch(e){
        console.error(e);
        document.body.innerHTML = '<div style="padding:80px;color:#fff;font-family:Inter">Could not load project.</div>';
      }
    }
  };
})();
