import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRegionIndex, REGIONS } from '../shared/regions.ts';

const idx = createRegionIndex(REGIONS);

test('지역 목록: 2026년 개편이 반영된 16개 시·도', () => {
  assert.equal(REGIONS.sido.length, 16);
  const names = REGIONS.sido.map(s => s.name);
  assert.ok(names.includes('전남광주통합특별시'));
  assert.ok(!names.includes('광주광역시') && !names.includes('전라남도'));
  assert.equal(idx.sidoByCode.get('12')?.sgg.length, 27); // 5시 5구 17군
  const incheon = idx.sidoByCode.get('28')!.sgg.map(s => s.name);
  for (const n of ['제물포구', '영종구', '서해구', '검단구']) assert.ok(incheon.includes(n), n);
  for (const n of ['중구', '동구', '서구']) assert.ok(!incheon.includes(n), n);
  // 코드는 시·도 안에서 겹치지 않아요
  for (const s of REGIONS.sido) assert.equal(new Set(s.sgg.map(g => g.code)).size, s.sgg.length, s.name);
});

test('일반구는 시 하나로 묶어요', () => {
  const suwon = idx.sidoByCode.get('41')!.sgg.find(s => s.name === '수원시')!;
  assert.equal(suwon.code, '41110');
  assert.deepEqual(idx.resolveSgg('41113'), ['41110']);
  const hwaseong = idx.sidoByCode.get('41')!.sgg.find(s => s.name === '화성시')!;
  assert.ok(hwaseong.gu?.includes('동탄구'));
});

test('옛 코드도 지금 지역으로 바꿔요', () => {
  assert.deepEqual(idx.resolveSgg('29170'), ['12300']); // 광주 북구 → 전남광주 북구
  assert.deepEqual(idx.resolveSgg('46110'), ['12110']); // 목포시
  assert.deepEqual(idx.resolveSgg('42110'), ['51110']); // 강원도 춘천시 → 강원특별자치도
  assert.deepEqual(idx.resolveSgg('45111'), ['52110']); // 전라북도 전주시 완산구
  assert.deepEqual(idx.resolveSgg('28110').sort(), ['28125', '28155']); // 인천 중구 → 제물포구·영종구
  assert.equal(idx.currentSidoCode('29'), '12');
  assert.deepEqual(idx.resolveSgg('99999'), []);
});

test('주소에서 지역 찾기', () => {
  const a = idx.parseAddress('광주광역시 북구 용봉로 77')!;
  assert.equal(a.sido.code, '12'); assert.equal(a.sgg?.name, '북구');
  const b = idx.parseAddress('경기도 수원시 장안구 정조로 1')!;
  assert.equal(b.sgg?.code, '41110');
  const c = idx.parseAddress('서울 강남구')!;
  assert.equal(c.sgg?.code, '11680');
  assert.equal(idx.parseAddress('세종특별자치시 한누리대로 2130')?.sgg?.code, '36110');
  assert.equal(idx.parseAddress('서울특별시강남구')?.sgg?.code, '11680');
  // 나뉜 옛 구는 정할 수 없어서 후보만 줘요
  const d = idx.parseAddress('인천광역시 중구 신포로 27')!;
  assert.equal(d.sgg, null);
  assert.deepEqual(d.ambiguous.map(s => s.name).sort(), ['영종구', '제물포구']);
  // 하나로 바뀐 옛 구는 바로 정해요
  assert.equal(idx.parseAddress('인천광역시 동구 송림로 1')?.sgg?.name, '제물포구');
  assert.equal(idx.parseAddress('없는시 어딘가'), null);
});
