import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api, useAction, useApi, type Meta } from '../lib/api';
import { ddmm, vnd } from '../lib/format';
import { Badge, Button, Card, CardHeader, Checkbox, Empty, ErrorBox, Field, IconButton, Input, Modal, Money, MoneyInput, PageHeader, Segmented, Select, Spinner, Textarea } from '../components/ui';

export default function Plans({ meta }: { meta: Meta }) {
  const [tab, setTab] = useState<'recurring' | 'loans'>('recurring');
  return (
    <div>
      <PageHeader title="Định kỳ & nợ" />
      <Segmented
        className="mb-4"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'recurring', label: 'Khoản định kỳ' },
          { value: 'loans', label: 'Vay & cho vay' },
        ]}
      />
      {tab === 'recurring' ? <Recurring meta={meta} /> : <Loans meta={meta} />}
    </div>
  );
}

const FREQ = { monthly: 'Hằng tháng', weekly: 'Hằng tuần', yearly: 'Hằng năm' } as const;

function Recurring({ meta }: { meta: Meta }) {
  const q = useApi<any>(['recurring'], '/recurring');
  const [edit, setEdit] = useState<any>(null);
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Lịch sắp tới" sub="Tự khớp với giao dịch đã nhập theo đối tác, số tiền và ngày" />
        <ul className="divide-y divide-line px-4 pb-2">
          {q.data.upcoming.map((u: any, i: number) => (
            <li key={i} className="flex items-center gap-3 py-2.5 text-sm">
              <span className="w-12 text-muted">{ddmm(u.due)}</span>
              <span className="flex-1">{u.recurring.name}</span>
              <Badge tone={u.status === 'paid' ? 'ok' : u.status === 'overdue' ? 'danger' : 'neutral'}>{u.status === 'paid' ? `Đã trả ${ddmm(u.match.occurredAt)}` : u.status === 'overdue' ? 'Chưa thấy giao dịch' : 'Sắp tới'}</Badge>
              <Money value={u.recurring.amount} />
            </li>
          ))}
          {!q.data.upcoming.length && <li className="py-3 text-sm text-muted">Không có kỳ nào trong thời gian tới.</li>}
        </ul>
      </Card>
      <Card>
        <CardHeader
          title="Danh sách"
          right={
            <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEdit({ name: '', amount: null, frequency: 'monthly', dayOfPeriod: 1, startDate: new Date().toISOString().slice(0, 10), direction: 'out', tolerancePct: 10, toleranceDays: 5, active: true })}>
              Thêm
            </Button>
          }
        />
        <ul className="divide-y divide-line px-4 pb-2">
          {q.data.items.map((r: any) => (
            <li key={r.id}>
              <button className="flex w-full items-center gap-3 py-2.5 text-left text-sm" onClick={() => setEdit(r)}>
                <span className="flex-1">
                  <span className="font-medium">{r.name}</span>
                  <span className="block text-xs text-muted">
                    {FREQ[r.frequency as keyof typeof FREQ]} · ngày {r.dayOfPeriod}
                    {r.matchCounterparty && ` · khớp "${r.matchCounterparty}"`}
                  </span>
                </span>
                {!r.active && <Badge>Tạm dừng</Badge>}
                <Money value={r.amount} />
              </button>
            </li>
          ))}
        </ul>
      </Card>
      {edit && <RecurringModal value={edit} meta={meta} onClose={() => setEdit(null)} />}
    </div>
  );
}

function RecurringModal({ value, meta, onClose }: { value: any; meta: Meta; onClose: () => void }) {
  const [v, setV] = useState(value);
  const set = (p: any) => setV({ ...v, ...p });
  const body = { name: v.name, amount: v.amount, direction: v.direction, frequency: v.frequency, dayOfPeriod: Number(v.dayOfPeriod), startDate: v.startDate, endDate: v.endDate || null, categoryId: v.categoryId ?? null, accountId: v.accountId ?? null, matchCounterparty: v.matchCounterparty || null, tolerancePct: Number(v.tolerancePct), toleranceDays: Number(v.toleranceDays), active: v.active };
  const save = useAction(() => (v.id ? api(`/recurring/${v.id}`, { method: 'PATCH', body }) : api('/recurring', { body })), { onSuccess: onClose });
  const del = useAction(() => api(`/recurring/${v.id}`, { method: 'DELETE' }), { onSuccess: onClose });
  return (
    <Modal
      open
      onClose={onClose}
      title={v.id ? 'Sửa khoản định kỳ' : 'Khoản định kỳ mới'}
      footer={
        <>
          {v.id && (
            <Button variant="ghost" className="mr-auto text-danger" onClick={() => del.mutate(undefined)}>
              Xoá
            </Button>
          )}
          <Button variant="primary" disabled={!v.name || !v.amount} loading={save.isPending} onClick={() => save.mutate(undefined)}>
            Lưu
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tên" className="sm:col-span-2">
          <Input value={v.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Số tiền dự kiến">
          <MoneyInput value={v.amount} onChange={(amount) => set({ amount })} />
        </Field>
        <Field label="Lặp lại">
          <Select value={v.frequency} onChange={(e) => set({ frequency: e.target.value })}>
            {Object.entries(FREQ).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Ngày trong tháng">
          <Input type="number" min={1} max={31} value={v.dayOfPeriod} onChange={(e) => set({ dayOfPeriod: e.target.value })} />
        </Field>
        <Field label="Bắt đầu">
          <Input type="date" value={v.startDate} onChange={(e) => set({ startDate: e.target.value })} />
        </Field>
        <Field label="Danh mục">
          <Select value={v.categoryId ?? ''} onChange={(e) => set({ categoryId: e.target.value ? Number(e.target.value) : null })}>
            <option value="">—</option>
            {meta.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Khớp đối tác chứa" hint="Ví dụ ANTHROPIC, YouTube">
          <Input value={v.matchCounterparty ?? ''} onChange={(e) => set({ matchCounterparty: e.target.value })} />
        </Field>
        <Field label="Sai số tiền (%)">
          <Input type="number" value={v.tolerancePct} onChange={(e) => set({ tolerancePct: e.target.value })} />
        </Field>
        <Field label="Sai số ngày">
          <Input type="number" value={v.toleranceDays} onChange={(e) => set({ toleranceDays: e.target.value })} />
        </Field>
        <Checkbox checked={v.active} onChange={(active) => set({ active })} label="Đang dùng" />
        {save.error && <ErrorBox error={save.error} />}
      </div>
    </Modal>
  );
}

function Loans({ meta }: { meta: Meta }) {
  const q = useApi<any[]>(['loans'], '/loans');
  const [adding, setAdding] = useState(false);
  const [pay, setPay] = useState<any>(null);
  const del = useAction((id: number) => api(`/loans/${id}`, { method: 'DELETE' }));
  const name = (c: string) => meta.people.find((p) => p.code === c)?.name ?? c;
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const open = q.data!.filter((l) => !l.closed);
  const lend = open.filter((l) => l.direction === 'lend').reduce((a, l) => a + l.remaining, 0);
  const borrow = open.filter((l) => l.direction === 'borrow').reduce((a, l) => a + l.remaining, 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted">Người khác còn nợ tôi</p>
          <p className="num text-xl font-semibold">{vnd(lend)} đ</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted">Tôi còn nợ</p>
          <p className="num text-xl font-semibold">{vnd(borrow)} đ</p>
        </Card>
      </div>
      <Card>
        <CardHeader
          title="Sổ vay"
          sub="Khoản tạo từ giao dịch được thêm khi bạn duyệt ở chế độ Vay/cho vay"
          right={
            <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
              Ghi tay
            </Button>
          }
        />
        {!q.data!.length ? (
          <Empty title="Chưa có khoản vay nào" />
        ) : (
          <ul className="divide-y divide-line px-4 pb-2">
            {q.data!.map((l) => (
              <li key={l.id} className="flex items-center gap-3 py-3 text-sm">
                <div className="flex-1">
                  <p className="font-medium">
                    {l.direction === 'lend' ? `Cho ${name(l.person)} mượn` : `Vay ${name(l.person)}`}
                    {l.closed && (
                      <Badge tone="ok" className="ml-2">
                        Đã xong
                      </Badge>
                    )}
                    {l.periodId && <Badge className="ml-2">Tính vào đợt</Badge>}
                  </p>
                  <p className="text-xs text-muted">
                    {ddmm(l.startedAt)}/{l.startedAt.slice(0, 4)} · đã trả {vnd(l.paid)} / {vnd(l.amount)}
                    {l.dueAt && ` · hạn ${ddmm(l.dueAt)}`}
                    {l.note && !l.note.startsWith('tx:') && ` · ${l.note}`}
                  </p>
                </div>
                <span className="num font-medium">{vnd(l.remaining)}</span>
                {!l.closed && (
                  <Button size="sm" onClick={() => setPay(l)}>
                    Ghi trả
                  </Button>
                )}
                {!l.note?.startsWith('tx:') && (
                  <IconButton label="Xoá" onClick={() => del.mutate(l.id)}>
                    <Trash2 className="size-4" />
                  </IconButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {adding && <LoanModal meta={meta} onClose={() => setAdding(false)} />}
      {pay && <PayLoan loan={pay} onClose={() => setPay(null)} />}
    </div>
  );
}

function LoanModal({ meta, onClose }: { meta: Meta; onClose: () => void }) {
  const [v, setV] = useState({ person: '', direction: 'lend', amount: null as number | null, startedAt: new Date().toISOString().slice(0, 10), dueAt: '', note: '' });
  const save = useAction(() => api('/loans', { body: { ...v, dueAt: v.dueAt || null, note: v.note || null } }), { onSuccess: onClose });
  return (
    <Modal
      open
      onClose={onClose}
      title="Ghi khoản vay"
      footer={
        <Button variant="primary" disabled={!v.person || !v.amount} loading={save.isPending} onClick={() => save.mutate(undefined)}>
          Lưu
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Segmented
          className="sm:col-span-2"
          value={v.direction}
          onChange={(direction) => setV({ ...v, direction })}
          options={[
            { value: 'lend', label: 'Tôi cho vay' },
            { value: 'borrow', label: 'Tôi đi vay' },
          ]}
        />
        <Field label="Người" hint="Chọn bạn phòng hoặc gõ tên">
          <Input list="loan-people" value={v.person} onChange={(e) => setV({ ...v, person: e.target.value })} />
          <datalist id="loan-people">
            {meta.people.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </datalist>
        </Field>
        <Field label="Số tiền">
          <MoneyInput value={v.amount} onChange={(amount) => setV({ ...v, amount })} />
        </Field>
        <Field label="Ngày">
          <Input type="date" value={v.startedAt} onChange={(e) => setV({ ...v, startedAt: e.target.value })} />
        </Field>
        <Field label="Hạn trả">
          <Input type="date" value={v.dueAt} onChange={(e) => setV({ ...v, dueAt: e.target.value })} />
        </Field>
        <Field label="Ghi chú" className="sm:col-span-2">
          <Textarea value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} />
        </Field>
        {save.error && <ErrorBox error={save.error} />}
      </div>
    </Modal>
  );
}

function PayLoan({ loan, onClose }: { loan: any; onClose: () => void }) {
  const [amount, setAmount] = useState<number | null>(loan.remaining);
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const save = useAction(() => api(`/loans/${loan.id}/payments`, { body: { amount, paidAt } }), { onSuccess: onClose });
  return (
    <Modal
      open
      onClose={onClose}
      title="Ghi khoản trả"
      footer={
        <Button variant="primary" disabled={!amount} loading={save.isPending} onClick={() => save.mutate(undefined)}>
          Lưu
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Số tiền">
          <MoneyInput value={amount} onChange={setAmount} />
        </Field>
        <Field label="Ngày">
          <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
        </Field>
        {save.error && <ErrorBox error={save.error} />}
      </div>
    </Modal>
  );
}
