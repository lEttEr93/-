'use strict';
const {app,BrowserWindow,ipcMain,clipboard,dialog,Tray,Menu,nativeImage,screen,Notification,shell} = require('electron');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const readline=require('node:readline');
const Data=require('../shared/data.js');
const root=path.resolve(__dirname,'..');
const portable=app.isPackaged ? path.dirname(process.execPath) : path.join(process.env.AI_ROOT||'D:\\AI','runs','campus-life');
const dataDir=process.env.CAMPUS_DATA_DIR||path.join(portable,'data');
const cacheDir=path.join(process.env.AI_CACHES||path.join(portable,'cache'),'campus-life');
fs.mkdirSync(dataDir,{recursive:true});fs.mkdirSync(cacheDir,{recursive:true});
app.setPath('userData',dataDir);app.setPath('sessionData',cacheDir);
app.setAppUserModelId('CampusLife.Desktop');
const ledger=path.join(dataDir,'ledger.json'),settingsFile=path.join(dataDir,'desktop.json');
let settings={widget:true,pinned:false,interval:12,...readJSON(settingsFile,{})};
let main,widget,tray,quitting=false,bt=null,connected=false,btDevice='',pending=null,connecting=false,lastSync='';
let cached='',storageError='';
try { if(fs.existsSync(ledger)){cached=fs.readFileSync(ledger,'utf8');JSON.parse(cached);} }
catch(e){storageError='ledger.json 读取失败，请从 data/backups 恢复备份。'+e.message;}
function readJSON(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;}}
function saveSettings(){fs.writeFileSync(settingsFile,JSON.stringify(settings,null,2));}
function backup(){
  if(!cached)return;
  const dir=path.join(dataDir,'backups');fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(3).toString('hex')+'.json'),cached);
  const files=fs.readdirSync(dir).sort();for(const f of files.slice(0,Math.max(0,files.length-30)))fs.unlinkSync(path.join(dir,f));
}
function writeState(raw,sender){
  if(storageError)throw Error(storageError);
  if(typeof raw!=='string'||Buffer.byteLength(raw)>16*1024*1024)throw Error('数据大小不正确');
  const state=JSON.parse(raw);if(!state||!Array.isArray(state.expenses)||!Array.isArray(state.schedule))throw Error('无效的应用数据');
  if(raw===cached)return true;
  // Keep an immediately previous copy for ordinary edits; explicit sync also keeps a dated backup.
  if(cached)fs.writeFileSync(ledger+'.previous',cached);
  fs.writeFileSync(ledger+'.tmp',raw);fs.renameSync(ledger+'.tmp',ledger);cached=raw;
  for(const win of [main,widget])if(win&&!win.isDestroyed()&&win.webContents.id!==sender)win.webContents.send('state',raw);
  return true;
}
function sendBT(value){if(!bt||!connected)throw Error('请先连接手机');bt.stdin.write(JSON.stringify(value)+'\n');}
function status(extra={}){const value={connected,connecting,device:btDevice,lastSync,pending:!!pending,...extra};if(main&&!main.isDestroyed())main.webContents.send('bluetooth',value);return value;}
function finishPending(error){if(pending?.timer)clearTimeout(pending.timer);pending=null;status(error?{error}:{});}
function helperPath(){return path.join(root,'build','bluetooth','CampusBluetooth.exe');}
function devices(){return new Promise((resolve,reject)=>{
  const p=spawn(helperPath(),['list'],{windowsHide:true});let out='',err='';
  const timer=setTimeout(()=>{p.kill();reject(Error('蓝牙设备查询超时'));},15000);
  p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',e=>{clearTimeout(timer);reject(e);});
  p.on('close',code=>{clearTimeout(timer);try{if(code)throw Error(err||out||'无法查询蓝牙设备');resolve(JSON.parse(out));}catch(e){reject(e);}});
});}
function connect(address){
  if(!/^[0-9A-Fa-f]{12}$/.test(address))throw Error('设备地址不正确');
  disconnect();connecting=true;btDevice=address;status();
  const child=spawn(helperPath(),['connect',address],{windowsHide:true});bt=child;
  let childError='';
  const timeout=setTimeout(()=>{if(bt===child&&!connected){childError='连接超时：请在手机打开蓝牙同步，并保持应用打开。';child.kill();status({error:childError});}},18000);
  readline.createInterface({input:child.stdout}).on('line',line=>{
    if(bt!==child)return;
    try{
      const msg=JSON.parse(line);
      if(msg.type==='$connected'){clearTimeout(timeout);connected=true;connecting=false;settings.device=address;saveSettings();status();return;}
      if(msg.type==='$error'){childError=msg.error;status({error:msg.error});return;}
      onFrame(msg).catch(e=>finishPending(e.message));
    }catch(e){finishPending(e.message);}
  });
  child.on('error',e=>{clearTimeout(timeout);if(bt===child){bt=null;connected=false;connecting=false;finishPending('蓝牙模块启动失败：'+e.message);}});
  child.on('exit',()=>{clearTimeout(timeout);if(bt===child){bt=null;connected=false;connecting=false;finishPending(childError||'蓝牙已断开，可点击重新连接。');}});
}
function disconnect(){const p=bt;bt=null;if(p)p.kill();connected=false;connecting=false;finishPending();}
function currentRevision(){return crypto.createHash('sha256').update(cached).digest('hex');}
async function ensureIdle(){
  if(await main.webContents.executeJavaScript('Boolean(CHAT.streaming || AISTREAM || pendingToolConfirm)'))throw Error('电脑 AI 正在运行，请完成后再同步');
}
async function onFrame(msg){
  if(msg.protocol!==1||!pending||msg.id!==pending.id)return;
  if(msg.type==='error'){finishPending(msg.error||'手机取消了同步');return;}
  if(msg.type==='ack'&&pending.mode==='push'){lastSync=new Date().toLocaleString('zh-CN');finishPending();status({message:'手机已确认并保存电脑数据'});return;}
  if(msg.type!=='snapshot'||pending.mode!=='pull')return;
  Data.validate(msg.data);const rev=pending.revision;clearTimeout(pending.timer);pending.timer=null;
  const n=Data.summary(msg.data);
  const answer=await dialog.showMessageBox(main,{type:'question',buttons:['取消','接收并替换电脑数据'],defaultId:0,cancelId:0,title:'从手机接收',message:`手机：${n.expenses} 笔账目、${n.courses} 门课程、${n.schedule} 项日程、${n.paths} 个小径项目`,detail:'电脑上的对应数据将由手机完整替换。现有电脑数据会自动备份，外观、通知设置与 API Key 保留。'});
  if(!pending||pending.id!==msg.id)return;
  if(answer.response!==1){finishPending();return;}
  await ensureIdle();
  // Ask the renderer to flush its 250 ms debounce before accepting a remote replacement.
  main.webContents.send('navigate',{name:'flush'});
  await new Promise(resolve=>setTimeout(resolve,100));
  if(rev!==currentRevision()){finishPending('同步期间电脑数据已变化，请重新接收。');return;}
  backup();const next=Data.apply(JSON.parse(cached),msg.data);
  writeState(JSON.stringify(next));lastSync=new Date().toLocaleString('zh-CN');finishPending();status({message:'已接收手机数据，原电脑数据已备份'});
}
async function sync(mode){
  if(pending)throw Error('请先完成当前同步');
  if(!connected)throw Error('请先连接手机');
  await ensureIdle();
  main.webContents.send('navigate',{name:'flush'});await new Promise(resolve=>setTimeout(resolve,100));
  const id=crypto.randomUUID(),revision=currentRevision();
  let data;
  if(mode==='push'){
    const local=JSON.parse(cached);data=Data.snapshot(local,local.kb||builtInKB());
    const n=Data.summary(data);
    const result=await dialog.showMessageBox(main,{type:'question',buttons:['取消','发送到手机'],defaultId:0,cancelId:0,title:'发送到手机',message:`发送 ${n.expenses} 笔账目、${n.courses} 门课程、${n.schedule} 项日程`,detail:'手机也会显示确认。手机的对应数据将被替换，手机端会先备份。API Key 不传输。'});
    if(result.response!==1)return;
    if(revision!==currentRevision())throw Error('电脑数据已变化，请重试');
  }
  pending={id,mode,revision,timer:setTimeout(()=>finishPending('等待手机确认超时，请重试'),120000)};
  sendBT({protocol:1,type:mode,id,...(data?{data}:{})});status({message:'请在手机上确认本次同步'});
}
function builtInKB(){const html=fs.readFileSync(path.join(root,'android/assets/index.html'),'utf8');const match=html.match(/var KB_BUILTIN\s*=\s*([\s\S]*?);\s*var KB\s*=/);return JSON.parse(match[1]);}
const notified=new Set();
function remind(){
  if(!cached||!Notification.isSupported())return;
  try{
    const state=JSON.parse(cached);if(!state.notify?.enabled)return;
    const today=Data.dateString(),now=Date.now();
    for(const item of Data.agenda(state,state.kb||builtInKB(),today).items){
      if(item.done||!item.start)continue;
      const at=new Date(today+'T'+item.start+':00').getTime(),key=today+':'+item.kind+':'+item.id+':'+item.start;
      if(at-now>5*60000||at-now<0||notified.has(key))continue;
      notified.add(key);
      const notice=new Notification({title:'即将开始 · '+item.title,body:item.start+(item.end?'–'+item.end:'')+(item.loc?' · '+item.loc:''),silent:false});
      notice.on('click',()=>showMain(item.kind==='course'?'kb':'schedule'));notice.show();
    }
    if(notified.size>1000)notified.clear();
  }catch(e){console.error('Reminder:',e.message);}
}
function windowOptions(){return {webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false},backgroundColor:'#f4f7f6'};}
function protect(win){win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',(e,url)=>{if(!url.startsWith('file://'))e.preventDefault();});}
function showMain(tab){main.show();main.focus();if(tab)main.webContents.send('navigate',{name:'tab',tab});}
function createWidget(){
  if(widget&&!widget.isDestroyed()){widget.show();return;}
  const area=screen.getPrimaryDisplay().workArea;
  let bounds={x:area.x+area.width-398,y:area.y+46,width:370,height:490,...settings.bounds};
  const displays=screen.getAllDisplays();if(!displays.some(d=>bounds.x+60>d.workArea.x&&bounds.x<d.workArea.x+d.workArea.width&&bounds.y+40>d.workArea.y&&bounds.y<d.workArea.y+d.workArea.height))bounds={x:area.x+area.width-398,y:area.y+46,width:370,height:490};
  widget=new BrowserWindow({...windowOptions(),...bounds,minWidth:320,minHeight:340,maxWidth:650,frame:false,skipTaskbar:true,alwaysOnTop:settings.pinned,show:false,roundedCorners:true,title:'大学食草路 · 桌面小组件'});
  protect(widget);widget.loadFile(path.join(root,'build/web/widget.html'));
  widget.once('ready-to-show',()=>widget.showInactive());
  const remember=()=>{settings.bounds=widget.getBounds();saveSettings();};widget.on('moved',remember);widget.on('resized',remember);
  widget.on('close',()=>{settings.widget=false;saveSettings();});
}
if(!app.requestSingleInstanceLock())app.quit();else{
  app.on('second-instance',()=>main&&showMain());
  app.whenReady().then(async()=>{
    main=new BrowserWindow({...windowOptions(),width:1280,height:850,minWidth:860,minHeight:620,show:false,title:'大学食草路',autoHideMenuBar:true,icon:path.join(root,'android/res/mipmap-xxxhdpi/ic_launcher.png')});
    protect(main);main.loadFile(path.join(root,'build/web/index.html'));
    main.once('ready-to-show',()=>{if(!process.argv.includes('--widget-only'))main.show();});
    main.on('close',e=>{if(!quitting){e.preventDefault();main.hide();}});
    const image=nativeImage.createFromPath(path.join(root,'android/res/mipmap-xxxhdpi/ic_launcher.png'));
    tray=new Tray(image.resize({width:20,height:20}));tray.setToolTip('大学食草路');
    tray.setContextMenu(Menu.buildFromTemplate([{label:'打开大学食草路',click:()=>showMain()},{label:'显示桌面小组件',click:()=>{settings.widget=true;saveSettings();createWidget();}},{type:'separator'},{label:'退出',click:()=>{quitting=true;app.quit();}}]));tray.on('double-click',()=>showMain());
    if(settings.widget)createWidget();
    setInterval(remind,30000);setTimeout(remind,2000);
    if(storageError)await dialog.showMessageBox(main,{type:'error',message:storageError});
  });
}
app.on('before-quit',()=>{quitting=true;disconnect();});
app.on('window-all-closed',()=>{});
ipcMain.on('data:load',e=>{e.returnValue=cached;});
ipcMain.on('data:save',(e,raw)=>{try{e.returnValue=writeState(raw,e.sender.id);}catch(err){e.returnValue=false;dialog.showErrorBox('保存失败',err.message);}});
ipcMain.on('copy',(_e,text)=>clipboard.writeText(String(text)));
ipcMain.handle('backup:export',async(_e,text)=>{const result=await dialog.showSaveDialog(main,{defaultPath:'campus-backup-'+Data.dateString()+'.json',filters:[{name:'JSON',extensions:['json']}]});if(!result.canceled){fs.writeFileSync(result.filePath,text);return true;}return false;});
function validRequest(args){const url=new URL(args.url);if(url.origin!=='https://api.deepseek.com'||!['/user/balance','/chat/completions'].includes(url.pathname))throw Error('不支持的 API 地址');return {method:args.body?'POST':'GET',headers:{Authorization:String(args.auth||''),'Content-Type':'application/json'},body:args.body||undefined,signal:AbortSignal.timeout(180000),redirect:'error'};}
ipcMain.handle('http',async(_e,args)=>{try{const r=await fetch(args.url,validRequest(args));return {status:r.status,body:await r.text()};}catch(e){return {status:-1,body:JSON.stringify({error:{message:e.message}})};}});
ipcMain.on('http:stream',async(e,args)=>{
  if(!/^[A-Za-z0-9_]+$/.test(args.cb))return;
  const send=line=>{if(!e.sender.isDestroyed())e.sender.send('stream',{cb:args.cb,line});};
  try{const r=await fetch(args.url,validRequest(args));if(!r.ok)throw Error('HTTP '+r.status+' '+(await r.text()).slice(0,300));let buffer='';const decoder=new TextDecoder();for await(const b of r.body){buffer+=decoder.decode(b,{stream:true});const lines=buffer.split('\n');buffer=lines.pop();for(const line of lines)send(line.replace(/\r$/,''));}buffer+=decoder.decode();if(buffer)send(buffer);send('\0END');}catch(err){send('\0ERR '+err.message);}
});
ipcMain.handle('action',async(e,name,value)=>{
  try{
    if(name==='show'){showMain(value);return true;}
    if(name==='minimize'){main.minimize();return true;}
    if(name==='hide'){main.hide();return true;}
    if(name==='widget'){settings.widget=true;saveSettings();createWidget();return true;}
    if(name==='widget-hide'){widget?.close();return true;}
    if(name==='pin'){settings.pinned=!settings.pinned;widget?.setAlwaysOnTop(settings.pinned);saveSettings();widget?.webContents.send('navigate',{name:'settings',settings});return settings;}
    if(name==='settings')return {...settings,dataDir,lastSync};
    if(name==='interval'){settings.interval=Math.max(5,Math.min(120,Number(value)||12));saveSettings();widget?.webContents.send('navigate',{name:'settings',settings});return settings;}
    if(name==='startup'){app.setLoginItemSettings({openAtLogin:!!value,args:['--widget-only']});return app.getLoginItemSettings().openAtLogin;}
    if(name==='startup-status')return app.getLoginItemSettings().openAtLogin;
    if(name==='new-schedule'||name==='new-expense'||name==='complete'){if(name!=='complete')showMain();main.webContents.send('navigate',{name,...(value||{})});return true;}
    if(name==='reminders'){remind();return true;}
    if(name==='notification-settings'){await shell.openExternal('ms-settings:notifications');return true;}
    if(name==='bt-list')return await devices();
    if(name==='bt-connect'){connect(value);return status();}
    if(name==='bt-disconnect'){disconnect();return status();}
    if(name==='bt-status')return status();
    if(name==='bt-pull'||name==='bt-push'){await sync(name==='bt-pull'?'pull':'push');return status();}
    if(name==='backup'){backup();return true;}
    throw Error('不支持的操作');
  }catch(err){return {error:err.message};}
});
