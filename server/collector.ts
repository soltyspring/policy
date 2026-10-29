import { applyState, matchesRegion, type Policy, type Source } from '../shared/policy.ts';
import type { RegionIndex } from '../shared/regions.ts';
import type { Store } from './store.ts';
import type { TossClient } from './toss.ts';
import { SourceError, type PolicySource } from './sources/types.ts';

export interface NotifyOptions {
  toss: TossClient;
  /** 새 정책 알림 캠페인 발송 코드(policy-로 시작) */
  template: string;
  /** 같은 사람에게 이 시간 안에는 다시 보내지 않아요. */
  minGapHours?: number;
}

export interface CollectResult {
  ok: boolean;
  sources: { source: Source; state: string; total: number; added: number; removed: number; message?: string }[];
  notified: { sent: number; failed: number; skipped: string | null };
}

/** KST 21시~08시는 대량 발송이 보류돼서 한 건씩 보내요. */
const isNight = (d = new Date()) => { const h = (d.getUTCHours() + 9) % 24; return h >= 21 || h < 8; };

export async function collectOnce(o: {
  store: Store;
  sources: PolicySource[];
  regions: RegionIndex;
  notify?: NotifyOptions | null;
  log?: (m: string) => void;
  now?: Date;
}): Promise<CollectResult> {
  const log = o.log ?? (() => {});
  const result: CollectResult = { ok: false, sources: [], notified: { sent: 0, failed: 0, skipped: null } };
  const fresh: Policy[] = [];
  const checkedAt = (o.now ?? new Date()).toISOString();

  for (const source of o.sources) {
    try {
      const list = await source.fetchAll(o.regions, log);
      const baseline = o.store.getMeta(`seeded:${source.id}`) === null;
      const r = o.store.replaceSource(source.id, list);
      o.store.setMeta(`seeded:${source.id}`, checkedAt);
      // 처음 모을 때는 전부 새 정책이라 알림 대상에서 빼요.
      if (!baseline) fresh.push(...r.added);
      o.store.setSourceStatus({ source: source.id, state: 'ok', count: r.total, checkedAt });
      result.sources.push({ source: source.id, state: 'ok', total: r.total, added: baseline ? 0 : r.added.length, removed: r.removed });
      result.ok = true;
      log(`${source.id}: ${r.total}건 (새로 ${baseline ? '첫 수집' : r.added.length}, 내려감 ${r.removed})`);
    } catch (e) {
      const state = e instanceof SourceError ? e.state : 'error';
      const count = o.store.countBySource(source.id);
      o.store.setSourceStatus({ source: source.id, state, count, checkedAt });
      result.sources.push({ source: source.id, state, total: count, added: 0, removed: 0, message: (e as Error).message });
      // 키가 없거나 틀린 건 실패로 보지 않고 건너뛰어요. 저장된 목록은 그대로 둬요.
      log(`${source.id}: 건너뜀(${state}) ${(e as Error).message}`);
    }
  }
  o.store.setMeta('checkedAt', checkedAt);
  if (result.ok) o.store.setMeta('updatedAt', checkedAt);

  if (!o.notify) { result.notified.skipped = 'disabled'; return result; }
  result.notified = await notifyNew(o.store, fresh, o.notify, o.regions, o.now ?? new Date(), log);
  return result;
}

/** 구독자가 고른 지역에 새로 올라온 정책이 있으면 한 번에 알려요. 전국 정책은 알림에서 빼요. */
export async function notifyNew(store: Store, fresh: Policy[], n: NotifyOptions, regions: RegionIndex, now: Date, log: (m: string) => void) {
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(now);
  const candidates = fresh.filter(p => p.scope === 'regional' && applyState(p, today) !== 'closed');
  if (!candidates.length) return { sent: 0, failed: 0, skipped: 'no-new' };
  if (!/^policy-/.test(n.template)) return { sent: 0, failed: 0, skipped: 'no-template' };
  const gap = (n.minGapHours ?? 20) * 3600_000;
  const items: { anonKey: string; context: Record<string, string> }[] = [];
  for (const sub of store.activeSubscribers()) {
    if (sub.lastNotifiedAt && now.getTime() - Date.parse(sub.lastNotifiedAt) < gap) continue;
    const mine = candidates.filter(p => matchesRegion(p, sub.sido, sub.sgg ?? undefined, false));
    if (!mine.length) continue;
    const sido = regions.sidoByCode.get(sub.sido);
    const sgg = sub.sgg ? sido?.sgg.find(s => s.code === sub.sgg) : null;
    items.push({ anonKey: sub.anonKey, context: { count: String(mine.length), region: sgg?.name ?? sido?.short ?? '', title: mine[0].title.slice(0, 40) } });
  }
  if (!items.length) return { sent: 0, failed: 0, skipped: 'no-match' };
  let sent = 0, failed = 0;
  const ok: string[] = [];
  if (items.length < 50 || isNight(now)) {
    for (const it of items) { if (await n.toss.sendOne(n.template, it.anonKey, it.context)) { sent++; ok.push(it.anonKey); } else failed++; }
  } else {
    const r = await n.toss.sendBulk(n.template, items);
    sent = r.sent; failed = r.failed;
    if (r.sent > 0) ok.push(...items.map(i => i.anonKey));
  }
  store.markNotified(ok);
  log(`알림: 보냄 ${sent}, 실패 ${failed}`);
  return { sent, failed, skipped: null };
}
