const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const nativeFetch = global.fetch;
const fs = require('fs'), os = require('os'), path = require('path');
const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'board-server-'));
process.env.BOARD_PUBLIC_ORIGIN = 'https://board.example.com';
process.env.BOARD_PASSWORD = 'test-only-password-123456';
process.env.FEISHU_APP_ID = 'test-app';
process.env.FEISHU_APP_SECRET = 'test-secret';
process.env.FEISHU_APP_TOKEN = 'test-base';
process.env.FEISHU_TABLE_ID = 'test-table';
const { createServer, buildFields, transform } = require('../dashboard/server');
let server, base, writes = [], upstreamError = false;
let record = { record_id: 'recTest1', fields: { '公司名称': 'Test', '投递': '待投递', '进展': ['笔试'], '报名截止日': 1793376000000 } };
global.fetch = async (url, options = {}) => {
  assert.ok(url.startsWith('https://open.feishu.cn/open-apis/'));
  if (url.includes('tenant_access_token')) return { json: async () => ({ code: 0, tenant_access_token: 'mock', expire: 7200 }) };
  if (upstreamError) return { json: async () => ({ code: 999, msg: 'mock upstream failure' }) };
  if (options.method === 'PUT') {
    const fields = JSON.parse(options.body).fields;
    writes.push(fields);
    await new Promise(resolve => setTimeout(resolve, fields['投递'] === '已投递' ? 30 : 1));
    Object.assign(record.fields, fields);
    return { json: async () => ({ code: 0, data: { record } }) };
  }
  return { json: async () => ({ code: 0, data: { items: [record] } }) };
};
const auth = 'Basic ' + Buffer.from('owner:' + process.env.BOARD_PASSWORD).toString('base64');
const request = (path, options = {}) => nativeFetch(base + path, { ...options, headers: { Authorization: auth, ...options.headers } });
const sync = body => request('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
before(async () => { server = createServer({ stateFile: path.join(testDirectory, 'state.json'), notificationFile: path.join(testDirectory, 'notifications.json') }); await new Promise(r => server.listen(0, '127.0.0.1', r)); base = 'http://127.0.0.1:' + server.address().port; });
after(async () => { global.fetch = nativeFetch; await new Promise(r => server.close(r)); for (const file of fs.readdirSync(testDirectory)) fs.unlinkSync(path.join(testDirectory, file)); fs.rmdirSync(testDirectory); });
test('starts and health checks configuration', async () => {
  const data = await (await nativeFetch(base + '/api/health')).json();
  assert.equal(data.configured, true); assert.equal(data.authConfigured, true);
});
test('anonymous page, pull and write are denied; credentials and source cannot be downloaded', async () => {
  for (const path of ['/', '/index.html', '/api/pull', '/api/sync']) assert.equal((await nativeFetch(base + path)).status, 401);
  for (const path of ['/server.js', '/.feishu-app.json', '/.board-auth.json', '/package.json']) assert.equal((await request(path)).status, 404);
  assert.equal((await request('/api/pull', { headers: { Authorization: 'Basic bad' } })).status, 401);
  assert.equal((await request('/api/pull', { headers: { Origin: 'https://evil.invalid' } })).status, 403);
});
test('pull, write and read-back, including clearing arrays and dates', async () => {
  assert.equal((await (await request('/api/pull')).json()).records.length, 1);
  assert.equal((await sync({ rid: 'recTest1', status: '已投递', progress: [], key_date: null })).status, 200);
  const data = await (await request('/api/pull')).json();
  assert.equal(data.records[0].status, '已投递');
  assert.deepEqual(data.records[0].progress, []);
  assert.equal(data.records[0].hasDl, false);
  assert.equal(data.records[0].key, null);
});
test('invalid input is rejected before upstream writes', async () => {
  const count = writes.length;
  for (const body of [null, [], { rid: '../evil', status: 'Offer' }, { rid: 'recTest1', status: '???' }, { rid: 'recTest1', progress: '笔试' }, { rid: 'recTest1', key_date: '2026-02-30' }, { rid: 'recTest1', key_date: 42 }, { rid: 'recTest1' }, { rid: 'recTest1', status: 'Offer', table_id: 'other' }]) {
    assert.equal((await sync(body)).status, 400, JSON.stringify(body));
  }
  assert.equal(writes.length, count);
  assert.equal((await request('/api/sync', { method: 'POST', body: '{}' })).status, 415);
  assert.equal((await request('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 400);
  assert.equal((await request('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ' '.repeat(17000) })).status, 413);
});
test('writes to the same record are serialized', async () => {
  await Promise.all([sync({ rid: 'recTest1', status: '已投递' }), sync({ rid: 'recTest1', status: 'Offer' })]);
  assert.equal(record.fields['投递'], 'Offer');
});
test('upstream failures are reported and the next write can recover', async () => {
  upstreamError = true;
  assert.equal((await sync({ rid: 'recTest1', status: 'Offer' })).status, 502);
  assert.equal((await request('/api/pull')).status, 502);
  upstreamError = false;
  assert.equal((await sync({ rid: 'recTest1', status: '待投递' })).status, 200);
});
test('authenticated local logs record successful writes without a cloud login', async () => {
  assert.equal((await nativeFetch(base + '/api/logs')).status, 401);
  const before = (await (await request('/api/logs')).json()).logs.length;
  upstreamError = true;
  await sync({ rid: 'recTest1', status: 'Offer' });
  upstreamError = false;
  assert.equal((await (await request('/api/logs')).json()).logs.length, before);
  await sync({ rid: 'recTest1', status: 'Offer' });
  const logs = (await (await request('/api/logs')).json()).logs;
  assert.equal(logs.length, before + 1); assert.equal(logs[0].fields['投递'], 'Offer'); assert.equal(logs[0].synced, true);
});
test('valid leap day and explicit date removal', () => {
  assert.ok(Number.isFinite(buildFields({ rid: 'recTest1', key_date: '2028-02-29' })['报名截止日']));
  assert.equal(buildFields({ rid: 'recTest1', key_date: null })['报名截止日'], null);
});
test('child record IDs, parent links and dates are preserved for independent editing', () => {
  const data = transform([
    { record_id: 'recParent', fields: { '公司名称': '银行集团' } },
    { record_id: 'recChild', fields: { '公司名称': '分行', '父记录': [{ record_ids: ['recParent'] }], '投递': '已投递', '投递日期': 1793289600000, '报名截止日': 1793376000000 } }
  ]);
  assert.equal(data.subs[0].id, 'recChild'); assert.equal(data.subs[0].parentId, 'recParent');
  assert.equal(data.subs[0].hasDl, true); assert.ok(data.subs[0].apply);
  const fields = buildFields({ rid: 'recChild', apply_date: '2026-10-30', exam: '2026-11-01 14:00 面试' });
  assert.equal(fields['投递日期'], 1793289600000); assert.equal(fields['笔试时间'], '2026-11-01 14:00 面试');
  assert.throws(() => buildFields({ rid: 'recChild', apply_date: '2026-02-30' }));
});

test('configured public origin survives proxy host rewriting; other origins remain denied', async () => {
  assert.equal((await request('/api/pull', { headers: { Origin: 'https://board.example.com' } })).status, 200);
  for (const origin of ['https://evil.invalid', 'https://board.example.com.evil.invalid', 'null']) {
    assert.equal((await request('/api/pull', { headers: { Origin: origin, 'X-Forwarded-Host': 'board.example.com' } })).status, 403);
  }
});
