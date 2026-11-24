import { Hono } from 'hono';
import { and, asc, desc, eq, gte, ilike, inArray, lt, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db';
import { decisions, rules, splits, transactions } from '../schema';
import { approveTransaction, autoApproveCandidates, bulkApprove, unapproveTransaction, type Decision } from '../services/approve';
import { HttpError } from '../services/lookups';

const decisionSchema = z.object({ action: z.enum(['ignore', 'expense', 'split', 'income', 'settlement', 'loan', 'transfer']) }).passthrough();
const nextDay = (d: string) => new Date(Date.parse(d + 'T00:00:00Z') + 86400_000).toISOString().slice(0, 10);

export function transactionRoutes(db: DB) {
  const r = new Hono();

  r.get('/', async (c) => {
    const q = c.req.query();
    const conds: SQL[] = [];
    if (q.status) conds.push(eq(transactions.status, q.status as any));
    if (q.kind) conds.push(inArray(transactions.kind, q.kind.split(',')));
    if (q.scope) conds.push(eq(transactions.scope, q.scope as any));
    if (q.accountId) conds.push(eq(transactions.accountId, Number(q.accountId)));
    if (q.categoryId) conds.push(eq(transactions.categoryId, Number(q.categoryId)));
    if (q.periodId) conds.push(eq(transactions.periodId, Number(q.periodId)));
    if (q.direction) conds.push(eq(transactions.direction, q.direction as any));
    if (q.person) conds.push(eq(transactions.person, q.person));
    if (q.from) conds.push(gte(transactions.occurredAt, q.from));
    if (q.to) conds.push(lt(transactions.occurredAt, nextDay(q.to)));
    if (q.tag) conds.push(sql`${q.tag} = any(${transactions.tags})`);
    if (q.q) {
      const like = `%${q.q}%`;
      conds.push(or(ilike(transactions.counterparty, like), ilike(transactions.rawContent, like), ilike(transactions.title, like), ilike(transactions.note, like), ilike(transactions.extId, like))!);
    }
    const where = conds.length ? and(...conds) : undefined;
    const limit = Math.min(Number(q.limit ?? 100), 1000);
    const offset = Number(q.offset ?? 0);
    const order = q.sort === 'asc' ? asc(transactions.occurredAt) : desc(transactions.occurredAt);
    const [rows, [{ total, inn, out }]] = await Promise.all([
      db.select().from(transactions).where(where).orderBy(order, desc(transactions.id)).limit(limit).offset(offset),
      db
        .select({
          total: sql<number>`count(*)::int`,
          inn: sql<number>`coalesce(sum(case when ${transactions.direction}='in' then ${transactions.amount} else 0 end),0)::bigint`,
          out: sql<number>`coalesce(sum(case when ${transactions.direction}='out' then ${transactions.amount} else 0 end),0)::bigint`,
        })
        .from(transactions)
        .where(where),
    ]);
    const sp = rows.length ? await db.select().from(splits).where(inArray(splits.transactionId, rows.map((x) => x.id))) : [];
    return c.json({
      rows: rows.map((t) => ({ ...t, split: sp.find((s) => s.transactionId === t.id) ?? null })),
      total,
      sumIn: Number(inn),
      sumOut: Number(out),
    });
  });

  /** Hộp duyệt: mọi khoản pending, kèm khả năng tự duyệt và quy tắc khớp. */
  r.get('/review', async (c) => {
    const rows = await db.select().from(transactions).where(eq(transactions.status, 'pending')).orderBy(asc(transactions.occurredAt));
    const cands = await autoApproveCandidates(db);
    const ruleIds = [...new Set(rows.map((x) => x.ruleId).filter(Boolean))] as number[];
    const rs = ruleIds.length ? await db.select().from(rules).where(inArray(rules.id, ruleIds)) : [];
    return c.json({
      rows: rows.map((t) => {
        const a = cands.find((x) => x.id === t.id)!;
        return { ...t, auto: { ok: a.ok, reason: a.reason }, rule: rs.find((x) => x.id === t.ruleId) ?? null };
      }),
    });
  });

  r.get('/:id', async (c) => {
    const id = Number(c.req.param('id'));
    const [t] = await db.select().from(transactions).where(eq(transactions.id, id));
    if (!t) throw new HttpError(404, 'Không tìm thấy giao dịch');
    const [split] = await db.select().from(splits).where(eq(splits.transactionId, id));
    const history = await db.select().from(decisions).where(eq(decisions.transactionId, id)).orderBy(desc(decisions.createdAt));
    const pair = t.pairExtId ? (await db.select().from(transactions).where(eq(transactions.extId, t.pairExtId)))[0] ?? null : null;
    // Giao dịch cùng đối tác đã duyệt, để tham khảo
    const similar = t.counterparty
      ? await db
          .select()
          .from(transactions)
          .where(and(eq(transactions.counterparty, t.counterparty), eq(transactions.status, 'approved')))
          .orderBy(desc(transactions.occurredAt))
          .limit(5)
      : [];
    return c.json({ ...t, split: split ?? null, history, pair, similar });
  });

  /** Thêm giao dịch tay (tiền mặt, ví điện tử…). Duyệt luôn nếu có quyết định. */
  r.post('/', async (c) => {
    const body = z
      .object({
        accountId: z.number().int(),
        occurredAt: z.string().min(10),
        amount: z.number().int().positive(),
        direction: z.enum(['in', 'out']),
        counterparty: z.string().nullish(),
        title: z.string().nullish(),
        note: z.string().nullish(),
        tags: z.array(z.string()).default([]),
        decision: decisionSchema.optional(),
      })
      .parse(await c.req.json());
    const { decision, ...v } = body;
    const [t] = await db
      .insert(transactions)
      .values({ ...v, occurredAt: v.occurredAt.slice(0, 16), extId: null, confidence: 'chac', suggestion: (decision as any) ?? null })
      .returning();
    if (decision) return c.json((await approveTransaction(db, t.id, decision as unknown as Decision, 'manual')).transaction, 201);
    return c.json(t, 201);
  });

  r.patch('/:id', async (c) => {
    const id = Number(c.req.param('id'));
    const body = z
      .object({
        title: z.string().nullish(),
        note: z.string().nullish(),
        tags: z.array(z.string()),
        categoryId: z.number().int().nullish(),
        answer: z.string().nullish(),
        suggestion: decisionSchema.nullish(),
        occurredAt: z.string(),
        amount: z.number().int().positive(),
        accountId: z.number().int(),
      })
      .partial()
      .parse(await c.req.json());
    const [t] = await db.select().from(transactions).where(eq(transactions.id, id));
    if (!t) throw new HttpError(404, 'Không tìm thấy giao dịch');
    if ((body.amount || body.occurredAt || body.accountId) && t.extId) throw new HttpError(409, 'Không sửa số tiền/ngày/ví của giao dịch nhập từ sao kê.');
    const [row] = await db
      .update(transactions)
      .set(body as any)
      .where(eq(transactions.id, id))
      .returning();
    // Đổi danh mục / tên trên bill đã chia thì cập nhật luôn bill
    if (row.kind === 'split' && (body.categoryId !== undefined || body.title)) {
      await db
        .update(splits)
        .set({ ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}), ...(body.title ? { title: body.title } : {}) })
        .where(eq(splits.transactionId, id));
    }
    return c.json(row);
  });

  r.delete('/:id', async (c) => {
    const id = Number(c.req.param('id'));
    const [t] = await db.select().from(transactions).where(eq(transactions.id, id));
    if (!t) throw new HttpError(404, 'Không tìm thấy giao dịch');
    if (t.extId) throw new HttpError(409, 'Giao dịch từ sao kê không xoá được. Đánh dấu "Bỏ qua" thay vì xoá.');
    await unapproveTransaction(db, id);
    await db.delete(transactions).where(eq(transactions.id, id));
    return c.json({ ok: true });
  });

  r.post('/:id/approve', async (c) => {
    const d = decisionSchema.parse(await c.req.json()) as unknown as Decision;
    return c.json(await approveTransaction(db, Number(c.req.param('id')), d, 'manual'));
  });

  r.post('/:id/unapprove', async (c) => {
    await unapproveTransaction(db, Number(c.req.param('id')));
    return c.json({ ok: true });
  });

  /** Duyệt nhiều khoản: theo gợi ý của từng khoản, hoặc áp cùng một quyết định. */
  r.post('/bulk-approve', async (c) => {
    const { ids, decision } = z.object({ ids: z.array(z.number().int()).min(1), decision: decisionSchema.optional() }).parse(await c.req.json());
    return c.json(await bulkApprove(db, ids, 'bulk', decision as unknown as Decision | undefined));
  });

  /** Tự duyệt: server kiểm tra lại từng khoản trước khi duyệt. */
  r.post('/auto-approve', async (c) => {
    const { ids } = z.object({ ids: z.array(z.number().int()).optional() }).parse(await c.req.json().catch(() => ({})));
    const target = ids ?? (await autoApproveCandidates(db)).filter((x) => x.ok).map((x) => x.id);
    return c.json(await bulkApprove(db, target, 'auto'));
  });

  return r;
}
