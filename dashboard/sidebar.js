/* Presentation only. Move existing controls without changing storage or API calls. */
(() => {
  const mobile=matchMedia('(max-width: 800px)'),wrap=document.querySelector('.wrap');
  document.body.classList.add('sidebar-layout');
  const paths={today:'M3 10 12 3l9 7v10H3Z M9 20v-7h6v7',calendar:'M4 5h16v16H4Z M8 3v5m8-5v5M4 10h16',board:'M3 4h5v16H3ZM10 4h5v11h-5ZM17 4h4v14h-4Z',sub:'M12 3v6M5 14v-5h14v5M2 14h6v7H2Zm7-11h6v5H9Zm7 11h6v7h-6Z',table:'M3 4h18v16H3ZM3 10h18M9 4v16',quality:'M5 3h11l3 3v8M5 3v18h7M8 8h6M8 12h5m3 6 2 2 4-5',act:'M12 3a9 9 0 1 0 9 9M12 7v5l4 2',log:'m4 16 12-12 4 4L8 20H4ZM14 6l4 4',menu:'M4 6h16M4 12h16M4 18h16',close:'m6 6 12 12M6 18 18 6',check:'m5 12 4 4L19 6',settings:'M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-8 0v6',backup:'M4 4h16v16H4ZM8 4v6h8V4M8 20v-6h8v6',collapse:'m14 6-6 6 6 6'};
  const icon=key=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[key]||paths.board}"/></svg>`;
  const names={today:'今日行动',calendar:'笔面试日历',board:'投递看板',sub:'集团与岗位',table:'明细表格',quality:'待补信息',act:'近期动作',log:'我的改动'};
  const sidebar=document.createElement('dialog');sidebar.id='app-sidebar';sidebar.setAttribute('aria-label','主导航');
  sidebar.innerHTML=`<div class="sidebar-brand"><span>${icon('calendar')}</span><strong>校招看板</strong><button type="button" id="sidebar-close" aria-label="关闭菜单">${icon('close')}</button></div><nav class="tabs sidebar-nav" aria-label="看板页面"></nav><div class="sidebar-bottom"><button class="sidebar-tool" id="sidebar-sync">${icon('check')}<span id="sidebar-sync-label">同步状态</span></button><div id="sidebar-read-time"></div><button class="sidebar-tool" id="sidebar-backup">${icon('backup')}<span>待办备份</span></button><details id="sidebar-account"><summary>${icon('settings')}<span>账号设置</span></summary></details><button class="sidebar-tool" id="sidebar-collapse">${icon('collapse')}<span>收起侧栏</span></button></div>`;
  document.body.prepend(sidebar);
  const nav=sidebar.querySelector('nav'),oldTabs=document.querySelector('.wrap .tabs');
  for(const [label,views] of [['工作台',['today','calendar']],['投递管理',['board','sub','table']],['信息核对',['quality','act','log']]]){
    const group=document.createElement('div');group.className='sidebar-group';const title=document.createElement('p');title.textContent=label;group.append(title);
    for(const view of views){const tab=oldTabs.querySelector(`[data-v="${view}"]`);tab.title=names[view];group.append(tab);}
    nav.append(group);
  }
  oldTabs.remove();
  const top=document.createElement('header');top.className='shell-topbar';
  top.innerHTML=`<div class="shell-heading"><button class="btn" id="sidebar-open" aria-label="打开菜单" aria-controls="app-sidebar" aria-expanded="false">${icon('menu')}</button><div><h1 id="shell-title">今日行动</h1><p id="shell-date"></p><p class="shell-subtitle">先处理紧急事项，让每一步都有记录。</p></div></div>`;
  wrap.prepend(top);top.append(searchRoot);
  const filters=document.createElement('details');filters.className='shell-filters';filters.innerHTML='<summary>筛选与显示设置</summary>';
  searchRoot.querySelector('.search-line').after(filters);
  filters.append(searchRoot.querySelector('.quick-filters'),searchRoot.querySelector('.display-settings'));
  searchRoot.querySelector('.search-line').append($('btn-refresh'));
  // Preserve the original account controls and their bound authentication handlers.
  $('sidebar-read-time').append($('synctime'));
  $('sidebar-account').append(document.querySelector('.abar'));
  $('meta').closest('.board-header').classList.add('hide');
  $('open-backups').hidden=true;
  const syncCenter=$('sync-center');syncCenter.classList.add('hide');top.after(syncCenter);
  const closeMobile=()=>{if(mobile.matches&&sidebar.open)sidebar.close();};
  $('sidebar-open').onclick=()=>{sidebar.showModal();$('sidebar-open').setAttribute('aria-expanded','true');};
  $('sidebar-close').onclick=closeMobile;
  sidebar.addEventListener('close',()=>{$('sidebar-open').setAttribute('aria-expanded','false');});
  sidebar.addEventListener('click',e=>{if(e.target===sidebar&&mobile.matches){const r=sidebar.getBoundingClientRect();if(e.clientX>r.right||e.clientY>r.bottom)closeMobile();}});
  const adapt=()=>{if(sidebar.open)sidebar.close();if(!mobile.matches)sidebar.show();};mobile.addEventListener('change',adapt);adapt();
  for(const [id,label] of [['sidebar-sync','查看同步状态'],['sidebar-backup','待办备份'],['sidebar-collapse','收起或展开侧栏']]){const el=$(id);el.setAttribute('aria-label',label);el.title=label;}
  $('sidebar-collapse').setAttribute('aria-expanded','true');
  $('sidebar-collapse').onclick=()=>{const collapsed=document.body.classList.toggle('sidebar-collapsed');$('sidebar-collapse').setAttribute('aria-expanded',String(!collapsed));};
  $('sidebar-backup').onclick=()=>{closeMobile();$('open-backups').click();};
  $('sidebar-sync').onclick=()=>{closeMobile();syncCenter.classList.remove('hide');syncCenter.open=true;syncCenter.scrollIntoView({block:'start',behavior:'smooth'});};
  $('sidebar-account').addEventListener('click',e=>{if(e.target.closest('button'))closeMobile();},true);
  const scrollPositions=new Map();let current='today';
  nav.addEventListener('click',e=>{
    const tab=e.target.closest('.tab');if(!tab)return;
    scrollPositions.set(current,window.scrollY);const next=tab.dataset.v;closeMobile();
    queueMicrotask(()=>{refreshShell();window.scrollTo({top:scrollPositions.get(next)||0,behavior:'instant'});});
  },true);
  document.addEventListener('click',e=>{const button=e.target.closest('[data-shell-view]');if(button)nav.querySelector(`[data-v="${button.dataset.shellView}"]`)?.click();});
  function refreshShell(){
    current=nav.querySelector('.tab.on')?.dataset.v||'today';$('shell-title').textContent=names[current]||'今日行动';
    $('shell-date').textContent=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(new Date());
    $('kpis').classList.toggle('hide',current!=='today');document.querySelector('.week-overview').classList.toggle('hide',current!=='today');
    const tasks=WE.focus(allJobs(),DATA.actions,plannerState,plannerItems()).filter(t=>t.rid?workspaceMatch(jobById(t.rid)||{}):WE.matches({name:t.title,note:t.detail},workspaceQuery,workspaceQuick));
    const active=tasks.filter(t=>!t.done&&!(t.snoozeUntil>Date.now()));
    const missing=DataQuality.inspect(allJobs()).filter(({record})=>workspaceMatch(record)).length;
    for(const tab of nav.querySelectorAll('.tab')){
      const view=tab.dataset.v,count=view==='today'?active.length:view==='quality'?missing:0;
      const html=icon(view)+`<span class="nav-label">${names[view]}</span>`+(count?`<span class="nav-count">${count}</span>`:'');
      if(tab.innerHTML!==html)tab.innerHTML=html;
      tab.setAttribute('aria-label',names[view]+(count?'，'+count+' 项':''));
      if(view===current)tab.setAttribute('aria-current','page');else tab.removeAttribute('aria-current');
    }
    const attention=syncEntries.length||syncStorageError;
    $('sidebar-sync-label').textContent=attention?'有待处理的保存':!LIVE?'尚未连接实时服务':'已连接飞书';
    $('sidebar-sync').classList.toggle('needs-attention',!!attention||!LIVE);
    if(attention)syncCenter.classList.remove('hide');
    const aside=plannerRoot.querySelector('.planner-aside');
    if(aside&&!aside.querySelector('.shell-attention')){
      const settings=document.createElement('details');settings.className='shell-reminders';settings.innerHTML='<summary>提醒设置</summary>';
      const body=document.createElement('div');while(aside.firstChild)body.append(aside.firstChild);settings.append(body);aside.append(settings);
      const card=document.createElement('section');card.className='shell-attention';card.innerHTML=`<h3>需要留意</h3><p>今天还有 <b>${active.filter(t=>t.date===WE.day(Date.now())).length}</b> 件待处理</p><p><b>${active.filter(t=>t.kind==='截止提醒').length}</b> 项截止提醒</p><p><b>${missing}</b> 条岗位信息待补齐</p><button class="btn" data-shell-view="quality">查看待补信息 →</button><h3 class="shell-shortcut-title">常用入口</h3><button class="sidebar-tool" data-shell-view="calendar">${icon('calendar')}日历安排 <span>›</span></button><button class="sidebar-tool" data-shell-view="board">${icon('board')}投递看板 <span>›</span></button>`;aside.prepend(card);
    }
  }
  const baseRender=renderAll;renderAll=function(){baseRender();refreshShell();};
  const basePlanner=renderPlanner;renderPlanner=function(){basePlanner();refreshShell();};
  const baseSync=renderSyncCenter;renderSyncCenter=function(){baseSync();refreshShell();};
  refreshShell();
})();
