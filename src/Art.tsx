/** 토스 스타일의 부드러운 일러스트와 아이콘. 모두 장식용이라 aria-hidden이에요. */
import type { Field } from '../shared/policy';

export function Logo({ size = 28 }: { size?: number }) {
  return <img src={`${import.meta.env.BASE_URL}logo.png`} width={size} height={size} alt="" aria-hidden="true" className="logo" />;
}

/** 지도 핀과 정책 문서 */
export function HeroArt() {
  return (
    <svg className="hero-art" viewBox="0 0 240 150" aria-hidden="true">
      <defs>
        <linearGradient id="h-pin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#64a8ff" /><stop offset="1" stopColor="#1b64da" /></linearGradient>
        <filter id="h-shadow" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#1b64da" floodOpacity=".16" /></filter>
      </defs>
      <ellipse cx="120" cy="138" rx="86" ry="9" fill="#dfeaf8" />
      <path d="M30 118l40-18 50 16 50-16 40 18-40 14-50-12-50 12z" fill="#e8f0fb" />
      <g filter="url(#h-shadow)">
        <rect x="128" y="24" width="72" height="92" rx="14" fill="#ffffff" />
        <rect x="140" y="40" width="40" height="7" rx="3.5" fill="#c9daf2" />
        <rect x="140" y="56" width="48" height="6" rx="3" fill="#e5edf8" />
        <rect x="140" y="68" width="36" height="6" rx="3" fill="#e5edf8" />
        <rect x="140" y="88" width="30" height="16" rx="8" fill="#e8f3ff" />
        <path d="M150 96h10" stroke="#3182f6" strokeWidth="3" strokeLinecap="round" />
      </g>
      <g filter="url(#h-shadow)">
        <path d="M84 22c-18 0-31 13-31 30 0 22 31 54 31 54s31-32 31-54c0-17-13-30-31-30z" fill="url(#h-pin)" />
        <circle cx="84" cy="52" r="12" fill="#ffffff" />
      </g>
      <g fill="#ffc342"><path d="M208 22l3.5 8 8 3.5-8 3.5-3.5 8-3.5-8-8-3.5 8-3.5z" /></g>
      <circle cx="36" cy="40" r="5" fill="#9ccaff" /><circle cx="216" cy="98" r="4" fill="#9ccaff" />
    </svg>
  );
}

const FIELD_COLORS: Record<Field, [string, string]> = {
  job: ['#e8f3ff', '#3182f6'], housing: ['#eefaf3', '#0f9d58'], education: ['#fff4e0', '#d97f00'], welfare: ['#fdeeee', '#e5484d'],
  health: ['#f3eefe', '#7b57e0'], culture: ['#e6f8f8', '#0a9396'], participation: ['#fff0f6', '#d6336c'], etc: ['#f2f4f6', '#6b7684'],
};

/** 목록용 분야 아이콘 */
export function FieldIcon({ field }: { field: Field }) {
  const [bg, fg] = FIELD_COLORS[field];
  const s = { fill: 'none', stroke: fg, strokeWidth: 2.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg className="field-icon" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="20" fill={bg} />
      {field === 'job' && <g {...s}><rect x="11" y="15" width="18" height="13" rx="3" /><path d="M16 15v-2.5a1.5 1.5 0 0 1 1.5-1.5h5a1.5 1.5 0 0 1 1.5 1.5V15M11 21h18" /></g>}
      {field === 'housing' && <g {...s}><path d="M11 19l9-7 9 7" /><path d="M14 17.5V28h12V17.5" /><path d="M18 28v-5h4v5" /></g>}
      {field === 'education' && <g {...s}><path d="M9 17l11-5 11 5-11 5z" /><path d="M14 19.5V25c0 1.5 3 3 6 3s6-1.5 6-3v-5.5" /></g>}
      {field === 'welfare' && <g {...s}><path d="M20 28s-8-4.8-8-10.5A4.5 4.5 0 0 1 20 15a4.5 4.5 0 0 1 8 2.5C28 23.2 20 28 20 28z" /></g>}
      {field === 'health' && <g {...s}><rect x="12" y="12" width="16" height="16" rx="4" /><path d="M20 16.5v7M16.5 20h7" /></g>}
      {field === 'culture' && <g {...s}><circle cx="20" cy="20" r="8" /><path d="M17.5 17l6 3-6 3z" fill={fg} /></g>}
      {field === 'participation' && <g {...s}><path d="M13 26v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2" /><circle cx="20" cy="14.5" r="3.5" /></g>}
      {field === 'etc' && <g fill={fg}><circle cx="14" cy="20" r="2" /><circle cx="20" cy="20" r="2" /><circle cx="26" cy="20" r="2" /></g>}
    </svg>
  );
}

/** 이렇게 모아요 단계 아이콘 */
export function StepIcon({ kind }: { kind: 'source' | 'refresh' | 'apply' }) {
  return (
    <svg className="step-icon" viewBox="0 0 48 48" aria-hidden="true">
      <rect width="48" height="48" rx="16" fill={kind === 'source' ? '#eefaf3' : kind === 'refresh' ? '#fff4e0' : '#e8f3ff'} />
      {kind === 'source' && <g fill="none" stroke="#0f9d58" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M16 14h12l6 6v14H16z" /><path d="M21 26l3 3 6-6" /></g>}
      {kind === 'refresh' && <g fill="none" stroke="#d97f00" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M33 24a9 9 0 1 1-2.9-6.6" /><path d="M31 12v6h-6" /></g>}
      {kind === 'apply' && <g fill="none" stroke="#3182f6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M27 14h7v7" /><path d="M34 14L22 26" /><path d="M30 28v5a1 1 0 0 1-1 1H15a1 1 0 0 1-1-1V19a1 1 0 0 1 1-1h5" /></g>}
    </svg>
  );
}

export function EmptyArt() {
  return (
    <svg className="empty-art" viewBox="0 0 120 96" aria-hidden="true">
      <ellipse cx="60" cy="88" rx="34" ry="5" fill="#eef1f5" />
      <rect x="34" y="18" width="52" height="64" rx="10" fill="#ffffff" stroke="#d6dee8" strokeWidth="2" />
      <rect x="44" y="32" width="32" height="5" rx="2.5" fill="#e5ebf2" /><rect x="44" y="44" width="24" height="5" rx="2.5" fill="#e5ebf2" />
      <circle cx="78" cy="62" r="12" fill="#e8f3ff" /><path d="M74 62h8" stroke="#3182f6" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export const PinIcon = () => <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 2.5c-4 0-7 3-7 6.8 0 5 7 12.2 7 12.2s7-7.2 7-12.2c0-3.8-3-6.8-7-6.8z" fill="currentColor" /><circle cx="12" cy="9.5" r="2.6" fill="#fff" /></svg>;
export const Chevron = () => <svg className="chevron" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
export const Down = ({ open = false }: { open?: boolean }) => <svg className={`down ${open ? 'open' : ''}`} viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
export const BellOn = () => <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 4c-3.3 0-5.5 2.4-5.5 5.7v3L5 15.5h14l-1.5-2.8v-3C17.5 6.4 15.3 4 12 4z" fill="currentColor" /><path d="M10 18a2 2 0 0 0 4 0" fill="currentColor" /></svg>;
export const Check = () => <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
export const SearchIcon = () => <svg className="search-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.2" /><path d="M15.5 15.5L20 20" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>;
