// ─── Views: Liste, Kanban, Hiérarchie ─────────────────────────────────────

const Views = (() => {

  const STATUSES   = ['À faire', 'En cours', 'Bloqué', 'Terminé'];
  const CATEGORIES = ['Atelier', 'Spec', 'Investigation', 'Données', 'Admin', 'Réunion', 'Autre'];
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
    'À faire': 'todo', 'En cours': 'inprogress', 'Bloqué': 'blocked', 'Terminé': 'done'
  };
  const PRIORITY_CLASS = { 'Haute': 'high', 'Moyenne': 'medium', 'Basse': 'low' };
  const CAT_CLASS = {
    'Atelier': 'atelier', 'Spec': 'spec', 'Investigation': 'investigation',
    'Données': 'donnees', 'Admin': 'admin', 'Réunion': 'reunion', 'Autre': 'autre'
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

  function fmtDate(d) {
    if (!d) return '';
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
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
    header.innerHTML = `<div class="card-title-block"><span class="card-title">${task.name}</span>${task.notes ? `<span class="task-notes">${task.notes}</span>` : ''}</div>`;
    header.addEventListener('click', () => App.openTaskModal(task.id));

    const footer = document.createElement('div');
    footer.className = 'card-footer';
    footer.appendChild(categorySelect(task));
    footer.appendChild(prioritySelect(task));
    if (task.deadline) {
      const dl = document.createElement('span');
      dl.className = `deadline${isOverdue(task.deadline, task.status) ? ' overdue' : ''}`;
      dl.textContent = fmtDate(task.deadline);
      footer.appendChild(dl);
    }

    card.appendChild(header);
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
  function renderList(container, state, filters) {
    let tasks = state.tasks.filter(t => {
      const proj = state.projects.find(p => p.id === t.projectId);
      if (!proj) return false;
      if (filters.client && proj.clientId !== filters.client) return false;
      if (filters.project && t.projectId !== filters.project) return false;
      if (filters.category && t.category !== filters.category) return false;
      if (filters.priority && t.priority !== filters.priority) return false;
      if (filters.status && t.status !== filters.status) return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        if (!t.name.toLowerCase().includes(q)) return false;
      }
      return true;
    });

    // Sort: overdue first, then by deadline, then by priority
    const PRIO_ORDER = { 'Haute': 0, 'Moyenne': 1, 'Basse': 2 };
    tasks.sort((a, b) => {
      const aO = isOverdue(a.deadline, a.status) ? 0 : 1;
      const bO = isOverdue(b.deadline, b.status) ? 0 : 1;
      if (aO !== bO) return aO - bO;
      if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
      if (a.deadline) return -1;
      if (b.deadline) return 1;
      return PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority];
    });

    container.innerHTML = '';
    if (!tasks.length) {
      container.innerHTML = '<p class="empty-state">Aucune tâche ne correspond aux filtres.</p>';
      return;
    }

    tasks.forEach(task => {
      const row = document.createElement('div');
      row.className = `list-row status-${STATUS_CLASS[task.status]}`;
      row.dataset.taskId = task.id;
      const color = clientColor(state, task.projectId);
      const overdue = isOverdue(task.deadline, task.status);

      const colorBar = document.createElement('span');
      colorBar.className = 'list-color-bar';
      colorBar.style.background = color;

      const statusCell = document.createElement('span');
      statusCell.className = 'list-status';
      statusCell.appendChild(statusSelect(task, newStatus => {
        row.className = `list-row status-${STATUS_CLASS[newStatus]}`;
      }));

      const nameCell = document.createElement('span');
      nameCell.className = 'list-name';
      const tag = delivTag(task, state.deliverables);
      nameCell.innerHTML = `<span class="list-name-line">${task.name}${tag ? '' : ''}</span>${task.notes ? `<span class="task-notes">${task.notes}</span>` : ''}`;
      if (tag) nameCell.querySelector('.list-name-line').appendChild(tag);
      nameCell.addEventListener('click', () => App.openTaskModal(task.id));

      const clientCell = document.createElement('span');
      clientCell.className = 'list-client';
      clientCell.style.color = color;
      clientCell.textContent = clientName(state, task.projectId);

      const projectCell = document.createElement('span');
      projectCell.className = 'list-project';
      projectCell.textContent = projectName(state, task.projectId);

      const catCell = document.createElement('span');
      catCell.className = 'list-cat';
      catCell.appendChild(categorySelect(task));

      const prioCell = document.createElement('span');
      prioCell.className = 'list-prio';
      prioCell.appendChild(prioritySelect(task));

      const deadlineCell = document.createElement('span');
      deadlineCell.className = `list-deadline${overdue ? ' overdue' : ''}`;
      deadlineCell.textContent = fmtDate(task.deadline);

      const editBtn = document.createElement('button');
      editBtn.className = 'list-edit-btn icon-btn';
      editBtn.title = 'Modifier';
      editBtn.textContent = '✏️';
      editBtn.addEventListener('click', e => { e.stopPropagation(); App.openTaskModal(task.id); });

      row.append(colorBar, statusCell, nameCell, clientCell, projectCell, catCell, prioCell, deadlineCell, editBtn);
      container.appendChild(row);
    });
  }

  // ── VUE KANBAN ────────────────────────────────────────────────────────────
  function renderKanban(container, state, filters) {
    container.innerHTML = '';
    const board = document.createElement('div');
    board.className = 'kanban-board';

    STATUSES.forEach(status => {
      let tasks = state.tasks.filter(t => {
        if (t.status !== status) return false;
        const proj = state.projects.find(p => p.id === t.projectId);
        if (!proj) return false;
        if (filters.client && proj.clientId !== filters.client) return false;
        if (filters.project && t.projectId !== filters.project) return false;
        if (filters.category && t.category !== filters.category) return false;
        if (filters.priority && t.priority !== filters.priority) return false;
        if (filters.search) {
          const q = filters.search.toLowerCase();
          if (!t.name.toLowerCase().includes(q)) return false;
        }
        return true;
      });

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

    const clients = state.clients.filter(c => {
      if (filters.client && c.id !== filters.client) return false;
      return true;
    });

    if (!clients.length) {
      container.innerHTML = '<p class="empty-state">Aucun client à afficher.</p>';
      return;
    }

    clients.forEach(client => {
      const projects = state.projects.filter(p => {
        if (p.clientId !== client.id) return false;
        if (filters.project && p.id !== filters.project) return false;
        return true;
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
        const tasks = state.tasks.filter(t => {
          if (t.projectId !== proj.id) return false;
          if (filters.category && t.category !== filters.category) return false;
          if (filters.priority && t.priority !== filters.priority) return false;
          if (filters.status && t.status !== filters.status) return false;
          if (filters.search) {
            const q = filters.search.toLowerCase();
            if (!t.name.toLowerCase().includes(q)) return false;
          }
          return true;
        });

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

    const name = document.createElement('span');
    name.className = 'tree-task-name';
    name.innerHTML = `<span class="list-name-line">${task.name}</span>${task.notes ? `<span class="task-notes">${task.notes}</span>` : ''}`;
    const tt = delivTag(task, deliverables || []);
    if (tt) name.querySelector('.list-name-line').appendChild(tt);
    name.addEventListener('click', () => App.openTaskModal(task.id));

    const catSel = categorySelect(task);
    catSel.classList.add('tree-task-cat');

    const prioSel = prioritySelect(task);
    prioSel.classList.add('tree-task-prio');

    const statusSel = statusSelect(task, newStatus => {
      dot.className = `tree-task-status s-${STATUS_CLASS[newStatus]}`;
      row.className = `tree-task status-${STATUS_CLASS[newStatus]}`;
    });

    row.append(dot, name, catSel, prioSel, statusSel);

    if (task.deadline) {
      const dl = document.createElement('span');
      dl.className = `tree-task-deadline${overdue ? ' overdue' : ''}`;
      dl.textContent = fmtDate(task.deadline);
      row.appendChild(dl);
    }

    return row;
  }

  return { renderList, renderKanban, renderHierarchy };
})();
