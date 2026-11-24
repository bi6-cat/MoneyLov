import { Hono } from 'hono';
import { asc, desc, eq, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import type { DB } from '../db';
import { accounts, categories, people, periods, transactions } from '../schema';
import { getAppSettings, setSetting } from '../seed';
import { HttpError } from '../services/lookups';

/** Số dư từng ví: số dư đầu + vào − ra (mọi giao dịch) + tiền chuyển đến từ ví khác. */
export async function accountBalances(db: DB) {
  const flow = await db
    .select({
      accountId: transactions.accountId,
      inn: sql<number>`coalesce(sum(case when ${transactions.direction}='in' then ${transactions.amount} else 0 end),0)::bigint`,
      out: sql<number>`coalesce(sum(case when ${transactions.direction}='out' then ${transactions.amount} else 0 end),0)::bigint`,
      count: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .groupBy(transactions.accountId);
  const transfersIn = await db
    .select({ accountId: transactions.toAccountId, amount: sql<number>`coalesce(sum(${transactions.amount}),0)::bigint` })
    .from(transactions)
    .where(eq(transactions.kind, 'transfer'))
    .groupBy(transactions.toAccountId);
  const accs = await db.select().from(accounts).orderBy(asc(accounts.sort), asc(accounts.id));
  return accs.map((a) => {
    const f = flow.find((x) => x.accountId === a.id);
    const t = transfersIn.find((x) => x.accountId === a.id);
    return { ...a, balance: a.openingBalance + Number(f?.inn ?? 0) - Number(f?.out ?? 0) + Number(t?.amount ?? 0), txCount: f?.count ?? 0 };
  });
}

function crud<T extends PgTable>(r: Hono<any>, path: string, db: DB, table: T, pk: any, schema: z.ZodObject<any>, numericId = true) {
  r.post(path, async (c) => {
    const body = schema.parse(await c.req.json());
    const [row] = await db.insert(table).values(body as any).returning();
    return c.json(row, 201);
  });
  r.patch(`${path}/:id`, async (c) => {
    const body = schema.partial().parse(await c.req.json());
    const id = numericId ? Number(c.req.param('id')) : c.req.param('id');
    const [row] = await db.update(table).set(body as any).where(eq(pk, id)).returning();
    if (!row) throw new HttpError(404, 'Không tìm thấy');
    return c.json(row);
  });
}

const accountSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['bank', 'credit', 'cash', 'ewallet', 'saving']),
  number: z.string().nullish(),
  importSource: z.string().nullish(),
  openingBalance: z.number().int().default(0),
  creditLimit: z.number().int().nullish(),
  color: z.string().default('#64748b'),
  archived: z.boolean().default(false),
  sort: z.number().int().default(0),
});
const categorySchema = z.object({
  name: z.string().min(1),
  kind: z.enum(['expense', 'income']),
  parentId: z.number().int().nullish(),
  icon: z.string().default('circle'),
  color: z.string().default('#94a3b8'),
  archived: z.boolean().default(false),
  sort: z.number().int().default(0),
});
const personSchema = z.object({
  code: z.string().min(1).max(4),
  name: z.string().min(1),
  role: z.enum(['roommate', 'food']),
  paidBy: z.string().nullish(),
  sheetColumn: z.string().nullish(),
  aliases: z.array(z.string()).default([]),
  active: z.boolean().default(true),
  sort: z.number().int().default(0),
});

export function metaRoutes(db: DB) {
  const r = new Hono();

  /** Dữ liệu nền cho giao diện, tải một lần. */
  r.get('/meta', async (c) => {
    const [accs, cats, ppl, pers, settings, [{ pending }]] = await Promise.all([
      accountBalances(db),
      db.select().from(categories).orderBy(asc(categories.sort), asc(categories.id)),
      db.select().from(people).orderBy(asc(people.sort)),
      db.select({ id: periods.id, name: periods.name, fromDate: periods.fromDate, toDate: periods.toDate, status: periods.status, rentTotal: periods.rentTotal }).from(periods).orderBy(desc(periods.fromDate)),
      getAppSettings(db),
      db.select({ pending: sql<number>`count(*)::int` }).from(transactions).where(eq(transactions.status, 'pending')),
    ]);
    return c.json({ accounts: accs, categories: cats, people: ppl, periods: pers, settings, pending });
  });

  r.put('/settings', async (c) => {
    const body = z
      .object({ hub: z.string(), autoApproveMinConfirmations: z.number().int().min(1).max(50), bankLine: z.string() })
      .partial()
      .parse(await c.req.json());
    const next = { ...(await getAppSettings(db)), ...body };
    await setSetting(db, 'app', next);
    return c.json(next);
  });

  crud(r, '/accounts', db, accounts, accounts.id, accountSchema);
  crud(r, '/categories', db, categories, categories.id, categorySchema);
  crud(r, '/people', db, people, people.code, personSchema, false);
  return r;
}
