// Kiểm thử khói: đặt mật khẩu → nạp file → tự duyệt → duyệt 1 bill theo món → mở mọi trang, chụp màn hình.
// Chạy: BASE=http://localhost:18787 node e2e/smoke.mjs (cần thư viện playwright)
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:18787';
const OUT = process.env.OUT ?? 'e2e/shots';
const PW = 'matkhau-602-test';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, locale: 'vi-VN' });
const page = await ctx.newPage();
page.on('console', (m) => m.type() === 'error' && !m.text().includes('401') && errors.push(`console: ${m.text()}`));
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(BASE);
await page.getByPlaceholder('Mật khẩu', { exact: true }).fill(PW);
const again = page.getByPlaceholder('Nhập lại mật khẩu');
if (await again.count()) await again.fill(PW);
await page.getByRole('button', { name: /Đặt mật khẩu|Đăng nhập/ }).click();
await page.getByText('Tổng quan').first().waitFor();

// Nạp file qua API (cùng cookie)
const dot = JSON.parse(readFileSync(process.env.DOT ?? 'packages/core/test/fixtures/dot-2026-10-30.json', 'utf8'));
const imp = await page.request.post(`${BASE}/api/import?filename=dot.json`, { data: dot });
console.log('import', imp.status(), JSON.stringify((await imp.json()).stats));
if (imp.status() !== 201) throw new Error('Nạp file thất bại (cookie đăng nhập không được lưu?)');

// Hộp duyệt + tự duyệt qua giao diện
await page.goto(`${BASE}/review`);
await page.getByRole('button', { name: /Tự duyệt \d+ khoản/ }).waitFor();
await page.screenshot({ path: `${OUT}/review.png`, fullPage: false });
await page.getByRole('button', { name: /Tự duyệt \d+ khoản/ }).click();
await page.screenshot({ path: `${OUT}/review-auto-modal.png` });
await page.getByRole('button', { name: /^Duyệt \d+ khoản$/ }).click();
await page.getByText(/Đã tự duyệt/).waitFor();

// Mở một khoản cần trả lời và chia theo món
await page.locator('[data-idx="0"]').click();
await page.getByRole('button', { name: /^Duyệt ·/ }).waitFor();
await page.getByRole('tab', { name: 'Chia tiền' }).click();
await page.getByRole('tab', { name: 'Theo món' }).click();
await page.screenshot({ path: `${OUT}/drawer-split.png` });
await page.keyboard.press('Escape');

const pages = ['/', '/transactions', '/split', '/budgets', '/reports', '/plans', '/settings'];
for (const p of pages) {
  await page.goto(BASE + p);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/desktop${p === '/' ? '-home' : p.replace('/', '-')}.png`, fullPage: true });
}

// Điện thoại
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, storageState: await ctx.storageState(), locale: 'vi-VN' });
const mp = await m.newPage();
mp.on('pageerror', (e) => errors.push(`mobile pageerror: ${e.message}`));
for (const p of ['/', '/review', '/split', '/reports']) {
  await mp.goto(BASE + p);
  await mp.waitForLoadState('networkidle');
  await mp.waitForTimeout(400);
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) errors.push(`mobile ${p}: tràn ngang ${overflow}px`);
  await mp.screenshot({ path: `${OUT}/mobile${p === '/' ? '-home' : p.replace('/', '-')}.png`, fullPage: false });
}

// Tối
await page.emulateMedia({ colorScheme: 'dark' });
await page.goto(`${BASE}/reports`);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/dark-reports.png`, fullPage: true });

await browser.close();
console.log(errors.length ? `LỖI:\n${errors.join('\n')}` : 'Không có lỗi console');
process.exit(errors.length ? 1 : 0);
