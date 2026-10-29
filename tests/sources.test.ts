import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRegionIndex } from '../shared/regions.ts';
import { normalizeYouth, regionOfCodes, youthSource } from '../server/sources/youth.ts';
import { buildCodebook, gov24Source, normalizeGov24, parseDeadline } from '../server/sources/gov24.ts';
import { SourceError } from '../server/sources/types.ts';
import { cleanKeyword } from '../server/juso.ts';

const idx = createRegionIndex();
const allCodes = idx.data.sido.flatMap(s => s.sgg.flatMap(g => g.codes));

const youthRow = {
  plcyNo: '20261029000001', plcyNm: '청년 &amp;#39;마음&amp;#39; 상담', sprvsnInstCdNm: '광주광역시 북구', lclsfNm: '복지문화', mclsfNm: '건강',
  plcyExplnCn: '마음 건강 상담을 지원해요.', plcySprtCn: '10회 무료', aplyYmd: '20261001 ~ 20261130', aplyPrdSeCd: '0057001',
  sprtTrgtMinAge: '19', sprtTrgtMaxAge: '39', sprtTrgtAgeLmtYn: 'Y', zipCd: '29170', inqCnt: '321', frstRegDt: '2026-10-20 10:00:00',
  aplyUrlAddr: 'http://example.go.kr/apply',
};

test('온통청년: 옛 광주 코드도 지금 지역으로', () => {
  const p = normalizeYouth(youthRow, idx)!;
  assert.equal(p.id, 'y-20261029000001');
  assert.equal(p.title, "청년 '마음' 상담"); // 이중 엔티티 풀기
  assert.equal(p.scope, 'regional');
  assert.deepEqual(p.sido, ['12']);
  assert.deepEqual(p.sgg, ['12300']);
  assert.equal(p.applyStart, '2026-10-01'); assert.equal(p.applyEnd, '2026-11-30');
  assert.equal(p.ageMin, 19); assert.equal(p.views, 321); assert.equal(p.registeredAt, '2026-10-20');
  assert.equal(p.url, 'https://example.go.kr/apply');
  assert.equal(p.field, 'welfare');
});

test('온통청년: 전국·시도 전체·상시·나이 무관', () => {
  assert.equal(regionOfCodes(allCodes, idx).scope, 'national');
  const seoul = idx.sidoByCode.get('11')!.sgg.map(s => s.code);
  assert.deepEqual(regionOfCodes(seoul, idx), { scope: 'regional', sido: ['11'], sgg: [] });
  const p = normalizeYouth({ ...youthRow, zipCd: '', rgtrInstCdNm: '부산광역시 해운대구', aplyYmd: '', aplyPrdSeCd: '0057002', sprtTrgtAgeLmtYn: 'N', aplyUrlAddr: '' }, idx)!;
  assert.deepEqual(p.sido, ['26']);
  assert.equal(p.applyCode, 'always');
  assert.equal(p.ageMin, null);
  assert.match(p.url, /^https:\/\/www\.youthcenter\.go\.kr\//);
  assert.equal(normalizeYouth({ plcyNo: '', plcyNm: 'x' }, idx), null);
});

const fakeFetch = (pages: any[][], status = 200, body?: any) => {
  const calls: string[] = [];
  const f = (async (url: string) => {
    calls.push(url);
    const page = Number(new URL(url).searchParams.get('pageNum') ?? new URL(url).searchParams.get('page'));
    const json = body ?? { result: { pagging: { totCount: pages.flat().length }, youthPolicyList: pages[page - 1] ?? [] }, data: pages[page - 1] ?? [], totalCount: pages.flat().length };
    return new Response(JSON.stringify(json), { status });
  }) as unknown as typeof fetch;
  return { f, calls };
};

test('온통청년: 키가 없거나 틀리면 건너뛰는 오류', async () => {
  await assert.rejects(youthSource(undefined).fetchAll(idx), (e: unknown) => e instanceof SourceError && e.state === 'no-key');
  const { f } = fakeFetch([], 403, { errorCode: 'e001', errorMsg: 'invalid api key.' });
  await assert.rejects(youthSource('k', f).fetchAll(idx), (e: unknown) => e instanceof SourceError && e.state === 'invalid-key');
});

test('온통청년: 여러 쪽을 끝까지 받아요', async () => {
  const rows = Array.from({ length: 150 }, (_, i) => ({ ...youthRow, plcyNo: String(i) }));
  const { f, calls } = fakeFetch([rows.slice(0, 100), rows.slice(100)]);
  const out = await youthSource('k', f).fetchAll(idx);
  assert.equal(out.length, 150);
  assert.equal(calls.length, 2);
});

const govRow = {
  서비스ID: '000000465790', 서비스명: '청년 월세 지원', 서비스목적요약: '월세를 지원해요', 지원대상: '무주택 청년', 선정기준: '중위소득 60%',
  지원내용: '월 20만 원', 신청방법: '온라인', 신청기한: '2026.11.01 ~ 2026.12.31', 소관기관명: '서울특별시 강남구', 소관기관유형: '지방자치단체',
  사용자구분: '개인', 서비스분야: '주거·자립', 조회수: 1200, 등록일시: '20261020093000', 상세조회URL: 'https://www.gov.kr/portal/rcvfvrSvc/dtlEx/000000465790',
};

test('정부 혜택: 기관 이름으로 지역 정하기', () => {
  const p = normalizeGov24(govRow, idx)!;
  assert.equal(p.id, 'g-000000465790');
  assert.deepEqual(p.sido, ['11']); assert.deepEqual(p.sgg, ['11680']);
  assert.equal(p.applyEnd, '2026-12-31'); assert.equal(p.field, 'housing'); assert.equal(p.views, 1200);
  assert.equal(p.registeredAt, '2026-10-20');
  assert.equal(normalizeGov24({ ...govRow, 소관기관명: '보건복지부', 소관기관유형: '중앙행정기관' }, idx)!.scope, 'national');
  assert.equal(normalizeGov24({ ...govRow, 소관기관명: '알수없는구청', 소관기관유형: '지방자치단체' }, idx), null);
  assert.equal(normalizeGov24({ ...govRow, 사용자구분: '법인/시설/단체' }, idx), null);
  assert.equal(normalizeGov24({ ...govRow, 서비스명: '온라인 신청 시연 테스트(운영)' }, idx), null);
  // 공공기관은 이름에 지명이 있어도 전국
  assert.equal(normalizeGov24({ ...govRow, 소관기관명: '서울대학교병원', 소관기관유형: '공공기관' }, idx)!.scope, 'national');
  // 광역시도는 시·도 전체
  const sido = normalizeGov24({ ...govRow, 소관기관명: '전남광주통합특별시', 소관기관유형: '광역시도' }, idx)!;
  assert.deepEqual([sido.sido, sido.sgg], [['12'], []]);
  // 이름에 지역이 없는 출연기관은 같은 소관기관코드의 지자체에서 배워요
  const rows = [
    { ...govRow, 소관기관명: '경기도 부천시', 소관기관유형: '시군구', 소관기관코드: '3860000' },
    { ...govRow, 서비스ID: '2', 소관기관명: '(재)부천산업진흥원', 소관기관유형: '지방출자_출연기관', 소관기관코드: '3860000' },
  ];
  const book = buildCodebook(rows, idx);
  assert.deepEqual(normalizeGov24(rows[1], idx, book)!.sgg, ['41190']);
  assert.equal(normalizeGov24(rows[1], idx), null);
});

test('정부 혜택: 신청기한 문장 읽기', () => {
  assert.equal(parseDeadline('상시신청').applyCode, 'always');
  assert.equal(parseDeadline('관리주체가 매월 청구', '상시신청').applyCode, 'always');
  assert.deepEqual(parseDeadline('20250901~20251001'), { applyStart: '2025-09-01', applyEnd: '2025-10-01', applyCode: 'period' });
  assert.deepEqual(parseDeadline('20260105-20260120'), { applyStart: '2026-01-05', applyEnd: '2026-01-20', applyCode: 'period' });
  assert.deepEqual(parseDeadline('2026. 3. 23.(월) 09:00 ~ 12. 11.(금) 18:00'), { applyStart: '2026-03-23', applyEnd: '2026-12-11', applyCode: 'period' });
  assert.equal(parseDeadline('접수기관 별 상이').applyCode, null);
  assert.deepEqual(parseDeadline('2026년 3월 1일 ~ 2026년 3월 31일'), { applyStart: '2026-03-01', applyEnd: '2026-03-31', applyCode: 'period' });
  assert.equal(parseDeadline('2026.12.31까지').applyEnd, '2026-12-31');
  assert.equal(parseDeadline('예산 소진 시까지').applyCode, null);
});

test('정부 혜택: 키 없음·틀림', async () => {
  await assert.rejects(gov24Source(undefined).fetchAll(idx), (e: unknown) => e instanceof SourceError && e.state === 'no-key');
  const { f } = fakeFetch([], 401, { code: -4, msg: '등록되지 않은 인증키 입니다.' });
  await assert.rejects(gov24Source('k', f).fetchAll(idx), (e: unknown) => e instanceof SourceError && e.state === 'invalid-key');
  const ok = fakeFetch([[govRow]]);
  assert.equal((await gov24Source('k', ok.f).fetchAll(idx)).length, 1);
});

test('주소 검색어 정리', () => {
  assert.equal(cleanKeyword("서울 강남구'; DROP <script>"), '서울 강남구 script');
});
