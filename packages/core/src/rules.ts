import { normalizeText } from './money';
import { checkImport, parseV1 } from './importV1';
import type { ImportedTx, ParsedImport, Suggestion } from './types';

export interface RuleMatch {
  counterparty?: string; // chứa (không dấu, không phân biệt hoa thường)
  counterpartyAccount?: string; // bằng
  content?: string; // regex trên nội dung gốc (không dấu)
  source?: string; // 'MB', 'Card 8508'…
  direction?: 'in' | 'out';
  minAmount?: number;
  maxAmount?: number;
}

export interface Rule {
  id: number | string;
  name: string;
  enabled: boolean;
  priority: number;
  match: RuleMatch;
  action: Suggestion;
  confirmations: number;
}

export interface TxLike {
  counterparty: string | null;
  counterpartyAccount: string | null;
  rawContent: string;
  source: string;
  direction: 'in' | 'out';
  amount: number;
}

export function ruleMatches(r: Rule, t: TxLike): boolean {
  const m = r.match;
  if (!r.enabled) return false;
  const keys = Object.keys(m).filter((k) => (m as any)[k] !== undefined && (m as any)[k] !== '');
  if (!keys.length) return false;
  if (m.counterparty && !normalizeText(t.counterparty).includes(normalizeText(m.counterparty))) return false;
  if (m.counterpartyAccount && (t.counterpartyAccount ?? '') !== m.counterpartyAccount) return false;
  if (m.source && t.source !== m.source) return false;
  if (m.direction && t.direction !== m.direction) return false;
  if (m.minAmount != null && t.amount < m.minAmount) return false;
  if (m.maxAmount != null && t.amount > m.maxAmount) return false;
  if (m.content) {
    try {
      if (!new RegExp(m.content, 'i').test(normalizeText(t.rawContent))) return false;
    } catch {
      return false;
    }
  }
  return true;
}

export function findRule(rules: Rule[], t: TxLike): Rule | null {
  return [...rules].sort((a, b) => b.priority - a.priority).find((r) => ruleMatches(r, t)) ?? null;
}

/** Gợi ý một quy tắc từ giao dịch người dùng vừa duyệt. */
export function proposeRule(t: TxLike, action: Suggestion): Omit<Rule, 'id'> | null {
  if (t.counterpartyAccount) {
    return { name: `${t.counterparty ?? t.counterpartyAccount}`, enabled: true, priority: 10, match: { counterpartyAccount: t.counterpartyAccount, direction: t.direction }, action, confirmations: 1 };
  }
  if (t.counterparty && normalizeText(t.counterparty) !== 'grab') {
    return { name: t.counterparty, enabled: true, priority: 5, match: { counterparty: t.counterparty, direction: t.direction }, action, confirmations: 1 };
  }
  return null;
}

export interface AutoApproveOptions {
  /** Quy tắc cần được xác nhận ít nhất bấy nhiêu lần để tự duyệt. */
  minConfirmations: number;
}

/** Gợi ý đã đủ thông tin để duyệt luôn chưa? */
export function suggestionComplete(s: Suggestion, roommateCount = 4): boolean {
  switch (s.action) {
    case 'ignore':
    case 'transfer':
    case 'income':
      return true;
    case 'expense':
      return !!s.scope;
    case 'settlement':
    case 'loan':
      return !!s.person;
    case 'split': {
      const c = s.split;
      if (c.mode === 'rent') return roommateCount > 0;
      if (c.mode === 'equal') return (c.people?.length ?? 0) > 0 || (c.covers ?? []).some((x) => x.full);
      if (c.mode === 'exact') return Object.keys(c.amounts ?? {}).length > 0;
      if (c.mode === 'percent') return Object.keys(c.percents ?? {}).length > 0;
      if (c.mode === 'shares') return Object.keys(c.weights ?? {}).length > 0;
      if (c.mode === 'items') return (c.items ?? []).length > 0 && (c.items ?? []).every((i) => i.people.length > 0);
      return false;
    }
  }
}

export interface AutoApproveCandidate {
  confidence: 'chac' | 'nghi';
  question: string | null;
  suggestion: Suggestion;
  ruleConfirmations?: number | null;
}

export function canAutoApprove(c: AutoApproveCandidate, opt: AutoApproveOptions): { ok: boolean; reason: string } {
  if (c.question) return { ok: false, reason: 'Còn câu hỏi cần trả lời' };
  if (!suggestionComplete(c.suggestion)) return { ok: false, reason: 'Gợi ý chưa đủ thông tin' };
  if (c.confidence === 'chac') return { ok: true, reason: 'File nạp đánh dấu chắc chắn' };
  if ((c.ruleConfirmations ?? 0) >= opt.minConfirmations) return { ok: true, reason: `Khớp quy tắc đã xác nhận ${c.ruleConfirmations} lần` };
  return { ok: false, reason: 'Độ tin cậy thấp' };
}

/* ---------- Định dạng nạp v2 ---------- */

/** v2: giao dịch đã chuẩn hoá, tiền tính bằng đồng. Xem docs/import-schema.md. */
export function parseV2(json: any): ParsedImport {
  const transactions: ImportedTx[] = (json.transactions ?? []).map((t: any) => ({
    extId: String(t.ext_id),
    occurredAt: String(t.occurred_at).slice(0, 16),
    amount: Math.round(Number(t.amount)),
    direction: t.direction === 'in' ? 'in' : 'out',
    source: t.source,
    rawContent: t.raw_content ?? '',
    counterparty: t.counterparty ?? null,
    counterpartyAccount: t.counterparty_account ?? null,
    counterpartyBank: t.counterparty_bank ?? null,
    suggestion: t.suggestion ?? { action: 'expense' },
    confidence: t.confidence === 'chac' ? 'chac' : 'nghi',
    question: t.question ?? null,
    pairExtId: t.pair_ext_id ?? null,
  }));
  const p = json.period;
  const r = json.reconciliation;
  // Dùng chung tên khoá với v1 (đơn vị đã là đồng) để checkImport kiểm tra giống nhau.
  const rec = r
    ? Object.fromEntries(
        Object.entries({
          so_du_dau_k: r.opening_balance,
          so_du_cuoi_k: r.closing_balance,
          so_dong_sao_ke: r.bank_rows,
          so_email_the: r.card_rows,
          tong_ra_sao_ke_k: r.bank_out,
          tong_vao_sao_ke_k: r.bank_in,
        }).filter(([, v]) => v != null),
      ) as Record<string, number>
    : null;
  return {
    version: 2,
    period: p ? { name: p.name, from: p.from, to: p.to, rentTotal: p.rent_total ?? null, carried: p.carried ?? {} } : null,
    transactions,
    reconciliation: rec,
    checks: checkImport(transactions, rec),
  };
}

export function parseImport(json: any): ParsedImport {
  if (json?.phien_ban === 1 || Array.isArray(json?.giao_dich)) return parseV1(json);
  if (json?.version === 2) return parseV2(json);
  throw new Error('Không nhận ra định dạng file nạp (cần phien_ban 1 hoặc version 2).');
}
