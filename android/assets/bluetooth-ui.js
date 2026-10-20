'use strict';
(function(){
  if(!window.Android||!Android.startBluetooth)return;
  let request=null,baseline='';
  const originalRenderMe=renderMe;
  renderMe=function(){originalRenderMe();const card=document.createElement('div');card.className='card';card.innerHTML='<div class="label">电脑蓝牙同步</div><div id="phoneBTStatus" class="muted" style="font-size:12px;line-height:1.8"></div><p class="muted" style="font-size:12px;line-height:1.8">与 Windows 配对后开启。同步时保持本应用打开，在电脑「设备与小组件」选择同步方向，两端确认后才会替换数据。API Key、外观与通知设置各自保留。</p><div class="btnrow"><button class="btn" data-phone-bt="start">开启蓝牙同步</button><button class="btn" data-phone-bt="stop">停止</button><button class="btn" data-phone-bt="backup">复制同步前备份</button></div>';document.getElementById('view').prepend(card);update();};
  function update(){const el=document.getElementById('phoneBTStatus');if(el)el.textContent=Android.bluetoothStatus();}
  function reply(type,data,error){if(!request)return false;return Android.bluetoothReply(request.id,JSON.stringify({type,data,error}));}
  function cancel(){reply('error',null,'手机取消了同步');request=null;closeSheet();}
  window.__onBluetoothClosed=function(){if(request){request=null;closeSheet();toast('电脑已断开，本次同步已取消');}update();};
  window.__onBluetoothRequest=function(raw){
    let incoming;
    try{
      incoming=JSON.parse(raw);
      if(CHAT.streaming || AISTREAM || pendingToolConfirm){Android.bluetoothReply(incoming.id,JSON.stringify({type:'error',error:'手机 AI 正在运行，请完成后再同步'}));return;}
      if(incoming.type==='push')CampusData.validate(incoming.data);
      if(saveTimer){clearTimeout(saveTimer);saveTimer=null;}persistNow();
      request=incoming;baseline=JSON.stringify(CampusData.snapshot(S,KB));
      const counts=CampusData.summary(incoming.type==='push'?incoming.data:CampusData.snapshot(S,KB));
      openSheet('<div class="sheet-head"><button data-phone-bt="cancel">取消</button><b>'+(incoming.type==='push'?'接收电脑数据':'发送到电脑')+'</b><button class="primary" data-phone-bt="confirm">确认</button></div><div class="sheet-body"><div class="label">'+counts.expenses+' 笔账目 · '+counts.courses+' 门课程 · '+counts.schedule+' 项日程</div><p style="line-height:1.9">'+(incoming.type==='push'?'本机账目、课表、日程、小径和 AI 历史／自定义工具将由电脑整份替换。当前数据会先备份。':'同意把本机账目、课表、日程、小径和 AI 历史／自定义工具发送到已配对的电脑。')+'</p><p class="muted" style="font-size:12px">API Key、外观与通知设置保留在本机。如需合并两端分别新增的数据，请先取消并导出备份。</p></div>');
    }catch(err){if(incoming?.id)Android.bluetoothReply(incoming.id,JSON.stringify({type:'error',error:err.message}));request=null;toast('同步请求无效：'+err.message);}
  };
  document.addEventListener('click',function(e){
    const target=e.target.closest('[data-phone-bt]');if(!target)return;
    const action=target.getAttribute('data-phone-bt');
    try{
      if(action==='start'){Android.startBluetooth();setTimeout(update,700);return;}
      if(action==='stop'){cancel();Android.stopBluetooth();update();return;}
      if(action==='backup'){const raw=Android.latestSyncBackup();if(raw)Android.copy(raw);else toast('还没有同步前备份');return;}
      if(action==='cancel'){cancel();return;}
      if(action==='confirm'&&request){
        if(request.type==='pull'){
          if(!reply('snapshot',CampusData.snapshot(S,KB)))throw Error('发送失败，请重新连接');
          request=null;closeSheet();toast('数据已发送，请在电脑确认接收');return;
        }
        if(JSON.stringify(CampusData.snapshot(S,KB))!==baseline)throw Error('确认期间手机数据已变化，请在电脑重新发起同步');
        const next=CampusData.apply(S,request.data);
        if(!Android.backupForSync())throw Error('备份失败，未替换手机数据');
        if(!Android.save(JSON.stringify(next)))throw Error('保存失败，原数据仍保留');
        S=normalize(next);CHAT.msgs=JSON.parse(JSON.stringify(curChat()?.hist||[]));persistNow();
        pushAll();if(!reply('ack'))toast('数据已保存，但确认发送失败；请重新连接');
        request=null;closeSheet();render();toast('已接收电脑数据，原手机数据已备份');
      }
    }catch(err){reply('error',null,err.message);request=null;closeSheet();toast(err.message);}
  });
  // Treat any dismissal of the confirmation sheet as cancellation, so the peer can retry.
  const originalClose=closeSheet;
  closeSheet=function(){if(request){reply('error',null,'手机关闭了确认窗口');request=null;}originalClose();};
  setInterval(update,2000);
})();
