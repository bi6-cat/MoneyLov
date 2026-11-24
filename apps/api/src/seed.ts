import { eq } from 'drizzle-orm';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES, DEFAULT_PEOPLE } from '@moneylov/core';
import type { DB } from './db';
import { accounts, categories, people, recurring, settings } from './schema';

export interface AppSettings {
  hub: string;
  autoApproveMinConfirmations: number;
  bankLine: string;
  currency: 'VND';
  weekStart: 1;
}

export const DEFAULT_SETTINGS: AppSettings = {
  hub: 'Q',
  autoApproveMinConfirmations: 3,
  bankLine: 'STK MB 2888666222 (Nguyễn Ngọc Quang)',
  currency: 'VND',
  weekStart: 1,
};

export async function getSetting<T>(db: DB, key: string): Promise<T | undefined> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key));
  return row?.value as T | undefined;
}

export async function setSetting(db: DB, key: string, value: unknown) {
  await db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
}

export async function getAppSettings(db: DB): Promise<AppSettings> {
  return { ...DEFAULT_SETTINGS, ...((await getSetting<Partial<AppSettings>>(db, 'app')) ?? {}) };
}

/** Lần chạy đầu: tạo người, ví, danh mục, khoản định kỳ mặc định. */
export async function seed(db: DB) {
  if (await getSetting(db, 'seeded')) return;
  await db.insert(people).values(
    DEFAULT_PEOPLE.map((p, i) => ({ code: p.code, name: p.name, role: p.role, paidBy: p.paidBy ?? null, sheetColumn: p.sheetColumn ?? null, aliases: p.aliases, sort: i })),
  );
  await db.insert(accounts).values(DEFAULT_ACCOUNTS.map((a, i) => ({ ...a, sort: i })));
  await db.insert(categories).values(DEFAULT_CATEGORIES.map((c, i) => ({ ...c, sort: i })));
  const cats = await db.select().from(categories);
  const cat = (n: string) => cats.find((c) => c.name === n)?.id ?? null;
  const today = new Date().toISOString().slice(0, 10);
  await db.insert(recurring).values([
    { name: 'Tiền nhà P602', amount: 8500000, frequency: 'monthly', dayOfPeriod: 5, startDate: today, categoryId: cat('Nhà ở'), matchCounterparty: null, suggestion: { action: 'split', split: { mode: 'rent' }, isRent: true, category: 'Nhà ở' } },
    { name: 'Claude', amount: 575000, frequency: 'monthly', dayOfPeriod: 8, startDate: today, categoryId: cat('Dịch vụ & thuê bao'), matchCounterparty: 'ANTHROPIC', tolerancePct: 15 },
    { name: 'YouTube Premium', amount: 165556, frequency: 'monthly', dayOfPeriod: 14, startDate: today, categoryId: cat('Dịch vụ & thuê bao'), matchCounterparty: 'YouTube' },
  ]);
  await setSetting(db, 'app', DEFAULT_SETTINGS);
  await setSetting(db, 'seeded', true);
}
