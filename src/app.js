// Initialize libraries
const { marked, createDOMPurify } = window.libs || {};
const DOMPurify = createDOMPurify ? createDOMPurify(window) : null;
// Markdown libraries loaded globally
const markedLib = window.marked || null;
const DOMPurifyLib = window.DOMPurify || null;

/* ============================================
   KanbanFlow — Application Logic
   ============================================ */

// ─── STATE ───────────────────────────────────
let state = {
  tasks: [],
  settings: { situations: [], projects: [] },
  stickies: [],
  currentPage: 'board',
  editingTaskId: null,
  draggedTaskId: null,
  isDragging: false,
  completionTimers: {},
  stickyZTop: 100
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
  if (!window.api) {
    console.error('window.api is undefined — preload failed to load.');
    return;
  }
  try {
    const data = await window.api.getData();
    state.tasks = data.tasks || [];
    state.settings = data.settings || { situations: [], projects: [] };
    state.stickies = data.stickies || [];
  } catch (e) {
    state.tasks = [];
    state.settings = { situations: ['Aguardando Cliente', 'Aguardando Resposta', 'Em Análise', 'Bloqueado', 'Em Andamento', 'Sem Situação'], projects: [] };
    state.stickies = [];
  }
  if (!state.settings.projects) state.settings.projects = [];
  if (state.settings.projects.length === 0) state.settings.projects = JSON.parse(JSON.stringify(DEFAULT_PROJECTS));

  setupNav();
  setupTitlebar();
  setupModal();
  setupStickies();
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
      const isCompleted = task.completed === true;
      titleEl.textContent = isCompleted ? 'Tarefa Concluída' : 'Editar Tarefa';
      titleInput.value = task.title;
      descInput.value = task.description || '';
      statusInput.value = isCompleted ? 'todo' : (task.status || '');
      situationSelect.value = task.situation || '';
      projectSelect.value = task.project || '';
      prioritySelect.value = task.priority || 'medium';
      renderChecklistEditor(task.checklist || []);

      // Toggle completed mode
      document.getElementById('modal-task').dataset.completedMode = isCompleted ? '1' : '';
      document.getElementById('btn-save').textContent = isCompleted ? '↩ Restaurar' : 'Salvar';
      // Lock title/desc/checklist if completed (optional: keep editable)
      titleInput.disabled = isCompleted;
      descInput.disabled = isCompleted;
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
    document.getElementById('modal-task').dataset.completedMode = '';
    document.getElementById('btn-save').textContent = 'Salvar';
    titleInput.disabled = false;
    descInput.disabled = false;
  }

  overlay.classList.remove('hidden');
  titleInput.focus();
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('modal-task').dataset.completedMode = '';
  document.getElementById('btn-save').textContent = 'Salvar';
  document.getElementById('task-title').disabled = false;
  document.getElementById('task-desc').disabled = false;
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
  const isCompletedMode = document.getElementById('modal-task').dataset.completedMode === '1';

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
    completed: isCompletedMode ? false : (existing?.completed || false),
    completedAt: isCompletedMode ? null : (existing?.completedAt || null),
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

  if (isCompletedMode) {
    showToast('↩ Tarefa restaurada para o board', 'success');
  } else {
    showToast(state.editingTaskId ? '✓ Tarefa atualizada' : '✓ Tarefa criada', 'success');
  }
}

// ─── RENDER ───────────────────────────────────
function renderAll() {
  renderBoard();
  renderBacklog();
  renderCompleted();
  renderSettings();
  renderStickyList();
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
  if (type === 'completed') {
    card.onclick = () => openModal(task.id);
    card.style.cursor = 'pointer';
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

// ─── STICKY NOTES ─────────────────────────────
const STICKY_COLORS = [
  { name: 'yellow', bg: '#FEF08A', header: '#FDE047', text: '#1c1917' },
  { name: 'blue',   bg: '#BAE6FD', header: '#7DD3FC', text: '#0c1a2e' },
  { name: 'green',  bg: '#BBF7D0', header: '#86EFAC', text: '#052e16' },
  { name: 'pink',   bg: '#FBCFE8', header: '#F9A8D4', text: '#3b0764' },
  { name: 'orange', bg: '#FED7AA', header: '#FDBA74', text: '#431407' },
  { name: 'purple', bg: '#E9D5FF', header: '#D8B4FE', text: '#2e1065' },
];

function getStickyColor(note) {
  // If linked to a task, use project color
  if (note.taskId) {
    const task = state.tasks.find(t => t.id === note.taskId);
    if (task && task.project) {
      const proj = state.settings.projects.find(p => p.name === task.project);
      if (proj) return hexToStickyTheme(proj.color);
    }
  }
  if (note.color === 'custom' && note.colorHex) return hexToStickyTheme(note.colorHex);
  return STICKY_COLORS.find(c => c.name === note.color) || STICKY_COLORS[0];
}

function hexToStickyTheme(hex) {
  // Gerar tons pastel previsíveis
  const bg = lightenColor(hex, 0.85);     // Fundo bem claro
  const header = lightenColor(hex, 0.65); // Cabeçalho um pouco mais forte

  const bgLuminance = getRelativeLuminance(bg);
  const darkTextLuminance = getRelativeLuminance('#1a1a2e');
  const lightTextLuminance = getRelativeLuminance('#ffffff');

  // Escolher a melhor cor de texto baseada na razão de contraste
  const contrastWithDark = getContrastRatio(bgLuminance, darkTextLuminance);
  const contrastWithLight = getContrastRatio(bgLuminance, lightTextLuminance);

  const text = contrastWithDark > contrastWithLight ? '#1a1a2e' : '#ffffff';

  return {
    bg,
    header,
    text,
    hex
  };
}

function getRelativeLuminance(hex) {
  const rgb = hex.replace('#', '').match(/.{2}/g).map(c => {
    let channel = parseInt(c, 16) / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : Math.pow((channel + 0.055) / 1.055, 2.4);
  });

  // Fórmula oficial WCAG
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function getContrastRatio(l1, l2) {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function lightenColor(hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16);
  let r = (num >> 16) + Math.round((255 - (num >> 16)) * percent);
  let g = ((num >> 8) & 0x00FF) + Math.round((255 - ((num >> 8) & 0x00FF)) * percent);
  let b = (num & 0x0000FF) + Math.round((255 - (num & 0x0000FF)) * percent);

  r = Math.min(255, r);
  g = Math.min(255, g);
  b = Math.min(255, b);

  return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
}

function setupStickies() {
  document.getElementById('btn-new-sticky').addEventListener('click', createNewSticky);
  // Restore open stickies
  state.stickies.forEach(note => {
    if (note.isOpen) mountStickyWindow(note);
  });
  renderStickyList();
}

function createNewSticky() {
  const id = `sticky_${Date.now()}`;
  const note = {
    id,
    content: '',
    color: STICKY_COLORS[state.stickies.length % STICKY_COLORS.length].name,
    x: 80 + (state.stickies.length % 6) * 30,
    y: 80 + (state.stickies.length % 4) * 30,
    isOpen: true,
    taskId: null,
    createdAt: new Date().toISOString()
  };
  state.stickies.push(note);
  window.api.saveSticky(note);
  mountStickyWindow(note);
  renderStickyList();
}

function renderStickyMarkdown(content, previewEl) {
  if (!previewEl || !markedLib || !DOMPurifyLib) {
    previewEl.innerHTML = '<em>Preview indisponível.</em>';
    return;
  }

  markedLib.setOptions({
    gfm: true,
    breaks: true
  });

  const rawHtml = markedLib.parse(content || '');
  const cleanHtml = DOMPurifyLib.sanitize(rawHtml);
  previewEl.innerHTML = cleanHtml;
}

function mountStickyWindow(note) {
  const layer = document.getElementById('sticky-layer');
  const existing = document.getElementById(`sticky-win-${note.id}`);
  if (existing) {
    existing.style.display = 'flex';
    bringToFront(note.id);
    return;
  }

  const color = getStickyColor(note);
  const win = document.createElement('div');
  win.className = 'sticky-win';
  win.id = `sticky-win-${note.id}`;
  win.style.cssText = `
    left:${note.x}px;
    top:${note.y}px;
    background:${color.bg};
    z-index:${++state.stickyZTop};
  `;

  // Task badge — always clickable to link/unlink task
  const task = note.taskId
    ? state.tasks.find(t => t.id === note.taskId)
    : null;

  const taskBadge = task
    ? `<button class="sticky-link-btn sticky-link-btn--linked" title="Alterar tarefa vinculada">⬡ ${escapeHtml(task.title)}</button>`
    : `<button class="sticky-link-btn" title="Vincular tarefa">⬡ vincular</button>`;

  const pickerInitialValue =
    note.colorHex ||
    (STICKY_COLORS.find(c => c.name === note.color)?.bg.slice(0, 7)) ||
    '#FEF08A';

  win.innerHTML = `
    <div class="sticky-header" style="background:${color.header}">
      <div class="sticky-drag-handle">
        ${taskBadge}
      </div>
      <div class="sticky-header-actions">
        <input
          type="color"
          class="sticky-color-picker"
          value="${pickerInitialValue}"
          title="Cor"
          ${note.taskId ? 'disabled' : ''}
        />
        <button class="sticky-close" title="Fechar">✕</button>
      </div>
    </div>

    <textarea
      class="sticky-body"
      placeholder="Escreva aqui..."
      spellcheck="false"
      style="color:${color.text}"
    >${escapeHtml(note.content)}</textarea>

    <div class="sticky-preview" style="color:${color.text}"></div>
  `;

  layer.appendChild(win);

  const textarea = win.querySelector('.sticky-body');
  const preview = win.querySelector('.sticky-preview');

  // Render markdown for existing content on mount
  renderStickyMarkdown(note.content, preview);

  // Bring to front without interfering with focus
  win.addEventListener('mousedown', () => {
    bringToFront(note.id);
  });

  // Close (hide only — keeps state and current page)
  win.querySelector('.sticky-close').addEventListener('click', (e) => {
    e.stopPropagation();
    note.isOpen = false;
    win.style.display = 'none';
    window.api.saveSticky(note);
    renderStickyList();
  });

  // Task linking (always available)
  const linkBtn = win.querySelector('.sticky-link-btn');
  if (linkBtn) {
    linkBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showTaskLinkMenu(win, note);
    });
  }

  // Color picker (disabled when linked to a task)
  const picker = win.querySelector('.sticky-color-picker');
  if (!note.taskId) {
    picker.addEventListener('input', (e) => {
      const hex = e.target.value;
      const theme = hexToStickyTheme(hex);

      win.style.background = theme.bg;
      win.querySelector('.sticky-header').style.background = theme.header;
      textarea.style.color = theme.text;
      preview.style.color = theme.text;

      note.color = 'custom';
      note.colorHex = hex;
      window.api.saveSticky(note);
    });
  }

  // Content auto-save + markdown render
  let saveTimer = null;
  textarea.addEventListener('input', () => {
    let value = textarea.value;

    // Markdown checkbox shortcuts
    value = value.replace(/^\[\s?\]/gm, '☐');
    value = value.replace(/^\[(x|X)\]/gm, '☑');

    if (value !== textarea.value) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      textarea.value = value;
      textarea.setSelectionRange(start, end);
    }

    note.content = textarea.value;

    // Update preview
    renderStickyMarkdown(note.content, preview);

    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      window.api.saveSticky(note);
      renderStickyList();
    }, 800);
  });

  // Enable dragging
  makeDraggable(win, win.querySelector('.sticky-drag-handle'), note);

  // Enable resizing (if not already handled via CSS)
  win.style.resize = 'both';
  win.style.overflow = 'hidden';

  // Task link button — works for both "vincular" and changing existing link
  win.querySelector('.sticky-link-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    showTaskLinkMenu(win, note);
  });

}
function bringToFront(noteId) {
  const win = document.getElementById(`sticky-win-${noteId}`);
  if (win) win.style.zIndex = ++state.stickyZTop;
}

function makeDraggable(win, handle, note) {
  let startX, startY, startLeft, startTop, dragging = false;

  function onMouseMove(e) {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    win.style.left = Math.max(0, startLeft + dx) + 'px';
    win.style.top  = Math.max(44, startTop  + dy) + 'px';
    note.x = parseInt(win.style.left);
    note.y = parseInt(win.style.top);
  }

  function onMouseUp() {
    if (!dragging) return;
    dragging = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    window.api.saveSticky(note);
  }

  handle.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('sticky-close') ||
        e.target.classList.contains('sticky-color-picker') ||
        e.target.classList.contains('sticky-link-btn')) return;
    // Only start drag from the handle background itself, not interactive children
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
    dragging = true;
    startX    = e.clientX;
    startY    = e.clientY;
    startLeft = parseInt(win.style.left) || 0;
    startTop  = parseInt(win.style.top)  || 0;
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}

function renderStickyList() {
  const list = document.getElementById('sticky-list');
  if (!list) return;
  list.innerHTML = '';

  if (state.stickies.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-state-icon">✎</div><div class="empty-state-text">Nenhuma nota ainda</div><div class="empty-state-sub">Clique em "Nova Nota" para começar</div></div>`;
    return;
  }

  [...state.stickies].reverse().forEach(note => {
    const color = getStickyColor(note);
    const task = note.taskId ? state.tasks.find(t => t.id === note.taskId) : null;
    const preview = note.content.replace(/[#*`\[\]]/g, '').slice(0, 80) || 'Nota vazia';

    const card = document.createElement('div');
    card.className = 'sticky-list-card';
    card.style.cssText = `background:${color.bg};border-left:3px solid ${color.header}`;
    card.innerHTML = `
      <div class="sticky-list-body">
        ${task ? `<span class="sticky-task-badge small">⬡ ${escapeHtml(task.title)}</span>` : ''}
        <div class="sticky-list-preview" style="color:${color.text}">${escapeHtml(preview)}${note.content.length > 80 ? '…' : ''}</div>
        <div class="sticky-list-date">${formatDate(note.createdAt)}</div>
      </div>
      <div class="sticky-list-actions">
        <button class="sticky-list-btn open-btn" title="${note.isOpen ? 'Já aberta' : 'Abrir'}">${note.isOpen ? '◉' : '◎'}</button>
        <button class="sticky-list-btn del-btn" title="Deletar">✕</button>
      </div>
    `;

    card.querySelector('.open-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      note.isOpen = true;
      window.api.saveSticky(note);
      mountStickyWindow(note);
      renderStickyList();
    });

    card.querySelector('.del-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Deletar esta nota permanentemente?')) return;
      const win = document.getElementById(`sticky-win-${note.id}`);
      if (win) win.remove();
      state.stickies = state.stickies.filter(n => n.id !== note.id);
      await window.api.deleteSticky(note.id);
      renderStickyList();
    });

    list.appendChild(card);
  });
}

function showTaskLinkMenu(win, note) {
  // Remove existing popup if any
  win.querySelector('.sticky-link-popup')?.remove();

  const popup = document.createElement('div');
  popup.className = 'sticky-link-popup';

  const activeTasks = state.tasks.filter(t => !t.completed);
  popup.innerHTML = `
    <div class="sticky-link-popup-header">Vincular a uma tarefa</div>
    <select class="sticky-link-select">
      <option value="">— Nenhuma —</option>
      ${activeTasks.map(t => `<option value="${t.id}" ${note.taskId === t.id ? 'selected' : ''}>${escapeHtml(t.title)}</option>`).join('')}
    </select>
    <div class="sticky-link-popup-actions">
      <button class="sticky-link-confirm">OK</button>
      <button class="sticky-link-cancel">Cancelar</button>
    </div>
  `;
  win.appendChild(popup);

  popup.querySelector('.sticky-link-confirm').addEventListener('click', () => {
    const sel = popup.querySelector('.sticky-link-select').value;
    note.taskId = sel || null;
    window.api.saveSticky(note);
    popup.remove();
    document.removeEventListener('click', outsideHandler);
    const old = document.getElementById(`sticky-win-${note.id}`);
    if (old) old.remove();
    mountStickyWindow(note);
    renderStickyList();
  });
  popup.querySelector('.sticky-link-cancel').addEventListener('click', () => {
    popup.remove();
    document.removeEventListener('click', outsideHandler);
  });

  function outsideHandler(e) {
    if (!popup.contains(e.target)) {
      popup.remove();
      document.removeEventListener('click', outsideHandler);
    }
  }
  // Defer so the current click that opened the popup doesn't immediately close it
  setTimeout(() => document.addEventListener('click', outsideHandler), 0);
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
window.addEventListener('DOMContentLoaded', init);