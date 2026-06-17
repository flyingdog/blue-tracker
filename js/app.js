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
  let listOptions = {
    columns: { client: true, project: true, deliverable: true, category: true, priority: true, deadline: true },
    groupBy: null,
    sortBy: 'deadline',
    sortDir: 'asc',
  };

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
    $('list-options-bar').classList.toggle('hidden', name !== 'list');
    renderView();
  }

  function renderView() {
    const container = $view();
    container.className = `view-${currentView}`;
    if (currentView === 'list')        Views.renderList(container, state, filters, listOptions);
    else if (currentView === 'kanban') Views.renderKanban(container, state, filters);
    else                               Views.renderHierarchy(container, state, filters);
  }

  // ── Options barre liste ──────────────────────────────────────────────────────
  function buildOptionsBar() {
    const groupSel = $('opt-group-by');
    const sortSel  = $('opt-sort-by');
    const dirBtn   = $('opt-sort-dir');

    groupSel.addEventListener('change', () => {
      listOptions.groupBy = groupSel.value || null;
      renderView();
    });

    sortSel.addEventListener('change', () => {
      listOptions.sortBy = sortSel.value;
      renderView();
    });

    dirBtn.addEventListener('click', () => {
      listOptions.sortDir = listOptions.sortDir === 'asc' ? 'desc' : 'asc';
      dirBtn.textContent = listOptions.sortDir === 'asc' ? '↑' : '↓';
      renderView();
    });

    document.querySelectorAll('.col-toggle input').forEach(cb => {
      cb.addEventListener('change', () => {
        listOptions.columns[cb.dataset.col] = cb.checked;
        renderView();
      });
    });
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

  // ── Modal gestion des livrables ───────────────────────────────────────────
  function openDeliverablesModal() {
    const overlay = $modal();
    overlay.innerHTML = '';
    overlay.classList.remove('hidden');

    const modal = document.createElement('div');
    modal.className = 'modal modal-wide';

    function render() {
      modal.innerHTML = `
        <div class="modal-header">
          <h2>📦 Gestion des livrables</h2>
          <button class="modal-close" aria-label="Fermer">✕</button>
        </div>
        <div class="modal-body deliverables-body">
          ${state.clients.map(client => {
            const projects = state.projects.filter(p => p.clientId === client.id);
            if (!projects.length) return '';
            return `
              <div class="deliv-client-section">
                <div class="deliv-client-title" style="border-left-color:${client.color}">
                  <span class="tree-client-dot" style="background:${client.color}"></span>
                  ${client.name}
                </div>
                ${projects.map(proj => {
                  const delivs = state.deliverables.filter(d => d.projectId === proj.id);
                  return `
                    <div class="deliv-project-section">
                      <div class="deliv-project-title">${proj.name}</div>
                      <div class="deliv-list" data-project="${proj.id}">
                        ${delivs.map(d => {
                          const taskCount = state.tasks.filter(t => t.deliverableId === d.id).length;
                          const codeColor = (() => { const p=['#3B82F6','#8B5CF6','#EC4899','#F59E0B','#10B981','#0EA5E9','#6366F1','#14B8A6','#EF4444','#84CC16']; let h=0; for(const c of (d.code||''))h=(h*31+c.charCodeAt(0))%p.length; return p[h]; })();
                          return `
                            <div class="deliv-row" data-id="${d.id}">
                              <input class="deliv-code-input" type="text" maxlength="2" value="${d.code||''}" data-id="${d.id}" placeholder="--" style="${d.code ? `background:${codeColor}20;color:${codeColor};border-color:${codeColor}50` : ''}">
                              <input class="deliv-name-input" type="text" value="${d.name}" data-id="${d.id}">
                              <span class="deliv-task-count">${taskCount} tâche${taskCount > 1 ? 's' : ''}</span>
                              <button class="deliv-save-btn btn btn-primary btn-sm" data-id="${d.id}">✓</button>
                              <button class="deliv-delete-btn btn btn-danger btn-sm" data-id="${d.id}" ${taskCount > 0 ? `title="Supprimer les tâches liées d'abord"` : ''}>✕</button>
                            </div>`;
                        }).join('')}
                      </div>
                      <div class="deliv-add-row">
                        <input class="deliv-new-code" type="text" maxlength="2" placeholder="XX" data-project="${proj.id}">
                        <input class="deliv-new-input" type="text" placeholder="Nouveau livrable…" data-project="${proj.id}">
                        <button class="deliv-add-btn btn btn-primary btn-sm" data-project="${proj.id}">+ Ajouter</button>
                      </div>
                    </div>`;
                }).join('')}
              </div>`;
          }).join('')}
          ${state.clients.length === 0 ? '<p class="empty-state">Aucun client. Créez d\'abord un client et un projet.</p>' : ''}
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary modal-cancel">Fermer</button>
        </div>
      `;

      modal.querySelector('.modal-close').addEventListener('click', closeModal);
      modal.querySelector('.modal-cancel').addEventListener('click', closeModal);
      overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

      // Sauvegarder un livrable renommé
      modal.querySelectorAll('.deliv-save-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.id;
          const nameInput = modal.querySelector(`.deliv-name-input[data-id="${id}"]`);
          const codeInput = modal.querySelector(`.deliv-code-input[data-id="${id}"]`);
          const deliv = state.deliverables.find(d => d.id === id);
          if (deliv && nameInput.value.trim()) {
            deliv.name = nameInput.value.trim();
            deliv.code = codeInput.value.trim().toUpperCase() || null;
            markDirty();
            renderView();
            render();
          }
        });
      });

      // Supprimer un livrable
      modal.querySelectorAll('.deliv-delete-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.id;
          const taskCount = state.tasks.filter(t => t.deliverableId === id).length;
          if (taskCount > 0) {
            alert(`Ce livrable contient ${taskCount} tâche(s). Retirez-les d'abord.`);
            return;
          }
          if (confirm('Supprimer ce livrable ?')) {
            state.deliverables = state.deliverables.filter(d => d.id !== id);
            markDirty();
            renderView();
            render();
          }
        });
      });

      // Ajouter un livrable
      modal.querySelectorAll('.deliv-add-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const projectId = btn.dataset.project;
          const nameInput = modal.querySelector(`.deliv-new-input[data-project="${projectId}"]`);
          const codeInput = modal.querySelector(`.deliv-new-code[data-project="${projectId}"]`);
          const name = nameInput.value.trim();
          if (!name) { nameInput.focus(); return; }
          const code = codeInput.value.trim().toUpperCase() || null;
          state.deliverables.push({ id: uid(), name, code, projectId });
          markDirty();
          renderView();
          render();
        });
      });

      // Ajouter avec Entrée
      modal.querySelectorAll('.deliv-new-input, .deliv-new-code').forEach(input => {
        input.addEventListener('keydown', e => {
          if (e.key === 'Enter') {
            modal.querySelector(`.deliv-add-btn[data-project="${input.dataset.project}"]`).click();
          }
        });
      });

      // Sauvegarder avec Entrée sur un champ de renommage
      modal.querySelectorAll('.deliv-name-input').forEach(input => {
        input.addEventListener('keydown', e => {
          if (e.key === 'Enter') {
            modal.querySelector(`.deliv-save-btn[data-id="${input.dataset.id}"]`).click();
          }
        });
      });
    }

    render();
    overlay.appendChild(modal);
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
    $('manage-deliverables-btn').addEventListener('click', () => openDeliverablesModal());

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
    buildOptionsBar();
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
