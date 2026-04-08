const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getData: () => ipcRenderer.invoke('get-data'),
  saveTask: (task) => ipcRenderer.invoke('save-task', task),
  deleteTask: (id) => ipcRenderer.invoke('delete-task', id),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  saveNotes: (notes) => ipcRenderer.invoke('save-notes', notes),
  saveSticky: (note) => ipcRenderer.invoke('save-sticky', note),
  deleteSticky: (id) => ipcRenderer.invoke('delete-sticky', id),
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),
});
