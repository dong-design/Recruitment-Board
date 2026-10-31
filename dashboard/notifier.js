const fs = require('fs');
const crypto = require('crypto');
const Engine = require('./planner-engine');
function createNotifier({ file, store, pull, actions = () => [], getToken }) {
  // lastSent 落盘：进程被平台回收后仍能显示最近一次发送时间（内存态会丢，文件不会）
  const readSent = () => { try { const v = store.read().lastSent; return typeof v === 'string' ? v : null; } catch (_) { return null; } };
  const persistSent = value => { try { const s = store.read(); s.lastSent = value; store.write(s); } catch (_) { /* 落盘失败不影响发送 */ } };
  let busy = false, lastError = '', lastSent = readSent();
  const markSent = () => { lastSent = new Date().toISOString(); persistSent(lastSent); };
  const config = () => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  const validRecipient = cfg => ['open_id', 'email'].includes(cfg.receiveIdType) && typeof cfg.receiveId === 'string' && (cfg.receiveIdType === 'open_id' ? /^ou_[a-zA-Z0-9]+$/.test(cfg.receiveId) : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cfg.receiveId));
  const status = () => { try { const cfg = config(); return { configured: cfg.mode === 'app' ? validRecipient(cfg) && typeof getToken === 'function' : !!cfg.webhook, mode: cfg.mode === 'app' ? 'app' : 'webhook', lastError, lastSent }; } catch (_) { return { configured: false, lastError: '消息配置文件格式错误', lastSent }; } };
  function configure(value) {
    if (config().mode === 'app') throw new Error('私聊机器人接收人由服务端配置管理');
    if (!value || !/^https:\/\/open\.feishu\.cn\/open-apis\/bot\/v2\/hook\/[a-zA-Z0-9-]+$/.test(value.webhook || '')) throw new Error('请填写飞书自定义机器人的完整 Webhook 地址');
    if (value.secret && (typeof value.secret !== 'string' || value.secret.length > 200)) throw new Error('无效签名密钥');
    fs.writeFileSync(file, JSON.stringify({ webhook: value.webhook, secret: value.secret || '' }), { mode: 0o600 });
    lastError = '';
  }
  async function send(text) {
    const cfg = config();
    if (cfg.mode === 'app') {
      if (!validRecipient(cfg) || typeof getToken !== 'function') throw new Error('请配置私聊接收人和飞书应用凭证');
      const token = await getToken();
      const response = await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=' + cfg.receiveIdType, {
        method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ receive_id: cfg.receiveId, msg_type: 'text', content: JSON.stringify({ text }), uuid: crypto.randomUUID() }),
        signal: AbortSignal.timeout(15000)
      });
      const result = await response.json();
      if (!response.ok || result.code !== 0 || !result.data?.message_id) throw new Error('飞书私聊发送失败（' + (result.code || response.status) + '）：' + (result.msg || '未返回消息 ID'));
      markSent(); lastError = '';
      return { messageId: result.data.message_id };
    }
    if (!/^https:\/\/open\.feishu\.cn\/open-apis\/bot\/v2\/hook\/[a-zA-Z0-9-]+$/.test(cfg.webhook || '')) throw new Error('请配置有效的飞书自定义机器人 Webhook');
    const body = { msg_type: 'text', content: { text } };
    if (cfg.secret) {
      body.timestamp = Math.floor(Date.now() / 1000).toString();
      body.sign = crypto.createHmac('sha256', body.timestamp + '\n' + cfg.secret).update('').digest('base64');
    }
    const response = await fetch(cfg.webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    const result = await response.json();
    if (!response.ok || (result.code ?? result.StatusCode) !== 0) throw new Error(result.msg || result.StatusMessage || '飞书发送失败');
    markSent(); lastError = '';
  }
  async function tick() {
    if (busy || !status().configured) return;
    busy = true;
    try {
      const data = await pull(), state = store.read();
      const tasks = Engine.active(Engine.tasks([...data.records, ...data.subs], actions(), state));
      for (const task of tasks) {
        const key = task.id + ':' + (task.snoozeUntil || 0);
        const current = store.read();
        if (current.delivered[key] || current.marks[task.id]?.done || current.marks[task.id]?.snoozeUntil > Date.now()) continue;
        await send(`校招提醒｜${task.kind}\n${task.title}\n${task.detail || task.date}\n请在看板中标记已处理或稍后提醒。`);
        const latest = store.read(); latest.delivered[key] = Date.now(); store.write(latest);
      }
    } catch (error) { lastError = error.message; }
    finally { busy = false; }
  }
  return { status, tick, configure, test: async () => { try { return await send('校招提醒｜测试消息：飞书提醒通道连接成功。'); } catch (error) { lastError = error.message; throw error; } } };
}
module.exports = { createNotifier };
