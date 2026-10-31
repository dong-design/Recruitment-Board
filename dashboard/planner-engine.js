(function (root) {
  const day = value => new Date(value).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
  const difference = (a, b) => Math.round((Date.parse(a + 'T00:00:00+08:00') - Date.parse(b + 'T00:00:00+08:00')) / 86400000);
  function timing(task, now) {
    const match = String(task.time || task.detail || '').match(/(?:^|\D)([01]?\d|2[0-3])[:：]([0-5]\d)(?!\d)/);
    const time = match ? `${match[1].padStart(2, '0')}:${match[2]}` : '';
    const dueAt = task.undated ? Infinity : Date.parse(task.date + 'T' + (time || '23:59') + ':00+08:00');
    const days = difference(task.date, day(now));
    const overdue = Number.isFinite(dueAt) && dueAt < now;
    const urgency = task.undated ? '待确认时间' : overdue ? '已到期，优先处理' : days === 0 ? (time ? `今天 ${time}` : '今天 · 未注明时刻') : days === 1 ? '明天' : `${days} 天后`;
    return { ...task, dueAt, urgency, urgent: overdue || (Number.isFinite(dueAt) && dueAt - now <= 2 * 3600000) };
  }
  const compare = (a, b) => Number(!!a.done) - Number(!!b.done) || a.dueAt - b.dueAt || a.priority - b.priority || a.title.localeCompare(b.title);
  function tasks(records, actions, state, now = Date.now()) {
    const today = day(now), list = [];
    for (const r of records) {
      if (['挂了', '已截止', 'Offer', '实习offer'].includes(r.status)) continue;
      const name = [r.parent, r.name, r.post].filter(Boolean).join(' · ');
      if (r.hasDl && r.key && r.status === '待投递') {
        const left = difference(r.key, today);
        if (left >= 0 && left <= 3) {
          const stage = left >= 2 ? 3 : left;
          list.push({ id: `deadline:${r.id}:${r.key}:${stage}`, rid: r.id, title: name, kind: '截止提醒', date: r.key, detail: left === 0 ? '今天截止，请完成投递' : `${left} 天后截止 · 尚未投递`, priority: left === 0 ? 0 : 2 });
        }
      }
      const exam = String(r.exam || '').match(/20\d{2}[-/]\d{1,2}[-/]\d{1,2}/);
      if (exam) {
        const parts = exam[0].split(/[-/]/), date = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
        if (date === today) list.push({ id: `exam:${r.id}:${date}`, rid: r.id, title: name, kind: '笔试 / 面试', date, detail: r.exam, priority: 0 });
      }
      if (/待补材料|待补充材料|需补交|待上传材料/.test(r.note || '')) list.push({ id: `material:${r.id}`, rid: r.id, title: name, kind: '待补材料', date: today, undated: true, detail: '来自备注中的待补材料标记，请核对要求', priority: 1 });
    }
    for (const a of actions || []) if (a.date === today) list.push({ id: `action:${a.name}:${a.date}:${a.time || ''}`, title: a.name, kind: '日程提醒', date: a.date, time: a.time, detail: [a.time, a.tip].filter(Boolean).join(' · '), priority: 0 });
    for (const t of Object.values(state.manual || {})) if (t.date <= today) list.push({ ...t, priority: 1, detail: t.date < today ? `逾期事项 · ${t.date} ${t.detail || ''}` : t.detail });
    return list.map(t => timing({ ...t, ...(state.marks?.[t.id] || {}) }, now)).sort(compare);
  }
  const active = (items, now = Date.now()) => items.filter(t => !t.done && !(t.snoozeUntil > now));
  const api = { day, difference, tasks, active };
  if (typeof module !== 'undefined') module.exports = api;
  else root.PlannerEngine = api;
})(globalThis);
