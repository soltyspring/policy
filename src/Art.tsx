/** 토스 스타일의 부드러운 일러스트와 아이콘. 모두 장식용이라 aria-hidden이에요. */
import type { Field } from '../shared/policy';

export function Logo({ size = 28 }: { size?: number }) {
  return <img src={`${import.meta.env.BASE_URL}logo.png`} width={size} height={size} alt="" aria-hidden="true" className="logo" />;
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
