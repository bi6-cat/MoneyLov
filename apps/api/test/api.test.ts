import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.PGDATA = 'memory://';
const { openDb } = await import('../src/db');
const { createApp } = await import('../src/app');
const { seed } = await import('../src/seed');

const dot = JSON.parse(readFileSync(new URL('../../../packages/core/test/fixtures/dot-2026-10-30.json', import.meta.url), 'utf8'));

let app: ReturnType<typeof createApp>;
let close: () => Promise<void>;
let cookie = '';

const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
  const res = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json', cookie, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = text;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, res };
};

beforeAll(async () => {
  const o = await openDb();
  close = o.close;
  await seed(o.db);
  app = createApp(o.db);
});
afterAll(async () => close?.());

describe('API', () => {
  it('chặn khi chưa đăng nhập', async () => {
    expect((await call('GET', '/api/meta')).status).toBe(401);
  });

  it('đặt mật khẩu lần đầu và đăng nhập', async () => {
    expect((await call('GET', '/api/auth/status')).json).toEqual({ setup: true });
    const r = await call('POST', '/api/auth/setup', { password: 'matkhau-602' });
    expect(r.status).toBe(200);
    cookie = r.res.headers.get('set-cookie')!.split(';')[0];
    expect((await call('GET', '/api/meta')).status).toBe(200);
    expect((await call('POST', '/api/auth/setup', { password: 'khac-12345' })).status).toBe(409);
  });

  it('nạp thử (dry run): 174 khoản mới, đối soát khớp', async () => {
    const r = await call('POST', '/api/import?dry_run=1', dot);
    expect(r.status).toBe(200);
    expect(r.json.stats).toEqual({ added: 174, updated: 0, unchanged: 0, locked: 0 });
    expect(r.json.checks.every((c: any) => c.ok)).toBe(true);
    expect((await call('GET', '/api/transactions?limit=1')).json.total).toBe(0);
  });

  it('nạp thật, rồi nạp lại không tạo trùng', async () => {
    const r = await call('POST', '/api/import?filename=dot-2026-10-30.json', dot);
    expect(r.status).toBe(201);
    expect(r.json.period).toMatchObject({ name: 'Từ 30/10', created: true });
    const again = await call('POST', '/api/import', dot);
    expect(again.json.stats).toMatchObject({ added: 0, unchanged: 174 });
    const meta = (await call('GET', '/api/meta')).json;
    expect(meta.pending).toBe(174);
    const mb = meta.accounts.find((a: any) => a.importSource === 'MB');
    expect(mb.txCount).toBe(108);
    expect(mb.balance).toBe(3025924); // số dư cuối sao kê
  });

  it('token import nạp được, token không vào được route khác', async () => {
    const t = await call('POST', '/api/tokens', { name: 'Claude', scopes: ['import'] });
    const auth = { authorization: `Bearer ${t.json.token}`, cookie: '' };
    expect((await call('POST', '/api/import?dry_run=1', dot, auth)).status).toBe(200);
    expect((await call('GET', '/api/meta', undefined, auth)).status).toBe(403);
    expect((await call('GET', '/api/learning-export', undefined, auth)).status).toBe(200);
  });

  let periodId = 0;
  it('tự duyệt các khoản chắc chắn, tiền nhà chia 4', async () => {
    const review = (await call('GET', '/api/transactions/review')).json.rows;
    const okCount = review.filter((r: any) => r.auto.ok).length;
    expect(okCount).toBeGreaterThan(50);
    const r = await call('POST', '/api/transactions/auto-approve', {});
    expect(r.json.failed).toEqual([]);
    expect(r.json.ok).toHaveLength(okCount);

    periodId = (await call('GET', '/api/meta')).json.periods[0].id;
    const d = (await call('GET', `/api/periods/${periodId}`)).json;
    for (const code of ['D', 'C', 'M']) expect(d.settlement.rows.find((x: any) => x.person === code).nha).toBe(2125000);
    expect(d.settlement.hubShare.nha).toBe(2125000);
  });

  it('duyệt tay một bill chia theo món có người bao, rồi học quy tắc', async () => {
    const tx = (await call('GET', '/api/transactions?q=FT26304822398951')).json.rows[0]; // Gà Mayo 751k
    const r = await call('POST', `/api/transactions/${tx.id}/approve`, {
      action: 'split',
      split: { mode: 'equal', people: ['Q', 'D', 'C', 'M'], covers: [{ person: 'D', amount: 151000 }] },
      category: 'Ăn uống',
      title: 'Gà Mayo',
      answer: 'Duy bao 151k',
      createRule: true,
    });
    expect(r.status).toBe(200);
    expect(r.json.rule).toBeTruthy();
    const d = (await call('GET', `/api/periods/${periodId}`)).json;
    const sp = d.splits.find((s: any) => s.transactionId === tx.id);
    expect(sp.result.shares).toEqual({ Q: 150000, D: 301000, C: 150000, M: 150000 });
  });

  it('chưa chốt được khi còn khoản chờ; xuất toan-bo.json', async () => {
    expect((await call('POST', `/api/periods/${periodId}/close`)).status).toBe(409);
    const ex = await call('GET', `/api/periods/${periodId}/export`);
    expect(ex.status).toBe(200);
    expect(ex.json.dot.ten).toBe('Từ 30/10');
    expect(ex.json.trang_tinh_1.find((r: any) => r.id === 'FT26304822398951').theoCot).toMatchObject({ 'Quang+Ngọc': 150, Duy: 301 });
  });

  it('bỏ qua phần còn lại, chốt đợt, đợt sau tự mang nợ cũ', async () => {
    const rest = (await call('GET', '/api/transactions/review')).json.rows.map((r: any) => r.id);
    const b = await call('POST', '/api/transactions/bulk-approve', { ids: rest, decision: { action: 'ignore' } });
    expect(b.json.failed).toEqual([]);
    const closed = await call('POST', `/api/periods/${periodId}/close`);
    expect(closed.status).toBe(200);
    const duy = closed.json.settlement.rows.find((x: any) => x.person === 'D');

    const np = await call('POST', '/api/periods', { name: 'Từ 24/11', fromDate: '2026-11-24', toDate: '2026-12-23', rentTotal: 8500000 });
    const nd = (await call('GET', `/api/periods/${np.json.id}`)).json;
    expect(nd.carried.D).toBe(duy.conLai);
    expect(nd.previous.id).toBe(periodId);

    // Đợt đã chốt không sửa được
    const anyTx = (await call('GET', `/api/transactions?periodId=${periodId}&limit=1`)).json.rows[0];
    expect((await call('POST', `/api/transactions/${anyTx.id}/unapprove`)).status).toBe(409);
  });

  it('báo cáo, ngân sách, dashboard chạy được', async () => {
    const rep = await call('GET', '/api/reports?from=2026-10-01&to=2026-11-30');
    expect(rep.status).toBe(200);
    expect(rep.json.total).toBeGreaterThan(0);
    expect(rep.json.scope.Nha).toBe(2125000);
    const cat = (await call('GET', '/api/meta')).json.categories.find((c: any) => c.name === 'Ăn uống');
    await call('PUT', '/api/budgets', { categoryId: cat.id, month: '2026-11', amount: 3000000 });
    const bs = (await call('GET', '/api/budgets?month=2026-11')).json;
    expect(bs.items[0].limit).toBe(3000000);
    expect((await call('GET', '/api/dashboard')).status).toBe(200);
    expect((await call('GET', '/api/recurring')).status).toBe(200);
    const csv = await call('GET', '/api/reports/export.csv?from=2026-10-01&to=2026-11-30');
    expect(String(csv.json)).toContain('Nhà');
  });

  it('sao lưu rồi khôi phục giữ nguyên dữ liệu', async () => {
    const b = (await call('GET', '/api/backup')).json;
    const r = await call('POST', '/api/restore', { confirm: 'KHOI PHUC', backup: b });
    expect(r.status).toBe(200);
    expect((await call('GET', '/api/transactions?limit=1')).json.total).toBe(174);
  });
});
