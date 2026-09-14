const { contextBridge, ipcRenderer } = require('electron');
const subscribe = (channel, callback) => {
  const listener = (_event, value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};
contextBridge.exposeInMainWorld('mori', {
  getState: () => ipcRenderer.invoke('get-state'),
  act: (action, payload) => ipcRenderer.invoke('act', action, payload),
  onState: callback => subscribe('state', callback),
  onNotice: callback => subscribe('notice', callback),
  onOutfitStatus: callback => subscribe('outfit-status', callback),
  reportOutfit: result => ipcRenderer.send('outfit-status', result),
  onHitRefresh: callback => subscribe('hit-refresh', callback),
  windowAction: action => ipcRenderer.invoke('window-action', action),
  chooseMusic: () => ipcRenderer.invoke('choose-music'),
  readMusic: () => ipcRenderer.invoke('read-music'),
  drag: phase => ipcRenderer.send('drag', phase),
  hitTest: hit => ipcRenderer.send('hit-test', hit),
});
