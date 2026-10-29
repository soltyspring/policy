/**
 * 온통청년 청년정책 API (한국고용정보원)
 *   GET https://www.youthcenter.go.kr/go/ythip/getPlcy?apiKeyNm=&rtnType=json&pageNum=&pageSize=
 * 전체 목록(약 2,700건)을 100건씩 받아요.
 */
import { normalizeDate, toField, type Policy } from '../../shared/policy.ts';
import type { RegionIndex } from '../../shared/regions.ts';
import { clip, fetchJson, httpsUrl, SourceError, type Fetch, type PolicySource, type RawPolicy } from './types.ts';

const ENDPOINT = 'https://www.youthcenter.go.kr/go/ythip/getPlcy';
const PAGE_SIZE = 100;
const MAX_PAGES = 80;
/** 지역 코드가 이만큼 넘으면 전국 사업으로 봐요(시·군·구가 230곳 정도예요). */
const NATIONWIDE_MIN = 150;

/** 신청기간 구분 코드: 0057001 특정기간 · 0057002 상시 · 0057003 마감 */
const APPLY_CODE: Record<string, Policy['applyCode']> = { '0057001': 'period', '0057002': 'always', '0057003': 'closed' };

const age = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 && n < 120 ? n : null; };

/** zipCd("11110,11140,…") → 전국/지역, 지금 시·도·시·군·구 코드 */
export function regionOfCodes(codes: string[], regions: RegionIndex): Pick<Policy, 'scope' | 'sido' | 'sgg'> {
  const clean = [...new Set(codes.map(c => c.trim()).filter(c => /^\d{5}$/.test(c)))];
  const sidoSet = new Set(clean.map(c => regions.currentSidoCode(c.slice(0, 2))).filter((c): c is string => !!c));
  if (clean.length >= NATIONWIDE_MIN || sidoSet.size >= regions.data.sido.length - 1) return { scope: 'national', sido: [], sgg: [] };
  if (sidoSet.size === 0) return { scope: 'national', sido: [], sgg: [] };
  const sgg = new Set(clean.flatMap(c => regions.resolveSgg(c)));
  // 시·도의 모든 시·군·구가 들어 있으면 시·도 전체 정책으로 봐요.
  const wholeSido = [...sidoSet].every(code => regions.sidoByCode.get(code)!.sgg.every(s => sgg.has(s.code)));
  return { scope: 'regional', sido: [...sidoSet].sort(), sgg: wholeSido ? [] : [...sgg].sort() };
}

export function normalizeYouth(r: any, regions: RegionIndex): RawPolicy | null {
  const id = String(r?.plcyNo ?? '').trim();
  const title = clip(r?.plcyNm, 120);
  if (!id || !title) return null;
  const m = String(r.aplyYmd ?? '').match(/(\d{8})\s*~\s*(\d{8})/);
  const bizEnd = normalizeDate(r.bizPrdEndYmd);
  let region = regionOfCodes(String(r.zipCd ?? '').split(','), regions);
  // 코드가 없으면 주관기관 이름으로 지역을 찾아요(예: "부산광역시 해운대구").
  if (!String(r.zipCd ?? '').trim()) {
    const parsed = regions.parseAddress(String(r.rgtrInstCdNm || r.sprvsnInstCdNm || ''));
    if (parsed) region = { scope: 'regional', sido: [parsed.sido.code], sgg: parsed.sgg ? [parsed.sgg.code] : [] };
  }
  const end = m ? normalizeDate(m[2]) : null;
  const noAgeLimit = String(r.sprtTrgtAgeLmtYn ?? '').toUpperCase() === 'N';
  return {
    id: `y-${id}`,
    source: 'youth',
    title,
    agency: clip(r.sprvsnInstCdNm || r.operInstCdNm || r.rgtrInstCdNm || '온통청년', 60),
    summary: clip(r.plcyExplnCn, 200),
    benefit: clip(r.plcySprtCn, 400),
    target: clip([r.addAplyQlfcCndCn, r.ptcpPrpTrgtCn].filter(Boolean).join(' '), 300),
    how: clip(r.plcyAplyMthdCn, 300),
    field: toField(r.lclsfNm, r.mclsfNm),
    ...region,
    applyStart: m ? normalizeDate(m[1]) : null,
    // 신청 마감일이 없으면 사업 종료일을 마감으로 봐요.
    applyEnd: end ?? (APPLY_CODE[String(r.aplyPrdSeCd ?? '').trim()] === 'always' ? null : bizEnd),
    applyCode: APPLY_CODE[String(r.aplyPrdSeCd ?? '').trim()] ?? null,
    ageMin: noAgeLimit ? null : age(r.sprtTrgtMinAge),
    ageMax: noAgeLimit ? null : age(r.sprtTrgtMaxAge),
    views: Number(r.inqCnt) || 0,
    registeredAt: normalizeDate(r.frstRegDt),
    url: httpsUrl(r.aplyUrlAddr, r.refUrlAddr1, r.refUrlAddr2) ?? `https://www.youthcenter.go.kr/youthPolicy/ythPlcyDetail?plcyNo=${encodeURIComponent(id)}`,
  };
}

export function youthSource(apiKey: string | undefined, fetchImpl: Fetch = fetch): PolicySource {
  return {
    id: 'youth',
    async fetchAll(regions, log = () => {}) {
      if (!apiKey) throw new SourceError('no-key', 'YOUTH_API_KEY가 없어요.');
      const out: RawPolicy[] = [];
      let total = Infinity;
      for (let page = 1; page <= MAX_PAGES && (page - 1) * PAGE_SIZE < total; page++) {
        const params = new URLSearchParams({ apiKeyNm: apiKey, rtnType: 'json', pageNum: String(page), pageSize: String(PAGE_SIZE) });
        const { status, json } = await fetchJson(fetchImpl, `${ENDPOINT}?${params}`);
        if (json?.errorCode === 'e001' || status === 401 || status === 403) throw new SourceError('invalid-key', '온통청년 인증키가 거부됐어요.');
        if (status >= 400 || !json) throw new SourceError('error', `온통청년 응답 오류 HTTP ${status}`);
        const list: any[] = json?.result?.youthPolicyList ?? [];
        total = Number(json?.result?.pagging?.totCount ?? json?.result?.paging?.totCount ?? list.length);
        for (const r of list) { const p = normalizeYouth(r, regions); if (p) out.push(p); }
        if (list.length < PAGE_SIZE) break;
      }
      log(`온통청년 ${out.length}건`);
      if (out.length === 0) throw new SourceError('error', '온통청년에서 정책을 받지 못했어요.');
      return out;
    },
  };
}
