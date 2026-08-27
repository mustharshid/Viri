// Preload script for Viri Cashier Standalone Desktop App
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('viriAppInfo', {
  isStandaloneApp: true,
  platform: process.platform,
  version: '1.4.0',
  checkUpdate: () => ipcRenderer.invoke('check-for-updates'),
  reloadApp: () => ipcRenderer.send('reload-app'),
  toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen')
});
