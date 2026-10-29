import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { Policy, Source, SourceStatus, SubscriptionState } from '../shared/policy.ts';
import type { RawPolicy } from './sources/types.ts';

export const dbPath = () => process.env.POLICY_DB_PATH || '.data/policy.sqlite';

/** 앱 세션 토큰은 해시만 저장해요. */
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export interface Subscriber { anonKey: string; sido: string; sgg: string | null; createdAt: string; lastNotifiedAt: string | null }

export function openStore(path = dbPath()) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS policies (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      data TEXT NOT NULL,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS policies_source ON policies(source);
    CREATE TABLE IF NOT EXISTS subscribers (
      anon_key TEXT PRIMARY KEY,
      sido TEXT NOT NULL,
      sgg TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_notified_at TEXT
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      anon_key TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);

  const now = () => new Date().toISOString();
  const getMeta = (key: string): string | null => (db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as any)?.value ?? null;
  const setMeta = (key: string, value: string) =>
    db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);

  /** API 프로세스는 수집기가 바꾼 뒤에만 다시 읽어요. */
  let cache: { version: string; list: Policy[] } | null = null;

  return {
    db,
    close: () => db.close(),
    getMeta,
    setMeta,

    // ── 정책 ──
    /**
     * 한 출처의 전체 목록으로 바꿔요. 처음 보는 정책은 firstSeenAt을 지금으로 기록하고 돌려줘요.
     * 이번 목록에 없는 정책은 지워요(원 데이터에서 내려간 정책).
     */
    replaceSource(source: Source, list: RawPolicy[]): { added: Policy[]; removed: number; total: number } {
      const t = now();
      const added: Policy[] = [];
      db.exec('BEGIN');
      try {
        const existing = new Map((db.prepare('SELECT id, first_seen_at FROM policies WHERE source = ?').all(source) as any[]).map(r => [r.id as string, r.first_seen_at as string]));
        const upsert = db.prepare(`INSERT INTO policies (id, source, data, first_seen_at, last_seen_at) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET data = excluded.data, last_seen_at = excluded.last_seen_at`);
        const seen = new Set<string>();
        for (const raw of list) {
          if (seen.has(raw.id)) continue;
          seen.add(raw.id);
          const firstSeenAt = existing.get(raw.id) ?? t;
          const policy: Policy = { ...raw, firstSeenAt };
          upsert.run(raw.id, source, JSON.stringify(policy), firstSeenAt, t);
          if (!existing.has(raw.id)) added.push(policy);
        }
        const gone = db.prepare('DELETE FROM policies WHERE source = ? AND last_seen_at < ?').run(source, t);
        setMeta('version', randomUUID());
        db.exec('COMMIT');
        return { added, removed: Number(gone.changes), total: seen.size };
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    allPolicies(): Policy[] {
      const version = getMeta('version') ?? '';
      if (cache?.version === version) return cache.list;
      const list = (db.prepare('SELECT data FROM policies').all() as any[]).map(r => JSON.parse(r.data) as Policy);
      cache = { version, list };
      return list;
    },
    policy(id: string): Policy | null {
      const r = db.prepare('SELECT data FROM policies WHERE id = ?').get(id) as any;
      return r ? JSON.parse(r.data) : null;
    },
    countBySource(source: Source): number {
      return Number((db.prepare('SELECT COUNT(*) n FROM policies WHERE source = ?').get(source) as any).n);
    },

    // ── 출처 상태 ──
    setSourceStatus(s: SourceStatus) { setMeta(`source:${s.source}`, JSON.stringify(s)); },
    sourceStatuses(): SourceStatus[] {
      return (['youth', 'gov24'] as Source[]).map(source => {
        const raw = getMeta(`source:${source}`);
        return raw ? JSON.parse(raw) : { source, state: 'no-key', count: 0, checkedAt: null };
      });
    },

    // ── 세션(알림용) ──
    createSession(anonKey: string, ttlDays = 30) {
      const token = randomUUID() + randomUUID().replace(/-/g, '');
      const expires = new Date(Date.now() + ttlDays * 86400_000).toISOString();
      db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now());
      db.prepare('INSERT INTO sessions (token_hash, anon_key, expires_at) VALUES (?, ?, ?)').run(hashToken(token), anonKey, expires);
      return { token, expiresAt: expires };
    },
    sessionUser(token: string | undefined): string | null {
      if (!token || token.length < 40 || token.length > 120) return null;
      const r = db.prepare('SELECT anon_key FROM sessions WHERE token_hash = ? AND expires_at > ?').get(hashToken(token), now()) as any;
      return r?.anon_key ?? null;
    },

    // ── 구독(알림용) ──
    subscription(anonKey: string): SubscriptionState {
      const r = db.prepare('SELECT sido, sgg, created_at FROM subscribers WHERE anon_key = ? AND active = 1').get(anonKey) as any;
      if (!r) return { subscribed: false, region: null, since: null };
      return { subscribed: true, region: { sido: r.sido, sgg: r.sgg ?? null }, since: r.created_at };
    },
    subscribe(anonKey: string, region: { sido: string; sgg: string | null }) {
      const t = now();
      db.prepare(`INSERT INTO subscribers (anon_key, sido, sgg, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)
        ON CONFLICT(anon_key) DO UPDATE SET sido = excluded.sido, sgg = excluded.sgg, active = 1,
          created_at = CASE WHEN subscribers.active = 1 THEN subscribers.created_at ELSE excluded.created_at END,
          updated_at = excluded.updated_at`).run(anonKey, region.sido, region.sgg, t, t);
    },
    unsubscribe(anonKey: string) {
      db.prepare('UPDATE subscribers SET active = 0, updated_at = ? WHERE anon_key = ?').run(now(), anonKey);
    },
    activeSubscribers(): Subscriber[] {
      return (db.prepare('SELECT anon_key, sido, sgg, created_at, last_notified_at FROM subscribers WHERE active = 1 ORDER BY created_at').all() as any[])
        .map(r => ({ anonKey: r.anon_key, sido: r.sido, sgg: r.sgg ?? null, createdAt: r.created_at, lastNotifiedAt: r.last_notified_at ?? null }));
    },
    markNotified(anonKeys: string[]) {
      const stmt = db.prepare('UPDATE subscribers SET last_notified_at = ? WHERE anon_key = ?');
      const t = now();
      for (const k of anonKeys) stmt.run(t, k);
    },
    subscriberCount(): number {
      return Number((db.prepare('SELECT COUNT(*) n FROM subscribers WHERE active = 1').get() as any).n);
    },
    /** 알림을 끈 지 30일이 지난 식별키와 만료된 세션을 지워요. */
    purge(days = 30) {
      const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
      const gone = db.prepare('DELETE FROM subscribers WHERE active = 0 AND updated_at < ?').run(cutoff);
      db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now());
      return Number(gone.changes);
    },
  };
}
export type Store = ReturnType<typeof openStore>;
