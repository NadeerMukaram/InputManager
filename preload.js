const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mouseAPI', {
    // State
    getState:    ()              => ipcRenderer.invoke('get-state'),

    // Per-feature toggle: key = 'move' | 'm1' | 'm2' | 'keys'
    setFeature:  (key, value)   => ipcRenderer.invoke('set-feature', { key, value }),

    // Master controls
    blockAll:    ()              => ipcRenderer.invoke('block-all'),
    unblockAll:  ()              => ipcRenderer.invoke('unblock-all'),

    // Live state push from main process
    onStateUpdate: (cb) => ipcRenderer.on('state-update', (_, data) => cb(data)),

    // Window controls
    minimizeWindow: () => ipcRenderer.send('minimize-window'),
    closeWindow:    () => ipcRenderer.send('close-window'),
});
