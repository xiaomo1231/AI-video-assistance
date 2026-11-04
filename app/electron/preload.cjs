// 安全桥：界面只能通过这些通道和主进程说话
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('mojian', {
  invoke: async (ch, ...args) => { const r = await ipcRenderer.invoke(ch, ...args); if (!r.ok) throw new Error(r.error); return r.data; },
  on: (ch, fn) => { const l = (_e, d) => fn(d); ipcRenderer.on(ch, l); return () => ipcRenderer.removeListener(ch, l); },
  reply: (msg) => ipcRenderer.send('rpc:reply', msg),
  pathOf: (file) => { try { return webUtils.getPathForFile(file); } catch { return file.path || ''; } },
});
