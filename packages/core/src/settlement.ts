import type { Person, PersonCode, SplitResult } from './types';
import { formatK } from './money';

export interface PeriodSplit {
  id: string;
  isRent: boolean;
  result: SplitResult;
}

export interface SettlementInput {
  hub: PersonCode; // người giữ sổ, ứng tiền (Q)
  people: Person[];
  splits: PeriodSplit[];
  /** Nợ cũ mang sang (đồng). Dương: người đó còn nợ hub. */
  carried: Record<PersonCode, number>;
  /** Cho mượn trong đợt (cột "Riêng (cho mượn)"). */
  lent: Record<PersonCode, number>;
  /** Đã trả trong đợt. */
  payments: Record<PersonCode, number>;
}

export interface SettlementRow {
  person: PersonCode;
  name: string;
  nha: number;
  noCu: number;
  noMoi: number;
  rieng: number;
  tong: number;
  tra: number;
  conLai: number;
}

export interface SettlementOutput {
  rows: SettlementRow[];
  /** Phần tiêu dùng chung của hub (đã gộp người được hub trả hộ). */
  hubShare: { chung: number; nha: number };
  transfers: { from: PersonCode; to: PersonCode; amount: number }[];
}

/** Người mà phần của p được tính vào (Ngọc → Quang). */
export function ledgerOf(p: PersonCode, people: Person[]): PersonCode {
  const seen = new Set<string>();
  let cur = p;
  while (!seen.has(cur)) {
    seen.add(cur);
    const next = people.find((x) => x.code === cur)?.paidBy;
    if (!next) return cur;
    cur = next;
  }
  return cur;
}

export function settle(input: SettlementInput): SettlementOutput {
  const { hub, people } = input;
  const nha: Record<string, number> = {};
  const noMoi: Record<string, number> = {};
  const hubShare = { chung: 0, nha: 0 };

  for (const s of input.splits) {
    const net: Record<string, number> = {};
    for (const [p, v] of Object.entries(s.result.shares)) {
      const l = ledgerOf(p, people);
      net[l] = (net[l] ?? 0) + v;
      if (l === hub) {
        if (s.isRent) hubShare.nha += v;
        else hubShare.chung += v;
      }
    }
    for (const [p, v] of Object.entries(s.result.paid)) {
      const l = ledgerOf(p, people);
      net[l] = (net[l] ?? 0) - v;
    }
    const target = s.isRent ? nha : noMoi;
    for (const [p, v] of Object.entries(net)) if (p !== hub) target[p] = (target[p] ?? 0) + v;
  }

  const codes = new Set<string>();
  for (const m of [nha, noMoi, input.carried, input.lent, input.payments]) Object.keys(m).forEach((k) => codes.add(k));
  const ordered = people.filter((p) => p.code !== hub && ledgerOf(p.code, people) === p.code);
  for (const c of codes) if (c !== hub && !ordered.some((p) => p.code === c)) ordered.push({ code: c, name: c, role: 'food' });

  const rows: SettlementRow[] = ordered
    .map((p) => {
      const r = {
        person: p.code,
        name: p.name,
        nha: nha[p.code] ?? 0,
        noCu: input.carried[p.code] ?? 0,
        noMoi: noMoi[p.code] ?? 0,
        rieng: input.lent[p.code] ?? 0,
        tra: input.payments[p.code] ?? 0,
        tong: 0,
        conLai: 0,
      };
      r.tong = r.nha + r.noCu + r.noMoi + r.rieng;
      r.conLai = r.tong - r.tra;
      return r;
    })
    .filter((r) => r.nha || r.noCu || r.noMoi || r.rieng || r.tra || people.some((p) => p.code === r.person && p.active !== false));

  // Mặc định mọi người quyết toán với người giữ sổ (không chuyển chéo giữa bạn phòng)
  const transfers = rows
    .filter((r) => r.conLai !== 0)
    .map((r) => (r.conLai > 0 ? { from: r.person, to: hub, amount: r.conLai } : { from: hub, to: r.person, amount: -r.conLai }));
  return { rows, hubShare, transfers };
}

/** Gợi ý ít lần chuyển khoản nhất (tham lam). Mặc định mọi người quyết toán qua hub. */
export function minTransfers(rows: SettlementRow[], hub: PersonCode) {
  const bal: { p: string; v: number }[] = rows.filter((r) => r.conLai !== 0).map((r) => ({ p: r.person, v: r.conLai }));
  const hubBal = -bal.reduce((a, b) => a + b.v, 0);
  if (hubBal !== 0) bal.push({ p: hub, v: hubBal });
  const debt = bal.filter((b) => b.v > 0).sort((a, b) => b.v - a.v);
  const cred = bal.filter((b) => b.v < 0).map((b) => ({ p: b.p, v: -b.v })).sort((a, b) => b.v - a.v);
  const out: { from: string; to: string; amount: number }[] = [];
  let i = 0;
  let j = 0;
  while (i < debt.length && j < cred.length) {
    const a = Math.min(debt[i].v, cred[j].v);
    if (a > 0) out.push({ from: debt[i].p, to: cred[j].p, amount: a });
    debt[i].v -= a;
    cred[j].v -= a;
    if (debt[i].v === 0) i++;
    if (cred[j].v === 0) j++;
  }
  return out;
}

/** Tin nhắn nhắc nợ để copy gửi Zalo. */
export function reminderText(row: SettlementRow, periodName: string, bankLine?: string): string {
  const parts: string[] = [];
  if (row.nha) parts.push(`Nhà ${formatK(row.nha, 3)}`);
  if (row.noCu) parts.push(`Nợ cũ ${formatK(row.noCu, 3)}`);
  if (row.noMoi) parts.push(`Ăn chung ${formatK(row.noMoi, 3)}`);
  if (row.rieng) parts.push(`Mượn ${formatK(row.rieng, 3)}`);
  const lines = [`${row.name} ơi, tiền phòng đợt ${periodName}:`, `${parts.join(' + ') || '0'} = ${formatK(row.tong, 3)}`];
  if (row.tra) lines.push(`Đã trả ${formatK(row.tra, 3)}`);
  lines.push(row.conLai >= 0 ? `Còn lại: ${formatK(row.conLai, 3)}` : `Bạn trả dư ${formatK(-row.conLai, 3)}, trừ vào đợt sau nhé.`);
  if (bankLine && row.conLai > 0) lines.push(bankLine);
  return lines.join('\n');
}
