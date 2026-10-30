(function(root){
  const day = value => new Date(value).toLocaleDateString('sv-SE', {timeZone:'Asia/Shanghai'});
  const shift = (date, n) => day(Date.parse(date+'T12:00:00+08:00') + n*86400000);
  function dates(text){
    return [...String(text || '').matchAll(/(20\d{2})[-/年](\d{1,2})[-/月](\d{1,2})日?/g)].map(m => {
      const date = `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
      if (!Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date) return null;
      const tail = String(text).slice(m.index+m[0].length).split(/20\d{2}[-/年]/)[0];
      const time = tail.match(/(?:^|\D)([01]?\d|2[0-3])[:：]([0-5]\d)(?:\s*[-—~至]\s*([01]?\d|2[0-3])[:：]([0-5]\d))?/);
      return {date, time:time ? `${time[1].padStart(2,'0')}:${time[2]}` : '', end: time?.[3] ? `${time[3].padStart(2,'0')}:${time[4]}` : ''};
    }).filter(Boolean);
  }
  function events(records, manual = {}){
    const result = records.flatMap(r => dates(r.exam).map((d,i) => ({...d,id:`exam:${r.id}:${d.date}${i ? ':'+i : ''}`,rid:r.id,title:r.name,post:r.post,kind:'笔试 / 面试',detail:r.exam})));
    for (const t of Object.values(manual)) if (t.kind === '笔试 / 面试') {
      const parsed = dates(t.date+' '+(t.detail||''))[0];
      if (parsed) result.push({...t,...parsed});
    }
    result.sort((a,b)=>a.date.localeCompare(b.date)||(a.time||'99:99').localeCompare(b.time||'99:99'));
    return result.map(a=>({...a, conflict:!!a.time && result.some(b=>a.id!==b.id && a.date===b.date && b.time && (a.time===b.time || (a.end && b.end && a.time<b.end && b.time<a.end)))}));
  }
  function matches(r, query='', quick='', today=day(Date.now())){
    const text=[r.name,r.parent,r.post,r.type,...(r.city||[]),r.status,...(r.progress||[]),r.note].join(' ').toLowerCase();
    if (!query.toLowerCase().trim().split(/\s+/).every(word=>text.includes(word))) return false;
    if (quick==='deadline') return r.status==='待投递' && r.hasDl && r.key>=today && r.key<=shift(today,3);
    if (quick==='exam') return dates(r.exam).some(d=>d.date>=today && d.date<=shift(today,6));
    if (quick==='waiting') return r.status==='已投递' && !(r.progress||[]).length;
    if (quick==='material') return /待补材料|待补充材料|需补交|待上传材料/.test(r.note||'');
    return true;
  }
  function links(r){
    const urls=[r.link,...(String(r.exam||'')+' '+String(r.note||'')).matchAll(/https?:\/\/[^\s<>"'）)\]】]+/g)].map(v=>Array.isArray(v)?v[0]:v);
    return [...new Set(urls.filter(Boolean))].flatMap(url=>{
      try { const u=new URL(url); return ['http:','https:'].includes(u.protocol)?[{url:u.href,label:url===r.link?'招聘 / 投递入口':/exam|test|kaoshi/i.test(url)?'考试链接':/pdf|doc|drive|file/i.test(url)?'材料 / 附件':'相关链接',host:u.hostname}]:[]; } catch { return []; }
    });
  }
  function focus(records, actions, state, reminderItems, now=Date.now()){
    const today=day(now), result=new Map(reminderItems.map(t=>[t.id,{...t}]));
    for (const r of records) {
      if (['挂了','已截止','Offer','实习offer'].includes(r.status)) continue;
      if(r.status==='待投递' && r.hasDl && r.key<today) {
        const id=`deadline:${r.id}:${r.key}:0`;
        result.set(id,{id,rid:r.id,title:r.name,kind:'截止提醒',date:r.key,detail:'已过报名截止日，请确认是否仍可报名'});
      }
    }
    for(const e of events(records).filter(e=>e.date<=shift(today,3))) {
      const r=records.find(r=>r.id===e.rid);
      if (['挂了','已截止','Offer','实习offer'].includes(r?.status)) continue;
      result.set(e.id,{...e, detail:(e.date<today?'待确认是否已参加 · ':'')+e.detail});
    }
    for(const t of Object.values(state.manual||{})) if(t.date<=shift(today,3)) result.set(t.id,{...t});
    for(const a of actions||[]) if(a.date>=today && a.date<=shift(today,3)) {
      const id=`action:${a.name}:${a.date}:${a.time||''}`;
      result.set(id,{id,title:a.name,date:a.date,time:a.time,kind:'日程提醒',detail:[a.time,a.tip].filter(Boolean).join(' · ')});
    }
    for(const [id,mark] of Object.entries(state.marks||{})) if(mark.done && mark.snapshot && !result.has(id)) result.set(id,{id,...mark.snapshot});
    return [...result.values()].map(t=>({...t,...(state.marks?.[t.id]||{}),group:t.undated?'today':t.date<today?'overdue':t.date===today?'today':'soon'})).sort((a,b)=>
      (a.undated? '9999':a.date).localeCompare(b.undated?'9999':b.date)||(a.time||dates(a.date+' '+a.detail)[0]?.time||'99:99').localeCompare(b.time||dates(b.date+' '+b.detail)[0]?.time||'99:99')||a.title.localeCompare(b.title));
  }
  const api={day,shift,dates,events,matches,links,focus};
  if(typeof module!=='undefined') module.exports=api; else root.WorkspaceEngine=api;
})(globalThis);
