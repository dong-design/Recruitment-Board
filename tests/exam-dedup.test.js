// 展示层去重：同一场笔试被写进父子多条记录时只显示一张卡片
const { test } = require('node:test');
const assert = require('node:assert/strict');
const WE = require('../dashboard/workspace-engine');

const rec = (id, exam, extra = {}) => ({
  id, name: '成都农商银行', post: '研发', exam, status: '已投递',
  hasDl: false, key: '', city: [], type: '银行', progress: [], note: '', ...extra,
});
const EXAM = '在线笔试 2026-11-14 10:00-12:00';

test('父子三条相同笔试合并为一张卡片，且不再互相误报时间冲突', () => {
  const rows = [rec('recP', EXAM + '｜主记录'), rec('recA', EXAM + '｜第1志愿'), rec('recB', EXAM + '｜第2志愿')];
  const events = WE.events(rows);
  assert.equal(events.length, 1, '3 条记录应合并成 1 场考试');
  assert.equal(events[0].date, '2026-11-14');
  assert.equal(events[0].time, '10:00');
  assert.equal(events[0].conflict, false, '自己撞自己的假冲突必须消失');
  assert.deepEqual(events[0].mergedIds.length, 3);
});

test('合并后保留信息最全的明细，不丢考试入口/准考证', () => {
  const short = rec('recP', EXAM + '｜详见子记录');
  const full = rec('recA', EXAM + '｜主入口 https://exam.example.com｜备用入口 https://b.example.com｜准考证 123456');
  const events = WE.events([short, full]);
  assert.equal(events.length, 1);
  assert.ok(events[0].detail.includes('准考证 123456'), '应取信息最全的一条明细');
});

test('优先保留已标记完成的 id，防止已完成项复活', () => {
  const rows = [rec('recP', EXAM + '｜主记录'), rec('recA', EXAM + '｜子记录')];
  const markedId = 'exam:recA:2026-11-14';
  const marks = { [markedId]: { done: true, snoozeUntil: 0 } };
  const events = WE.events(rows, {}, marks);
  assert.equal(events.length, 1);
  assert.equal(events[0].id, markedId, '必须沿用用户点过完成的那个 id');

  const now = Date.parse('2026-11-14T08:00:00+08:00');
  const tasks = WE.focus(rows, [], { marks, manual: {} }, [], now);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].done, true, 'focus 里完成标记仍应命中');
});

test('不同开始时间不合并，真实冲突仍会提示', () => {
  const rows = [
    rec('recA', '笔试 2026-11-14 10:00-12:00｜A'),
    rec('recB', '面试 2026-11-14 10:30-11:30｜B'),
  ];
  const events = WE.events(rows);
  assert.equal(events.length, 2);
  assert.deepEqual(events.map(e => e.conflict), [true, true], '真时间冲突必须保留');
});

test('同公司同日期但不同公司名/不同日期不合并', () => {
  const rows = [
    rec('recA', EXAM, { name: '成都农商银行' }),
    rec('recB', EXAM, { name: '另一家银行' }),
    rec('recC', '笔试 2026-11-15 10:00-12:00', { name: '成都农商银行' }),
  ];
  assert.equal(WE.events(rows).length, 3);
});

test('历史已完成项通过合并别名仍被归档逻辑认作已完成', () => {
  const rows = [rec('recP', '笔试 2026-10-01 10:00-12:00｜主'), rec('recA', '笔试 2026-10-01 10:00-12:00｜子')];
  const markedId = 'exam:recA:2026-10-01';
  const marks = { [markedId]: { done: true, snoozeUntil: 0, snapshot: { title: '成都农商银行', date: '2026-10-01', kind: '笔试 / 面试', rid: 'recA', detail: 'done' } } };
  const now = Date.parse('2026-11-10T12:00:00+08:00');
  const tasks = WE.focus(rows, [], { marks, manual: {} }, [], now);
  assert.equal(tasks.length, 1, '别名不应额外生成一张已完成卡片');
  assert.equal(tasks[0].done, true);
});

test('手动日程与记录事件同场时也会合并', () => {
  const manual = { 'manual:1': { id: 'manual:1', title: '成都农商银行', kind: '笔试 / 面试', date: '2026-11-14', time: '10:00', detail: EXAM } };
  const events = WE.events([rec('recP', EXAM)], manual);
  assert.equal(events.length, 1);
});
