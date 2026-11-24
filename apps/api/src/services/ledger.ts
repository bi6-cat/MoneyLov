import { and, eq, gte, inArray, isNull, lt } from 'drizzle-orm';
import { personalLines, type LedgerTx } from '@moneylov/core';
import type { DB } from '../db';
import { accounts, categories, splits, transactions } from '../schema';
import { loadPeople } from './lookups';

export interface LedgerFilter {
  from?: string; // YYYY-MM-DD (gồm)
  to?: string; // YYYY-MM-DD (gồm)
  periodId?: number;
}

const nextDay = (d: string) => new Date(Date.parse(d + 'T00:00:00Z') + 86400_000).toISOString().slice(0, 10);

/** Giao dịch đã duyệt dạng LedgerTx (chi tiêu + bill chia, kể cả bill tiền mặt không có giao dịch). */
export async function ledgerTxs(db: DB, f: LedgerFilter) {
  const conds = [eq(transactions.status, 'approved'), inArray(transactions.kind, ['expense', 'split'])];
  if (f.periodId) conds.push(eq(transactions.periodId, f.periodId));
  if (f.from) conds.push(gte(transactions.occurredAt, f.from));
  if (f.to) conds.push(lt(transactions.occurredAt, nextDay(f.to)));
  const txs = await db.select().from(transactions).where(and(...conds));
  const accs = await db.select().from(accounts);
  const cats = await db.select().from(categories);
  const sp = txs.length ? await db.select().from(splits).where(inArray(splits.transactionId, txs.map((t) => t.id))) : [];

  const cashConds = [isNull(splits.transactionId)];
  if (f.periodId) cashConds.push(eq(splits.periodId, f.periodId));
  if (f.from) cashConds.push(gte(splits.occurredAt, f.from));
  if (f.to) cashConds.push(lt(splits.occurredAt, nextDay(f.to)));
  const cash = await db.select().from(splits).where(and(...cashConds));

  const srcOf = (id: number | null) => {
    const a = accs.find((x) => x.id === id);
    return a?.importSource ?? a?.name ?? 'Khác';
  };
  const catName = (id: number | null) => cats.find((c) => c.id === id)?.name ?? null;

  const out: (LedgerTx & { categoryId: number | null; txId: number | null })[] = [];
  for (const t of txs) {
    const s = sp.find((x) => x.transactionId === t.id);
    out.push({
      txId: t.id,
      extId: t.extId ?? `tx-${t.id}`,
      name: t.title ?? s?.title ?? t.counterparty ?? t.rawContent.slice(0, 40),
      date: t.occurredAt,
      source: srcOf(t.accountId),
      amount: t.amount,
      kind: t.kind === 'split' ? 'split' : 'expense',
      scope: t.scope,
      category: catName(t.categoryId),
      categoryId: t.categoryId,
      note: t.note,
      split: s ? { result: s.result, isRent: s.isRent } : null,
    });
  }
  for (const s of cash) {
    out.push({
      txId: null,
      extId: `bill-${s.id}`,
      name: s.title,
      date: s.occurredAt,
      source: 'Tiền mặt',
      amount: s.config.total,
      kind: 'split',
      category: catName(s.categoryId),
      categoryId: s.categoryId,
      note: s.note,
      split: { result: s.result, isRent: s.isRent },
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Chi tiêu của chính Quang (Riêng + phần Chung + phần Nhà), có danh mục. */
export async function myLines(db: DB, f: LedgerFilter, hub: string) {
  const txs = await ledgerTxs(db, f);
  const people = await loadPeople(db);
  const lines = personalLines(txs, hub, people);
  return lines.map((l) => ({ ...l, categoryId: txs.find((t) => t.extId === l.gdId)?.categoryId ?? null }));
}

