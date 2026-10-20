'use strict';
const Data=CampusData,api=window.Desktop;
let state={},kb=window.BuiltInKB,page=0,paused=matchMedia('(prefers-reduced-motion: reduce)').matches,hovered=false,interval=12,elapsed=0;
const $=id=>document.getElementById(id);
const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function load(raw){if(raw){state=JSON.parse(raw);kb=state.kb||window.BuiltInKB;}document.documentElement.dataset.theme=state.theme||'auto';render();}
function render(){
  const today=Data.dateString(),agenda=Data.agenda(state,kb,today),now=new Date(),clock=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
  $('date').textContent=now.toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'})+(agenda.inTerm?' · 第 '+agenda.week+' 周':' · 假期');
  $('title').textContent=page===0?'今天的课表':'接下来的日程';$('listLabel').textContent=page===0?'今日课程':'未来七天';
  let next=agenda.items.find(i=>!i.done&&i.start&&i.start<=clock&&i.end>clock);
  let active=!!next;if(!next)next=agenda.items.find(i=>!i.done&&i.start>clock);
  if(next){$('nextLabel').textContent=active?'正在进行':'接下来';$('nextTitle').textContent=next.title;const at=new Date(today+'T'+(active?next.end:next.start)+':00'),mins=Math.max(1,Math.ceil((at-now)/60000));$('nextDetail').textContent=(active?'距结束 ':'还有 ')+(mins>=60?Math.floor(mins/60)+' 小时 ':'')+(mins%60?mins%60+' 分钟':'')+(next.loc?' · '+next.loc:'');}
  else{$('nextLabel').textContent='此刻';$('nextTitle').textContent=agenda.items.some(i=>!i.done&&!i.start)?'还有全天安排待完成':'今天的时间，由你安排';$('nextDetail').textContent=agenda.items.some(i=>!i.done&&!i.start)?'切换到日程查看，完成后打个勾。':'放松一下，或者开始一件喜欢的事。';}
  const end=new Date(today+'T00:00:00');end.setDate(end.getDate()+6);const until=Data.dateString(end);
  const list=page===0?agenda.courses:(state.schedule||[]).filter(i=>i.date>=today&&i.date<=until).sort((a,b)=>(a.date+(a.start||'99')).localeCompare(b.date+(b.start||'99'))).map(i=>({...i,kind:'schedule'}));
  $('count').textContent=list.length+(page===0?' 节':' 项');
  $('items').innerHTML=list.length?list.map(i=>'<div class="item '+(i.done?'done':'')+'"><div class="time">'+escapeHTML(i.start||'全天')+'<small>'+escapeHTML(page===0?i.end:i.date===today?'今天':i.date.slice(5))+'</small></div><i class="bar" style="background:'+(page===0&&/^#[0-9a-f]{3,8}$/i.test(i.color)?i.color:'var(--green)')+'"></i><div class="details"><strong>'+escapeHTML(i.title)+'</strong><p>'+escapeHTML(i.loc||i.note||(page===0?'第 '+i.period[0]+'–'+i.period[1]+' 节':'留一点时间给自己'))+'</p></div>'+(i.kind==='schedule'?'<button class="check" data-complete="'+escapeHTML(i.id)+'" aria-label="'+(i.done?'标记未完成':'标记完成')+'">'+(i.done?'✓':'')+'</button>':'')+'</div>').join(''):'<div class="empty">'+(page===0?'今天没有课程<br>按自己的节奏过一天。':'接下来七天暂无日程<br>从一个小计划开始。')+'</div>';
  $('dotCourses').classList.toggle('on',page===0);$('dotSchedule').classList.toggle('on',page===1);$('pause').textContent=paused?'继续':'暂停';$('pause').setAttribute('aria-label',paused?'继续轮播':'暂停轮播');
}
function flip(to){page=to===undefined?1-page:to;elapsed=0;render();$('items').scrollTop=0;$('items').classList.remove('changing');void $('items').offsetWidth;$('items').classList.add('changing');}
$('prev').onclick=()=>flip();$('next').onclick=()=>flip();$('dotCourses').onclick=()=>flip(0);$('dotSchedule').onclick=()=>flip(1);$('pause').onclick=()=>{paused=!paused;elapsed=0;render();};
$('widget').addEventListener('pointerenter',()=>{hovered=true;});$('widget').addEventListener('pointerleave',()=>{hovered=false;elapsed=0;});
$('open').onclick=()=>api?.action('show',page===0?'kb':'schedule');$('close').onclick=()=>api?.action('widget-hide');$('pin').onclick=async()=>{const s=await api?.action('pin');$('pin').classList.toggle('active',!!s?.pinned);};
$('addSchedule').onclick=()=>api?.action('new-schedule');$('addExpense').onclick=()=>api?.action('new-expense');
$('items').onclick=e=>{const target=e.target.closest('[data-complete]');if(target)api?.action('complete',{id:target.dataset.complete});};
if(api){load(api.load());api.on('state',load);api.on('navigate',e=>{if(e.name==='settings'){interval=e.settings.interval;$('pin').classList.toggle('active',!!e.settings.pinned);}});api.action('settings').then(s=>{interval=s.interval||12;$('pin').classList.toggle('active',!!s.pinned);});}else render();
setInterval(()=>{if(!paused&&!hovered&&!document.querySelector('button:focus-visible')){elapsed++;if(elapsed>=interval)flip();}if(new Date().getSeconds()===0)render();},1000);
