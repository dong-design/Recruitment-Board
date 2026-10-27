// 秋招进度看板 —— 带同步后端的服务
// 静态托管 index.html，并提供：
//   GET  /api/pull  拉取飞书多维表格最新记录（前端打开即最新）
//   POST /api/sync  把前端的一次改动立即写回飞书（保存即同步）
//   GET  /api/health 健康检查
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
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
// 表格坐标也可以写在 .feishu-app.json 里（app_token / table_id）
if (!APP_TOKEN || !TABLE_ID) {
  try {
    const f = path.join(ROOT, '.feishu-app.json');
    if (fs.existsSync(f)) {
      const j = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (!APP_TOKEN && j.app_token) process.env.FEISHU_APP_TOKEN = j.app_token;
      if (!TABLE_ID && j.table_id) process.env.FEISHU_TABLE_ID = j.table_id;
    }
  } catch (e) { /* 忽略 */ }
}
// 多维表格坐标：从环境变量或 dashboard/.feishu-app.json 读取，不要硬编码
const APP_TOKEN = process.env.FEISHU_APP_TOKEN || '';
const TABLE_ID = process.env.FEISHU_TABLE_ID || '';
const API = 'https://open.feishu.cn/open-apis';

let cached = { token: '', exp: 0 };

async function getToken() {
  if (cached.token && Date.now() < cached.exp) return cached.token;
  if (!APP_ID || !APP_SECRET) throw new Error('飞书应用凭证未配置');
  const r = await fetch(API + '/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET }),
  });
  const j = await r.json();
  if (j.code !== 0) throw new Error('获取 tenant_access_token 失败: ' + (j.msg || j.code));
  cached = { token: j.tenant_access_token, exp: Date.now() + Math.max(0, (j.expire || 7200) - 300) * 1000 };
  return cached.token;
}

async function api(pathname, opts = {}) {
  const t = await getToken();
  const r = await fetch(API + pathname, Object.assign({}, opts, {
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
  if (!p || !p.record_ids || !p.record_ids.length) return null;
  return p.record_ids[0];
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
  return transform(rows);
}

function buildFields(b) {
  const f = {};
  if (b.status !== undefined) f['投递'] = b.status;
  if (b.progress !== undefined) f['进展'] = b.progress;
  if (b.key_date !== undefined) f['报名截止日'] = b.key_date ? toMs(b.key_date) : null;
  return f;
}

async function writeRecord(rid, fields) {
  const j = await api(`/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records/${rid}`, {
    method: 'PUT',
    body: JSON.stringify({ fields }),
  });
  if (j.code !== 0) throw new Error('写入飞书失败: ' + (j.msg || j.code));
  return j.data;
}

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function serveStatic(req, res, urlPath) {
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

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;

  if (p === '/api/health') {
    return send(res, 200, { ok: true, configured: !!(APP_ID && APP_SECRET) });
  }

  if (p === '/api/pull') {
    try {
      const data = await pullAll();
      return send(res, 200, { ok: true, at: new Date().toISOString(), records: data.records, subs: data.subs });
    } catch (e) {
      return send(res, 200, { ok: false, error: String(e.message || e) });
    }
  }

  if (p === '/api/sync' && req.method === 'POST') {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on('end', async () => {
      try {
        const b = JSON.parse(raw || '{}');
        if (!b.rid) return send(res, 200, { ok: false, error: '缺少 rid' });
        await writeRecord(b.rid, buildFields(b));
        return send(res, 200, { ok: true, rid: b.rid });
      } catch (e) {
        return send(res, 200, { ok: false, error: String(e.message || e) });
      }
    });
    return;
  }

  return serveStatic(req, res, p);
}).listen(PORT, '0.0.0.0', () => console.log('listening on ' + PORT));
