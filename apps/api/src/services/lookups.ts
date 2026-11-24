import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
import type { Person } from '@moneylov/core';
import type { DB, Tx } from '../db';
import { accounts, categories, people, periods } from '../schema';

type Q = DB | Tx;

export async function loadPeople(db: Q): Promise<(Person & { aliases: string[] })[]> {
  const rows = await db.select().from(people).orderBy(asc(people.sort));
  return rows.map((p) => ({ code: p.code, name: p.name, role: p.role, paidBy: p.paidBy, sheetColumn: p.sheetColumn, active: p.active, aliases: p.aliases }));
}

export async function roommates(db: Q) {
  return (await loadPeople(db)).filter((p) => p.role === 'roommate' && p.active !== false).map((p) => p.code);
}

/** Tìm hoặc tạo danh mục theo tên (gợi ý từ file nạp chỉ có tên). */
export async function categoryIdByName(db: Q, name: string | null | undefined, kind: 'expense' | 'income' = 'expense'): Promise<number | null> {
  if (!name) return null;
  const [found] = await db.select().from(categories).where(eq(categories.name, name));
  if (found) return found.id;
  const [row] = await db.insert(categories).values({ name, kind }).returning();
  return row.id;
}

export async function accountIdBySource(db: Q, source: string, create: boolean): Promise<number | null> {
  const [found] = await db.select().from(accounts).where(eq(accounts.importSource, source));
  if (found) return found.id;
  if (!create) return null;
  const type = /card|thẻ/i.test(source) ? 'credit' : /mặt|cash/i.test(source) ? 'cash' : 'bank';
  const [row] = await db.insert(accounts).values({ name: source, type, importSource: source }).returning();
  return row.id;
}

/** Đợt chứa ngày `d` (ưu tiên đợt đang mở), nếu không có thì đợt mở gần nhất. */
export async function periodForDate(db: Q, d: string): Promise<number | null> {
  const day = d.slice(0, 10);
  const [p] = await db
    .select()
    .from(periods)
    .where(and(lte(periods.fromDate, day), gte(periods.toDate, day)))
    .orderBy(desc(periods.status), desc(periods.fromDate)); // 'open' trước 'closed'
  if (p) return p.id;
  const [open] = await db.select().from(periods).where(eq(periods.status, 'open')).orderBy(desc(periods.fromDate));
  return open?.id ?? null;
}

export class HttpError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409 | 422 | 429,
    message: string,
  ) {
    super(message);
  }
}
