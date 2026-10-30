const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '../build_dashboard.py'), 'utf8');
test('empty overrides replace stale values and update deadline semantics', () => {
  const snippet = source.slice(source.indexOf('const view ='), source.indexOf('const V ='));
  const r = { id: 'rec1', status: '待投递', progress: ['笔试'], key: '2026-10-30', hasDl: true };
  const context = { OVERRIDES: { rec1: { progress: [], key_date: null } }, r };
  vm.runInNewContext(snippet + '\nresult = view(r)', context);
  assert.equal(context.result.progress.length, 0);
  assert.equal(context.result.key, null);
  assert.equal(context.result.hasDl, false);
  context.OVERRIDES.rec1 = { key_date: '2026-11-01' };
  vm.runInNewContext(snippet + '\nresult = view(r)', { ...context });
});
test('generated inline scripts parse correctly', () => {
  const html = fs.readFileSync(path.join(__dirname, '../dashboard/index.html'), 'utf8');
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
});

function fixture(mode) {
  const eventStart = source.indexOf("$('modal').addEventListener('click', async e => {");
  const eventEnd = source.indexOf('async function resetOverride', eventStart);
  const handlers = {}, logs = [], updates = [];
  const values = { 'ed-status': { value: '已投递' }, 'ed-key': { value: '' }, 'ed-comment': { value: '' }, 'ed-save': {} };
  const r = { id: 'recTest1', name: 'Test', status: '待投递', progress: ['笔试'], key: '2026-11-01', hasDl: true };
  const state = { R: [r], OVERRIDES: {}, currentRid: r.id, saveInFlight: false, saveRevision: 0, session: { user: { name: 'test' } },
    $: id => id === 'modal' ? { addEventListener: (_, fn) => handlers.save = fn } : values[id],
    document: { querySelectorAll: () => [] }, renderAll() {}, closeM() {}, cmsg() {}, et: String, APIQ: () => '',
    loadOverrides: async () => {}, view: r => r,
    fetch: async () => ({ text: async () => JSON.stringify({ ok: mode !== 'fallback' }) }),
    cloud: { database: { from(table) { return {
      insert(value) { logs.push({ table, value }); if (mode === 'audit-failure' && table === 'job_log') return Promise.reject(new Error('audit down')); return Promise.resolve({ data: [value] }); },
      update(value) { updates.push({ table, value }); return { eq() { return { select: async () => ({ data: [value] }) }; } }; },
      delete() { return { eq: async () => ({ error: null }) }; }
    }; } } }
  };
  const helpers = source.slice(source.indexOf('function applyLocal('), eventStart);
  vm.runInNewContext(helpers + source.slice(eventStart, eventEnd), state);
  return { state, logs, updates, save: () => handlers.save({ target: { id: 'ed-save' } }) };
}
test('successful sync records only the current operation as synced', async () => {
  const f = fixture('ok'); await f.save();
  assert.equal(f.logs.length, 1); assert.equal(f.logs[0].value.synced, true);
  assert.equal(f.updates.length, 0); assert.equal(f.state.saveInFlight, false);
});
test('audit failure after a successful write does not enqueue a duplicate', async () => {
  const f = fixture('audit-failure'); await f.save();
  assert.equal(f.updates.length, 0); assert.equal(f.state.R[0].status, '已投递');
  assert.equal(f.state.saveInFlight, false);
});
test('sync failure queues cleared values and releases save lock', async () => {
  const f = fixture('fallback'); await f.save();
  assert.equal(f.updates[0].table, 'job_overrides');
  assert.equal(f.updates[0].value.key_date, null);
  assert.equal(f.updates[0].value.progress.length, 0);
  assert.equal(f.state.saveInFlight, false);
});
test('a second save is blocked while the first is pending', async () => {
  const f = fixture('ok'); f.state.saveInFlight = true; await f.save();
  assert.equal(f.logs.length, 0);
});

test('change history renders before and after safely and labels legacy records', () => {
  const snippet=source.slice(source.indexOf('function changeValue('),source.indexOf('async function loadLogs('));
  const context={esc:s=>String(s).replaceAll('<','&lt;')};vm.createContext(context);vm.runInContext(snippet,context);
  const html=context.logRows([{changes:[{field:'进展',before:['笔试'],after:['笔试','一面'],beforeKnown:true}],name:'<test>',synced:true}],true);
  assert.ok(html.includes('笔试、一面'));assert.ok(html.includes('old-value'));assert.ok(html.includes('&lt;test>'));
  assert.ok(context.logRows([{fields:{'进展':[]}}],true).includes('历史记录未保存旧值'));
});
