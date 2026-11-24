import { useEffect, useState } from 'react';
import { HelpCircle } from 'lucide-react';
import type { Meta, TxRow } from '../lib/api';
import { vnd } from '../lib/format';
import { SplitEditor, type SplitCfg } from './SplitEditor';
import { Checkbox, Field, Input, Segmented, Select, Textarea, cx } from './ui';

export type Action = 'expense' | 'split' | 'income' | 'settlement' | 'loan' | 'transfer' | 'ignore';

export interface DecisionState {
  action: Action;
  scope: 'Rieng' | 'Chung' | 'Nha';
  categoryId: number | null;
  split: SplitCfg;
  isRent: boolean;
  person: string;
  loanDirection: 'lend' | 'borrow' | 'repay_in' | 'repay_out';
  toAccount: string;
  reason: string;
  title: string;
  note: string;
  answer: string;
  createRule: boolean;
}

const OUT_ACTIONS: { value: Action; label: string }[] = [
  { value: 'expense', label: 'Chi tiêu' },
  { value: 'split', label: 'Chia tiền' },
  { value: 'loan', label: 'Cho vay / trả nợ' },
  { value: 'transfer', label: 'Chuyển ví' },
  { value: 'ignore', label: 'Bỏ qua' },
];
const IN_ACTIONS: { value: Action; label: string }[] = [
  { value: 'settlement', label: 'Bạn phòng trả' },
  { value: 'income', label: 'Thu nhập' },
  { value: 'loan', label: 'Vay / thu nợ' },
  { value: 'transfer', label: 'Chuyển ví' },
  { value: 'ignore', label: 'Bỏ qua' },
];

/** Trạng thái ban đầu: từ quyết định đã duyệt, nếu chưa thì từ gợi ý. */
export function initialDecision(tx: TxRow, meta: Meta): DecisionState {
  const s = tx.status === 'approved' ? approvedAsSuggestion(tx) : (tx.suggestion ?? {});
  const catId = tx.categoryId ?? meta.categories.find((c) => c.name === s.category)?.id ?? null;
  const room = meta.people.filter((p) => p.role === 'roommate' && p.active).map((p) => p.code);
  const action: Action = s.action ?? (tx.direction === 'out' ? 'expense' : 'income');
  return {
    action,
    scope: s.scope ?? 'Rieng',
    categoryId: catId,
    split: s.split ?? { mode: 'equal', people: room },
    isRent: !!s.isRent,
    person: s.person ?? tx.person ?? '',
    loanDirection: s.direction ?? (tx.direction === 'out' ? 'lend' : 'repay_in'),
    toAccount: s.toAccount ?? (tx.toAccountId ? String(tx.toAccountId) : ''),
    reason: s.reason ?? '',
    title: tx.title ?? '',
    note: tx.note ?? '',
    answer: tx.answer ?? '',
    createRule: false,
  };
}

function approvedAsSuggestion(tx: TxRow): any {
  switch (tx.kind) {
    case 'split': {
      const { total: _t, ...split } = tx.split?.config ?? { mode: 'equal' };
      return { action: 'split', split, isRent: tx.split?.isRent };
    }
    case 'expense':
      return { action: 'expense', scope: tx.scope };
    case 'settlement':
      return { action: 'settlement', person: tx.person };
    case 'loan':
      return { action: 'loan', person: tx.person, direction: tx.suggestion?.direction };
    case 'transfer':
      return { action: 'transfer', toAccount: tx.toAccountId ? String(tx.toAccountId) : '' };
    default:
      return { action: tx.kind ?? 'ignore', reason: tx.suggestion?.reason };
  }
}

/** Chuyển trạng thái form thành body gửi API approve. */
export function toDecision(d: DecisionState, meta: Meta) {
  const cat = meta.categories.find((c) => c.id === d.categoryId);
  const common = { categoryId: d.categoryId, title: d.title || null, note: d.note || null, answer: d.answer || null, createRule: d.createRule };
  switch (d.action) {
    case 'expense':
      return { ...common, action: 'expense', scope: d.scope, category: cat?.name };
    case 'split':
      return { ...common, action: 'split', split: d.split, isRent: d.isRent || d.split.mode === 'rent', category: cat?.name };
    case 'income':
      return { ...common, action: 'income', category: cat?.name };
    case 'settlement':
      return { ...common, action: 'settlement', person: d.person };
    case 'loan':
      return { ...common, action: 'loan', person: d.person, direction: d.loanDirection };
    case 'transfer':
      return { ...common, action: 'transfer', toAccount: d.toAccount || undefined };
    case 'ignore':
      return { ...common, action: 'ignore', reason: d.reason || undefined };
  }
}

export function DecisionEditor({ tx, meta, value, onChange }: { tx: TxRow; meta: Meta; value: DecisionState; onChange: (d: DecisionState) => void }) {
  const set = (p: Partial<DecisionState>) => onChange({ ...value, ...p });
  const actions = tx.direction === 'out' ? OUT_ACTIONS : IN_ACTIONS;
  const cats = meta.categories.filter((c) => !c.archived && c.kind === (value.action === 'income' ? 'income' : 'expense'));
  const others = meta.people.filter((p) => p.active && p.code !== meta.settings.hub);

  useEffect(() => {
    if (!actions.some((a) => a.value === value.action)) set({ action: actions[0].value });
  }, [tx.id]);

  const needsCategory = value.action === 'expense' || value.action === 'split' || value.action === 'income';

  return (
    <div className="space-y-4">
      {tx.question && (
        <div className="flex gap-2 rounded-lg bg-warn-soft p-3 text-sm text-warn">
          <HelpCircle className="mt-0.5 size-4 shrink-0" />
          <div className="flex-1 space-y-2">
            <p className="font-medium">{tx.question}</p>
            <Input placeholder="Trả lời (lưu lại để Claude học)" value={value.answer} onChange={(e) => set({ answer: e.target.value })} className="text-fg" />
          </div>
        </div>
      )}

      <div>
        <p className="mb-1.5 text-sm font-medium">Đây là khoản gì?</p>
        <Segmented value={value.action} onChange={(action) => set({ action })} options={actions} />
      </div>

      {value.action === 'expense' && (
        <div>
          <p className="mb-1.5 text-sm font-medium">Của ai?</p>
          <Segmented
            value={value.scope}
            onChange={(scope) => set({ scope })}
            options={[
              { value: 'Rieng', label: 'Riêng tôi' },
              { value: 'Chung', label: 'Chung (không chia)' },
              { value: 'Nha', label: 'Nhà' },
            ]}
            size="sm"
          />
          <p className="mt-1 text-xs text-muted">Muốn người khác trả lại thì chọn "Chia tiền".</p>
        </div>
      )}

      {needsCategory && (
        <Field label="Danh mục">
          <div className="flex flex-wrap gap-1.5">
            {cats.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => set({ categoryId: c.id })}
                className={cx('rounded-full border px-2.5 py-1 text-xs font-medium', value.categoryId === c.id ? 'border-transparent text-white' : 'border-line text-muted hover:text-fg')}
                style={value.categoryId === c.id ? { background: c.color } : undefined}
              >
                {c.name}
              </button>
            ))}
          </div>
        </Field>
      )}

      {value.action === 'split' && (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            Chia <span className="num">{vnd(tx.amount)} đ</span>
          </p>
          <SplitEditor value={value.split} onChange={(split) => set({ split, isRent: split.mode === 'rent' })} total={tx.amount} meta={meta} />
        </div>
      )}

      {(value.action === 'settlement' || value.action === 'loan') && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={value.action === 'settlement' ? 'Ai trả?' : 'Với ai?'}>
            <Select value={value.person} onChange={(e) => set({ person: e.target.value })}>
              <option value="">Chọn người…</option>
              {others.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          {value.action === 'loan' && (
            <Field label="Loại" hint="Cho bạn phòng mượn thì được cộng vào cột 'Riêng (cho mượn)' của đợt.">
              <Select value={value.loanDirection} onChange={(e) => set({ loanDirection: e.target.value as any })}>
                {tx.direction === 'out' ? (
                  <>
                    <option value="lend">Cho mượn</option>
                    <option value="repay_out">Trả nợ người ta</option>
                  </>
                ) : (
                  <>
                    <option value="repay_in">Người ta trả nợ tôi</option>
                    <option value="borrow">Tôi đi vay</option>
                  </>
                )}
              </Select>
            </Field>
          )}
        </div>
      )}

      {value.action === 'transfer' && (
        <Field label={tx.direction === 'out' ? 'Chuyển sang ví' : 'Từ ví'} hint="Chuyển giữa các ví của bạn không tính là chi tiêu.">
          <Select value={value.toAccount} onChange={(e) => set({ toAccount: e.target.value })}>
            <option value="">Ví ngoài app / không theo dõi</option>
            {meta.accounts
              .filter((a) => a.id !== tx.accountId)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </Select>
        </Field>
      )}

      {value.action === 'ignore' && (
        <Field label="Lý do" hint="Ví dụ: chuyển giữa tài khoản của tôi, hoàn tiền, trả sao kê thẻ.">
          <Input value={value.reason} onChange={(e) => set({ reason: e.target.value })} />
        </Field>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tên ngắn" hint="Hiện trong danh sách và trên sheet">
          <Input value={value.title} placeholder={tx.counterparty ?? ''} onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <Field label="Ghi chú">
          <Textarea rows={1} value={value.note} onChange={(e) => set({ note: e.target.value })} />
        </Field>
      </div>

      {(tx.counterpartyAccount || (tx.counterparty && tx.counterparty !== 'GRAB')) && (
        <Checkbox
          checked={value.createRule}
          onChange={(createRule) => set({ createRule })}
          label={
            <span>
              Nhớ cách xử lý này cho <b>{tx.counterparty ?? tx.counterpartyAccount}</b> (tạo quy tắc)
            </span>
          }
        />
      )}
    </div>
  );
}
