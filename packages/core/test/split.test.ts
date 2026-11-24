import { describe, expect, it } from 'vitest';
import { allocate, computeSplit, groupCode, sum } from '../src';

describe('allocate', () => {
  it('tổng luôn đúng', () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(455091, [1, 1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(455091);
  });
  it('trọng số 0 không nhận phần dư', () => {
    expect(allocate(10, [0, 1, 2])).toEqual([0, 3, 7]);
  });
});

describe('computeSplit', () => {
  it('chia đều', () => {
    const r = computeSplit({ mode: 'equal', total: 455091, people: ['Q', 'D', 'C', 'M'] });
    expect(sum(r.shares)).toBe(455091);
    expect(r.paid).toEqual({ Q: 455091 });
  });
  it('theo món: phân bổ ship/giảm giá theo tỉ lệ', () => {
    const r = computeSplit({
      mode: 'items',
      total: 73000,
      items: [
        { name: 'sầu riêng', price: 39000, people: ['Q'] },
        { name: 'bưởi', price: 20000, people: ['D'] },
        { name: 'xoài', price: 38000, people: ['C', 'M'] },
      ],
    });
    expect(sum(r.shares)).toBe(73000);
    expect(r.shares.Q).toBeGreaterThan(r.shares.D);
    expect(Math.abs(r.shares.C - r.shares.M)).toBeLessThanOrEqual(1);
  });
  it('đơn Grab nhóm: đúng từng người', () => {
    const r = computeSplit({ mode: 'exact', total: 68000, amounts: { Q: 34000, M: 34000 } });
    expect(r.shares).toEqual({ Q: 34000, M: 34000 });
    expect(r.warnings).toEqual([]);
  });
  it('người bao một phần', () => {
    const r = computeSplit({ mode: 'equal', total: 685000, people: ['Q', 'D', 'C'], covers: [{ person: 'D', amount: 300000 }] });
    expect(r.shares.D - r.shares.Q).toBeGreaterThanOrEqual(299999);
    expect(sum(r.shares)).toBe(685000);
  });
  it('người bao toàn bộ', () => {
    const r = computeSplit({ mode: 'equal', total: 1503000, people: ['Q', 'D'], covers: [{ person: 'Cg', full: true }] });
    expect(r.shares).toEqual({ Cg: 1503000 });
  });
  it('đồ riêng trong bill chung', () => {
    const r = computeSplit({ mode: 'equal', total: 300000, people: ['Q', 'D', 'C', 'M'], privates: [{ person: 'Q', amount: 85000 }] });
    expect(r.privates.Q).toBe(85000);
    expect(r.shares.Q).toBe(85000 + 53750);
    expect(sum(r.shares)).toBe(300000);
  });
  it('điều chỉnh ± giữ nguyên tổng', () => {
    const r = computeSplit({ mode: 'equal', total: 120000, people: ['Q', 'D', 'C'], adjustments: [{ person: 'Q', delta: 15000 }] });
    expect(r.shares).toEqual({ Q: 55000, D: 32500, C: 32500 });
  });
  it('nhiều người cùng trả', () => {
    const r = computeSplit({
      mode: 'equal',
      total: 90000,
      people: ['Q', 'D', 'C'],
      payers: [
        { person: 'Q', amount: 60000 },
        { person: 'D', amount: 30000 },
      ],
    });
    expect(r.paid).toEqual({ Q: 60000, D: 30000 });
  });
  it('phần trăm và số phần', () => {
    expect(computeSplit({ mode: 'percent', total: 1000, percents: { Q: 70, D: 30 } }).shares).toEqual({ Q: 700, D: 300 });
    expect(computeSplit({ mode: 'shares', total: 900, weights: { Q: 2, D: 1 } }).shares).toEqual({ Q: 600, D: 300 });
  });
  it('báo lỗi khi bao vượt tổng', () => {
    expect(() => computeSplit({ mode: 'equal', total: 100, people: ['Q'], covers: [{ person: 'D', amount: 200 }] })).toThrow();
  });
});

describe('groupCode', () => {
  const room = ['Q', 'D', 'C', 'M'];
  it('đủ phòng', () => expect(groupCode(['Q', 'D', 'C', 'M'], room)).toBe('4'));
  it('phòng + Ngọc', () => expect(groupCode(['Q', 'D', 'C', 'M', 'N'], room)).toBe('4+N'));
  it('một nhóm', () => expect(groupCode(['Q', 'D', 'M'], room)).toBe('QDM'));
});
