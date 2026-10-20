'use strict';
(function(){
  const native=window.Desktop;
  // Desktop notifications and clipboard input replace the phone-only OS entry points.
  notifCard=function(){return '<div class="card"><div class="flexrow"><div class="label" style="margin:0">课程与日程提醒</div><div class="switch '+(S.notify.enabled?'on':'')+'" data-act="toggleNotif"><i></i></div></div><p class="muted" style="font-size:12px;line-height:1.8">应用在托盘运行时，课程与有开始时间的未完成日程会提前 5 分钟提醒。全天安排可在小组件查看；电脑休眠或退出应用期间不提醒。请在 Windows 设置中允许通知。</p><button class="btn" data-act="openNotifSettings">Windows 通知设置</button></div>';};
  ingestCard=function(){return '<div class="card"><div class="label">从消息记账</div><p class="muted" style="font-size:12px;line-height:1.8">将支付消息粘贴给 AI，核对后入账。手机仍可采集短信／通知，入账后通过蓝牙同步。</p><button class="btn" data-act="openIngest">粘贴支付消息</button></div>';};
  const call=async(name,value)=>native?native.action(name,value):{};
  let desktopTab=tab,btInfo={connected:false},btDevices=[],busy=false;
  const tabs=[['kb','课表','uni','1'],['schedule','日程','uni','2'],['paths','小径','uni','3'],['bill','账单','food','4'],['monthly','月结','food','5'],['stats','统计','food','6'],['ai','AI 助手','','7'],['me','我的','','8']];
  const icons={sync:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 18 17"/>',widget:'<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M3 9h18M12 9v12"/>',paths:'<path d="M6 21V8a4 4 0 0 1 8 0v8a3 3 0 0 0 6 0V3M3 18l3 3 3-3"/>',schedule:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18m-12 5h6"/>'};
  const icon=key=>icons[key]?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'+icons[key]+'</svg>':svgIcon(key);
  const rail=document.createElement('aside');rail.id='desktopRail';
  rail.innerHTML='<div class="desk-brand"><div class="desk-mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 20C5 10 10 4 21 3c-1 10-6 16-13 15M5 20l10-10"/></svg></div><div><strong>大学食草路</strong><small>CAMPUS LIFE</small></div></div><div class="desk-group">大学生活</div>'+tabs.slice(0,3).map(nav).join('')+'<div class="desk-group">日常开销</div>'+tabs.slice(3,6).map(nav).join('')+'<div class="desk-bottom">'+tabs.slice(6).map(nav).join('')+'<button class="desk-nav" data-desktop-nav="sync">'+icon('sync')+'<span>设备与小组件</span></button><button class="desk-nav" data-desktop-action="widget">'+icon('widget')+'<span>显示桌面小组件</span></button><div class="desk-foot"><i></i> 本地保存 · 从容安排每一天<br>Ctrl + N 新建 · Ctrl + 1–8 切换</div></div>';
  document.body.prepend(rail);
  function nav(t){return '<button class="desk-nav" data-desktop-nav="'+t[0]+'">'+icon(t[0])+'<span>'+t[1]+'</span><span class="shortcut">'+t[3]+'</span></button>';}
  function refreshRail(){document.querySelectorAll('[data-desktop-nav]').forEach(e=>{const active=e.dataset.desktopNav===desktopTab;e.classList.toggle('active',active);e.setAttribute('aria-current',active?'page':'false');});}
  const originalRender=render;
  render=function(){if(desktopTab==='sync'){renderSync();return;}originalRender();desktopTab=tab;document.getElementById('view').dataset.desktopTab=tab;if(tab==='schedule')renderDesktopSchedule();refreshRail();};
  const originalSlide=slideNav;
  slideNav=function(dir){desktopTab=tab;originalSlide(dir);refreshRail();};
  function navigate(key){
    if(key==='sync'){desktopTab='sync';renderSync();return;}
    const def=tabs.find(t=>t[0]===key);if(!def)return;
    if(saveTimer){clearTimeout(saveTimer);saveTimer=null;persistNow();}
    closeSheet();desktopTab=key;tab=key;if(def[2])road=def[2];
    if(key==='kb')kbWeek=0;
    if(key==='schedule'){schDay=todayStr();schMonth=curMonth();}
    render();
    const view=document.getElementById('view');if(!matchMedia('(prefers-reduced-motion: reduce)').matches)view.animate([{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],{duration:200,easing:'cubic-bezier(.2,.8,.2,1)'});
  }
  function renderDesktopSchedule(){
    const month=schMonth||curMonth(),selected=schDay||todayStr();
    const first=new Date(month+'-01T00:00:00'),offset=(first.getDay()+6)%7,days=daysInMonth(month);
    let cells='<div></div>'.repeat(offset);
    for(let i=1;i<=days;i++){const date=month+'-'+pad(i),count=schOn(date).length;cells+='<button class="cal-cell '+(date===selected?'selected ':'')+(date===todayStr()?'today':'')+'" data-desktop-day="'+date+'" aria-label="'+date+(count?'，'+count+' 项日程':'')+'">'+i+(count?'<i class="cal-dot"></i>':'')+'</button>';}
    const items=schOn(selected).sort((a,b)=>(a.start||'99').localeCompare(b.start||'99'));
    document.getElementById('view').innerHTML='<div class="desk-schedule"><section class="card desk-calendar"><h3>'+monthLabel(month)+'</h3><div class="cal-head">'+Array.from('一二三四五六日').map(d=>'<span>'+d+'</span>').join('')+'</div><div class="cal-grid">'+cells+'</div><p class="muted" style="font-size:11px;margin-top:20px">圆点表示当天有日程，点击日期查看。</p></section><section><div class="desk-agenda-label"><div><h2>'+dayTitle(selected)+'</h2><p>'+items.length+' 项安排 · '+items.filter(s=>!s.done).length+' 项待完成</p></div><button class="desk-action" data-act="addSchedule">新建日程</button></div>'+(items.length?'<div class="card">'+items.map(renderSchRow).join('')+'</div>':'<div class="card desk-empty">给这一天留一点期待<br>添加学习计划、考试或生活安排</div>')+'</section></div>';
  }
  async function renderSync(){
    document.getElementById('view').dataset.desktopTab='sync';document.documentElement.setAttribute('data-scroll','up');refreshRail();
    document.getElementById('topbar').innerHTML='<div class="tb-head"><div><h1>设备与小组件</h1><div class="sub">让手机里的生活安排，来到桌面上。</div></div></div>';
    document.getElementById('view').innerHTML='<div class="desk-sync-grid"><section class="card"><div class="desk-tools"><h2>蓝牙同步</h2><button class="desk-action secondary" data-desktop-action="scan">刷新设备</button></div><p>手机安装配套安卓版，在「我的 → 电脑蓝牙同步」开启接收，保持手机应用打开。选择已配对的手机后连接。</p><select id="btDevices" class="desk-device" aria-label="选择已配对的手机"><option value="">请选择手机</option>'+btDevices.map(d=>'<option value="'+esc(d.address)+'" '+(btInfo.device===d.address?'selected':'')+'>'+esc(d.name)+'</option>').join('')+'</select><div class="btnrow"><button class="desk-action" data-desktop-action="connect">连接手机</button><button class="desk-action secondary" data-desktop-action="disconnect">断开</button></div><div id="btStatus" class="desk-status" role="status"></div><div class="btnrow"><button class="desk-action" data-desktop-action="pull" '+(!btInfo.connected?'disabled':'')+'>手机 → 电脑</button><button class="desk-action secondary" data-desktop-action="push" '+(!btInfo.connected?'disabled':'')+'>电脑 → 手机</button></div><p>同步账目、固定账单、课表、日程、小径和 AI 历史／自定义工具。采用整份替换，接收前确认并备份；两端外观、通知设置与 API Key 各自保留。</p><p>同时修改过两端时，请先分别导出备份，再选择本次以哪一端为准。不会自动合并。</p></section><section class="card"><h3>桌面小组件</h3><p>课表与日程自动轮播，可手动切换、暂停、勾选日程、新建日程和记一笔。关闭主窗口后继续常驻托盘。</p><button class="desk-action" data-desktop-action="widget">显示小组件</button><label>轮播间隔（秒）<input id="widgetInterval" type="number" min="5" max="120" value="12"></label><label>小组件保持最前<input id="widgetPin" type="checkbox"></label><label>开机启动小组件<input id="autoStart" type="checkbox"></label><p>拖动小组件顶部移动位置，拖动边缘调整大小。固定位置与大小会自动保存；最前显示由你控制。</p><h3 style="margin-top:26px">本地数据</h3><div id="dataDir" class="desk-path"></div><p>接收同步前保留最近 30 份备份。请定期在「我的」导出备份。</p><button class="desk-action secondary" data-desktop-action="export">导出当前数据</button></section></div>';
    updateBTStatus();
    const [settings,startup]=await Promise.all([call('settings'),call('startup-status')]);
    if(desktopTab!=='sync')return;
    document.getElementById('widgetInterval').value=settings.interval||12;document.getElementById('widgetPin').checked=!!settings.pinned;document.getElementById('autoStart').checked=startup===true;document.getElementById('dataDir').textContent=settings.dataDir||'浏览器预览';
  }
  function updateBTStatus(message){const el=document.getElementById('btStatus');if(el)el.textContent=message||btInfo.error||btInfo.message||(btInfo.connecting?'正在连接…':btInfo.connected?'蓝牙已连接'+(btInfo.lastSync?' · 上次同步 '+btInfo.lastSync:''):'尚未连接手机');document.querySelectorAll('[data-desktop-action="pull"],[data-desktop-action="push"]').forEach(b=>b.disabled=!btInfo.connected||btInfo.pending||busy);}
  document.addEventListener('click',async e=>{
    const item=e.target.closest('[data-desktop-nav],[data-desktop-action],[data-desktop-day]');if(!item)return;
    if(item.dataset.desktopNav){navigate(item.dataset.desktopNav);if(desktopTab==='sync'&&!btDevices.length)scan();return;}
    if(item.dataset.desktopDay){schDay=item.dataset.desktopDay;render();return;}
    const action=item.dataset.desktopAction;
    try{
      if(action==='scan')return await scan();
      if(action==='widget'){await call('widget');return;}
      if(action==='export'){persistNow();await native?.share(JSON.stringify(S,null,2));return;}
      if(action==='connect'){const address=document.getElementById('btDevices').value;if(!address){updateBTStatus('请先选择手机');return;}const result=await call('bt-connect',address);if(result.error)throw Error(result.error);return;}
      if(action==='disconnect'){await call('bt-disconnect');return;}
      if(action==='pull'||action==='push'){busy=true;updateBTStatus();persistNow();const result=await call('bt-'+action);if(result.error)throw Error(result.error);}
    }catch(err){btInfo={...btInfo,error:err.message};}finally{busy=false;updateBTStatus();}
  });
  async function scan(){updateBTStatus('正在读取已配对设备…');const result=await call('bt-list');if(result.error){updateBTStatus(result.error);return;}btDevices=Array.isArray(result)?result:[];if(desktopTab==='sync'){await renderSync();if(!btDevices.length)updateBTStatus('没有找到已配对设备，请先在 Windows 蓝牙设置中配对手机。');}}
  document.addEventListener('change',async e=>{if(e.target.id==='widgetInterval')await call('interval',e.target.value);if(e.target.id==='widgetPin')await call('pin');if(e.target.id==='autoStart'){const r=await call('startup',e.target.checked);if(r.error)toast(r.error);}});
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){closeSheet();return;}
    if(!(e.ctrlKey||e.metaKey))return;
    if(/^[1-8]$/.test(e.key)){e.preventDefault();navigate(tabs[Number(e.key)-1][0]);}
    if(e.key.toLowerCase()==='n'){e.preventDefault();if(desktopTab==='bill')openExpense();else{if(desktopTab!=='schedule')navigate('schedule');openSchedule(null);}}
  });
  if(native){
    native.on('state',raw=>{clearTimeout(saveTimer);saveTimer=null;S=normalize(JSON.parse(raw));CHAT.msgs=JSON.parse(JSON.stringify(curChat()?.hist||[]));render();});
    native.on('navigate',e=>{
      if(e.name==='flush'){clearTimeout(saveTimer);saveTimer=null;persistNow();return;}
      if(e.name==='tab')navigate(e.tab);
      if(e.name==='complete'){toggleSchDone(e.id);persistNow();}
      if(e.name==='new-schedule'){navigate('schedule');openSchedule(null);}
      if(e.name==='new-expense'){navigate('bill');openExpense();}
    });
    native.on('bluetooth',value=>{btInfo=value;updateBTStatus();});
    call('bt-status').then(s=>{btInfo=s;});
  }
  window.addEventListener('beforeunload',()=>{clearTimeout(saveTimer);persistNow();});
  // The desktop opens on the timetable; all original pages remain available directly.
  navigate('kb');persistNow();
})();
