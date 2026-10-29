import { Device, Environment, Notification, SafeArea, Screen, Share, User, graniteEvent } from '@apps-in-toss/web-framework';

export function isNativeToss() {
  try { return /^\d+\.\d+/.test(Environment.tossAppVersion); } catch { return false; }
}

export function connectNative(onBack: () => boolean) {
  if (!isNativeToss()) return () => {};
  document.documentElement.dataset.native = 'true';
  const applyInsets = (insets: { top: number; bottom: number }) => {
    document.documentElement.style.setProperty('--safe-top', `${insets.top}px`);
    document.documentElement.style.setProperty('--safe-bottom', `${insets.bottom}px`);
  };
  applyInsets(SafeArea.get());
  const offInsets = SafeArea.subscribe({ onEvent: applyInsets });
  // 열린 시트가 있으면 닫고, 없으면 미니앱을 닫아요.
  const offBack = graniteEvent.addEventListener('backEvent', { onEvent: () => { if (!onBack()) void Screen.close(); } });
  const offHome = graniteEvent.addEventListener('homeEvent', { onEvent: () => { void Screen.close(); } });
  return () => { offInsets(); offBack(); offHome(); };
}

export async function openExternal(url: string) {
  if (!/^https:\/\//.test(url)) return;
  if (isNativeToss()) await Device.openURL(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
}

export function haptic(type: 'success' | 'tap' | 'error') {
  if (!isNativeToss()) return;
  try { void Device.triggerHaptic({ type }); } catch { /* 지원하지 않는 버전 */ }
}

/** 토스에 등록된 주소를 쓸 수 있는지. 콘솔 동의 항목 키가 있어야 해요. */
export const canLoadAddress = () => import.meta.env.DEV || (isNativeToss() && !!import.meta.env.VITE_TOSS_ADDRESS_KEY);

export type AddressResult = { ok: true; address: string } | { ok: false; reason: 'unsupported' | 'declined' | 'not-ready' | 'empty' | 'error' };

/**
 * 토스에 등록된 주소를 동의를 받고 가져와요. 주소는 기기 안에서 지역 코드로만 바꿔요.
 * 브라우저 개발 환경에서는 옛 주소 예시를 돌려줘서 통합 전 이름도 잘 바뀌는지 확인해요.
 */
export async function loadTossAddress(): Promise<AddressResult> {
  if (!isNativeToss()) return import.meta.env.DEV ? { ok: true, address: '광주광역시 북구 용봉로 77' } : { ok: false, reason: 'unsupported' };
  const key = import.meta.env.VITE_TOSS_ADDRESS_KEY as string | undefined;
  if (!key) return { ok: false, reason: 'not-ready' };
  try { if (!User.getConsentedData.isSupported()) return { ok: false, reason: 'unsupported' }; } catch { return { ok: false, reason: 'unsupported' }; }
  try {
    const data = await User.getConsentedData({ consentedUserDataKey: key, shouldRequestAgreementWhenUserDeclined: true });
    const address = data?.USER_ADDRESS_BASE || data?.USER_ADDRESS;
    return address ? { ok: true, address } : { ok: false, reason: 'empty' };
  } catch (e) {
    const code = String((e as { code?: string })?.code ?? (e as Error)?.message ?? '');
    if (/DECLINED|CANCELED/i.test(code)) return { ok: false, reason: 'declined' };
    if (/TERMS_NOT_SET/i.test(code)) return { ok: false, reason: 'not-ready' };
    return { ok: false, reason: 'error' };
  }
}

export type AgreementResult = 'agreed' | 'rejected' | 'unsupported' | 'not-ready' | 'error';

/** 토스 알림 동의문을 띄워요. 브라우저 개발 환경에서는 동의한 것으로 처리해요. */
export function requestAgreement(templateCode: string | undefined): Promise<AgreementResult> {
  if (!isNativeToss()) return Promise.resolve(import.meta.env.DEV ? 'agreed' : 'unsupported');
  if (!templateCode) return Promise.resolve('not-ready');
  try { if (!Notification.requestAgreement.isSupported()) return Promise.resolve('unsupported'); } catch { return Promise.resolve('unsupported'); }
  return new Promise(resolve => {
    let cleanup: (() => void) | undefined;
    const done = (r: AgreementResult) => { cleanup?.(); cleanup = undefined; resolve(r); };
    try {
      cleanup = Notification.requestAgreement({
        options: { templateCode },
        onEvent: ({ type }) => done(type === 'agreementRejected' ? 'rejected' : 'agreed'),
        onError: (error: unknown) => {
          const code = (error as { code?: string })?.code;
          done(code === 'UNSUPPORTED_APP_VERSION' ? 'unsupported' : code === 'TERMS_DISAGREED_MEMBER' ? 'rejected' : 'error');
        },
      });
    } catch { done('error'); }
  });
}

/** 서버에서 사용자 식별키로 바꿀 일회용 코드. 개발 브라우저에서는 가짜 코드를 써요. */
export async function createAuthCode(): Promise<string | null> {
  if (!isNativeToss()) return import.meta.env.DEV ? `dev-${crypto.randomUUID()}` : null;
  try { return (await User.createAnonymousKeyAuthCode()).code; } catch { return null; }
}

/** 친구에게 앱 공유 */
export async function shareApp() {
  const message = '우리 동네에서 받을 수 있는 정책과 혜택을 한곳에서 찾아봐요. 동네 정책 찾기';
  if (isNativeToss()) {
    try {
      const link = await Share.createLink({ path: 'intoss://policy' });
      await Share.sendMessage({ message: `${message}\n${link}` });
      return true;
    } catch { return false; }
  }
  if (typeof navigator.share === 'function') { try { await navigator.share({ title: '동네 정책 찾기', text: message }); return true; } catch { return false; } }
  try { await navigator.clipboard.writeText(message); return true; } catch { return false; }
}
