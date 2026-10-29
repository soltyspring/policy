/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** 새 정책 알림 캠페인 발송 코드(policy-로 시작) */
  readonly VITE_TOSS_NEW_TEMPLATE?: string;
}
