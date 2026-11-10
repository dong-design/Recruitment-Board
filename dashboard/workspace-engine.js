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
  function events(records, manual = {}, marks = {}){
    const result = records.flatMap(r => dates(r.exam).map((d,i) => ({...d,id:`exam:${r.id}:${d.date}${i ? ':'+i : ''}`,rid:r.id,title:r.name,post:r.post,kind:'笔试 / 面试',detail:r.exam})));
    for (const t of Object.values(manual)) if (t.kind === '笔试 / 面试') {
      const parsed = dates(t.date+' '+(t.detail||''))[0];
      if (parsed) result.push({...t,...parsed,...(t.time?{time:t.time,end:t.end||''}:{})});
    }
    // 同一场笔试常被同步写进父子多条记录（收到通知后刷到每个岗位）。
    // 按 公司 + 日期 + 开始时间 合并，避免日历出现一模一样的卡片与「自己撞自己」的假冲突。
    const groups = new Map();
    for (const e of result) {
      const key = [e.title||'', e.date||'', e.time||''].join('\u0000');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(e);
    }
    const merged = [...groups.values()].map(group => {
      if (group.length === 1) return group[0];
      // 完成标记按事件 id 存储：必须保住已点过的那个 id，否则去重会让已完成项复活。
      const rep = group.find(e => marks?.[e.id]?.done) || group[0];
      // 明细取信息最全的一条，合并后不丢考试入口 / 准考证等内容。
      const fullest = group.reduce((a,b) => String(b.detail||'').length > String(a.detail||'').length ? b : a, group[0]);
      return {...rep, detail:fullest.detail, post:fullest.post || rep.post, mergedIds:group.map(e=>e.id)};
    });
    merged.sort((a,b)=>a.date.localeCompare(b.date)||(a.time||'99:99').localeCompare(b.time||'99:99'));
    return merged.map(a=>({...a, conflict:!!a.time && merged.some(b=>a.id!==b.id && a.date===b.date && b.time && (a.time===b.time || (a.end && b.end && a.time<b.end && b.time<a.end)))}));
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
    const extractor=typeof module!=='undefined'?require('./link-utils'):root.LinkUtils;
    const primary=extractor.extract(r.link);
    return extractor.extract([r.link,r.urls,r.exam,r.note]).map(url=>{
      const u=new URL(url);return {url,label:primary.includes(url)?'招聘 / 投递入口':/exam|test|kaoshi/i.test(url)?'考试链接':/pdf|doc|drive|file/i.test(url)?'材料 / 附件':'相关链接',host:u.hostname};
    });
  }

  // 超过 ARCHIVE_DAYS 的历史事项不再默认涌入「待处理」：
  // 状态文件一旦丢失（如整目录发布覆盖），陈年笔试会全部复活成僵尸卡片。
  // 已完成的历史事项仍保留，方便回看；未完成且过期的自动归档。
  const ARCHIVE_DAYS = 14;
  function focus(records, actions, state, reminderItems, now=Date.now()){
    const today=day(now), archiveFloor=shift(today,-ARCHIVE_DAYS), result=new Map(reminderItems.map(t=>[t.id,{...t}]));
    const done = id => !!(state.marks?.[id]?.done);
    // 去重合并后的别名也算已完成，避免用户先前标记过的子记录 id 失配后复活。
    const doneIncludingAliases = e => done(e.id) || (e.mergedIds||[]).some(done);
    for (const r of records) {
      if (['挂了','已截止','Offer','实习offer'].includes(r.status)) continue;
      if(r.status==='待投递' && r.hasDl && r.key<today) {
        const id=`deadline:${r.id}:${r.key}:0`;
        if (r.key<archiveFloor && !state.marks?.[id]?.done) continue;
        result.set(id,{id,rid:r.id,title:r.name,kind:'截止提醒',date:r.key,detail:'已过报名截止日，请确认是否仍可报名'});
      }
    }
    for(const e of events(records, {}, state.marks).filter(e=>e.date<=shift(today,3))) {
      const r=records.find(r=>r.id===e.rid);
      if (['挂了','已截止','Offer','实习offer'].includes(r?.status)) continue;
      if (e.date<archiveFloor && !doneIncludingAliases(e)) continue;
      result.set(e.id,{...e, detail:(e.date<today?'待确认是否已参加 · ':'')+e.detail});
    }
    for(const t of Object.values(state.manual||{})) if(t.date<=shift(today,3)) result.set(t.id,{...t});
    for(const a of actions||[]) if(a.date>=today && a.date<=shift(today,3)) {
      const id=`action:${a.name}:${a.date}:${a.time||''}`;
      result.set(id,{id,title:a.name,date:a.date,time:a.time,kind:'日程提醒',detail:[a.time,a.tip].filter(Boolean).join(' · ')});
    }
    const aliases=new Set([...result.values()].flatMap(t=>t.mergedIds||[]));
    for(const [id,mark] of Object.entries(state.marks||{})) if(mark.done && mark.snapshot && !result.has(id) && !aliases.has(id)) result.set(id,{id,...mark.snapshot});
    return [...result.values()].map(t=>({...t,...(state.marks?.[t.id]||{}),group:t.undated?'today':t.date<today?'overdue':t.date===today?'today':'soon'})).sort((a,b)=>
      (a.undated? '9999':a.date).localeCompare(b.undated?'9999':b.date)||(a.time||dates(a.date+' '+a.detail)[0]?.time||'99:99').localeCompare(b.time||dates(b.date+' '+b.detail)[0]?.time||'99:99')||a.title.localeCompare(b.title));
  }
  const api={day,shift,dates,events,matches,links,focus};
  if(typeof module!=='undefined') module.exports=api; else root.WorkspaceEngine=api;
})(globalThis);
