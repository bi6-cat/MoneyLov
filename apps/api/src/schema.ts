import { sql } from 'drizzle-orm';
import { bigint, boolean, date, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import type { Confidence, Scope, SplitConfig, SplitResult, Suggestion } from '@moneylov/core';
import type { RuleMatch } from '@moneylov/core';

const money = (name: string) => bigint(name, { mode: 'number' });
const created = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
});

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: created(),
});

export const apiTokens = pgTable('api_tokens', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  prefix: text('prefix').notNull(),
  scopes: text('scopes').array().notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: created(),
});

export const accounts = pgTable('accounts', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').$type<'bank' | 'credit' | 'cash' | 'ewallet' | 'saving'>().notNull(),
  number: text('number'),
  importSource: text('import_source').unique(), // 'MB', 'Card 8508'…
  openingBalance: money('opening_balance').notNull().default(0),
  creditLimit: money('credit_limit'),
  color: text('color').notNull().default('#64748b'),
  archived: boolean('archived').notNull().default(false),
  sort: integer('sort').notNull().default(0),
  createdAt: created(),
});

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  kind: text('kind').$type<'expense' | 'income'>().notNull(),
  parentId: integer('parent_id'),
  icon: text('icon').notNull().default('circle'),
  color: text('color').notNull().default('#94a3b8'),
  archived: boolean('archived').notNull().default(false),
  sort: integer('sort').notNull().default(0),
});

export const people = pgTable('people', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  role: text('role').$type<'roommate' | 'food'>().notNull(),
  paidBy: text('paid_by'),
  sheetColumn: text('sheet_column'),
  aliases: text('aliases').array().notNull().default(sql`'{}'::text[]`),
  active: boolean('active').notNull().default(true),
  sort: integer('sort').notNull().default(0),
});

export const periods = pgTable('periods', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  fromDate: date('from_date').notNull(),
  toDate: date('to_date').notNull(),
  status: text('status').$type<'open' | 'closed'>().notNull().default('open'),
  rentTotal: money('rent_total'),
  /** Nợ cũ sửa tay (ghi đè giá trị tự lấy từ đợt trước), kèm lý do. */
  carriedOverride: jsonb('carried_override').$type<Record<string, { amount: number; reason: string }>>().notNull().default({}),
  /** Ảnh chụp kết quả quyết toán lúc chốt. */
  snapshot: jsonb('snapshot'),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  note: text('note'),
  createdAt: created(),
});

export const importBatches = pgTable('import_batches', {
  id: serial('id').primaryKey(),
  source: text('source').notNull(), // 'upload' | 'api'
  filename: text('filename'),
  checksum: text('checksum').notNull(),
  version: integer('version').notNull(),
  periodId: integer('period_id'),
  stats: jsonb('stats').notNull(), // { added, updated, skipped, locked }
  checks: jsonb('checks').notNull(),
  reconciliation: jsonb('reconciliation'),
  createdAt: created(),
});

export const transactions = pgTable(
  'transactions',
  {
    id: serial('id').primaryKey(),
    extId: text('ext_id').unique(),
    accountId: integer('account_id'),
    occurredAt: timestamp('occurred_at', { mode: 'string' }).notNull(),
    amount: money('amount').notNull(), // luôn dương
    direction: text('direction').$type<'in' | 'out'>().notNull(),
    /** Sau khi duyệt: expense | split | income | settlement | loan | transfer | ignore */
    kind: text('kind'),
    categoryId: integer('category_id'),
    scope: text('scope').$type<Scope>(),
    title: text('title'), // tên ngắn người dùng đặt
    counterparty: text('counterparty'),
    counterpartyAccount: text('counterparty_account'),
    counterpartyBank: text('counterparty_bank'),
    rawContent: text('raw_content').notNull().default(''),
    note: text('note'),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    status: text('status').$type<'pending' | 'approved'>().notNull().default('pending'),
    suggestion: jsonb('suggestion').$type<Suggestion>(),
    confidence: text('confidence').$type<Confidence>().notNull().default('nghi'),
    question: text('question'),
    answer: text('answer'),
    pairExtId: text('pair_ext_id'),
    ruleId: integer('rule_id'),
    /** Người liên quan (trả nợ / cho vay). */
    person: text('person'),
    /** Ví đích khi chuyển tiền giữa các ví. */
    toAccountId: integer('to_account_id'),
    loanId: integer('loan_id'),
    periodId: integer('period_id'),
    batchId: integer('batch_id'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    approvedBy: text('approved_by'), // 'manual' | 'auto' | 'rule' | 'bulk'
    createdAt: created(),
  },
  (t) => [index('tx_occurred').on(t.occurredAt), index('tx_status').on(t.status), index('tx_period').on(t.periodId)],
);

export const splits = pgTable('splits', {
  id: serial('id').primaryKey(),
  transactionId: integer('transaction_id').unique(), // null: bill tiền mặt / bill người khác trả
  periodId: integer('period_id').notNull(),
  title: text('title').notNull(),
  occurredAt: timestamp('occurred_at', { mode: 'string' }).notNull(),
  isRent: boolean('is_rent').notNull().default(false),
  config: jsonb('config').$type<SplitConfig>().notNull(),
  result: jsonb('result').$type<SplitResult>().notNull(),
  categoryId: integer('category_id'),
  note: text('note'),
  createdAt: created(),
});

/** Tiền người khác trả cho Quang (gắn giao dịch "vào" hoặc ghi tay khi trả tiền mặt). */
export const settlements = pgTable('settlements', {
  id: serial('id').primaryKey(),
  periodId: integer('period_id').notNull(),
  person: text('person').notNull(),
  amount: money('amount').notNull(),
  transactionId: integer('transaction_id').unique(),
  paidAt: timestamp('paid_at', { mode: 'string' }).notNull(),
  note: text('note'),
  createdAt: created(),
});

export const loans = pgTable('loans', {
  id: serial('id').primaryKey(),
  person: text('person').notNull(), // mã người trong phòng hoặc tên tự do
  direction: text('direction').$type<'lend' | 'borrow'>().notNull(),
  amount: money('amount').notNull(),
  startedAt: date('started_at').notNull(),
  dueAt: date('due_at'),
  /** Tính vào quyết toán đợt (cột "Riêng (cho mượn)"). */
  periodId: integer('period_id'),
  note: text('note'),
  closed: boolean('closed').notNull().default(false),
  createdAt: created(),
});

export const loanPayments = pgTable('loan_payments', {
  id: serial('id').primaryKey(),
  loanId: integer('loan_id').notNull(),
  amount: money('amount').notNull(),
  paidAt: date('paid_at').notNull(),
  transactionId: integer('transaction_id'),
  note: text('note'),
});

export const budgets = pgTable(
  'budgets',
  {
    id: serial('id').primaryKey(),
    categoryId: integer('category_id'), // null = tổng chi
    month: text('month').notNull(), // 'YYYY-MM' hoặc '*' (mọi tháng)
    amount: money('amount').notNull(),
    rollover: boolean('rollover').notNull().default(false),
    /** Chỉ tính phần của Quang (Riêng + phần Chung + Nhà) hay cả bill. */
    basis: text('basis').$type<'mine' | 'gross'>().notNull().default('mine'),
  },
  (t) => [uniqueIndex('budget_cat_month').on(t.categoryId, t.month)],
);

export const recurring = pgTable('recurring', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  amount: money('amount').notNull(),
  direction: text('direction').$type<'in' | 'out'>().notNull().default('out'),
  frequency: text('frequency').$type<'monthly' | 'weekly' | 'yearly'>().notNull(),
  dayOfPeriod: integer('day_of_period').notNull().default(1),
  startDate: date('start_date').notNull(),
  endDate: date('end_date'),
  accountId: integer('account_id'),
  categoryId: integer('category_id'),
  /** Mẫu khớp giao dịch thật: đối tác chứa…, sai số tiền %, sai ngày. */
  matchCounterparty: text('match_counterparty'),
  tolerancePct: integer('tolerance_pct').notNull().default(10),
  toleranceDays: integer('tolerance_days').notNull().default(5),
  suggestion: jsonb('suggestion').$type<Suggestion>(),
  active: boolean('active').notNull().default(true),
});

export const rules = pgTable('rules', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  priority: integer('priority').notNull().default(0),
  match: jsonb('match').$type<RuleMatch>().notNull(),
  action: jsonb('action').$type<Suggestion>().notNull(),
  hits: integer('hits').notNull().default(0),
  confirmations: integer('confirmations').notNull().default(0),
  overrides: integer('overrides').notNull().default(0),
  createdAt: created(),
});

/** Nhật ký học: mỗi lần duyệt, gợi ý ban đầu → quyết định cuối. */
export const decisions = pgTable(
  'decisions',
  {
    id: serial('id').primaryKey(),
    transactionId: integer('transaction_id').notNull(),
    extId: text('ext_id'),
    counterparty: text('counterparty'),
    rawContent: text('raw_content'),
    amount: money('amount').notNull(),
    suggested: jsonb('suggested'),
    final: jsonb('final').notNull(),
    question: text('question'),
    answer: text('answer'),
    changed: boolean('changed').notNull(),
    by: text('by').notNull(), // 'manual' | 'auto' | 'rule' | 'bulk'
    ruleId: integer('rule_id'),
    createdAt: created(),
  },
  (t) => [index('decision_tx').on(t.transactionId)],
);
