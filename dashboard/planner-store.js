const fs = require('fs');
const path = require('path');
function createStore(file) {
  function read() { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { marks: {}, manual: {}, delivered: {} }; }
  function write(state) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = file + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(state), { mode: 0o600 });
    fs.renameSync(temp, file);
    return state;
  }
  function update(body) {
    if (!body || typeof body.id !== 'string' || body.id.length > 500 || !body.id || ['__proto__', 'constructor', 'prototype'].includes(body.id)) throw new Error('无效事项 ID');
    const state = read();
    if (body.action === 'mark') {
      if (typeof body.done !== 'boolean' || !Number.isFinite(body.snoozeUntil) || body.snoozeUntil < 0 || body.snoozeUntil > Date.now() + 7 * 86400000) throw new Error('无效处理状态');
      let snapshot = state.marks[body.id]?.snapshot;
      if (body.snapshot !== undefined) {
        const value = body.snapshot;
        if (!value || typeof value !== 'object' || Array.isArray(value)
          || !['title','date','kind','rid','detail'].every(k => typeof value[k] === 'string' && value[k].length <= 2000)
          || !/^\d{4}-\d{2}-\d{2}$/.test(value.date) || !/^rec[a-zA-Z0-9]+$/.test(value.rid)) throw new Error('无效事项摘要');
        snapshot = Object.fromEntries(['title','date','kind','rid','detail'].map(k => [k, value[k]]));
      }
      state.marks[body.id] = { done: body.done, snoozeUntil: body.snoozeUntil, ...(snapshot ? { snapshot } : {}) };
    } else if (body.action === 'add') {
      if (!body.id.startsWith('manual:') || typeof body.title !== 'string' || !body.title.trim() || body.title.length > 200 || !/^\d{4}-\d{2}-\d{2}$/.test(body.date || '') || !['待补材料', '笔试 / 面试', '其他待办'].includes(body.kind)) throw new Error('无效待办内容');
      if (!Number.isFinite(Date.parse(body.date)) || new Date(body.date).toISOString().slice(0, 10) !== body.date) throw new Error('无效日期');
      state.manual[body.id] = { id: body.id, title: body.title.trim(), kind: body.kind, date: body.date, detail: String(body.detail || '').slice(0, 1000) };
    } else if (body.action === 'delete' && body.id.startsWith('manual:')) { delete state.manual[body.id]; delete state.marks[body.id]; }
    else throw new Error('不支持的操作');
    return write(state);
  }
  function appendLog(entry) {
    const state = read();
    state.logs = [{ ...entry, id: require('crypto').randomUUID(), created_at: new Date().toISOString(), synced: true }, ...(state.logs || [])].slice(0, 500);
    write(state);
  }
  return { read, write, update, appendLog };
}
module.exports = { createStore };
