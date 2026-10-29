import type { Policy, PolicyIndexResponse, PolicyListResponse, PolicyQuery, SubscriptionState } from '../shared/policy';
import type { RegionData } from '../shared/regions';

const BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const TOKEN_KEY = 'policy:session:v1';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function call<T>(path: string, init: RequestInit = {}, auth = false): Promise<T> {
  const headers: Record<string, string> = { ...(init.body ? { 'content-type': 'application/json' } : {}) };
  if (auth) {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) throw new ApiError(401, '다시 연결해 주세요.');
    headers.authorization = `Bearer ${token}`;
  }
  let res: Response;
  try { res = await fetch(BASE + path, { ...init, headers, signal: init.signal ?? AbortSignal.timeout(15000) }); }
  catch (e) {
    if ((e as Error).name === 'AbortError' && init.signal?.aborted) throw e;
    throw new ApiError(0, '인터넷 연결을 확인해 주세요.');
  }
  const body = await res.json().catch(() => null);
  if (res.status === 401 && auth) localStorage.removeItem(TOKEN_KEY);
  if (!res.ok) throw new ApiError(res.status, body?.error || '잠시 후 다시 시도해 주세요.');
  return body as T;
}

export type ListResponse = PolicyListResponse & { open: number };
export interface AppConfig { notify: boolean; intervalHours: number }

export function queryString(q: PolicyQuery & { offset?: number; limit?: number }) {
  const p = new URLSearchParams();
  if (q.sido) p.set('sido', q.sido);
  if (q.sgg) p.set('sgg', q.sgg);
  if (q.field) p.set('field', q.field);
  if (q.source) p.set('source', q.source);
  if (q.open) p.set('open', '1');
  if (q.youth) p.set('youth', '1');
  if (q.national === false) p.set('national', '0');
  if (q.q) p.set('q', q.q);
  if (q.sort) p.set('sort', q.sort);
  if (q.offset) p.set('offset', String(q.offset));
  if (q.limit) p.set('limit', String(q.limit));
  return p.toString();
}

export const api = {
  hasSession: () => !!localStorage.getItem(TOKEN_KEY),
  config: () => call<AppConfig>('/api/config'),
  regions: () => call<RegionData>('/api/regions'),
  /** 고른 지역의 가벼운 목록(전국 정책 포함). 분야·조건·정렬은 기기에서 바꿔요. */
  index: (region: { sido?: string | null; sgg?: string | null }, signal?: AbortSignal) =>
    call<PolicyIndexResponse>(`/api/index?${queryString({ sido: region.sido ?? undefined, sgg: region.sido ? region.sgg ?? undefined : undefined })}`, { signal }),
  policies: (q: PolicyQuery & { offset?: number; limit?: number }, signal?: AbortSignal) => call<ListResponse>(`/api/policies?${queryString(q)}`, { signal }),
  policy: (id: string) => call<Policy>(`/api/policies/${encodeURIComponent(id)}`),
  async connect(code: string) {
    const r = await call<{ token: string; subscription: SubscriptionState }>('/api/session', { method: 'POST', body: JSON.stringify({ code }) });
    localStorage.setItem(TOKEN_KEY, r.token);
    return r.subscription;
  },
  subscription: () => call<SubscriptionState>('/api/subscription', {}, true),
  save: (region: { sido: string; sgg: string | null }) => call<SubscriptionState>('/api/subscription', { method: 'PUT', body: JSON.stringify({ region }) }, true),
  off: () => call<SubscriptionState>('/api/subscription', { method: 'DELETE' }, true),
};
