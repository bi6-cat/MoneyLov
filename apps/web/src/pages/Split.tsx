import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Copy, Download, Lock, Pencil, Plus, Trash2, Unlock, Users } from 'lucide-react';
import { api, useAction, useApi, type Meta } from '../lib/api';
import { copy, ddmm, MODE_LABEL, todayIso, vnd } from '../lib/format';
import { Avatar, SharesLine } from '../components/bits';
import { SplitEditor, type SplitCfg } from '../components/SplitEditor';
import { TxDrawer } from '../components/TxDrawer';
import { Badge, Button, Card, CardHeader, cx, Empty, ErrorBox, Field, IconButton, Input, Modal, Money, MoneyInput, Note, PageHeader, Segmented, Select, Spinner, useToast } from '../components/ui';

type Row = { person: string; name: string; nha: number; noCu: number; noMoi: number; rieng: number; tong: number; tra: number; conLai: number };

export default function Split({ meta }: { meta: Meta }) {
  const { id } = useParams();
  const nav = useNavigate();
  const periodId = id ? Number(id) : (meta.periods.find((p) => p.status === 'open') ?? meta.periods[0])?.id;
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!id && periodId) nav(`/split/${periodId}`, { replace: true });
  }, [id, periodId]);

  if (!meta.periods.length)
    return (
      <div>
        <PageHeader title="Chia tiền" />
        <Card>
          <Empty icon={<Users className="size-10" />} title="Chưa có đợt nào">
            Đợt được tạo tự động khi nạp file từ Claude, hoặc tạo tay.
            <div className="mt-3">
              <Button variant="primary" onClick={() => setCreating(true)}>
                Tạo đợt
              </Button>
            </div>
          </Empty>
        </Card>
        <NewPeriod open={creating} onClose={() => setCreating(false)} meta={meta} />
      </div>
    );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select className="w-full max-w-sm font-medium" value={periodId} onChange={(e) => nav(`/split/${e.target.value}`)}>
          {meta.periods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} {p.status === 'closed' ? '· đã chốt' : ''}
            </option>
          ))}
        </Select>
        <Button variant="ghost" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
          Đợt mới
        </Button>
      </div>
      {periodId && <PeriodView id={periodId} meta={meta} />}
      <NewPeriod open={creating} onClose={() => setCreating(false)} meta={meta} />
    </div>
  );
}

function PeriodView({ id, meta }: { id: number; meta: Meta }) {
  const q = useApi<any>(['period', id], `/periods/${id}`);
  const [tab, setTab] = useState<'settle' | 'bills' | 'paid'>('settle');
  const [editBill, setEditBill] = useState<any>(null);
  const [newBill, setNewBill] = useState(false);
  const [txOpen, setTxOpen] = useState<number | null>(null);
  const [carryEdit, setCarryEdit] = useState<Row | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [reopen, setReopen] = useState(false);
  const toast = useToast();

  const close = useAction(() => api(`/periods/${id}/close`, { body: {} }), {
    onSuccess: () => {
      toast('Đã chốt đợt');
      setConfirmClose(false);
    },
  });
  const delSettlement = useAction((sid: number) => api(`/periods/settlements/${sid}`, { method: 'DELETE' }));

  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data;
  const p = d.period;
  const closed = p.status === 'closed';
  const name = (c: string) => meta.people.find((x) => x.code === c)?.name ?? c;
  const rows: Row[] = d.settlement.rows;
  const owed = rows.reduce((a, r) => a + Math.max(0, r.conLai), 0);
  const rent = d.splits.filter((s: any) => s.isRent);
  const bills = d.splits.filter((s: any) => !s.isRent);

  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {p.name}
            {closed ? (
              <Badge tone="neutral">
                <Lock className="size-3" /> Đã chốt
              </Badge>
            ) : (
              <Badge tone="primary">Đang mở</Badge>
            )}
          </span>
        }
        sub={`${ddmm(p.fromDate)}/${p.fromDate.slice(0, 4)} → ${ddmm(p.toDate)}/${p.toDate.slice(0, 4)} · Tiền nhà ${p.rentTotal ? vnd(p.rentTotal) + ' đ' : 'chưa đặt'}`}
        actions={
          <>
            <Button icon={<Download className="size-4" />} onClick={() => window.open(`/api/periods/${id}/export`, '_blank')} title="toan-bo.json cho bước ghi Google Sheet">
              Xuất cho Sheet
            </Button>
            {closed ? (
              <Button icon={<Unlock className="size-4" />} onClick={() => setReopen(true)}>
                Mở lại
              </Button>
            ) : (
              <Button variant="primary" icon={<Lock className="size-4" />} onClick={() => setConfirmClose(true)}>
                Chốt đợt
              </Button>
            )}
          </>
        }
      />

      {d.warnings.length > 0 && (
        <div className="mb-4 space-y-2">
          {d.warnings.slice(0, 5).map((w: string) => (
            <Note key={w} tone="warn">
              {w}
            </Note>
          ))}
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Mọi người còn nợ bạn" value={owed} />
        <Stat label="Phần chung của bạn" value={d.settlement.hubShare.chung} />
        <Stat label="Tiền nhà của bạn" value={d.settlement.hubShare.nha} />
        <Stat label="Số bill" value={d.splits.length} plain />
      </div>

      <Segmented
        className="mb-4"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'settle', label: 'Quyết toán' },
          { value: 'bills', label: `Bill (${d.splits.length})` },
          { value: 'paid', label: `Đã trả (${d.settlements.length})` },
        ]}
      />

      {tab === 'settle' && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((r) => (
              <Card key={r.person} className="p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Avatar p={{ code: r.person, name: r.name }} />
                  <span className="flex-1 font-semibold">{r.name}</span>
                  <IconButton
                    label="Copy tin nhắn nhắc nợ"
                    onClick={() => {
                      copy(d.reminders[r.person]);
                      toast('Đã copy tin nhắn');
                    }}
                  >
                    <Copy className="size-4" />
                  </IconButton>
                </div>
                <dl className="space-y-1 text-sm">
                  <Line label="Nhà" v={r.nha} />
                  <Line
                    label={
                      <span className="inline-flex items-center gap-1">
                        Nợ cũ
                        {!closed && (
                          <button onClick={() => setCarryEdit(r)} className="text-muted hover:text-fg" aria-label="Sửa nợ cũ">
                            <Pencil className="size-3" />
                          </button>
                        )}
                        {p.carriedOverride?.[r.person] && <Badge>sửa tay</Badge>}
                      </span>
                    }
                    v={r.noCu}
                  />
                  <Line label="Ăn chung" v={r.noMoi} />
                  <Line label="Cho mượn" v={r.rieng} />
                  <div className="border-t border-line pt-1">
                    <Line label="Tổng" v={r.tong} bold />
                  </div>
                  <Line label="Đã trả" v={r.tra ? -r.tra : 0} />
                </dl>
                <div className="mt-3 flex items-baseline justify-between rounded-lg bg-surface-2 px-3 py-2">
                  <span className="text-sm text-muted">{r.conLai >= 0 ? 'Còn nợ' : 'Trả dư'}</span>
                  <span className={cx('num text-lg font-semibold', r.conLai < 0 && 'text-ok')}>{vnd(Math.abs(r.conLai))}</span>
                </div>
              </Card>
            ))}
          </div>

          {d.settlement.transfers.length > 0 && (
            <Card>
              <CardHeader title="Chuyển khoản cần làm" sub="Mọi người quyết toán với người giữ sổ" />
              <ul className="divide-y divide-line px-4 pb-2">
                {d.settlement.transfers.map((t: any, i: number) => (
                  <li key={i} className="flex items-center gap-2 py-2 text-sm">
                    <Avatar p={{ code: t.from, name: name(t.from) }} size="sm" />
                    {name(t.from)}
                    <ArrowRight className="size-4 text-muted" />
                    <Avatar p={{ code: t.to, name: name(t.to) }} size="sm" />
                    {name(t.to)}
                    <span className="num ml-auto font-medium">{vnd(t.amount)} đ</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {d.previous && <p className="text-xs text-muted">Nợ cũ lấy từ "Còn lại" của đợt {d.previous.name}.</p>}
        </div>
      )}

      {tab === 'bills' && (
        <div className="space-y-3">
          {!closed && (
            <Button icon={<Plus className="size-4" />} onClick={() => setNewBill(true)}>
              Thêm bill tiền mặt / người khác trả
            </Button>
          )}
          {[...rent, ...bills].length === 0 ? (
            <Card>
              <Empty title="Chưa có bill nào">Bill được tạo khi bạn duyệt giao dịch ở chế độ "Chia tiền".</Empty>
            </Card>
          ) : (
            <Card className="divide-y divide-line overflow-hidden">
              {[...rent, ...bills].map((s: any) => (
                <button
                  key={s.id}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-2"
                  onClick={() => (s.transactionId ? setTxOpen(s.transactionId) : setEditBill(s))}
                >
                  <div className="w-12 shrink-0 text-xs text-muted">{ddmm(s.occurredAt)}</div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{s.title}</span>
                      <Badge tone={s.isRent ? 'info' : 'primary'}>{s.isRent ? 'Tiền nhà' : (MODE_LABEL[s.config.mode] ?? s.config.mode)}</Badge>
                      {!s.transactionId && <Badge>Tiền mặt</Badge>}
                      {s.config.covers?.length > 0 && <Badge tone="warn">Có người bao</Badge>}
                      {s.config.payers?.length > 0 && <Badge tone="warn">Người khác trả</Badge>}
                    </div>
                    <SharesLine shares={s.result.shares} meta={meta} />
                  </div>
                  <Money value={s.config.total} />
                </button>
              ))}
            </Card>
          )}
        </div>
      )}

      {tab === 'paid' && (
        <div className="space-y-3">
          {!closed && (
            <Button icon={<Plus className="size-4" />} onClick={() => setPayOpen(true)}>
              Ghi khoản trả tiền mặt
            </Button>
          )}
          <Card className="divide-y divide-line overflow-hidden">
            {d.settlements.map((s: any) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar p={{ code: s.person, name: name(s.person) }} size="sm" />
                <div className="flex-1">
                  <p className="font-medium">{name(s.person)}</p>
                  <p className="text-xs text-muted">
                    {ddmm(s.paidAt)} · {s.transactionId ? 'Chuyển khoản' : 'Tiền mặt'} {s.note && `· ${s.note}`}
                  </p>
                </div>
                <Money value={s.amount} direction="in" />
                {!s.transactionId && !closed && (
                  <IconButton label="Xoá" onClick={() => delSettlement.mutate(s.id)}>
                    <Trash2 className="size-4" />
                  </IconButton>
                )}
              </div>
            ))}
            {!d.settlements.length && <Empty title="Chưa ai trả" />}
          </Card>
          {d.loans.length > 0 && (
            <Card>
              <CardHeader title="Cho mượn trong đợt" />
              <ul className="divide-y divide-line px-4 pb-2 text-sm">
                {d.loans.map((l: any) => (
                  <li key={l.id} className="flex justify-between py-2">
                    <span>
                      {name(l.person)} · {ddmm(l.startedAt)}
                    </span>
                    <span className="num">{vnd(l.amount)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      <BillModal open={newBill || !!editBill} bill={editBill} periodId={id} meta={meta} onClose={() => (setNewBill(false), setEditBill(null))} readOnly={closed} />
      <TxDrawer txId={txOpen} meta={meta} onClose={() => setTxOpen(null)} />
      <CarryModal row={carryEdit} period={p} onClose={() => setCarryEdit(null)} auto={d.carriedAuto} />
      <PayModal open={payOpen} onClose={() => setPayOpen(false)} periodId={id} meta={meta} />
      <Modal
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        title={`Chốt đợt ${p.name}?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmClose(false)}>
              Huỷ
            </Button>
            <Button variant="primary" loading={close.isPending} disabled={d.pending > 0} onClick={() => close.mutate(undefined)}>
              Chốt đợt
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <p>Sau khi chốt, giao dịch và bill của đợt bị khoá. "Còn lại" của từng người sẽ thành nợ cũ của đợt sau.</p>
          {d.pending > 0 && <Note tone="warn">Còn {d.pending} giao dịch chưa duyệt trong đợt. Duyệt hết trước khi chốt.</Note>}
          {close.error && <ErrorBox error={close.error} />}
        </div>
      </Modal>
      <ReopenModal open={reopen} onClose={() => setReopen(false)} id={id} />
    </div>
  );
}

const Stat = ({ label, value, plain }: { label: string; value: number; plain?: boolean }) => (
  <Card className="p-3">
    <p className="text-xs text-muted">{label}</p>
    <p className="num text-lg font-semibold">{plain ? value : vnd(value)}</p>
  </Card>
);
const Line = ({ label, v, bold }: { label: React.ReactNode; v: number; bold?: boolean }) => (
  <div className={cx('flex justify-between', bold && 'font-semibold', !v && !bold && 'text-muted')}>
    <dt>{label}</dt>
    <dd className="num">{vnd(v)}</dd>
  </div>
);

function BillModal({ open, bill, periodId, meta, onClose, readOnly }: { open: boolean; bill: any; periodId: number; meta: Meta; onClose: () => void; readOnly: boolean }) {
  const room = meta.people.filter((p) => p.role === 'roommate' && p.active).map((p) => p.code);
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState(todayIso());
  const [total, setTotal] = useState<number | null>(null);
  const [cfg, setCfg] = useState<SplitCfg>({ mode: 'equal', people: room });
  const [cat, setCat] = useState('Ăn uống');
  const toast = useToast();
  useEffect(() => {
    if (!open) return;
    if (bill) {
      const { total: t, ...rest } = bill.config;
      setTitle(bill.title);
      setWhen(bill.occurredAt.slice(0, 16).replace(' ', 'T'));
      setTotal(t);
      setCfg(rest);
    } else {
      setTitle('');
      setWhen(todayIso());
      setTotal(null);
      setCfg({ mode: 'equal', people: room, payers: [{ person: meta.settings.hub, amount: 0 }] });
    }
  }, [open, bill?.id]);
  useEffect(() => {
    // Bill mới: người trả mặc định trả đúng tổng
    if (!bill && total && cfg.payers?.length === 1) setCfg((c) => ({ ...c, payers: [{ ...c.payers![0], amount: total }] }));
  }, [total]);

  const save = useAction(
    () =>
      bill
        ? api(`/periods/splits/${bill.id}`, { method: 'PUT', body: { config: cfg, title, total } })
        : api(`/periods/${periodId}/splits`, { body: { title, occurredAt: when, total, config: cfg, category: cat } }),
    {
      onSuccess: () => {
        toast('Đã lưu bill');
        onClose();
      },
    },
  );
  const del = useAction(() => api(`/periods/splits/${bill.id}`, { method: 'DELETE' }), { onSuccess: onClose });

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={bill ? 'Sửa bill' : 'Bill tiền mặt / người khác trả'}
      footer={
        !readOnly && (
          <>
            {bill && (
              <Button variant="ghost" className="mr-auto text-danger" onClick={() => del.mutate(undefined)} loading={del.isPending}>
                Xoá bill
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              Huỷ
            </Button>
            <Button variant="primary" disabled={!title || !total} loading={save.isPending} onClick={() => save.mutate(undefined)}>
              Lưu
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Tên bill">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Lẩu, đi chợ…" />
          </Field>
          <Field label="Tổng tiền">
            <MoneyInput value={total} onChange={setTotal} />
          </Field>
          <Field label="Thời gian">
            <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} disabled={!!bill} />
          </Field>
        </div>
        {!bill && (
          <Field label="Danh mục">
            <Select value={cat} onChange={(e) => setCat(e.target.value)}>
              {meta.categories
                .filter((c) => c.kind === 'expense')
                .map((c) => (
                  <option key={c.id}>{c.name}</option>
                ))}
            </Select>
          </Field>
        )}
        {total ? <SplitEditor value={cfg} onChange={setCfg} total={total} meta={meta} /> : <p className="text-sm text-muted">Nhập tổng tiền để chia.</p>}
        {save.error && <ErrorBox error={save.error} />}
      </div>
    </Modal>
  );
}

function CarryModal({ row, period, onClose, auto }: { row: Row | null; period: any; onClose: () => void; auto: Record<string, number> }) {
  const [amount, setAmount] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (row) {
      setAmount(row.noCu);
      setReason(period.carriedOverride?.[row.person]?.reason ?? '');
    }
  }, [row?.person]);
  const save = useAction((override: any) => api(`/periods/${period.id}`, { method: 'PATCH', body: { carriedOverride: override } }), { onSuccess: onClose });
  if (!row) return null;
  const others = { ...(period.carriedOverride ?? {}) };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Nợ cũ của ${row.name}`}
      footer={
        <>
          {period.carriedOverride?.[row.person] && (
            <Button
              variant="ghost"
              className="mr-auto"
              onClick={() => {
                delete others[row.person];
                save.mutate(others);
              }}
            >
              Dùng giá trị tự động
            </Button>
          )}
          <Button variant="primary" disabled={!reason.trim()} loading={save.isPending} onClick={() => save.mutate({ ...others, [row.person]: { amount: amount ?? 0, reason } })}>
            Lưu
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-muted">Tự động từ đợt trước: {vnd(auto[row.person] ?? 0)} đ</p>
        <Field label="Nợ cũ">
          <MoneyInput value={amount} onChange={setAmount} />
        </Field>
        <Field label="Lý do (bắt buộc)" hint='Ví dụ: "Lấy từ sheet ô P606"'>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {save.error && <ErrorBox error={save.error} />}
      </div>
    </Modal>
  );
}

function PayModal({ open, onClose, periodId, meta }: { open: boolean; onClose: () => void; periodId: number; meta: Meta }) {
  const others = meta.people.filter((p) => p.active && p.code !== meta.settings.hub && !p.paidBy);
  const [person, setPerson] = useState(others[0]?.code ?? '');
  const [amount, setAmount] = useState<number | null>(null);
  const [when, setWhen] = useState(todayIso());
  const [note, setNote] = useState('');
  const save = useAction(() => api(`/periods/${periodId}/settlements`, { body: { person, amount, paidAt: when, note: note || null } }), {
    onSuccess: () => {
      setAmount(null);
      setNote('');
      onClose();
    },
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ghi khoản trả tiền mặt"
      footer={
        <Button variant="primary" disabled={!amount || !person} loading={save.isPending} onClick={() => save.mutate(undefined)}>
          Lưu
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Ai trả">
          <Select value={person} onChange={(e) => setPerson(e.target.value)}>
            {others.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Số tiền">
          <MoneyInput value={amount} onChange={setAmount} />
        </Field>
        <Field label="Thời gian">
          <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>
        <Field label="Ghi chú">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {save.error && <ErrorBox error={save.error} />}
      </div>
    </Modal>
  );
}

function ReopenModal({ open, onClose, id }: { open: boolean; onClose: () => void; id: number }) {
  const [reason, setReason] = useState('');
  const go = useAction(() => api(`/periods/${id}/reopen`, { body: { reason } }), { onSuccess: onClose });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mở lại đợt đã chốt"
      footer={
        <Button variant="danger" disabled={!reason.trim()} loading={go.isPending} onClick={() => go.mutate(undefined)}>
          Mở lại
        </Button>
      }
    >
      <div className="space-y-3">
        <Note tone="warn">Sửa đợt đã chốt sẽ làm lệch nợ cũ của các đợt sau và số đã ghi trên Google Sheet. Sau khi sửa, nhớ chốt lại và xuất lại cho Sheet.</Note>
        <Field label="Lý do (được ghi lại)">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {go.error && <ErrorBox error={go.error} />}
      </div>
    </Modal>
  );
}

function NewPeriod({ open, onClose, meta }: { open: boolean; onClose: () => void; meta: Meta }) {
  const last = meta.periods[0];
  const nextDay = (d: string) => new Date(Date.parse(d + 'T00:00:00Z') + 86400_000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(last ? nextDay(last.toDate) : new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState('');
  const [name, setName] = useState('');
  const [rent, setRent] = useState<number | null>(last?.rentTotal ?? 8500000);
  const nav = useNavigate();
  useEffect(() => {
    if (open && !name) setName(`Từ ${Number(from.slice(8, 10))}/${Number(from.slice(5, 7))}`);
  }, [open, from]);
  const save = useAction(() => api('/periods', { body: { name, fromDate: from, toDate: to, rentTotal: rent } }), {
    onSuccess: (p: any) => {
      onClose();
      nav(`/split/${p.id}`);
    },
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Đợt chia tiền mới"
      footer={
        <Button variant="primary" disabled={!name || !from || !to} loading={save.isPending} onClick={() => save.mutate(undefined)}>
          Tạo đợt
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tên đợt" className="sm:col-span-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Từ ngày">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Đến ngày">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="Tổng tiền nhà" hint="Để kiểm tra khoản tiền nhà đã chia đủ chưa">
          <MoneyInput value={rent} onChange={setRent} />
        </Field>
        {save.error && <ErrorBox error={save.error} />}
      </div>
    </Modal>
  );
}
