import { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { api, useAction, useApi, type Meta } from '../lib/api';
import { monthLabel, short, vnd } from '../lib/format';
import { CatIcon } from '../components/bits';
import { Button, Card, Checkbox, Empty, ErrorBox, Field, IconButton, Modal, MoneyInput, PageHeader, Progress, Segmented, Select, Spinner } from '../components/ui';

const shift = (m: string, n: number) => {
  const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

export default function Budgets({ meta }: { meta: Meta }) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const q = useApi<any>(['budgets', month], `/budgets?month=${month}`);
  const [edit, setEdit] = useState<any>(null);
  const del = useAction((id: number) => api(`/budgets/${id}`, { method: 'DELETE' }));

  return (
    <div>
      <PageHeader
        title="Ngân sách"
        sub="Tính trên chi tiêu của bạn: Riêng + phần Chung + phần Nhà"
        actions={
          <>
            <div className="flex items-center gap-1">
              <IconButton label="Tháng trước" onClick={() => setMonth(shift(month, -1))}>
                <ChevronLeft className="size-4" />
              </IconButton>
              <span className="w-32 text-center text-sm font-medium">{monthLabel(month)}</span>
              <IconButton label="Tháng sau" onClick={() => setMonth(shift(month, 1))}>
                <ChevronRight className="size-4" />
              </IconButton>
            </div>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEdit({ categoryId: null, amount: null, month: '*', rollover: false })}>
              Đặt ngân sách
            </Button>
          </>
        }
      />
      {q.isLoading ? (
        <Spinner />
      ) : q.error ? (
        <ErrorBox error={q.error} />
      ) : !q.data.items.length ? (
        <Card>
          <Empty title="Chưa có ngân sách">Đặt hạn mức tổng hoặc cho từng danh mục. Web cảnh báo khi dùng tới 80% và khi vượt.</Empty>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {q.data.items.map((b: any) => (
            <Card key={b.budget.id} className="space-y-3 p-4">
              <div className="flex items-center gap-3">
                <CatIcon cat={b.category ?? { icon: 'wallet', color: '#0f766e' }} />
                <div className="flex-1">
                  <p className="font-medium">{b.category?.name ?? 'Tổng chi tiêu'}</p>
                  <p className="text-xs text-muted">
                    {b.budget.month === '*' ? 'Mọi tháng' : monthLabel(b.budget.month)}
                    {b.budget.rollover && ' · chuyển dư'}
                    {b.carried ? ` · ${b.carried > 0 ? '+' : ''}${short(b.carried)} từ tháng trước` : ''}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setEdit({ ...b.budget })}>
                  Sửa
                </Button>
                <IconButton label="Xoá" onClick={() => del.mutate(b.budget.id)}>
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
              <Progress value={b.pct} tone={b.level} />
              <div className="flex justify-between text-sm">
                <span className="num">
                  {vnd(b.spent)} / {vnd(b.limit)} đ
                </span>
                <span className={b.remaining < 0 ? 'font-medium text-danger' : b.level === 'warn' ? 'font-medium text-warn' : 'text-muted'}>
                  {b.remaining >= 0 ? `Còn ${short(b.remaining)}` : `Vượt ${short(-b.remaining)}`}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
      {q.data?.unbudgeted?.length > 0 && (
        <Card className="mt-4 p-4">
          <p className="mb-2 text-sm font-medium">Chưa có ngân sách</p>
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {q.data.unbudgeted.map((u: any) => {
              const c = meta.categories.find((x) => x.id === u.categoryId);
              return (
                <li key={String(u.categoryId)} className="flex justify-between">
                  <button className="text-left hover:text-primary" onClick={() => setEdit({ categoryId: u.categoryId, amount: null, month: '*', rollover: false })}>
                    {c?.name ?? 'Chưa phân loại'}
                  </button>
                  <span className="num text-muted">{vnd(u.spent)}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {edit && <BudgetModal value={edit} month={month} meta={meta} onClose={() => setEdit(null)} />}
    </div>
  );
}

function BudgetModal({ value, month, meta, onClose }: { value: any; month: string; meta: Meta; onClose: () => void }) {
  const [v, setV] = useState(value);
  const save = useAction(() => api('/budgets', { method: 'PUT', body: { categoryId: v.categoryId, month: v.month, amount: v.amount, rollover: v.rollover } }), { onSuccess: onClose });
  return (
    <Modal
      open
      onClose={onClose}
      title="Ngân sách"
      footer={
        <Button variant="primary" disabled={v.amount == null} loading={save.isPending} onClick={() => save.mutate(undefined)}>
          Lưu
        </Button>
      }
    >
      <div className="space-y-3">
        <Field label="Danh mục">
          <Select value={v.categoryId ?? ''} onChange={(e) => setV({ ...v, categoryId: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Tổng chi tiêu</option>
            {meta.categories
              .filter((c) => c.kind === 'expense' && !c.parentId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Hạn mức">
          <MoneyInput value={v.amount} onChange={(amount) => setV({ ...v, amount })} />
        </Field>
        <Segmented
          value={v.month === '*' ? '*' : 'one'}
          onChange={(x) => setV({ ...v, month: x === '*' ? '*' : month })}
          options={[
            { value: '*', label: 'Áp dụng mọi tháng' },
            { value: 'one', label: `Chỉ ${monthLabel(month)}` },
          ]}
        />
        <Checkbox checked={v.rollover} onChange={(rollover) => setV({ ...v, rollover })} label="Chuyển phần dư (hoặc phần vượt) sang tháng sau" />
        {save.error && <ErrorBox error={save.error} />}
      </div>
    </Modal>
  );
}
