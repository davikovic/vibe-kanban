/* ============================================
   KanbanFlow — Application Logic
   ============================================ */

// ─── STATE ───────────────────────────────────
let state = {
  tasks: [],
  settings: { situations: [] },
  currentPage: 'board',
  editingTaskId: null,
  draggedTaskId: null,
  completionTimers: {}
};

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
    state.settings = data.settings || { situations: [] };
  } catch (e) {
    state.tasks = [];
    state.settings = { situations: ['Aguardando Cliente', 'Aguardando Resposta', 'Em Análise', 'Bloqueado', 'Em Andamento', 'Sem Situação'] };
  }

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

  // Populate situations
  situationSelect.innerHTML = '<option value="">— Nenhuma —</option>';
  state.settings.situations.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    situationSelect.appendChild(opt);
  });

  if (taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (task) {
      titleEl.textContent = 'Editar Tarefa';
      titleInput.value = task.title;
      descInput.value = task.description || '';
      statusInput.value = task.status || '';
      situationSelect.value = task.situation || '';
    }
  } else {
    titleEl.textContent = 'Nova Tarefa';
    titleInput.value = '';
    descInput.value = '';
    statusInput.value = presetStatus !== null ? presetStatus : 'todo';
    situationSelect.value = '';
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

  const task = {
    id: state.editingTaskId || `task_${Date.now()}`,
    title,
    description: document.getElementById('task-desc').value.trim(),
    status: document.getElementById('task-status').value,
    situation: document.getElementById('task-situation').value,
    createdAt: state.editingTaskId
      ? state.tasks.find(t => t.id === state.editingTaskId)?.createdAt || new Date().toISOString()
      : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completed: false
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
      const idx = +e.target.dataset.idx;
      state.settings.situations.splice(idx, 1);
      await window.api.saveSettings(state.settings);
      renderSettings();
      showToast('Situação removida', 'info');
    });
  });

  // Add situation button
  const addBtn = document.getElementById('btn-add-situation');
  if (addBtn) {
    addBtn.onclick = async () => {
      state.settings.situations.push('Nova Situação');
      await window.api.saveSettings(state.settings);
      renderSettings();
      const inputs = document.querySelectorAll('.situation-input');
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
function createTaskCard(task) {
  const card = document.createElement('div');
  card.className = 'task-card';
  card.dataset.id = task.id;
  card.dataset.status = task.status;
  card.draggable = true;

  const situation = task.situation || '';
  const icon = situation ? getSituationIcon(situation) : '';
  const date = formatDate(task.createdAt);

  card.innerHTML = `
    <div class="task-card-header">
      <div class="task-title">${escapeHtml(task.title)}</div>
      <div class="task-actions">
        <button class="task-action-btn edit" title="Editar">✎</button>
        <button class="task-action-btn delete" title="Excluir">✕</button>
      </div>
    </div>
    ${task.description ? `<div class="task-desc">${escapeHtml(task.description)}</div>` : ''}
    <div class="task-footer">
      ${situation ? `<span class="situation-badge">${icon} ${escapeHtml(situation)}</span>` : '<span></span>'}
      <span class="task-date">${date}</span>
    </div>
  `;

  card.querySelector('.edit').onclick = (e) => { e.stopPropagation(); openModal(task.id); };
  card.querySelector('.delete').onclick = (e) => { e.stopPropagation(); deleteTask(task.id); };

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
  state.draggedTaskId = e.currentTarget.dataset.id;
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function onDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
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
