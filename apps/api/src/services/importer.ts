import { createHash } from 'node:crypto';
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { canonicalJson, findRule, parseImport, type ImportedTx, type Rule } from '@moneylov/core';
import type { DB } from '../db';
import { accounts, importBatches, periods, rules, transactions } from '../schema';
import { getAppSettings } from '../seed';
import { accountIdBySource, HttpError, periodForDate } from './lookups';

export type DiffStatus = 'added' | 'updated' | 'unchanged' | 'locked';

export interface ImportResult {
  dryRun: boolean;
  version: number;
  period: { id: number | null; name: string; from: string; to: string; created: boolean } | null;
  checks: { key: string; label: string; ok: boolean; detail: string }[];
  stats: Record<DiffStatus, number>;
  diff: { extId: string; status: DiffStatus; occurredAt: string; amount: number; direction: string; counterparty: string | null; ruleName?: string; changes?: string[] }[];
  batchId: number | null;
  warnings: string[];
}

const FIELDS: (keyof ImportedTx)[] = ['occurredAt', 'amount', 'direction', 'rawContent', 'counterparty', 'counterpartyAccount', 'question', 'confidence', 'pairExtId'];

/** Áp quy tắc đã học. Quy tắc đủ số lần xác nhận thì thay gợi ý của file và bỏ câu hỏi. */
function applyRule(t: ImportedTx, rs: Rule[], minConf: number) {
  const r = findRule(rs, t);
  if (!r) return { t, rule: null as Rule | null };
  if (r.confirmations >= minConf || t.confidence === 'nghi') {
    const strong = r.confirmations >= minConf;
    return {
      t: { ...t, suggestion: r.action, confidence: strong ? ('chac' as const) : t.confidence, question: strong ? null : t.question },
      rule: r,
    };
  }
  return { t, rule: r };
}

/**
 * Nạp file (v1 dot-*.json hoặc v2). Idempotent theo ext_id:
 * - chưa có → thêm (pending)
 * - đang pending → cập nhật nếu khác
 * - đã duyệt hoặc thuộc đợt đã chốt → giữ nguyên (locked)
 */
export async function runImport(db: DB, json: unknown, opt: { dryRun: boolean; source: 'upload' | 'api'; filename?: string }): Promise<ImportResult> {
  let parsed;
  try {
    parsed = parseImport(json);
  } catch (e: any) {
    throw new HttpError(422, e.message);
  }
  const settings = await getAppSettings(db);
  const warnings: string[] = [];
  const ruleRows = (await db.select().from(rules).where(eq(rules.enabled, true))) as unknown as Rule[];

  // Đợt
  let periodInfo: ImportResult['period'] = null;
  if (parsed.period) {
    const [p] = await db.select().from(periods).where(and(eq(periods.name, parsed.period.name), eq(periods.fromDate, parsed.period.from)));
    periodInfo = { id: p?.id ?? null, name: parsed.period.name, from: parsed.period.from, to: parsed.period.to, created: !p };
    if (p?.status === 'closed') warnings.push(`Đợt "${p.name}" đã chốt: chỉ thêm giao dịch mới, không sửa giao dịch cũ.`);
  }

  const ids = parsed.transactions.map((t) => t.extId);
  const existing = ids.length ? await db.select().from(transactions).where(inArray(transactions.extId, ids)) : [];
  const byExt = new Map(existing.map((e) => [e.extId!, e]));
  const closedIds = new Set((await db.select({ id: periods.id }).from(periods).where(eq(periods.status, 'closed'))).map((p) => p.id));

  const diff: ImportResult['diff'] = [];
  const plan: { kind: 'insert' | 'update'; t: ImportedTx; ruleId: number | null; id?: number }[] = [];
  for (const raw of parsed.transactions) {
    const { t, rule } = applyRule(raw, ruleRows, settings.autoApproveMinConfirmations);
    const base = { extId: t.extId, occurredAt: t.occurredAt, amount: t.amount, direction: t.direction, counterparty: t.counterparty, ruleName: rule?.name };
    const e = byExt.get(t.extId);
    if (!e) {
      diff.push({ ...base, status: 'added' });
      plan.push({ kind: 'insert', t, ruleId: (rule?.id as number) ?? null });
      continue;
    }
    if (e.status === 'approved' || (e.periodId && closedIds.has(e.periodId))) {
      diff.push({ ...base, status: 'locked' });
      continue;
    }
    const cur: Record<string, unknown> = { ...e, occurredAt: e.occurredAt.slice(0, 16).replace(' ', 'T') };
    const changes = FIELDS.filter((f) => (cur[f] ?? null) !== (t[f] ?? null)).map(String);
    if (canonicalJson(e.suggestion) !== canonicalJson(t.suggestion)) changes.push('suggestion');
    if (changes.length) {
      diff.push({ ...base, status: 'updated', changes });
      plan.push({ kind: 'update', t, ruleId: (rule?.id as number) ?? null, id: e.id });
    } else diff.push({ ...base, status: 'unchanged' });
  }

  const stats = { added: 0, updated: 0, unchanged: 0, locked: 0 } as Record<DiffStatus, number>;
  diff.forEach((d) => stats[d.status]++);
  const checks = parsed.checks;

  if (opt.dryRun) return { dryRun: true, version: parsed.version, period: periodInfo, checks, stats, diff, batchId: null, warnings };

  const batchId = await db.transaction(async (tx) => {
    let periodId = periodInfo?.id ?? null;
    if (parsed.period && !periodId) {
      const [p] = await tx
        .insert(periods)
        .values({
          name: parsed.period.name,
          fromDate: parsed.period.from,
          toDate: parsed.period.to,
          rentTotal: parsed.period.rentTotal,
          carriedOverride: Object.fromEntries(Object.entries(parsed.period.carried).map(([k, v]) => [k, { amount: v, reason: 'Từ file nạp' }])),
        })
        .returning();
      periodId = p.id;
      periodInfo!.id = p.id;
    }
    const checksum = createHash('sha256').update(JSON.stringify(json)).digest('hex');
    const [batch] = await tx
      .insert(importBatches)
      .values({ source: opt.source, filename: opt.filename ?? null, checksum, version: parsed.version, periodId, stats, checks, reconciliation: parsed.reconciliation })
      .returning();

    for (const p of plan) {
      const accountId = await accountIdBySource(tx, p.t.source, true);
      const pid = periodId ?? (await periodForDate(tx, p.t.occurredAt));
      const values = {
        extId: p.t.extId,
        accountId,
        occurredAt: p.t.occurredAt,
        amount: p.t.amount,
        direction: p.t.direction,
        counterparty: p.t.counterparty,
        counterpartyAccount: p.t.counterpartyAccount,
        counterpartyBank: p.t.counterpartyBank,
        rawContent: p.t.rawContent,
        suggestion: p.t.suggestion,
        confidence: p.t.confidence,
        question: p.t.question,
        pairExtId: p.t.pairExtId,
        ruleId: p.ruleId,
        periodId: pid,
        batchId: batch.id,
      };
      if (p.kind === 'insert') await tx.insert(transactions).values(values);
      else await tx.update(transactions).set(values).where(eq(transactions.id, p.id!));
      if (p.ruleId) await tx.update(rules).set({ hits: sql`${rules.hits} + 1` }).where(eq(rules.id, p.ruleId));
    }

    // Lần nạp đầu cho ví ngân hàng: lấy số dư đầu từ sao kê để số dư trong app khớp ngân hàng
    const opening = parsed.reconciliation?.so_du_dau_k;
    const bankTxs = parsed.transactions.filter((t) => t.source === 'MB');
    if (opening != null && bankTxs.length) {
      const first = bankTxs.map((t) => t.occurredAt).sort()[0];
      const [acc] = await tx.select().from(accounts).where(eq(accounts.importSource, 'MB'));
      const earlier = acc
        ? (await tx.select({ n: sql<number>`count(*)::int` }).from(transactions).where(and(eq(transactions.accountId, acc.id), lt(transactions.occurredAt, first))))[0].n
        : 1;
      if (acc && acc.openingBalance === 0 && earlier === 0) {
        await tx.update(accounts).set({ openingBalance: opening }).where(eq(accounts.id, acc.id));
        warnings.push(`Đã đặt số dư đầu của ví ${acc.name} = ${opening.toLocaleString('vi-VN')} đ theo sao kê.`);
      }
    }
    return batch.id;
  });

  return { dryRun: false, version: parsed.version, period: periodInfo, checks, stats, diff, batchId, warnings };
}
