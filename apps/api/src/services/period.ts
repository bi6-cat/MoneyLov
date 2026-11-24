import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { exportToanBo, reminderText, settle, type SettlementOutput } from '@moneylov/core';
import type { DB } from '../db';
import { loans, periods, settlements, splits, transactions } from '../schema';
import { getAppSettings } from '../seed';
import { HttpError, loadPeople } from './lookups';
import { ledgerTxs } from './ledger';

/** Nợ cũ: "Còn lại" của đợt đã chốt ngay trước, ghi đè bằng giá trị sửa tay nếu có. */
export async function carriedFor(db: DB, p: typeof periods.$inferSelect) {
  const [prev] = await db
    .select()
    .from(periods)
    .where(and(eq(periods.status, 'closed'), lt(periods.toDate, p.fromDate)))
    .orderBy(desc(periods.toDate))
    .limit(1);
  const auto: Record<string, number> = {};
  const rows = (prev?.snapshot as { settlement?: SettlementOutput } | null)?.settlement?.rows ?? [];
  for (const r of rows) if (r.conLai) auto[r.person] = r.conLai;
  const carried = { ...auto };
  for (const [k, v] of Object.entries(p.carriedOverride ?? {})) carried[k] = v.amount;
  return { carried, auto, previous: prev ? { id: prev.id, name: prev.name } : null };
}

export async function periodDetail(db: DB, id: number) {
  const [p] = await db.select().from(periods).where(eq(periods.id, id));
  if (!p) throw new HttpError(404, 'Không tìm thấy đợt');
  const settings = await getAppSettings(db);
  const people = await loadPeople(db);

  const sp = await db.select().from(splits).where(eq(splits.periodId, id)).orderBy(splits.occurredAt);
  const txIds = sp.map((s) => s.transactionId).filter(Boolean) as number[];
  const txs = txIds.length ? await db.select().from(transactions).where(inArray(transactions.id, txIds)) : [];
  const st = await db.select().from(settlements).where(eq(settlements.periodId, id)).orderBy(settlements.paidAt);
  const ln = await db.select().from(loans).where(and(eq(loans.periodId, id), eq(loans.direction, 'lend')));
  const { carried, auto, previous } = await carriedFor(db, p);

  const sum = (list: { person: string; amount: number }[]) =>
    list.reduce<Record<string, number>>((m, x) => ((m[x.person] = (m[x.person] ?? 0) + x.amount), m), {});
  const settlement = settle({
    hub: settings.hub,
    people,
    splits: sp.map((s) => ({ id: String(s.id), isRent: s.isRent, result: s.result })),
    carried,
    lent: sum(ln),
    payments: sum(st),
  });

  const [{ pending }] = await db
    .select({ pending: sql<number>`count(*)::int` })
    .from(transactions)
    .where(and(eq(transactions.periodId, id), eq(transactions.status, 'pending')));

  const warnings: string[] = [];
  const rentSum = sp.filter((s) => s.isRent).reduce((a, s) => a + s.config.total, 0);
  if (p.rentTotal && rentSum !== p.rentTotal) warnings.push(`Tiền nhà đã chia ${rentSum.toLocaleString('vi-VN')} đ, khác tổng tiền nhà của đợt ${p.rentTotal.toLocaleString('vi-VN')} đ.`);
  if (pending) warnings.push(`Còn ${pending} giao dịch trong đợt chưa duyệt.`);
  for (const s of sp) for (const w of s.result.warnings) warnings.push(`${s.title}: ${w}`);

  return {
    period: p,
    previous,
    carried,
    carriedAuto: auto,
    splits: sp.map((s) => ({ ...s, transaction: txs.find((t) => t.id === s.transactionId) ?? null })),
    settlements: st,
    loans: ln,
    settlement,
    reminders: Object.fromEntries(settlement.rows.map((r) => [r.person, reminderText(r, p.name, settings.bankLine)])),
    pending,
    warnings,
  };
}

export async function closePeriod(db: DB, id: number) {
  const d = await periodDetail(db, id);
  if (d.period.status === 'closed') throw new HttpError(409, 'Đợt đã chốt');
  if (d.pending) throw new HttpError(409, `Còn ${d.pending} giao dịch chưa duyệt trong đợt.`);
  await db
    .update(periods)
    .set({ status: 'closed', closedAt: new Date(), snapshot: { settlement: d.settlement, carried: d.carried, closedAt: new Date().toISOString() } })
    .where(eq(periods.id, id));
  return periodDetail(db, id);
}

export async function reopenPeriod(db: DB, id: number, reason: string) {
  const [p] = await db.select().from(periods).where(eq(periods.id, id));
  if (!p) throw new HttpError(404, 'Không tìm thấy đợt');
  if (!reason?.trim()) throw new HttpError(422, 'Cần ghi lý do mở lại đợt');
  const log = `${p.note ? p.note + '\n' : ''}[${new Date().toISOString().slice(0, 16)}] Mở lại: ${reason}`;
  await db.update(periods).set({ status: 'open', closedAt: null, note: log }).where(eq(periods.id, id));
  return periodDetail(db, id);
}

export async function exportPeriod(db: DB, id: number) {
  const d = await periodDetail(db, id);
  const settings = await getAppSettings(db);
  const people = await loadPeople(db);
  const txs = await ledgerTxs(db, { periodId: id });
  return exportToanBo({
    period: { name: d.period.name, from: d.period.fromDate, to: d.period.toDate },
    hub: settings.hub,
    people,
    txs,
    settlement: d.settlement,
  });
}
