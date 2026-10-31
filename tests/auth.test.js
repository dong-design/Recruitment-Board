const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../build_dashboard.py'), 'utf8');
function fixture(getUser) {
  const calls = [];
  const context = { authRevision: 0, session: null, OVERRIDES: {}, PENDING: 0, pending: {}, booted: true,
    cloud: { auth: { getUser, getSession: async () => ({ data: { accessToken: 'test' } }) } },
    renderAuth() {}, refreshEditAccess() {}, renderAll() {},
    closeLogin: () => calls.push('closed'), cmsg: message => calls.push(message), lmsg: message => calls.push(message),
    loadOverrides: async () => calls.push('database'), cloudSessionError: e => /invalid_grant/.test(e.message),
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('async function verifyCloudSession('), source.indexOf('function renderAuth(')) +
    source.slice(source.indexOf('async function afterLogin('), source.indexOf('async function sendCode(')), context);
  return { context, calls };
}
test('freshly issued but rejected credentials never become a logged-in session', async () => {
  const { context, calls } = fixture(async () => ({ error: { message: 'invalid_grant' } }));
  await context.afterLogin({ accessToken: 'test' });
  assert.equal(context.session, null);
  assert.ok(!calls.includes('closed'));
  assert.ok(!calls.includes('database'));
  assert.ok(calls.some(x => x.includes('认证服务拒绝')));
});
test('reload verifies persisted credentials before loading private cloud data', async () => {
  const { context, calls } = fixture(async () => ({ data: { name: 'Verified' } }));
  await context.restore();
  assert.equal(context.session.user.name, 'Verified');
  assert.ok(calls.includes('database'));
});
test('rejected persisted credentials do not load cloud overlays', async () => {
  const { context, calls } = fixture(async () => ({ error: { message: 'invalid_grant' } }));
  await context.restore();
  assert.equal(context.session, null);
  assert.ok(!calls.includes('database'));
});
test('database failure does not revoke independently verified identity', async () => {
  const { context, calls } = fixture(async () => ({ data: { name: 'Verified' } }));
  context.loadOverrides = async () => { throw new Error('database unavailable'); };
  await context.afterLogin({ accessToken: 'test' });
  assert.equal(context.session.user.name, 'Verified');
  assert.ok(calls.includes('closed'));
});
test('logout during identity check cannot be undone by a late response', async () => {
  let resolve;
  const { context } = fixture(() => new Promise(r => { resolve = r; }));
  const checking = context.verifyCloudSession({ accessToken: 'test' });
  context.authRevision++;
  resolve({ data: { name: 'Verified' } });
  await assert.rejects(checking, /session changed/);
  assert.equal(context.session, null);
});
