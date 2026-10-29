/** 앱과 서버가 같이 쓰는 정책 모델, 정렬·필터 규칙, 표시 문구 */

export type Source = 'youth' | 'gov24';
export type Field = 'job' | 'housing' | 'education' | 'welfare' | 'health' | 'culture' | 'participation' | 'etc';
export type SortKey = 'deadline' | 'recent' | 'popular' | 'name';
export type ApplyState = 'open' | 'always' | 'upcoming' | 'closed' | 'unknown';

export interface Policy {
  id: string;
  source: Source;
  title: string;
  agency: string;
  summary: string;
  benefit: string;
  target: string;
  how: string;
  field: Field;
  /** 전국 정책이면 national. 지역 정책은 sido·sgg 코드가 있어요. */
  scope: 'national' | 'regional';
  sido: string[];
  /** 비어 있으면 시·도 전체 대상이에요. */
  sgg: string[];
  applyStart: string | null;
  applyEnd: string | null;
  /** 원 데이터가 알려 준 신청 상태. 날짜보다 먼저 봐요. */
  applyCode: 'period' | 'always' | 'closed' | null;
  ageMin: number | null;
  ageMax: number | null;
  views: number;
  registeredAt: string | null;
  firstSeenAt: string;
  url: string;
}

export const FIELD_LABELS: Record<Field, string> = {
  job: '일자리', housing: '주거', education: '교육', welfare: '생활·복지', health: '건강·출산',
  culture: '문화·환경', participation: '참여·권리', etc: '기타',
};
export const SOURCE_LABELS: Record<Source, string> = { youth: '청년정책', gov24: '정부 혜택' };
export const SORT_LABELS: Record<SortKey, string> = { deadline: '마감 임박순', recent: '최근 등록순', popular: '조회 많은순', name: '이름순' };
export const SORT_KEYS = Object.keys(SORT_LABELS) as SortKey[];
export const FIELDS = Object.keys(FIELD_LABELS) as Field[];

/** 온통청년 대분류·정부24 서비스분야 → 앱 분야. 앞 이름(대분류)을 먼저 보고, 모르면 다음 이름을 봐요. */
export function toField(...names: (string | undefined | null)[]): Field {
  for (const n of names) { const f = fieldOf(n ?? ''); if (f !== 'etc') return f; }
  return 'etc';
}
function fieldOf(t: string): Field {
  if (/일자리|고용|창업|취업/.test(t)) return 'job';
  if (/주거|주택|임대/.test(t)) return 'housing';
  if (/교육|보육|학자금/.test(t)) return 'education';
  if (/참여|권리/.test(t)) return 'participation';
  if (/보건|의료|임신|출산|건강/.test(t)) return 'health';
  if (/복지|생활안정|돌봄|보호|자립/.test(t)) return 'welfare';
  if (/문화|환경|체육|여가/.test(t)) return 'culture';
  return 'etc';
}

/** 한국 날짜(YYYY-MM-DD) */
export const kstDate = (d: Date = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(d);

/** "20260101", "2026-01-01", "2026.1.1" → "2026-01-01". 날짜가 아니면 null. */
export function normalizeDate(s: string | undefined | null): string | null {
  const m = String(s ?? '').trim().match(/^(\d{4})[.\-/]?\s*(\d{1,2})[.\-/]?\s*(\d{1,2})/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function applyState(p: Pick<Policy, 'applyStart' | 'applyEnd' | 'applyCode'>, today = kstDate()): ApplyState {
  if (p.applyCode === 'closed') return 'closed';
  if (p.applyCode === 'always') return 'always';
  if (p.applyEnd && p.applyEnd < today) return 'closed';
  if (p.applyStart && p.applyStart > today) return 'upcoming';
  if (p.applyEnd || p.applyStart) return 'open';
  return 'unknown';
}

/** 오늘부터 마감까지 남은 날(오늘 마감이면 0) */
export function daysLeft(end: string | null, today = kstDate()): number | null {
  if (!end) return null;
  return Math.round((Date.parse(end) - Date.parse(today)) / 86_400_000);
}

/** 목록 배지: "D-3", "오늘 마감", "상시", "마감", "6월 1일 시작" */
export function applyLabel(p: Pick<Policy, 'applyStart' | 'applyEnd' | 'applyCode'>, today = kstDate()): string {
  const st = applyState(p, today);
  if (st === 'always') return '상시';
  if (st === 'closed') return '마감';
  if (st === 'upcoming' && p.applyStart) return `${monthDay(p.applyStart)} 시작`;
  const left = daysLeft(p.applyEnd, today);
  if (left === null) return st === 'unknown' ? '기간 확인' : '신청 중';
  return left === 0 ? '오늘 마감' : `D-${left}`;
}

export const monthDay = (ymd: string) => `${Number(ymd.slice(5, 7))}월 ${Number(ymd.slice(8, 10))}일`;

export interface PolicyQuery {
  sido?: string;
  sgg?: string;
  field?: Field;
  source?: Source;
  /** 청년 대상만(온통청년 정책 + 제목·대상에 "청년"이 있는 혜택) */
  youth?: boolean;
  /** 신청할 수 있는 것만(마감 제외) */
  open?: boolean;
  /** 전국 정책을 함께 볼지 */
  national?: boolean;
  q?: string;
  sort?: SortKey;
}

export function matchesRegion(p: Pick<Policy, 'scope' | 'sido' | 'sgg'>, sido?: string, sgg?: string, national = true) {
  if (!sido) return true;
  if (p.scope === 'national') return national;
  if (!p.sido.includes(sido)) return false;
  if (!sgg || p.sgg.length === 0) return true;
  return p.sgg.includes(sgg);
}

/** 청년 대상 정책인지. 온통청년 정책은 모두 청년 대상이에요. 가벼운 목록은 서버가 미리 계산한 youth 값을 써요. */
export const isYouth = (p: PolicyBase) => p.youth ?? (p.source === 'youth' || /청년/.test(`${p.title} ${p.target ?? ''} ${p.summary ?? ''}`));

/** 목록·정렬·조건에 필요한 칸만. 앱은 지역마다 이 목록을 한 번 받아 기기에서 바로 걸러요. */
export type PolicyBase = Pick<Policy, 'id' | 'source' | 'title' | 'agency' | 'field' | 'scope' | 'sido' | 'sgg' | 'applyStart' | 'applyEnd' | 'applyCode' | 'views' | 'registeredAt' | 'firstSeenAt'>
  & { youth?: boolean; summary?: string; target?: string };
export type PolicyLite = PolicyBase & { youth: boolean };

/** 가벼운 목록의 칸 순서. 칸 이름을 줄마다 반복하지 않아 크기가 1/3로 줄어요. */
export const LITE_FIELDS = ['id', 'source', 'title', 'agency', 'field', 'scope', 'sido', 'sgg', 'applyStart', 'applyEnd', 'applyCode', 'views', 'registeredAt', 'firstSeenAt', 'youth'] as const;
export const toLiteRow = (p: Policy) => LITE_FIELDS.map(k => (k === 'youth' ? isYouth(p) : p[k]));
export function fromLiteRows(rows: unknown[][]): PolicyLite[] {
  return rows.map(r => Object.fromEntries(LITE_FIELDS.map((k, i) => [k, r[i]])) as unknown as PolicyLite);
}

export interface PolicyIndexResponse {
  version: string;
  updatedAt: string | null;
  sources: SourceStatus[];
  fields: typeof LITE_FIELDS;
  rows: unknown[][];
}

export function filterPolicies<T extends PolicyBase>(list: T[], q: PolicyQuery, today = kstDate()): T[] {
  const words = (q.q ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter(p =>
    matchesRegion(p, q.sido, q.sgg, q.national !== false)
    && (!q.field || p.field === q.field)
    && (!q.source || p.source === q.source)
    && (!q.youth || isYouth(p))
    && (!q.open || applyState(p, today) !== 'closed')
    && words.every(w => `${p.title} ${p.agency} ${p.summary ?? ''}`.toLowerCase().includes(w)));
}

/** 이번 주(7일) 안에 원 데이터에 등록됐고 아직 신청할 수 있는 정책 수 */
export function freshCount<T extends PolicyBase>(list: T[], today = kstDate()) {
  const weekAgo = kstDate(new Date(Date.parse(today) - 7 * 86400_000));
  return list.filter(p => (p.registeredAt ?? '') >= weekAgo && applyState(p, today) !== 'closed').length;
}

const STATE_RANK: Record<ApplyState, number> = { open: 0, upcoming: 1, always: 2, unknown: 3, closed: 4 };
/** 한글 이름 비교기는 한 번만 만들어요. localeCompare(…, 'ko')를 매번 부르면 1만 건 정렬이 수십 배 느려져요. */
const koCollator = new Intl.Collator('ko');
const byName = (a: PolicyBase, b: PolicyBase) => koCollator.compare(a.title, b.title);
const registered = (p: PolicyBase) => p.registeredAt ?? p.firstSeenAt;

export function sortPolicies<T extends PolicyBase>(list: T[], sort: SortKey = 'deadline', today = kstDate()): T[] {
  const out = [...list];
  if (sort === 'name') return out.sort(byName);
  if (sort === 'recent') return out.sort((a, b) => (registered(a) < registered(b) ? 1 : registered(a) > registered(b) ? -1 : byName(a, b)));
  if (sort === 'popular') return out.sort((a, b) => b.views - a.views || byName(a, b));
  // 마감 임박순: 신청 중(마감일 가까운 순) → 곧 시작 → 상시 → 기간 미상 → 마감. 상태는 한 번만 계산해요.
  const st = new Map(out.map(p => [p, applyState(p, today)]));
  const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
  return out.sort((a, b) => {
    const sa = st.get(a)!, sb = st.get(b)!;
    if (sa !== sb) return STATE_RANK[sa] - STATE_RANK[sb];
    if (sa === 'open') return cmp(a.applyEnd ?? '9999', b.applyEnd ?? '9999') || byName(a, b);
    if (sa === 'upcoming') return cmp(a.applyStart ?? '', b.applyStart ?? '') || byName(a, b);
    if (sa === 'closed') return cmp(b.applyEnd ?? '', a.applyEnd ?? '') || byName(a, b);
    return b.views - a.views || byName(a, b);
  });
}

export function parseQuery(input: Record<string, unknown>): PolicyQuery {
  const s = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : undefined);
  const sido = s('sido'), sgg = s('sgg'), field = s('field'), source = s('source'), sort = s('sort');
  return {
    sido: sido && /^\d{2}$/.test(sido) ? sido : undefined,
    sgg: sgg && /^\d{5}$/.test(sgg) ? sgg : undefined,
    field: field && field in FIELD_LABELS ? (field as Field) : undefined,
    source: source && source in SOURCE_LABELS ? (source as Source) : undefined,
    open: s('open') === '1' || s('open') === 'true',
    youth: s('youth') === '1' || s('youth') === 'true',
    national: s('national') !== '0' && s('national') !== 'false',
    q: (s('q') ?? '').slice(0, 40) || undefined,
    sort: sort && sort in SORT_LABELS ? (sort as SortKey) : 'deadline',
  };
}

export interface SourceStatus { source: Source; state: 'ok' | 'no-key' | 'invalid-key' | 'error'; count: number; checkedAt: string | null }

export interface PolicyListResponse {
  items: Policy[];
  total: number;
  /** 이번 조건에서 최근 7일 안에 새로 올라온 정책 수 */
  fresh: number;
  sources: SourceStatus[];
  updatedAt: string | null;
}

export interface SubscriptionState {
  subscribed: boolean;
  region: { sido: string; sgg: string | null } | null;
  since: string | null;
}
