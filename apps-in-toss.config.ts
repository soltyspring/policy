import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  // 콘솔에 등록한 앱 이름과 같아야 해요. 스마트 발송 코드도 `policy-`로 시작해요.
  appName: 'policy',
  brand: { primaryColor: '#3182f6' },
  webView: {},
  navigationBar: { withBackButton: true, withHomeButton: true },
  permissions: [],
  webBundleDir: 'dist',
});
