import { useEffect, useState } from 'react';
import { ChevronDown, Link2 } from 'lucide-react';
import { api, useAction, useApi, type Meta, type TxRow } from '../lib/api';
import { ACTION_LABEL, ddmm, hhmm, vnd } from '../lib/format';
import { AccountDot, SuggestionChip } from './bits';
import { DecisionEditor, initialDecision, toDecision, type DecisionState } from './DecisionEditor';
import { Badge, Button, cx, Drawer, ErrorBox, Money, Spinner, useToast } from './ui';

export function TxDrawer({ txId, meta, onClose, onDone }: { txId: number | null; meta: Meta; onClose: () => void; onDone?: (id: number) => void }) {
  const q = useApi<TxRow & { history: any[]; similar: TxRow[]; pair: TxRow | null }>(['tx', txId], txId ? `/transactions/${txId}` : null);
  const tx = q.data;
  const [d, setD] = useState<DecisionState | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (tx && tx.id === txId) setD(initialDecision(tx, meta));
  }, [tx?.id, tx?.status, txId]);

  const approve = useAction((body: any) => api(`/transactions/${txId}/approve`, { body }), {
    onSuccess: (r: any) => {
      toast(r.rule ? 'Đã duyệt và lưu quy tắc' : 'Đã duyệt');
      onDone ? onDone(txId!) : onClose();
    },
  });
  const unapprove = useAction(() => api(`/transactions/${txId}/unapprove`, { body: {} }), { onSuccess: () => toast('Đã chuyển về chờ duyệt', 'info') });

  const acc = meta.accounts.find((a) => a.id === tx?.accountId);
  const approved = tx?.status === 'approved';
  const period = meta.periods.find((p) => p.id === tx?.periodId);
  const locked = period?.status === 'closed';

  return (
    <Drawer
      open={!!txId}
      onClose={onClose}
      title={
        tx ? (
          <div className="flex items-center gap-2">
            <span className="truncate">{tx.title ?? tx.counterparty ?? 'Giao dịch'}</span>
            {approved ? <Badge tone="ok">Đã duyệt</Badge> : <Badge tone="warn">Chờ duyệt</Badge>}
          </div>
        ) : (
          'Giao dịch'
        )
      }
      footer={
        tx &&
        d && (
          <div className="space-y-2">
            {approve.error && <ErrorBox error={approve.error} />}
            {locked && <p className="text-sm text-muted">Giao dịch thuộc đợt "{period?.name}" đã chốt, chỉ xem.</p>}
            <div className="flex items-center justify-between gap-2">
              {approved && !locked ? (
                <Button variant="ghost" onClick={() => unapprove.mutate(undefined)} loading={unapprove.isPending}>
                  Bỏ duyệt
                </Button>
              ) : (
                <span className="text-xs text-muted">{!approved && 'Phím tắt: Ctrl + Enter để duyệt'}</span>
              )}
              <Button variant="primary" size="lg" disabled={locked} loading={approve.isPending} onClick={() => approve.mutate(toDecision(d, meta))}>
                {approved ? 'Lưu thay đổi' : `Duyệt · ${ACTION_LABEL[d.action]}`}
              </Button>
            </div>
          </div>
        )
      }
    >
      {q.isLoading || !tx || !d ? (
        <Spinner />
      ) : (
        <div
          className="space-y-5"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !locked) approve.mutate(toDecision(d, meta));
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
                <span>
                  {ddmm(tx.occurredAt)} · {hhmm(tx.occurredAt)}
                </span>
                <AccountDot acc={acc} />
                {period && <Badge>{period.name}</Badge>}
              </div>
              <p className="truncate text-sm">{tx.counterparty ?? '—'}</p>
            </div>
            <Money value={tx.amount} direction={tx.direction} className="text-2xl" />
          </div>

          {!approved && tx.suggestion && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">Gợi ý:</span>
              <SuggestionChip s={tx.suggestion} meta={meta} />
              <Badge tone={tx.confidence === 'chac' ? 'ok' : 'warn'}>{tx.confidence === 'chac' ? 'Chắc chắn' : 'Cần xem'}</Badge>
              {tx.rule && <Badge tone="info">Quy tắc: {tx.rule.name}</Badge>}
            </div>
          )}

          <DecisionEditor tx={tx} meta={meta} value={d} onChange={setD} />

          <div className="space-y-2 border-t border-line pt-4 text-sm">
            <button type="button" onClick={() => setShowRaw(!showRaw)} className="flex items-center gap-1 text-muted hover:text-fg">
              <ChevronDown className={cx('size-4 transition', showRaw && 'rotate-180')} /> Thông tin gốc & lịch sử
            </button>
            {showRaw && (
              <div className="space-y-3">
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-muted">Mã</dt>
                  <dd className="font-mono break-all">{tx.extId ?? `#${tx.id} (nhập tay)`}</dd>
                  <dt className="text-muted">Nội dung</dt>
                  <dd className="break-words">{tx.rawContent || '—'}</dd>
                  {tx.counterpartyAccount && (
                    <>
                      <dt className="text-muted">TK đối tác</dt>
                      <dd>
                        {tx.counterpartyAccount} {tx.counterpartyBank && `· ${tx.counterpartyBank}`}
                      </dd>
                    </>
                  )}
                </dl>
                {tx.pair && (
                  <p className="flex items-center gap-1 text-xs">
                    <Link2 className="size-3.5" /> Cặp với {tx.pair.extId} ({vnd(tx.pair.amount)} đ, {ddmm(tx.pair.occurredAt)})
                  </p>
                )}
                {tx.similar?.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted">Cùng đối tác, đã duyệt</p>
                    <ul className="space-y-1 text-xs">
                      {tx.similar.map((s) => (
                        <li key={s.id} className="flex justify-between gap-2">
                          <span>
                            {ddmm(s.occurredAt)} · {ACTION_LABEL[s.kind ?? ''] ?? s.kind} {s.scope ? `· ${s.scope}` : ''}
                          </span>
                          <span className="num">{vnd(s.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {tx.history?.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted">Lịch sử duyệt</p>
                    <ul className="space-y-1 text-xs">
                      {tx.history.map((h) => (
                        <li key={h.id}>
                          {new Date(h.createdAt).toLocaleString('vi-VN')} · {ACTION_LABEL[h.final.action]} · {h.by === 'auto' ? 'tự duyệt' : h.by === 'bulk' ? 'duyệt loạt' : 'duyệt tay'}
                          {h.changed && ' · đã sửa gợi ý'}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}
