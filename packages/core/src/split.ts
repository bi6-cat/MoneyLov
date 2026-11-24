import { allocate } from './money';
import type { PersonCode, SplitConfig, SplitResult } from './types';

const add = (m: Record<string, number>, k: string, v: number) => {
  if (v === 0 && k in m) return;
  m[k] = (m[k] ?? 0) + v;
};

function weightsFor(cfg: SplitConfig, warnings: string[]): { people: PersonCode[]; weights: number[] } {
  switch (cfg.mode) {
    case 'equal':
    case 'rent': {
      const people = [...new Set(cfg.people ?? [])];
      return { people, weights: people.map(() => 1) };
    }
    case 'exact': {
      const e = Object.entries(cfg.amounts ?? {}).filter(([, v]) => v > 0);
      return { people: e.map(([p]) => p), weights: e.map(([, v]) => v) };
    }
    case 'percent': {
      const e = Object.entries(cfg.percents ?? {}).filter(([, v]) => v > 0);
      const sum = e.reduce((a, [, v]) => a + v, 0);
      if (e.length && Math.abs(sum - 100) > 0.01) warnings.push(`Tổng phần trăm là ${sum}%, không phải 100%. Đã chia theo tỉ lệ.`);
      return { people: e.map(([p]) => p), weights: e.map(([, v]) => v) };
    }
    case 'shares': {
      const e = Object.entries(cfg.weights ?? {}).filter(([, v]) => v > 0);
      return { people: e.map(([p]) => p), weights: e.map(([, v]) => v) };
    }
    case 'items': {
      const w: Record<string, number> = {};
      for (const it of cfg.items ?? []) {
        const ps = [...new Set(it.people)];
        if (!ps.length) {
          warnings.push(`Món "${it.name}" chưa có người.`);
          continue;
        }
        for (const p of ps) add(w, p, it.price / ps.length);
      }
      const e = Object.entries(w);
      return { people: e.map(([p]) => p), weights: e.map(([, v]) => v) };
    }
  }
}

/**
 * Tính phần của từng người cho một bill.
 * Thứ tự: trừ phần người bao và đồ riêng → chia phần còn lại theo chế độ → áp điều chỉnh.
 */
export function computeSplit(cfg: SplitConfig, defaultPayer: PersonCode = 'Q'): SplitResult {
  const warnings: string[] = [];
  const total = Math.round(cfg.total);
  const shares: Record<string, number> = {};
  const privates: Record<string, number> = {};
  const covered: Record<string, number> = {};

  const fullCover = (cfg.covers ?? []).find((c) => c.full);
  let base = total;
  if (fullCover) {
    covered[fullCover.person] = total;
    base = 0;
  } else {
    for (const c of cfg.covers ?? []) {
      const a = Math.round(c.amount ?? 0);
      if (a > 0) add(covered, c.person, a);
    }
    for (const p of cfg.privates ?? []) {
      const a = Math.round(p.amount);
      if (a > 0) add(privates, p.person, a);
    }
    base = total - sum(covered) - sum(privates);
    if (base < 0) {
      throw new SplitError('Phần bao và đồ riêng vượt quá tổng bill.');
    }
  }

  if (base > 0) {
    const { people, weights } = weightsFor(cfg, warnings);
    if (!people.length) throw new SplitError('Chưa chọn người để chia.');
    if (cfg.mode === 'exact') {
      const s = weights.reduce((a, b) => a + b, 0);
      if (Math.abs(s - base) > 0) {
        warnings.push(`Tổng số tiền từng người (${s}) lệch ${base - s} đ so với phần cần chia (${base}). Đã chia theo tỉ lệ.`);
      }
    }
    allocate(base, weights).forEach((v, i) => add(shares, people[i], v));

    const adj = (cfg.adjustments ?? []).filter((a) => a.delta !== 0);
    if (adj.length) {
      const adjusted = new Set(adj.map((a) => a.person));
      const others = Object.keys(shares).filter((p) => !adjusted.has(p));
      const totalDelta = adj.reduce((a, b) => a + Math.round(b.delta), 0);
      for (const a of adj) add(shares, a.person, Math.round(a.delta));
      if (others.length) {
        allocate(-totalDelta, others.map(() => 1)).forEach((v, i) => add(shares, others[i], v));
      } else if (totalDelta !== 0) {
        throw new SplitError('Điều chỉnh làm lệch tổng nhưng không còn ai để bù.');
      }
      if (Object.values(shares).some((v) => v < 0)) warnings.push('Có người bị âm sau khi điều chỉnh.');
    }
  }

  for (const [p, v] of Object.entries(covered)) add(shares, p, v);
  for (const [p, v] of Object.entries(privates)) add(shares, p, v);

  const paid: Record<string, number> = {};
  const payers = (cfg.payers ?? []).filter((p) => p.amount > 0);
  if (payers.length) {
    for (const p of payers) add(paid, p.person, Math.round(p.amount));
    const s = sum(paid);
    if (s !== total) warnings.push(`Tổng người trả (${s}) khác tổng bill (${total}).`);
  } else {
    paid[defaultPayer] = total;
  }

  const s = sum(shares);
  if (s !== total) throw new SplitError(`Lỗi nội bộ: tổng các phần ${s} ≠ ${total}.`);
  return { shares, paid, privates, covered, warnings };
}

export class SplitError extends Error {}

export const sum = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0);

/** Mã nhóm như trên sheet: "4", "4+N", "QDM"… */
export function groupCode(sharePeople: PersonCode[], roommates: PersonCode[]): string {
  const set = new Set(sharePeople);
  const allRoom = roommates.length > 0 && roommates.every((r) => set.has(r));
  if (allRoom) {
    const extra = [...set].filter((p) => !roommates.includes(p));
    return extra.length ? `${roommates.length}+${extra.join('')}` : String(roommates.length);
  }
  return [...set].join('');
}
