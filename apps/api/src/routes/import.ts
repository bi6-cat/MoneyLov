import { Hono } from 'hono';
import { desc } from 'drizzle-orm';
import type { DB } from '../db';
import { importBatches } from '../schema';
import { runImport } from '../services/importer';
import { HttpError } from '../services/lookups';

/**
 * POST /api/import?dry_run=1&filename=dot-2026-10-30.json
 * Body: nội dung file nạp (JSON). Dùng được bằng cookie hoặc `Authorization: Bearer <token import>`.
 */
export function importRoutes(db: DB) {
  const r = new Hono<any>();

  r.post('/', async (c) => {
    let json: unknown;
    try {
      json = await c.req.json();
    } catch {
      throw new HttpError(400, 'Body không phải JSON hợp lệ');
    }
    const dryRun = ['1', 'true'].includes(c.req.query('dry_run') ?? '');
    const p = c.get('principal');
    const result = await runImport(db, json, { dryRun, source: p?.kind === 'token' ? 'api' : 'upload', filename: c.req.query('filename') });
    return c.json(result, dryRun ? 200 : 201);
  });

  r.get('/batches', async (c) => c.json(await db.select().from(importBatches).orderBy(desc(importBatches.createdAt)).limit(50)));

  return r;
}
