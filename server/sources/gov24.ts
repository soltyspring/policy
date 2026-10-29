/**
 * 행정안전부 대한민국 공공서비스(혜택) 정보 — 보조금24·정부24 혜택의 원천 데이터
 *   GET https://api.odcloud.kr/api/gov24/v3/serviceList?serviceKey=&page=&perPage=&returnType=JSON
 *   공공데이터포털 https://www.data.go.kr/data/15113968/openapi.do (자동승인, 무료)
 * 개인·가구 대상 혜택만 남겨요.
 */
import { normalizeDate, toField, type Policy } from '../../shared/policy.ts';
import type { RegionIndex } from '../../shared/regions.ts';
import { clip, fetchJson, httpsUrl, SourceError, type Fetch, type PolicySource, type RawPolicy } from './types.ts';

const ENDPOINT = 'https://api.odcloud.kr/api/gov24/v3/serviceList';
const PAGE_SIZE = 500;
const MAX_PAGES = 40;

const get = (r: any, ...keys: string[]) => {
  for (const k of keys) { const v = r?.[k]; if (v !== undefined && v !== null && String(v).trim()) return String(v).trim(); }
  return '';
};

/** "2026.03.01 ~ 2026.03.31", "20250901~20251001", "2026. 3. 23.(월) ~ 12. 11.(금)", "상시신청" → 신청 기간 */
export function parseDeadline(text: string, kind = ''): Pick<Policy, 'applyStart' | 'applyEnd' | 'applyCode'> {
  const t = text.replace(/\s+/g, ' ');
  if (/상시/.test(kind) || /상시/.test(t)) return { applyStart: null, applyEnd: null, applyCode: 'always' };
  const full = /(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})|(?<!\d)(20\d{2})(\d{2})(\d{2})(?!\d)/g;
  const found = [...t.matchAll(full)].map(m => ({ at: m.index ?? 0, d: normalizeDate(m[1] ? `${m[1]}-${m[2]}-${m[3]}` : `${m[4]}-${m[5]}-${m[6]}`) }))
    .filter((x): x is { at: number; d: string } => !!x.d);
  const dates = found.map(x => x.d);
  // 끝 날짜에 연도가 없으면("~ 12. 11.") 시작 연도를 써요.
  if (dates.length === 1) {
    const tilde = t.indexOf('~', found[0].at);
    const m = tilde >= 0 ? t.slice(tilde).match(/~\s*(\d{1,2})\s*[.월]\s*(\d{1,2})/) : null;
    if (m) {
      const y = Number(dates[0].slice(0, 4));
      let end = normalizeDate(`${y}-${m[1]}-${m[2]}`);
      if (end && end < dates[0]) end = normalizeDate(`${y + 1}-${m[1]}-${m[2]}`);
      if (end) dates.push(end);
    }
  }
  if (dates.length >= 2) return { applyStart: dates[0], applyEnd: dates[dates.length - 1], applyCode: 'period' };
  if (dates.length === 1) return /까지|마감|~/.test(t) ? { applyStart: null, applyEnd: dates[0], applyCode: 'period' } : { applyStart: dates[0], applyEnd: null, applyCode: 'period' };
  return { applyStart: null, applyEnd: null, applyCode: null };
}

type Region = Pick<Policy, 'scope' | 'sido' | 'sgg'>;

/**
 * 소관기관 유형·이름으로 지역을 정해요. 이름에 지역이 없는 지자체 출연기관("(재)부천산업진흥원")은
 * 같은 소관기관코드를 쓰는 지자체 행에서 배운 지역(codebook)으로 정해요.
 * 지자체 쪽인데 끝내 지역을 못 찾으면 null(잘못된 지역에 보이지 않게 목록에서 빼요).
 */
export function regionOfAgency(type: string, name: string, dept: string, regions: RegionIndex, code = '', codebook?: Map<string, Region>): Region | null {
  const local = /지방|자치|시도|시군구|광역|기초|출자|출연|공기업/.test(type);
  // 중앙부처·공공기관 서비스는 이름에 지명이 있어도("서울대학교병원") 전국으로 봐요.
  if (!local && /중앙|공공기관/.test(type)) return { scope: 'national', sido: [], sgg: [] };
  const parsed = regions.parseAddress(name) ?? regions.parseAddress(`${name} ${dept}`.trim());
  if (parsed) return { scope: 'regional', sido: [parsed.sido.code], sgg: parsed.sgg && parsed.sido.sgg.length > 1 ? [parsed.sgg.code] : [] };
  if (local && code && codebook?.has(code)) return codebook.get(code)!;
  return local ? null : { scope: 'national', sido: [], sgg: [] };
}

/** 지자체 행(시군구·광역시도)의 소관기관코드 → 지역. 같은 코드가 여러 지역을 가리키면 쓰지 않아요. */
export function buildCodebook(rows: any[], regions: RegionIndex): Map<string, Region> {
  const votes = new Map<string, Map<string, Region>>();
  for (const r of rows) {
    if (!/시군구|광역시도/.test(get(r, '소관기관유형'))) continue;
    const code = get(r, '소관기관코드');
    const parsed = code ? regions.parseAddress(get(r, '소관기관명')) : null;
    if (!parsed) continue;
    const region: Region = { scope: 'regional', sido: [parsed.sido.code], sgg: parsed.sgg && parsed.sido.sgg.length > 1 ? [parsed.sgg.code] : [] };
    if (!votes.has(code)) votes.set(code, new Map());
    votes.get(code)!.set(JSON.stringify(region), region);
  }
  const book = new Map<string, Region>();
  for (const [code, m] of votes) if (m.size === 1) book.set(code, [...m.values()][0]);
  return book;
}

export function normalizeGov24(r: any, regions: RegionIndex, codebook?: Map<string, Region>): RawPolicy | null {
  const id = get(r, '서비스ID');
  const title = clip(get(r, '서비스명'), 120);
  if (!id || !title) return null;
  // 정부24 운영용 시험 항목은 빼요.
  if (/시연\s*테스트|테스트\s*\(운영\)/.test(title)) return null;
  const users = get(r, '사용자구분');
  if (users && !/개인|가구/.test(users)) return null;
  const region = regionOfAgency(get(r, '소관기관유형'), get(r, '소관기관명'), get(r, '부서명'), regions, get(r, '소관기관코드'), codebook);
  if (!region) return null;
  return {
    id: `g-${id}`,
    source: 'gov24',
    title,
    agency: clip(get(r, '소관기관명') || '정부24', 60),
    summary: clip(get(r, '서비스목적요약', '서비스목적'), 200),
    benefit: clip(get(r, '지원내용'), 400),
    target: clip([get(r, '지원대상'), get(r, '선정기준')].filter(Boolean).join(' '), 300),
    how: clip(get(r, '신청방법'), 300),
    field: toField(get(r, '서비스분야')),
    ...region,
    ...parseDeadline(get(r, '신청기한'), get(r, '신청기한유형')),
    ageMin: null,
    ageMax: null,
    views: Number(get(r, '조회수')) || 0,
    registeredAt: normalizeDate(get(r, '등록일시')),
    url: httpsUrl(get(r, '상세조회URL')) ?? `https://www.gov.kr/portal/rcvfvrSvc/dtlEx/${encodeURIComponent(id)}`,
  };
}

export function gov24Source(serviceKey: string | undefined, fetchImpl: Fetch = fetch): PolicySource {
  return {
    id: 'gov24',
    async fetchAll(regions, log = () => {}) {
      if (!serviceKey) throw new SourceError('no-key', 'DATA_GO_KR_API_KEY가 없어요.');
      const rows: any[] = [];
      let total = Infinity;
      for (let page = 1; page <= MAX_PAGES && (page - 1) * PAGE_SIZE < total; page++) {
        const params = new URLSearchParams({ serviceKey, page: String(page), perPage: String(PAGE_SIZE), returnType: 'JSON' });
        const { status, json } = await fetchJson(fetchImpl, `${ENDPOINT}?${params}`);
        if (status === 401 || status === 403 || json?.code === -4) throw new SourceError('invalid-key', '공공데이터포털 인증키가 거부됐어요.');
        if (status >= 400 || !json) throw new SourceError('error', `공공서비스 응답 오류 HTTP ${status}`);
        const list: any[] = json.data ?? [];
        total = Number(json.totalCount ?? list.length);
        rows.push(...list);
        if (list.length < PAGE_SIZE) break;
      }
      // 전체를 받은 뒤 지자체 행에서 소관기관코드 → 지역을 배워 출연기관 행에 써요.
      const codebook = buildCodebook(rows, regions);
      const out: RawPolicy[] = [];
      let skipped = 0;
      for (const r of rows) { const p = normalizeGov24(r, regions, codebook); if (p) out.push(p); else skipped++; }
      log(`정부 혜택 ${out.length}건 (전체 ${rows.length}건 중 개인 대상이 아니거나 지역을 모르는 ${skipped}건 제외)`);
      if (out.length === 0) throw new SourceError('error', '공공서비스 정보를 받지 못했어요.');
      return out;
    },
  };
}
