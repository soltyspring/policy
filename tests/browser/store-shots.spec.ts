import { test, expect, type Page, type Browser } from '@playwright/test';
import { copyFile, mkdir } from 'node:fs/promises';
import { basename } from 'node:path';

/**
 * 앱인토스 콘솔 업로드용 스크린샷 636×1048 PNG 3장: 설명 문구 + 휴대폰 틀 안의 실제 앱 화면.
 * `npm run shots`, 그리고 `npm run build` 때마다 docs/store/ 에 덮어써요.
 * 출시 화면과 같게 알림 버튼은 숨겨요(?notify=0).
 */
const out = (name: string) => `docs/store/${name}.png`;

const SHOTS = [
  { file: 'screenshot-1', title: '우리 동네 정책을<br>한곳에서 찾아요', sub: '청년정책과 정부 혜택을 지역별로 모았어요', align: 'top' },
  { file: 'screenshot-2', title: '마감 임박순으로<br>놓치지 않아요', sub: '조회 많은순·최근 등록순·이름순도 있어요', align: 'top' },
  { file: 'screenshot-3', title: '시·도와 시·군·구를<br>골라 봐요', sub: '2026년에 바뀐 행정구역까지 반영했어요', align: 'top' },
] as const;

const FONT = `'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', system-ui, sans-serif`;

async function captureScreens(page: Page) {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('cleared')) {
      localStorage.clear();
      localStorage.setItem('policy:region:v1', JSON.stringify({ sido: '12', sgg: '12300' }));
      sessionStorage.setItem('cleared', '1');
    }
  });
  await page.goto('/?notify=0');
  await expect(page.locator('.policy-row').first()).toBeVisible();
  await expect(page.locator('.region-chip')).toHaveText('전남광주 북구');
  const opts = { animations: 'disabled' as const, type: 'png' as const };
  const home = await page.screenshot(opts);
  await page.getByRole('button', { name: /더보기/ }).click();
  await page.locator('.filters').evaluate(el => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 12));
  await page.mouse.move(0, 0);
  const list = await page.screenshot(opts);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('.region-chip').click();
  const sheet = page.getByRole('dialog', { name: '지역 고르기' });
  await expect(sheet.getByRole('button', { name: '북구', exact: true })).toBeVisible();
  await page.locator('.sheet-inner').evaluate(el => el.scrollTo(0, 0));
  await page.mouse.move(0, 0);
  const region = await page.screenshot(opts);
  return [home, list, region].map(b => `data:image/png;base64,${b.toString('base64')}`);
}

const phone = (src: string, width: number, cssExtra = '', screenHeight?: number, align: 'top' | 'bottom' = 'top') => `
  <div class="phone" style="width:${width}px;${cssExtra}">
    <div class="screen" style="${screenHeight ? `height:${screenHeight}px;` : ''}"><img src="${src}" style="${screenHeight ? `height:100%;object-fit:cover;object-position:center ${align};` : ''}"></div>
  </div>`;

const baseCss = `
  * { box-sizing: border-box; margin: 0; }
  body { font-family: ${FONT}; -webkit-font-smoothing: antialiased; letter-spacing: -.03em; }
  .canvas { position: relative; overflow: hidden; background: linear-gradient(180deg, #eaf3ff 0%, #f6f9ff 70%, #ffffff 100%); }
  .brand { display: inline-flex; align-items: center; gap: 10px; font-weight: 700; color: #1b64da; }
  .brand img { border-radius: 8px; }
  h1 { color: #191f28; font-weight: 800; line-height: 1.28; letter-spacing: -.045em; }
  p { color: #4e5968; font-weight: 500; line-height: 1.45; }
  .phone { position: absolute; padding: 10px; background: #191f28; border-radius: 52px;
    box-shadow: 0 30px 60px rgba(27, 100, 218, .22), 0 6px 18px rgba(0, 0, 0, .12); }
  .screen { border-radius: 42px; overflow: hidden; background: #f2f4f6; }
  .screen img { display: block; width: 100%; }
`;

async function render(browser: Browser, width: number, height: number, html: string, path: string) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.setContent(`<html><head><style>${baseCss}</style></head><body>${html}</body></html>`);
  await p.evaluate(() => Promise.all([...document.images].map(i => i.decode())));
  // 사진 뷰어 등이 파일을 열고 있으면 바로 덮어쓰지 못해요. 임시 파일에 그린 뒤 풀릴 때까지 다시 복사해요.
  await mkdir('test-results/store', { recursive: true });
  await mkdir('docs/store', { recursive: true });
  const tmp = `test-results/store/${basename(path)}`;
  await p.screenshot({ path: tmp, type: 'png' });
  await ctx.close();
  for (let i = 0; ; i++) {
    try { await copyFile(tmp, path); return; }
    catch {
      if (i >= 14) throw new Error(`${path} 파일이 다른 프로그램에 열려 있어 저장하지 못했어요. 닫고 다시 실행해 주세요.`);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

test('콘솔 스크린샷 3장 (636×1048)', async ({ page, browser, baseURL }) => {
  const screens = await captureScreens(page);
  const logo = `${baseURL}/logo.png`;
  for (const [i, s] of SHOTS.entries()) {
    await render(browser, 636, 1048, `
      <div class="canvas" style="width:636px;height:1048px;padding:64px 56px 0;">
        <div class="brand" style="font-size:22px;"><img src="${logo}" width="34" height="34">동네 정책 찾기</div>
        <h1 style="font-size:50px;margin-top:22px;">${s.title}</h1>
        <p style="font-size:24px;margin-top:16px;">${s.sub}</p>
        ${s.align === 'bottom' ? phone(screens[i], 420, 'left:108px;top:340px;', 640, 'bottom') : phone(screens[i], 420, 'left:108px;top:340px;')}
      </div>`, out(s.file));
  }
});
