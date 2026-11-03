// Landed desktop bridge. Runs sandboxed with context isolation: the page only ever sees this small,
// fixed API on window.landedDesktop, never ipcRenderer or Node. Each function maps to one fixed IPC
// channel handled in main.js.
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('landedDesktop', Object.freeze({
  isDesktop: true,
  platform: process.platform,
  quit: () => ipcRenderer.send('landed:quit'),
  toggleFullscreen: () => ipcRenderer.send('landed:toggle-fullscreen'),
}));
