'use strict';
const {chromium}=require('playwright-core');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
const output=process.env.CAMPUS_TEST_DIR||path.join(process.env.AI_ROOT||'D:\\AI','runs','campus-life','phone-ui-'+Date.now());
fs.mkdirSync(output,{recursive:true});
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}),args:['--allow-file-access-from-files']});
  try{
    const page=await browser.newPage({viewport:{width:412,height:915},isMobile:true,hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{
      window.phoneTest={raw:'',backup:'',replies:[],canBackup:true,canSave:true};
      window.Android={load:()=>phoneTest.raw,save:raw=>{if(!phoneTest.canSave)return false;phoneTest.raw=raw;return true;},hasData:()=>!!phoneTest.raw,haptic:()=>{},setAppearance:()=>{},appVersion:()=> '1.4',lastCrash:()=>'',startBluetooth:()=>{},bluetoothStatus:()=> '已连接：测试电脑',stopBluetooth:()=>{},bluetoothReply:(id,raw)=>{phoneTest.replies.push({id,...JSON.parse(raw)});return true;},backupForSync:()=>{if(!phoneTest.canBackup)return false;phoneTest.backup=phoneTest.raw;return true;},latestSyncBackup:()=>phoneTest.backup};
    });
    await page.goto(pathToFileURL(path.join(root,'android/assets/index.html')).href);
    await page.evaluate(()=>{S.deepseek.key='phone-secret';S.theme='dark';S.notify.enabled=false;persistNow();tab='me';render();});
    await page.waitForSelector('[data-phone-bt="start"]');await page.screenshot({path:path.join(output,'phone-bluetooth.png')});
    const incoming=await page.evaluate(()=>CampusData.snapshot(S,KB));incoming.schedule=[{id:'pc-event',title:'来自电脑的安排',date:'2026-10-21',start:'09:00',end:'10:00',done:false}];
    await page.evaluate(data=>__onBluetoothRequest(JSON.stringify({protocol:1,type:'push',id:'test-push',data})),incoming);
    assert.equal(await page.evaluate(()=>S.schedule.length),0,'not applied before confirmation');
    await page.screenshot({path:path.join(output,'phone-confirm.png')});await page.click('[data-phone-bt="confirm"]');
    assert.deepEqual(await page.evaluate(()=>({schedule:S.schedule.length,key:S.deepseek.key,theme:S.theme,backup:JSON.parse(phoneTest.backup).schedule.length,reply:phoneTest.replies.at(-1).type})),{schedule:1,key:'phone-secret',theme:'dark',backup:0,reply:'ack'});
    await page.waitForTimeout(300);
    await page.evaluate(()=>__onBluetoothRequest(JSON.stringify({protocol:1,type:'pull',id:'test-pull'})));await page.click('[data-phone-bt="confirm"]');
    assert.equal(await page.evaluate(()=>phoneTest.replies.at(-1).data.deepseek),undefined,'API secret excluded');
    assert.equal(await page.evaluate(()=>phoneTest.replies.at(-1).data.schedule[0].id),'pc-event');await page.waitForTimeout(300);
    await page.evaluate(()=>__onBluetoothRequest(JSON.stringify({protocol:1,type:'pull',id:'test-cancel'})));await page.click('[data-phone-bt="cancel"]');
    assert.equal(await page.evaluate(()=>phoneTest.replies.at(-1).type),'error');await page.waitForTimeout(300);
    await page.evaluate(()=>{CHAT.streaming=true;__onBluetoothRequest(JSON.stringify({protocol:1,type:'pull',id:'test-busy'}));CHAT.streaming=false;});assert.equal(await page.evaluate(()=>phoneTest.replies.at(-1).type),'error');
    await page.evaluate(()=>__onBluetoothRequest(JSON.stringify({protocol:1,type:'push',id:'test-invalid',data:{}})));assert.equal(await page.evaluate(()=>phoneTest.replies.at(-1).id),'test-invalid','invalid requests released');
    await page.evaluate(data=>{phoneTest.canBackup=false;__onBluetoothRequest(JSON.stringify({protocol:1,type:'push',id:'test-backup-failed',data}));},{...incoming,schedule:[]});await page.click('[data-phone-bt="confirm"]');assert.equal(await page.evaluate(()=>S.schedule.length),1,'failed backup never replaces local state');await page.waitForTimeout(300);
    await page.evaluate(data=>{phoneTest.canBackup=true;__onBluetoothRequest(JSON.stringify({protocol:1,type:'push',id:'test-revision',data}));S.schedule[0].title='手机上的新修改';persistNow();},{...incoming,schedule:[]});await page.click('[data-phone-bt="confirm"]');assert.equal(await page.evaluate(()=>S.schedule[0].title),'手机上的新修改','concurrent changes preserved');
    assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:true,errors,checks:['push requires confirmation','backup before replacement','settings and API secret preserved','pull excludes secrets','cancel','AI busy rejection','invalid request releases peer','backup failure preserves data','concurrent changes preserve data']},null,2));console.log('PASS '+output);
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
