import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyLabel, applyState, filterPolicies, normalizeDate, parseQuery, sortPolicies, toField, type Policy } from '../shared/policy.ts';
import { demoPolicies } from '../server/demo.ts';
import { uniqueTitles, policyRegionLabel, pickedLabel, metaLine } from '../src/labels.ts';
import { createRegionIndex } from '../shared/regions.ts';

const today = '2026-10-29';
const list: Policy[] = demoPolicies(today).map(p => ({ ...p, firstSeenAt: '2026-10-29T00:00:00Z' }));
const idx = createRegionIndex();

test('날짜와 신청 상태', () => {
  assert.equal(normalizeDate('20261101'), '2026-11-01');
  assert.equal(normalizeDate('2026.1.5'), '2026-01-05');
  assert.equal(normalizeDate('상시'), null);
  const p = { applyStart: '2026-10-01', applyEnd: '2026-11-01', applyCode: 'period' as const };
  assert.equal(applyState(p, today), 'open');
  assert.equal(applyLabel(p, today), 'D-3');
  assert.equal(applyLabel({ ...p, applyEnd: today }, today), '오늘 마감');
  assert.equal(applyState({ ...p, applyEnd: '2026-10-01' }, today), 'closed');
  assert.equal(applyLabel({ ...p, applyStart: '2026-11-05', applyEnd: '2026-11-30' }, today), '11월 5일 시작');
  // 원 데이터가 마감이라고 하면 날짜가 남아 있어도 마감이에요
  assert.equal(applyState({ ...p, applyCode: 'closed' }, today), 'closed');
  assert.equal(applyLabel({ applyStart: null, applyEnd: null, applyCode: 'always' }, today), '상시');
});

test('분야 묶기', () => {
  assert.equal(toField('일자리', '취업'), 'job');
  assert.equal(toField('주거·자립'), 'housing');
  assert.equal(toField('보육·교육'), 'education');
  assert.equal(toField('복지문화'), 'welfare');
  assert.equal(toField('임신·출산'), 'health');
  assert.equal(toField('참여권리'), 'participation');
  assert.equal(toField(''), 'etc');
});

test('지역 필터: 전국 정책 + 시·도 전체 + 고른 구', () => {
  const ids = (q: Parameters<typeof filterPolicies>[1]) => filterPolicies(list, q, today).map(p => p.id);
  const bukgu = ids({ sido: '12', sgg: '12300' });
  assert.ok(bukgu.includes('y-demo3'));   // 북구
  assert.ok(bukgu.includes('y-demo2'));   // 전남광주 전체
  assert.ok(bukgu.includes('y-demo1'));   // 전국
  assert.ok(!bukgu.includes('y-demo11')); // 광산구
  assert.ok(!bukgu.includes('y-demo5'));  // 서울
  const onlyLocal = ids({ sido: '12', sgg: '12300', national: false });
  assert.ok(!onlyLocal.includes('y-demo1'));
  assert.ok(ids({ sido: '12' }).includes('y-demo11')); // 시·도만 고르면 모든 구
  assert.ok(!ids({ open: true }).includes('y-demo10')); // 마감 빼기
  assert.deepEqual(ids({ source: 'gov24' }).every(id => id.startsWith('g-')), true);
  assert.deepEqual(ids({ field: 'housing' }).sort(), ['y-demo1', 'y-demo9']);
});

test('정렬 네 가지', () => {
  const by = (s: Parameters<typeof sortPolicies>[1]) => sortPolicies(list, s, today).map(p => p.id);
  const deadline = by('deadline');
  assert.equal(deadline[0], 'y-demo8');            // 내일 마감
  assert.equal(deadline.at(-1), 'y-demo10');       // 마감된 건 맨 뒤
  assert.ok(deadline.indexOf('y-demo5') < deadline.indexOf('y-demo4')); // 곧 시작 → 상시
  assert.equal(by('popular')[0], 'y-demo4');
  const recent = sortPolicies(list, 'recent', today);
  assert.equal(recent[0].registeredAt, list.map(p => p.registeredAt!).sort().at(-1)); // 가장 최근 등록일이 먼저
  assert.ok(recent.findIndex(p => p.id === 'g-demo6') > recent.findIndex(p => p.id === 'y-demo3'));
  const names = sortPolicies(list, 'name', today).map(p => p.title);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'ko')));
});

test('쿼리 검사: 이상한 값은 버려요', () => {
  const q = parseQuery({ sido: '1', sgg: 'abcde', field: 'x', sort: 'drop table', open: '1', national: '0', q: 'a'.repeat(100) });
  assert.equal(q.sido, undefined); assert.equal(q.sgg, undefined); assert.equal(q.field, undefined);
  assert.equal(q.sort, 'deadline'); assert.equal(q.open, true); assert.equal(q.national, false); assert.equal(q.q?.length, 40);
});

test('목록 제목은 줄마다 달라요', () => {
  const dup = [list[2], { ...list[2], id: 'y-x', sgg: ['12330'], agency: '전남광주통합특별시 광산구' }, { ...list[2], id: 'y-z' }];
  const titles = uniqueTitles(dup, idx);
  assert.equal(new Set(titles).size, 3);
  assert.match(titles[1], /광산구/);
});

test('지역 이름 표시', () => {
  assert.equal(metaLine(list[0], idx), '국토교통부 · 전국');
  assert.equal(metaLine(list[1], idx), '전남광주통합특별시'); // 기관 이름에 지역이 있으면 한 번만
  assert.equal(metaLine(list[2], idx), '전남광주통합특별시 북구');
  assert.equal(metaLine({ ...list[2], agency: '북구청' }, idx), '북구청 · 전남광주 북구');
  assert.equal(policyRegionLabel(list[0], idx), '전국');
  assert.equal(policyRegionLabel(list[1], idx), '전남광주 전체');
  assert.equal(policyRegionLabel(list[2], idx), '전남광주 북구');
  assert.equal(pickedLabel({ sido: '12', sgg: '12300' }, idx), '전남광주 북구');
  assert.equal(pickedLabel({ sido: '11', sgg: null }, idx), '서울 전체');
  assert.equal(pickedLabel({ sido: null, sgg: null }, idx), '전국');
});
