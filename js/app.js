// ─── Blue Tracker — Application principale ────────────────────────────────

const App = (() => {

  // ── Constantes ─────────────────────────────────────────────────────────────
  const GAPI_CLIENT_ID = '720180178362-6d86hmjecmm45cpkeetadaeqja22agg0.apps.googleusercontent.com';
  const CATEGORIES = ['Atelier', 'Spec', 'Investigation', 'Données', 'Dév', 'Admin', 'Réunion', 'Autre'];
  const PRIORITIES = ['Haute', 'Moyenne', 'Basse'];
  const STATUSES   = ['À faire', 'En cours', 'Bloqué', 'Terminé'];

  const STATUS_CLASS   = { 'À faire': 'todo', 'En cours': 'inprogress', 'Bloqué': 'blocked', 'Terminé': 'done' };
  const PRIORITY_CLASS = { 'Haute': 'high', 'Moyenne': 'medium', 'Basse': 'low' };
  const CAT_CLASS      = { 'Atelier': 'atelier', 'Spec': 'spec', 'Investigation': 'investigation', 'Données': 'donnees', 'Dév': 'dév', 'Admin': 'admin', 'Réunion': 'reunion', 'Autre': 'autre' };

  function colorSelect(sel, type) {
    const v = sel.value;
    sel.className = sel.className.replace(/\b(s-\w+|prio-\w+|cat-\w+)\b/g, '');
    if (type === 'status')   sel.classList.add(`s-${STATUS_CLASS[v]}`);
    if (type === 'priority') sel.classList.add(`prio-${PRIORITY_CLASS[v]}`);
    if (type === 'category') sel.classList.add(`cat-${CAT_CLASS[v]}`);
    sel.addEventListener('change', () => colorSelect(sel, type));
  }

  // ── State ───────────────────────────────────────────────────────────────────
  let state = { clients: [], projects: [], deliverables: [], tasks: [], variants: [] };
  let currentView = 'list';
  let currentVariantId = null;
  let _refreshProjectsFilter = () => {};
  let filters = {};
  let listOptions = {
    columns:     { client: true, project: true, deliverable: true, category: true, priority: true, deadline: true, updated: true },
    columnOrder: ['client', 'project', 'deliverable', 'category', 'priority', 'deadline', 'updated'],
    groupBy:     null,
    sortBy:      'deadline',
    sortDir:     'asc',
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
    renderView();
  }

  function renderView() {
    const container = $view();
    const fb = document.querySelector('.filter-bar');
    if (fb) fb.style.display = currentView === 'focus' ? 'none' : '';
    container.innerHTML = '';
    container.className = `view-${currentView}`;
    if (currentView === 'list') {
      Views.renderList(container, state, filters, listOptions);
    } else if (currentView === 'kanban') {
      Views.renderKanban(container, state, filters);
    } else if (currentView === 'hierarchy') {
      Views.renderHierarchy(container, state, filters);
    } else if (currentView === 'focus') {
      Views.renderFocus(container, state, {
        markDone(taskId) {
          const t = state.tasks.find(t => t.id === taskId);
          if (t) { t.status = 'Terminé'; t.daily_flag = false; t.updatedAt = new Date().toISOString(); }
          markDirty(); renderView();
        },
        markBlocked(taskId) {
          const t = state.tasks.find(t => t.id === taskId);
          if (t) { t.status = 'Bloqué'; t.updatedAt = new Date().toISOString(); }
          markDirty(); renderView();
        },
        snooze(taskId) {
          const t = state.tasks.find(t => t.id === taskId);
          if (t) { t.daily_flag_date = tomorrowStr(); }
          markDirty(); renderView();
        },
        remove(taskId) {
          const t = state.tasks.find(t => t.id === taskId);
          if (t) { t.daily_flag = false; t.daily_flag_date = null; }
          markDirty(); renderView();
        },
      });
    }
  }

  function tomorrowStr() { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); }

  // ── Paramètres de vue (modal Fiori) ──────────────────────────────────────
  const DEFAULT_OPTIONS = {
    columns:     { client: true, project: true, deliverable: true, category: true, priority: true, deadline: true, updated: true },
    columnOrder: ['client', 'project', 'deliverable', 'category', 'priority', 'deadline', 'updated'],
    groupBy:     null,
    sortBy:      'deadline',
    sortDir:     'asc',
  };

  const SORT_OPTIONS = [
    { value: 'deadline',  label: 'Deadline' },
    { value: 'updated',   label: 'MàJ' },
    { value: 'priority',  label: 'Priorité' },
    { value: 'status',    label: 'Statut' },
    { value: 'name',      label: 'Nom' },
    { value: 'client',    label: 'Client' },
    { value: 'project',   label: 'Projet' },
  ];
  const GROUP_OPTIONS = [
    { value: '',          label: '— Aucun —' },
    { value: 'client',    label: 'Client' },
    { value: 'project',   label: 'Projet' },
    { value: 'status',    label: 'Statut' },
    { value: 'category',  label: 'Catégorie' },
    { value: 'priority',  label: 'Priorité' },
  ];

  function openViewSettingsModal() {
    const overlay = $modal();
    overlay.innerHTML = '';
    overlay.classList.remove('hidden');

    let draftOrder = [...listOptions.columnOrder];
    let draftCols  = { ...listOptions.columns };
    let draftSort  = listOptions.sortBy;
    let draftDir   = listOptions.sortDir;
    let draftGroup = listOptions.groupBy || '';
    let activeTab  = 'columns';

    const modal = document.createElement('div');
    modal.className = 'modal modal-view-settings';

    function colLabel(id) {
      return (typeof LIST_COLS !== 'undefined' ? LIST_COLS : []).find(c => c.id === id)?.label || id;
    }

    function renderTab() {
      const body = modal.querySelector('.vs-body');
      if (!body) return;

      if (activeTab === 'columns') {
        const vis = draftOrder.filter(id => draftCols[id]).length;
        body.innerHTML = `
          <div class="vs-col-header">Colonnes (${vis}/${draftOrder.length})</div>
          <div class="vs-col-list">
            ${draftOrder.map((id, i) => `
              <div class="vs-col-row">
                <label class="vs-col-check">
                  <input type="checkbox" data-col="${id}" ${draftCols[id] ? 'checked' : ''}>
                  ${colLabel(id)}
                </label>
                <div class="vs-col-arrows">
                  <button class="vs-arrow" data-move="-1" data-col="${id}" ${i === 0 ? 'disabled' : ''}>↑</button>
                  <button class="vs-arrow" data-move="1"  data-col="${id}" ${i === draftOrder.length - 1 ? 'disabled' : ''}>↓</button>
                </div>
              </div>
            `).join('')}
          </div>
        `;
        body.querySelectorAll('.vs-col-check input').forEach(cb => {
          cb.addEventListener('change', () => {
            draftCols[cb.dataset.col] = cb.checked;
            renderTab();
          });
        });
        body.querySelectorAll('.vs-arrow').forEach(btn => {
          btn.addEventListener('click', () => {
            const id = btn.dataset.col;
            const move = parseInt(btn.dataset.move);
            const idx = draftOrder.indexOf(id);
            const to = idx + move;
            if (to < 0 || to >= draftOrder.length) return;
            draftOrder.splice(idx, 1);
            draftOrder.splice(to, 0, id);
            renderTab();
          });
        });
      }

      if (activeTab === 'sort') {
        body.innerHTML = `
          <div class="vs-sort-row">
            <div class="vs-field-group">
              <span class="vs-field-label">Trier par</span>
              <select id="vs-sort-by">
                ${SORT_OPTIONS.map(o => `<option value="${o.value}" ${draftSort === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
              </select>
            </div>
            <div class="vs-field-group">
              <span class="vs-field-label">Ordre</span>
              <div class="vs-radio-group">
                <label class="vs-radio-label"><input type="radio" name="vs-dir" value="asc"  ${draftDir === 'asc'  ? 'checked' : ''}> Croissant</label>
                <label class="vs-radio-label"><input type="radio" name="vs-dir" value="desc" ${draftDir === 'desc' ? 'checked' : ''}> Décroissant</label>
              </div>
            </div>
          </div>
        `;
        body.querySelector('#vs-sort-by').addEventListener('change', e => { draftSort = e.target.value; });
        body.querySelectorAll('[name="vs-dir"]').forEach(r => r.addEventListener('change', e => { draftDir = e.target.value; }));
      }

      if (activeTab === 'group') {
        body.innerHTML = `
          <div class="vs-sort-row">
            <div class="vs-field-group">
              <span class="vs-field-label">Regrouper par</span>
              <select id="vs-group-by">
                ${GROUP_OPTIONS.map(o => `<option value="${o.value}" ${draftGroup === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
              </select>
            </div>
          </div>
        `;
        body.querySelector('#vs-group-by').addEventListener('change', e => { draftGroup = e.target.value; });
      }
    }

    modal.innerHTML = `
      <div class="modal-header vs-header">
        <h2>Paramètres de vue</h2>
        <button class="vs-reset-btn">Réinitialiser</button>
      </div>
      <div class="vs-tabs">
        <button class="vs-tab active" data-tab="columns">Colonnes</button>
        <button class="vs-tab" data-tab="sort">Tri</button>
        <button class="vs-tab" data-tab="group">Regroupement</button>
      </div>
      <div class="vs-body"></div>
      <div class="vs-footer">
        <button class="btn btn-secondary vs-cancel">Annuler</button>
        <button class="btn btn-primary vs-ok">OK</button>
      </div>
    `;

    renderTab();

    modal.querySelectorAll('.vs-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        activeTab = tab.dataset.tab;
        modal.querySelectorAll('.vs-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === activeTab));
        renderTab();
      });
    });

    modal.querySelector('.vs-reset-btn').addEventListener('click', () => {
      draftOrder = [...DEFAULT_OPTIONS.columnOrder];
      draftCols  = { ...DEFAULT_OPTIONS.columns };
      draftSort  = DEFAULT_OPTIONS.sortBy;
      draftDir   = DEFAULT_OPTIONS.sortDir;
      draftGroup = '';
      modal.querySelectorAll('.vs-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === activeTab));
      renderTab();
    });

    modal.querySelector('.vs-cancel').addEventListener('click', closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
    modal.querySelector('.vs-ok').addEventListener('click', () => {
      listOptions.columnOrder = draftOrder;
      listOptions.columns     = draftCols;
      listOptions.sortBy      = draftSort;
      listOptions.sortDir     = draftDir;
      listOptions.groupBy     = draftGroup || null;
      closeModal();
      renderView();
    });

    overlay.appendChild(modal);
  }

  function sortByHeader(field) {
    if (listOptions.sortBy === field) {
      listOptions.sortDir = listOptions.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      listOptions.sortBy  = field;
      listOptions.sortDir = 'asc';
    }
    renderView();
  }

  // ── Variantes ────────────────────────────────────────────────────────────────
  function captureVariantState() {
    return {
      view: currentView,
      filters: { ...filters },
      listOptions: {
        columns:     { ...listOptions.columns },
        columnOrder: [...listOptions.columnOrder],
        groupBy:     listOptions.groupBy,
        sortBy:      listOptions.sortBy,
        sortDir:     listOptions.sortDir,
      },
    };
  }

  function updateVariantBtn() {
    const btn   = $('variant-btn');
    const label = $('variant-btn-label');
    if (!btn || !label) return;
    const v = currentVariantId ? (state.variants || []).find(v => v.id === currentVariantId) : null;
    label.textContent = v ? v.name : 'Standard';
    btn.classList.toggle('has-variant', !!v);
  }

  function applyVariant(variant) {
    if (variant.listOptions) {
      listOptions = {
        ...DEFAULT_OPTIONS,
        ...variant.listOptions,
        columns:     { ...DEFAULT_OPTIONS.columns,     ...(variant.listOptions.columns || {}) },
        columnOrder: variant.listOptions.columnOrder ? [...variant.listOptions.columnOrder] : [...DEFAULT_OPTIONS.columnOrder],
      };
    }
    filters = variant.filters ? { ...variant.filters } : {};
    const el = id => $(id);
    el('filter-client')  .value = filters.client   || '';
    el('filter-project') .value = filters.project  || '';
    el('filter-category').value = filters.category || '';
    el('filter-priority').value = filters.priority || '';
    el('filter-status')  .value = filters.status   || '';
    el('filter-search')  .value = filters.search   || '';
    _refreshProjectsFilter(filters.client || '');
    currentVariantId = variant.id;
    updateVariantBtn();
    setView(variant.view || 'list');
  }

  function applyStandard() {
    listOptions = {
      ...DEFAULT_OPTIONS,
      columns:     { ...DEFAULT_OPTIONS.columns },
      columnOrder: [...DEFAULT_OPTIONS.columnOrder],
    };
    filters = {};
    ['filter-client','filter-project','filter-category','filter-priority','filter-status','filter-search']
      .forEach(id => { const el = $(id); if (el) el.value = ''; });
    _refreshProjectsFilter('');
    currentVariantId = null;
    updateVariantBtn();
    renderView();
  }

  function openVariantPanel() {
    const btn = $('variant-btn');

    // Toggle: si déjà ouvert, fermer
    const existing = $('variant-panel');
    if (existing) { existing.remove(); return; }

    const panel = document.createElement('div');
    panel.id = 'variant-panel';
    panel.className = 'variant-panel';
    btn.parentNode.appendChild(panel);

    function closePanel() {
      panel.remove();
      document.removeEventListener('click', onOutside, true);
    }
    function onOutside(e) {
      if (!panel.contains(e.target) && e.target !== btn) closePanel();
    }
    setTimeout(() => document.addEventListener('click', onOutside, true), 0);

    const variants = state.variants || [];
    panel.innerHTML = `
      ${variants.length > 5 ? `<div class="vp-search-wrap"><input class="vp-search" placeholder="Rechercher…" type="text"></div>` : ''}
      <div class="vp-list">
        <div class="vp-item ${!currentVariantId ? 'active' : ''}" data-vid="__standard__">
          <span class="vp-item-star"></span>
          <span class="vp-item-name">Standard</span>
        </div>
        ${variants.map(v => `
          <div class="vp-item ${v.id === currentVariantId ? 'active' : ''}" data-vid="${v.id}">
            <span class="vp-item-star">${v.isDefault ? '★' : ''}</span>
            <span class="vp-item-name">${v.name}</span>
          </div>
        `).join('')}
      </div>
      <div class="vp-footer">
        <button class="vp-save-btn">Enregistrer sous…</button>
        <button class="vp-manage-btn">Gérer…</button>
      </div>
    `;

    panel.querySelectorAll('.vp-item').forEach(item => {
      item.addEventListener('click', () => {
        const vid = item.dataset.vid;
        closePanel();
        if (vid === '__standard__') applyStandard();
        else {
          const v = (state.variants || []).find(v => v.id === vid);
          if (v) applyVariant(v);
        }
      });
    });

    panel.querySelector('.vp-search')?.addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      panel.querySelectorAll('.vp-item').forEach(item => {
        item.style.display = item.querySelector('.vp-item-name').textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });

    panel.querySelector('.vp-save-btn').addEventListener('click', () => {
      closePanel();
      openSaveVariantModal();
    });
    panel.querySelector('.vp-manage-btn').addEventListener('click', () => {
      closePanel();
      openManageVariantsModal();
    });
  }

  function openSaveVariantModal() {
    const overlay = $modal();
    overlay.innerHTML = '';
    overlay.classList.remove('hidden');

    const currentV = currentVariantId ? (state.variants || []).find(v => v.id === currentVariantId) : null;

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.maxWidth = '380px';
    modal.innerHTML = `
      <div class="modal-header">
        <h2>Enregistrer la variante</h2>
        <button class="modal-close" aria-label="Fermer">✕</button>
      </div>
      <div class="modal-form" style="gap:.75rem">
        <label>Nom *
          <input type="text" id="variant-name-input" value="${currentV?.name || ''}" placeholder="Nom de la variante" autocomplete="off">
        </label>
        <label style="flex-direction:row;align-items:center;gap:.5rem;font-size:.84rem;cursor:pointer;font-weight:400">
          <input type="checkbox" id="variant-default-cb" ${currentV?.isDefault ? 'checked' : ''}>
          Variante par défaut
        </label>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary modal-cancel">Annuler</button>
          <button type="button" class="btn btn-primary" id="variant-save-ok">Enregistrer</button>
        </div>
      </div>
    `;

    modal.querySelector('.modal-close').addEventListener('click', closeModal);
    modal.querySelector('.modal-cancel').addEventListener('click', closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

    modal.querySelector('#variant-save-ok').addEventListener('click', () => {
      const name = modal.querySelector('#variant-name-input').value.trim();
      if (!name) { modal.querySelector('#variant-name-input').focus(); return; }
      const isDefault = modal.querySelector('#variant-default-cb').checked;

      if (!state.variants) state.variants = [];
      if (isDefault) state.variants.forEach(v => { v.isDefault = false; });

      // Mettre à jour si même nom, sinon créer
      const existing = state.variants.find(v => v.name === name);
      if (existing) {
        Object.assign(existing, { isDefault, ...captureVariantState() });
        currentVariantId = existing.id;
      } else {
        const v = { id: uid(), name, isDefault, ...captureVariantState() };
        state.variants.push(v);
        currentVariantId = v.id;
      }

      markDirty();
      updateVariantBtn();
      closeModal();
    });

    overlay.appendChild(modal);
    setTimeout(() => modal.querySelector('#variant-name-input').focus(), 50);
  }

  function openManageVariantsModal() {
    const overlay = $modal();
    overlay.innerHTML = '';
    overlay.classList.remove('hidden');

    const modal = document.createElement('div');
    modal.className = 'modal modal-wide';

    function render() {
      const variants = state.variants || [];
      modal.innerHTML = `
        <div class="modal-header">
          <h2>Gérer les variantes</h2>
          <button class="modal-close" aria-label="Fermer">✕</button>
        </div>
        <div class="modal-body">
          ${!variants.length ? '<p class="empty-state" style="padding:1.5rem 1.25rem">Aucune variante sauvegardée.</p>' : `
          <table class="variants-table">
            <thead><tr>
              <th>Nom</th>
              <th style="text-align:center;width:90px">Par défaut</th>
              <th style="width:36px"></th>
            </tr></thead>
            <tbody>
              ${variants.map(v => `
                <tr>
                  <td><input class="vt-name-input" type="text" value="${v.name}" data-id="${v.id}"></td>
                  <td style="text-align:center"><input type="radio" name="vt-default" value="${v.id}" ${v.isDefault ? 'checked' : ''}></td>
                  <td><button class="btn btn-danger btn-sm vt-delete-btn" data-id="${v.id}" title="Supprimer">✕</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>`}
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary modal-cancel">Fermer</button>
          ${variants.length ? `<button class="btn btn-primary" id="vt-save-btn">Enregistrer</button>` : ''}
        </div>
      `;

      modal.querySelector('.modal-close').addEventListener('click', closeModal);
      modal.querySelector('.modal-cancel').addEventListener('click', closeModal);
      overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

      modal.querySelector('#vt-save-btn')?.addEventListener('click', () => {
        const defaultId = modal.querySelector('[name="vt-default"]:checked')?.value || null;
        modal.querySelectorAll('.vt-name-input').forEach(input => {
          const v = state.variants.find(v => v.id === input.dataset.id);
          if (v) { v.name = input.value.trim() || v.name; v.isDefault = v.id === defaultId; }
        });
        markDirty();
        updateVariantBtn();
        closeModal();
      });

      modal.querySelectorAll('.vt-delete-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.id;
          if (id === currentVariantId) { currentVariantId = null; }
          state.variants = state.variants.filter(v => v.id !== id);
          markDirty();
          updateVariantBtn();
          render();
        });
      });
    }

    render();
    overlay.appendChild(modal);
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

    // Projects — expose as module-level function for applyVariant
    _refreshProjectsFilter = function(clientId) {
      projectSel.innerHTML = '<option value="">Tous les projets</option>';
      state.projects
        .filter(p => !clientId || p.clientId === clientId)
        .forEach(p => {
          const o = document.createElement('option');
          o.value = p.id; o.textContent = p.name;
          projectSel.appendChild(o);
        });
    };
    _refreshProjectsFilter('');

    clientSel.addEventListener('change', () => {
      filters.client = clientSel.value || null;
      filters.project = null;
      projectSel.value = '';
      _refreshProjectsFilter(clientSel.value);
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
      _refreshProjectsFilter('');
      currentVariantId = null;
      updateVariantBtn();
      renderView();
    });

    $('variant-btn').addEventListener('click', openVariantPanel);
  }

  // ── Vue détail tâche (navigation full-page Fiori) ────────────────────────
  function openTaskDetail(taskId, defaultProjectId) {
    const task  = taskId ? state.tasks.find(t => t.id === taskId) : null;
    const isNew = !task;

    function getColor(pid) {
      const proj   = state.projects.find(p => p.id === pid);
      const client = proj ? state.clients.find(c => c.id === proj.clientId) : null;
      return client?.color || '#185FA5';
    }
    function getClientName(pid) {
      const proj = state.projects.find(p => p.id === pid);
      return proj ? (state.clients.find(c => c.id === proj.clientId)?.name || '') : '';
    }
    function getProjectName(pid) {
      return state.projects.find(p => p.id === pid)?.name || '';
    }

    const initProjId = task?.projectId || defaultProjectId || '';
    const color      = getColor(initProjId);

    const container = $view();
    history.pushState({ taskDetail: true }, '', '#detail');
    document.querySelector('.filter-bar').style.display = 'none';
    container.className = 'view-task-detail';
    container.innerHTML = `
      <div class="td-topbar">
        <button class="td-back-btn" id="td-back">← Retour</button>
        ${!isNew && initProjId ? `
          <span class="td-breadcrumb">
            <span class="td-bc-client" style="color:${color}">${getClientName(initProjId)}</span>
            <span class="td-bc-sep">›</span>
            <span>${getProjectName(initProjId)}</span>
          </span>` : ''}
      </div>
      <div class="td-obj-header" id="td-obj-header" style="border-left-color:${color}">
        <input id="td-name-input" class="td-obj-name-input"
          value="${(task?.name || '').replace(/"/g,'&quot;')}"
          placeholder="Nom de la tâche"
          autocomplete="off">
        ${!isNew ? `<button type="button" id="td-focus-btn" class="td-focus-btn${task?.daily_flag ? ' flagged' : ''}" title="${task?.daily_flag ? 'Retirer du focus' : 'Ajouter au focus du jour'}">☀</button>` : ''}
      </div>
      <form id="task-detail-form" class="td-form-page">
        <div class="td-fields-grid">
          <div class="td-field">
            <label class="td-field-label">Projet *</label>
            <select name="projectId" required>
              <option value="">— Choisir —</option>
              ${state.projects.map(p => {
                const c = state.clients.find(c => c.id === p.clientId);
                const sel = initProjId === p.id ? 'selected' : '';
                return `<option value="${p.id}" ${sel}>${c?.name} / ${p.name}</option>`;
              }).join('')}
            </select>
          </div>
          <div class="td-field">
            <label class="td-field-label">Livrable</label>
            <select name="deliverableId"></select>
          </div>
        </div>
        <div class="td-fields-grid td-fields-grid-4">
          <div class="td-field">
            <label class="td-field-label">Catégorie *</label>
            <select name="category" class="inline-select" required>
              ${CATEGORIES.map(cat => `<option ${task?.category === cat ? 'selected' : ''}>${cat}</option>`).join('')}
            </select>
          </div>
          <div class="td-field">
            <label class="td-field-label">Priorité *</label>
            <select name="priority" class="inline-select" required>
              ${PRIORITIES.map(p => `<option ${task?.priority === p ? 'selected' : ''}>${p}</option>`).join('')}
            </select>
          </div>
          <div class="td-field">
            <label class="td-field-label">Statut *</label>
            <select name="status" class="inline-select" required>
              ${STATUSES.map(s => `<option ${task?.status === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
          <div class="td-field">
            <label class="td-field-label">Deadline</label>
            <input name="deadline" type="date" value="${task?.deadline || ''}">
          </div>
        </div>
        <hr class="td-divider">
        <div class="td-field">
          <div class="notes-editor-header">
            <span class="td-field-label">Notes</span>
            <div class="notes-tab-group">
              <button type="button" class="notes-tab" data-ntab="edit">Markdown</button>
              <button type="button" class="notes-tab active" data-ntab="preview">Aperçu</button>
            </div>
          </div>
          <textarea name="notes" class="notes-textarea hidden" style="min-height:220px"
            placeholder="Remarques, contexte… (Markdown supporté)">${(task?.notes || '').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea>
          <div class="notes-preview-pane"></div>
        </div>
        <div class="td-form-footer">
          ${!isNew ? `<button type="button" class="btn btn-danger td-delete-btn">Supprimer</button>` : '<span></span>'}
          <div class="td-form-footer-right">
            <button type="button" class="btn btn-secondary td-cancel-btn">Annuler</button>
            <button type="submit" class="btn btn-primary">${isNew ? 'Créer la tâche' : 'Enregistrer'}</button>
          </div>
        </div>
      </form>
    `;

    const form       = container.querySelector('#task-detail-form');
    const projectSel = form.querySelector('[name="projectId"]');
    const delivSel   = form.querySelector('[name="deliverableId"]');

    function refreshDeliverables(projectId) {
      const current = task?.deliverableId || '';
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
    refreshDeliverables(projectSel.value);

    projectSel.addEventListener('change', () => {
      refreshDeliverables(projectSel.value);
      const c = getColor(projectSel.value);
      container.querySelector('#td-obj-header').style.borderLeftColor = c;
      const bc = container.querySelector('.td-breadcrumb');
      if (bc) {
        bc.innerHTML = `
          <span class="td-bc-client" style="color:${c}">${getClientName(projectSel.value)}</span>
          <span class="td-bc-sep">›</span>
          <span>${getProjectName(projectSel.value)}</span>`;
      }
    });

    colorSelect(form.querySelector('[name="category"]'), 'category');
    colorSelect(form.querySelector('[name="priority"]'),  'priority');
    colorSelect(form.querySelector('[name="status"]'),    'status');

    // Bouton focus dans le détail
    const focusBtn = container.querySelector('#td-focus-btn');
    if (focusBtn) {
      focusBtn.addEventListener('click', () => {
        const t = state.tasks.find(t => t.id === taskId);
        if (!t) return;
        if (t.daily_flag) {
          t.daily_flag = false; t.daily_flag_date = null;
        } else {
          const count = state.tasks.filter(t => t.daily_flag).length;
          if (count >= 5) { alert('Vous avez déjà 5 tâches dans le focus du jour.'); return; }
          t.daily_flag = true; t.daily_flag_date = new Date().toISOString().slice(0, 10);
        }
        markDirty();
        focusBtn.classList.toggle('flagged', !!t.daily_flag);
        focusBtn.title = t.daily_flag ? 'Retirer du focus' : 'Ajouter au focus du jour';
      });
    }

    const notesTextarea = form.querySelector('.notes-textarea');
    const notesPreview  = form.querySelector('.notes-preview-pane');

    // Aperçu par défaut
    notesPreview.innerHTML = (typeof renderMarkdown !== 'undefined')
      ? renderMarkdown(notesTextarea.value)
      : (notesTextarea.value || '<em style="color:var(--gray-500)">Aucune note.</em>');

    form.querySelectorAll('[data-ntab]').forEach(tab => {
      tab.addEventListener('click', () => {
        form.querySelectorAll('[data-ntab]').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        if (tab.dataset.ntab === 'preview') {
          notesPreview.innerHTML = (typeof renderMarkdown !== 'undefined')
            ? renderMarkdown(notesTextarea.value)
            : notesTextarea.value;
          notesPreview.classList.remove('hidden');
          notesTextarea.classList.add('hidden');
        } else {
          notesPreview.classList.add('hidden');
          notesTextarea.classList.remove('hidden');
        }
      });
    });

    container.querySelector('#td-back').addEventListener('click', () => history.back());
    form.querySelector('.td-cancel-btn').addEventListener('click', () => history.back());

    form.querySelector('.td-delete-btn')?.addEventListener('click', () => {
      if (confirm(`Supprimer « ${task.name} » ?`)) {
        state.tasks = state.tasks.filter(t => t.id !== taskId);
        markDirty();
        history.back();
      }
    });

    form.addEventListener('submit', e => {
      e.preventDefault();
      const nameVal = container.querySelector('#td-name-input').value.trim();
      if (!nameVal) { container.querySelector('#td-name-input').focus(); return; }
      const fd   = new FormData(e.target);
      const data = Object.fromEntries(fd.entries());
      data.name  = nameVal;
      const now  = new Date().toISOString();
      if (isNew) {
        state.tasks.push({ id: uid(), ...data, deliverableId: data.deliverableId || null, notes: data.notes || '', updatedAt: now });
      } else {
        Object.assign(task, { ...data, deliverableId: data.deliverableId || null, updatedAt: now });
      }
      markDirty();
      history.back();
    });

    setTimeout(() => container.querySelector('#td-name-input')?.focus(), 60);
  }

  function closeTaskDetail() { renderView(); }

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
    $('add-task-btn').addEventListener('click', () => openTaskDetail(null));
    $('add-client-btn').addEventListener('click', () => openClientModal(null));
    $('add-project-btn').addEventListener('click', () => openProjectModal(null));
    $('manage-deliverables-btn').addEventListener('click', () => openDeliverablesModal());

    // Auth button
    $('auth-btn').addEventListener('click', () => {
      if (Storage.isConnected) Storage.signOut();
      else Storage.requestAuth();
      updateAuthUI(Storage.isConnected);
    });

    // Keyboard shortcut: Escape ferme modal (les autres vues gèrent leur retour)
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeModal();
    });

    // Bouton Back du navigateur : retour à la vue principale depuis le détail
    window.addEventListener('popstate', () => {
      if ($view().className === 'view-task-detail') renderView();
    });

    if (!state.variants) state.variants = [];

    // F3 — nettoyer les flags des tâches terminées
    let flagDirty = false;
    state.tasks.forEach(t => {
      if (t.daily_flag && t.status === 'Terminé') { t.daily_flag = false; t.daily_flag_date = null; flagDirty = true; }
    });
    if (flagDirty) markDirty();

    buildFilterBar();

    const defaultV = state.variants.find(v => v.isDefault);
    if (defaultV) applyVariant(defaultV);
    else setView('list');
  }

  // ── Focus du Jour ────────────────────────────────────────────────────────────
  function toggleDailyFlag(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;
    if (task.daily_flag) {
      task.daily_flag = false;
      task.daily_flag_date = null;
    } else {
      const flagged = state.tasks.filter(t => t.daily_flag).length;
      if (flagged >= 5) { alert('Vous avez déjà 5 tâches dans le focus du jour.'); return; }
      task.daily_flag = true;
      task.daily_flag_date = new Date().toISOString().slice(0, 10);
    }
    markDirty();
    renderView();
  }

  function updateTaskField(taskId, field, value) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;
    task[field] = value;
    task.updatedAt = new Date().toISOString();
    markDirty();
  }

  // Public surface used by Views
  return { init, openTaskModal: openTaskDetail, openTaskDetail, openProjectModal, openClientModal, updateTaskField, openViewSettingsModal, sortByHeader, toggleDailyFlag };
})();

document.addEventListener('DOMContentLoaded', App.init);
