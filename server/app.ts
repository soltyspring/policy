import express, { type Request, type Response, type NextFunction } from 'express';
import { applyState, filterPolicies, kstDate, parseQuery, sortPolicies, type PolicyListResponse } from '../shared/policy.ts';
import type { RegionIndex } from '../shared/regions.ts';
import type { Store } from './store.ts';
import { TossError, type TossClient } from './toss.ts';

export interface AppOptions {
  store: Store;
  regions: () => RegionIndex;
  toss: TossClient;
  /** 알림 기능을 켤지. 꺼져 있으면 알림 API를 열지 않아요. */
  notifyEnabled?: boolean;
  allowedOrigins?: string[];
  intervalHours?: number;
  staticDir?: string;
}

export const DEFAULT_ORIGINS = [
  'https://policy.apps.tossmini.com', 'https://policy.private-apps.tossmini.com',
  'https://policy.web.tossmini.com', 'https://policy.private-web.tossmini.com',
];

/** IP별 간단한 고정 창 제한. 프록시 뒤에서는 X-Real-IP를 써요. */
function rateLimit(limit: number, windowMs: number) {
  const hits = new Map<string, { n: number; reset: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = String(req.headers['x-real-ip'] || req.socket.remoteAddress || 'local');
    const now = Date.now();
    const h = hits.get(ip);
    if (!h || h.reset < now) hits.set(ip, { n: 1, reset: now + windowMs });
    else if (++h.n > limit) return res.status(429).json({ code: 'TOO_MANY', error: '잠시 후 다시 시도해 주세요.' });
    if (hits.size > 10000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    next();
  };
}

const daysAgo = (today: string, n: number) => kstDate(new Date(Date.parse(today) - n * 86400_000));

export function createApp(o: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  const allowed = new Set(o.allowedOrigins?.length ? o.allowedOrigins : DEFAULT_ORIGINS);
  const local = /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+):\d+$/;

  app.use('/api', (req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      if (!allowed.has(origin) && !(process.env.NODE_ENV !== 'production' && local.test(origin)))
        return res.status(403).json({ code: 'ORIGIN', error: '허용되지 않은 요청이에요.' });
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
      res.setHeader('Access-Control-Allow-Methods', o.notifyEnabled ? 'GET, POST, PUT, DELETE, OPTIONS' : 'GET, OPTIONS');
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.use('/api', express.json({ limit: '4kb' }));
  const noStore = (_req: Request, res: Response, next: NextFunction) => { res.setHeader('Cache-Control', 'no-store'); next(); };
  const shortCache = (_req: Request, res: Response, next: NextFunction) => { res.setHeader('Cache-Control', 'public, max-age=300'); next(); };

  app.get('/api/health', noStore, (_req, res) => res.json({ ok: true }));

  app.get('/api/config', noStore, (_req, res) => res.json({ notify: !!o.notifyEnabled, intervalHours: o.intervalHours ?? 6 }));

  app.get('/api/regions', shortCache, (_req, res) => res.json(o.regions().data));

  app.get('/api/policies', rateLimit(240, 60_000), shortCache, (req, res) => {
    const q = parseQuery(req.query as Record<string, unknown>);
    const today = kstDate();
    const all = o.store.allPolicies();
    const matched = filterPolicies(all, q, today);
    const sorted = sortPolicies(matched, q.sort, today);
    const offset = Math.max(0, Math.min(10_000, Number(req.query.offset) || 0));
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20));
    const weekAgo = daysAgo(today, 7);
    const body: PolicyListResponse & { open: number } = {
      items: sorted.slice(offset, offset + limit),
      total: sorted.length,
      open: (q.open ? sorted : filterPolicies(all, { ...q, open: true }, today)).length,
      fresh: sorted.filter(p => (p.registeredAt ?? '') >= weekAgo && applyState(p, today) !== 'closed').length,
      sources: o.store.sourceStatuses(),
      updatedAt: o.store.getMeta('updatedAt'),
    };
    res.json(body);
  });

  app.get('/api/policies/:id', shortCache, (req, res) => {
    const id = String(req.params.id);
    if (!/^[yg]-[\w.-]{1,60}$/.test(id)) return res.status(400).json({ code: 'BAD_REQUEST', error: '요청이 올바르지 않아요.' });
    const p = o.store.policy(id);
    if (!p) return res.status(404).json({ code: 'NOT_FOUND', error: '정책을 찾을 수 없어요.' });
    res.json(p);
  });

  if (o.notifyEnabled) mountNotify(app, o, noStore);

  app.use('/api', (_req, res) => res.status(404).json({ code: 'NOT_FOUND', error: '찾을 수 없어요.' }));
  if (o.staticDir) app.use(express.static(o.staticDir));
  return app;
}

/** 새 정책 알림(콘솔 캠페인 승인 뒤 NOTIFY_ENABLED=true로 켜요) */
function mountNotify(app: express.Express, o: AppOptions, noStore: (req: Request, res: Response, next: NextFunction) => void) {
  const auth = (req: Request, res: Response, next: NextFunction) => {
    const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
    const anonKey = o.store.sessionUser(token);
    if (!anonKey) return res.status(401).json({ code: 'SESSION', error: '다시 연결해 주세요.' });
    res.locals.anonKey = anonKey;
    next();
  };
  const validRegion = (r: any): { sido: string; sgg: string | null } | null => {
    const regions = o.regions();
    const sido = typeof r?.sido === 'string' ? regions.sidoByCode.get(r.sido) : undefined;
    if (!sido) return null;
    if (r.sgg === null || r.sgg === undefined) return { sido: sido.code, sgg: null };
    return typeof r.sgg === 'string' && sido.sgg.some(s => s.code === r.sgg) ? { sido: sido.code, sgg: r.sgg } : null;
  };

  /** 미니앱이 발급한 일회용 코드를 anonKey로 바꾸고 앱 전용 세션을 줘요. anonKey는 앱에 돌려주지 않아요. */
  app.post('/api/session', rateLimit(20, 60_000), noStore, async (req, res) => {
    const code = typeof req.body?.code === 'string' ? req.body.code : '';
    if (!code) return res.status(400).json({ code: 'BAD_REQUEST', error: '요청이 올바르지 않아요.' });
    try {
      const anonKey = await o.toss.exchangeCode(code);
      const session = o.store.createSession(anonKey);
      res.json({ token: session.token, expiresAt: session.expiresAt, subscription: o.store.subscription(anonKey) });
    } catch (e) {
      if (e instanceof TossError && e.code === 'TOSS_MTLS_MISSING') return res.status(503).json({ code: 'NOTIFY_UNAVAILABLE', error: '알림 기능을 준비하고 있어요. 조금만 기다려 주세요.' });
      const invalid = e instanceof TossError && (e.code === 'TOSS_4011' || e.code === 'TOSS_BAD_CODE');
      res.status(invalid ? 401 : 502).json({ code: invalid ? 'CODE_INVALID' : 'TOSS_UNAVAILABLE', error: invalid ? '다시 시도해 주세요.' : '토스와 연결이 원활하지 않아요. 잠시 후 다시 시도해 주세요.' });
    }
  });
  app.get('/api/subscription', noStore, auth, (_req, res) => res.json(o.store.subscription(res.locals.anonKey)));
  app.put('/api/subscription', rateLimit(30, 60_000), noStore, auth, (req, res) => {
    const region = validRegion(req.body?.region);
    if (!region) return res.status(400).json({ code: 'BAD_REQUEST', error: '지역을 다시 골라 주세요.' });
    o.store.subscribe(res.locals.anonKey, region);
    res.json(o.store.subscription(res.locals.anonKey));
  });
  app.delete('/api/subscription', noStore, auth, (_req, res) => {
    o.store.unsubscribe(res.locals.anonKey);
    res.json(o.store.subscription(res.locals.anonKey));
  });
}
