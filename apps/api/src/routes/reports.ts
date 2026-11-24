import { Hono } from 'hono';
import { and, eq, gte, lt, sql } from 'drizzle-orm';
import type { DB } from '../db';
import { categories, transactions } from '../schema';
import { getAppSettings } from '../seed';
import { myLines } from '../services/ledger';

const nextDay = (d: string) => new Date(Date.parse(d + 'T00:00:00Z') + 86400_000).toISOString().slice(0, 10);

/**
 * GET /api/reports?from=YYYY-MM-DD&to=YYYY-MM-DD&group=month|period
 * "Của tôi" = Riêng + phần Chung + phần Nhà của Quang (không tính phần người khác sẽ trả lại).
 */
export function reportRoutes(db: DB) {
  const r = new Hono();

  r.get('/', async (c) => {
    const to = c.req.query('to') ?? new Date().toISOString().slice(0, 10);
    // Mặc định: 12 tháng gần nhất
    const from = c.req.query('from') ?? new Date(Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 12, 1)).toISOString().slice(0, 10);
    const settings = await getAppSettings(db);
    const lines = await myLines(db, { from, to }, settings.hub);
    const cats = await db.select().from(categories);
    const catOf = (id: number | null) => {
      const ch = cats.find((x) => x.id === id);
      const root = ch?.parentId ? cats.find((x) => x.id === ch.parentId) : ch;
      return root ? { id: root.id, name: root.name, color: root.color, icon: root.icon } : { id: null, name: 'Chưa phân loại', color: '#94a3b8', icon: 'circle' };
    };

    // Theo danh mục
    const byCat = new Map<string, { id: number | null; name: string; color: string; icon: string; amount: number; count: number }>();
    for (const l of lines) {
      const k = catOf(l.categoryId);
      const cur = byCat.get(k.name) ?? { ...k, amount: 0, count: 0 };
      cur.amount += l.amount;
      cur.count++;
      byCat.set(k.name, cur);
    }

    // Theo tháng × phạm vi
    const byMonth = new Map<string, { month: string; Rieng: number; Chung: number; Nha: number; income: number; gross: number }>();
    const mk = (m: string) => byMonth.get(m) ?? { month: m, Rieng: 0, Chung: 0, Nha: 0, income: 0, gross: 0 };
    for (const l of lines) {
      const m = l.date.slice(0, 7);
      const cur = mk(m);
      cur[l.scope] += l.amount;
      byMonth.set(m, cur);
    }
    const range = and(gte(transactions.occurredAt, from), lt(transactions.occurredAt, nextDay(to)), eq(transactions.status, 'approved'));
    const flows = await db
      .select({
        month: sql<string>`to_char(${transactions.occurredAt}, 'YYYY-MM')`,
        kind: transactions.kind,
        direction: transactions.direction,
        amount: sql<number>`sum(${transactions.amount})::bigint`,
      })
      .from(transactions)
      .where(range)
      .groupBy(sql`1`, transactions.kind, transactions.direction);
    for (const f of flows) {
      const cur = mk(f.month);
      if (f.kind === 'income') cur.income += Number(f.amount);
      if (f.direction === 'out' && (f.kind === 'expense' || f.kind === 'split')) cur.gross += Number(f.amount);
      byMonth.set(f.month, cur);
    }

    // Đối tác chi nhiều nhất (phần của tôi)
    const top = new Map<string, number>();
    for (const l of lines) top.set(l.name, (top.get(l.name) ?? 0) + l.amount);

    // Theo ngày (biểu đồ xu hướng)
    const byDay = new Map<string, number>();
    for (const l of lines) byDay.set(l.date.slice(0, 10), (byDay.get(l.date.slice(0, 10)) ?? 0) + l.amount);

    const total = lines.reduce((a, l) => a + l.amount, 0);
    const scope = { Rieng: 0, Chung: 0, Nha: 0 };
    lines.forEach((l) => (scope[l.scope] += l.amount));
    const income = [...byMonth.values()].reduce((a, m) => a + m.income, 0);
    const days = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86400_000) + 1);

    return c.json({
      from,
      to,
      total,
      income,
      perDay: Math.round(total / days),
      scope,
      byCategory: [...byCat.values()].sort((a, b) => b.amount - a.amount),
      byMonth: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)),
      byDay: [...byDay].map(([date, amount]) => ({ date, amount })).sort((a, b) => a.date.localeCompare(b.date)),
      top: [...top].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount).slice(0, 10),
      lines: c.req.query('lines') ? lines : undefined,
    });
  });

  /** CSV chi tiêu của tôi (mở được bằng Excel, có BOM UTF-8). */
  r.get('/export.csv', async (c) => {
    const from = c.req.query('from') ?? '2000-01-01';
    const to = c.req.query('to') ?? new Date().toISOString().slice(0, 10);
    const settings = await getAppSettings(db);
    const lines = await myLines(db, { from, to }, settings.hub);
    const cats = await db.select().from(categories);
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const LOAI = { Rieng: 'Riêng', Chung: 'Chung', Nha: 'Nhà' } as const;
    const rows = [
      ['Ngày', 'Tên khoản', 'Nguồn', 'Loại', 'Danh mục', 'Số tiền (đ)', 'Mã GD', 'Ghi chú'],
      ...lines.map((l) => [l.date.slice(0, 10), l.name, l.source, LOAI[l.scope], cats.find((x) => x.id === l.categoryId)?.name ?? '', l.amount, l.gdId, l.note ?? '']),
    ];
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="chi-tieu-${from}-${to}.csv"`);
    return c.body('﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n'));
  });

  return r;
}
