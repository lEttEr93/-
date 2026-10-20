'use strict';
const {_electron:electron}=require('playwright-core');
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const runDir=process.env.CAMPUS_TEST_DIR||'D:\\AI\\runs\\campus-life\\smoke-'+Date.now();
fs.mkdirSync(runDir,{recursive:true});
(async()=>{
  const env={...process.env,CAMPUS_DATA_DIR:path.join(runDir,'data')};delete env.ELECTRON_RUN_AS_NODE;
  const packaged=process.env.CAMPUS_TEST_EXECUTABLE;
  const app=await electron.launch({executablePath:packaged||fs.realpathSync(require('electron')),args:[...(process.env.CAMPUS_TEST_NO_SANDBOX?['--no-sandbox']:[]),...(packaged?[]:[root])],env,timeout:30000});
  const errors=[];
  try{
    let main,widget;
    for(let i=0;i<30;i++){
      for(const w of app.windows())if(w.url().endsWith('index.html'))main=w;else if(w.url().endsWith('widget.html'))widget=w;
      if(main&&widget)break;await new Promise(resolve=>setTimeout(resolve,300));
    }
    assert(main&&widget,'main and widget windows opened');
    main.on('pageerror',e=>errors.push(e.message));widget.on('pageerror',e=>errors.push(e.message));
    await main.waitForSelector('.kb-grid');
    await main.screenshot({path:path.join(runDir,'desktop-timetable.png')});
    for(const tab of ['schedule','paths','bill','monthly','stats','ai','me','sync']){await main.click('[data-desktop-nav="'+tab+'"]');await main.waitForTimeout(150);assert.equal(await main.locator('#view').getAttribute('data-desktop-tab'),tab);}
    await main.click('[data-desktop-nav="schedule"]');
    await main.click('[data-act="addSchedule"]');
    await main.fill('#schTitle','桌面同步测试日程');await main.fill('#schStart','18:30');await main.fill('#schEnd','19:00');await main.fill('#schLoc','图书馆');
    await main.click('[data-act="saveSchedule"]');await main.waitForTimeout(400);
    assert(await main.locator('#view').innerText().then(s=>s.includes('桌面同步测试日程')));
    await main.screenshot({path:path.join(runDir,'desktop-schedule.png')});
    await widget.click('#dotSchedule');await widget.waitForSelector('[data-complete]');
    await widget.screenshot({path:path.join(runDir,'widget-schedule.png')});
    await widget.click('[data-complete]');await main.waitForTimeout(450);
    assert.equal(await main.evaluate(()=>S.schedule[0].done),true);
    await widget.click('[data-complete]');await main.waitForTimeout(450);assert.equal(await main.evaluate(()=>S.schedule[0].done),false);
    await main.click('[data-desktop-nav="bill"]');await main.keyboard.press('Control+n');await main.waitForSelector('#expAmount');
    await main.fill('#expAmount','18.50');await main.click('[data-act="saveExpense"]');await main.waitForTimeout(400);
    assert.equal(await main.evaluate(()=>S.expenses[0].amount),18.5);
    await main.screenshot({path:path.join(runDir,'desktop-ledger.png')});
    await main.click('[data-desktop-nav="me"]');await main.waitForTimeout(200);await main.screenshot({path:path.join(runDir,'desktop-settings.png')});
    await main.click('[data-desktop-nav="sync"]');await main.click('[data-desktop-action="scan"]');await main.waitForTimeout(600);await main.screenshot({path:path.join(runDir,'desktop-sync.png')});
    const devices=await main.evaluate(()=>Desktop.action('bt-list'));assert(Array.isArray(devices),'native Bluetooth enumerates paired devices');
    const data=JSON.parse(fs.readFileSync(path.join(runDir,'data/ledger.json'),'utf8'));assert.equal(data.schedule.length,1);assert.equal(data.expenses.length,1);
    // Verify narrow supported desktop layout and keyboard navigation.
    await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.getTitle()==='大学食草路');w?.setSize(900,700);});
    await main.keyboard.press('Control+1');await main.waitForTimeout(200);
    assert.equal(await main.locator('#view').getAttribute('data-desktop-tab'),'kb');await main.screenshot({path:path.join(runDir,'desktop-compact.png')});
    await main.evaluate(()=>{S.theme='dark';persistNow();render();});await main.waitForTimeout(200);await main.screenshot({path:path.join(runDir,'desktop-dark.png')});await widget.screenshot({path:path.join(runDir,'widget-dark.png')});
    assert.deepEqual(errors,[],'no renderer exceptions');
    fs.writeFileSync(path.join(runDir,'result.json'),JSON.stringify({passed:true,errors,devices:devices.map(d=>({name:d.name,paired:d.paired})),checks:['all eight pages and device page','create expense','create schedule','widget completion round trip','native Bluetooth enumeration','disk persistence','keyboard navigation','compact and dark layouts']},null,2));
    console.log('PASS '+runDir);
  }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
