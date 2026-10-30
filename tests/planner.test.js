const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const E = require('../dashboard/planner-engine');
const { createStore } = require('../dashboard/planner-store');
const { createNotifier } = require('../dashboard/notifier');
const blank = () => ({ marks: {}, manual: {}, delivered: {} });
test('urgency sorts overdue, timed today, untimed today, tomorrow, later and unknown', () => {
  const now = Date.parse('2026-11-01T08:00:00+08:00'), state = blank();
  state.manual.old = { id: 'manual:old', title: '逾期', date: '2026-10-31' };
  const records = [
    { id: 'r3', name: '三天后', status: '待投递', key: '2026-11-04', hasDl: true },
    { id: 'r1', name: '明天', status: '待投递', key: '2026-11-02', hasDl: true },
    { id: 'r0', name: '今天未注明时刻', status: '待投递', key: '2026-11-01', hasDl: true },
    { id: 'rm', name: '时间未知', status: '已投递', note: '待补材料' }
  ];
  const actions = [{ name: '晚上', date: '2026-11-01', time: '19:00' }, { name: '上午', date: '2026-11-01', time: '09:00' }];
  const result = E.tasks(records, actions, state, now);
  assert.deepEqual(result.map(t => t.title), ['逾期', '上午', '晚上', '今天未注明时刻', '明天', '三天后', '时间未知']);
  assert.equal(result[0].urgent, true); assert.equal(result[1].urgency, '今天 09:00');
});
test('deadline stages, catchup, applied exclusions and separate job identities', () => {
  const records = ['rec1', 'rec2'].map(id => ({ id, name: '银行', status: '待投递', key: '2026-11-04', hasDl: true }));
  for (const [date, stage] of [['2026-11-01', 3], ['2026-11-02', 3], ['2026-11-03', 1], ['2026-11-04', 0]]) {
    const items = E.tasks(records, [], blank(), Date.parse(date + 'T04:00:00Z'));
    assert.equal(items.length, 2); assert.notEqual(items[0].id, items[1].id); assert.ok(items[0].id.endsWith(':' + stage));
  }
  assert.equal(E.tasks(records.map(r => ({ ...r, status: '已投递' })), [], blank(), Date.parse('2026-11-01')).length, 0);
  assert.equal(E.tasks(records, [], blank(), Date.parse('2026-11-05')).length, 0);
});
test('today exams, material markers, manual overdue and snooze expiry', () => {
  const now = Date.parse('2026-11-01T04:00:00Z'); const state = blank();
  state.manual.m = { id: 'm', title: '材料', date: '2026-10-30' };
  const items = E.tasks([{ id: 'r', name: '银行', status: '已投递', exam: '2026-11-01 14:00 面试', note: '待补材料' }], [], state, now);
  assert.equal(items.length, 3);
  assert.equal(E.active(items.map(t => ({ ...t, snoozeUntil: now + 1000 })), now).length, 0);
  assert.equal(E.active(items.map(t => ({ ...t, snoozeUntil: now + 1000 })), now + 2000).length, 3);
  assert.equal(E.active(items.map(t => ({ ...t, done: true })), now).length, 0);
});
test('task storage survives recreation and rejects invalid / prototype fields', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-'));
  try {
    const file = path.join(directory, 'state.json'), store = createStore(file);
    store.update({ action: 'add', id: 'manual:1', title: '补交材料', kind: '待补材料', date: '2026-11-01' });
    store.update({ action: 'mark', id: 'manual:1', done: true, snoozeUntil: 0 });
    assert.equal(createStore(file).read().marks['manual:1'].done, true);
    assert.equal(createStore(file).read().manual['manual:1'].title, '补交材料');
    assert.throws(() => store.update({ action: 'mark', id: '__proto__', done: true, snoozeUntil: 0 }));
    assert.throws(() => store.update({ action: 'add', id: 'manual:2', title: 'bad', kind: '其他待办', date: '2026-02-30' }));
  } finally { fs.rmSync(directory, { recursive: true }); }
});
test('Feishu retries failed sends, deduplicates successes across restarts, respects handled state', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'notify-')), original = global.fetch;
  try {
    const file = path.join(directory, 'notifications.json'), store = createStore(path.join(directory, 'state.json'));
    fs.writeFileSync(file, JSON.stringify({ webhook: 'https://open.feishu.cn/open-apis/bot/v2/hook/test', secret: 'test-secret' }));
    store.update({ action: 'add', id: 'manual:test', title: '测试', kind: '其他待办', date: E.day(Date.now()) });
    let calls = 0, fail = true;
    global.fetch = async (_, options) => { calls++; const body = JSON.parse(options.body); assert.ok(body.sign); return { ok: true, json: async () => ({ code: fail ? 19024 : 0, msg: 'mock' }) }; };
    const options = { file, store, pull: async () => ({ records: [], subs: [] }) }, notifier = createNotifier(options);
    await notifier.tick(); assert.equal(Object.keys(store.read().delivered).length, 0);
    fail = false; await notifier.tick(); assert.equal(calls, 2);
    await createNotifier(options).tick(); assert.equal(calls, 2);
    store.update({ action: 'mark', id: 'manual:test', done: true, snoozeUntil: 0 });
    await notifier.tick(); assert.equal(calls, 2);
  } finally { global.fetch = original; fs.rmSync(directory, { recursive: true }); }
});
