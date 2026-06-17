// ─── Views: Liste, Kanban, Hiérarchie ─────────────────────────────────────

const Views = (() => {

  const STATUSES = ['À faire', 'En cours', 'Bloqué', 'Terminé'];
  const STATUS_CLASS = {
    'À faire': 'todo', 'En cours': 'inprogress', 'Bloqué': 'blocked', 'Terminé': 'done'
  };
  const PRIORITY_CLASS = { 'Haute': 'high', 'Moyenne': 'medium', 'Basse': 'low' };

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

    card.innerHTML = `
      <div class="card-header">
        <span class="category-dot cat-${task.category.toLowerCase().replace(/é/g,'e').replace(/ /g,'-')}"></span>
        <span class="card-title">${task.name}</span>
        <span class="priority-dot prio-${PRIORITY_CLASS[task.priority]}" title="${task.priority}"></span>
      </div>
      ${opts.showBadges !== false ? `<div class="card-badges">${badges}</div>` : ''}
      <div class="card-footer">
        <span class="task-category">${task.category}</span>
        ${deadline}
      </div>
    `;

    card.addEventListener('click', () => App.openTaskModal(task.id));
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
      row.innerHTML = `
        <span class="list-color-bar" style="background:${color}"></span>
        <span class="list-status">
          <span class="status-pill s-${STATUS_CLASS[task.status]}">${task.status}</span>
        </span>
        <span class="list-name">${task.name}</span>
        <span class="list-client" style="color:${color}">${clientName(state, task.projectId)}</span>
        <span class="list-project">${projectName(state, task.projectId)}</span>
        <span class="list-cat">${task.category}</span>
        <span class="list-prio prio-${PRIORITY_CLASS[task.priority]}">${task.priority}</span>
        <span class="list-deadline ${overdue ? 'overdue' : ''}">${fmtDate(task.deadline)}</span>
        <button class="list-edit-btn icon-btn" data-id="${task.id}" title="Modifier">✏️</button>
      `;
      row.querySelector('.list-name').addEventListener('click', () => App.openTaskModal(task.id));
      row.querySelector('.list-edit-btn').addEventListener('click', e => {
        e.stopPropagation();
        App.openTaskModal(task.id);
      });
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
          delivTasks.forEach(t => delivBody.appendChild(treeTaskRow(t, client.color)));
          projBody.appendChild(delivNode);
        });

        tasksNoDeliv.forEach(t => projBody.appendChild(treeTaskRow(t, client.color)));
        clientBody.appendChild(projNode);
      });

      container.appendChild(clientNode);
    });
  }

  function treeTaskRow(task, color) {
    const overdue = isOverdue(task.deadline, task.status);
    const row = document.createElement('div');
    row.className = `tree-task status-${STATUS_CLASS[task.status]}`;
    row.innerHTML = `
      <span class="tree-task-status s-${STATUS_CLASS[task.status]}"></span>
      <span class="tree-task-name">${task.name}</span>
      <span class="tree-task-cat">${task.category}</span>
      <span class="tree-task-prio prio-${PRIORITY_CLASS[task.priority]}">${task.priority}</span>
      ${task.deadline ? `<span class="tree-task-deadline ${overdue ? 'overdue' : ''}">${fmtDate(task.deadline)}</span>` : ''}
    `;
    row.addEventListener('click', () => App.openTaskModal(task.id));
    return row;
  }

  return { renderList, renderKanban, renderHierarchy };
})();
