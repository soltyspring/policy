/**
 * 콘솔 로고(600×600 PNG, 각진 정사각형, 흰 배경)와 앱 아이콘을 그려요.
 *   npm run logo
 * tibo 로고처럼 흰 바탕 위에 부드러운 입체 느낌: 뒤 카드(파랑→보라), 유리 같은 앞 카드(정책 목록), 지도 핀 배지.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">
  <defs>
    <linearGradient id="back" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5fb8ff"/><stop offset=".55" stop-color="#3b7bff"/><stop offset="1" stop-color="#8b5cff"/></linearGradient>
    <linearGradient id="front" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e6eefc"/></linearGradient>
    <linearGradient id="line" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3182f6"/><stop offset="1" stop-color="#5b8cff"/></linearGradient>
    <linearGradient id="pin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4aa8ff"/><stop offset="1" stop-color="#6a4dff"/></linearGradient>
    <radialGradient id="badge" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#eef2ff"/></radialGradient>
    <filter id="glow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="22"/></filter>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#3b5bdb" flood-opacity=".22"/></filter>
  </defs>
  <rect width="600" height="600" fill="#ffffff"/>
  <!-- 뒤 빛 -->
  <ellipse cx="300" cy="330" rx="210" ry="170" fill="#7aa2ff" opacity=".22" filter="url(#glow)"/>
  <!-- 뒤 카드 -->
  <g transform="rotate(8 300 300)">
    <rect x="160" y="120" width="300" height="330" rx="44" fill="url(#back)"/>
  </g>
  <!-- 앞 카드: 정책 목록 -->
  <g filter="url(#soft)" transform="rotate(-6 290 310)">
    <rect x="118" y="150" width="300" height="330" rx="44" fill="url(#front)"/>
    <rect x="118" y="150" width="300" height="330" rx="44" fill="none" stroke="#ffffff" stroke-width="3" opacity=".9"/>
    <circle cx="170" cy="215" r="16" fill="#3182f6"/>
    <rect x="200" y="204" width="150" height="22" rx="11" fill="#c7d7f7"/>
    <circle cx="170" cy="285" r="16" fill="#5b8cff" opacity=".8"/>
    <rect x="200" y="274" width="170" height="22" rx="11" fill="#d6e2f8"/>
    <circle cx="170" cy="355" r="16" fill="#8b5cff" opacity=".7"/>
    <rect x="200" y="344" width="120" height="22" rx="11" fill="#dde6f8"/>
    <rect x="152" y="410" width="120" height="30" rx="15" fill="url(#line)" opacity=".9"/>
  </g>
  <!-- 지도 핀 배지 -->
  <g filter="url(#soft)">
    <circle cx="430" cy="410" r="96" fill="url(#badge)"/>
    <path d="M430 345c-33 0-58 24-58 56 0 41 58 99 58 99s58-58 58-99c0-32-25-56-58-56z" fill="url(#pin)"/>
    <circle cx="430" cy="400" r="22" fill="#ffffff"/>
  </g>
</svg>`;

mkdirSync('docs/brand', { recursive: true });
mkdirSync('public', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge' });
// 다크모드 로고: 같은 그림을 어두운 바탕에. 앞 카드와 배지는 그대로 밝게 두고 바탕과 빛만 바꿔요.
const dark = svg.replace('<rect width="600" height="600" fill="#ffffff"/>', '<rect width="600" height="600" fill="#17171c"/>').replace('opacity=".22" filter="url(#glow)"', 'opacity=".35" filter="url(#glow)"');
for (const [size, path, art, bg] of [[600, 'docs/brand/logo-600.png', svg, '#fff'], [256, 'public/logo.png', svg, '#fff'], [600, 'docs/brand/logo-600-dark.png', dark, '#17171c']] as const) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<html><body style="margin:0;background:${bg}">${art.replace('width="600" height="600"', `width="${size}" height="${size}"`)}</body></html>`);
  await page.screenshot({ path, type: 'png', omitBackground: false });
  await page.close();
  console.log(`${path} (${size}×${size})`);
}
await browser.close();
