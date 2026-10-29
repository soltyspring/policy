import { test, expect, type Page } from '@playwright/test';

// 테스트마다 새 사용자로 시작해요. 새로고침에서는 저장한 값을 유지해요.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('cleared')) { localStorage.clear(); sessionStorage.setItem('cleared', '1'); } });
});
const shot = (name: string, project: string) => `docs/screenshots/${project}-${name}.png`;
const rows = (page: Page) => page.locator('.policy-row');

async function pickRegion(page: Page, sido: string, sgg: string) {
  await page.getByRole('button', { name: /^시·도:/ }).click();
  const sheet = page.getByRole('dialog', { name: '동네 고르기' });
  await sheet.getByRole('button', { name: sido, exact: true }).click();
  await sheet.getByRole('button', { name: sgg, exact: true }).click();
  await expect(sheet).toBeHidden();
}
const sidoBox = (page: Page) => page.getByRole('button', { name: /^시·도:/ });
const sggBox = (page: Page) => page.getByRole('button', { name: /^시·군·구:/ });

test('홈: 처음엔 동네 고르기가 첫 화면, 목록은 최근 3개·더보기', async ({ page }, info) => {
  await page.goto('/?notify=0');
  // 제목·설명·선택 칸이 각각 다른 일을 해요
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('사는 동네를골라 주세요');
  await expect(page.locator('.hero-sub')).toContainText(/전국 혜택 \d+개 중 우리 동네 것만/);
  await expect(sidoBox(page)).toContainText('선택');
  await expect(sggBox(page)).toContainText('선택');
  await expect(page.getByRole('searchbox')).toHaveCount(0); // 입력창 없이 선택만
  await expect(rows(page)).toHaveCount(3);
  const titles = await page.locator('.policy-texts strong').allInnerTexts();
  expect(new Set(titles).size).toBe(titles.length);
  await expect(page.locator('main')).not.toContainText(/결제|이용권|광고/);
  await expect(page.locator('.bottom-cta')).toHaveCount(0); // ?notify=0: 출시 화면엔 알림 버튼이 없어요
  await page.screenshot({ path: shot('home', info.project.name), fullPage: true, animations: 'disabled' });
  const more = page.getByRole('button', { name: /더보기 \(\d+개\)/ });
  await more.click();
  expect(await rows(page).count()).toBeGreaterThan(3);
  const all = await page.locator('.policy-texts strong').allInnerTexts();
  expect(new Set(all).size).toBe(all.length);
  await page.getByRole('button', { name: '접기' }).click();
  await expect(rows(page)).toHaveCount(3);
});

test('지역: 시·도를 고르면 바로 시·군·구 목록, 고르면 그 지역과 전국 정책만', async ({ page }, info) => {
  await page.goto('/?notify=0');
  // 시·군·구 칸을 먼저 눌러도 시·도부터 물어봐요
  await sggBox(page).click();
  const sheet = page.getByRole('dialog', { name: '동네 고르기' });
  await expect(sheet.getByRole('heading', { name: '어느 시·도에 사세요?' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: '전남광주', exact: true })).toBeVisible();
  await expect(sheet.getByRole('button', { name: '광주', exact: true })).toHaveCount(0); // 2026년 통합
  await page.screenshot({ path: shot('region', info.project.name), animations: 'disabled' });
  await sheet.getByRole('button', { name: '전남광주', exact: true }).click();
  await expect(sheet.getByRole('button', { name: '전남광주 전체', exact: true })).toBeFocused(); // 초점이 시·군·구 목록으로 가요
  await sheet.getByRole('button', { name: '북구', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('전남광주 북구 정책을 보여 드릴게요');
  await expect(sidoBox(page)).toContainText('전남광주');
  await expect(sggBox(page)).toContainText('북구');
  // 고른 뒤 첫 화면: 개수 / 이번 주 새 정책 / 동네
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/지금 신청할 수 있는\s*정책 \d+개/);
  // 새 정책 수를 누르면 최근 등록순으로 바뀌어요
  await page.getByRole('button', { name: /이번 주 새로 올라온 정책 \d+개/ }).click();
  await expect(page.locator('#list-title')).toHaveText('새로 올라온 정책');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: shot('town', info.project.name), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: /더보기/ }).click();
  const meta = await page.locator('.policy-texts span').allInnerTexts();
  for (const m of meta) expect(m).toMatch(/전국|전남광주/);
  // 우리 지역만: 전국 정책을 빼요
  await page.getByText('우리 지역만').click();
  await expect(page.locator('.policy-texts span').first()).not.toContainText('전국');
  const local = await page.locator('.policy-texts span').allInnerTexts();
  for (const m of local) expect(m).not.toMatch(/전국/);
  await page.getByText('우리 지역만').click();
  // 시·군·구 칸은 그 시·도의 목록을 바로 열어요
  await sggBox(page).click();
  await expect(sheet.getByRole('heading', { name: '전남광주통합특별시' })).toBeVisible();
  await sheet.getByRole('button', { name: '광산구', exact: true }).click();
  await expect(sggBox(page)).toContainText('광산구');
  await page.reload();
  await expect(sggBox(page)).toContainText('광산구');
  // 모든 지역으로 돌아가기
  await sidoBox(page).click();
  await sheet.getByRole('button', { name: '모든 지역', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('사는 동네를골라 주세요');
});

test('지역: 세종은 시·군·구 없이 바로 골라져요', async ({ page }) => {
  await page.goto('/?notify=0');
  await sidoBox(page).click();
  await page.getByRole('dialog', { name: '동네 고르기' }).getByRole('button', { name: '세종', exact: true }).click();
  await expect(sggBox(page)).toContainText('세종시');
  await expect(sggBox(page)).toBeDisabled();
});

test('정렬과 조건', async ({ page }) => {
  await page.goto('/?notify=0');
  await page.getByRole('button', { name: /정렬: 마감 임박순/ }).click();
  const sheet = page.getByRole('dialog', { name: '정렬' });
  await sheet.getByRole('radio', { name: '조회 많은순' }).click();
  await expect(sheet).toBeHidden();
  await expect(rows(page).first()).toContainText('청년도약계좌');
  // 청년 대상만: 청년과 관계없는 혜택(첫만남이용권)은 빠져요
  const youth = page.getByText('청년 대상', { exact: true });
  await youth.click();
  await page.getByRole('button', { name: /더보기/ }).click();
  await expect(page.locator('.policy-row', { hasText: '첫만남이용권' })).toHaveCount(0);
  await youth.click();
  await page.getByRole('button', { name: /더보기/ }).click();
  await expect(page.locator('.policy-row', { hasText: '첫만남이용권' })).toHaveCount(1);
  await page.getByRole('button', { name: '접기' }).click();
  // 신청 가능한 것만을 풀면 마감된 정책도 보여요
  await youth.click();
  const more = page.getByRole('button', { name: /더보기 \(\d+개\)/ });
  const before = await more.innerText();
  await page.getByText('신청 가능', { exact: true }).click();
  await expect(more).not.toHaveText(before);
  await expect(page.locator('#list-title')).toHaveText('많이 본 정책'); // 목록 제목은 개수 대신 정렬 기준
  // 분야
  await page.getByRole('group', { name: '분야' }).getByRole('button', { name: '주거' }).click();
  await expect(rows(page)).toHaveCount(2);
});

test('상세: 공식 페이지 버튼, 닫으면 초점 복귀', async ({ page }, info) => {
  await page.goto('/?notify=0');
  const row = rows(page).first();
  await row.focus();
  await page.keyboard.press('Enter');
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('button', { name: '공식 페이지에서 확인하기' })).toBeVisible();
  await expect(sheet.getByText('신청 기간')).toBeVisible();
  await page.screenshot({ path: shot('detail', info.project.name), animations: 'disabled' });
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(row).toBeFocused();
});

test('새 정책 알림(개발 화면에서만 켬): 아래 버튼 → 설정 창 → 동의 → 시작 → 끄기', async ({ page }, info) => {
  await page.goto('/');
  await pickRegion(page, '전남광주', '북구');
  const cta = page.getByRole('button', { name: '새 정책이 올라오면 알려드릴까요?' });
  await cta.click();
  const sheet = page.getByRole('dialog', { name: '새 정책 알림' });
  await expect(sheet).toContainText('전남광주 북구에 새 정책이 올라오면');
  await expect(page.getByRole('status')).toHaveCount(0); // 바로 등록하지 않아요
  await page.screenshot({ path: shot('notify', info.project.name), animations: 'disabled' });
  await sheet.getByRole('button', { name: '알림 받기' }).click();
  await expect(page.getByRole('status')).toHaveText('전남광주 북구에 새 정책이 올라오면 알려드릴게요');
  await page.getByRole('button', { name: '새 정책 알림 받는 중' }).click();
  await page.getByRole('dialog', { name: '새 정책 알림' }).getByRole('button', { name: '알림 끄기' }).click();
  await expect(page.getByRole('status')).toHaveText('알림을 껐어요');
  await expect(cta).toBeVisible();
});

test('약관과 처리방침', async ({ page }) => {
  await page.goto('/?notify=0');
  await page.getByRole('button', { name: '개인정보 처리방침' }).click();
  await expect(page.getByRole('dialog').getByText('수집하는 정보')).toBeVisible();
});

test('화면 크기: 가로로 넘치지 않아요', async ({ page }) => {
  await page.goto('/?notify=0');
  await expect(rows(page).first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
