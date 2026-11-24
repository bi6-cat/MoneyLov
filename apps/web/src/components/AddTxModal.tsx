import { useEffect, useMemo, useState } from 'react';
import { api, useAction, type Meta, type TxRow } from '../lib/api';
import { todayIso } from '../lib/format';
import { DecisionEditor, initialDecision, toDecision, type DecisionState } from './DecisionEditor';
import { Button, ErrorBox, Field, Input, Modal, MoneyInput, Segmented, Select, useToast } from './ui';

/** Thêm giao dịch tay: tiền mặt, ví điện tử, hoặc khoản sao kê chưa nạp. */
export function AddTxModal({ open, onClose, meta }: { open: boolean; onClose: () => void; meta: Meta }) {
  const cash = meta.accounts.find((a) => a.type === 'cash') ?? meta.accounts[0];
  const [accountId, setAccountId] = useState<number>(cash?.id ?? 0);
  const [direction, setDirection] = useState<'out' | 'in'>('out');
  const [amount, setAmount] = useState<number | null>(null);
  const [when, setWhen] = useState(todayIso());
  const [counterparty, setCounterparty] = useState('');
  const toast = useToast();

  const fake: TxRow = useMemo(
    () => ({
      id: -1,
      extId: null,
      accountId,
      occurredAt: when,
      amount: amount ?? 0,
      direction,
      kind: null,
      categoryId: null,
      scope: null,
      title: null,
      counterparty: counterparty || null,
      counterpartyAccount: null,
      counterpartyBank: null,
      rawContent: '',
      note: null,
      tags: [],
      status: 'pending',
      suggestion: null,
      confidence: 'chac',
      question: null,
      answer: null,
      pairExtId: null,
      ruleId: null,
      person: null,
      toAccountId: null,
      periodId: null,
      approvedBy: null,
    }),
    [accountId, when, amount, direction, counterparty],
  );
  const [d, setD] = useState<DecisionState>(() => initialDecision(fake, meta));
  useEffect(() => {
    if (open) {
      setAmount(null);
      setWhen(todayIso());
      setCounterparty('');
      setD(initialDecision({ ...fake, direction: 'out' }, meta));
      setDirection('out');
    }
  }, [open]);
  useEffect(() => setD((x) => ({ ...x, action: direction === 'out' ? 'expense' : 'income' })), [direction]);

  const save = useAction(
    () =>
      api('/transactions', {
        body: { accountId, occurredAt: when, amount, direction, counterparty: counterparty || null, title: d.title || counterparty || null, note: d.note || null, decision: toDecision(d, meta) },
      }),
    {
      onSuccess: () => {
        toast('Đã thêm giao dịch');
        onClose();
      },
    },
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Thêm giao dịch"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button variant="primary" disabled={!amount || !accountId} loading={save.isPending} onClick={() => save.mutate(undefined)}>
            Lưu
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Segmented
          value={direction}
          onChange={setDirection}
          options={[
            { value: 'out', label: 'Tiền ra' },
            { value: 'in', label: 'Tiền vào' },
          ]}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Số tiền" hint='Gõ "455k", "1,5tr" hoặc "455.091"'>
            <MoneyInput autoFocus value={amount} onChange={setAmount} className="h-11 text-lg" />
          </Field>
          <Field label="Ví">
            <Select value={accountId} onChange={(e) => setAccountId(Number(e.target.value))} className="h-11">
              {meta.accounts
                .filter((a) => !a.archived)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Thời gian">
            <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </Field>
          <Field label={direction === 'out' ? 'Trả cho' : 'Nhận từ'}>
            <Input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder="Cửa hàng, người…" />
          </Field>
        </div>
        {amount ? <DecisionEditor tx={fake} meta={meta} value={d} onChange={setD} /> : <p className="text-sm text-muted">Nhập số tiền để chọn cách xử lý.</p>}
        {save.error && <ErrorBox error={save.error} />}
      </div>
    </Modal>
  );
}
