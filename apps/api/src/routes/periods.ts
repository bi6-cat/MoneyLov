import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db';
import { periods, settlements, splits } from '../schema';
import { buildSplit } from '../services/approve';
import { categoryIdByName, HttpError } from '../services/lookups';
import { closePeriod, exportPeriod, periodDetail, reopenPeriod } from '../services/period';
import { getAppSettings } from '../seed';

const splitConfig = z.object({ mode: z.enum(['equal', 'exact', 'percent', 'shares', 'items', 'rent']) }).passthrough();

async function assertOpen(db: DB, id: number) {
  const [p] = await db.select().from(periods).where(eq(periods.id, id));
  if (!p) throw new HttpError(404, 'Không tìm thấy đợt');
  if (p.status === 'closed') throw new HttpError(409, `Đợt "${p.name}" đã chốt.`);
  return p;
}

export function periodRoutes(db: DB) {
  const r = new Hono();

  r.get('/', async (c) => c.json(await db.select().from(periods).orderBy(desc(periods.fromDate))));

  r.post('/', async (c) => {
    const b = z
      .object({ name: z.string().min(1), fromDate: z.string().length(10), toDate: z.string().length(10), rentTotal: z.number().int().nullish() })
      .parse(await c.req.json());
    const [p] = await db.insert(periods).values(b).returning();
    return c.json(p, 201);
  });

  r.get('/:id', async (c) => c.json(await periodDetail(db, Number(c.req.param('id')))));

  r.patch('/:id', async (c) => {
    const id = Number(c.req.param('id'));
    await assertOpen(db, id);
    const b = z
      .object({
        name: z.string().min(1),
        fromDate: z.string().length(10),
        toDate: z.string().length(10),
        rentTotal: z.number().int().nullable(),
        carriedOverride: z.record(z.object({ amount: z.number().int(), reason: z.string().min(1, 'Cần ghi lý do') })),
      })
      .partial()
      .parse(await c.req.json());
    await db.update(periods).set(b).where(eq(periods.id, id));
    return c.json(await periodDetail(db, id));
  });

  r.post('/:id/close', async (c) => c.json(await closePeriod(db, Number(c.req.param('id')))));
  r.post('/:id/reopen', async (c) => {
    const { reason } = z.object({ reason: z.string() }).parse(await c.req.json());
    return c.json(await reopenPeriod(db, Number(c.req.param('id')), reason));
  });

  /** toan-bo.json cho sheet_b.py (Việc B ghi Google Sheet). */
  r.get('/:id/export', async (c) => {
    const data = await exportPeriod(db, Number(c.req.param('id')));
    c.header('Content-Disposition', `attachment; filename="toan-bo-${data.dot.tu_ngay}.json"`);
    return c.json(data);
  });

  /** Bill không có giao dịch ngân hàng: trả tiền mặt, hoặc người khác trả. */
  r.post('/:id/splits', async (c) => {
    const id = Number(c.req.param('id'));
    await assertOpen(db, id);
    const b = z
      .object({ title: z.string().min(1), occurredAt: z.string().min(10), total: z.number().int().positive(), config: splitConfig, category: z.string().nullish(), note: z.string().nullish(), isRent: z.boolean().default(false) })
      .parse(await c.req.json());
    const settings = await getAppSettings(db);
    const { config, result } = await buildSplit(db, b.config as any, b.total, settings.hub);
    const [row] = await db
      .insert(splits)
      .values({ periodId: id, title: b.title, occurredAt: b.occurredAt.slice(0, 16), isRent: b.isRent, config, result, categoryId: await categoryIdByName(db, b.category), note: b.note ?? null })
      .returning();
    return c.json(row, 201);
  });

  /** Sửa cách chia của một bill (cả bill gắn giao dịch). */
  r.put('/splits/:sid', async (c) => {
    const sid = Number(c.req.param('sid'));
    const [s] = await db.select().from(splits).where(eq(splits.id, sid));
    if (!s) throw new HttpError(404, 'Không tìm thấy bill');
    await assertOpen(db, s.periodId);
    const b = z.object({ config: splitConfig, title: z.string().optional(), note: z.string().nullish(), total: z.number().int().positive().optional() }).parse(await c.req.json());
    const total = s.transactionId ? s.config.total : (b.total ?? s.config.total);
    const settings = await getAppSettings(db);
    const { config, result } = await buildSplit(db, b.config as any, total, settings.hub);
    const [row] = await db
      .update(splits)
      .set({ config, result, ...(b.title ? { title: b.title } : {}), ...(b.note !== undefined ? { note: b.note } : {}) })
      .where(eq(splits.id, sid))
      .returning();
    return c.json(row);
  });

  r.delete('/splits/:sid', async (c) => {
    const sid = Number(c.req.param('sid'));
    const [s] = await db.select().from(splits).where(eq(splits.id, sid));
    if (!s) throw new HttpError(404, 'Không tìm thấy bill');
    if (s.transactionId) throw new HttpError(409, 'Bill gắn với giao dịch: bỏ duyệt giao dịch thay vì xoá bill.');
    await assertOpen(db, s.periodId);
    await db.delete(splits).where(eq(splits.id, sid));
    return c.json({ ok: true });
  });

  /** Ghi tay tiền người khác trả (tiền mặt). */
  r.post('/:id/settlements', async (c) => {
    const id = Number(c.req.param('id'));
    await assertOpen(db, id);
    const b = z.object({ person: z.string(), amount: z.number().int(), paidAt: z.string().min(10), note: z.string().nullish() }).parse(await c.req.json());
    const [row] = await db.insert(settlements).values({ periodId: id, ...b, paidAt: b.paidAt.slice(0, 16) }).returning();
    return c.json(row, 201);
  });

  r.delete('/settlements/:sid', async (c) => {
    const sid = Number(c.req.param('sid'));
    const [s] = await db.select().from(settlements).where(eq(settlements.id, sid));
    if (!s) throw new HttpError(404, 'Không tìm thấy');
    if (s.transactionId) throw new HttpError(409, 'Khoản trả gắn với giao dịch: bỏ duyệt giao dịch.');
    await assertOpen(db, s.periodId);
    await db.delete(settlements).where(eq(settlements.id, sid));
    return c.json({ ok: true });
  });

  return r;
}
