import { createApp } from './app.ts';
import { openStore } from './store.ts';
import { regionLoader } from './regions.ts';
import { tossOrUnavailable } from './toss.ts';
import { seedDemo } from './demo.ts';

const store = openStore();
if (process.env.POLICY_SEED_DEMO === 'true' && process.env.NODE_ENV !== 'production') seedDemo(store);

const notifyEnabled = process.env.NOTIFY_ENABLED === 'true';
const app = createApp({
  store,
  regions: regionLoader(),
  // 알림을 켜지 않으면 토스 인증서도 읽지 않아요.
  toss: notifyEnabled ? tossOrUnavailable() : { mock: false, exchangeCode: async () => { throw new Error('off'); }, sendBulk: async () => ({ sent: 0, failed: 0 }), sendOne: async () => false },
  notifyEnabled,
  jusoKey: process.env.JUSO_API_KEY?.trim() || undefined,
  allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',').map(s => s.trim()).filter(Boolean),
  intervalHours: Number(process.env.COLLECT_INTERVAL_HOURS || 6),
  staticDir: 'dist',
});
const port = Number(process.env.PORT || 3003);
app.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`정책 API: http://localhost:${port} (알림 ${notifyEnabled ? '켜짐' : '꺼짐'})`));
