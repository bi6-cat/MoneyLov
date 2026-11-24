import { describe, expect, it } from 'vitest';
import { computeSplit, DEFAULT_PEOPLE, exportToanBo, settle, type LedgerTx } from '../src';

const people = DEFAULT_PEOPLE;

describe('settle', () => {
  it('nhà + ăn chung + nợ cũ + cho mượn + trả', () => {
    const rent = computeSplit({ mode: 'rent', total: 8500000, people: ['Q', 'D', 'C', 'M'] });
    const food = computeSplit({ mode: 'equal', total: 100000, people: ['Q', 'D', 'N', 'Cg'] });
    const out = settle({
      hub: 'Q',
      people,
      splits: [
        { id: 'r', isRent: true, result: rent },
        { id: 'f', isRent: false, result: food },
      ],
      carried: { D: 3571000 },
      lent: { Cg: 1500000 },
      payments: { D: 2000000 },
    });
    const d = out.rows.find((r) => r.person === 'D')!;
    expect(d).toMatchObject({ nha: 2125000, noCu: 3571000, noMoi: 25000, tra: 2000000, conLai: 2125000 + 3571000 + 25000 - 2000000 });
    expect(out.rows.find((r) => r.person === 'N')).toBeUndefined(); // Ngọc gộp vào Quang
    expect(out.hubShare.chung).toBe(50000);
    expect(out.hubShare.nha).toBe(2125000);
    expect(out.rows.find((r) => r.person === 'Cg')!.conLai).toBe(1525000);
  });

  it('người khác trả bill thì được trừ nợ', () => {
    const food = computeSplit({ mode: 'equal', total: 90000, people: ['Q', 'D', 'C'], payers: [{ person: 'D', amount: 90000 }] });
    const out = settle({ hub: 'Q', people, splits: [{ id: 'x', isRent: false, result: food }], carried: {}, lent: {}, payments: {} });
    expect(out.rows.find((r) => r.person === 'D')!.noMoi).toBe(-60000);
    expect(out.rows.find((r) => r.person === 'C')!.noMoi).toBe(30000);
    expect(out.transfers).toEqual([
      { from: 'Q', to: 'D', amount: 60000 },
      { from: 'C', to: 'Q', amount: 30000 },
    ]);
  });

  it('xuất toan-bo.json: cột Quang+Ngọc khớp dòng Chung', () => {
    const r = computeSplit({ mode: 'equal', total: 300000, people: ['Q', 'D', 'N'], privates: [{ person: 'Q', amount: 30000 }] });
    const txs: LedgerTx[] = [
      { extId: 'FT1', name: 'ShopeePay', date: '2026-11-03T10:00', source: 'MB', amount: 300000, kind: 'split', split: { result: r, isRent: false }, category: 'Ăn uống' },
      { extId: 'FT2', name: 'Sách', date: '2026-11-04T10:00', source: 'MB', amount: 50000, kind: 'expense', scope: 'Rieng', category: 'Học' },
    ];
    const st = settle({ hub: 'Q', people, splits: [{ id: 'FT1', isRent: false, result: r }], carried: {}, lent: {}, payments: {} });
    const out = exportToanBo({ period: { name: 'T', from: '2026-11-01', to: '2026-11-30' }, hub: 'Q', people, txs, settlement: st });
    const row = out.trang_tinh_1[0];
    const chung = out.chi_tieu_quang.dong.find((d) => d.gd_id === 'FT1' && d.loai === 'Chung')!;
    expect(row.theoCot['Quang+Ngọc']).toBe(chung.so_tien_k);
    expect(row.don_gia).toBe(270);
    expect(out.chi_tieu_quang.dong.find((d) => d.id === 'FT1#rieng')!.so_tien_k).toBe(30);
    expect(row.nhom).toBe('QDN');
  });
});
