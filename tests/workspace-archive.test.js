// 历史事项自动归档：防止状态文件丢失时陈年笔试/截止日全部复活
const { test } = require('node:test');
const assert = require('node:assert/strict');
const WE = require('../dashboard/workspace-engine');

const NOW = Date.parse('2026-11-07T12:00:00+08:00');
const rec = (id, exam, extra = {}) => ({
  id, name: '单位' + id, post: '研发', exam, status: '已投递', hasDl: false, key: '',
  city: [], type: '央企国企', progress: [], note: '', ...extra,
});

test('超过 14 天且未完成的历史笔试不再进入待处理', () => {
  const tasks = WE.focus([rec('recOld', '2026-10-01 10:00'), rec('recRecent', '2026-11-02 10:00')], [], { marks: {}, manual: {} }, [], NOW);
  const ids = tasks.map(t => t.id);
  assert.ok(!ids.some(id => id.startsWith('exam:recOld')), '30 天前的笔试应被归档');
  assert.ok(ids.some(id => id.startsWith('exam:recRecent')), '14 天内的笔试仍应出现');
});

test('已完成的历史事项仍保留在已完成列表', () => {
  const old = rec('recOld', '2026-10-01 10:00');
  const id = 'exam:recOld:2026-10-01';
  const state = { marks: { [id]: { done: true, snoozeUntil: 0 } }, manual: {} };
  const tasks = WE.focus([old], [], state, [], NOW);
  const task = tasks.find(t => t.id === id);
  assert.equal(task?.done, true, '已完成的陈年笔试仍应可见');
});

test('状态文件丢失时，超过 14 天的历史截止日不会复活', () => {
  const r = rec('recDl', '', { status: '待投递', hasDl: true, key: '2026-10-02' });
  const tasks = WE.focus([r], [], { marks: {}, manual: {} }, [], NOW);
  assert.ok(!tasks.some(t => t.id.startsWith('deadline:recDl')), '陈年截止日应被归档');
});

test('未来的笔试/面试与日程节点不受归档影响', () => {
  const future = rec('recFut', '2026-11-09 15:00');
  const actions = [{ name: '未来节点', date: '2026-11-08', time: '09:00', tip: '' }];
  const tasks = WE.focus([future], actions, { marks: {}, manual: {} }, [], NOW);
  assert.ok(tasks.some(t => t.id.startsWith('exam:recFut')), '未来笔试应出现');
  assert.ok(tasks.some(t => t.id.startsWith('action:未来节点')), '未来日程节点应出现');
});

test('手动创建的待办不受归档影响', () => {
  const manual = { 'manual:1': { id: 'manual:1', title: '长期待办', kind: '其他待办', date: '2026-09-01', detail: '' } };
  const tasks = WE.focus([], [], { marks: {}, manual }, [], NOW);
  assert.equal(tasks.filter(t => t.id === 'manual:1').length, 1, '手动待办由用户创建，必须始终保留');
});
