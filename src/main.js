const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const DATA_PATH = path.join(app.getPath('userData'), 'kanban-data.json');

const DEFAULT_DATA = {
  tasks: [],
  settings: {
    situations: [
      "Aguardando Cliente",
      "Aguardando Resposta",
      "Em Análise",
      "Bloqueado",
      "Em Andamento",
      "Sem Situação"
    ]
  }
};

function loadData() {
  try {
    if (fs.existsSync(DATA_PATH)) {
      const raw = fs.readFileSync(DATA_PATH, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Error loading data:', e);
  }
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('Error saving data:', e);
    return false;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    backgroundColor: '#0f0f13'
  });

  win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// IPC Handlers
ipcMain.handle('get-data', () => loadData());

ipcMain.handle('save-task', (event, task) => {
  const data = loadData();
  const idx = data.tasks.findIndex(t => t.id === task.id);
  if (idx >= 0) {
    data.tasks[idx] = task;
  } else {
    data.tasks.push(task);
  }
  return saveData(data);
});

ipcMain.handle('delete-task', (event, taskId) => {
  const data = loadData();
  data.tasks = data.tasks.filter(t => t.id !== taskId);
  return saveData(data);
});

ipcMain.handle('save-settings', (event, settings) => {
  const data = loadData();
  data.settings = settings;
  return saveData(data);
});

ipcMain.handle('save-notes', (event, notes) => {
  const data = loadData();
  data.notes = notes;
  return saveData(data);
});

ipcMain.handle('save-sticky', (event, note) => {
  const data = loadData();
  if (!data.stickies) data.stickies = [];
  const idx = data.stickies.findIndex(n => n.id === note.id);
  if (idx >= 0) data.stickies[idx] = note;
  else data.stickies.push(note);
  return saveData(data);
});

ipcMain.handle('delete-sticky', (event, noteId) => {
  const data = loadData();
  data.stickies = (data.stickies || []).filter(n => n.id !== noteId);
  return saveData(data);
});

ipcMain.handle('window-minimize', () => {
  BrowserWindow.getFocusedWindow()?.minimize();
});

ipcMain.handle('window-maximize', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win?.isMaximized()) win.unmaximize();
  else win?.maximize();
});

ipcMain.handle('window-close', () => {
  BrowserWindow.getFocusedWindow()?.close();
});
