/**
 * 콘솔 로고(600×600 PNG, 모서리 각진 정사각형, 배경색 있음)와 앱 아이콘을 그려요.
 *   npm run logo
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a8bff"/><stop offset="1" stop-color="#1b64da"/></linearGradient>
    <linearGradient id="pin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd66b"/><stop offset="1" stop-color="#ffb21e"/></linearGradient>
    <filter id="s" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#0b3d91" flood-opacity=".28"/></filter>
  </defs>
  <rect width="600" height="600" fill="url(#bg)"/>
  <g filter="url(#s)">
    <rect x="150" y="150" width="260" height="320" rx="40" fill="#ffffff"/>
    <rect x="196" y="206" width="140" height="24" rx="12" fill="#c9daf2"/>
    <rect x="196" y="256" width="168" height="20" rx="10" fill="#e5edf8"/>
    <rect x="196" y="296" width="120" height="20" rx="10" fill="#e5edf8"/>
    <rect x="196" y="362" width="104" height="48" rx="24" fill="#e8f3ff"/>
    <path d="M226 386h44" stroke="#3182f6" stroke-width="12" stroke-linecap="round"/>
  </g>
  <g filter="url(#s)">
    <path d="M410 250c-50 0-86 36-86 83 0 61 86 147 86 147s86-86 86-147c0-47-36-83-86-83z" fill="url(#pin)"/>
    <circle cx="410" cy="333" r="32" fill="#ffffff"/>
  </g>
</svg>`;

mkdirSync('docs/brand', { recursive: true });
mkdirSync('public', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge' });
for (const [size, path] of [[600, 'docs/brand/logo-600.png'], [256, 'public/logo.png']] as const) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<html><body style="margin:0">${svg.replace('width="600" height="600"', `width="${size}" height="${size}"`)}</body></html>`);
  await page.screenshot({ path, type: 'png', omitBackground: false });
  await page.close();
  console.log(`${path} (${size}×${size})`);
}
await browser.close();
