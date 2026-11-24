import { Hono } from 'hono';
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { normalizeText } from '@moneylov/core';
import { z } from 'zod';
import type { DB } from '../db';
import { budgets, categories, loanPayments, loans, recurring, transactions } from '../schema';
import { getAppSettings } from '../seed';
import { HttpError } from '../services/lookups';
import { myLines } from '../services/ledger';

const monthRange = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return { from: `${m}-01`, to: `${m}-${String(last).padStart(2, '0')}` };
};
const prevMonth = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`;
};

/** Chi tiêu của Quang theo danh mục trong tháng (gộp danh mục con vào danh mục cha). */
async function spentByCategory(db: DB, month: string) {
  const settings = await getAppSettings(db);
  const lines = await myLines(db, monthRange(month), settings.hub);
  const cats = await db.select().from(categories);
  const root = (id: number | null) => {
    const c = cats.find((x) => x.id === id);
    return c?.parentId ?? c?.id ?? null;
  };
  const m = new Map<number | null, number>();
  let total = 0;
  for (const l of lines) {
    const k = root(l.categoryId);
    m.set(k, (m.get(k) ?? 0) + l.amount);
    total += l.amount;
  }
  return { byCat: m, total };
}

export async function budgetStatus(db: DB, month: string) {
  const all = await db.select().from(budgets);
  const pick = (catId: number | null, m: string) => all.find((b) => b.categoryId === catId && b.month === m) ?? all.find((b) => b.categoryId === catId && b.month === '*');
  const spent = await spentByCategory(db, month);
  const cats = await db.select().from(categories);
  const ids = [...new Set(all.map((b) => b.categoryId))];
  const out = [];
  for (const catId of ids) {
    const b = pick(catId, month);
    if (!b) continue;
    let limit = b.amount;
    let carried = 0;
    if (b.rollover) {
      const pm = prevMonth(month);
      const pb = pick(catId, pm);
      if (pb) {
        const ps = await spentByCategory(db, pm);
        carried = pb.amount - (catId === null ? ps.total : (ps.byCat.get(catId) ?? 0));
        limit += carried;
      }
    }
    const used = catId === null ? spent.total : (spent.byCat.get(catId) ?? 0);
    const pct = limit > 0 ? used / limit : used > 0 ? 1 : 0;
    out.push({
      budget: b,
      category: cats.find((c) => c.id === catId) ?? null,
      limit,
      carried,
      spent: used,
      remaining: limit - used,
      pct,
      level: pct >= 1 ? 'over' : pct >= 0.8 ? 'warn' : 'ok',
    });
  }
  return { month, items: out.sort((a, b) => (a.category ? 1 : -1) - (b.category ? 1 : -1) || b.pct - a.pct), unbudgeted: [...spent.byCat].filter(([k]) => !ids.includes(k)).map(([k, v]) => ({ categoryId: k, spent: v })) };
}

/** Các kỳ đến hạn của khoản định kỳ trong cửa sổ [from, to]. */
function dueDates(r: typeof recurring.$inferSelect, from: Date, to: Date): Date[] {
  const out: Date[] = [];
  const start = new Date(r.startDate + 'T00:00:00Z');
  const end = r.endDate ? new Date(r.endDate + 'T00:00:00Z') : null;
  if (r.frequency === 'weekly') {
    const d = new Date(start);
    while (d <= to) {
      if (d >= from && (!end || d <= end)) out.push(new Date(d));
      d.setUTCDate(d.getUTCDate() + 7);
    }
    return out;
  }
  const at = (y: number, m: number) => {
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, m, Math.min(r.dayOfPeriod, last)));
  };
  const cands: Date[] = [];
  if (r.frequency === 'yearly') {
    for (let y = from.getUTCFullYear(); y <= to.getUTCFullYear(); y++) cands.push(at(y, start.getUTCMonth()));
  } else {
    // Date.UTC tự xử lý tháng tràn (tháng 12 → tháng 0 năm sau)
    for (let i = 0; i < 40; i++) {
      const d = at(from.getUTCFullYear(), from.getUTCMonth() + i);
      if (d > to) break;
      cands.push(d);
    }
  }
  for (const due of cands) if (due >= from && due <= to && due >= start && (!end || due <= end)) out.push(due);
  return out;
}

export async function upcomingRecurring(db: DB, days = 35) {
  const list = await db.select().from(recurring).where(eq(recurring.active, true));
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  const from = new Date(today.getTime() - 40 * 86400_000);
  const to = new Date(today.getTime() + days * 86400_000);
  const txs = await db
    .select()
    .from(transactions)
    .where(and(gte(transactions.occurredAt, from.toISOString().slice(0, 10)), lte(transactions.occurredAt, to.toISOString().slice(0, 10))));
  const out = [];
  for (const r of list) {
    for (const due of dueDates(r, from, to)) {
      const tol = r.toleranceDays * 86400_000;
      const match = txs.find((t) => {
        const dt = Date.parse(t.occurredAt.slice(0, 10) + 'T00:00:00Z');
        if (Math.abs(dt - due.getTime()) > tol || t.direction !== r.direction) return false;
        if (Math.abs(t.amount - r.amount) > (r.amount * r.tolerancePct) / 100) return false;
        if (r.matchCounterparty) {
          const n = normalizeText(r.matchCounterparty);
          return normalizeText(t.counterparty).includes(n) || normalizeText(t.rawContent).includes(n);
        }
        return true;
      });
      const dueStr = due.toISOString().slice(0, 10);
      const status = match ? 'paid' : due < today ? 'overdue' : 'upcoming';
      if (status === 'paid' && due < new Date(today.getTime() - 7 * 86400_000)) continue;
      out.push({ recurring: r, due: dueStr, status, match: match ? { id: match.id, occurredAt: match.occurredAt, amount: match.amount } : null });
    }
  }
  return out.sort((a, b) => a.due.localeCompare(b.due));
}

const budgetSchema = z.object({
  categoryId: z.number().int().nullable(),
  month: z.string().regex(/^(\d{4}-\d{2}|\*)$/),
  amount: z.number().int().nonnegative(),
  rollover: z.boolean().default(false),
  basis: z.enum(['mine', 'gross']).default('mine'),
});
const recurringSchema = z.object({
  name: z.string().min(1),
  amount: z.number().int().positive(),
  direction: z.enum(['in', 'out']).default('out'),
  frequency: z.enum(['monthly', 'weekly', 'yearly']),
  dayOfPeriod: z.number().int().min(1).max(31).default(1),
  startDate: z.string().length(10),
  endDate: z.string().length(10).nullish(),
  accountId: z.number().int().nullish(),
  categoryId: z.number().int().nullish(),
  matchCounterparty: z.string().nullish(),
  tolerancePct: z.number().int().min(0).max(100).default(10),
  toleranceDays: z.number().int().min(0).max(31).default(5),
  active: z.boolean().default(true),
});
const loanSchema = z.object({
  person: z.string().min(1),
  direction: z.enum(['lend', 'borrow']),
  amount: z.number().int().positive(),
  startedAt: z.string().length(10),
  dueAt: z.string().length(10).nullish(),
  periodId: z.number().int().nullish(),
  note: z.string().nullish(),
  closed: z.boolean().default(false),
});

export function planningRoutes(db: DB) {
  const r = new Hono();

  r.get('/budgets', async (c) => {
    const month = c.req.query('month') ?? new Date().toISOString().slice(0, 7);
    return c.json(await budgetStatus(db, month));
  });
  r.put('/budgets', async (c) => {
    const b = budgetSchema.parse(await c.req.json());
    const [existing] = await db
      .select()
      .from(budgets)
      .where(and(b.categoryId === null ? sql`${budgets.categoryId} is null` : eq(budgets.categoryId, b.categoryId), eq(budgets.month, b.month)));
    const [row] = existing ? await db.update(budgets).set(b).where(eq(budgets.id, existing.id)).returning() : await db.insert(budgets).values(b).returning();
    return c.json(row);
  });
  r.delete('/budgets/:id', async (c) => {
    await db.delete(budgets).where(eq(budgets.id, Number(c.req.param('id'))));
    return c.json({ ok: true });
  });

  r.get('/recurring', async (c) => c.json({ items: await db.select().from(recurring).orderBy(asc(recurring.name)), upcoming: await upcomingRecurring(db) }));
  r.post('/recurring', async (c) => c.json((await db.insert(recurring).values(recurringSchema.parse(await c.req.json())).returning())[0], 201));
  r.patch('/recurring/:id', async (c) => {
    const [row] = await db.update(recurring).set(recurringSchema.partial().parse(await c.req.json())).where(eq(recurring.id, Number(c.req.param('id')))).returning();
    if (!row) throw new HttpError(404, 'Không tìm thấy');
    return c.json(row);
  });
  r.delete('/recurring/:id', async (c) => {
    await db.delete(recurring).where(eq(recurring.id, Number(c.req.param('id'))));
    return c.json({ ok: true });
  });

  r.get('/loans', async (c) => {
    const ls = await db.select().from(loans).orderBy(desc(loans.startedAt));
    const pays = ls.length ? await db.select().from(loanPayments).where(inArray(loanPayments.loanId, ls.map((l) => l.id))) : [];
    return c.json(
      ls.map((l) => {
        const p = pays.filter((x) => x.loanId === l.id);
        const paid = p.reduce((a, x) => a + x.amount, 0);
        return { ...l, payments: p, paid, remaining: l.amount - paid };
      }),
    );
  });
  r.post('/loans', async (c) => c.json((await db.insert(loans).values(loanSchema.parse(await c.req.json())).returning())[0], 201));
  r.patch('/loans/:id', async (c) => {
    const [row] = await db.update(loans).set(loanSchema.partial().parse(await c.req.json())).where(eq(loans.id, Number(c.req.param('id')))).returning();
    if (!row) throw new HttpError(404, 'Không tìm thấy');
    return c.json(row);
  });
  r.delete('/loans/:id', async (c) => {
    const id = Number(c.req.param('id'));
    const [l] = await db.select().from(loans).where(eq(loans.id, id));
    if (l?.note?.startsWith('tx:')) throw new HttpError(409, 'Khoản vay tạo từ giao dịch: bỏ duyệt giao dịch đó.');
    await db.delete(loanPayments).where(eq(loanPayments.loanId, id));
    await db.delete(loans).where(eq(loans.id, id));
    return c.json({ ok: true });
  });
  r.post('/loans/:id/payments', async (c) => {
    const id = Number(c.req.param('id'));
    const b = z.object({ amount: z.number().int().positive(), paidAt: z.string().length(10), note: z.string().nullish() }).parse(await c.req.json());
    const [row] = await db.insert(loanPayments).values({ loanId: id, ...b }).returning();
    const [l] = await db.select().from(loans).where(eq(loans.id, id));
    const [{ paid }] = await db.select({ paid: sql<number>`coalesce(sum(${loanPayments.amount}),0)::bigint` }).from(loanPayments).where(eq(loanPayments.loanId, id));
    if (l && Number(paid) >= l.amount) await db.update(loans).set({ closed: true }).where(eq(loans.id, id));
    return c.json(row, 201);
  });
  r.delete('/loan-payments/:id', async (c) => {
    const id = Number(c.req.param('id'));
    const [p] = await db.select().from(loanPayments).where(eq(loanPayments.id, id));
    if (p?.transactionId) throw new HttpError(409, 'Khoản trả gắn với giao dịch: bỏ duyệt giao dịch đó.');
    await db.delete(loanPayments).where(eq(loanPayments.id, id));
    return c.json({ ok: true });
  });

  return r;
}
