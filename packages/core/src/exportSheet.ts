import { dongToK } from './money';
import { groupCode } from './split';
import { ledgerOf, type SettlementOutput } from './settlement';
import type { Person, PersonCode, Scope, SplitResult } from './types';

/** Giao dịch đã duyệt, dạng tối thiểu để dựng chi tiêu cá nhân và xuất sheet. */
export interface LedgerTx {
  extId: string;
  name: string;
  date: string; // YYYY-MM-DD…
  source: string;
  amount: number;
  kind: 'expense' | 'split';
  scope?: Scope | null;
  category?: string | null;
  note?: string | null;
  split?: { result: SplitResult; isRent: boolean } | null;
}

export interface PersonalLine {
  id: string;
  gdId: string;
  name: string;
  date: string;
  source: string;
  scope: Scope;
  amount: number;
  category: string | null;
  note: string | null;
}

/** Phần của hub (đã gộp người được hub trả hộ) trong một bill, tách phần chung và đồ riêng. */
function hubPart(result: SplitResult, hub: PersonCode, people: Person[]) {
  let share = 0;
  let priv = 0;
  for (const [p, v] of Object.entries(result.shares)) if (ledgerOf(p, people) === hub) share += v;
  for (const [p, v] of Object.entries(result.privates)) if (ledgerOf(p, people) === hub) priv += v;
  return { shared: share - priv, priv };
}

/** Chi tiêu của hub: Riêng / Chung / Nhà, giống tab "Chi tiêu Quang". */
export function personalLines(txs: LedgerTx[], hub: PersonCode, people: Person[]): PersonalLine[] {
  const out: PersonalLine[] = [];
  for (const t of txs) {
    const base = { gdId: t.extId, name: t.name, date: t.date, source: t.source, category: t.category ?? null, note: t.note ?? null };
    if (t.kind === 'expense') {
      out.push({ ...base, id: t.extId, scope: t.scope ?? 'Rieng', amount: t.amount });
    } else if (t.split) {
      const { shared, priv } = hubPart(t.split.result, hub, people);
      if (shared) out.push({ ...base, id: t.extId, scope: t.split.isRent ? 'Nha' : 'Chung', amount: shared });
      if (priv) out.push({ ...base, id: `${t.extId}#rieng`, scope: 'Rieng', amount: priv, note: 'Đồ riêng trong bill chung' });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

const ddmm = (d: string) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;
const LOAI: Record<Scope, string> = { Rieng: 'Riêng', Chung: 'Chung', Nha: 'Nhà' };

/**
 * Xuất `toan-bo.json` theo đúng định dạng sheet_b.py đang đọc
 * (trang_tinh_1, quyet_toan, chi_tieu_quang.dong).
 * Dòng tiền nhà không nằm trong khối chia (đã có ở cột "Nhà" của quyết toán).
 */
export function exportToanBo(args: {
  period: { name: string; from: string; to: string };
  hub: PersonCode;
  people: Person[];
  txs: LedgerTx[];
  settlement: SettlementOutput;
}) {
  const { hub, people } = args;
  const columns = [...new Set(people.map((p) => p.sheetColumn).filter(Boolean) as string[])];
  const colOf = (p: PersonCode) => people.find((x) => x.code === p)?.sheetColumn ?? people.find((x) => x.code === ledgerOf(p, people))?.sheetColumn ?? null;
  const roommates = people.filter((p) => p.role === 'roommate').map((p) => p.code);

  const splits = args.txs.filter((t) => t.kind === 'split' && t.split && !t.split.isRent).sort((a, b) => a.date.localeCompare(b.date));
  const trang_tinh_1 = splits.map((t, i) => {
    const r = t.split!.result;
    const theoCot: Record<string, number> = Object.fromEntries(columns.map((c) => [c, 0]));
    let hubPriv = 0;
    for (const [p, v] of Object.entries(r.shares)) {
      const c = colOf(p);
      if (c) theoCot[c] = (theoCot[c] ?? 0) + v;
    }
    for (const [p, v] of Object.entries(r.privates)) {
      if (ledgerOf(p, people) === hub) {
        hubPriv += v;
        const c = colOf(p);
        if (c) theoCot[c] -= v;
      }
    }
    const sharePeople = Object.entries(r.shares).filter(([, v]) => v > 0).map(([p]) => p);
    return {
      id: t.extId,
      stt: i + 1,
      ten: t.name,
      ngay: ddmm(t.date),
      nguon: t.source,
      nhom: groupCode(sharePeople, roommates),
      don_gia: dongToK(t.amount - hubPriv),
      theoCot: Object.fromEntries(Object.entries(theoCot).map(([c, v]) => [c, dongToK(v)])),
    };
  });

  const quyet_toan = args.settlement.rows.map((r) => ({
    ma: r.person,
    ten: r.name,
    nha: dongToK(r.nha),
    no_cu: dongToK(r.noCu),
    no_moi: dongToK(r.noMoi),
    rieng: dongToK(r.rieng),
    tong: dongToK(r.tong),
    tra: dongToK(r.tra),
    con_lai: dongToK(r.conLai),
  }));

  const dong = personalLines(args.txs, hub, people).map((l) => ({
    id: l.id,
    gd_id: l.gdId,
    ten: l.name,
    ngay: l.date.slice(0, 10),
    nguon: l.source,
    loai: LOAI[l.scope],
    so_tien_k: dongToK(l.amount),
    danh_muc: l.category,
    ghi_chu: l.note,
  }));

  const tong = (loai: string) => dongToK(dong.filter((d) => d.loai === loai).reduce((a, d) => a + Math.round(d.so_tien_k * 1000), 0));
  return {
    phien_ban: 1,
    dot: { ten: args.period.name, tu_ngay: args.period.from, den_ngay: args.period.to },
    trang_tinh_1,
    quyet_toan,
    chi_tieu_quang: { dong, tong: { Chung: tong('Chung'), Nha: tong('Nhà'), Rieng: tong('Riêng') } },
  };
}
