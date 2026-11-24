import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCheck, FileUp, HelpCircle, Inbox, Sparkles } from 'lucide-react';
import { api, useAction, useApi, type Meta, type TxRow } from '../lib/api';
import { ACTION_LABEL, ddmm, hhmm, vnd } from '../lib/format';
import { AccountDot, SuggestionChip } from '../components/bits';
import { ImportModal } from '../components/ImportModal';
import { TxDrawer } from '../components/TxDrawer';
import { Badge, Button, Card, Checkbox, cx, Empty, ErrorBox, Modal, Money, PageHeader, Segmented, Select, Spinner, useToast } from '../components/ui';

type Group = 'ask' | 'ready' | 'check';
const GROUPS: { value: Group; label: string; hint: string }[] = [
  { value: 'ask', label: 'Cần trả lời', hint: 'Claude chưa chắc, có câu hỏi kèm theo.' },
  { value: 'check', label: 'Cần xem', hint: 'Có gợi ý nhưng độ tin cậy thấp.' },
  { value: 'ready', label: 'Sẵn sàng', hint: 'Đủ điều kiện tự duyệt.' },
];

export default function Review({ meta }: { meta: Meta }) {
  const q = useApi<{ rows: TxRow[] }>(['review'], '/transactions/review');
  const [group, setGroup] = useState<Group>('ask');
  const [open, setOpen] = useState<number | null>(null);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [cursor, setCursor] = useState(0);
  const [importing, setImporting] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);
  const [bulkCat, setBulkCat] = useState('');
  const toast = useToast();
  const listRef = useRef<HTMLDivElement>(null);

  const rows = q.data?.rows ?? [];
  const groupOf = (t: TxRow): Group => (t.auto?.ok ? 'ready' : t.question ? 'ask' : 'check');
  const counts = useMemo(() => {
    const c = { ask: 0, ready: 0, check: 0 };
    rows.forEach((r) => c[groupOf(r)]++);
    return c;
  }, [rows]);
  const list = rows.filter((r) => groupOf(r) === group);
  const ready = rows.filter((r) => r.auto?.ok);

  // Chọn nhóm đầu tiên còn việc khi dữ liệu đổi
  useEffect(() => {
    if (q.data && !list.length) {
      const g = GROUPS.find((x) => counts[x.value] > 0);
      if (g) setGroup(g.value);
    }
  }, [q.data]);
  useEffect(() => {
    setSel(new Set());
    setCursor(0);
  }, [group]);

  const bulk = useAction((body: { ids: number[]; decision?: any }) => api('/transactions/bulk-approve', { body }), {
    onSuccess: (r: any) => {
      toast(`Đã duyệt ${r.ok.length} khoản${r.failed.length ? `, ${r.failed.length} lỗi` : ''}`, r.failed.length ? 'danger' : 'ok');
      setSel(new Set());
    },
  });
  const auto = useAction(() => api('/transactions/auto-approve', { body: { ids: ready.map((r) => r.id) } }), {
    onSuccess: (r: any) => {
      toast(`Đã tự duyệt ${r.ok.length} khoản${r.failed.length ? `, ${r.failed.length} không đủ điều kiện` : ''}`);
      setAutoOpen(false);
    },
  });

  // Phím tắt: J/K di chuyển, Enter mở, X chọn, A duyệt theo gợi ý, I bỏ qua
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (open !== null || importing || autoOpen) return;
      if ((e.target as HTMLElement)?.closest('input,textarea,select')) return;
      const cur = list[cursor];
      if (e.key === 'j' || e.key === 'ArrowDown') setCursor((c) => Math.min(list.length - 1, c + 1));
      else if (e.key === 'k' || e.key === 'ArrowUp') setCursor((c) => Math.max(0, c - 1));
      else if (e.key === 'Enter' && cur) setOpen(cur.id);
      else if (e.key === 'x' && cur) toggle(cur.id);
      else if (e.key === 'a' && cur?.suggestion) bulk.mutate({ ids: [cur.id] });
      else if (e.key === 'i' && cur) bulk.mutate({ ids: [cur.id], decision: { action: 'ignore' } });
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [list, cursor, open, importing, autoOpen]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${cursor}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const toggle = (id: number) =>
    setSel((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const nextAfter = (id: number) => {
    const i = list.findIndex((r) => r.id === id);
    const next = list[i + 1] ?? list[i - 1];
    setOpen(next && next.id !== id ? next.id : null);
  };

  const readyByAction = useMemo(() => {
    const m = new Map<string, { n: number; sum: number }>();
    ready.forEach((r) => {
      const k = r.suggestion?.action ?? '?';
      const v = m.get(k) ?? { n: 0, sum: 0 };
      m.set(k, { n: v.n + 1, sum: v.sum + r.amount });
    });
    return [...m];
  }, [ready]);

  return (
    <div>
      <PageHeader
        title="Hộp duyệt"
        sub={!q.data ? ' ' : rows.length ? `${rows.length} khoản chờ duyệt` : 'Không còn khoản nào chờ'}
        actions={
          <>
            <Button icon={<FileUp className="size-4" />} onClick={() => setImporting(true)}>
              Nạp file
            </Button>
            <Button variant="primary" icon={<Sparkles className="size-4" />} disabled={!ready.length} onClick={() => setAutoOpen(true)}>
              Tự duyệt {ready.length} khoản chắc chắn
            </Button>
          </>
        }
      />

      {q.isLoading ? (
        <Spinner />
      ) : q.error ? (
        <ErrorBox error={q.error} />
      ) : !rows.length ? (
        <Card>
          <Empty icon={<Inbox className="size-10" />} title="Đã duyệt hết">
            Nạp file mới từ Claude, hoặc cho Claude đẩy thẳng qua API.
            <div className="mt-3">
              <Button variant="primary" icon={<FileUp className="size-4" />} onClick={() => setImporting(true)}>
                Nạp file
              </Button>
            </div>
          </Empty>
        </Card>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <Segmented
              value={group}
              onChange={setGroup}
              options={GROUPS.map((g) => ({
                value: g.value,
                title: g.hint,
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    {g.label}
                    <span className="num text-xs text-muted">{counts[g.value]}</span>
                  </span>
                ),
              }))}
            />
            <p className="hidden text-xs text-muted md:block">J/K di chuyển · Enter mở · X chọn · A duyệt theo gợi ý · I bỏ qua</p>
          </div>

          {sel.size > 0 && (
            <div className="sticky top-2 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-primary bg-surface p-2 shadow-sm">
              <span className="px-2 text-sm font-medium">Đã chọn {sel.size}</span>
              <Button size="sm" variant="primary" icon={<CheckCheck className="size-4" />} loading={bulk.isPending} onClick={() => bulk.mutate({ ids: [...sel] })}>
                Duyệt theo gợi ý
              </Button>
              <div className="flex items-center gap-1">
                <Select className="h-8 w-40" value={bulkCat} onChange={(e) => setBulkCat(e.target.value)}>
                  <option value="">Riêng · chọn danh mục</option>
                  {meta.categories
                    .filter((c) => c.kind === 'expense' && !c.archived)
                    .map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                </Select>
                <Button size="sm" disabled={!bulkCat} onClick={() => bulk.mutate({ ids: [...sel], decision: { action: 'expense', scope: 'Rieng', category: bulkCat } })}>
                  Đặt là Riêng
                </Button>
              </div>
              <Button size="sm" onClick={() => bulk.mutate({ ids: [...sel], decision: { action: 'ignore' } })}>
                Bỏ qua
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>
                Bỏ chọn
              </Button>
            </div>
          )}

          <Card className="overflow-hidden">
            <div className="flex items-center gap-3 border-b border-line px-4 py-2 text-xs text-muted">
              <Checkbox checked={sel.size > 0 && sel.size === list.length} onChange={(v) => setSel(v ? new Set(list.map((r) => r.id)) : new Set())} />
              <span>{GROUPS.find((g) => g.value === group)?.hint}</span>
            </div>
            <div ref={listRef}>
              {list.map((t, i) => (
                <div
                  key={t.id}
                  data-idx={i}
                  onClick={() => {
                    setCursor(i);
                    setOpen(t.id);
                  }}
                  className={cx('flex cursor-pointer items-start gap-3 border-b border-line px-4 py-3 last:border-0 hover:bg-surface-2', i === cursor && 'bg-surface-2 ring-1 ring-primary/30 ring-inset')}
                >
                  <div onClick={(e) => e.stopPropagation()} className="pt-0.5">
                    <Checkbox checked={sel.has(t.id)} onChange={() => toggle(t.id)} />
                  </div>
                  <div className="w-12 shrink-0 text-xs text-muted">
                    <div>{ddmm(t.occurredAt)}</div>
                    <div>{hhmm(t.occurredAt)}</div>
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{t.title ?? t.counterparty ?? t.rawContent.slice(0, 40)}</span>
                      <AccountDot acc={meta.accounts.find((a) => a.id === t.accountId)} />
                    </div>
                    {t.question ? (
                      <p className="flex items-start gap-1 text-sm text-warn">
                        <HelpCircle className="mt-0.5 size-3.5 shrink-0" />
                        {t.question}
                      </p>
                    ) : (
                      <p className="truncate text-xs text-muted">{t.rawContent}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <SuggestionChip s={t.suggestion} meta={meta} />
                      {t.rule && <Badge tone="info">Quy tắc ×{t.rule.confirmations}</Badge>}
                      {!t.auto?.ok && group !== 'ask' && <span className="text-xs text-muted">{t.auto?.reason}</span>}
                    </div>
                  </div>
                  <Money value={t.amount} direction={t.direction} />
                </div>
              ))}
              {!list.length && <Empty title="Nhóm này trống" />}
            </div>
          </Card>
        </>
      )}

      <TxDrawer txId={open} meta={meta} onClose={() => setOpen(null)} onDone={nextAfter} />
      <ImportModal open={importing} onClose={() => setImporting(false)} />
      <Modal
        open={autoOpen}
        onClose={() => setAutoOpen(false)}
        title={`Tự duyệt ${ready.length} khoản`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAutoOpen(false)}>
              Huỷ
            </Button>
            <Button variant="primary" loading={auto.isPending} onClick={() => auto.mutate(undefined)}>
              Duyệt {ready.length} khoản
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <p className="text-muted">
            Chỉ duyệt khoản không có câu hỏi, đủ thông tin, và được file nạp đánh dấu chắc chắn hoặc khớp quy tắc đã xác nhận ≥ {meta.settings.autoApproveMinConfirmations} lần. Duyệt xong vẫn sửa
            hoặc bỏ duyệt được.
          </p>
          <div className="divide-y divide-line rounded-lg border border-line">
            {readyByAction.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between px-3 py-2">
                <span>{ACTION_LABEL[k] ?? k}</span>
                <span className="num text-muted">
                  {v.n} khoản · {vnd(v.sum)} đ
                </span>
              </div>
            ))}
          </div>
          <details>
            <summary className="cursor-pointer text-muted">Xem danh sách</summary>
            <ul className="mt-2 max-h-60 space-y-1 overflow-y-auto">
              {ready.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    {ddmm(r.occurredAt)} · {r.title ?? r.counterparty ?? r.extId}
                  </span>
                  <span className="flex items-center gap-2">
                    <SuggestionChip s={r.suggestion} meta={meta} />
                    <Money value={r.amount} direction={r.direction} />
                  </span>
                </li>
              ))}
            </ul>
          </details>
          {auto.error && <ErrorBox error={auto.error} />}
        </div>
      </Modal>
    </div>
  );
}
