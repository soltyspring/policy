import { test, expect, type Page } from '@playwright/test';

/**
 * 배치 자동 점검. 화면마다 아래 기준을 재고, 어긋난 곳을 모두 모아서 보여 줘요.
 * - 접힘선: 첫 화면(375×812)에서 동네 선택과 첫 정책이 스크롤 없이 보여야 해요
 * - 대비: 글자와 바탕 대비 4.5:1 이상(큰 글자 3:1)
 * - 터치: 누를 수 있는 것은 높이 44px 이상
 * - 넘침: 가로 스크롤 없음(가로로 넘기는 칩 줄은 예외)
 * - 가까이: 정렬·조건은 그 조건이 바꾸는 목록 카드 안에
 * - 시트: 정책 상세를 열면 "공식 페이지" 버튼이 바로 보여야 해요
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('cleared')) { localStorage.clear(); sessionStorage.setItem('cleared', '1'); } });
});

async function contrastIssues(page: Page, scope = 'body') {
  return page.evaluate(sel => {
    const parse = (c: string) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = '1'] = m[1].split(',').map(s => s.trim()); return [Number(r), Number(g), Number(b), Number(a)]; };
    const lum = ([r, g, b]: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const bgOf = (el: Element | null): number[] => {
      for (let e = el; e; e = e.parentElement) {
        const c = parse(getComputedStyle(e).backgroundColor);
        if (c && c[3] > 0.9) return c;
      }
      return [255, 255, 255, 1];
    };
    const out: string[] = [];
    const root = document.querySelector(sel) ?? document.body;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const seen = new Set<Element>();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || seen.has(el) || !(n.textContent ?? '').trim()) continue;
      seen.add(el);
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || Number(cs.opacity) === 0 || el.closest('.sr-only,[aria-hidden="true"]')) continue;
      const fg = parse(cs.color); if (!fg) continue;
      const bg = bgOf(el);
      const L1 = lum(fg), L2 = lum(bg);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const size = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700;
      const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
      if (el.closest('button:disabled')) continue; // 꺼진 버튼은 예외(WCAG 1.4.3)
      if (ratio < need) out.push(`대비 ${ratio.toFixed(2)} < ${need}: "${(n.textContent ?? '').trim().slice(0, 20)}" (${cs.color} on rgb(${bg.slice(0, 3).join(',')}))`);
    }
    return out;
  }, scope);
}

async function tapIssues(page: Page, scope = 'body') {
  return page.evaluate(sel => {
    const out: string[] = [];
    const root = document.querySelector(sel) ?? document.body;
    for (const el of root.querySelectorAll('button, a[href], label.check-chip, [role="switch"]')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || el.closest('.sr-only')) continue;
      if (r.height < 44 - 0.5) out.push(`터치 높이 ${Math.round(r.height)}px < 44: "${(el.textContent ?? el.getAttribute('aria-label') ?? '').trim().slice(0, 20)}"`);
    }
    return out;
  }, scope);
}

async function overflowIssue(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  return over > 0 ? [`가로로 ${over}px 넘쳐요`] : [];
}

function report(name: string, issues: string[]) {
  const uniq = [...new Set(issues)];
  console.log(`\n[점검] ${name}: ${uniq.length ? `${uniq.length}건\n  - ${uniq.join('\n  - ')}` : '통과'}`);
  return uniq;
}

test('점검: 처음 화면(동네 고르기 전)', async ({ page }) => {
  await page.goto('/?notify=0');
  await expect(page.locator('.policy-row').first()).toBeVisible();
  const issues: string[] = [];
  const vh = page.viewportSize()!.height;
  const sel = await page.getByRole('button', { name: /^시·도:/ }).boundingBox();
  if (!sel || sel.y + sel.height > vh) issues.push(`동네 선택이 접힘선(${vh}px) 아래에 있어요(${Math.round((sel?.y ?? 0) + (sel?.height ?? 0))}px)`);
  const firstRow = await page.locator('.policy-row').first().boundingBox();
  if (!firstRow || firstRow.y + firstRow.height > vh) issues.push(`첫 정책이 접힘선 아래에 있어요(${Math.round((firstRow?.y ?? 0) + (firstRow?.height ?? 0))}px)`);
  const sortInList = await page.locator('section[aria-labelledby="list-title"]').getByRole('button', { name: /^정렬:/ }).count();
  if (!sortInList) issues.push('정렬 버튼이 목록 카드 밖에 있어요');
  const filtersInList = await page.locator('section[aria-labelledby="list-title"]').getByRole('group', { name: '분야' }).count();
  if (!filtersInList) issues.push('분야 조건이 목록 카드 밖에 있어요');
  issues.push(...await contrastIssues(page), ...await tapIssues(page, 'main'), ...await overflowIssue(page));
  expect(report('처음 화면', issues)).toEqual([]);
});

test('점검: 동네를 고른 뒤', async ({ page }) => {
  await page.goto('/?notify=0');
  await page.getByRole('button', { name: /^시·도:/ }).click();
  const sheet = page.getByRole('dialog', { name: '동네 고르기' });
  const issues: string[] = [...await contrastIssues(page, '.sheet-inner'), ...await tapIssues(page, '.sheet-inner')];
  await sheet.getByRole('button', { name: '전남광주', exact: true }).click();
  issues.push(...await contrastIssues(page, '.sheet-inner'), ...await tapIssues(page, '.sheet-inner'));
  await sheet.getByRole('button', { name: '북구', exact: true }).click();
  await expect(sheet).toBeHidden();
  const vh = page.viewportSize()!.height;
  const firstRow = await page.locator('.policy-row').first().boundingBox();
  if (!firstRow || firstRow.y + firstRow.height > vh) issues.push(`첫 정책이 접힘선 아래에 있어요(${Math.round((firstRow?.y ?? 0) + (firstRow?.height ?? 0))}px)`);
  // 조건 칩은 한 줄에 들어가야 목록이 덜 밀려요
  const chipTops = await page.locator('.checks .check-chip').evaluateAll(els => [...new Set(els.map(e => Math.round(e.getBoundingClientRect().top)))]);
  if (chipTops.length > 1) issues.push(`조건 칩이 ${chipTops.length}줄로 꺾여요`);
  // 동네를 고른 뒤에는 장식 그림 없이 목록이 더 빨리 보여야 해요
  if (await page.locator('.hero .hero-art').count()) issues.push('동네를 고른 뒤에도 장식 그림이 목록을 밀어내요');
  issues.push(...await contrastIssues(page, 'main'), ...await tapIssues(page, 'main'), ...await overflowIssue(page));
  expect(report('고른 뒤', issues)).toEqual([]);
});

test('점검: 정책 상세 시트', async ({ page }) => {
  await page.goto('/?notify=0');
  await page.locator('.policy-row').first().click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  const issues: string[] = [];
  const cta = sheet.getByRole('button', { name: '공식 페이지에서 확인하기' });
  const box = await cta.boundingBox();
  const vh = page.viewportSize()!.height;
  if (!box || box.y + box.height > vh) issues.push(`"공식 페이지" 버튼이 화면 밖이에요(${Math.round((box?.y ?? 0) + (box?.height ?? 0))}px)`);
  issues.push(...await contrastIssues(page, '.sheet-inner'), ...await tapIssues(page, '.sheet-inner'));
  expect(report('상세 시트', issues)).toEqual([]);
});
