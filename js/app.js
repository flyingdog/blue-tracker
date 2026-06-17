// ─── Blue Tracker — Application principale ────────────────────────────────

const App = (() => {

  // ── Constantes ─────────────────────────────────────────────────────────────
  const GAPI_CLIENT_ID = '720180178362-6d86hmjecmm45cpkeetadaeqja22agg0.apps.googleusercontent.com';
  const CATEGORIES = ['Atelier', 'Spec', 'Investigation', 'Données', 'Admin', 'Réunion', 'Autre'];
  const PRIORITIES = ['Haute', 'Moyenne', 'Basse'];
  const STATUSES   = ['À faire', 'En cours', 'Bloqué', 'Terminé'];

  const STATUS_CLASS   = { 'À faire': 'todo', 'En cours': 'inprogress', 'Bloqué': 'blocked', 'Terminé': 'done' };
  const PRIORITY_CLASS = { 'Haute': 'high', 'Moyenne': 'medium', 'Basse': 'low' };
  const CAT_CLASS      = { 'Atelier': 'atelier', 'Spec': 'spec', 'Investigation': 'investigation', 'Données': 'donnees', 'Admin': 'admin', 'Réunion': 'reunion', 'Autre': 'autre' };

  function colorSelect(sel, type) {
    const v = sel.value;
    sel.className = sel.className.replace(/\b(s-\w+|prio-\w+|cat-\w+)\b/g, '');
    if (type === 'status')   sel.classList.add(`s-${STATUS_CLASS[v]}`);
    if (type === 'priority') sel.classList.add(`prio-${PRIORITY_CLASS[v]}`);
    if (type === 'category') sel.classList.add(`cat-${CAT_CLASS[v]}`);
    sel.addEventListener('change', () => colorSelect(sel, type));
  }

  // ── State ───────────────────────────────────────────────────────────────────
  let state = { clients: [], projects: [], deliverables: [], tasks: [] };
  let currentView = 'list';
  let filters = {};

  // ── DOM refs ────────────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const $view  = () => $('view-container');
  const $modal = () => $('modal-overlay');

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function markDirty() {
    Storage.save(state).catch(e => console.error('Save failed:', e));
  }

  function setView(name) {
    currentView = name;
    document.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    renderView();
  }

  function renderView() {
    const container = $view();
    container.className = `view-${currentView}`;
    if (currentView === 'list')      Views.renderList(container, state, filters);
    else if (currentView === 'kanban') Views.renderKanban(container, state, filters);
    else                             Views.renderHierarchy(container, state, filters);
  }

  // ── Filtres ──────────────────────────────────────────────────────────────────
  function buildFilterBar() {
    const clientSel  = $('filter-client');
    const projectSel = $('filter-project');

    // Clients
    clientSel.innerHTML = '<option value="">Tous les clients</option>';
    state.clients.forEach(c => {
      const o = document.createElement('option');
      o.value = c.id; o.textContent = c.name;
      clientSel.appendChild(o);
    });

    // Projects (full list initially)
    function refreshProjects(clientId) {
      projectSel.innerHTML = '<option value="">Tous les projets</option>';
      state.projects
        .filter(p => !clientId || p.clientId === clientId)
        .forEach(p => {
          const o = document.createElement('option');
          o.value = p.id; o.textContent = p.name;
          projectSel.appendChild(o);
        });
    }
    refreshProjects('');

    clientSel.addEventListener('change', () => {
      filters.client = clientSel.value || null;
      filters.project = null;
      projectSel.value = '';
      refreshProjects(clientSel.value);
      renderView();
    });
    projectSel.addEventListener('change', () => {
      filters.project = projectSel.value || null;
      renderView();
    });

    ['filter-category', 'filter-priority', 'filter-status'].forEach(id => {
      $(id).addEventListener('change', e => {
        const key = id.replace('filter-', '');
        filters[key] = e.target.value || null;
        renderView();
      });
    });

    $('filter-search').addEventListener('input', e => {
      filters.search = e.target.value.trim() || null;
      renderView();
    });

    $('filter-reset').addEventListener('click', () => {
      filters = {};
      ['filter-client','filter-project','filter-category','filter-priority','filter-status','filter-search']
        .forEach(id => { const el = $(id); if (el) el.value = ''; });
      refreshProjects('');
      renderView();
    });
  }

  // ── Modal tâche ──────────────────────────────────────────────────────────────
  function openTaskModal(taskId, defaultProjectId) {
    const task = taskId ? state.tasks.find(t => t.id === taskId) : null;
    const isNew = !task;

    const overlay = $modal();
    overlay.innerHTML = '';
    overlay.classList.remove('hidden');

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-header">
        <h2>${isNew ? 'Nouvelle tâche' : 'Modifier la tâche'}</h2>
        <button class="modal-close" aria-label="Fermer">✕</button>
      </div>
      <form id="task-form" class="modal-form">
        <label>Nom *
          <input name="name" type="text" required value="${task?.name || ''}" placeholder="Nom de la tâche">
        </label>
        <div class="form-row">
          <label>Projet *
            <select name="projectId" required>
              <option value="">— Choisir —</option>
              ${state.projects.map(p => {
                const c = state.clients.find(c => c.id === p.clientId);
                const sel = (task?.projectId || defaultProjectId) === p.id ? 'selected' : '';
                return `<option value="${p.id}" ${sel}>${c?.name} / ${p.name}</option>`;
              }).join('')}
            </select>
          </label>
          <label>Livrable
            <select name="deliverableId">
              <option value="">— Aucun —</option>
              ${state.deliverables.map(d => {
                const sel = task?.deliverableId === d.id ? 'selected' : '';
                return `<option value="${d.id}" ${sel}>${d.name}</option>`;
              }).join('')}
            </select>
          </label>
        </div>
        <div class="form-row">
          <label>Catégorie *
            <select name="category" class="inline-select" required>
              ${CATEGORIES.map(cat => `<option ${task?.category === cat ? 'selected' : ''}>${cat}</option>`).join('')}
            </select>
          </label>
          <label>Priorité *
            <select name="priority" class="inline-select" required>
              ${PRIORITIES.map(p => `<option ${task?.priority === p ? 'selected' : ''}>${p}</option>`).join('')}
            </select>
          </label>
          <label>Statut *
            <select name="status" class="inline-select" required>
              ${STATUSES.map(s => `<option ${task?.status === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </label>
        </div>
        <label>Deadline
          <input name="deadline" type="date" value="${task?.deadline || ''}">
        </label>
        <label>Notes
          <textarea name="notes" rows="3" placeholder="Remarques, contexte…">${task?.notes || ''}</textarea>
        </label>
        <div class="form-actions">
          ${!isNew ? `<button type="button" class="btn btn-danger" id="task-delete-btn">Supprimer</button>` : ''}
          <button type="button" class="btn btn-secondary modal-cancel">Annuler</button>
          <button type="submit" class="btn btn-primary">${isNew ? 'Créer' : 'Enregistrer'}</button>
        </div>
      </form>
    `;

    // Appliquer les couleurs aux selects inline du modal
    colorSelect(modal.querySelector('[name="category"]'), 'category');
    colorSelect(modal.querySelector('[name="priority"]'),  'priority');
    colorSelect(modal.querySelector('[name="status"]'),    'status');

    // Update deliverable options when project changes
    const projectSel = modal.querySelector('[name="projectId"]');
    const delivSel   = modal.querySelector('[name="deliverableId"]');
    function refreshDeliverables(projectId) {
      const current = delivSel.value;
      delivSel.innerHTML = '<option value="">— Aucun —</option>';
      state.deliverables
        .filter(d => !projectId || d.projectId === projectId)
        .forEach(d => {
          const o = document.createElement('option');
          o.value = d.id; o.textContent = d.name;
          if (d.id === current) o.selected = true;
          delivSel.appendChild(o);
        });
    }
    projectSel.addEventListener('change', () => refreshDeliverables(projectSel.value));
    refreshDeliverables(projectSel.value);

    modal.querySelector('.modal-close').addEventListener('click', closeModal);
    modal.querySelector('.modal-cancel').addEventListener('click', closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

    modal.querySelector('#task-form').addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = Object.fromEntries(fd.entries());
      if (isNew) {
        state.tasks.push({ id: uid(), ...data, deliverableId: data.deliverableId || null, notes: data.notes || '' });
      } else {
        Object.assign(task, { ...data, deliverableId: data.deliverableId || null });
      }
      markDirty();
      closeModal();
      renderView();
    });

    if (!isNew) {
      modal.querySelector('#task-delete-btn')?.addEventListener('click', () => {
        if (confirm(`Supprimer « ${task.name} » ?`)) {
          state.tasks = state.tasks.filter(t => t.id !== taskId);
          markDirty();
          closeModal();
          renderView();
        }
      });
    }

    overlay.appendChild(modal);
  }

  // ── Modal projet ─────────────────────────────────────────────────────────────
  function openProjectModal(projectId, defaultClientId) {
    const proj = projectId ? state.projects.find(p => p.id === projectId) : null;
    const isNew = !proj;

    const overlay = $modal();
    overlay.innerHTML = '';
    overlay.classList.remove('hidden');

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-header">
        <h2>${isNew ? 'Nouveau projet' : 'Modifier le projet'}</h2>
        <button class="modal-close" aria-label="Fermer">✕</button>
      </div>
      <form id="project-form" class="modal-form">
        <label>Nom *
          <input name="name" type="text" required value="${proj?.name || ''}" placeholder="Nom du projet">
        </label>
        <label>Client *
          <select name="clientId" required>
            <option value="">— Choisir —</option>
            ${state.clients.map(c => `<option value="${c.id}" ${(proj?.clientId || defaultClientId) === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
          </select>
        </label>
        <label>Statut
          <select name="status">
            <option value="active" ${!proj || proj.status === 'active' ? 'selected' : ''}>Actif</option>
            <option value="archived" ${proj?.status === 'archived' ? 'selected' : ''}>Archivé</option>
          </select>
        </label>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary modal-cancel">Annuler</button>
          <button type="submit" class="btn btn-primary">${isNew ? 'Créer' : 'Enregistrer'}</button>
        </div>
      </form>
    `;

    modal.querySelector('.modal-close').addEventListener('click', closeModal);
    modal.querySelector('.modal-cancel').addEventListener('click', closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

    modal.querySelector('#project-form').addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = Object.fromEntries(fd.entries());
      if (isNew) state.projects.push({ id: uid(), ...data });
      else Object.assign(proj, data);
      markDirty();
      closeModal();
      buildFilterBar();
      renderView();
    });

    overlay.appendChild(modal);
  }

  // ── Modal client ──────────────────────────────────────────────────────────────
  function openClientModal(clientId) {
    const client = clientId ? state.clients.find(c => c.id === clientId) : null;
    const isNew = !client;

    const overlay = $modal();
    overlay.innerHTML = '';
    overlay.classList.remove('hidden');

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-header">
        <h2>${isNew ? 'Nouveau client' : 'Modifier le client'}</h2>
        <button class="modal-close" aria-label="Fermer">✕</button>
      </div>
      <form id="client-form" class="modal-form">
        <label>Nom *
          <input name="name" type="text" required value="${client?.name || ''}" placeholder="Nom du client">
        </label>
        <label>Couleur
          <input name="color" type="color" value="${client?.color || '#185FA5'}">
        </label>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary modal-cancel">Annuler</button>
          <button type="submit" class="btn btn-primary">${isNew ? 'Créer' : 'Enregistrer'}</button>
        </div>
      </form>
    `;

    modal.querySelector('.modal-close').addEventListener('click', closeModal);
    modal.querySelector('.modal-cancel').addEventListener('click', closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

    modal.querySelector('#client-form').addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = Object.fromEntries(fd.entries());
      if (isNew) state.clients.push({ id: uid(), ...data });
      else Object.assign(client, data);
      markDirty();
      closeModal();
      buildFilterBar();
      renderView();
    });

    overlay.appendChild(modal);
  }

  function closeModal() {
    const overlay = $modal();
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
  }

  // ── Auth UI ─────────────────────────────────────────────────────────────────
  function updateAuthUI(connected) {
    const btn = $('auth-btn');
    if (connected) {
      btn.textContent = '☁ Drive connecté';
      btn.classList.add('connected');
    } else {
      btn.textContent = '☁ Connexion Drive';
      btn.classList.remove('connected');
    }
  }

  // ── Init ─────────────────────────────────────────────────────────────────────
  async function init() {
    // Load data
    let loaded = await Storage.load();
    if (!loaded) {
      // Load seed data
      try {
        const res = await fetch('data/seed.json');
        loaded = await res.json();
      } catch { loaded = { clients: [], projects: [], deliverables: [], tasks: [] }; }
      Storage.save(loaded);
    }
    state = loaded;

    // Google Drive auth
    if (GAPI_CLIENT_ID) {
      Storage.initGIS(GAPI_CLIENT_ID, connected => {
        updateAuthUI(connected);
        if (connected) {
          Storage.load().then(d => { if (d) { state = d; renderView(); } });
        }
      });
    }

    // Nav view buttons
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', () => setView(btn.dataset.view));
    });

    // Add buttons
    $('add-task-btn').addEventListener('click', () => openTaskModal(null));
    $('add-client-btn').addEventListener('click', () => openClientModal(null));
    $('add-project-btn').addEventListener('click', () => openProjectModal(null));

    // Auth button
    $('auth-btn').addEventListener('click', () => {
      if (Storage.isConnected) Storage.signOut();
      else Storage.requestAuth();
      updateAuthUI(Storage.isConnected);
    });

    // Keyboard shortcut: Escape closes modal
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeModal();
    });

    buildFilterBar();
    setView('list');
  }

  function updateTaskField(taskId, field, value) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;
    task[field] = value;
    markDirty();
  }

  // Public surface used by Views
  return { init, openTaskModal, openProjectModal, openClientModal, updateTaskField };
})();

document.addEventListener('DOMContentLoaded', App.init);
