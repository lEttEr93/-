'use strict';
if (window.Desktop) {
  window.Android = {
    load:()=>Desktop.load(), save:json=>Desktop.save(json), hasData:()=>!!Desktop.load(),
    copy:text=>Desktop.copy(text), share:text=>Desktop.share(text),
    haptic:()=>{}, setAppearance:()=>{}, appVersion:()=> '1.4.0 · Windows', lastCrash:()=>'',
    httpGet:(url,auth,cb)=>Desktop.request({url,auth}).then(r=>window[cb]?.(r.status,r.body)),
    httpPost:(url,auth,body,cb)=>Desktop.request({url,auth,body}).then(r=>window[cb]?.(r.status,r.body)),
    httpPostStream:(url,auth,body,cb)=>Desktop.stream({url,auth,body,cb}),
    setCourses:()=>{},setSchedules:()=>{},
    startReminderService:()=>Desktop.action('reminders'),stopReminderService:()=>{},
    hasNotifPermission:()=>true,openNotifSettings:()=>Desktop.action('notification-settings')
  };
  Desktop.on('stream',e=>window[e.cb]?.(e.line));
}
