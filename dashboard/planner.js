let plannerState = { marks: {}, manual: {}, delivered: {} }, plannerReady = false, plannerBusy = false;
let plannerChannel = { configured: false, lastError: '', lastSent: null }, showHandled = false;
const plannerRoot = document.createElement('section');
plannerRoot.className = 'card'; plannerRoot.id = 'daily-planner';
$('kpis').after(plannerRoot);
const groupRoot = document.createElement('section');
groupRoot.className = 'card'; groupRoot.id = 'job-groups';
$('v-sub').prepend(groupRoot);
function plannerRecords() { return [...V(), ...SUBS.map(view)].filter(r => r.id); }
function plannerItems() { return PlannerEngine.tasks(plannerRecords(), DATA.actions, plannerState); }
async function plannerRequest(url, body) {
  const response = await fetch(url + APIQ(), { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(25000) });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || '请求失败');
  return result;
}
async function loadPlanner() {
  try { const result = await plannerRequest('/api/planner'); plannerState = result.state; plannerChannel = result.channel; plannerReady = true; }
  catch (_) { plannerReady = false; }
  renderPlanner();
}
function renderPlanner() {
  const jobSubmit = document.querySelector('#planner-job button');
  if (jobSubmit && !saveInFlight) {
    jobSubmit.disabled = !LIVE;
    if (LIVE && $('planner-form-message')?.textContent.includes('当前为快照')) $('planner-form-message').textContent = '';
  }
  const items = plannerItems(), active = PlannerEngine.active(items), done = items.filter(t => t.done).length;
  const future = Object.values(plannerState.manual).filter(t => t.date > PlannerEngine.day(Date.now())).map(t => ({ ...t, ...(plannerState.marks[t.id] || {}), detail: '计划日期：' + t.date + ' · ' + (t.detail || '') }));
  const visible = showHandled ? [...items, ...future] : active;
  const notificationState = !('Notification' in window) ? '当前浏览器不支持系统通知' : Notification.permission === 'granted' ? '系统通知已授权 · 保持页面打开' : '系统通知尚未授权';
  plannerRoot.innerHTML = `<div class="planner-head"><div><div class="planner-eyebrow">YOUR DAILY FOCUS</div><h2>今天该做什么</h2><span class="sub">${PlannerEngine.day(Date.now())} · 按时间紧急程度排序 · 已到期和临近事项优先</span></div><div class="planner-actions"><button class="btn" data-planner="handled">${showHandled ? '只看待处理' : '查看已处理 / 稍后提醒'}</button><button class="btn pri" data-planner="add" ${plannerReady ? '' : 'disabled'}>＋ 添加待办</button></div></div>
    <div class="planner-layout"><div class="focus-list">${visible.length ? visible.map(t => `<div class="focus-row ${t.done ? 'done' : ''}"><input type="checkbox" data-task="${esc(t.id)}" ${t.done ? 'checked' : ''} ${plannerReady && !plannerBusy ? '' : 'disabled'} aria-label="完成 ${esc(t.title)}"><div class="focus-body"><div class="task-meta"><span class="kind">${esc(t.kind)}</span>${t.urgency ? `<span class="urgency ${t.urgent ? 'hot' : ''}">${esc(t.urgency)}</span>` : ''}</div><strong>${esc(t.title)}</strong><span class="sub">${esc(t.detail || '')}</span>${t.snoozeUntil > Date.now() ? `<div class="sub">稍后提醒：${new Date(t.snoozeUntil).toLocaleString('zh-CN')}</div>` : ''}<div class="focus-tools">${t.rid ? `<button class="btn" data-job="${esc(t.rid)}">岗位详情</button>` : ''}<button class="btn" data-snooze="${esc(t.id)}" ${plannerReady && !plannerBusy ? '' : 'disabled'}>1 小时后提醒</button>${t.snoozeUntil > Date.now() ? `<button class="btn" data-resume="${esc(t.id)}">现在处理</button>` : ''}${t.id.startsWith('manual:') ? `<button class="btn" data-delete="${esc(t.id)}">删除</button>` : ''}</div></div></div>`).join('') : '<div class="planner-empty">今天的待处理事项已清空。<br>可以检查岗位进度，或添加下一步计划。</div>'}</div>
    <aside class="planner-aside"><h3>留出时间，不错过机会</h3><div class="planner-stat">${active.length}<span style="font-size:13px;font-weight:400"> 件待处理</span></div><p>已完成 ${done} 件 · 暂缓 ${items.filter(t => !t.done && t.snoozeUntil > Date.now()).length} 件</p><p>未投递岗位在截止前 3 天、1 天和当天提醒。错过提前 3 天的提醒时，会在下次打开时补上。</p><p>${esc(notificationState)}</p><button class="btn" data-planner="notify">开启系统通知</button>${plannerChannel.mode === 'app' ? '<p>私聊机器人：秋招看板同步</p>' : '<p><button class="btn" data-planner="configure">配置飞书提醒</button></p>'}<p>飞书：${plannerChannel.configured ? (plannerChannel.lastError ? '发送异常：' + esc(plannerChannel.lastError) : '已配置 · 服务运行时自动检查') : '待配置接收人 / Webhook'}</p>${plannerChannel.configured ? '<button class="btn" data-planner="test">发送飞书测试消息</button>' : ''}<p>${plannerReady ? '完成和稍后提醒状态已保存到看板服务。' : '未连接看板服务，当前只读，无法保存处理状态。'}<br>笔试时间需含完整日期；面试和补材料可手动添加。</p></aside></div><div id="planner-message" class="planner-message" role="status"></div>`;
  renderGroups();
  notifyBrowser(active);
}
function renderGroups() {
  const children = SUBS.filter(r => r.id).map(view).filter(r => typeof workspaceMatch !== 'function' || workspaceMatch(r)), parents = R.filter(r => children.some(c => c.parentId === r.id));
  groupRoot.innerHTML = `<div class="planner-head"><div><div class="planner-eyebrow">APPLICATIONS</div><h2>集团与独立岗位</h2><div class="sub">每条飞书子记录独立跟踪；同一岗位列表中的不同职位需在飞书拆成独立记录。</div></div></div><div class="group-grid">${parents.map(parent => {
    const jobs = children.filter(r => r.parentId === parent.id), applied = jobs.filter(r => r.status === '已投递').length, offers = jobs.filter(r => /offer/i.test(r.status)).length;
    return `<details class="group-tile" open><summary>${esc(parent.name)}</summary><div class="sub">${jobs.length} 个岗位 · 已投 ${applied} · Offer ${offers}</div>${jobs.map(r => `<button class="job-button" data-job="${esc(r.id)}"><strong>${esc(r.name)}</strong><div>${esc(r.post || '未填写岗位')}</div><span class="sub">${esc(r.status || '未标注')} · 投递 ${esc(r.apply || '未填写')}<br>${r.hasDl ? '截止 ' + esc(r.key) : '未填截止日'}</span></button>`).join('')}</details>`;
  }).join('') || '<div class="planner-empty">暂无关联子岗位。飞书中为每个岗位创建记录，并设置父记录。</div>'}</div>`;
  // The group card reflects child progress without rewriting its own application status.
  document.querySelectorAll('#cols .it').forEach(card => {
    card.querySelector('.group-summary')?.remove();
    const jobs = children.filter(c => c.parentId === card.dataset.id);
    if (jobs.length) {
      const line = document.createElement('div'); line.className = 'sub group-summary';
      line.textContent = `岗位汇总：${jobs.length} 个 · 已投 ${jobs.filter(j => j.status === '已投递').length} · Offer ${jobs.filter(j => /offer/i.test(j.status)).length}`;
      card.append(line);
    }
  });
}
function plannerMessage(text, error = false) { const node = $('planner-message'); if (node) { node.textContent = text; node.classList.toggle('error', error); } }
async function changePlanner(body) {
  if (plannerBusy || !plannerReady) return;
  plannerBusy = true;
  let message = '';
  try { const result = await plannerRequest('/api/planner', body); plannerState = result.state; }
  catch (error) { message = '未保存：' + error.message; }
  finally { plannerBusy = false; renderPlanner(); if (message) plannerMessage(message, true); }
}
function plannerModal(html) {
  currentRid = null;
  $('modal').innerHTML = '<button class="close" aria-label="关闭" onclick="closeM()">×</button>' + html;
  $('mask').classList.add('on'); document.body.classList.add('modal-open');
}
function addPlannerTask() {
  plannerModal(`<h3>添加下一步事项</h3><form class="planner-form" id="planner-add"><label>事项<input name="title" required maxlength="200" placeholder="例如：提交成绩单 / 一面准备"></label><label>类型<select name="kind"><option>待补材料</option><option>笔试 / 面试</option><option>其他待办</option></select></label><label>日期<input type="date" name="date" required value="${PlannerEngine.day(Date.now())}"></label><label>时间和说明<textarea name="detail" maxlength="1000" placeholder="例如 14:00 视频面试，准备项目介绍"></textarea></label><button class="btn pri">保存待办</button><div class="sub" id="planner-form-message"></div></form>`);
  $('planner-add').onsubmit = async event => {
    event.preventDefault(); const form = event.currentTarget, button = form.querySelector('button'); button.disabled = true;
    try { const result = await plannerRequest('/api/planner', { action: 'add', id: 'manual:' + crypto.randomUUID(), ...Object.fromEntries(new FormData(form)) }); plannerState = result.state; closeM(); renderPlanner(); }
    catch (error) { $('planner-form-message').textContent = error.message; button.disabled = false; }
  };
}
function openPlannerJob(id) {
  const r = plannerRecords().find(r => r.id === id); if (!r) return;
  plannerModal(`<h3>${esc(r.parent ? r.parent + ' · ' : '')}${esc(r.name)}</h3><div class="sub">${esc(r.post || '未填写岗位')} · 独立记录</div><form id="planner-job" class="planner-form"><label>投递状态<select name="status">${STATUS_OPTS.map(s => `<option ${s === r.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label><fieldset class="progress-picker"><legend>进展 <span>可选多个，点击切换</span></legend><div class="progress-options">${PROG_OPTS.map((p, i) => `<label class="progress-option"><input type="checkbox" name="progress" value="${esc(p)}" ${r.progress?.includes(p) ? 'checked' : ''}><span><i>${['AI','测','笔','1','2','3','✓'][i]}</i>${esc(p)}<b aria-hidden="true">✓</b></span></label>`).join('')}</div></fieldset><div class="date-field-row"><label>投递日期<input type="date" name="apply_date" value="${esc(r.apply || '')}"></label><label>报名截止日<input type="date" name="key_date" value="${esc(r.hasDl ? r.key : '')}"></label></div><label>笔试 / 面试时间<textarea name="exam" placeholder="2026-11-01 14:00 面试" maxlength="500">${esc(r.exam || '')}</textarea></label><div class="form-footnote">状态与时间将同步到当前岗位的飞书记录；选好日期后点击保存。</div><button class="btn pri" ${LIVE ? '' : 'disabled'}>保存到飞书</button><div class="sub" id="planner-form-message">${LIVE ? '' : '当前为快照，连接服务后可编辑。'}</div></form>`);
  $('planner-job').onsubmit = event => {
    event.preventDefault();
    if (saveInFlight) { $('planner-form-message').textContent = '上一笔修改正在同步，请稍后保存。'; return; }
    const patch = Object.fromEntries(new FormData(event.currentTarget));
    patch.progress = new FormData(event.currentTarget).getAll('progress');
    patch.apply_date ||= null; patch.key_date ||= null;
    startJobSave(id, patch);
  };
}
let jobSaveState = null;
const saveNotice = document.createElement('div');
saveNotice.id = 'job-save-notice'; saveNotice.setAttribute('role', 'status');
$('cmsg').after(saveNotice);
let saveNoticeTimer = null;
function scheduleSaveNoticeDismiss(success){
  clearTimeout(saveNoticeTimer);
  if (success) { const content = saveNotice.innerHTML; saveNoticeTimer = setTimeout(() => { if (saveNotice.innerHTML === content) saveNotice.replaceChildren(); }, 5000); }
}
function showJobSave(operation, phase, message, warning = false){
  if (jobSaveState !== operation) return;
  operation.phase = phase;
  saveNotice.innerHTML = `<div class="msg ${phase === 'failed' ? 'err' : phase === 'saved' ? 'ok' : 'warn'}">${esc(message)}${phase === 'failed' ? ' <button class="btn" id="retry-job-save">重试这次修改</button>' : ''}</div>`;
  scheduleSaveNoticeDismiss(phase === 'saved' && !warning);
  const retry = $('retry-job-save');
  if (retry) retry.onclick = () => {
    if (saveInFlight) return;
    startJobSave(operation.id, operation.patch);
  };
}
function startJobSave(id, patch){
  if (saveInFlight) return;
  const base = [...R, ...SUBS].find(x => x.id === id);
  if (!base) return;
  const previous = { status: base.status, progress: [...(base.progress || [])], apply: base.apply, key: base.key, hasDl: base.hasDl, exam: base.exam };
  const oldOverride = OVERRIDES[id];
  const oldValue = JSON.stringify(previous);
  const operation = { id, patch: { ...patch, progress: [...patch.progress] }, name: base.name, phase: 'pending' };
  jobSaveState = operation;
  saveInFlight = true; saveRevision++;
  delete OVERRIDES[id];
  Object.assign(base, { status: patch.status, progress: [...patch.progress], apply: patch.apply_date, key: patch.key_date, hasDl: !!patch.key_date, exam: patch.exam });
  closeM(); renderAll();
  showJobSave(operation, 'pending', '界面已更新，正在同步飞书：' + base.name);
  // Do not await from the form event: the modal closes before any network work completes.
  void (async () => {
    let succeeded = false;
    try {
      const saved = await plannerRequest('/api/sync', { rid: id, ...patch });
      succeeded = true;
      showJobSave(operation, 'saved', '已同步飞书：' + base.name + (saved.warning ? '；' + saved.warning : ''), !!saved.warning);
      // Optional cloud history must never turn a successful Feishu write into a failed save.
      if (session && cloud) {
        try {
          const cleared = await cloud.database.from('job_overrides').delete().eq('rid', id);
          const logged = await cloud.database.from('job_log').insert({ rid: id, name: base.name, field: '岗位状态/时间', old_value: oldValue, new_value: `${patch.status} / ${patch.apply_date || '—'}`, synced: true });
          if (cleared.error || logged.error) throw new Error('云日志未更新');
        } catch (_) { showJobSave(operation, 'saved', '岗位已同步飞书；云日志或旧覆盖层清理失败，请核对待处理队列。', true); }
      }
    } catch (error) {
      if (!succeeded) {
        Object.assign(base, previous);
        if (oldOverride !== undefined) OVERRIDES[id] = oldOverride;
        renderAll();
        showJobSave(operation, 'failed', '同步未确认，界面已恢复，修改内容保留供重试：' + base.name + '（' + error.message + '）');
      }
    } finally {
      saveInFlight = false; saveRevision++;
    }
  })();
}
window.addEventListener('beforeunload', event => {
  if (jobSaveState?.phase === 'pending') { event.preventDefault(); event.returnValue = ''; }
});

plannerRoot.addEventListener('change', event => { if (event.target.dataset.task) changePlanner({ action: 'mark', id: event.target.dataset.task, done: event.target.checked, snoozeUntil: 0 }); });
async function plannerClick(event) {
  const button = event.target.closest('button'); if (!button) return;
  if (button.dataset.job) return openPlannerJob(button.dataset.job);
  if (button.dataset.snooze) return changePlanner({ action: 'mark', id: button.dataset.snooze, done: false, snoozeUntil: Date.now() + 3600000 });
  if (button.dataset.resume) return changePlanner({ action: 'mark', id: button.dataset.resume, done: false, snoozeUntil: 0 });
  if (button.dataset.delete) return changePlanner({ action: 'delete', id: button.dataset.delete });
  if (button.dataset.planner === 'handled') { showHandled = !showHandled; renderPlanner(); }
  if (button.dataset.planner === 'add') addPlannerTask();
  if (button.dataset.planner === 'configure') {
    plannerModal(`<h3>配置飞书提醒</h3><form id="planner-notifications" class="planner-form"><label>群自定义机器人 Webhook<input name="webhook" type="password" required autocomplete="off" placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/…"></label><label>签名密钥（未启用签名时留空）<input name="secret" type="password" autocomplete="off"></label><div class="sub">保存后，服务运行期间每分钟检查并发送到该机器人所在群。密钥仅保存在服务端；本次填写将覆盖旧配置。</div><button class="btn pri">保存并启用</button><div id="planner-form-message" class="sub"></div></form>`);
    $('planner-notifications').onsubmit = async event => {
      event.preventDefault(); const form = event.currentTarget, submit = form.querySelector('button'); submit.disabled = true;
      try { const result = await plannerRequest('/api/notifications/config', Object.fromEntries(new FormData(form))); plannerChannel = result.channel; closeM(); renderPlanner(); }
      catch (error) { $('planner-form-message').textContent = error.message; submit.disabled = false; }
    };
  }
  if (button.dataset.planner === 'notify') {
    if (!('Notification' in window)) return plannerMessage('当前浏览器不支持系统通知。', true);
    await Notification.requestPermission(); renderPlanner();
  }
  if (button.dataset.planner === 'test') {
    button.disabled = true;
    try { await plannerRequest('/api/notifications/test', {}); plannerMessage('飞书测试消息发送成功。'); }
    catch (error) { plannerMessage(error.message, true); }
    button.disabled = false;
  }
}
plannerRoot.addEventListener('click', plannerClick); groupRoot.addEventListener('click', plannerClick);
function notifyBrowser(items) {
  if (!plannerReady || !LIVE || !('Notification' in window) || Notification.permission !== 'granted') return;
  for (const task of items) {
    const key = 'recruit-notice:' + task.id + ':' + (task.snoozeUntil || 0);
    try { if (localStorage.getItem(key)) continue; new Notification(task.kind + ' · ' + task.title, { body: task.detail, tag: key }); localStorage.setItem(key, 'sent'); }
    catch (_) { break; }
  }
}
loadPlanner();
setInterval(() => { TODAY.setTime(Date.now()); TODAY.setHours(0, 0, 0, 0); loadPlanner(); }, 60000);
