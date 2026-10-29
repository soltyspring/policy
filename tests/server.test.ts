import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.ts';
import { openStore } from '../server/store.ts';
import { seedDemo, demoPolicies } from '../server/demo.ts';
import { createTossClient, mockCaller, unavailableToss } from '../server/toss.ts';
import { collectOnce } from '../server/collector.ts';
import { createRegionIndex } from '../shared/regions.ts';
import { SourceError, type PolicySource, type RawPolicy } from '../server/sources/types.ts';

const regions = createRegionIndex();

async function serve(opts: Partial<Parameters<typeof createApp>[0]> = {}) {
  const store = openStore(':memory:');
  seedDemo(store);
  const log: any[] = [];
  const app = createApp({ store, regions: () => regions, toss: createTossClient(mockCaller(log), true), ...opts });
  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (path: string, init: RequestInit = {}) => {
    const res = await fetch(base + path, { ...init, headers: { 'content-type': 'application/json', ...(init.headers ?? {}) } });
    return { status: res.status, headers: res.headers, body: await res.json().catch(() => null) as any };
  };
  return { store, call, close: () => new Promise(r => server.close(r)), log };
}

test('목록 API: 지역·정렬·쪽 나누기', async () => {
  const s = await serve();
  try {
    const r = await s.call('/api/policies?sido=12&sgg=12300&sort=deadline&limit=3');
    assert.equal(r.status, 200);
    assert.equal(r.body.items.length, 3);
    assert.ok(r.body.total > 3);
    assert.ok(r.body.open <= r.body.total);
    assert.ok(r.body.items.every((p: any) => p.scope === 'national' || p.sido.includes('12')));
    const next = await s.call('/api/policies?sido=12&sgg=12300&sort=deadline&limit=3&offset=3');
    assert.ok(next.body.items.every((p: any) => !r.body.items.some((x: any) => x.id === p.id)));
    assert.equal(r.body.sources.length, 2);
    const one = await s.call(`/api/policies/${r.body.items[0].id}`);
    assert.equal(one.body.id, r.body.items[0].id);
    assert.equal((await s.call('/api/policies/..%2Fetc')).status, 400);
    assert.equal((await s.call('/api/policies/y-none')).status, 404);
  } finally { await s.close(); }
});

test('지역 API와 설정', async () => {
  const s = await serve();
  try {
    const r = await s.call('/api/regions');
    assert.equal(r.body.sido.length, 16);
    const c = await s.call('/api/config');
    assert.deepEqual(c.body, { notify: false, intervalHours: 6 });
    assert.equal((await s.call('/api/address?q=x')).status, 404); // 동네는 선택만 해요(주소 검색 없음)
  } finally { await s.close(); }
});

test('허용한 곳에서만 불러요', async () => {
  const s = await serve({ allowedOrigins: ['https://policy.apps.tossmini.com'] });
  try {
    assert.equal((await s.call('/api/policies', { headers: { origin: 'https://evil.example' } })).status, 403);
    const ok = await s.call('/api/policies', { headers: { origin: 'https://policy.apps.tossmini.com' } });
    assert.equal(ok.headers.get('access-control-allow-origin'), 'https://policy.apps.tossmini.com');
    assert.equal(ok.headers.get('access-control-allow-methods'), 'GET, OPTIONS'); // 알림을 끄면 GET만
  } finally { await s.close(); }
});

test('알림이 꺼져 있으면 알림 API가 없어요', async () => {
  const s = await serve();
  try {
    assert.equal((await s.call('/api/session', { method: 'POST', body: JSON.stringify({ code: 'abcdefgh12' }) })).status, 404);
  } finally { await s.close(); }
});

test('알림을 켜면: 세션 → 지역 저장 → 끄기', async () => {
  const s = await serve({ notifyEnabled: true });
  try {
    const sess = await s.call('/api/session', { method: 'POST', body: JSON.stringify({ code: 'abcdefgh12' }) });
    assert.equal(sess.status, 200);
    assert.ok(!JSON.stringify(sess.body).includes('mock-anon')); // 식별키는 앱에 주지 않아요
    const auth = { authorization: `Bearer ${sess.body.token}` };
    assert.equal((await s.call('/api/subscription', { method: 'PUT', headers: auth, body: JSON.stringify({ region: { sido: '12', sgg: '99999' } }) })).status, 400);
    const on = await s.call('/api/subscription', { method: 'PUT', headers: auth, body: JSON.stringify({ region: { sido: '12', sgg: '12300' } }) });
    assert.deepEqual(on.body.region, { sido: '12', sgg: '12300' });
    const off = await s.call('/api/subscription', { method: 'DELETE', headers: auth });
    assert.equal(off.body.subscribed, false);
    assert.equal((await s.call('/api/subscription', { headers: { authorization: 'Bearer nope' } })).status, 401);
  } finally { await s.close(); }
});

test('인증서가 없으면 알림만 503', async () => {
  const s = await serve({ notifyEnabled: true, toss: unavailableToss() });
  try {
    assert.equal((await s.call('/api/session', { method: 'POST', body: JSON.stringify({ code: 'abcdefgh12' }) })).status, 503);
    assert.equal((await s.call('/api/policies')).status, 200);
  } finally { await s.close(); }
});

const fixed = (id: string, list: () => RawPolicy[]): PolicySource => ({ id: id as 'youth', fetchAll: async () => list() });

test('수집: 첫 수집은 알림 없이 기록, 다음에 새로 생긴 지역 정책만 알림', async () => {
  const store = openStore(':memory:');
  const sent: any[] = [];
  const toss = createTossClient(mockCaller(sent), true);
  const base = demoPolicies().filter(p => p.source === 'youth');
  let current = base;
  const src = fixed('youth', () => current);
  const sub = createTossClient(mockCaller([]), true);
  store.subscribe('anon-1', { sido: '12', sgg: '12300' });
  store.subscribe('anon-2', { sido: '11', sgg: null });

  const first = await collectOnce({ store, sources: [src], regions, notify: { toss, template: 'policy-new' } });
  assert.equal(first.sources[0].added, 0);
  assert.equal(first.notified.skipped, 'no-new');

  current = [...base,
    { ...base[2], id: 'y-new1', title: '북구 새 정책', applyEnd: null, applyCode: 'always' },
    { ...base[0], id: 'y-new2', title: '전국 새 정책' }];
  const second = await collectOnce({ store, sources: [src], regions, notify: { toss, template: 'policy-new' } });
  assert.equal(second.sources[0].added, 2);
  assert.equal(second.notified.sent, 1); // 북구 구독자만. 전국 정책은 알림에서 빼요
  const msg = sent.find(c => c.path.endsWith('/send-message'));
  assert.equal(msg.headers['x-anon-key'], 'anon-1');
  assert.equal(msg.body.templateSetCode, 'policy-new');
  assert.equal(msg.body.context.region, '북구');

  // 같은 날 또 생겨도 다시 보내지 않아요
  current = [...current, { ...base[2], id: 'y-new3', title: '북구 또 새 정책', applyCode: 'always', applyEnd: null }];
  const third = await collectOnce({ store, sources: [src], regions, notify: { toss, template: 'policy-new' } });
  assert.equal(third.notified.skipped, 'no-match');
  void sub;
});

test('수집: 키 문제는 건너뛰고 저장된 목록은 그대로', async () => {
  const store = openStore(':memory:');
  seedDemo(store);
  const before = store.countBySource('youth');
  const broken: PolicySource = { id: 'youth', fetchAll: async () => { throw new SourceError('invalid-key', 'x'); } };
  const r = await collectOnce({ store, sources: [broken], regions });
  assert.equal(r.ok, false);
  assert.equal(r.sources[0].state, 'invalid-key');
  assert.equal(store.countBySource('youth'), before);
  assert.equal(store.sourceStatuses().find(s => s.source === 'youth')!.state, 'invalid-key');
});

test('수집: 원 데이터에서 내려간 정책은 지워요', async () => {
  const store = openStore(':memory:');
  const base = demoPolicies().filter(p => p.source === 'gov24');
  await collectOnce({ store, sources: [fixed('gov24', () => base)], regions });
  await new Promise(r => setTimeout(r, 5));
  const r = await collectOnce({ store, sources: [fixed('gov24', () => base.slice(1))], regions });
  assert.equal(r.sources[0].removed, 1);
  assert.equal(store.countBySource('gov24'), base.length - 1);
});
