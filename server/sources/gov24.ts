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

/** "2026.03.01 ~ 2026.03.31", "상시신청", "예산 소진 시까지" → 신청 기간 */
export function parseDeadline(text: string): Pick<Policy, 'applyStart' | 'applyEnd' | 'applyCode'> {
  const t = text.replace(/\s+/g, ' ');
  if (/상시/.test(t)) return { applyStart: null, applyEnd: null, applyCode: 'always' };
  const dates = [...t.matchAll(/(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/g)].map(m => normalizeDate(`${m[1]}-${m[2]}-${m[3]}`)).filter((d): d is string => !!d);
  if (dates.length >= 2) return { applyStart: dates[0], applyEnd: dates[dates.length - 1], applyCode: 'period' };
  if (dates.length === 1) return /까지|마감|~/.test(t) ? { applyStart: null, applyEnd: dates[0], applyCode: 'period' } : { applyStart: dates[0], applyEnd: null, applyCode: 'period' };
  return { applyStart: null, applyEnd: null, applyCode: null };
}

/** 소관기관 유형·이름으로 지역을 정해요. 지자체인데 지역을 못 찾으면 null(목록에서 빼요). */
export function regionOfAgency(type: string, name: string, dept: string, regions: RegionIndex): Pick<Policy, 'scope' | 'sido' | 'sgg'> | null {
  const local = /지방|자치|시도|시군구|광역|기초/.test(type);
  const parsed = regions.parseAddress(name) ?? regions.parseAddress(`${name} ${dept}`.trim());
  if (parsed) return { scope: 'regional', sido: [parsed.sido.code], sgg: parsed.sgg && parsed.sido.sgg.length > 1 ? [parsed.sgg.code] : [] };
  return local ? null : { scope: 'national', sido: [], sgg: [] };
}

export function normalizeGov24(r: any, regions: RegionIndex): RawPolicy | null {
  const id = get(r, '서비스ID');
  const title = clip(get(r, '서비스명'), 120);
  if (!id || !title) return null;
  const users = get(r, '사용자구분');
  if (users && !/개인|가구/.test(users)) return null;
  const region = regionOfAgency(get(r, '소관기관유형'), get(r, '소관기관명'), get(r, '부서명'), regions);
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
    ...parseDeadline(get(r, '신청기한')),
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
      const out: RawPolicy[] = [];
      let total = Infinity, skipped = 0;
      for (let page = 1; page <= MAX_PAGES && (page - 1) * PAGE_SIZE < total; page++) {
        const params = new URLSearchParams({ serviceKey, page: String(page), perPage: String(PAGE_SIZE), returnType: 'JSON' });
        const { status, json } = await fetchJson(fetchImpl, `${ENDPOINT}?${params}`);
        if (status === 401 || status === 403 || json?.code === -4) throw new SourceError('invalid-key', '공공데이터포털 인증키가 거부됐어요.');
        if (status >= 400 || !json) throw new SourceError('error', `공공서비스 응답 오류 HTTP ${status}`);
        const list: any[] = json.data ?? [];
        total = Number(json.totalCount ?? list.length);
        for (const r of list) { const p = normalizeGov24(r, regions); if (p) out.push(p); else skipped++; }
        if (list.length < PAGE_SIZE) break;
      }
      log(`정부 혜택 ${out.length}건 (개인 대상이 아니거나 지역을 모르는 ${skipped}건 제외)`);
      if (out.length === 0) throw new SourceError('error', '공공서비스 정보를 받지 못했어요.');
      return out;
    },
  };
}
