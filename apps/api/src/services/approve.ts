import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { canAutoApprove, canonicalJson, computeSplit, proposeRule, SplitError, type SplitConfig, type Suggestion } from '@moneylov/core';
import type { DB, Tx } from '../db';
import { decisions, loanPayments, loans, periods, rules, settlements, splits, transactions } from '../schema';
import { getAppSettings } from '../seed';
import { categoryIdByName, HttpError, periodForDate, roommates } from './lookups';

export type Decision = Suggestion & {
  categoryId?: number | null;
  title?: string | null;
  note?: string | null;
  answer?: string | null;
  tags?: string[];
  periodId?: number | null;
  createRule?: boolean;
};

type Q = DB | Tx;

/** Chuẩn hoá cấu hình chia: tiền nhà mặc định chia cho người ở phòng. */
export async function buildSplit(db: Q, cfg: Omit<SplitConfig, 'total'>, total: number, hub: string) {
  const full: SplitConfig = { ...cfg, total };
  if (full.mode === 'rent' && !full.people?.length) full.people = await roommates(db);
  try {
    return { config: full, result: computeSplit(full, hub) };
  } catch (e) {
    if (e instanceof SplitError) throw new HttpError(422, e.message);
    throw e;
  }
}

async function assertOpenPeriod(db: Q, periodId: number | null) {
  if (!periodId) return;
  const [p] = await db.select().from(periods).where(eq(periods.id, periodId));
  if (p?.status === 'closed') throw new HttpError(409, `Đợt "${p.name}" đã chốt. Mở lại đợt trước khi sửa.`);
}

/** Xoá mọi bản ghi phái sinh của một giao dịch (khi duyệt lại hoặc bỏ duyệt). */
async function clearDerived(db: Q, txId: number) {
  await db.delete(splits).where(eq(splits.transactionId, txId));
  await db.delete(settlements).where(eq(settlements.transactionId, txId));
  await db.delete(loanPayments).where(eq(loanPayments.transactionId, txId));
  const [t] = await db.select().from(transactions).where(eq(transactions.id, txId));
  if (t?.loanId && t.kind === 'loan') {
    const pays = await db.select().from(loanPayments).where(eq(loanPayments.loanId, t.loanId));
    const [loan] = await db.select().from(loans).where(eq(loans.id, t.loanId));
    // Khoản vay do chính giao dịch này tạo (chưa có ai trả) thì xoá theo.
    if (loan && !pays.length && loan.note === `tx:${txId}`) await db.delete(loans).where(eq(loans.id, t.loanId));
  }
}

const stable = canonicalJson;

export async function approveTransaction(db: DB, txId: number, d: Decision, by: 'manual' | 'auto' | 'bulk' | 'rule' = 'manual') {
  const settings = await getAppSettings(db);
  return db.transaction(async (tx) => {
    const [t] = await tx.select().from(transactions).where(eq(transactions.id, txId));
    if (!t) throw new HttpError(404, 'Không tìm thấy giao dịch');
    await assertOpenPeriod(tx, t.periodId);
    await clearDerived(tx, txId);

    const periodId = d.periodId ?? t.periodId ?? (await periodForDate(tx, t.occurredAt));
    if (d.periodId && d.periodId !== t.periodId) await assertOpenPeriod(tx, d.periodId);
    const categoryId = d.categoryId ?? ('category' in d ? await categoryIdByName(tx, d.category, d.action === 'income' ? 'income' : 'expense') : null);
    const title = d.title ?? t.title ?? null;
    const patch: Partial<typeof transactions.$inferInsert> = {
      status: 'approved',
      kind: d.action,
      categoryId,
      title,
      note: d.note ?? t.note,
      answer: d.answer ?? t.answer,
      tags: d.tags ?? t.tags,
      periodId,
      scope: null,
      person: null,
      toAccountId: null,
      loanId: null,
      approvedAt: new Date(),
      approvedBy: by,
    };

    switch (d.action) {
      case 'ignore':
        break;
      case 'transfer':
        patch.toAccountId = d.toAccount ? Number(d.toAccount) : null;
        break;
      case 'expense':
        if (t.direction !== 'out') throw new HttpError(422, 'Khoản chi phải là tiền ra');
        patch.scope = d.scope ?? 'Rieng';
        break;
      case 'income':
        if (t.direction !== 'in') throw new HttpError(422, 'Khoản thu phải là tiền vào');
        break;
      case 'split': {
        if (!periodId) throw new HttpError(422, 'Chưa có đợt chia tiền nào. Tạo đợt trước.');
        const { config, result } = await buildSplit(tx, d.split, t.amount, settings.hub);
        const isRent = d.isRent ?? config.mode === 'rent';
        patch.scope = isRent ? 'Nha' : 'Chung';
        await tx.insert(splits).values({
          transactionId: t.id,
          periodId,
          title: title ?? t.counterparty ?? 'Bill',
          occurredAt: t.occurredAt,
          isRent,
          config,
          result,
          categoryId,
        });
        break;
      }
      case 'settlement': {
        if (!d.person) throw new HttpError(422, 'Chọn người trả');
        if (!periodId) throw new HttpError(422, 'Chưa có đợt chia tiền nào.');
        patch.person = d.person;
        await tx.insert(settlements).values({ periodId, person: d.person, amount: t.amount, transactionId: t.id, paidAt: t.occurredAt });
        break;
      }
      case 'loan': {
        if (!d.person) throw new HttpError(422, 'Chọn người vay/cho vay');
        patch.person = d.person;
        const dir = d.direction ?? (t.direction === 'out' ? 'lend' : 'borrow');
        if (dir === 'lend' || dir === 'borrow') {
          const [loan] = await tx
            .insert(loans)
            .values({ person: d.person, direction: dir, amount: t.amount, startedAt: t.occurredAt.slice(0, 10), periodId: dir === 'lend' ? periodId : null, note: `tx:${t.id}` })
            .returning();
          patch.loanId = loan.id;
        } else {
          const want = dir === 'repay_in' ? 'lend' : 'borrow';
          const [loan] = await tx
            .select()
            .from(loans)
            .where(and(eq(loans.person, d.person), eq(loans.direction, want), eq(loans.closed, false)))
            .orderBy(asc(loans.startedAt));
          if (!loan) throw new HttpError(422, `Không có khoản ${want === 'lend' ? 'cho vay' : 'đi vay'} nào đang mở với ${d.person}`);
          await tx.insert(loanPayments).values({ loanId: loan.id, amount: t.amount, paidAt: t.occurredAt.slice(0, 10), transactionId: t.id });
          const [{ paid }] = await tx.select({ paid: sql<number>`coalesce(sum(${loanPayments.amount}),0)::bigint` }).from(loanPayments).where(eq(loanPayments.loanId, loan.id));
          if (Number(paid) >= loan.amount) await tx.update(loans).set({ closed: true }).where(eq(loans.id, loan.id));
          patch.loanId = loan.id;
        }
        break;
      }
    }

    await tx.update(transactions).set(patch).where(eq(transactions.id, t.id));

    // Nhật ký học + phản hồi cho quy tắc
    const { createRule, categoryId: _c, title: _t, note: _n, answer: _a, tags: _g, periodId: _p, ...final } = d;
    const changed = !!t.suggestion && stable(t.suggestion) !== stable(final);
    await tx.insert(decisions).values({
      transactionId: t.id,
      extId: t.extId,
      counterparty: t.counterparty,
      rawContent: t.rawContent,
      amount: t.amount,
      suggested: t.suggestion,
      final,
      question: t.question,
      answer: d.answer ?? null,
      changed,
      by,
      ruleId: t.ruleId,
    });
    if (t.ruleId) {
      await tx
        .update(rules)
        .set(changed ? { overrides: sql`${rules.overrides} + 1` } : { confirmations: sql`${rules.confirmations} + 1` })
        .where(eq(rules.id, t.ruleId));
    }
    let newRule = null;
    if (createRule) {
      const proposal = proposeRule({ ...t, source: '' }, final as Suggestion);
      if (proposal) [newRule] = await tx.insert(rules).values({ ...proposal }).returning();
    }
    const [updated] = await tx.select().from(transactions).where(eq(transactions.id, t.id));
    return { transaction: updated, rule: newRule };
  });
}

export async function unapproveTransaction(db: DB, txId: number) {
  return db.transaction(async (tx) => {
    const [t] = await tx.select().from(transactions).where(eq(transactions.id, txId));
    if (!t) throw new HttpError(404, 'Không tìm thấy giao dịch');
    await assertOpenPeriod(tx, t.periodId);
    await clearDerived(tx, txId);
    await tx
      .update(transactions)
      .set({ status: 'pending', kind: null, scope: null, person: null, loanId: null, toAccountId: null, approvedAt: null, approvedBy: null })
      .where(eq(transactions.id, txId));
  });
}

/** Danh sách khoản tự duyệt được, kèm lý do. */
export async function autoApproveCandidates(db: DB) {
  const settings = await getAppSettings(db);
  const pending = await db.select().from(transactions).where(eq(transactions.status, 'pending'));
  const ruleIds = [...new Set(pending.map((p) => p.ruleId).filter(Boolean))] as number[];
  const rs = ruleIds.length ? await db.select().from(rules).where(inArray(rules.id, ruleIds)) : [];
  return pending.map((t) => {
    const r = rs.find((x) => x.id === t.ruleId);
    const res = t.suggestion
      ? canAutoApprove({ confidence: t.confidence, question: t.question, suggestion: t.suggestion, ruleConfirmations: r?.confirmations ?? null }, { minConfirmations: settings.autoApproveMinConfirmations })
      : { ok: false, reason: 'Chưa có gợi ý' };
    return { id: t.id, ...res };
  });
}

export async function bulkApprove(db: DB, ids: number[], by: 'auto' | 'bulk', override?: Decision) {
  const ok: number[] = [];
  const failed: { id: number; error: string }[] = [];
  const allowed = by === 'auto' ? new Set((await autoApproveCandidates(db)).filter((c) => c.ok).map((c) => c.id)) : null;
  for (const id of ids) {
    try {
      if (allowed && !allowed.has(id)) throw new Error('Không đủ điều kiện tự duyệt');
      const [t] = await db.select().from(transactions).where(eq(transactions.id, id));
      const d = override ?? (t?.suggestion as Decision | null);
      if (!d) throw new Error('Chưa có gợi ý');
      await approveTransaction(db, id, d, by);
      ok.push(id);
    } catch (e: any) {
      failed.push({ id, error: e.message });
    }
  }
  return { ok, failed };
}
