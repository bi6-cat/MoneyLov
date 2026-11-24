import { useMemo, useState } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import { useApi, type Meta, type TxRow } from '../lib/api';
import { ACTION_LABEL, dayLabel, hhmm, SCOPE_LABEL, vnd } from '../lib/format';
import { AccountDot, CatIcon, SharesLine } from '../components/bits';
import { TxDrawer } from '../components/TxDrawer';
import { Badge, Button, Card, Empty, ErrorBox, Input, Money, PageHeader, Select, Spinner } from '../components/ui';

export default function Transactions({ meta }: { meta: Meta }) {
  const [f, setF] = useState({ q: '', accountId: '', categoryId: '', kind: '', status: '', periodId: '', from: '', to: '', direction: '' });
  const [limit, setLimit] = useState(100);
  const [open, setOpen] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const qs = new URLSearchParams(Object.entries({ ...f, limit: String(limit) }).filter(([, v]) => v)).toString();
  const q = useApi<{ rows: TxRow[]; total: number; sumIn: number; sumOut: number }>(['transactions', qs], `/transactions?${qs}`);
  const set = (p: Partial<typeof f>) => {
    setF({ ...f, ...p });
    setLimit(100);
  };

  const days = useMemo(() => {
    const m = new Map<string, TxRow[]>();
    for (const t of q.data?.rows ?? []) {
      const k = t.occurredAt.slice(0, 10);
      m.set(k, [...(m.get(k) ?? []), t]);
    }
    return [...m];
  }, [q.data]);
  const active = Object.entries(f).filter(([k, v]) => v && k !== 'q').length;

  return (
    <div>
      <PageHeader title="Giao dịch" sub={q.data ? `${q.data.total} giao dịch` : undefined} />

      <div className="mb-3 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <Input className="pl-9" placeholder="Tìm đối tác, nội dung, mã giao dịch…" value={f.q} onChange={(e) => set({ q: e.target.value })} />
        </div>
        <Button icon={<SlidersHorizontal className="size-4" />} onClick={() => setShowFilters(!showFilters)}>
          Lọc{active ? ` (${active})` : ''}
        </Button>
      </div>

      {showFilters && (
        <Card className="mb-3 grid gap-2 p-3 sm:grid-cols-3 lg:grid-cols-4">
          <Select value={f.accountId} onChange={(e) => set({ accountId: e.target.value })}>
            <option value="">Mọi ví</option>
            {meta.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
          <Select value={f.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
            <option value="">Mọi danh mục</option>
            {meta.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select value={f.kind} onChange={(e) => set({ kind: e.target.value })}>
            <option value="">Mọi loại</option>
            {Object.entries(ACTION_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
          <Select value={f.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="">Mọi trạng thái</option>
            <option value="approved">Đã duyệt</option>
            <option value="pending">Chờ duyệt</option>
          </Select>
          <Select value={f.direction} onChange={(e) => set({ direction: e.target.value })}>
            <option value="">Vào & ra</option>
            <option value="out">Tiền ra</option>
            <option value="in">Tiền vào</option>
          </Select>
          <Select value={f.periodId} onChange={(e) => set({ periodId: e.target.value })}>
            <option value="">Mọi đợt</option>
            {meta.periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Input type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} title="Từ ngày" />
          <Input type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} title="Đến ngày" />
          {active > 0 && (
            <Button variant="ghost" onClick={() => set({ accountId: '', categoryId: '', kind: '', status: '', periodId: '', from: '', to: '', direction: '' })}>
              Xoá bộ lọc
            </Button>
          )}
        </Card>
      )}

      {q.data && (
        <div className="mb-3 flex gap-4 text-sm">
          <span>
            Vào <Money value={q.data.sumIn} direction="in" />
          </span>
          <span>
            Ra <Money value={q.data.sumOut} direction="out" />
          </span>
        </div>
      )}

      {q.isLoading ? (
        <Spinner />
      ) : q.error ? (
        <ErrorBox error={q.error} />
      ) : !days.length ? (
        <Card>
          <Empty title="Không có giao dịch nào" />
        </Card>
      ) : (
        <div className="space-y-4">
          {days.map(([day, txs]) => {
            const net = txs.reduce((a, t) => a + (t.direction === 'in' ? t.amount : -t.amount), 0);
            return (
              <section key={day}>
                <div className="mb-1 flex justify-between px-1 text-xs font-medium text-muted">
                  <span>{dayLabel(day)}</span>
                  <span className="num">{net >= 0 ? '+' : '−'}{vnd(Math.abs(net))}</span>
                </div>
                <Card className="divide-y divide-line overflow-hidden">
                  {txs.map((t) => {
                    const cat = meta.categories.find((c) => c.id === t.categoryId);
                    return (
                      <button key={t.id} onClick={() => setOpen(t.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2">
                        <CatIcon cat={cat} />
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium">{t.title ?? t.counterparty ?? t.rawContent.slice(0, 40)}</span>
                            {t.status === 'pending' && <Badge tone="warn">Chờ duyệt</Badge>}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                            <span>{hhmm(t.occurredAt)}</span>
                            <AccountDot acc={meta.accounts.find((a) => a.id === t.accountId)} />
                            {cat && <span>{cat.name}</span>}
                            {t.kind && t.kind !== 'expense' && <span>{ACTION_LABEL[t.kind]}</span>}
                            {t.scope && t.kind === 'expense' && <span>{SCOPE_LABEL[t.scope]}</span>}
                          </div>
                          {t.split && <SharesLine shares={t.split.result.shares} meta={meta} />}
                        </div>
                        <Money value={t.amount} direction={t.direction} className={t.kind === 'ignore' || t.kind === 'transfer' ? 'text-muted' : ''} />
                      </button>
                    );
                  })}
                </Card>
              </section>
            );
          })}
          {q.data && q.data.total > q.data.rows.length && (
            <div className="text-center">
              <Button onClick={() => setLimit(limit + 200)}>Tải thêm</Button>
            </div>
          )}
        </div>
      )}
      <TxDrawer txId={open} meta={meta} onClose={() => setOpen(null)} />
    </div>
  );
}
