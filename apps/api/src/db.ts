import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import { migrate as migratePg } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from './schema';

export type DB = ReturnType<typeof drizzlePg<typeof schema>>;
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../drizzle');

/**
 * DATABASE_URL có → PostgreSQL (production, Docker).
 * Không có → PGlite (Postgres nhúng) trong thư mục DATA_DIR, dùng cho dev và test.
 * PGDATA=memory:// cho test chạy trong bộ nhớ.
 */
export async function openDb(): Promise<{ db: DB; close: () => Promise<void> }> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const client = postgres(url, { max: 10 });
    const db = drizzlePg(client, { schema });
    await migratePg(db, { migrationsFolder });
    return { db, close: () => client.end() };
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  const dir = process.env.PGDATA ?? resolve(process.cwd(), 'data/pglite');
  if (!dir.startsWith('memory://')) mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return { db: db as unknown as DB, close: () => client.close() };
}
