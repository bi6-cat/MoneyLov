import { Hono } from 'hono';
import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db';
import { createToken } from '../auth';
import * as s from '../schema';
import { getAppSettings } from '../seed';
import { HttpError } from '../services/lookups';
import { periodDetail } from '../services/period';
import { accountBalances } from './meta';
import { budgetStatus, upcomingRecurring } from './planning';
import { myLines } from '../services/ledger';

const ruleSchema = z.object({
  name: z.string().min(1),
  enabled: z.boolean().default(true),
  priority: z.number().int().default(0),
  match: z.object({
    counterparty: z.string().optional(),
    counterpartyAccount: z.string().optional(),
    content: z.string().optional(),
    source: z.string().optional(),
    direction: z.enum(['in', 'out']).optional(),
    minAmount: z.number().int().optional(),
    maxAmount: z.number().int().optional(),
  }),
  action: z.object({ action: z.string() }).passthrough(),
});

export function adminRoutes(db: DB) {
  const r = new Hono();

  r.get('/dashboard', async (c) => {
    const settings = await getAppSettings(db);
    const month = new Date().toISOString().slice(0, 7);
    const [accs, budget, upcoming, lines, [{ pending }], [open], recent, loanRows] = await Promise.all([
      accountBalances(db),
      budgetStatus(db, month),
      upcomingRecurring(db, 14),
      myLines(db, { from: `${month}-01` }, settings.hub),
      db.select({ pending: sql<number>`count(*)::int` }).from(s.transactions).where(eq(s.transactions.status, 'pending')),
      db.select().from(s.periods).where(eq(s.periods.status, 'open')).orderBy(desc(s.periods.fromDate)).limit(1),
      db.select().from(s.transactions).orderBy(desc(s.transactions.occurredAt)).limit(8),
      db
        .select({ direction: s.loans.direction, amount: sql<number>`sum(${s.loans.amount})::bigint` })
        .from(s.loans)
        .where(eq(s.loans.closed, false))
        .groupBy(s.loans.direction),
    ]);
    const period = open ? await periodDetail(db, open.id) : null;
    const scope = { Rieng: 0, Chung: 0, Nha: 0 };
    lines.forEach((l) => (scope[l.scope] += l.amount));
    return c.json({
      month,
      accounts: accs.filter((a) => !a.archived),
      netWorth: accs.filter((a) => !a.archived).reduce((x, a) => x + a.balance, 0),
      spentThisMonth: lines.reduce((x, l) => x + l.amount, 0),
      scope,
      budget,
      upcoming,
      pending,
      period: period ? { id: period.period.id, name: period.period.name, rows: period.settlement.rows, warnings: period.warnings } : null,
      recent,
      loans: Object.fromEntries(loanRows.map((l) => [l.direction, Number(l.amount)])),
    });
  });

  /* ---------- Quy tắc ---------- */
  r.get('/rules', async (c) => c.json(await db.select().from(s.rules).orderBy(desc(s.rules.priority), desc(s.rules.confirmations))));
  r.post('/rules', async (c) => c.json((await db.insert(s.rules).values(ruleSchema.parse(await c.req.json()) as any).returning())[0], 201));
  r.patch('/rules/:id', async (c) => {
    const [row] = await db
      .update(s.rules)
      .set(ruleSchema.partial().parse(await c.req.json()) as any)
      .where(eq(s.rules.id, Number(c.req.param('id'))))
      .returning();
    if (!row) throw new HttpError(404, 'Không tìm thấy');
    return c.json(row);
  });
  r.delete('/rules/:id', async (c) => {
    await db.delete(s.rules).where(eq(s.rules.id, Number(c.req.param('id'))));
    return c.json({ ok: true });
  });

  /* ---------- API token ---------- */
  r.get('/tokens', async (c) =>
    c.json(
      await db
        .select({ id: s.apiTokens.id, name: s.apiTokens.name, prefix: s.apiTokens.prefix, scopes: s.apiTokens.scopes, lastUsedAt: s.apiTokens.lastUsedAt, createdAt: s.apiTokens.createdAt, revokedAt: s.apiTokens.revokedAt })
        .from(s.apiTokens)
        .orderBy(desc(s.apiTokens.createdAt)),
    ),
  );
  r.post('/tokens', async (c) => {
    const b = z.object({ name: z.string().min(1), scopes: z.array(z.enum(['import', 'read'])).min(1) }).parse(await c.req.json());
    const t = await createToken(db, b.name, b.scopes);
    return c.json({ id: t.id, name: t.name, scopes: t.scopes, token: t.token }, 201);
  });
  r.delete('/tokens/:id', async (c) => {
    await db.update(s.apiTokens).set({ revokedAt: new Date() }).where(and(eq(s.apiTokens.id, Number(c.req.param('id'))), isNull(s.apiTokens.revokedAt)));
    return c.json({ ok: true });
  });

  /**
   * Dữ liệu cho Claude học: quy tắc, bảng đối tác → cách xử lý thường gặp, và các lần người dùng sửa gợi ý.
   * GET /api/learning-export?since=YYYY-MM-DD
   */
  r.get('/learning-export', async (c) => {
    const since = c.req.query('since');
    const [rules, cats, ppl] = await Promise.all([db.select().from(s.rules), db.select().from(s.categories), db.select().from(s.people)]);
    const decs = await db
      .select()
      .from(s.decisions)
      .where(since ? gte(s.decisions.createdAt, new Date(since)) : undefined)
      .orderBy(desc(s.decisions.createdAt))
      .limit(5000);
    const catName = (id: number | null) => cats.find((x) => x.id === id)?.name ?? null;
    const approved = await db
      .select({
        counterparty: s.transactions.counterparty,
        counterpartyAccount: s.transactions.counterpartyAccount,
        kind: s.transactions.kind,
        scope: s.transactions.scope,
        categoryId: s.transactions.categoryId,
        n: sql<number>`count(*)::int`,
        avg: sql<number>`avg(${s.transactions.amount})::bigint`,
      })
      .from(s.transactions)
      .where(eq(s.transactions.status, 'approved'))
      .groupBy(s.transactions.counterparty, s.transactions.counterpartyAccount, s.transactions.kind, s.transactions.scope, s.transactions.categoryId);
    return c.json({
      generatedAt: new Date().toISOString(),
      note: 'Tiền tính bằng đồng. "corrections" là các lần gợi ý bị sửa: ưu tiên học từ đây.',
      people: ppl.map((p) => ({ code: p.code, name: p.name, role: p.role, aliases: p.aliases, paidBy: p.paidBy })),
      categories: cats.map((x) => x.name),
      rules: rules.map((x) => ({ name: x.name, match: x.match, action: x.action, confirmations: x.confirmations, overrides: x.overrides, hits: x.hits, enabled: x.enabled })),
      counterparties: approved
        .filter((a) => a.counterparty || a.counterpartyAccount)
        .map((a) => ({ counterparty: a.counterparty, account: a.counterpartyAccount, kind: a.kind, scope: a.scope, category: catName(a.categoryId), count: a.n, avgAmount: Number(a.avg) }))
        .sort((a, b) => b.count - a.count),
      corrections: decs
        .filter((d) => d.changed)
        .map((d) => ({ extId: d.extId, counterparty: d.counterparty, content: d.rawContent, amount: d.amount, suggested: d.suggested, final: d.final, question: d.question, answer: d.answer, at: d.createdAt })),
      stats: { decisions: decs.length, changed: decs.filter((d) => d.changed).length, auto: decs.filter((d) => d.by === 'auto').length },
    });
  });

  /* ---------- Sao lưu / khôi phục ---------- */
  const TABLES = {
    settings: s.settings,
    accounts: s.accounts,
    categories: s.categories,
    people: s.people,
    periods: s.periods,
    importBatches: s.importBatches,
    transactions: s.transactions,
    splits: s.splits,
    settlements: s.settlements,
    loans: s.loans,
    loanPayments: s.loanPayments,
    budgets: s.budgets,
    recurring: s.recurring,
    rules: s.rules,
    decisions: s.decisions,
  } as const;

  r.get('/backup', async (c) => {
    const out: Record<string, unknown[]> = {};
    for (const [k, t] of Object.entries(TABLES)) out[k] = await db.select().from(t as any);
    c.header('Content-Disposition', `attachment; filename="moneylov-backup-${new Date().toISOString().slice(0, 10)}.json"`);
    return c.json({ app: 'moneylov', version: 1, exportedAt: new Date().toISOString(), data: out });
  });

  /** Khôi phục: XOÁ toàn bộ dữ liệu hiện tại rồi nạp lại từ bản sao lưu. Cần confirm="KHOI PHUC". */
  r.post('/restore', async (c) => {
    const body = await c.req.json();
    if (body?.confirm !== 'KHOI PHUC') throw new HttpError(422, 'Cần gửi confirm: "KHOI PHUC"');
    const data = body?.backup?.data;
    if (body?.backup?.app !== 'moneylov' || !data) throw new HttpError(422, 'File sao lưu không hợp lệ');
    await db.transaction(async (tx) => {
      for (const t of Object.values(TABLES).reverse()) await tx.delete(t as any);
      for (const [k, t] of Object.entries(TABLES)) {
        const rows = (data[k] ?? []) as any[];
        for (let i = 0; i < rows.length; i += 500) {
          const chunk = rows.slice(i, i + 500).map((row) => {
            const o = { ...row };
            for (const f of ['createdAt', 'approvedAt', 'closedAt', 'lastUsedAt', 'revokedAt', 'expiresAt']) if (o[f]) o[f] = new Date(o[f]);
            return o;
          });
          if (chunk.length) await tx.insert(t as any).values(chunk);
        }
      }
      // Đồng bộ lại sequence của các cột serial
      for (const [, t] of Object.entries(TABLES)) {
        const name = (t as any)[Symbol.for('drizzle:Name')];
        if (name && 'id' in (t as any)) await tx.execute(sql.raw(`select setval(pg_get_serial_sequence('${name}','id'), coalesce((select max(id) from ${name}), 0) + 1, false)`));
      }
    });
    return c.json({ ok: true });
  });

  return r;
}
