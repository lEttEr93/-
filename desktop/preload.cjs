'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('Desktop', {
  load:()=>ipcRenderer.sendSync('data:load'),
  save:json=>ipcRenderer.sendSync('data:save',json),
  copy:text=>ipcRenderer.send('copy',String(text)),
  share:text=>ipcRenderer.invoke('backup:export',String(text)),
  request:args=>ipcRenderer.invoke('http',args),
  stream:args=>ipcRenderer.send('http:stream',args),
  action:(name,value)=>ipcRenderer.invoke('action',name,value),
  on:(name,callback)=>{
    if (!['state','stream','bluetooth','navigate'].includes(name)) return;
    const listener=(_event,value)=>callback(value);
    ipcRenderer.on(name,listener);
    return ()=>ipcRenderer.removeListener(name,listener);
  }
});
