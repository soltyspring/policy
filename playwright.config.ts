import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://localhost:5175', channel: 'msedge', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5175',
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
    // 알림 화면도 확인하려고 개발 서버에서는 알림을 켜요. 콘솔 스크린샷은 ?notify=0으로 출시 화면을 찍어요.
    env: { TOSS_MOCK: 'true', POLICY_DB_PATH: '.data/e2e.sqlite', POLICY_SEED_DEMO: 'true', NOTIFY_ENABLED: 'true' },
  },
  projects: [
    { name: 'mobile', use: { viewport: { width: 375, height: 812 } }, testMatch: /flows/ },
    { name: 'tablet', use: { viewport: { width: 768, height: 1024 } }, testMatch: /flows/, grep: /홈|지역|화면 크기/ },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } }, testMatch: /flows/, grep: /홈|화면 크기/ },
    // 콘솔 업로드용 스크린샷: 앱 화면은 375×812를 2배로 찍어 휴대폰 틀에 넣어요
    { name: 'store', use: { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 }, testMatch: /store-shots/ },
  ],
});
