/**
 * 6시간마다 systemd 타이머가 실행하는 수집기. 한 번 돌고 끝나요.
 *   npm run collect
 * 키가 없거나 거부된 출처는 실패로 쌓지 않고 건너뛰어요(저장된 목록은 유지).
 */
import { openStore } from '../server/store.ts';
import { regionLoader } from '../server/regions.ts';
import { tossOrUnavailable } from '../server/toss.ts';
import { collectOnce } from '../server/collector.ts';
import { youthSource } from '../server/sources/youth.ts';
import { gov24Source } from '../server/sources/gov24.ts';

const store = openStore();
const notifyEnabled = process.env.NOTIFY_ENABLED === 'true';
const toss = notifyEnabled ? tossOrUnavailable() : null;
const template = process.env.TOSS_NEW_TEMPLATE?.trim() || '';
const notifyReady = !!toss && (toss.mock || !!(process.env.TOSS_MTLS_CERT && process.env.TOSS_MTLS_KEY)) && /^policy-/.test(template);
try {
  const result = await collectOnce({
    store,
    regions: regionLoader()(),
    sources: [youthSource(process.env.YOUTH_API_KEY?.trim()), gov24Source(process.env.DATA_GO_KR_API_KEY?.trim())],
    notify: notifyReady ? { toss: toss!, template } : null,
    log: m => console.log(`[collect] ${m}`),
  });
  const summary = result.sources.map(s => `${s.source}=${s.state}:${s.total}`).join(' ');
  console.log(`[collect] ${summary} · 알림 ${result.notified.skipped ?? `보냄 ${result.notified.sent} 실패 ${result.notified.failed}`}`);
  store.purge();
  // 키 문제로 건너뛴 건 실패가 아니에요. 연결 오류만 실패로 남겨요.
  process.exitCode = result.sources.some(s => s.state === 'error') ? 2 : 0;
} finally { store.close(); }
