/**
 * 행정안전부 도로명주소 검색 API (business.juso.go.kr).
 * 주소 문자열을 법정동코드(admCd)로 바꿔요. 옛 주소(광주광역시 북구 등)를 넣어도
 * 지금 행정구역 이름과 코드로 돌려줘요.
 */
const ENDPOINT = 'https://business.juso.go.kr/addrlink/addrLinkApi.do';

export class JusoError extends Error {
  constructor(public code: string, message = code) { super(message); }
}

export interface JusoItem { siNm: string; sggNm: string; emdNm: string; admCd: string }

/** 검색어에 쓸 수 없는 특수문자와 SQL 예약어를 지워요(API 규칙). */
export function cleanKeyword(text: string) {
  return text
    .replace(/[%=><\[\]{}()'"`;\\|&^*!?#$~+]/g, ' ')
    .replace(/\b(OR|SELECT|INSERT|DELETE|UPDATE|CREATE|DROP|EXEC|UNION|FETCH|DECLARE|TRUNCATE)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

export async function jusoSearch(key: string, keyword: string, count = 5, fetchImpl: typeof fetch = fetch): Promise<{ total: number; items: JusoItem[] }> {
  const q = cleanKeyword(keyword);
  if (q.length < 2) throw new JusoError('JUSO_SHORT');
  const params = new URLSearchParams({ confmKey: key, currentPage: '1', countPerPage: String(count), keyword: q, resultType: 'json' });
  let res: Response;
  try { res = await fetchImpl(`${ENDPOINT}?${params}`, { signal: AbortSignal.timeout(10_000) }); }
  catch { throw new JusoError('JUSO_NETWORK'); }
  if (!res.ok) throw new JusoError(`JUSO_HTTP_${res.status}`);
  const json: any = await res.json().catch(() => null);
  const common = json?.results?.common;
  if (!common) throw new JusoError('JUSO_BAD_RESPONSE');
  if (String(common.errorCode) !== '0') throw new JusoError(`JUSO_${common.errorCode}`, String(common.errorMessage ?? ''));
  const items: JusoItem[] = (json.results.juso ?? []).map((j: any) => ({
    siNm: String(j.siNm ?? ''), sggNm: String(j.sggNm ?? ''), emdNm: String(j.emdNm ?? ''), admCd: String(j.admCd ?? ''),
  }));
  return { total: Number(common.totalCount ?? items.length), items };
}
