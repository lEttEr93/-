(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CampusData = factory();
})(typeof globalThis === 'object' ? globalThis : this, function() {
  'use strict';
  const FIELDS = ['categories','expenses','bills','records','budget','graceDays','schedule','kb','paths','chats','chatActive','tools'];
  const clone = value => JSON.parse(JSON.stringify(value));
  function snapshot(state, kb) {
    const data = {};
    for (const key of FIELDS) if (state[key] !== undefined) data[key] = clone(state[key]);
    // Export the effective timetable, including the original built-in timetable.
    if (!data.kb && kb) data.kb = clone(kb);
    validate(data);
    return data;
  }
  function validate(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('数据格式不正确');
    for (const key of ['categories','expenses','bills','records','schedule','chats','tools']) {
      if (!Array.isArray(data[key]) || data[key].length > 100000) throw Error('无效数据字段：' + key);
    }
    if (!data.categories.length || !data.budget || typeof data.budget !== 'object' || !data.paths || !Array.isArray(data.paths.hua) || !Array.isArray(data.paths.shi)) throw Error('备份缺少必要字段');
    if (data.kb != null && (!Array.isArray(data.kb.courses) || !Array.isArray(data.kb.times) || !/^\d{4}-\d{2}-\d{2}$/.test(data.kb.start) || !(data.kb.weeks > 0 && data.kb.weeks <= 100))) throw Error('课表格式不正确');
    if(data.kb){
      if(!data.kb.times.length||data.kb.times.length>30||data.kb.times.some(t=>!Array.isArray(t)||t.length!==2||t.some(v=>typeof v!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(v))))throw Error('课程时间不正确');
      for(const c of data.kb.courses){
        if(!c||typeof c.n!=='string'||!Array.isArray(c.s))throw Error('课程数据不正确');
        for(const s of c.s)if(!s||!Number.isInteger(s.d)||s.d<1||s.d>7||!Array.isArray(s.p)||s.p.length!==2||s.p.some(p=>!Number.isInteger(p)||p<1||p>data.kb.times.length)||s.p[0]>s.p[1]||!Array.isArray(s.w)||s.w.some(w=>!Number.isInteger(w)||w<1||w>data.kb.weeks))throw Error('课程节次或周次不正确');
      }
    }
    for (const row of data.schedule) if (!row || typeof row.id !== 'string' || typeof row.title !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) throw Error('日程格式不正确');
    for (const row of data.expenses) if (!row || typeof row.id !== 'string' || !Number.isFinite(row.amount) || row.amount < 0) throw Error('账目格式不正确');
    if (new TextEncoder().encode(JSON.stringify(data)).length > 7 * 1024 * 1024) throw Error('同步数据超过 7 MB，请先精简 AI 历史');
    return data;
  }
  function apply(local, incoming) {
    validate(incoming);
    const next = clone(local);
    for (const key of FIELDS) if (incoming[key] !== undefined) next[key] = clone(incoming[key]);
    return next;
  }
  function summary(data) {
    return {expenses:(data.expenses||[]).length, schedule:(data.schedule||[]).length, courses:(data.kb?.courses||[]).length, paths:(data.paths?.hua||[]).length+(data.paths?.shi||[]).length};
  }
  function dateString(d = new Date()) { return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function agenda(state, kb, date = dateString()) {
    const day = new Date(date+'T00:00:00');
    const first = new Date(kb.start+'T00:00:00');
    const diff = Math.round((Date.UTC(day.getFullYear(),day.getMonth(),day.getDate())-Date.UTC(first.getFullYear(),first.getMonth(),first.getDate()))/86400000);
    const week = Math.floor(diff / 7) + 1;
    const weekday = day.getDay() || 7;
    const courses = [];
    if (week >= 1 && week <= kb.weeks) for (const c of kb.courses) for (const s of c.s || []) {
      if (s.d === weekday && s.w.includes(week)) courses.push({kind:'course',id:c.id||c.n,title:c.n,start:kb.times[s.p[0]-1]?.[0]||'',end:kb.times[s.p[1]-1]?.[1]||'',loc:s.r||'',color:c.c||'#388773',period:s.p});
    }
    const schedules = (state.schedule||[]).filter(s=>s.date===date).map(s=>({...s,kind:'schedule'}));
    const items = [...courses,...schedules].sort((a,b)=>(a.start||'00:00').localeCompare(b.start||'00:00'));
    return {date,week,inTerm:week>=1&&week<=kb.weeks,courses,schedules,items};
  }
  return {FIELDS,snapshot,validate,apply,summary,agenda,dateString};
});
