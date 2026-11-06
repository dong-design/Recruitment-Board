// 运行时状态目录外置与一次性迁移（与线上生产版同构，Basic Auth 本地版只迁移 2 类文件）
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const server = require('../dashboard/server');

function tempPair() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'board-runtime-'));
  const from = path.join(base, 'deploy'), to = path.join(base, 'runtime');
  fs.mkdirSync(from); fs.mkdirSync(to);
  return { base, from, to };
}
function cleanup(base) { fs.rmSync(base, { recursive: true, force: true }); }

test('运行时目录不在部署目录内，且 health 报告 runtime 模式', async () => {
  assert.notEqual(path.resolve(server.RUNTIME_DIR), path.resolve(path.join(__dirname, '..', 'dashboard')));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'board-health-'));
  const app = server.createServer({
    stateFile: path.join(dir, 'state.json'),
    notificationFile: path.join(dir, 'notifications.json'),
  });
  await new Promise(r => app.listen(0, '127.0.0.1', r));
  try {
    const res = await fetch('http://127.0.0.1:' + app.address().port + '/api/health');
    assert.equal(res.status, 200);
    assert.equal((await res.json()).runtime, 'external');
  } finally { await new Promise(r => app.close(r)); cleanup(dir); }
});

test('一次性迁移把状态与备份搬到外部目录，内容零丢失', () => {
  const { base, from, to } = tempPair();
  try {
    const state = { marks: { 'exam:recSample1:2026-10-18': { done: true, snoozeUntil: 0 } }, manual: {}, delivered: {} };
    fs.writeFileSync(path.join(from, '.planner-state.json'), JSON.stringify(state));
    fs.writeFileSync(path.join(from, '.notifications.json'), '{"delivered":{}}');
    fs.mkdirSync(path.join(from, '.planner-state.json.backups'));
    fs.writeFileSync(path.join(from, '.planner-state.json.backups', '1793642872316-abc.json'), JSON.stringify(state));
    fs.writeFileSync(path.join(from, '.planner-actions.json'), '[]');

    server.migrateRuntimeState(from, to);

    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(to, '.planner-state.json'), 'utf8')), state);
    assert.equal(fs.readFileSync(path.join(to, '.notifications.json'), 'utf8'), '{"delivered":{}}');
    assert.equal(fs.existsSync(path.join(to, '.planner-state.json.backups', '1793642872316-abc.json')), true);
    assert.equal(fs.existsSync(path.join(from, '.planner-state.json')), false);
    assert.equal(fs.existsSync(path.join(from, '.planner-actions.json')), true, '日程配置必须留在部署目录');
  } finally { cleanup(base); }
});

test('外部目录已有新数据时绝不覆盖，也不删除旧文件', () => {
  const { base, from, to } = tempPair();
  try {
    const old = { marks: { old: { done: true } }, manual: {}, delivered: {} };
    const live = { marks: { live: { done: true } }, manual: {}, delivered: {} };
    fs.writeFileSync(path.join(from, '.planner-state.json'), JSON.stringify(old));
    fs.writeFileSync(path.join(to, '.planner-state.json'), JSON.stringify(live));
    server.migrateRuntimeState(from, to);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(to, '.planner-state.json'), 'utf8')), live);
    assert.equal(fs.existsSync(path.join(from, '.planner-state.json')), true);
  } finally { cleanup(base); }
});

test('迁移幂等，且 from 与 to 相同时不动任何文件', () => {
  const { base, from, to } = tempPair();
  try {
    const state = { marks: {}, manual: {}, delivered: {} };
    fs.writeFileSync(path.join(from, '.planner-state.json'), JSON.stringify(state));
    server.migrateRuntimeState(from, from);
    assert.equal(fs.existsSync(path.join(from, '.planner-state.json')), true, '同目录不应搬动任何文件');
    server.migrateRuntimeState(from, to);
    server.migrateRuntimeState(from, to);
    assert.equal(fs.readdirSync(to).length, 1);
  } finally { cleanup(base); }
});
