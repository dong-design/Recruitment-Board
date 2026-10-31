const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { createNotifier } = require('../dashboard/notifier');

test('private bot sends to configured recipient, reports rejection, and keeps identity server-side', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'private-bot-'));
  const file = path.join(dir, 'notifications.json'), original = global.fetch;
  try {
    fs.writeFileSync(file, JSON.stringify({ mode: 'app', receiveIdType: 'email', receiveId: 'owner@example.com' }));
    let calls = 0, fail = false;
    global.fetch = async (url, options) => {
      calls++;
      assert.equal(url, 'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=email');
      assert.equal(options.headers.Authorization, 'Bearer fake-token');
      const body = JSON.parse(options.body);
      assert.equal(body.receive_id, 'owner@example.com');
      assert.match(JSON.parse(body.content).text, /测试消息/);
      assert.ok(body.uuid);
      return { ok: true, json: async () => fail ? { code: 99991672, msg: 'permission denied' } : { code: 0, data: { message_id: 'om_test' } } };
    };
    const notifier = createNotifier({ file, getToken: async () => 'fake-token' });
    assert.equal(notifier.status().configured, true);
    assert.equal(notifier.status().mode, 'app');
    assert.equal(JSON.stringify(notifier.status()).includes('owner@example.com'), false);
    assert.deepEqual(await notifier.test(), { messageId: 'om_test' });
    assert.ok(notifier.status().lastSent);
    assert.throws(() => notifier.configure({ webhook: 'https://open.feishu.cn/open-apis/bot/v2/hook/test' }));
    fail = true;
    await assert.rejects(notifier.test(), /99991672/);
    assert.match(notifier.status().lastError, /permission denied/);
    fs.writeFileSync(file, JSON.stringify({ mode: 'app', receiveIdType: 'chat_id', receiveId: 'oc_other' }));
    assert.equal(notifier.status().configured, false);
    await assert.rejects(notifier.test(), /接收人/);
    assert.equal(calls, 2);
  } finally { global.fetch = original; fs.rmSync(dir, { recursive: true, force: true }); }
});
