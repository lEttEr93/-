'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Data=require('../shared/data.js');
const html=fs.readFileSync('android/assets/index.html','utf8');
const kb=JSON.parse(html.match(/var KB_BUILTIN\s*=\s*([\s\S]*?);\s*var KB\s*=/)[1]);
const base=()=>({categories:[{id:'c_food',name:'餐饮',color:'#f00'}],expenses:[],bills:[],records:[],budget:{enabled:false,amount:0},graceDays:3,schedule:[],kb:null,paths:{hua:[],shi:[]},chats:[],chatActive:'',tools:[],deepseek:{key:'must-stay-local'},theme:'dark',notify:{enabled:true}});
test('sync shares business data and effective timetable, retaining device secrets and settings',()=>{
  const phone=base();phone.expenses.push({id:'one',amount:12.5,date:'2026-10-20'});phone.deepseek.key='phone-secret';phone.theme='light';
  const snapshot=Data.snapshot(phone,kb);
  assert.equal(snapshot.kb.start,'2026-09-07');assert.equal(snapshot.deepseek,undefined);assert.equal(snapshot.notify,undefined);assert.equal(snapshot.theme,undefined);
  const desktop=base();const result=Data.apply(desktop,snapshot);
  assert.equal(result.expenses[0].amount,12.5);assert.equal(result.deepseek.key,'must-stay-local');assert.equal(result.theme,'dark');assert.equal(result.notify.enabled,true);
  snapshot.expenses[0].amount=999;assert.equal(result.expenses[0].amount,12.5);assert.equal(desktop.expenses.length,0);
});
test('sync rejects malformed arrays, timetable and non-finite amounts before applying',()=>{
  for(const change of [s=>s.expenses='bad',s=>s.expenses=[{id:'x',amount:Infinity}],s=>s.schedule=[{id:'x',title:'X',date:'bad'}],s=>s.kb={courses:[]},s=>{s.kb=JSON.parse(JSON.stringify(kb));s.kb.courses[0].s[0].p=[0,99];}]){const state=base();change(state);assert.throws(()=>Data.validate(state));}
});
test('agenda respects term boundaries, weeks, periods, completion and day selection',()=>{
  const local=base();local.schedule=[{id:'s1',title:'今日',date:'2026-10-20',start:'07:00',done:true},{id:'s2',title:'明天',date:'2026-10-21'}];
  const today=Data.agenda(local,kb,'2026-10-20');assert.equal(today.week,7);assert.equal(today.schedules.length,1);assert.equal(today.schedules[0].done,true);assert.equal(today.items[0].title,'今日');
  assert.equal(Data.agenda(local,kb,'2026-09-06').courses.length,0);assert.equal(Data.agenda(local,kb,'2027-02-01').courses.length,0);
  const active=Data.agenda(local,kb,'2026-10-27');assert.equal(active.week,8);assert(active.courses.length>0);assert(active.courses.every(c=>/^\d\d:\d\d$/.test(c.start)&&c.end>=c.start));
});
test('Android shared protocol implementation matches canonical source',()=>assert.equal(fs.readFileSync('android/assets/data.js','utf8'),fs.readFileSync('shared/data.js','utf8')));
