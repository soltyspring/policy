import raw from './regions.json';

/** 시·군·구. 일반구가 있는 시(수원시 등)는 `codes`에 구 코드가 함께 들어 있어요. */
export interface Sgg { code: string; name: string; codes: string[]; gu?: string[] }
export interface Sido { code: string; name: string; short: string; sgg: Sgg[] }
export interface RegionData { updatedAt: string; source: string; sido: Sido[] }

export const REGIONS = raw as RegionData;

/** 옛 시·도 코드 → 지금 코드. 정책 데이터에 옛 코드가 남아 있는 경우가 있어요. */
export const LEGACY_SIDO: Record<string, string> = { '42': '51', '45': '52', '29': '12', '46': '12' };

/** 옛 이름·줄임말 → 지금 시·도 이름 */
export const SIDO_ALIASES: Record<string, string> = {
  서울: '서울특별시', 서울시: '서울특별시', 부산: '부산광역시', 부산시: '부산광역시', 대구: '대구광역시', 대구시: '대구광역시',
  인천: '인천광역시', 인천시: '인천광역시', 대전: '대전광역시', 대전시: '대전광역시', 울산: '울산광역시', 울산시: '울산광역시',
  세종: '세종특별자치시', 세종시: '세종특별자치시', 경기: '경기도', 강원: '강원특별자치도', 강원도: '강원특별자치도',
  충북: '충청북도', 충남: '충청남도', 전북: '전북특별자치도', 전라북도: '전북특별자치도', 경북: '경상북도', 경남: '경상남도',
  제주: '제주특별자치도', 제주도: '제주특별자치도',
  광주광역시: '전남광주통합특별시', 광주: '전남광주통합특별시', 광주시: '전남광주통합특별시', 전라남도: '전남광주통합특별시', 전남: '전남광주통합특별시',
  전남광주: '전남광주통합특별시', 광주특별시: '전남광주통합특별시',
};

/**
 * 코드가 통째로 바뀐 옛 시·군·구 → 지금 이름 후보.
 * 광주·전남은 2026년 7월 통합으로 코드가 12로 바뀌었고, 인천 중구·동구·서구는 같은 달 구가 나뉘었어요.
 * 지금 목록에 없는 이름은 무시해요.
 */
const LEGACY_SGG_NAMES: Record<string, string[]> = {
  '29110': ['동구'], '29140': ['서구'], '29155': ['남구'], '29170': ['북구'], '29200': ['광산구'],
  '46110': ['목포시'], '46130': ['여수시'], '46150': ['순천시'], '46170': ['나주시'], '46230': ['광양시'],
  '46710': ['담양군'], '46720': ['곡성군'], '46730': ['구례군'], '46770': ['고흥군'], '46780': ['보성군'],
  '46790': ['화순군'], '46800': ['장흥군'], '46810': ['강진군'], '46820': ['해남군'], '46830': ['영암군'],
  '46840': ['무안군'], '46860': ['함평군'], '46870': ['영광군'], '46880': ['장성군'], '46890': ['완도군'],
  '46900': ['진도군'], '46910': ['신안군'],
  '28110': ['중구', '제물포구', '영종구'], '28140': ['동구', '제물포구'], '28260': ['서구', '서해구', '검단구'],
};

export function createRegionIndex(data: RegionData = REGIONS) {
  const sidoByCode = new Map(data.sido.map(s => [s.code, s]));
  const sidoByName = new Map(data.sido.map(s => [s.name, s]));
  /** 모든 5자리 코드(일반구 포함) → [시·도, 시·군·구] */
  const byCode = new Map<string, { sido: Sido; sgg: Sgg }>();
  for (const sido of data.sido) for (const sgg of sido.sgg) for (const c of sgg.codes) byCode.set(c, { sido, sgg });

  const sidoOfName = (name: string) => sidoByName.get(name) ?? sidoByName.get(SIDO_ALIASES[name] ?? '');
  const currentSidoCode = (code: string) => (sidoByCode.has(code) ? code : LEGACY_SIDO[code] && sidoByCode.has(LEGACY_SIDO[code]) ? LEGACY_SIDO[code] : null);

  /** 정책의 5자리 코드 하나 → 지금 시·군·구 코드들. 모르면 빈 배열. */
  function resolveSgg(code: string): string[] {
    const hit = byCode.get(code);
    if (hit) return [hit.sgg.code];
    const names = LEGACY_SGG_NAMES[code];
    const sidoCode = currentSidoCode(code.slice(0, 2));
    if (names && sidoCode) {
      const sido = sidoByCode.get(sidoCode)!;
      const found = names.map(n => sido.sgg.find(s => s.name === n)?.code).filter((c): c is string => !!c);
      if (found.length) return [...new Set(found)];
    }
    if (sidoCode && sidoCode !== code.slice(0, 2)) {
      const moved = byCode.get(sidoCode + code.slice(2));
      if (moved) return [moved.sgg.code];
    }
    return [];
  }

  /**
   * 주소나 기관명에서 시·도와 시·군·구를 찾아요.
   * "전남광주통합특별시 북구 용봉로 77", "광주광역시 북구", "경기도 수원시 장안구", "서울 강남구" 모두 돼요.
   */
  function parseAddress(text: string): { sido: Sido; sgg: Sgg | null; ambiguous: Sgg[] } | null {
    const tokens = text.replace(/[(),]/g, ' ').split(/\s+/).filter(Boolean);
    if (!tokens.length) return null;
    let sido = sidoOfName(tokens[0]);
    let rest = tokens.slice(1);
    // "서울특별시강남구"처럼 붙어 있으면 앞부분을 시·도로 떼어 봐요.
    if (!sido) {
      for (const name of [...data.sido.map(s => s.name), ...Object.keys(SIDO_ALIASES)].sort((a, b) => b.length - a.length)) {
        if (tokens[0].startsWith(name) && tokens[0].length > name.length) { sido = sidoOfName(name); rest = [tokens[0].slice(name.length), ...rest]; break; }
      }
    }
    if (!sido) return null;
    if (sido.sgg.length === 1 && sido.code === '36') return { sido, sgg: sido.sgg[0], ambiguous: [] };
    const first = rest[0] ?? '';
    const sgg = sido.sgg.find(s => s.name === first) ?? null;
    if (sgg) return { sido, sgg, ambiguous: [] };
    // 인천 중구·동구처럼 나뉜 옛 구는 정할 수 없어서 후보만 알려 줘요.
    const legacy = Object.entries(LEGACY_SGG_NAMES).find(([code, names]) => currentSidoCode(code.slice(0, 2)) === sido!.code && names[0] === first);
    const ambiguous = legacy ? legacy[1].slice(1).map(n => sido!.sgg.find(s => s.name === n)).filter((s): s is Sgg => !!s) : [];
    return { sido, sgg: ambiguous.length === 1 ? ambiguous[0] : null, ambiguous: ambiguous.length > 1 ? ambiguous : [] };
  }

  /**
   * 입력한 글자로 시·도·시·군·구를 바로 찾아요(서버 없이). "강남구", "수원", "광주", "전남광주 북구" 모두 돼요.
   * 주소 API는 "강남구"처럼 구 이름만 넣으면 찾지 못해서, 이름 검색은 여기서 해요.
   */
  function searchRegions(input: string, limit = 8): { sido: Sido; sgg: Sgg | null; gu?: string }[] {
    const q = input.replace(/\s+/g, '');
    if (q.length < 1) return [];
    const out: { sido: Sido; sgg: Sgg | null; gu?: string; score: number }[] = [];
    const aliasSido = sidoOfName(q);
    for (const sido of data.sido) {
      const sidoNames = [sido.name, sido.short, ...Object.entries(SIDO_ALIASES).filter(([, v]) => v === sido.name).map(([k]) => k)];
      const sidoHit = aliasSido === sido ? 0 : sidoNames.some(n => n.startsWith(q)) ? 1 : -1;
      if (sidoHit >= 0) out.push({ sido, sgg: null, score: sidoHit });
      for (const sgg of sido.sgg) {
        if (sido.code === '36') continue;
        const names = [sgg.name, sgg.name.replace(/(시|군|구)$/, '')];
        const combos = sidoNames.flatMap(s => names.map(n => `${s}${n}`));
        let score = names.includes(q) || combos.includes(q) ? 2 : names.some(n => n.startsWith(q)) || combos.some(c => c.startsWith(q)) ? 3 : -1;
        let gu: string | undefined;
        // 일반구 이름("장안구", "포항 북구")으로 찾으면 어느 구인지 함께 보여 줘요.
        if (score < 0) for (const g of sgg.gu ?? []) {
          const guNames = [g, `${sgg.name}${g}`, `${sgg.name.replace(/시$/, '')}${g}`];
          if (guNames.includes(q)) { score = 2; gu = g; break; }
          if (q.length >= 2 && guNames.some(n => n.startsWith(q))) { score = 3; gu = g; break; }
        }
        if (score >= 0 && !(q.length < 2 && score > 2)) out.push({ sido, sgg, gu, score });
      }
    }
    return out.sort((a, b) => a.score - b.score || (a.gu ? 1 : 0) - (b.gu ? 1 : 0)).slice(0, limit).map(({ sido, sgg, gu }) => ({ sido, sgg, gu }));
  }

  return { data, sidoByCode, byCode, resolveSgg, currentSidoCode, parseAddress, sidoOfName, searchRegions };
}
export type RegionIndex = ReturnType<typeof createRegionIndex>;
