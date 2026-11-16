/* Presentation only: reuse the existing job form, save pipeline and timeline. */
(() => {
  let context=null;
  const mask=$('mask'),modal=$('modal'),basePlannerModal=plannerModal,baseClose=closeM,baseEdit=openPlannerJob;
  function remember(){
    if(context&&mask.classList.contains('job-detail-mode'))return;
    const origin=document.activeElement,ancestors=[];
    for(let node=origin;node&&node!==document.body;node=node.parentElement)ancestors.push([node,node.scrollTop,node.scrollLeft]);
    context={origin,ancestors,x:scrollX,y:scrollY,detailId:null};
  }
  plannerModal=function(html){mask.classList.remove('job-detail-mode');basePlannerModal(html);};
  closeM=function(){
    const previous=context;context=null;
    if(previous)workspaceReturnFocus=previous.origin;
    baseClose();mask.classList.remove('job-detail-mode');
    if(previous){
      previous.origin?.isConnected&&previous.origin.focus({preventScroll:true});
      for(const [node,top,left]of previous.ancestors)if(node.isConnected){node.scrollTop=top;node.scrollLeft=left;}
      window.scrollTo(previous.x,previous.y);
    }
  };
  function frame(){
    mask.classList.remove('drawer-mode');mask.classList.add('job-detail-mode');modal.scrollTop=0;
    if(context)workspaceReturnFocus=context.origin;
  }
  function header(r,editing=false){
    return `<header class="job-dialog-header"><div><span class="job-dialog-eyebrow">${editing?'编辑岗位':'岗位详情'}</span><h3>${esc(r.name)}</h3><p>${esc(r.post||'未填写岗位')}<span class="job-dialog-meta">${esc([r.type,...(r.city||[])].filter(Boolean).join(' · '))}</span></p><div class="job-dialog-tags"><span class="pill">${esc(r.status||'未标注')}</span>${(r.progress||[]).map(p=>`<span class="pill"${progStyle(p)}>${esc(p)}</span>`).join('')}</div></div><button type="button" class="close" aria-label="关闭岗位详情" onclick="closeM()">×</button></header>`;
  }
  openModal=function(r){
    if(!r)return;remember();context.detailId=r.id;currentRid=r.id;
    const links=actionLinks(r),kids=SUBS.map(view).filter(c=>c.parentId===r.id);
    const related=kids.length?kids:(r.kids||[]);
    const schedule=ScheduleFields.read(r.exam||'')||WE.dates(r.exam||'')[0];
    const examLabel=schedule?[schedule.date,schedule.time,schedule.end?'—'+schedule.end:''].filter(Boolean).join(' '):r.exam?'查看时间通知':'暂未填写';
    const dates=[['apply_date','投递日期',r.apply||'暂未填写'],['key_date','报名截止',r.hasDl?r.key||'暂未填写':'暂未填写'],['exam','笔面试时间',examLabel]];
    plannerModal(`${header(r)}<div class="job-dialog-body"><div class="job-date-summary">${dates.map(([field,label,value])=>`<button type="button" class="job-date-item" data-edit-date="${field}" ${LIVE?'':'disabled'}><span>${label}</span><strong>${esc(value)}</strong><small>${LIVE?'点击修改':'连接服务后可编辑'}</small></button>`).join('')}</div><div class="job-entry-row"><div class="shortcut-list">${links.map(l=>`<a class="shortcut" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer"><strong>${esc(l.label)} ↗</strong><small>${esc(l.host)}</small></a>`).join('')}${LIVE&&feishuRecordHref(r.id)?`<a class="shortcut" href="${esc(feishuRecordHref(r.id))}" target="_blank" rel="noopener noreferrer"><strong>在飞书打开此记录 ↗</strong><small>飞书多维表格 · 对应岗位记录</small></a>`:''}</div>${!links.length?'<p class="sub">暂未填写投递链接，可在飞书对应字段补充。</p>':''}</div><div class="job-detail-tabs" role="tablist" aria-label="岗位信息"><button type="button" role="tab" id="job-tab-info" aria-controls="job-panel-info" aria-selected="true" data-job-tab="info">岗位详情</button><button type="button" role="tab" id="job-tab-history" aria-controls="job-panel-history" aria-selected="false" tabindex="-1" data-job-tab="history">投递时间线</button><button type="button" role="tab" id="job-tab-related" aria-controls="job-panel-related" aria-selected="false" tabindex="-1" data-job-tab="related">相关岗位 <span>${related.length}</span></button></div><section id="job-panel-info" role="tabpanel" aria-labelledby="job-tab-info">${r.exam?`<div class="job-exam-notice"><h4>笔面试通知</h4><p>${esc(r.exam)}</p></div>`:''}${r.comment?`<div class="job-exam-notice"><h4>我的备注</h4><p>${esc(r.comment)}</p></div>`:''}${r.note?renderNote(r.note):'<p class="job-empty">暂无补充说明，可通过投递官网查看岗位要求。</p>'}<button type="button" class="btn" id="copy-job-info">复制岗位摘要</button><span class="sub" id="copy-result" role="status"></span></section><section id="job-panel-history" role="tabpanel" aria-labelledby="job-tab-history" hidden><div id="job-timeline"><p class="sub">正在读取保存记录…</p></div></section><section id="job-panel-related" role="tabpanel" aria-labelledby="job-tab-related" hidden>${related.map(c=>`<article class="job-related-item">${c.id?`<button class="job-button" data-detail="${esc(c.id)}"><strong>${esc(c.name)}</strong><span>${esc(c.post||'')}</span></button>`:`<strong>${esc(c.name)}</strong><p>${esc(c.post||'')}</p>`}<span class="pill">${esc(c.status||'未标注')}</span>${c.id?feishuRecordButton(c.id):''}</article>`).join('')||'<p class="job-empty">暂无关联的独立岗位。</p>'}</section></div><footer class="job-dialog-footer"><span>${LIVE?'已连接飞书 · 修改后保存生效':'当前为只读快照'}</span><div><button type="button" class="btn" onclick="closeM()">关闭</button><button type="button" class="btn pri" id="job-detail-edit" ${LIVE?'':'disabled'}>编辑岗位</button></div></footer>`);
    // plannerModal adds its own close control; the fixed header provides the sole close icon.
    modal.querySelector(':scope > .close')?.remove();frame();modal.setAttribute('aria-label',r.name+' 岗位详情');
    $('job-detail-edit').onclick=()=>openPlannerJob(r.id);
    for(const button of modal.querySelectorAll('[data-edit-date]'))button.onclick=event=>{
      event.stopPropagation();
      const field=button.dataset.editDate;openPlannerJob(r.id);
      const input=$('planner-job')?.elements[field];if(input){input.focus({preventScroll:true});input.scrollIntoView({block:'center'});if(input.type==='date')input.click();}
    };
    const tabs=[...modal.querySelectorAll('[data-job-tab]')];
    const select=button=>{for(const tab of tabs){const active=tab===button;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;$('job-panel-'+tab.dataset.jobTab).hidden=!active;}};
    tabs.forEach((tab,i)=>{tab.onclick=()=>select(tab);tab.onkeydown=e=>{let next;if(e.key==='ArrowRight')next=(i+1)%tabs.length;if(e.key==='ArrowLeft')next=(i+tabs.length-1)%tabs.length;if(e.key==='Home')next=0;if(e.key==='End')next=tabs.length-1;if(next!==undefined){e.preventDefault();select(tabs[next]);tabs[next].focus();}};});
    $('copy-job-info').onclick=async()=>{const result=$('copy-result');try{await navigator.clipboard.writeText([r.name,r.post,'状态：'+r.status,'投递日期：'+(r.apply||'未填写'),r.exam,...links.map(l=>l.url)].filter(Boolean).join('\n'));result.textContent=' 已复制';}catch(_){result.textContent=' 复制失败，请手动选择文字复制';}};
    renderJobTimeline(r,$('job-timeline'));modal.querySelector('.close').focus({preventScroll:true});
  };
  openPlannerJob=function(id){
    remember();const backId=context.detailId,r=jobById(id);if(!r)return;
    window.closeDatePicker?.();baseEdit(id);const form=$('planner-job');if(!form)return;
    const save=form.querySelector('button.pri'),message=$('planner-form-message'),fields=document.createElement('div');fields.className='job-form-fields';
    for(const child of [...form.children])if(child!==save&&child!==message)fields.append(child);
    const footer=document.createElement('footer');footer.className='job-dialog-footer job-edit-footer';
    footer.innerHTML=`<div class="job-edit-message"></div><div><button type="button" class="btn" id="job-detail-back">${backId?'返回详情':'取消'}</button></div>`;
    footer.firstElementChild.append(message);footer.lastElementChild.append(save);form.append(fields,footer);
    modal.replaceChildren();modal.insertAdjacentHTML('afterbegin',header(r,true));modal.append(form);frame();modal.setAttribute('aria-label',r.name+' 编辑岗位');
    $('job-detail-back').onclick=()=>{window.closeDatePicker?.();if(backId)openModal(jobById(backId));else closeM();};
    modal.querySelector('.close').focus({preventScroll:true});
  };
})();
