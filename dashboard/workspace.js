/* Unified recruitment workspace. Business writes reuse the authenticated server API. */
const WE = WorkspaceEngine;
let workspaceQuery = '', workspaceQuick = '', workspaceSelected = new Set(), focusTab = 'active';
let calendarDate = WE.day(Date.now()), calendarMode = 'month', workspaceReturnFocus = null;
try { const saved=JSON.parse(localStorage.getItem('recruit.workspace.filters')||'{}'); workspaceQuery=String(saved.query||''); workspaceQuick=['deadline','exam','waiting','material'].includes(saved.quick)?saved.quick:''; } catch (_) {}
function workspaceMatch(r){return WE.matches(r,workspaceQuery,workspaceQuick);}
function workspaceActive(){return !!(workspaceQuery.trim()||workspaceQuick);}
function actionLinks(r){
  const own=WE.links(r);
  if (!r.link && r.parentId) {
    const parent=jobById(r.parentId);
    if(parent?.link){const entry=WE.links({link:parent.link})[0];if(entry&&!own.some(l=>l.url===entry.url)) own.unshift({...entry,label:'集团招聘入口'});}
  }
  return own;
}
function allJobs(){return [...V(),...SUBS.map(view)];}
function jobById(id){return allJobs().find(r=>r.id===id);}
const searchRoot=document.createElement('section');searchRoot.className='card workspace-search';
searchRoot.innerHTML=`<div class="search-line"><label class="search-box"><span aria-hidden="true">⌕</span><input id="global-search" type="search" placeholder="搜索公司、分行、岗位、城市…" aria-label="全局搜索"></label><button class="btn" id="clear-global">清除筛选</button></div><div class="quick-filters">${[['','全部岗位'],['deadline','3 天内截止'],['exam','未来 7 天笔面试'],['waiting','等待反馈'],['material','待补材料']].map(([id,title])=>`<button class="btn" data-quick="${id}" aria-pressed="false">${title}</button>`).join('')}</div><div id="search-results"></div><div id="batch-bar" aria-live="polite"></div>`;
$('kpis').before(searchRoot);$('global-search').value=workspaceQuery;
const calendarRoot=document.createElement('section');calendarRoot.id='v-calendar';calendarRoot.className='card hide';
$('v-board').before(calendarRoot);
const calendarTab=document.createElement('button');calendarTab.className='tab';calendarTab.dataset.v='calendar';calendarTab.textContent='笔面试日历';
document.querySelector('.tabs').append(calendarTab);
const todayTab=document.createElement('button');todayTab.className='tab';todayTab.dataset.v='today';todayTab.textContent='今日行动';document.querySelector('.tabs').prepend(todayTab);
plannerRoot.before(document.querySelector('.tabs'));
const overview=document.createElement('details');overview.className='card workspace-overview';overview.innerHTML='<summary>截止概览 <span class="sub">展开查看</span></summary>';
plannerRoot.after(overview);overview.append($('dl').closest('.card'));
$('kpis').after($('tl').closest('.card'));
function setWorkspaceView(value){
  plannerRoot.classList.toggle('hide',value!=='today');overview.classList.toggle('hide',value!=='today');
}
document.querySelectorAll('.tabs .tab').forEach(t=>{t.onclick=()=>{
  document.querySelectorAll('.tabs .tab').forEach(x=>x.classList.toggle('on',x===t));setWorkspaceView(t.dataset.v);
  ['board','table','sub','act','log','calendar'].forEach(v=>$('v-'+v).classList.toggle('hide',v!==t.dataset.v));
  if(t.dataset.v==='log')loadLogs(); if(t.dataset.v==='calendar')renderCalendar();
};});
function persistSearch(){try{localStorage.setItem('recruit.workspace.filters',JSON.stringify({query:workspaceQuery,quick:workspaceQuick}));}catch(_){} }
$('global-search').oninput=e=>{workspaceQuery=e.target.value;persistSearch();renderAll();};
searchRoot.addEventListener('click',e=>{
  const quick=e.target.closest('[data-quick]');if(quick){workspaceQuick=quick.dataset.quick;persistSearch();renderAll();}
  if(e.target.id==='clear-global'){workspaceQuery='';workspaceQuick='';$('global-search').value='';persistSearch();renderAll();}
  if(e.target.id==='batch-open')openBatch();
  if(e.target.id==='batch-clear'){workspaceSelected.clear();renderAll();}
  if(e.target.id==='select-results'){allJobs().filter(workspaceMatch).forEach(r=>workspaceSelected.add(r.id));renderAll();}
});
function renderWorkspace(){
  const known=new Set(allJobs().map(r=>r.id));workspaceSelected.forEach(id=>{if(!known.has(id))workspaceSelected.delete(id);});
  searchRoot.querySelectorAll('[data-quick]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.quick===workspaceQuick)));
  const matches=allJobs().filter(workspaceMatch);
  $('search-results').innerHTML=workspaceActive()?`<div class="search-summary">找到 ${matches.length} 条集团 / 独立岗位 <button class="btn" id="select-results" ${!matches.length?'disabled':''}>全选搜索结果</button></div><div class="result-grid">${matches.map(r=>`<div class="result-row"><input type="checkbox" data-select-job="${esc(r.id)}" aria-label="选择 ${esc(r.name)}" ${workspaceSelected.has(r.id)?'checked':''}><button class="result-open" data-detail="${esc(r.id)}"><strong>${esc(r.name)}</strong><span>${esc(r.post||'未填写岗位')}</span><small>${esc(r.parent||r.type||'')} · ${esc((r.city||[]).join(' / '))} · ${esc(r.status)}</small></button></div>`).join('')||'<p class="sub">没有匹配的岗位，试试其他关键词或清除筛选。</p>'}</div>`:'';
  $('batch-bar').innerHTML=workspaceSelected.size?`<span>已选择 <b>${workspaceSelected.size}</b> 条记录（含筛选外选择）</span><button class="btn pri" id="batch-open" ${LIVE&&!saveInFlight?'':'disabled'}>批量修改</button><button class="btn" id="batch-clear">取消选择</button>`:'<span class="sub">勾选卡片可批量修改；点击卡片查看岗位详情。</span>';
  document.querySelectorAll('#cols .it').forEach(el=>{
    if(el.querySelector('[data-select-job]'))return;
    const r=jobById(el.dataset.id);if(!r)return;
    const label=document.createElement('label');label.className='card-select';label.innerHTML=`<input type="checkbox" data-select-job="${esc(r.id)}" aria-label="选择 ${esc(r.name)}" ${workspaceSelected.has(r.id)?'checked':''}>`;
    const shortcuts=document.createElement('div');shortcuts.className='card-links';shortcuts.innerHTML=actionLinks(r).slice(0,2).map(l=>`<a class="btn" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)} ↗</a>`).join('');if(shortcuts.children.length)el.append(shortcuts);
    el.prepend(label);el.setAttribute('tabindex','0');el.setAttribute('role','button');el.setAttribute('aria-label',`${r.name}，查看岗位详情`);
    const post=document.createElement('div');post.className='card-post';post.textContent=r.post||'岗位信息待补充';el.querySelector('.t').after(post);
  });
  renderCalendar();
}
document.addEventListener('click',e=>{
  if(e.target.closest('.card-links a')){e.stopImmediatePropagation();return;}
  const select=e.target.closest('.card-select');if(select){e.stopImmediatePropagation();return;}
  const groupJob=e.target.closest('[data-job]');if(groupJob){e.stopImmediatePropagation();const r=jobById(groupJob.dataset.job);if(r)openModal(r);return;}
  const detail=e.target.closest('[data-detail]');if(detail){e.preventDefault();const r=jobById(detail.dataset.detail);if(r)openModal(r);}
},true);
document.addEventListener('change',e=>{
  if(e.target.matches('[data-select-job]')){const id=e.target.dataset.selectJob;e.target.checked?workspaceSelected.add(id):workspaceSelected.delete(id);renderAll();}
});
document.addEventListener('keydown',e=>{if(e.target.matches('#cols .it')&&['Enter',' '].includes(e.key)){e.preventDefault();openModal(jobById(e.target.dataset.id));}});
const previousRenderAll=renderAll;
renderAll=function(){const x=window.scrollX,y=window.scrollY;previousRenderAll();renderWorkspace();window.scrollTo({left:x,top:y,behavior:"instant"});};

// Keep existing notification controls; replace the daily list with grouped actions.
const previousRenderPlanner=renderPlanner;
renderPlanner=function(){
  const oldList=plannerRoot.querySelector('.focus-list');
  const viewKey=JSON.stringify([focusTab,workspaceQuery,workspaceQuick]);
  const keepPosition=oldList?.dataset.viewKey===viewKey;
  const oldTop=keepPosition?oldList.scrollTop:0;
  const pageX=window.scrollX,pageY=window.scrollY;
  const expanded=new Map(keepPosition?[...oldList.querySelectorAll('[data-focus-group]')].map(g=>[g.dataset.focusGroup,g.open]):[]);
  const anchor=keepPosition&&oldList.scrollHeight>oldList.clientHeight
    ? [...oldList.querySelectorAll('[data-action-id]')].find(row=>row.getClientRects().length&&row.getBoundingClientRect().bottom>oldList.getBoundingClientRect().top):null;
  const anchorId=anchor?.dataset.actionId;
  const anchorOffset=anchor?anchor.getBoundingClientRect().top-oldList.getBoundingClientRect().top:0;
  previousRenderPlanner();
  const all=WE.focus(allJobs(),DATA.actions,plannerState,plannerItems());
  const shown=all.filter(t=>t.rid?workspaceMatch(jobById(t.rid)||{}):WE.matches({name:t.title,note:t.detail},workspaceQuery,workspaceQuick));
  const active=shown.filter(t=>!t.done&&!(t.snoozeUntil>Date.now()));
  const aside=plannerRoot.querySelector('.planner-aside');aside.querySelector('.planner-stat').innerHTML=active.length+'<span style="font-size:12px;font-weight:400"> 件待处理</span>';aside.querySelector('p').textContent=`已完成 ${shown.filter(t=>t.done).length} 件 · 暂缓 ${shown.filter(t=>!t.done&&t.snoozeUntil>Date.now()).length} 件`;
  const visible=focusTab==='done'?shown.filter(t=>t.done):focusTab==='later'?shown.filter(t=>!t.done&&t.snoozeUntil>Date.now()):active;
  const head=plannerRoot.querySelector('.planner-head');
  head.innerHTML=`<div><div class="planner-eyebrow">TODAY'S FOCUS</div><h2>今日行动</h2><span class="sub">先处理紧急事项，再安排接下来的申请${workspaceActive()?' · 已应用搜索筛选':''}</span></div><div class="planner-actions"><span class="focus-total">${active.length}<small> 件待处理</small></span><button class="btn pri" data-planner="add" ${plannerReady?'':'disabled'}>＋ 添加待办</button></div>`;
  const groups=[['overdue','已逾期'],['today','今天'],['soon','未来 3 天']];
  const row=t=>`<article data-action-id="${esc(t.id)}" class="action-row ${t.done?'done':''}"><div class="action-icon ${t.group}">${t.kind==='截止提醒'?'↗':t.kind==='笔试 / 面试'?'◷':'✓'}</div><div class="action-main"><div class="task-meta"><span class="kind">${esc(t.kind)}</span><time>${esc(t.undated?'待确认时间':t.date+(t.time?' '+t.time:''))}</time></div><strong>${esc(t.title)}</strong><p>${esc(t.detail||'')}</p><div class="focus-tools">${t.rid?`<button class="btn" data-detail="${esc(t.rid)}">岗位详情</button>`:''}${!t.done&&t.kind==='截止提醒'&&t.rid?`<button class="btn pri" data-apply="${esc(t.rid)}" data-apply-task="${esc(t.id)}" ${LIVE&&!saveInFlight?'':'disabled'}>标记已投递</button>`:''}${(t.rid?actionLinks(jobById(t.rid)||{}):WE.links({note:t.detail})).map(l=>`<a class="btn" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)} ↗</a>`).join('')}<button class="btn" data-focus-done="${esc(t.id)}" data-undone="${t.done?'1':'0'}" ${plannerReady&&!plannerBusy&&!(t.done&&t.snapshot&&t.kind==='截止提醒')?'':'disabled'}>${t.done&&t.snapshot&&t.kind==='截止提醒'?'已确认投递':t.done?'撤销完成':t.kind==='截止提醒'?'忽略此提醒':t.kind==='待补材料'?'标记已补充':'标记完成'}</button>${!t.done?`<button class="btn subtle" data-snooze="${esc(t.id)}">1 小时后提醒</button>`:''}${t.snoozeUntil>Date.now()?`<button class="btn" data-resume="${esc(t.id)}">现在处理</button>`:''}${t.id.startsWith('manual:')?`<button class="btn subtle" data-delete="${esc(t.id)}">删除</button>`:''}</div></div></article>`;
  plannerRoot.querySelector('.focus-list').innerHTML=`<div class="focus-tabs">${[['active','待处理',active.length],['done','已完成',shown.filter(t=>t.done).length],['later','稍后提醒',shown.filter(t=>!t.done&&t.snoozeUntil>Date.now()).length]].map(([id,label,count])=>`<button class="btn ${focusTab===id?'selected':''}" data-focus-tab="${id}">${label} <span>${count}</span></button>`).join('')}</div>${groups.map(([id,label])=>{const list=visible.filter(t=>t.group===id);return list.length?`<details data-focus-group="${id}" class="focus-group ${id}" ${id==='soon'?'':'open'}><summary>${label}<span>${list.length} 项</span></summary>${list.map(row).join('')}</details>`:'';}).join('')||'<div class="planner-empty">这里暂时没有事项。可以添加下一步计划。</div>'}`;
  const list=plannerRoot.querySelector('.focus-list');
  list.dataset.viewKey=viewKey;
  list.querySelectorAll('[data-focus-group]').forEach(g=>{if(expanded.has(g.dataset.focusGroup))g.open=expanded.get(g.dataset.focusGroup);});
  list.scrollTop=oldTop;
  const restoredAnchor=anchorId?[...list.querySelectorAll('[data-action-id]')].find(row=>row.dataset.actionId===anchorId):null;
  if(restoredAnchor?.getClientRects().length) list.scrollTop+=restoredAnchor.getBoundingClientRect().top-list.getBoundingClientRect().top-anchorOffset;
  renderCalendar();
  window.scrollTo({left:pageX,top:pageY,behavior:'instant'});
};
plannerRoot.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.focusTab){focusTab=b.dataset.focusTab;renderPlanner();}
  if(b.dataset.focusDone)changePlanner({action:'mark',id:b.dataset.focusDone,done:b.dataset.undone!=='1',snoozeUntil:0});
  if(b.dataset.apply)confirmApplied(b.dataset.apply,b.dataset.applyTask);
});

function confirmApplied(id,taskId){
  const r=jobById(id);if(!r)return;
  plannerModal(`<div class="confirm-symbol">✓</div><h3>确认已完成投递？</h3><p class="sub">请确认已在招聘网站完成提交</p><div class="confirm-job"><strong>${esc(r.name)}</strong><p>${esc(r.post||'未填写岗位')} · ${esc((r.city||[]).join(' / '))}</p><span class="pill">${esc(r.status)}</span> → <span class="pill applied-status">已投递</span></div><form id="confirm-applied" class="planner-form"><label>投递日期<input name="apply_date" type="date" value="${WE.day(Date.now())}" required></label><p class="sub">确认后将更新该岗位状态，并完成对应投递待办。</p><div class="dialog-actions"><button type="button" class="btn" onclick="closeM()">取消</button><button class="btn pri" ${LIVE&&!saveInFlight?'':'disabled'}>确认已投递</button></div><p class="sub">仅更新当前岗位，其他岗位不受影响。</p><div id="planner-form-message" role="status"></div></form>`);
  $('confirm-applied').onsubmit=async e=>{
    e.preventDefault();if(saveInFlight||!LIVE)return;
    const date=new FormData(e.currentTarget).get('apply_date');closeM();
    const task=WE.focus(allJobs(),DATA.actions,plannerState,plannerItems()).find(t=>t.id===taskId);
    await commitWorkspace([{id,patch:{status:'已投递',apply_date:date},taskId,snapshot:task?{title:task.title,date:task.date,kind:task.kind,rid:id,detail:'已确认完成投递'}:undefined}]);
  };
}
async function commitWorkspace(operations){
  if(saveInFlight||!LIVE)return;
  saveInFlight=true;saveRevision++;
  const failed=[],warnings=[];let successful=0;
  const progress=()=>{scheduleSaveNoticeDismiss(false);saveNotice.textContent=`正在保存 ${successful+failed.length} / ${operations.length} 条岗位修改…`;};progress();
  try{
    for(const op of operations){
      try{
        const result=await plannerRequest('/api/sync',{rid:op.id,...op.patch});
        const base=[...R,...SUBS].find(r=>r.id===op.id);
        if(base){if(op.patch.status!==undefined)base.status=op.patch.status;if(op.patch.progress!==undefined)base.progress=op.patch.progress;if(op.patch.apply_date!==undefined)base.apply=op.patch.apply_date;}
        delete OVERRIDES[op.id];successful++;workspaceSelected.delete(op.id);
        if(result.warning)warnings.push(result.warning);
        if(op.taskId)try{const marked=await plannerRequest('/api/planner',{action:'mark',id:op.taskId,done:true,snoozeUntil:0,snapshot:op.snapshot});plannerState=marked.state;}catch(_){warnings.push('岗位已投递，但待办完成状态未保存');}
        if(session&&cloud)try{const cleared=await cloud.database.from('job_overrides').delete().eq('rid',op.id);if(cleared.error)warnings.push('旧云覆盖层未清理，请检查云端队列');}catch(_){warnings.push('旧云覆盖层未清理');}
      }catch(error){failed.push({...op,error:error.message});}
      progress();
    }
  }finally{saveInFlight=false;saveRevision++;renderAll();}
  saveNotice.innerHTML=`<div class="msg ${failed.length?'warn':'ok'}">已保存 ${successful} / ${operations.length} 条。${warnings.length?esc([...new Set(warnings)].join('；')):''}${failed.length?`<div>以下 ${failed.length} 条保存结果未确认，请核对飞书后重试：</div>${failed.map(op=>`<div>${esc(jobById(op.id)?.name||op.id)}：${esc(op.error)}</div>`).join('')}<button class="btn" id="retry-workspace">重试未确认项</button>`:''}</div>`;
  scheduleSaveNoticeDismiss(!failed.length&&!warnings.length);
  if($('retry-workspace'))$('retry-workspace').onclick=()=>commitWorkspace(failed);
}
function openBatch(){
  const jobs=[...workspaceSelected].map(jobById).filter(Boolean);if(!jobs.length)return;
  plannerModal(`<h3>批量修改 ${jobs.length} 条岗位记录</h3><p class="sub">只更新选择的字段。集团与子岗位按各自记录独立保存。</p><details class="batch-preview"><summary>查看本次选择的岗位</summary>${jobs.map(r=>`<p>${esc(r.name)} · ${esc(r.post||'')} · ${esc(r.status)}</p>`).join('')}</details><form class="planner-form" id="batch-form"><label>投递状态<select name="status"><option value="">保持不变</option>${STATUS_OPTS.map(s=>`<option>${esc(s)}</option>`).join('')}</select></label><label>投递日期（留空保持不变）<input type="date" name="apply_date"></label><label>进展更新方式<select name="progress_mode"><option value="keep">保持不变</option><option value="add">添加所选进展</option><option value="replace">替换为所选进展（未选则清空）</option></select></label><div class="progress-options">${PROG_OPTS.map(p=>`<label class="batch-check"><input type="checkbox" name="progress" value="${esc(p)}">${esc(p)}</label>`).join('')}</div><div class="dialog-actions"><button type="button" class="btn" onclick="closeM()">取消</button><button class="btn pri">确认批量保存</button></div><div id="planner-form-message" role="status"></div></form>`);
  $('batch-form').onsubmit=async e=>{
    e.preventDefault();if(saveInFlight||!LIVE)return;
    const f=new FormData(e.currentTarget),mode=f.get('progress_mode'),status=f.get('status'),date=f.get('apply_date'),progress=f.getAll('progress');
    if(!status&&!date&&mode==='keep'){$('planner-form-message').textContent='请至少选择一个要修改的字段。';return;}
    const ops=jobs.map(r=>({id:r.id,patch:{...(status?{status}:{}),...(date?{apply_date:date}:{}),...(mode==='keep'?{}:{progress:mode==='add'?[...new Set([...(jobById(r.id)?.progress||[]),...progress])]:progress})}}));
    closeM();await commitWorkspace(ops);
  };
}

function renderCalendar(){
  const events=WE.events(allJobs().filter(workspaceMatch),plannerState.manual);
  const first=calendarMode==='month'?calendarDate.slice(0,7)+'-01':calendarDate;
  const weekday=(new Date(first+'T12:00:00+08:00').getUTCDay()+6)%7;
  const start=WE.shift(first,-weekday),count=calendarMode==='month'?42:7;
  calendarRoot.innerHTML=`<div class="planner-head"><div><div class="planner-eyebrow">INTERVIEW CALENDAR</div><h2>笔面试日历</h2><p class="sub">${calendarDate.slice(0,7)} · 来自岗位笔面试时间和手动日程${workspaceActive()?' · 已应用筛选':''}</p></div><div class="planner-actions"><button class="btn" data-cal-view="month" aria-pressed="${calendarMode==='month'}">月历</button><button class="btn" data-cal-view="week" aria-pressed="${calendarMode==='week'}">周历</button><button class="btn" data-cal-step="-1" aria-label="上一${calendarMode==='month'?'月':'周'}">‹</button><button class="btn" data-cal-today>今天</button><button class="btn" data-cal-step="1" aria-label="下一${calendarMode==='month'?'月':'周'}">›</button><button class="btn pri" data-calendar-add>＋ 添加日程</button></div></div><div class="calendar-scroll"><div class="interview-grid">${['一','二','三','四','五','六','日'].map(d=>`<div class="calendar-weekday">周${d}</div>`).join('')}${Array.from({length:count},(_,i)=>{const date=WE.shift(start,i),list=events.filter(e=>e.date===date);return `<div class="calendar-cell ${date===WE.day(Date.now())?'is-today':''} ${date.slice(0,7)!==calendarDate.slice(0,7)?'outside':''}"><button class="calendar-day" data-calendar-day="${date}" aria-label="${date}，${list.length} 场安排">${Number(date.slice(-2))}</button>${list.slice(0,3).map(e=>`<button class="calendar-event ${e.conflict?'conflict':''}" data-calendar-day="${date}"><span>${esc(e.time||'时间待定')}${e.conflict?' · 时间冲突':''}</span>${esc(e.title)}</button>`).join('')}${list.length>3?`<button class="calendar-more" data-calendar-day="${date}">另有 ${list.length-3} 项</button>`:''}</div>`;}).join('')}</div></div><p class="sub calendar-note">点击日期查看当天全部安排。仅在明确开始时间相同或明确时间段重叠时提示冲突；未注明结束时间的安排仍需人工核对。</p>`;
}
calendarRoot.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.calView)calendarMode=b.dataset.calView;
  if(b.hasAttribute('data-cal-today'))calendarDate=WE.day(Date.now());
  if(b.dataset.calStep){const n=Number(b.dataset.calStep);if(calendarMode==='week')calendarDate=WE.shift(calendarDate,n*7);else {const d=new Date(calendarDate.slice(0,7)+'-01T12:00:00+08:00');d.setUTCMonth(d.getUTCMonth()+n);calendarDate=WE.day(d);}}
  if(b.dataset.calendarDay){openCalendarDay(b.dataset.calendarDay);return;}
  if(b.hasAttribute('data-calendar-add')){addPlannerTask();$('planner-add').elements.kind.value='笔试 / 面试';return;}
  renderCalendar();
});
function openCalendarDay(date){
  const events=WE.events(allJobs().filter(workspaceMatch),plannerState.manual).filter(e=>e.date===date);
  plannerModal(`<h3>${esc(date)} 的笔面试安排</h3><p class="sub">${events.length} 项 · 点击岗位可查看详情并编辑时间</p>${events.map(e=>`<article class="calendar-agenda"><span class="pill ${e.conflict?'w':''}">${esc(e.time||'时间待定')}${e.end?'—'+esc(e.end):''}${e.conflict?' · 时间冲突':''}</span><h4>${esc(e.title)}</h4><p>${esc(e.detail||'')}</p>${e.rid?`<button class="btn" data-detail="${esc(e.rid)}">查看岗位</button>`:`<button class="btn" data-manual-edit="${esc(e.id)}">编辑日程</button>`}</article>`).join('')||'<div class="planner-empty">当天暂无笔面试安排。</div>'}<button class="btn pri" id="add-on-day">＋ 添加当天日程</button>`);
  $('add-on-day').onclick=()=>{addPlannerTask();$('planner-add').elements.date.value=date;$('planner-add').elements.kind.value='笔试 / 面试';};
}
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-manual-edit]');if(!b)return;
  const t=plannerState.manual[b.dataset.manualEdit];if(!t)return;
  addPlannerTask();const form=$('planner-add');for(const key of ['title','kind','date','detail'])form.elements[key].value=t[key]||'';
  form.onsubmit=async event=>{event.preventDefault();const button=form.querySelector('button');button.disabled=true;try{const result=await plannerRequest('/api/planner',{action:'add',id:t.id,...Object.fromEntries(new FormData(form))});plannerState=result.state;closeM();renderPlanner();}catch(error){$('planner-form-message').textContent=error.message;button.disabled=false;}};
});

const originalOpenModal=openModal,originalPlannerModal=plannerModal,originalCloseM=closeM;
openModal=function(r){
  if(!r)return;workspaceReturnFocus=document.activeElement;currentRid=r.id;
  originalOpenModal(r);$('mask').classList.add('drawer-mode');$('modal').setAttribute('role','dialog');$('modal').setAttribute('aria-modal','true');$('modal').setAttribute('aria-label',r.name+' 岗位详情');
  $('modal').querySelector('.close').outerHTML='<button class="close" aria-label="关闭岗位详情" onclick="closeM()">×</button>';
  const links=actionLinks(r),section=document.createElement('section');section.className='detail-section';
  section.innerHTML=`<h4>常用入口</h4><div class="shortcut-list">${links.map(l=>`<a class="shortcut" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer"><strong>${esc(l.label)} ↗</strong><small>${esc(l.host)}</small></a>`).join('')||'<p class="sub">尚未填写链接，可在飞书的链接、笔试时间或备注字段补充。</p>'}</div><button class="btn" id="copy-job-info">复制岗位摘要</button><span class="sub" id="copy-result" role="status"></span>`;
  $('modal').querySelector('h3').after(section);
  $('copy-job-info').onclick=async()=>{try{await navigator.clipboard.writeText([r.name,r.post,'状态：'+r.status,'投递日期：'+(r.apply||'未填写'),r.exam,...links.map(l=>l.url)].filter(Boolean).join('\n'));$('copy-result').textContent=' 已复制';}catch(_){$('copy-result').textContent=' 复制失败，请手动选择文字复制';}};
  const kids=SUBS.map(view).filter(c=>c.parentId===r.id);if(kids.length){const el=document.createElement('section');el.className='detail-section';el.innerHTML=`<h4>独立岗位</h4>${kids.map(c=>`<button class="job-button" data-detail="${esc(c.id)}">${esc(c.name)} · ${esc(c.status)}</button>`).join('')}`;$('modal').append(el);}
  const timeline=document.createElement('section');timeline.className='detail-section';timeline.id='job-timeline';timeline.innerHTML='<h4>投递时间线</h4><p class="sub">正在读取保存记录…</p>';$('modal').append(timeline);
  renderJobTimeline(r,timeline);
  $('modal').querySelector('.close').focus();
};
plannerModal=function(html){workspaceReturnFocus=document.activeElement;$('mask').classList.remove('drawer-mode');originalPlannerModal(html);$('modal').setAttribute('role','dialog');$('modal').setAttribute('aria-modal','true');$('modal').setAttribute('aria-label',$('modal').querySelector('h3')?.textContent||'编辑');$('modal').querySelector('.close')?.focus();};
closeM=function(){originalCloseM();$('mask').classList.remove('drawer-mode');if(workspaceReturnFocus?.isConnected)workspaceReturnFocus.focus();};
async function renderJobTimeline(r,node){
  let logs=[],warning='';try{const result=await plannerRequest('/api/logs');logs=(result.logs||[]).filter(l=>l.rid===r.id);}catch(_){warning='保存历史暂不可用，仅展示岗位现有日期。';}
  if(!node.isConnected)return;
  const entries=[];
  if(r.apply)entries.push({date:r.apply,label:'记录的投递日期',detail:'来自岗位投递日期字段'});
  logs.forEach(l=>entries.push({date:l.created_at,label:'保存岗位修改',detail:Object.entries(l.fields||{}).map(([k,v])=>`${k}：${Array.isArray(v)?v.join('、')||'已清空':v==null?'已清空':typeof v==='number'&&/日期|截止/.test(k)?WE.day(v):v}`).join(' · ')}));
  entries.sort((a,b)=>b.date.localeCompare(a.date));
  node.innerHTML=`<h4>投递时间线</h4>${warning?`<p class="sub">${warning}</p>`:''}<ol class="application-timeline">${entries.map(e=>`<li><time>${esc(e.date.includes('T')?new Date(e.date).toLocaleString('zh-CN'):e.date)}</time><strong>${esc(e.label)}</strong><p>${esc(e.detail)}</p></li>`).join('')||'<li class="sub">暂无投递日期或保存记录。</li>'}</ol><p class="sub">历史仅包含已有投递日期和系统保留的保存记录，不代表完整招聘履历。</p>${r.exam?`<div class="planned-event"><h4>笔面试安排 · 计划信息</h4><p>${esc(r.exam)}</p></div>`:''}`;
}
// Keep keyboard focus inside the active dialog.
document.addEventListener('keydown',e=>{
  if(e.key!=='Tab'||!$('mask').classList.contains('on'))return;
  const nodes=[...$('modal').querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(n=>n.getClientRects().length);
  if(!nodes.length)return;const first=nodes[0],last=nodes[nodes.length-1];
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
});
window.addEventListener('beforeunload',event=>{if(saveInFlight){event.preventDefault();event.returnValue='';}});
todayTab.click();
renderAll();
