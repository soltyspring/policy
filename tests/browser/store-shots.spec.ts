import { test, expect, type Page, type Browser } from '@playwright/test';
import { copyFile, mkdir } from 'node:fs/promises';
import { basename } from 'node:path';

/**
 * 앱인토스 콘솔 업로드용 스크린샷: 세로 636×1048 PNG 3장(설명 문구 + 휴대폰 틀 안의 실제 앱 화면)과 가로 1504×741 PNG 1장.
 * `npm run shots`, 그리고 `npm run build` 때마다 docs/store/ 에 덮어써요.
 * 출시 화면과 같게 알림 버튼은 숨겨요(?notify=0).
 */
const out = (name: string) => `docs/store/${name}.png`;

const SHOTS = [
  { file: 'screenshot-1', title: '정부·지자체 혜택을<br>한눈에 봐요', sub: '마감 임박순·조회 많은순으로 정리해요' },
  { file: 'screenshot-2', title: '지역을 누르면<br>시·군·구까지', sub: '2026년에 바뀐 행정구역도 반영했어요' },
  { file: 'screenshot-3', title: '우리 동네 혜택만<br>골라 볼 수 있어요', sub: '청년 대상·신청 가능만 따로 볼 수도 있어요' },
] as const;

const FONT = `'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', system-ui, sans-serif`;

async function captureScreens(page: Page) {
  await page.addInitScript(() => { if (!sessionStorage.getItem('cleared')) { localStorage.clear(); sessionStorage.setItem('cleared', '1'); } });
  await page.goto('/?notify=0');
  const opts = { animations: 'disabled' as const, type: 'png' as const };
  await expect(page.locator('.policy-row').first()).toBeVisible();
  await page.mouse.move(0, 0);
  // 1) 처음 화면(전국)
  const first = await page.screenshot(opts);
  // 2) 지역 → 경기 → 시·군·구 목록
  await page.getByRole('button', { name: /^지역:/ }).click();
  const sheet = page.getByRole('dialog', { name: '지역 고르기' });
  await sheet.getByRole('button', { name: '경기', exact: true }).click();
  await expect(sheet.getByRole('button', { name: '수원시', exact: true })).toBeVisible();
  await page.locator('.sheet-inner').evaluate(el => el.scrollTo(0, 0));
  await page.mouse.move(0, 0);
  const region = await page.screenshot(opts);
  // 3) 전남광주 북구를 고른 뒤 첫 화면
  await sheet.getByRole('button', { name: '시·도', exact: true }).click();
  await sheet.getByRole('button', { name: '전남광주', exact: true }).click();
  await sheet.getByRole('button', { name: '북구', exact: true }).click();
  await expect(sheet).toBeHidden();
  await page.waitForTimeout(3000); // 안내 메시지가 사라질 때까지
  await page.mouse.move(0, 0);
  const home = await page.screenshot(opts);
  return [first, region, home].map(b => `data:image/png;base64,${b.toString('base64')}`);
}
const phone = (src: string, width: number, cssExtra = '', screenHeight?: number) => `
  <div class="phone" style="width:${width}px;${cssExtra}">
    <div class="screen" style="${screenHeight ? `height:${screenHeight}px;` : ''}"><img src="${src}" style="${screenHeight ? 'height:100%;object-fit:cover;object-position:center top;' : ''}"></div>
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

test('콘솔 스크린샷 (세로 3장 636×1048 + 가로 1장 1504×741)', async ({ page, browser, baseURL }) => {
  const screens = await captureScreens(page);
  const logo = `${baseURL}/logo.png`;
  for (const [i, s] of SHOTS.entries()) {
    await render(browser, 636, 1048, `
      <div class="canvas" style="width:636px;height:1048px;padding:64px 56px 0;">
        <div class="brand" style="font-size:22px;"><img src="${logo}" width="34" height="34">동네 정책 찾기</div>
        <h1 style="font-size:50px;margin-top:22px;">${s.title}</h1>
        <p style="font-size:24px;margin-top:16px;">${s.sub}</p>
        ${phone(screens[i], 420, 'left:108px;top:340px;')}
      </div>`, out(s.file));
  }

  // 가로형 1504×741: 왼쪽에 앱 이름과 한 줄 설명, 오른쪽에 화면 3개(tibo와 같은 틀)
  await render(browser, 1504, 741, `
    <div class="canvas" style="width:1504px;height:741px;background:linear-gradient(120deg,#eaf3ff 0%,#f6f9ff 60%,#ffffff 100%);">
      <div style="position:absolute;left:88px;top:50%;transform:translateY(-50%);width:540px;">
        <div class="brand" style="font-size:24px;"><img src="${logo}" width="40" height="40">동네 정책 찾기</div>
        <h1 style="font-size:56px;margin-top:24px;">우리 동네 혜택,<br>마감 전에 챙겨요</h1>
        <p style="font-size:26px;margin-top:20px;">정부·지자체 혜택을 지역별로 모아 보여 드려요</p>
      </div>
      ${phone(screens[0], 250, 'left:650px;top:110px;', 500)}
      ${phone(screens[1], 250, 'left:928px;top:80px;', 500)}
      ${phone(screens[2], 250, 'left:1206px;top:110px;', 500)}
    </div>`, out('screenshot-wide'));
});
