/* ============================================
   KanbanFlow — Application Logic
   ============================================ */

// ─── STATE ───────────────────────────────────
let state = {
  tasks: [],
  settings: { situations: [], projects: [] },
  currentPage: 'board',
  editingTaskId: null,
  draggedTaskId: null,
  isDragging: false,
  completionTimers: {}
};

// ─── PRIORITY CONFIG ──────────────────────────
const PRIORITY = {
  low:    { label: 'Baixa',  color: '#4ADE80' },
  medium: { label: 'Média',  color: '#FBBF24' },
  high:   { label: 'Alta',   color: '#F87171' },
};

// ─── DEFAULT PROJECTS ─────────────────────────
const DEFAULT_PROJECTS = [
  { name: 'Geral',    color: '#6C8EFF' },
  { name: 'Design',   color: '#C084FC' },
  { name: 'Backend',  color: '#FF9B50' },
  { name: 'Frontend', color: '#4ADE80' },
];

// ─── SITUATION ICONS ─────────────────────────
const SITUATION_ICONS = {
  'Aguardando Cliente': '👤',
  'Aguardando Resposta': '💬',
  'Em Análise': '🔍',
  'Bloqueado': '🚫',
  'Em Andamento': '⚡',
  'Sem Situação': '○',
};

function getSituationIcon(situation) {
  return SITUATION_ICONS[situation] || '●';
}

// ─── INIT ─────────────────────────────────────
async function init() {
  try {
    const data = await window.api.getData();
    state.tasks = data.tasks || [];
    state.settings = data.settings || { situations: [], projects: [] };
  } catch (e) {
    state.tasks = [];
    state.settings = { situations: ['Aguardando Cliente', 'Aguardando Resposta', 'Em Análise', 'Bloqueado', 'Em Andamento', 'Sem Situação'], projects: [] };
  }
  // Ensure projects array exists (backward compat)
  if (!state.settings.projects) state.settings.projects = [];
  if (state.settings.projects.length === 0) state.settings.projects = JSON.parse(JSON.stringify(DEFAULT_PROJECTS));

  setupNav();
  setupTitlebar();
  setupModal();
  setupDragAndDrop();
  renderAll();
  restoreCompletionTimers();
}

// ─── NAVIGATION ───────────────────────────────
function setupNav() {
  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(item.dataset.page);
    });
  });
}

function navigateTo(page) {
  state.currentPage = page;
  document.querySelectorAll('.nav-item[data-page]').forEach(i => {
    i.classList.toggle('active', i.dataset.page === page);
  });
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.getElementById(`page-${page}`)?.classList.remove('hidden');
  renderAll();
}

// ─── TITLEBAR ─────────────────────────────────
function setupTitlebar() {
  document.getElementById('btn-minimize').onclick = () => window.api.windowMinimize();
  document.getElementById('btn-maximize').onclick = () => window.api.windowMaximize();
  document.getElementById('btn-close').onclick = () => window.api.windowClose();
  document.getElementById('theme-toggle').onclick = toggleTheme;
}

function toggleTheme() {
  const body = document.body;
  const isDark = body.classList.contains('theme-dark');
  body.classList.toggle('theme-dark', !isDark);
  body.classList.toggle('theme-light', isDark);
  document.getElementById('theme-icon').textContent = isDark ? '○' : '◐';
}

// ─── MODAL ────────────────────────────────────
function setupModal() {
  document.getElementById('btn-new-task').onclick = () => openModal();
  document.getElementById('btn-new-task-backlog').onclick = () => openModal(null, '');
  document.getElementById('modal-close').onclick = closeModal;
  document.getElementById('btn-cancel').onclick = closeModal;
  document.getElementById('btn-save').onclick = saveTask;
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });
}

function openModal(taskId = null, presetStatus = null) {
  state.editingTaskId = taskId;
  const overlay = document.getElementById('modal-overlay');
  const titleEl = document.getElementById('modal-title');
  const titleInput = document.getElementById('task-title');
  const descInput = document.getElementById('task-desc');
  const statusInput = document.getElementById('task-status');
  const situationSelect = document.getElementById('task-situation');
  const projectSelect = document.getElementById('task-project');
  const prioritySelect = document.getElementById('task-priority');

  // Populate situations
  situationSelect.innerHTML = '<option value="">— Nenhuma —</option>';
  state.settings.situations.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s; opt.textContent = s;
    situationSelect.appendChild(opt);
  });

  // Populate projects
  projectSelect.innerHTML = '<option value="">— Nenhum —</option>';
  state.settings.projects.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.name; opt.textContent = p.name;
    projectSelect.appendChild(opt);
  });

  if (taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (task) {
      titleEl.textContent = 'Editar Tarefa';
      titleInput.value = task.title;
      descInput.value = task.description || '';
      statusInput.value = task.status || '';
      situationSelect.value = task.situation || '';
      projectSelect.value = task.project || '';
      prioritySelect.value = task.priority || 'medium';
      renderChecklistEditor(task.checklist || []);
    }
  } else {
    titleEl.textContent = 'Nova Tarefa';
    titleInput.value = '';
    descInput.value = '';
    statusInput.value = presetStatus !== null ? presetStatus : 'todo';
    situationSelect.value = '';
    projectSelect.value = '';
    prioritySelect.value = 'medium';
    renderChecklistEditor([]);
  }

  overlay.classList.remove('hidden');
  titleInput.focus();
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  state.editingTaskId = null;
}

async function saveTask() {
  const title = document.getElementById('task-title').value.trim();
  if (!title) {
    showToast('⚠️ O título é obrigatório', 'warning');
    document.getElementById('task-title').focus();
    return;
  }

  const existing = state.tasks.find(t => t.id === state.editingTaskId);
  const task = {
    id: state.editingTaskId || `task_${Date.now()}`,
    title,
    description: document.getElementById('task-desc').value.trim(),
    status: document.getElementById('task-status').value,
    situation: document.getElementById('task-situation').value,
    project: document.getElementById('task-project').value,
    priority: document.getElementById('task-priority').value || 'medium',
    checklist: readChecklistFromEditor(),
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completed: existing?.completed || false,
    completedAt: existing?.completedAt || null,
  };

  const existingIdx = state.tasks.findIndex(t => t.id === task.id);
  if (existingIdx >= 0) {
    state.tasks[existingIdx] = task;
  } else {
    state.tasks.push(task);
  }

  await window.api.saveTask(task);
  closeModal();
  renderAll();
  showToast(state.editingTaskId ? '✓ Tarefa atualizada' : '✓ Tarefa criada', 'success');
}

// ─── RENDER ───────────────────────────────────
function renderAll() {
  renderBoard();
  renderBacklog();
  renderCompleted();
  renderSettings();
}

function renderBoard() {
  const statuses = ['todo', 'progress', 'review', 'done'];
  statuses.forEach(status => {
    const col = document.getElementById(`col-${status}`);
    if (!col) return;
    const tasks = state.tasks.filter(t => !t.completed && t.status === status);
    col.innerHTML = '';
    document.getElementById(`count-${status}`).textContent = tasks.length;

    if (tasks.length === 0) {
      col.innerHTML = `<div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:12px;padding:20px;text-align:center">Sem tarefas aqui</div>`;
    } else {
      tasks.forEach(task => col.appendChild(createTaskCard(task)));
    }
  });
}

function renderBacklog() {
  const list = document.getElementById('backlog-list');
  if (!list) return;
  const tasks = state.tasks.filter(t => !t.completed && !t.status);
  list.innerHTML = '';

  if (tasks.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-state-icon">◫</div><div class="empty-state-text">Backlog vazio</div><div class="empty-state-sub">Crie uma tarefa sem status definido</div></div>`;
    return;
  }
  tasks.forEach(task => list.appendChild(createListCard(task, 'backlog')));
}

function renderCompleted() {
  const list = document.getElementById('completed-list');
  if (!list) return;
  const tasks = state.tasks.filter(t => t.completed).sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
  list.innerHTML = '';

  if (tasks.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-state-icon">◉</div><div class="empty-state-text">Nenhuma tarefa concluída</div><div class="empty-state-sub">As tarefas concluídas aparecerão aqui</div></div>`;
    return;
  }
  tasks.forEach(task => list.appendChild(createListCard(task, 'completed')));
}

function renderSettings() {
  // ── Situations ──
  const list = document.getElementById('situations-list');
  if (!list) return;
  list.innerHTML = '';
  state.settings.situations.forEach((s, i) => {
    const item = document.createElement('div');
    item.className = 'situation-item';
    item.innerHTML = `
      <span style="font-size:16px;flex-shrink:0">${getSituationIcon(s)}</span>
      <input class="situation-input" type="text" value="${escapeHtml(s)}" data-idx="${i}" />
      <button class="situation-del" data-idx="${i}" title="Remover">✕</button>
    `;
    list.appendChild(item);
  });

  list.querySelectorAll('.situation-input').forEach(inp => {
    inp.addEventListener('input', (e) => {
      state.settings.situations[+e.target.dataset.idx] = e.target.value;
      scheduleSaveSettings();
    });
  });
  list.querySelectorAll('.situation-del').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      state.settings.situations.splice(+e.target.dataset.idx, 1);
      await window.api.saveSettings(state.settings);
      renderSettings();
      showToast('Situação removida', 'info');
    });
  });

  const addSitBtn = document.getElementById('btn-add-situation');
  if (addSitBtn) {
    addSitBtn.onclick = async () => {
      state.settings.situations.push('Nova Situação');
      await window.api.saveSettings(state.settings);
      renderSettings();
      const inputs = document.querySelectorAll('.situation-input');
      const last = inputs[inputs.length - 1];
      if (last) { last.select(); last.focus(); }
    };
  }

  // ── Projects ──
  const plist = document.getElementById('projects-list');
  if (!plist) return;
  plist.innerHTML = '';
  state.settings.projects.forEach((p, i) => {
    const item = document.createElement('div');
    item.className = 'situation-item';
    item.innerHTML = `
      <input type="color" class="project-color-input" value="${p.color}" data-idx="${i}" title="Cor do projeto" style="width:28px;height:28px;border:none;background:none;cursor:pointer;padding:0;flex-shrink:0;border-radius:4px;" />
      <input class="situation-input project-name-input" type="text" value="${escapeHtml(p.name)}" data-idx="${i}" />
      <button class="situation-del" data-idx="${i}" title="Remover">✕</button>
    `;
    plist.appendChild(item);
  });

  plist.querySelectorAll('.project-name-input').forEach(inp => {
    inp.addEventListener('input', (e) => {
      state.settings.projects[+e.target.dataset.idx].name = e.target.value;
      scheduleSaveSettings();
    });
  });
  plist.querySelectorAll('.project-color-input').forEach(inp => {
    inp.addEventListener('input', (e) => {
      state.settings.projects[+e.target.dataset.idx].color = e.target.value;
      scheduleSaveSettings();
    });
  });
  plist.querySelectorAll('.situation-del').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      state.settings.projects.splice(+e.target.dataset.idx, 1);
      await window.api.saveSettings(state.settings);
      renderSettings();
      showToast('Projeto removido', 'info');
    });
  });

  const addProjBtn = document.getElementById('btn-add-project');
  if (addProjBtn) {
    addProjBtn.onclick = async () => {
      state.settings.projects.push({ name: 'Novo Projeto', color: '#6C8EFF' });
      await window.api.saveSettings(state.settings);
      renderSettings();
      const inputs = document.querySelectorAll('.project-name-input');
      const last = inputs[inputs.length - 1];
      if (last) { last.select(); last.focus(); }
    };
  }
}

let saveSettingsTimer = null;
function scheduleSaveSettings() {
  clearTimeout(saveSettingsTimer);
  saveSettingsTimer = setTimeout(async () => {
    await window.api.saveSettings(state.settings);
  }, 800);
}

// ─── CARD CREATION ────────────────────────────
function getProjectColor(projectName) {
  const p = state.settings.projects.find(p => p.name === projectName);
  return p ? p.color : '#6C8EFF';
}

function createTaskCard(task) {
  const card = document.createElement('div');
  card.className = 'task-card';
  card.dataset.id = task.id;
  card.dataset.status = task.status;
  card.draggable = true;

  const situation = task.situation || '';
  const icon = situation ? getSituationIcon(situation) : '';
  const date = formatDate(task.createdAt);
  const priority = task.priority || 'medium';
  const pColor = PRIORITY[priority]?.color || '#FBBF24';
  const project = task.project || '';
  const projColor = project ? getProjectColor(project) : null;
  const checklist = task.checklist || [];
  const checkDone = checklist.filter(c => c.done).length;

  card.innerHTML = `
    <div class="task-card-header">
      <span class="priority-dot" style="background:${pColor}" title="Prioridade: ${PRIORITY[priority]?.label}"></span>
      <div class="task-title">${escapeHtml(task.title)}</div>
      <div class="task-actions">
        <button class="task-action-btn edit" title="Editar">✎</button>
        <button class="task-action-btn delete" title="Excluir">✕</button>
      </div>
    </div>
    ${task.description ? `<div class="task-desc">${escapeHtml(task.description)}</div>` : ''}
    <div class="task-footer">
      <div class="task-tags">
        ${projColor ? `<span class="project-badge" style="background:${projColor}22;color:${projColor};border-color:${projColor}44">${escapeHtml(project)}</span>` : ''}
        ${situation ? `<span class="situation-badge">${icon} ${escapeHtml(situation)}</span>` : ''}
        ${checklist.length > 0 ? `<span class="checklist-count">☑ ${checkDone}/${checklist.length}</span>` : ''}
      </div>
      <span class="task-date">${date}</span>
    </div>
  `;

  // Edit button
  card.querySelector('.edit').addEventListener('click', (e) => { e.stopPropagation(); openModal(task.id); });
  // Delete button
  card.querySelector('.delete').addEventListener('click', (e) => { e.stopPropagation(); deleteTask(task.id); });

  // Click card to edit (only if not dragging)
  card.addEventListener('click', () => {
    if (!state.isDragging) openModal(task.id);
  });

  card.addEventListener('dragstart', onDragStart);
  card.addEventListener('dragend', onDragEnd);

  return card;
}

function createListCard(task, type) {
  const card = document.createElement('div');
  card.className = `list-card ${type}`;
  card.dataset.id = task.id;

  const situation = task.situation || '';
  const icon = situation ? getSituationIcon(situation) : (type === 'completed' ? '✓' : '◫');
  const date = formatDate(type === 'completed' ? task.completedAt : task.createdAt);

  card.innerHTML = `
    <div class="list-card-icon">${icon}</div>
    <div class="list-card-body">
      <div class="list-card-title">${escapeHtml(task.title)}</div>
      <div class="list-card-desc">${escapeHtml(task.description || 'Sem descrição')}</div>
    </div>
    <div class="list-card-meta">
      ${situation ? `<span class="situation-badge">${escapeHtml(situation)}</span>` : ''}
      <span class="task-date">${date}</span>
    </div>
  `;

  if (type === 'backlog') {
    card.onclick = () => openModal(task.id);
  }

  return card;
}

// ─── DRAG & DROP ──────────────────────────────
function setupDragAndDrop() {
  document.querySelectorAll('.col-body').forEach(col => {
    col.addEventListener('dragover', onDragOver);
    col.addEventListener('drop', onDrop);
    col.addEventListener('dragleave', onDragLeave);
  });
}

function onDragStart(e) {
  state.isDragging = true;
  state.draggedTaskId = e.currentTarget.dataset.id;
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function onDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  // Use setTimeout so the click event (which fires after dragend) sees isDragging=true and skips
  setTimeout(() => { state.isDragging = false; }, 0);
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}

function onDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

async function onDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');

  const newStatus = e.currentTarget.dataset.status;
  const taskId = state.draggedTaskId;
  if (!taskId || !newStatus) return;

  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;

  const oldStatus = task.status;
  if (oldStatus === newStatus) return;

  task.status = newStatus;
  task.updatedAt = new Date().toISOString();

  await window.api.saveTask(task);
  renderAll();

  if (newStatus === 'done') {
    startCompletionTimer(taskId);
    showToast('⏱ Tarefa será movida para Completed em 1 minuto', 'info');
  } else if (oldStatus === 'done' && state.completionTimers[taskId]) {
    clearTimeout(state.completionTimers[taskId].timeoutId);
    clearInterval(state.completionTimers[taskId].intervalId);
    delete state.completionTimers[taskId];
  }
}

// ─── COMPLETION TIMER ─────────────────────────
function startCompletionTimer(taskId) {
  if (state.completionTimers[taskId]) {
    clearTimeout(state.completionTimers[taskId].timeoutId);
    clearInterval(state.completionTimers[taskId].intervalId);
  }

  const finishAt = Date.now() + 60000;

  const timeoutId = setTimeout(async () => {
    clearInterval(state.completionTimers[taskId]?.intervalId);
    delete state.completionTimers[taskId];

    const task = state.tasks.find(t => t.id === taskId);
    if (task && task.status === 'done') {
      task.completed = true;
      task.status = 'completed';
      task.completedAt = new Date().toISOString();
      await window.api.saveTask(task);
      renderAll();
      showToast(`✓ "${task.title}" movida para Completed`, 'success');
    }
  }, 60000);

  const intervalId = setInterval(() => {
    const remaining = Math.ceil((finishAt - Date.now()) / 1000);
    const card = document.querySelector(`.task-card[data-id="${taskId}"]`);
    if (card) {
      let badge = card.querySelector('.countdown-badge');
      if (!badge) {
        badge = document.createElement('div');
        badge.className = 'countdown-badge';
        card.appendChild(badge);
      }
      badge.textContent = `${remaining}s`;
    }
    if (remaining <= 0) clearInterval(intervalId);
  }, 1000);

  state.completionTimers[taskId] = { timeoutId, intervalId, finishAt };
}

function restoreCompletionTimers() {
  // On reload, resume any "done" tasks that haven't been moved yet
  // (in case app was restarted — just let them sit; no timer to restore)
}

// ─── CHECKLIST EDITOR ─────────────────────────
function renderChecklistEditor(items) {
  const container = document.getElementById('checklist-items');
  container.innerHTML = '';
  items.forEach((item, i) => {
    const row = document.createElement('div');
    row.className = 'checklist-row';
    row.innerHTML = `
      <input type="checkbox" class="check-done" data-idx="${i}" ${item.done ? 'checked' : ''} />
      <input type="text" class="check-text" data-idx="${i}" value="${escapeHtml(item.text)}" placeholder="Item..." />
      <button type="button" class="situation-del check-del" data-idx="${i}" title="Remover">✕</button>
    `;
    container.appendChild(row);
  });

  // Re-bind add button each time
  const addBtn = document.getElementById('btn-add-check');
  // Clone to remove old listeners
  const newBtn = addBtn.cloneNode(true);
  addBtn.parentNode.replaceChild(newBtn, addBtn);
  newBtn.addEventListener('click', () => {
    const current = readChecklistFromEditor();
    current.push({ text: '', done: false });
    renderChecklistEditor(current);
    const texts = container.querySelectorAll('.check-text');
    texts[texts.length - 1]?.focus();
  });

  container.querySelectorAll('.check-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const current = readChecklistFromEditor();
      current.splice(+btn.dataset.idx, 1);
      renderChecklistEditor(current);
    });
  });
}

function readChecklistFromEditor() {
  const container = document.getElementById('checklist-items');
  const items = [];
  container.querySelectorAll('.checklist-row').forEach(row => {
    const text = row.querySelector('.check-text').value.trim();
    const done = row.querySelector('.check-done').checked;
    if (text) items.push({ text, done });
  });
  return items;
}

// ─── DELETE TASK ──────────────────────────────
async function deleteTask(taskId) {
  if (!confirm('Excluir esta tarefa?')) return;

  if (state.completionTimers[taskId]) {
    clearTimeout(state.completionTimers[taskId].timeoutId);
    clearInterval(state.completionTimers[taskId].intervalId);
    delete state.completionTimers[taskId];
  }

  state.tasks = state.tasks.filter(t => t.id !== taskId);
  await window.api.deleteTask(taskId);
  renderAll();
  showToast('Tarefa excluída', 'info');
}

// ─── TOAST ────────────────────────────────────
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = '0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ─── UTILS ────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

// ─── START ────────────────────────────────────
init();
