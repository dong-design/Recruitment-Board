// 秋招进度看板 —— 带同步后端的服务
// 静态托管 index.html，并提供：
//   GET  /api/pull  拉取飞书多维表格最新记录（前端打开即最新）
//   POST /api/sync  把前端的一次改动立即写回飞书（保存即同步）
//   GET  /api/health 健康检查
const http = require('http');
const fs = require('fs');
const path = require('path');

// Read only known server settings; explicit environment variables take precedence.
for (const file of [path.join(__dirname, '.env'), path.join(__dirname, '..', '.env'), path.join(__dirname, '..', '.feishu_app.env')]) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(FEISHU_APP_ID|FEISHU_APP_SECRET|FEISHU_APP_TOKEN|FEISHU_TABLE_ID|BOARD_USERNAME|BOARD_PASSWORD|BOARD_PUBLIC_ORIGIN|PORT|HOST)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) {
      let value = match[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      process.env[match[1]] = value;
    }
  }
}
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
// Explicit public origin supports reverse proxies without trusting forwarded headers.
const PUBLIC_ORIGIN = process.env.BOARD_PUBLIC_ORIGIN || '';
if (PUBLIC_ORIGIN && (!/^https?:\/\//.test(PUBLIC_ORIGIN) || new URL(PUBLIC_ORIGIN).origin !== PUBLIC_ORIGIN)) throw new Error('BOARD_PUBLIC_ORIGIN 必须是完整来源，例如 https://board.example.com，不带路径或末尾斜杠');
// 凭证来源优先级：环境变量 > 工作区 .feishu_app.env > dashboard/.feishu-app.json
// 密钥只存在于服务端，不进前端、不进日志
function loadCredentials() {
  let id = process.env.FEISHU_APP_ID || '';
  let secret = process.env.FEISHU_APP_SECRET || '';
  const candidates = [
    path.join(ROOT, '..', '.feishu_app.env'),
    path.join(ROOT, '.feishu-app.json'),
  ];
  for (const f of candidates) {
    if (id && secret) break;
    if (!fs.existsSync(f)) continue;
    try {
      const raw = fs.readFileSync(f, 'utf8').trim();
      if (f.endsWith('.json')) {
        const j = JSON.parse(raw);
        id = id || j.app_id || j.FEISHU_APP_ID || '';
        secret = secret || j.app_secret || j.FEISHU_APP_SECRET || '';
      } else {
        raw.split(/\r?\n/).forEach(line => {
          const m = line.match(/^\s*(FEISHU_APP_ID|FEISHU_APP_SECRET)\s*=\s*(.+?)\s*$/);
          if (!m) return;
          if (m[1] === 'FEISHU_APP_ID') id = id || m[2];
          else secret = secret || m[2];
        });
      }
    } catch (e) { /* 忽略读取失败，回退到环境变量 */ }
  }
  return { id, secret };
}

const CRED = loadCredentials();
const APP_ID = CRED.id;
const APP_SECRET = CRED.secret;
const localConfig = (() => {
  const f = path.join(ROOT, '.feishu-app.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
})();
const APP_TOKEN = process.env.FEISHU_APP_TOKEN || localConfig.app_token || '';
const TABLE_ID = process.env.FEISHU_TABLE_ID || localConfig.table_id || '';
const authFile = path.join(ROOT, '.board-auth.json');
const authConfig = fs.existsSync(authFile) ? JSON.parse(fs.readFileSync(authFile, 'utf8')) : {};
const USERNAME = process.env.BOARD_USERNAME || authConfig.username || 'owner';
const PASSWORD = process.env.BOARD_PASSWORD || authConfig.password || '';
const crypto = require('crypto');
const equal = (a, b) => crypto.timingSafeEqual(
  crypto.createHash('sha256').update(a).digest(), crypto.createHash('sha256').update(b).digest());
function authorize(req, res) {
  // Basic 认证开关：部署平台注入 PORT 且其网关不透传 Authorization 头，线上默认关闭（页面公开只读、编辑走云登录）；
  // 本地调试默认开启。可用 BOARD_AUTH=on/off 显式覆盖。
  const authEnabled = process.env.BOARD_AUTH
    ? process.env.BOARD_AUTH !== 'off'
    : !process.env.PORT;
  if (!authEnabled) return true;
  if (PASSWORD.length < 16) {
    send(res, 503, { ok: false, error: '请配置至少 16 位的 BOARD_PASSWORD' });
    return false;
  }
  const header = req.headers.authorization || '';
  const supplied = /^Basic /i.test(header) ? Buffer.from(header.slice(6), 'base64').toString('utf8') : '';
  if (!equal(supplied, USERNAME + ':' + PASSWORD)) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Recruit Board", charset="UTF-8"');
    send(res, 401, { ok: false, error: '需要看板账号认证' });
    return false;
  }
  return true;
}
const API = 'https://open.feishu.cn/open-apis';

let cached = { token: '', exp: 0 };

async function getToken() {
  if (cached.token && Date.now() < cached.exp) return cached.token;
  if (!APP_ID || !APP_SECRET) throw new Error('飞书应用凭证未配置');
  const r = await fetch(API + '/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET }),
  });
  const j = await r.json();
  if (j.code !== 0) throw new Error('获取 tenant_access_token 失败: ' + (j.msg || j.code));
  cached = { token: j.tenant_access_token, exp: Date.now() + Math.max(0, (j.expire || 7200) - 300) * 1000 };
  return cached.token;
}

async function api(pathname, opts = {}) {
  if (!APP_TOKEN || !TABLE_ID) throw new Error('飞书表格坐标未配置');
  const t = await getToken();
  const r = await fetch(API + pathname, Object.assign({ signal: AbortSignal.timeout(15000) }, opts, {
    headers: Object.assign({ Authorization: 'Bearer ' + t, 'Content-Type': 'application/json; charset=utf-8' }, opts.headers || {}),
  }));
  return r.json();
}

const dayStr = ms => new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
const toMs = s => Date.parse(s + 'T00:00:00+08:00');

function normDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return dayStr(v);
  const m = String(v).match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function pickLink(v) {
  if (!v) return '';
  const m = String(v).match(/https?:\/\/[^\s)\]】]+/);
  return m ? m[0] : '';
}

function parentId(r) {
  const p = r.fields && r.fields['父记录'] && r.fields['父记录'][0];
  if (!p) return null;
  return typeof p === 'string' ? p : (p.record_ids?.[0] || p.record_id || p.id || null);
}

function transform(rows) {
  const byId = {};
  rows.forEach(r => { byId[r.record_id] = r; });
  const kids = {}, subs = [];
  rows.forEach(r => {
    const pid = parentId(r);
    if (!pid) return;
    const parent = byId[pid] || {};
    const pf = parent.fields || {};
    const f = r.fields || {};
    const name = (f['公司名称'] || '').toString();
    (kids[pid] = kids[pid] || []).push({ name, post: f['岗位'] || '', status: one(f['投递']) });
    subs.push({
      id: r.record_id, parentId: pid, hasDl: !!normDate(f['报名截止日']), apply: normDate(f['投递日期']), kids: [],
      name, parent: (pf['公司名称'] || '').toString(), type: one(f['单位类型']), city: f['城市'] || [],
      post: f['岗位'] || '', status: one(f['投递']), progress: f['进展'] || [],
      key: normDate(f['报名截止日']) || normDate(f['最新日期']), exam: f['笔试时间'] || '',
      note: f['备注'] || '', link: pickLink(f['链接']),
    });
  });

  const recs = rows.filter(r => !parentId(r)).map(r => {
    const f = r.fields || {};
    return {
      id: r.record_id,
      name: (f['公司名称'] || '(未命名)').toString(),
      type: one(f['单位类型']),
      city: f['城市'] || [],
      post: f['岗位'] || '',
      status: one(f['投递']) || '未标注',
      progress: f['进展'] || [],
      key: normDate(f['报名截止日']) || normDate(f['最新日期']),
      hasDl: !!normDate(f['报名截止日']),
      apply: normDate(f['投递日期']),
      exam: f['笔试时间'] || '',
      note: f['备注'] || '',
      link: pickLink(f['链接']),
      kids: kids[r.record_id] || [],
    };
  });
  recs.sort((a, b) => (a.key || '9999').localeCompare(b.key || '9999') || a.name.localeCompare(b.name));
  subs.sort((a, b) => a.parent.localeCompare(b.parent) || a.name.localeCompare(b.name));
  return { records: recs, subs };
}

function one(v) {
  if (Array.isArray(v)) return v[0] || '';
  return v || '';
}

async function pullAll() {
  let pageToken = '', rows = [], guard = 0;
  do {
    const q = `/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records?page_size=200${pageToken ? '&page_token=' + encodeURIComponent(pageToken) : ''}`;
    const j = await api(q);
    if (j.code !== 0) throw new Error('读取飞书失败: ' + (j.msg || j.code));
    rows = rows.concat((j.data && j.data.items) || []);
    pageToken = (j.data && j.data.page_token) || '';
  } while (pageToken && ++guard < 10);
  if (pageToken) throw new Error('记录超过分页上限，拒绝返回不完整数据');
  return transform(rows);
}

function buildFields(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new Error('请求必须是对象');
  if (!/^rec[a-zA-Z0-9]+$/.test(b.rid || '')) throw new Error('无效的记录 ID');
  const allowed = ['rid', 'status', 'progress', 'key_date', 'comment', 'apply_date', 'exam'];
  if (Object.keys(b).some(k => !allowed.includes(k))) throw new Error('包含不支持的字段');
  if (b.status !== undefined && !['待投递','已投递','已截止','挂了','Offer','实习offer'].includes(b.status)) throw new Error('无效的投递状态');
  if (b.progress !== undefined && (!Array.isArray(b.progress) || b.progress.length > 7 || b.progress.some(p => !['ai面','测评','笔试','一面','二面','三面','体检'].includes(p)))) throw new Error('无效的进展');
  if (b.key_date != null && b.key_date !== '' && (typeof b.key_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.key_date) || !Number.isFinite(toMs(b.key_date)) || dayStr(toMs(b.key_date)) !== b.key_date)) throw new Error('无效的截止日期');
  if (b.apply_date != null && (typeof b.apply_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.apply_date) || !Number.isFinite(toMs(b.apply_date)) || dayStr(toMs(b.apply_date)) !== b.apply_date)) throw new Error('无效投递日期');
  if (b.exam !== undefined && (typeof b.exam !== 'string' || b.exam.length > 500)) throw new Error('无效考试时间');
  if (b.comment != null && (typeof b.comment !== 'string' || b.comment.length > 2000)) throw new Error('无效的备注');
  if (!['status','progress','key_date','apply_date','exam'].some(k => Object.hasOwn(b, k))) throw new Error('没有可同步的字段');
  const f = {};
  if (b.apply_date !== undefined) f['投递日期'] = b.apply_date ? toMs(b.apply_date) : null;
  if (b.exam !== undefined) f['笔试时间'] = b.exam;
  if (b.status !== undefined) f['投递'] = b.status;
  if (b.progress !== undefined) f['进展'] = b.progress;
  if (b.key_date !== undefined) f['报名截止日'] = b.key_date ? toMs(b.key_date) : null;
  return f;
}

async function writeRecord(rid, fields) {
  let before = null;
  try {
    const previous = await api(`/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records/${rid}`);
    if (previous.code === 0 && previous.data?.record?.fields) before = previous.data.record.fields;
  } catch (_) { /* A missing audit baseline must not prevent saving. */ }
  const j = await api(`/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records/${rid}`, {
    method: 'PUT',
    body: JSON.stringify({ fields }),
  });
  if (j.code !== 0) throw new Error('写入飞书失败: ' + (j.msg || j.code));
  const canonical = value => Array.isArray(value) ? [...value].sort() : value == null || value === '' ? null : value;
  const changes = Object.entries(fields).filter(([key,value]) => !before || JSON.stringify(canonical(before[key])) !== JSON.stringify(canonical(value)))
    .map(([field,after]) => ({ field, before: before ? (before[field] ?? null) : null, after, beforeKnown: !!before }));
  return { ...j.data, changes };
}

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function serveStatic(req, res, urlPath) {
  if (!['/', '/index.html'].includes(urlPath)) { res.writeHead(404); return res.end('not found'); }
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  // 安全：隐藏文件（含凭证文件）与 node_modules 一律不对外提供
  const segs = rel.split(/[\\/]/);
  if (rel.startsWith('.') || segs.some(s => s.startsWith('.')) || segs[0] === 'node_modules') {
    res.writeHead(403); return res.end('forbidden');
  }
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    const ext = path.extname(file).toLowerCase();
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
    // HTML 不缓存，避免改版后用户浏览器还停在旧页面
    const cc = ext === '.html' ? 'no-cache, must-revalidate' : 'public, max-age=300';
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': cc });
    res.end(buf);
  });
}

// A per-record queue prevents concurrent writes from overtaking one another.
const writes = new Map();
function enqueueWrite(rid, fields) {
  const prior = writes.get(rid) || Promise.resolve();
  const next = prior.catch(() => {}).then(() => writeRecord(rid, fields));
  writes.set(rid, next);
  return next.finally(() => { if (writes.get(rid) === next) writes.delete(rid); });
}

function createServer(options = {}) {
  const store = require('./planner-store').createStore(options.stateFile || path.join(ROOT, '.planner-state.json'));
  const notifier = require('./notifier').createNotifier({ file: options.notificationFile || path.join(ROOT, '.notifications.json'), store, pull: pullAll, getToken, actions: () => {
    const file = path.join(ROOT, '.planner-actions.json');
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  } });
  let windowStart = Date.now(), requestCount = 0;
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const p = new URL(req.url, 'http://localhost').pathname;
    if (p === '/api/health' && req.method === 'GET') {
      return send(res, 200, { ok: true, configured: !!(APP_ID && APP_SECRET && APP_TOKEN && TABLE_ID), authConfigured: PASSWORD.length >= 16 });
    }
    if (!authorize(req, res)) return;
    if (req.headers.origin && req.headers.origin !== PUBLIC_ORIGIN && req.headers.origin !== 'http://' + req.headers.host && req.headers.origin !== 'https://' + req.headers.host) {
      return send(res, 403, { ok: false, error: '不允许跨站请求' });
    }
    if (p.startsWith('/api/')) {
      if (Date.now() - windowStart >= 60000) { windowStart = Date.now(); requestCount = 0; }
      if (++requestCount > 120) return send(res, 429, { ok: false, error: '请求过于频繁' });
    }
    if (p === '/api/logs' && req.method === 'GET') {
      try { return send(res, 200, { ok: true, logs: (store.read().logs || []).slice(0, 100) }); }
      catch (_) { return send(res, 500, { ok: false, error: '本地改动记录暂时不可读取' }); }
    }
    if (p === '/api/planner' || p === '/api/notifications/test' || p === '/api/notifications/config') {
      try {
        if (p === '/api/planner' && req.method === 'GET') return send(res, 200, { ok: true, state: store.read(), channel: notifier.status() });
        if (req.method !== 'POST') return send(res, 405, { ok: false });
        if (!(req.headers['content-type'] || '').startsWith('application/json')) return send(res, 415, { ok: false, error: '需要 JSON 请求' });
        let raw = '';
        for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 16384) return send(res, 413, { ok: false, error: '请求过大' }); }
        if (p === '/api/notifications/test') { await notifier.test(); return send(res, 200, { ok: true }); }
        if (p === '/api/notifications/config') { notifier.configure(JSON.parse(raw)); return send(res, 200, { ok: true, channel: notifier.status() }); }
        return send(res, 200, { ok: true, state: store.update(JSON.parse(raw)) });
      } catch (error) { return send(res, 400, { ok: false, error: error.message }); }
    }
    if (p === '/api/pull' && req.method === 'GET') {
      try {
        const data = await pullAll();
        return send(res, 200, { ok: true, at: new Date().toISOString(), ...data });
      } catch (e) { return send(res, 502, { ok: false, error: e.message }); }
    }
    if (p === '/api/sync' && req.method === 'POST') {
      if (!(req.headers['content-type'] || '').startsWith('application/json')) return send(res, 415, { ok: false, error: '需要 application/json' });
      let raw = '', size = 0;
      try {
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 16384) { send(res, 413, { ok: false, error: '请求过大' }); return; }
          raw += chunk;
        }
        let body, fields;
        try { body = JSON.parse(raw); fields = buildFields(body); }
        catch (e) { return send(res, 400, { ok: false, error: e.message }); }
        const result = await enqueueWrite(body.rid, fields);
        let warning = '';
        try { store.appendLog({ rid: body.rid, name: result?.record?.fields?.['公司名称'] || body.rid, field: '岗位状态 / 时间', fields, changes: result.changes }); }
        catch (_) { warning = '飞书已保存，但本地改动记录写入失败'; }
        return send(res, 200, { ok: true, rid: body.rid, warning });
      } catch (e) { return send(res, 502, { ok: false, error: e.message }); }
    }
    if (p.startsWith('/api/')) return send(res, 405, { ok: false, error: '不支持的接口或请求方法' });
    if (!['GET', 'HEAD'].includes(req.method)) return send(res, 405, { ok: false });
    return serveStatic(req, res, p);
  });
  let reminderTimer;
  server.on('listening', () => { notifier.tick(); reminderTimer = setInterval(() => notifier.tick(), 60000); reminderTimer.unref(); });
  server.on('close', () => clearInterval(reminderTimer));
  return server;
}
if (require.main === module) createServer().listen(PORT, process.env.HOST || '0.0.0.0', () => console.log('listening on ' + PORT));
module.exports = { createServer, buildFields, transform };
