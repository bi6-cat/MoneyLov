import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canAutoApprove, findRule, parseImport, proposeRule } from '../src';

const json = JSON.parse(readFileSync(new URL('./fixtures/dot-2026-10-30.json', import.meta.url), 'utf8'));

describe('file nạp đợt Từ 30/10', () => {
  const p = parseImport(json);
  it('đủ 174 giao dịch: 108 MB, 66 thẻ', () => {
    expect(p.transactions).toHaveLength(174);
    expect(p.transactions.filter((t) => t.source === 'MB')).toHaveLength(108);
  });
  it('mọi kiểm tra đối soát đều qua', () => {
    for (const c of p.checks) expect(c.ok, `${c.label}: ${c.detail}`).toBe(true);
    expect(p.checks.find((c) => c.key === 'balance')?.detail).toContain('3025924');
  });
  it('đợt và tiền nhà', () => {
    expect(p.period).toMatchObject({ name: 'Từ 30/10', from: '2026-10-30', to: '2026-11-23', rentTotal: 8500000 });
  });
  it('gợi ý được chuyển đúng', () => {
    const rent = p.transactions.find((t) => t.extId === 'FT26308084995831')!;
    expect(rent.suggestion).toMatchObject({ action: 'split', isRent: true });
    const grab = p.transactions.find((t) => t.extId === 'A-AXSL2RXGX55PAV')!;
    expect(grab.suggestion).toMatchObject({ action: 'split', split: { mode: 'exact', amounts: { Q: 34000, M: 34000 } } });
    const pay = p.transactions.find((t) => t.extId === 'FT26303095138483')!;
    expect(pay.suggestion).toEqual({ action: 'settlement', person: 'Qy' });
  });
  it('tự duyệt chỉ nhận khoản chắc chắn, đủ thông tin', () => {
    const ok = p.transactions.filter((t) => canAutoApprove(t, { minConfirmations: 3 }).ok);
    expect(ok.length).toBeGreaterThan(50);
    expect(ok.every((t) => !t.question)).toBe(true);
  });
});

describe('quy tắc', () => {
  it('đề xuất và khớp theo số tài khoản', () => {
    const t = { counterparty: 'HOANG THI NGAN', counterpartyAccount: '190', rawContent: 'x', source: 'MB', direction: 'out' as const, amount: 16000 };
    const r = proposeRule(t, { action: 'expense', scope: 'Rieng', category: 'Ăn uống' })!;
    expect(findRule([{ ...r, id: 1 }], t)?.id).toBe(1);
  });
  it('khớp đối tác không dấu', () => {
    const rule = { id: 1, name: 'w', enabled: true, priority: 1, match: { counterparty: 'winmart' }, action: { action: 'expense' as const, scope: 'Rieng' as const }, confirmations: 0 };
    expect(findRule([rule], { counterparty: 'WinMart Thăng Long', counterpartyAccount: null, rawContent: '', source: 'MB', direction: 'out', amount: 1 })).toBeTruthy();
  });
});
