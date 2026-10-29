import type { Policy } from '../shared/policy';
import type { RegionIndex } from '../shared/regions';

export interface Picked { sido: string | null; sgg: string | null }

/** 고른 지역 이름: "전남광주 북구", "서울 전체", "전국" */
export function pickedLabel(p: Picked, idx: RegionIndex, long = false) {
  const sido = p.sido ? idx.sidoByCode.get(p.sido) : undefined;
  if (!sido) return '전국';
  const sgg = p.sgg ? sido.sgg.find(s => s.code === p.sgg) : undefined;
  if (sido.code === '36') return long ? sido.name : sido.short;
  const name = long ? sido.name : sido.short;
  return sgg ? `${name} ${sgg.name}` : long ? name : `${name} 전체`;
}

/** 정책 대상 지역 이름: "전국", "서울 전체", "서울 강남구", "경기 수원시 외 2곳" */
export function policyRegionLabel(p: Policy, idx: RegionIndex) {
  if (p.scope === 'national') return '전국';
  if (p.sgg.length) {
    const first = idx.byCode.get(p.sgg[0]);
    const name = first ? (first.sido.code === '36' ? first.sido.short : `${first.sido.short} ${first.sgg.name}`) : '지역';
    return p.sgg.length > 1 ? `${name} 외 ${p.sgg.length - 1}곳` : name;
  }
  const first = idx.sidoByCode.get(p.sido[0]);
  const name = first ? first.short : '지역';
  return p.sido.length > 1 ? `${name} 외 ${p.sido.length - 1}곳` : `${name} 전체`;
}

/**
 * 목록 제목은 줄마다 달라야 해요. 같은 이름의 정책(여러 구에서 하는 "청년 월세 지원" 등)은
 * 지역이나 기관 이름을 붙여서 구분해요.
 */
export function uniqueTitles(list: Policy[], idx: RegionIndex): string[] {
  const count = new Map<string, number>();
  for (const p of list) count.set(p.title, (count.get(p.title) ?? 0) + 1);
  const used = new Set<string>();
  return list.map(p => {
    let t = p.title;
    if ((count.get(t) ?? 0) > 1) t = `${p.title} · ${policyRegionLabel(p, idx)}`;
    if (used.has(t)) t = `${p.title} · ${p.agency}`;
    for (let i = 2; used.has(t); i++) t = `${p.title} (${i})`;
    used.add(t);
    return t;
  });
}

/** 목록 둘째 줄: "교육부 · 전국". 기관 이름에 지역이 이미 들어 있으면("서울특별시 강남구") 지역은 빼요. */
export function metaLine(p: Policy, idx: RegionIndex) {
  const region = policyRegionLabel(p, idx);
  if (p.scope === 'regional') {
    const sido = idx.sidoByCode.get(p.sido[0]);
    const sgg = p.sgg.length === 1 ? idx.byCode.get(p.sgg[0])?.sgg : undefined;
    const sameSido = p.sido.length === 1 && !!sido && p.agency.includes(sido.name);
    if (sameSido && (p.sgg.length === 0 || (sgg && p.agency.includes(sgg.name)))) return p.agency;
  }
  return `${p.agency} · ${region}`;
}

export const ageLabel = (p: Policy) =>
  p.ageMin && p.ageMax ? `만 ${p.ageMin}~${p.ageMax}세` : p.ageMin ? `만 ${p.ageMin}세 이상` : p.ageMax ? `만 ${p.ageMax}세 이하` : null;

export const periodLabel = (p: Policy) => {
  if (p.applyCode === 'always') return '상시 신청';
  const f = (d: string) => `${d.slice(0, 4)}.${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}`;
  if (p.applyStart && p.applyEnd) return `${f(p.applyStart)} ~ ${f(p.applyEnd)}`;
  if (p.applyEnd) return `${f(p.applyEnd)}까지`;
  if (p.applyStart) return `${f(p.applyStart)}부터`;
  return p.applyCode === 'closed' ? '신청 마감' : '공식 페이지에서 확인';
};
