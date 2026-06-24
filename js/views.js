// ─── Views: Liste, Kanban, Hiérarchie ─────────────────────────────────────

function todayStr() { return new Date().toISOString().slice(0, 10); }
function tomorrowStr() { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); }

function renderMarkdown(text) {
  if (!text) return '';
  if (typeof marked !== 'undefined') return marked.parse(text);
  return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

const LIST_COLS = [
  { id: 'client',      label: 'Client',    width: '90px',  sort: 'client'   },
  { id: 'project',     label: 'Projet',    width: '130px', sort: 'project'  },
  { id: 'deliverable', label: 'Livrable',  width: '44px',  sort: null       },
  { id: 'category',    label: 'Catégorie', width: '90px',  sort: 'category' },
  { id: 'priority',    label: 'Priorité',  width: '70px',  sort: 'priority' },
  { id: 'deadline',    label: 'Deadline',  width: '80px',  sort: 'deadline' },
  { id: 'updated',     label: 'MàJ',       width: '62px',  sort: 'updated'  },
];

const Views = (() => {

  const STATUSES   = ['À faire', 'En cours', 'En attente', 'Bloqué', 'Terminé'];
  const CATEGORIES = ['Atelier', 'Spec', 'Investigation', 'Données', 'Dév', 'Admin', 'Réunion', 'Autre'];
  const PRIORITIES = ['Haute', 'Moyenne', 'Basse'];
  const CODE_PALETTE = ['#3B82F6','#8B5CF6','#EC4899','#F59E0B','#10B981','#0EA5E9','#6366F1','#14B8A6','#EF4444','#84CC16'];
  function codeColor(code) {
    let h = 0;
    for (const c of (code || '')) h = (h * 31 + c.charCodeAt(0)) % CODE_PALETTE.length;
    return CODE_PALETTE[h];
  }
  function delivTag(task, deliverables) {
    if (!task.deliverableId) return null;
    const d = deliverables.find(x => x.id === task.deliverableId);
    if (!d || !d.code) return null;
    const color = codeColor(d.code);
    const el = document.createElement('span');
    el.className = 'deliv-code-tag';
    el.textContent = d.code;
    el.title = d.name;
    el.style.background = color + '20';
    el.style.color = color;
    el.style.borderColor = color + '50';
    return el;
  }
  const STATUS_CLASS = {
    'À faire': 'todo', 'En cours': 'inprogress', 'En attente': 'waiting', 'Bloqué': 'blocked', 'Terminé': 'done'
  };
  const PRIORITY_CLASS = { 'Haute': 'high', 'Moyenne': 'medium', 'Basse': 'low' };
  const CAT_CLASS = {
    'Atelier': 'atelier', 'Spec': 'spec', 'Investigation': 'investigation',
    'Données': 'donnees', 'Dév': 'dév', 'Admin': 'admin', 'Réunion': 'reunion', 'Autre': 'autre'
  };

  // ── Inline select helper ──────────────────────────────────────────────────
  function inlineSelect(task, field, options, classFn, onChange) {
    const sel = document.createElement('select');
    sel.className = `inline-select ${classFn(task[field])}`;
    options.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt; o.textContent = opt;
      if (opt === task[field]) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('mousedown', e => e.stopPropagation());
    sel.addEventListener('change', e => {
      e.stopPropagation();
      const val = e.target.value;
      sel.className = `inline-select ${classFn(val)}`;
      App.updateTaskField(task.id, field, val);
      if (onChange) onChange(val);
    });
    return sel;
  }

  function statusSelect(task, onChange) {
    return inlineSelect(task, 'status', STATUSES,
      v => `s-${STATUS_CLASS[v]}`, onChange);
  }
  function prioritySelect(task) {
    return inlineSelect(task, 'priority', PRIORITIES,
      v => `prio-${PRIORITY_CLASS[v]}`);
  }
  function categorySelect(task) {
    return inlineSelect(task, 'category', CATEGORIES,
      v => `cat-${CAT_CLASS[v]}`);
  }
  function deliverableSelect(task, deliverables) {
    const projectDelivs = deliverables.filter(d => d.projectId === task.projectId);
    if (!projectDelivs.length) return null;
    const sel = document.createElement('select');
    sel.className = 'inline-select cat-admin';
    const none = document.createElement('option');
    none.value = ''; none.textContent = '— Livrable —';
    sel.appendChild(none);
    projectDelivs.forEach(d => {
      const o = document.createElement('option');
      o.value = d.id; o.textContent = d.name;
      if (d.id === task.deliverableId) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('mousedown', e => e.stopPropagation());
    sel.addEventListener('change', e => {
      e.stopPropagation();
      App.updateTaskField(task.id, 'deliverableId', e.target.value || null);
    });
    return sel;
  }

  function fmtUpdated(iso) {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const min  = diff / 60000;
    const h    = diff / 3600000;
    if (min < 5)  return '~0';
    if (h   < 1.5) return '~1h';
    if (h   < 8)   return `${Math.floor(h)}h`;

    const now   = new Date();
    const d     = new Date(iso);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dDay  = new Date(d.getFullYear(),   d.getMonth(),   d.getDate());
    const diffDays = Math.round((today - dDay) / 86400000);

    if (diffDays === 0) return 'auj.';
    if (diffDays === 1) return 'hier';

    const dow = now.getDay() || 7;
    const mondayCurr = new Date(today); mondayCurr.setDate(today.getDate() - (dow - 1));
    const mondayPrev = new Date(mondayCurr); mondayPrev.setDate(mondayCurr.getDate() - 7);

    if (dDay >= mondayCurr) return 'sem.';
    if (dDay >= mondayPrev) return 's-1';
    if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) return 'mois';
    return '>1m';
  }

  // Always format dd/mm/yy regardless of browser locale
  function fmtDate(d) {
    if (!d) return '';
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y.slice(2)}`;
  }
  const _numFmt = new Intl.NumberFormat(undefined);
  function fmtNumber(n) { return _numFmt.format(n); }

  // Inline date: shows formatted text, switches to date input on click
  function inlineDatePicker(taskId, deadline, overdue, onChange) {
    const wrap = document.createElement('span');
    wrap.style.display = 'inline-flex';

    const lbl = document.createElement('span');
    lbl.className = 'deadline-display' + (overdue ? ' overdue' : '');
    lbl.textContent = deadline ? fmtDate(deadline) : '—';
    lbl.style.cursor = 'pointer';

    const inp = document.createElement('input');
    inp.type = 'date';
    inp.value = deadline || '';
    inp.className = 'deadline-input' + (overdue ? ' overdue' : '');
    inp.style.display = 'none';

    lbl.addEventListener('click', () => {
      lbl.style.display = 'none';
      inp.style.display = '';
      inp.focus();
      inp.showPicker?.();
    });
    inp.addEventListener('change', e => {
      const val = e.target.value || null;
      onChange(val);
      lbl.textContent = val ? fmtDate(val) : '—';
      lbl.className = 'deadline-display' + (isOverdue(val, '') ? ' overdue' : '');
      inp.style.display = 'none';
      lbl.style.display = '';
    });
    inp.addEventListener('blur', () => {
      inp.style.display = 'none';
      lbl.style.display = '';
    });

    wrap.appendChild(lbl);
    wrap.appendChild(inp);
    return wrap;
  }

  function isOverdue(deadline, status) {
    if (!deadline || status === 'Terminé') return false;
    return new Date(deadline) < new Date(new Date().toDateString());
  }

  function clientColor(state, projectId) {
    const proj = state.projects.find(p => p.id === projectId);
    const client = proj ? state.clients.find(c => c.id === proj.clientId) : null;
    return client?.color || '#888';
  }

  function clientName(state, projectId) {
    const proj = state.projects.find(p => p.id === projectId);
    const client = proj ? state.clients.find(c => c.id === proj.clientId) : null;
    return client?.name || '—';
  }

  function projectName(state, projectId) {
    return state.projects.find(p => p.id === projectId)?.name || '—';
  }

  // ── Barre de progression ─────────────────────────────────────────────────
  function pbColorClass(val) {
    if (val === 100) return 'pb-c-done';
    if (val >= 70)   return 'pb-c-high';
    if (val >= 40)   return 'pb-c-medium';
    return val > 0 ? 'pb-c-low' : '';
  }

  function progressBar(task, size = 'sm') {
    const val = task.progress || 0;
    const wrap = document.createElement('div');
    wrap.className = `progress-bar progress-bar-${size} ${pbColorClass(val)}`.trim();
    wrap.title = `Avancement : ${val}%`;

    for (let i = 1; i <= 10; i++) {
      const seg = document.createElement('span');
      seg.className = 'pb-seg' + (val >= i * 10 ? ' filled' : '');
      seg.addEventListener('mouseenter', () => {
        wrap.querySelectorAll('.pb-seg').forEach((s, idx) => s.classList.toggle('hover-preview', idx < i));
      });
      seg.addEventListener('mouseleave', () => {
        wrap.querySelectorAll('.pb-seg').forEach(s => s.classList.remove('hover-preview'));
      });
      seg.addEventListener('click', e => {
        e.stopPropagation();
        const current = task.progress || 0;
        const newVal = current === i * 10 ? 0 : i * 10;
        App.updateTaskField(task.id, 'progress', newVal);
        task.progress = newVal;
        wrap.querySelectorAll('.pb-seg').forEach((s, idx) => s.classList.toggle('filled', newVal >= (idx + 1) * 10));
        wrap.className = `progress-bar progress-bar-${size} ${pbColorClass(newVal)}`.trim();
        wrap.title = `Avancement : ${newVal}%`;
        if (size === 'lg') {
          const lbl = wrap.nextElementSibling;
          if (lbl?.classList.contains('pb-label')) lbl.textContent = `${newVal}%`;
        }
      });
      wrap.appendChild(seg);
    }
    return wrap;
  }

  function progressBarLg(task) {
    const frag = document.createDocumentFragment();
    frag.appendChild(progressBar(task, 'lg'));
    const lbl = document.createElement('span');
    lbl.className = 'pb-label';
    lbl.textContent = `${task.progress || 0}%`;
    frag.appendChild(lbl);
    return frag;
  }

  // ── Task card (shared) ────────────────────────────────────────────────────
  function taskCard(task, state, opts = {}) {
    const color = clientColor(state, task.projectId);
    const overdue = isOverdue(task.deadline, task.status);
    const card = document.createElement('div');
    card.className = `task-card status-${STATUS_CLASS[task.status]}`;
    card.dataset.taskId = task.id;

    const badges = `
      <span class="badge client-badge" style="background:${color}20;color:${color};border-color:${color}40">
        ${clientName(state, task.projectId)}
      </span>
      <span class="badge project-badge">${projectName(state, task.projectId)}</span>
    `;

    const deadline = task.deadline
      ? `<span class="deadline ${overdue ? 'overdue' : ''}">${fmtDate(task.deadline)}</span>`
      : '';

    const header = document.createElement('div');
    header.className = 'card-header';
    const titleBlock = document.createElement('div');
    titleBlock.className = 'card-title-block';
    const cardTitle = document.createElement('span');
    cardTitle.className = 'card-title';
    cardTitle.textContent = task.name;
    titleBlock.appendChild(cardTitle);
    if (task.notes) {
      const notesEl = document.createElement('div');
      notesEl.className = 'task-notes';
      notesEl.innerHTML = renderMarkdown(task.notes);
      titleBlock.appendChild(notesEl);
    }
    header.appendChild(titleBlock);

    const cardFlagBtn = document.createElement('button');
    cardFlagBtn.className = `card-flag-btn${task.daily_flag ? ' flagged' : ''}`;
    cardFlagBtn.title = task.daily_flag ? 'Retirer du focus' : 'Ajouter au focus du jour';
    cardFlagBtn.textContent = '☀';
    cardFlagBtn.addEventListener('click', e => { e.stopPropagation(); App.toggleDailyFlag(task.id); });
    header.appendChild(cardFlagBtn);

    header.addEventListener('click', () => App.openTaskModal(task.id));

    const footer = document.createElement('div');
    footer.className = 'card-footer';
    footer.appendChild(categorySelect(task));
    footer.appendChild(prioritySelect(task));
    footer.appendChild(inlineDatePicker(task.id, task.deadline, isOverdue(task.deadline, task.status),
      val => App.updateTaskField(task.id, 'deadline', val)));

    card.appendChild(header);
    card.appendChild(progressBar(task));
    if (opts.showBadges !== false) {
      const badgeRow = document.createElement('div');
      badgeRow.className = 'card-badges';
      badgeRow.innerHTML = badges;
      const kt = delivTag(task, state.deliverables);
      if (kt) badgeRow.prepend(kt);
      card.appendChild(badgeRow);
    }
    card.appendChild(footer);

    return card;
  }

  // ── VUE LISTE ─────────────────────────────────────────────────────────────
  const PRIO_ORDER  = { 'Haute': 0, 'Moyenne': 1, 'Basse': 2 };
  const STATUS_ORDER = { 'Bloqué': 0, 'En cours': 1, 'À faire': 2, 'Terminé': 3 };

  function filterTasks(tasks, state, filters) {
    // Normalize: accept both legacy string values and new arrays
    const arr = v => Array.isArray(v) ? v : (v ? [v] : []);
    return tasks.filter(t => {
      const proj = state.projects.find(p => p.id === t.projectId);
      if (!proj) return false;
      if (arr(filters.client).length   && !arr(filters.client).includes(proj.clientId))  return false;
      if (arr(filters.project).length  && !arr(filters.project).includes(t.projectId))   return false;
      if (arr(filters.category).length && !arr(filters.category).includes(t.category))   return false;
      if (arr(filters.priority).length && !arr(filters.priority).includes(t.priority))   return false;
      if (arr(filters.status).length   && !arr(filters.status).includes(t.status))       return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        if (!t.name.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }

  function sortTasks(tasks, sortBy, sortDir, state) {
    const dir = sortDir === 'desc' ? -1 : 1;
    return [...tasks].sort((a, b) => {
      let va, vb;
      switch (sortBy) {
        case 'priority': va = PRIO_ORDER[a.priority]; vb = PRIO_ORDER[b.priority]; break;
        case 'status':   va = STATUS_ORDER[a.status]; vb = STATUS_ORDER[b.status]; break;
        case 'name':     va = a.name.toLowerCase();   vb = b.name.toLowerCase();   break;
        case 'client':   va = clientName(state, a.projectId).toLowerCase(); vb = clientName(state, b.projectId).toLowerCase(); break;
        case 'project':  va = projectName(state, a.projectId).toLowerCase(); vb = projectName(state, b.projectId).toLowerCase(); break;
        case 'updated':  va = a.updatedAt || ''; vb = b.updatedAt || ''; break;
        default: { // deadline: overdue first, then by date, then priority
          const aO = isOverdue(a.deadline, a.status) ? 0 : 1;
          const bO = isOverdue(b.deadline, b.status) ? 0 : 1;
          if (aO !== bO) return aO - bO;
          if (a.deadline && b.deadline) return dir * a.deadline.localeCompare(b.deadline);
          if (a.deadline) return -1; if (b.deadline) return 1;
          return PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority];
        }
      }
      return dir * (va < vb ? -1 : va > vb ? 1 : 0);
    });
  }

  function groupLabel(task, groupBy, state) {
    switch (groupBy) {
      case 'client':   return clientName(state, task.projectId);
      case 'project':  return projectName(state, task.projectId);
      case 'status':   return task.status;
      case 'category': return task.category;
      case 'priority': return task.priority;
      default: return '';
    }
  }

  function buildGridTemplate(colOrder, vis) {
    const toggleableWidths = colOrder.filter(id => vis[id]).map(id => {
      const def = LIST_COLS.find(c => c.id === id);
      return def ? def.width : '80px';
    });
    return `3px 90px 1fr ${toggleableWidths.join(' ')} 28px 28px`;
  }

  function buildHeaderRow(colOrder, vis, sortBy, sortDir) {
    const row = document.createElement('div');
    row.className = 'list-header-row';
    row.style.gridTemplateColumns = buildGridTemplate(colOrder, vis);

    const spacer = document.createElement('span'); // color bar
    row.appendChild(spacer);

    // Statut (always, sortable)
    const statusH = document.createElement('span');
    statusH.className = `list-hcol sortable${sortBy === 'status' ? ' sort-active' : ''}`;
    statusH.innerHTML = `Statut<span class="list-sort-icon">${sortBy === 'status' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</span>`;
    statusH.addEventListener('click', () => App.sortByHeader('status'));
    row.appendChild(statusH);

    // Nom (always, sortable)
    const nameH = document.createElement('span');
    nameH.className = `list-hcol sortable${sortBy === 'name' ? ' sort-active' : ''}`;
    nameH.innerHTML = `Nom<span class="list-sort-icon">${sortBy === 'name' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</span>`;
    nameH.addEventListener('click', () => App.sortByHeader('name'));
    row.appendChild(nameH);

    // Toggleable columns in user-defined order
    for (const id of colOrder) {
      if (!vis[id]) continue;
      const def = LIST_COLS.find(c => c.id === id);
      if (!def) continue;
      const h = document.createElement('span');
      if (def.sort) {
        h.className = `list-hcol sortable${sortBy === def.sort ? ' sort-active' : ''}`;
        h.innerHTML = `${def.label}<span class="list-sort-icon">${sortBy === def.sort ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</span>`;
        h.addEventListener('click', () => App.sortByHeader(def.sort));
      } else {
        h.className = 'list-hcol';
        h.textContent = def.label;
      }
      row.appendChild(h);
    }

    const flagSpacer = document.createElement('span');
    const editSpacer = document.createElement('span'); // nav btn column
    row.append(flagSpacer, editSpacer);

    return row;
  }

  function buildListRow(task, state, vis, colOrder) {
    const row = document.createElement('div');
    const color = clientColor(state, task.projectId);
    const overdue = isOverdue(task.deadline, task.status);

    row.style.gridTemplateColumns = buildGridTemplate(colOrder, vis);
    row.className = `list-row status-${STATUS_CLASS[task.status]}`;

    const colorBar = document.createElement('span');
    colorBar.className = 'list-color-bar';
    colorBar.style.background = `var(--s-${STATUS_CLASS[task.status] || 'todo'})`;

    const statusCell = document.createElement('span');
    statusCell.className = 'list-status';
    statusCell.appendChild(statusSelect(task, v => {
      row.className = `list-row status-${STATUS_CLASS[v]}`;
      colorBar.style.background = `var(--s-${STATUS_CLASS[v] || 'todo'})`;
    }));

    const nameCell = document.createElement('div');
    nameCell.className = 'list-name';
    const nameLine = document.createElement('span');
    nameLine.className = 'list-name-line';
    const nameText = document.createElement('span');
    nameText.className = 'list-name-text';
    nameText.textContent = task.name;
    nameText.style.cursor = 'pointer';
    nameText.addEventListener('click', e => { e.stopPropagation(); App.openTaskDetail(task.id); });
    nameLine.appendChild(nameText);
    if (task.daily_flag && task.daily_flag_date && task.daily_flag_date < todayStr()) {
      const badge = document.createElement('span');
      badge.className = 'list-flag-badge';
      badge.textContent = 'reporté';
      nameLine.appendChild(badge);
    }
    nameCell.appendChild(nameLine);
    nameCell.appendChild(progressBar(task));

    if (task.notes) {
      const notesEl = document.createElement('div');
      notesEl.className = 'task-notes';
      notesEl.innerHTML = renderMarkdown(task.notes);
      nameCell.appendChild(notesEl);
    }

    const editBtn = document.createElement('button');
    editBtn.className = 'list-nav-btn';
    editBtn.title = 'Ouvrir'; editBtn.textContent = '›';
    editBtn.addEventListener('click', e => { e.stopPropagation(); App.openTaskDetail(task.id); });

    row.append(colorBar, statusCell, nameCell);

    for (const id of colOrder) {
      if (!vis[id]) continue;
      const c = document.createElement('span');
      switch (id) {
        case 'client':
          c.className = 'list-client'; c.style.color = color;
          c.textContent = clientName(state, task.projectId);
          break;
        case 'project':
          c.className = 'list-project';
          c.textContent = projectName(state, task.projectId);
          break;
        case 'deliverable':
          c.className = 'list-deliv';
          const tag = delivTag(task, state.deliverables);
          if (tag) c.appendChild(tag);
          break;
        case 'category':
          c.className = 'list-cat';
          c.appendChild(categorySelect(task));
          break;
        case 'priority':
          c.className = 'list-prio';
          c.appendChild(prioritySelect(task));
          break;
        case 'deadline': {
          c.className = `list-deadline${overdue ? ' overdue' : ''}`;
          c.appendChild(inlineDatePicker(task.id, task.deadline, overdue,
            val => { App.updateTaskField(task.id, 'deadline', val); c.classList.toggle('overdue', isOverdue(val, task.status)); }));
          break;
        }
        case 'updated':
          c.className = 'list-updated';
          c.textContent = fmtUpdated(task.updatedAt);
          break;
      }
      row.appendChild(c);
    }

    // Flag button
    const flagBtn = document.createElement('button');
    const isFlagged = !!task.daily_flag;
    flagBtn.className = `list-flag-btn${isFlagged ? ' flagged' : ''}`;
    flagBtn.title = isFlagged ? 'Retirer du focus' : 'Ajouter au focus du jour';
    flagBtn.textContent = '☀';
    flagBtn.addEventListener('click', e => { e.stopPropagation(); App.toggleDailyFlag(task.id); });

    row.append(flagBtn, editBtn);
    return row;
  }

  function renderList(container, state, filters, opts = {}) {
    const colOrder = opts.columnOrder || LIST_COLS.map(c => c.id);
    const vis = {
      client: true, project: true, deliverable: true,
      category: true, priority: true, deadline: true,
      ...opts.columns
    };
    const sortBy  = opts.sortBy  || 'deadline';
    const sortDir = opts.sortDir || 'asc';
    const groupBy = opts.groupBy || null;

    // Masquer automatiquement la colonne utilisée pour le regroupement
    const GROUP_TO_COL = { client: 'client', project: 'project', category: 'category', priority: 'priority' };
    if (groupBy && GROUP_TO_COL[groupBy]) vis[GROUP_TO_COL[groupBy]] = false;

    let tasks = filterTasks(state.tasks, state, filters);
    tasks = sortTasks(tasks, sortBy, sortDir, state);

    container.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'view-list';

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'list-toolbar';
    const countEl = document.createElement('span');
    countEl.className = 'list-count';
    countEl.textContent = `${tasks.length} tâche${tasks.length !== 1 ? 's' : ''}`;
    const gearBtn = document.createElement('button');
    gearBtn.className = 'list-settings-btn';
    gearBtn.title = 'Paramètres de vue';
    gearBtn.textContent = '⚙';
    gearBtn.addEventListener('click', () => App.openViewSettingsModal());
    toolbar.append(countEl, gearBtn);
    wrap.appendChild(toolbar);

    // Header row
    wrap.appendChild(buildHeaderRow(colOrder, vis, sortBy, sortDir));

    if (!tasks.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'Aucune tâche ne correspond aux filtres.';
      wrap.appendChild(empty);
      container.appendChild(wrap);
      return;
    }

    if (!groupBy) {
      tasks.forEach(t => wrap.appendChild(buildListRow(t, state, vis, colOrder)));
    } else {
      const groups = new Map();
      tasks.forEach(t => {
        const key = groupLabel(t, groupBy, state);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(t);
      });
      groups.forEach((groupTasks, label) => {
        const header = document.createElement('div');
        header.className = 'list-group-header';
        const gc = groupBy === 'client' ? state.clients.find(c => c.name === label) : null;
        header.innerHTML = `
          ${gc ? `<span class="list-group-dot" style="background:${gc.color}"></span>` : ''}
          <span class="list-group-label">${label}</span>
          <span class="list-group-count">${groupTasks.length}</span>
        `;
        wrap.appendChild(header);
        groupTasks.forEach(t => wrap.appendChild(buildListRow(t, state, vis, colOrder)));
      });
    }

    container.appendChild(wrap);
  }

  // ── VUE KANBAN ────────────────────────────────────────────────────────────
  function renderKanban(container, state, filters) {
    container.innerHTML = '';
    const board = document.createElement('div');
    board.className = 'kanban-board';

    const filteredTasks = filterTasks(state.tasks, state, filters);
    STATUSES.forEach(status => {
      let tasks = filteredTasks.filter(t => t.status === status);

      const col = document.createElement('div');
      col.className = `kanban-col col-${STATUS_CLASS[status]}`;
      col.innerHTML = `
        <div class="kanban-col-header">
          <span class="col-title">${status}</span>
          <span class="col-count">${tasks.length}</span>
        </div>
        <div class="kanban-cards"></div>
      `;
      const cardsEl = col.querySelector('.kanban-cards');
      tasks.forEach(t => cardsEl.appendChild(taskCard(t, state)));
      board.appendChild(col);
    });

    container.appendChild(board);
  }

  // ── VUE HIÉRARCHIE ────────────────────────────────────────────────────────
  function renderHierarchy(container, state, filters) {
    container.innerHTML = '';

    const arr = v => Array.isArray(v) ? v : (v ? [v] : []);
    const filteredTasks = filterTasks(state.tasks, state, filters);
    const filteredTaskIds = new Set(filteredTasks.map(t => t.id));

    // Keep only clients that have at least one visible task
    const clientVals = arr(filters.client);
    const clients = state.clients.filter(c => {
      if (clientVals.length && !clientVals.includes(c.id)) return false;
      return state.projects.some(p => p.clientId === c.id &&
        state.tasks.some(t => t.projectId === p.id && filteredTaskIds.has(t.id)));
    });

    if (!clients.length) {
      container.innerHTML = '<p class="empty-state">Aucun résultat pour ces filtres.</p>';
      return;
    }

    clients.forEach(client => {
      const projVals = arr(filters.project);
      const projects = state.projects.filter(p => {
        if (p.clientId !== client.id) return false;
        if (projVals.length && !projVals.includes(p.id)) return false;
        // Only show project if it has at least one visible task
        return state.tasks.some(t => t.projectId === p.id && filteredTaskIds.has(t.id));
      });

      const clientNode = document.createElement('div');
      clientNode.className = 'tree-client';
      clientNode.innerHTML = `
        <div class="tree-client-header" style="border-left-color:${client.color}">
          <button class="tree-toggle" aria-expanded="true">▾</button>
          <span class="tree-client-dot" style="background:${client.color}"></span>
          <span class="tree-client-name">${client.name}</span>
          <span class="tree-add-btn" title="Nouveau projet" data-client="${client.id}">+</span>
        </div>
        <div class="tree-client-body"></div>
      `;
      clientNode.querySelector('.tree-add-btn').addEventListener('click', () => App.openProjectModal(null, client.id));
      clientNode.querySelector('.tree-toggle').addEventListener('click', e => {
        const btn = e.currentTarget;
        const body = clientNode.querySelector('.tree-client-body');
        const expanded = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!expanded));
        btn.textContent = expanded ? '▸' : '▾';
        body.style.display = expanded ? 'none' : '';
      });

      const clientBody = clientNode.querySelector('.tree-client-body');

      projects.forEach(proj => {
        const tasks = filteredTasks.filter(t => t.projectId === proj.id);

        const projNode = document.createElement('div');
        projNode.className = 'tree-project';
        projNode.innerHTML = `
          <div class="tree-project-header">
            <button class="tree-toggle" aria-expanded="true">▾</button>
            <span class="tree-project-name">${proj.name}</span>
            <span class="tree-badge">${tasks.length}</span>
            <span class="tree-add-btn" title="Nouvelle tâche" data-project="${proj.id}">+</span>
          </div>
          <div class="tree-project-body"></div>
        `;
        projNode.querySelector('.tree-add-btn').addEventListener('click', () => App.openTaskModal(null, proj.id));
        projNode.querySelector('.tree-toggle').addEventListener('click', e => {
          const btn = e.currentTarget;
          const body = projNode.querySelector('.tree-project-body');
          const expanded = btn.getAttribute('aria-expanded') === 'true';
          btn.setAttribute('aria-expanded', String(!expanded));
          btn.textContent = expanded ? '▸' : '▾';
          body.style.display = expanded ? 'none' : '';
        });

        const projBody = projNode.querySelector('.tree-project-body');

        // Group by deliverable
        const deliverables = state.deliverables.filter(d => d.projectId === proj.id);
        const tasksByDeliv = {};
        const tasksNoDeliv = [];

        tasks.forEach(t => {
          if (t.deliverableId) {
            if (!tasksByDeliv[t.deliverableId]) tasksByDeliv[t.deliverableId] = [];
            tasksByDeliv[t.deliverableId].push(t);
          } else {
            tasksNoDeliv.push(t);
          }
        });

        deliverables.forEach(deliv => {
          const delivTasks = tasksByDeliv[deliv.id] || [];
          if (!delivTasks.length && Object.keys(filters).some(k => filters[k])) return;

          const delivNode = document.createElement('div');
          delivNode.className = 'tree-deliverable';
          delivNode.innerHTML = `
            <div class="tree-deliv-header">
              <button class="tree-toggle" aria-expanded="true">▾</button>
              <span class="tree-deliv-icon">📦</span>
              <span class="tree-deliv-name">${deliv.name}</span>
              <span class="tree-badge">${delivTasks.length}</span>
            </div>
            <div class="tree-deliv-body"></div>
          `;
          delivNode.querySelector('.tree-toggle').addEventListener('click', e => {
            const btn = e.currentTarget;
            const body = delivNode.querySelector('.tree-deliv-body');
            const expanded = btn.getAttribute('aria-expanded') === 'true';
            btn.setAttribute('aria-expanded', String(!expanded));
            btn.textContent = expanded ? '▸' : '▾';
            body.style.display = expanded ? 'none' : '';
          });

          const delivBody = delivNode.querySelector('.tree-deliv-body');
          delivTasks.forEach(t => delivBody.appendChild(treeTaskRow(t, client.color, state.deliverables)));
          projBody.appendChild(delivNode);
        });

        tasksNoDeliv.forEach(t => projBody.appendChild(treeTaskRow(t, client.color, state.deliverables)));
        clientBody.appendChild(projNode);
      });

      container.appendChild(clientNode);
    });
  }

  function treeTaskRow(task, color, deliverables) {
    const overdue = isOverdue(task.deadline, task.status);
    const row = document.createElement('div');
    row.className = `tree-task status-${STATUS_CLASS[task.status]}`;

    const dot = document.createElement('span');
    dot.className = `tree-task-status s-${STATUS_CLASS[task.status]}`;

    const name = document.createElement('div');
    name.className = 'tree-task-name';
    const treeNameLine = document.createElement('span');
    treeNameLine.className = 'list-name-line';
    treeNameLine.textContent = task.name;
    const tt = delivTag(task, deliverables || []);
    if (tt) treeNameLine.appendChild(tt);
    name.appendChild(treeNameLine);
    if (task.notes) {
      const notesEl = document.createElement('div');
      notesEl.className = 'task-notes';
      notesEl.innerHTML = renderMarkdown(task.notes);
      name.appendChild(notesEl);
    }
    name.addEventListener('click', () => App.openTaskModal(task.id));

    const catSel = categorySelect(task);
    catSel.classList.add('tree-task-cat');

    const prioSel = prioritySelect(task);
    prioSel.classList.add('tree-task-prio');

    const statusSel = statusSelect(task, newStatus => {
      dot.className = `tree-task-status s-${STATUS_CLASS[newStatus]}`;
      row.className = `tree-task status-${STATUS_CLASS[newStatus]}`;
    });

    const treeFlagBtn = document.createElement('button');
    treeFlagBtn.className = `list-flag-btn${task.daily_flag ? ' flagged' : ''}`;
    treeFlagBtn.title = task.daily_flag ? 'Retirer du focus' : 'Ajouter au focus du jour';
    treeFlagBtn.textContent = '☀';
    treeFlagBtn.addEventListener('click', e => { e.stopPropagation(); App.toggleDailyFlag(task.id); });

    row.append(dot, name, catSel, prioSel, statusSel, progressBar(task), treeFlagBtn);

    row.appendChild(inlineDatePicker(task.id, task.deadline, overdue,
      val => App.updateTaskField(task.id, 'deadline', val)));

    return row;
  }

  function renderFocus(container, state, actions) {
    const today  = todayStr();
    const STATUS_CLASS_LOCAL = { 'À faire': 'todo', 'En cours': 'inprogress', 'En attente': 'waiting', 'Bloqué': 'blocked', 'Terminé': 'done' };
    const PRIO_COLOR = { 'Haute': 'var(--red)', 'Moyenne': 'var(--orange)', 'Basse': 'var(--gray-500)' };

    const flagged = state.tasks.filter(t => t.daily_flag);
    const reported = flagged.filter(t => t.daily_flag_date && t.daily_flag_date < today);
    const current  = flagged.filter(t => !t.daily_flag_date || t.daily_flag_date >= today);

    const wrap = document.createElement('div');
    wrap.className = 'view-focus';

    const header = document.createElement('div');
    header.className = 'focus-header';
    const dFmt = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    header.innerHTML = `<h2>☀ Focus du Jour</h2><span class="focus-header-sub">${dFmt} — ${flagged.length} tâche${flagged.length !== 1 ? 's' : ''}</span>`;
    wrap.appendChild(header);

    if (!flagged.length) {
      const empty = document.createElement('div');
      empty.className = 'focus-empty';
      empty.innerHTML = `<strong>Aucune tâche en focus</strong>Dans la vue Liste, cliquez sur ☀ à côté d'une tâche pour l'ajouter au focus du jour (5 max).`;
      wrap.appendChild(empty);
      container.appendChild(wrap);
      return;
    }

    const list = document.createElement('div');
    list.className = 'focus-list';

    [...reported, ...current].forEach(task => {
      const isReported = reported.includes(task);
      const color = clientColor(state, task.projectId);
      const cName = clientName(state, task.projectId);
      const pName = projectName(state, task.projectId);

      const card = document.createElement('div');
      card.className = `focus-card${isReported ? ' reported' : ''}`;

      const colorBar = document.createElement('div');
      colorBar.className = 'focus-card-color';
      colorBar.style.background = color;

      const body = document.createElement('div');
      body.className = 'focus-card-body';
      body.innerHTML = `
        <div class="focus-card-meta">${cName}${pName ? ' › ' + pName : ''}</div>
        <div class="focus-card-name">${task.name}</div>
        <div class="focus-card-badges">
          <span class="inline-select s-${STATUS_CLASS_LOCAL[task.status] || 'todo'}" style="font-size:.72rem;padding:.1rem .4rem">${task.status}</span>
          ${isReported ? '<span class="focus-reported-badge">↩ reporté</span>' : ''}
          ${task.deadline ? `<span style="font-size:.72rem;color:var(--gray-500)">${fmtDate(task.deadline)}</span>` : ''}
        </div>
      `;

      const actionsWrap = document.createElement('div');
      actionsWrap.className = 'focus-card-actions';

      function btn(label, cls, handler) {
        const b = document.createElement('button');
        b.className = `focus-action-btn ${cls}`;
        b.textContent = label;
        b.addEventListener('click', handler);
        return b;
      }

      if (task.status !== 'Terminé') {
        actionsWrap.appendChild(btn('✅ Terminé', 'done',   () => actions.markDone(task.id)));
        actionsWrap.appendChild(btn('⏸ Bloqué',  'block',  () => actions.markBlocked(task.id)));
      }
      actionsWrap.appendChild(btn('↩ Reporter',  'snooze', () => actions.snooze(task.id)));
      actionsWrap.appendChild(btn('✖ Retirer',   'remove', () => actions.remove(task.id)));

      card.append(colorBar, body, actionsWrap);
      list.appendChild(card);
    });

    wrap.appendChild(list);
    container.appendChild(wrap);
  }

  return { renderList, renderKanban, renderHierarchy, renderFocus, progressBarLg };
})();
