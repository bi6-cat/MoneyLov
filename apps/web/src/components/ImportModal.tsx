import { useState } from 'react';
import { CheckCircle2, FileUp, XCircle } from 'lucide-react';
import { api, useAction } from '../lib/api';
import { ddmm, vnd } from '../lib/format';
import { Badge, Button, cx, ErrorBox, Modal, Note, Segmented, useToast } from './ui';

type Result = {
  version: number;
  period: { name: string; from: string; to: string; created: boolean } | null;
  checks: { key: string; label: string; ok: boolean; detail: string }[];
  stats: { added: number; updated: number; unchanged: number; locked: number };
  diff: { extId: string; status: string; occurredAt: string; amount: number; direction: string; counterparty: string | null; ruleName?: string; changes?: string[] }[];
  warnings: string[];
};

const STATUS: Record<string, { label: string; tone: any }> = {
  added: { label: 'Mới', tone: 'primary' },
  updated: { label: 'Cập nhật', tone: 'info' },
  unchanged: { label: 'Không đổi', tone: 'neutral' },
  locked: { label: 'Đã duyệt, giữ nguyên', tone: 'neutral' },
};

export function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [file, setFile] = useState<{ name: string; json: unknown } | null>(null);
  const [preview, setPreview] = useState<Result | null>(null);
  const [filter, setFilter] = useState<'changes' | 'all'>('changes');
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();

  const reset = () => {
    setFile(null);
    setPreview(null);
    setErr(null);
  };
  const dry = useAction((f: { name: string; json: unknown }) => api<Result>(`/import?dry_run=1&filename=${encodeURIComponent(f.name)}`, { body: f.json }), { invalidate: false, onSuccess: setPreview });
  const run = useAction(() => api<Result>(`/import?filename=${encodeURIComponent(file!.name)}`, { body: file!.json }), {
    onSuccess: (r) => {
      toast(`Đã nạp: ${r.stats.added} mới, ${r.stats.updated} cập nhật`);
      reset();
      onClose();
    },
  });

  const pick = async (f: File) => {
    setErr(null);
    try {
      const json = JSON.parse(await f.text());
      const v = { name: f.name, json };
      setFile(v);
      dry.mutate(v);
    } catch {
      setErr('File không phải JSON hợp lệ');
    }
  };

  const allOk = preview?.checks.every((c) => c.ok);
  const rows = preview?.diff.filter((d) => filter === 'all' || d.status === 'added' || d.status === 'updated') ?? [];

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      wide
      title="Nạp file giao dịch"
      footer={
        preview && (
          <>
            <Button variant="ghost" onClick={reset}>
              Chọn file khác
            </Button>
            <Button variant="primary" loading={run.isPending} disabled={!preview.stats.added && !preview.stats.updated} onClick={() => run.mutate(undefined)}>
              {allOk ? 'Nạp' : 'Vẫn nạp'} {preview.stats.added + preview.stats.updated} khoản
            </Button>
          </>
        )
      }
    >
      {!preview ? (
        <div className="space-y-4">
          <label
            className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line p-10 text-center hover:border-primary"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) pick(f);
            }}
          >
            <FileUp className="size-8 text-muted" />
            <span className="font-medium">Chọn hoặc kéo thả file .json</span>
            <span className="text-sm text-muted">File nạp do Claude tạo (dot-*.json, phiên bản 1 hoặc 2). Web sẽ chạy thử trước, chưa ghi gì.</span>
            <input type="file" accept=".json,application/json" className="sr-only" onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
          </label>
          {dry.isPending && <p className="text-center text-sm text-muted">Đang kiểm tra…</p>}
          {(err || dry.error) && <ErrorBox error={err ?? dry.error} />}
          <Note>Claude cũng có thể đẩy thẳng qua API bằng token (Cài đặt → API cho Claude), không cần tải file.</Note>
        </div>
      ) : (
        <div className="space-y-4">
          {preview.period && (
            <p className="text-sm">
              Đợt <b>{preview.period.name}</b> ({ddmm(preview.period.from)} → {ddmm(preview.period.to)}){preview.period.created && <Badge tone="primary" className="ml-2">sẽ tạo mới</Badge>}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(['added', 'updated', 'unchanged', 'locked'] as const).map((k) => (
              <div key={k} className="rounded-lg bg-surface-2 p-3">
                <p className="text-xs text-muted">{STATUS[k].label}</p>
                <p className="num text-xl font-semibold">{preview.stats[k]}</p>
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Đối soát</p>
            {preview.checks.map((c) => (
              <div key={c.key} className="flex items-start gap-2 text-sm">
                {c.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-danger" />}
                <span className="font-medium">{c.label}</span>
                <span className="text-muted">{c.detail}</span>
              </div>
            ))}
          </div>
          {preview.warnings.map((w) => (
            <Note key={w} tone="warn">
              {w}
            </Note>
          ))}
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Chi tiết</p>
            <Segmented
              size="sm"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'changes', label: 'Mới & cập nhật' },
                { value: 'all', label: 'Tất cả' },
              ]}
            />
          </div>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-line">
            <table className="w-full text-sm">
              <tbody>
                {rows.map((d) => (
                  <tr key={d.extId} className="border-b border-line last:border-0">
                    <td className="px-3 py-1.5 whitespace-nowrap text-muted">{ddmm(d.occurredAt)}</td>
                    <td className="px-3 py-1.5">
                      <div className="truncate">{d.counterparty ?? d.extId}</div>
                      {(d.ruleName || d.changes) && (
                        <div className="text-xs text-muted">
                          {d.ruleName && `Quy tắc: ${d.ruleName}`} {d.changes && `Đổi: ${d.changes.join(', ')}`}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <Badge tone={STATUS[d.status].tone}>{STATUS[d.status].label}</Badge>
                    </td>
                    <td className={cx('num px-3 py-1.5 text-right whitespace-nowrap', d.direction === 'in' && 'text-money-in')}>
                      {d.direction === 'in' ? '+' : '−'}
                      {vnd(d.amount)}
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td className="px-3 py-6 text-center text-muted">Không có gì mới.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {run.error && <ErrorBox error={run.error} />}
        </div>
      )}
    </Modal>
  );
}
