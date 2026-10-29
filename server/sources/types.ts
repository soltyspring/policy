import type { Policy, Source } from '../../shared/policy.ts';
import type { RegionIndex } from '../../shared/regions.ts';

/** 수집한 정책. firstSeenAt은 저장소가 채워요. */
export type RawPolicy = Omit<Policy, 'firstSeenAt'>;

export class SourceError extends Error {
  constructor(public state: 'no-key' | 'invalid-key' | 'error', message: string) { super(message); }
}

export interface PolicySource {
  id: Source;
  /** 전체 목록을 받아요. 키가 없거나 틀리면 SourceError를 던져요. */
  fetchAll(regions: RegionIndex, log?: (m: string) => void): Promise<RawPolicy[]>;
}

export type Fetch = typeof fetch;

/** 한 번 실패하면 잠깐 쉬고 다시 시도해요. */
export async function fetchJson(fetchImpl: Fetch, url: string, timeoutMs = 30_000): Promise<{ status: number; json: any }> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json' } });
      const json = await res.json().catch(() => null);
      if (res.status >= 500 && attempt < 2) { await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); continue; }
      return { status: res.status, json };
    } catch (e) {
      last = e;
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw new SourceError('error', `연결하지 못했어요: ${(last as Error)?.message ?? 'unknown'}`);
}

export const clip = (s: unknown, n: number) => {
  const t = decodeEntities(String(s ?? '')).replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};

/** 공공 API 문자열에 남아 있는 HTML 엔티티(&amp;#39; 등)를 풀어요. */
export function decodeEntities(s: string) {
  let out = s;
  for (let i = 0; i < 2; i++) {
    out = out
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&');
  }
  return out;
}

export const httpsUrl = (...candidates: unknown[]) => {
  for (const c of candidates) {
    const u = String(c ?? '').trim();
    if (/^https?:\/\/[^\s]+$/i.test(u)) return u.replace(/^http:\/\//i, 'https://');
  }
  return null;
};
