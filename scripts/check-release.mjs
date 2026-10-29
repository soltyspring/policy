const base = process.env.VITE_API_BASE_URL;
const fail = msg => { console.error(msg); process.exit(1); };
if (!base || !/^https:\/\/[^/?#]+(?:\/[^?#]*)?$/.test(base) || new URL(base).hostname === 'localhost')
  fail('출시용 API 설정이 필요해요. .env.production의 VITE_API_BASE_URL에 외부에서 접근 가능한 HTTPS 주소를 넣어 주세요. 로컬 검토는 npm run bundle:preview를 써요.');
const template = process.env.VITE_TOSS_NEW_TEMPLATE || '';
if (template && !/^policy-/.test(template)) fail('VITE_TOSS_NEW_TEMPLATE은 policy-로 시작하는 캠페인 발송 코드여야 해요.');
if (!template) console.log('알림 발송 코드가 없어요. 서버 NOTIFY_ENABLED를 켜도 앱은 알림 동의를 받지 않아요.');
console.log('출시용 설정을 확인했어요. 콘솔 검수와 실기기 테스트는 따로 진행해 주세요.');
