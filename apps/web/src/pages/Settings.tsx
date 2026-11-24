import { useState } from 'react';
import { Copy, Download, KeyRound, Plus, Trash2, Upload } from 'lucide-react';
import { api, useAction, useApi, type Account, type Category, type Meta, type PersonRow } from '../lib/api';
import { copy, vnd } from '../lib/format';
import { ACCOUNT_ICONS, Avatar, CatIcon, CATEGORY_ICONS, SuggestionChip } from '../components/bits';
import { Badge, Button, Card, CardHeader, Checkbox, cx, ErrorBox, Field, IconButton, Input, Modal, MoneyInput, Note, PageHeader, Segmented, Select, Spinner, useToast } from '../components/ui';

type Tab = 'accounts' | 'categories' | 'people' | 'rules' | 'api' | 'data';

export default function Settings({ meta }: { meta: Meta }) {
  const [tab, setTab] = useState<Tab>('accounts');
  return (
    <div>
      <PageHeader title="Cài đặt" />
      <Segmented
        className="mb-4"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'accounts', label: 'Ví' },
          { value: 'categories', label: 'Danh mục' },
          { value: 'people', label: 'Người' },
          { value: 'rules', label: 'Quy tắc' },
          { value: 'api', label: 'API cho Claude' },
          { value: 'data', label: 'Dữ liệu' },
        ]}
      />
      {tab === 'accounts' && <Accounts meta={meta} />}
      {tab === 'categories' && <Categories meta={meta} />}
      {tab === 'people' && <People meta={meta} />}
      {tab === 'rules' && <Rules meta={meta} />}
      {tab === 'api' && <ApiTokens />}
      {tab === 'data' && <DataTab meta={meta} />}
    </div>
  );
}

const ACC_TYPES = { bank: 'Ngân hàng', credit: 'Thẻ tín dụng', cash: 'Tiền mặt', ewallet: 'Ví điện tử', saving: 'Tiết kiệm' };

function Accounts({ meta }: { meta: Meta }) {
  const [edit, setEdit] = useState<Partial<Account> | null>(null);
  return (
    <Card>
      <CardHeader
        title="Ví & tài khoản"
        sub='"Nguồn khi nạp" là tên nguồn trong file nạp (MB, Card 8508…) để gắn giao dịch đúng ví.'
        right={
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEdit({ name: '', type: 'bank', openingBalance: 0, color: '#64748b' })}>
            Thêm ví
          </Button>
        }
      />
      <ul className="divide-y divide-line px-4 pb-2">
        {meta.accounts.map((a) => {
          const I = ACCOUNT_ICONS[a.type];
          return (
            <li key={a.id}>
              <button className={cx('flex w-full items-center gap-3 py-3 text-left', a.archived && 'opacity-50')} onClick={() => setEdit(a)}>
                <span className="flex size-9 items-center justify-center rounded-lg" style={{ background: `${a.color}22`, color: a.color }}>
                  <I className="size-4" />
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-medium">{a.name}</span>
                  <span className="text-xs text-muted">
                    {ACC_TYPES[a.type]} {a.importSource && `· nguồn "${a.importSource}"`} · {a.txCount} giao dịch
                  </span>
                </span>
                <span className={cx('num text-sm font-medium', a.balance < 0 && 'text-danger')}>{vnd(a.balance)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {edit && <AccountModal value={edit} onClose={() => setEdit(null)} />}
    </Card>
  );
}

function AccountModal({ value, onClose }: { value: Partial<Account>; onClose: () => void }) {
  const [v, setV] = useState(value);
  const body = { name: v.name, type: v.type, number: v.number || null, importSource: v.importSource || null, openingBalance: v.openingBalance ?? 0, creditLimit: v.creditLimit ?? null, color: v.color, archived: !!v.archived };
  const save = useAction(() => (v.id ? api(`/accounts/${v.id}`, { method: 'PATCH', body }) : api('/accounts', { body })), { onSuccess: onClose });
  return (
    <Modal
      open
      onClose={onClose}
      title={v.id ? 'Sửa ví' : 'Ví mới'}
      footer={
        <Button variant="primary" disabled={!v.name} loading={save.isPending} onClick={() => save.mutate(undefined)}>
          Lưu
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tên">
          <Input value={v.name ?? ''} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </Field>
        <Field label="Loại">
          <Select value={v.type} onChange={(e) => setV({ ...v, type: e.target.value as any })}>
            {Object.entries(ACC_TYPES).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Số dư đầu" hint="Số dư trước giao dịch đầu tiên trong app. Thẻ tín dụng: dư nợ ghi số âm.">
          <MoneyInput value={v.openingBalance ?? 0} onChange={(openingBalance) => setV({ ...v, openingBalance: openingBalance ?? 0 })} />
        </Field>
        <Field label="Nguồn khi nạp">
          <Input value={v.importSource ?? ''} onChange={(e) => setV({ ...v, importSource: e.target.value })} placeholder="MB, Card 8508…" />
        </Field>
        {v.type === 'credit' && (
          <Field label="Hạn mức">
            <MoneyInput value={v.creditLimit ?? null} onChange={(creditLimit) => setV({ ...v, creditLimit })} />
          </Field>
        )}
        <Field label="Màu">
          <Input type="color" value={v.color} onChange={(e) => setV({ ...v, color: e.target.value })} className="p-1" />
        </Field>
        <Checkbox checked={!!v.archived} onChange={(archived) => setV({ ...v, archived })} label="Ẩn ví này" />
        {save.error && <ErrorBox error={save.error} />}
      </div>
    </Modal>
  );
}

function Categories({ meta }: { meta: Meta }) {
  const [edit, setEdit] = useState<Partial<Category> | null>(null);
  const tops = meta.categories.filter((c) => !c.parentId);
  return (
    <Card>
      <CardHeader
        title="Danh mục"
        right={
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEdit({ name: '', kind: 'expense', icon: 'circle', color: '#94a3b8' })}>
            Thêm
          </Button>
        }
      />
      {(['expense', 'income'] as const).map((k) => (
        <div key={k} className="px-4 pb-3">
          <p className="mb-2 text-xs font-medium text-muted">{k === 'expense' ? 'Chi' : 'Thu'}</p>
          <div className="grid gap-1 sm:grid-cols-2">
            {tops
              .filter((c) => c.kind === k)
              .map((c) => (
                <div key={c.id}>
                  <button className={cx('flex w-full items-center gap-2 rounded-lg p-2 text-left text-sm hover:bg-surface-2', c.archived && 'opacity-50')} onClick={() => setEdit(c)}>
                    <CatIcon cat={c} size="sm" />
                    {c.name}
                  </button>
                  {meta.categories
                    .filter((s) => s.parentId === c.id)
                    .map((s) => (
                      <button key={s.id} className="ml-8 flex items-center gap-2 rounded-lg p-1.5 text-sm text-muted hover:bg-surface-2" onClick={() => setEdit(s)}>
                        {s.name}
                      </button>
                    ))}
                </div>
              ))}
          </div>
        </div>
      ))}
      {edit && <CategoryModal value={edit} meta={meta} onClose={() => setEdit(null)} />}
    </Card>
  );
}

function CategoryModal({ value, meta, onClose }: { value: Partial<Category>; meta: Meta; onClose: () => void }) {
  const [v, setV] = useState(value);
  const body = { name: v.name, kind: v.kind, parentId: v.parentId ?? null, icon: v.icon, color: v.color, archived: !!v.archived };
  const save = useAction(() => (v.id ? api(`/categories/${v.id}`, { method: 'PATCH', body }) : api('/categories', { body })), { onSuccess: onClose });
  return (
    <Modal
      open
      onClose={onClose}
      title={v.id ? 'Sửa danh mục' : 'Danh mục mới'}
      footer={
        <Button variant="primary" disabled={!v.name} loading={save.isPending} onClick={() => save.mutate(undefined)}>
          Lưu
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tên">
          <Input value={v.name ?? ''} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </Field>
        <Field label="Loại">
          <Select value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as any })}>
            <option value="expense">Chi</option>
            <option value="income">Thu</option>
          </Select>
        </Field>
        <Field label="Danh mục cha">
          <Select value={v.parentId ?? ''} onChange={(e) => setV({ ...v, parentId: e.target.value ? Number(e.target.value) : null })}>
            <option value="">— Không —</option>
            {meta.categories
              .filter((c) => !c.parentId && c.id !== v.id && c.kind === v.kind)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Màu">
          <Input type="color" value={v.color} onChange={(e) => setV({ ...v, color: e.target.value })} className="p-1" />
        </Field>
        <Field label="Biểu tượng" className="sm:col-span-2">
          <div className="flex flex-wrap gap-1">
            {Object.keys(CATEGORY_ICONS).map((k) => (
              <button key={k} onClick={() => setV({ ...v, icon: k })} className={cx('rounded-full p-0.5', v.icon === k && 'ring-2 ring-primary')} type="button">
                <CatIcon cat={{ icon: k, color: v.color ?? '#94a3b8' }} size="sm" />
              </button>
            ))}
          </div>
        </Field>
        <Checkbox checked={!!v.archived} onChange={(archived) => setV({ ...v, archived })} label="Ẩn" />
        {save.error && <ErrorBox error={save.error} />}
      </div>
    </Modal>
  );
}

function People({ meta }: { meta: Meta }) {
  const [edit, setEdit] = useState<(Partial<PersonRow> & { isNew?: boolean }) | null>(null);
  return (
    <Card>
      <CardHeader
        title="Người trong phòng"
        sub="Biệt danh dùng để nhận tên trong đơn Grab nhóm. Người được trả hộ (Ngọc) gộp vào cột của người trả."
        right={
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEdit({ isNew: true, code: '', name: '', role: 'food', aliases: [], active: true })}>
            Thêm
          </Button>
        }
      />
      <ul className="divide-y divide-line px-4 pb-2">
        {meta.people.map((p) => (
          <li key={p.code}>
            <button className={cx('flex w-full items-center gap-3 py-3 text-left text-sm', !p.active && 'opacity-50')} onClick={() => setEdit(p)}>
              <Avatar p={p} />
              <span className="flex-1">
                <span className="font-medium">{p.name}</span>
                <span className="block text-xs text-muted">
                  {p.role === 'roommate' ? 'Ở phòng' : 'Ăn chung'} {p.paidBy && `· ${meta.people.find((x) => x.code === p.paidBy)?.name} trả hộ`} {p.aliases.length > 0 && `· ${p.aliases.join(', ')}`}
                </span>
              </span>
              {p.sheetColumn && <Badge>Cột {p.sheetColumn}</Badge>}
            </button>
          </li>
        ))}
      </ul>
      {edit && <PersonModal value={edit} meta={meta} onClose={() => setEdit(null)} />}
    </Card>
  );
}

function PersonModal({ value, meta, onClose }: { value: Partial<PersonRow> & { isNew?: boolean }; meta: Meta; onClose: () => void }) {
  const [v, setV] = useState({ ...value, aliasText: (value.aliases ?? []).join(', ') });
  const body = { code: v.code, name: v.name, role: v.role, paidBy: v.paidBy || null, sheetColumn: v.sheetColumn || null, aliases: v.aliasText.split(',').map((s) => s.trim()).filter(Boolean), active: v.active };
  const save = useAction(() => (v.isNew ? api('/people', { body }) : api(`/people/${encodeURIComponent(v.code!)}`, { method: 'PATCH', body })), { onSuccess: onClose });
  return (
    <Modal
      open
      onClose={onClose}
      title={v.isNew ? 'Người mới' : v.name}
      footer={
        <Button variant="primary" disabled={!v.code || !v.name} loading={save.isPending} onClick={() => save.mutate(undefined)}>
          Lưu
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Mã (1–4 ký tự)" hint="Dùng trong file nạp: Q, D, Cg…">
          <Input value={v.code} disabled={!v.isNew} onChange={(e) => setV({ ...v, code: e.target.value })} />
        </Field>
        <Field label="Tên">
          <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </Field>
        <Field label="Vai trò">
          <Select value={v.role} onChange={(e) => setV({ ...v, role: e.target.value as any })}>
            <option value="roommate">Ở phòng (chia tiền nhà)</option>
            <option value="food">Chỉ ăn chung</option>
          </Select>
        </Field>
        <Field label="Được trả hộ bởi">
          <Select value={v.paidBy ?? ''} onChange={(e) => setV({ ...v, paidBy: e.target.value || null })}>
            <option value="">— Tự trả —</option>
            {meta.people
              .filter((p) => p.code !== v.code)
              .map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Cột trên Google Sheet">
          <Input value={v.sheetColumn ?? ''} onChange={(e) => setV({ ...v, sheetColumn: e.target.value })} />
        </Field>
        <Field label="Biệt danh (cách nhau bằng dấu phẩy)">
          <Input value={v.aliasText} onChange={(e) => setV({ ...v, aliasText: e.target.value })} />
        </Field>
        <Checkbox checked={!!v.active} onChange={(active) => setV({ ...v, active })} label="Đang ở / còn ăn chung" />
        {save.error && <ErrorBox error={save.error} />}
      </div>
    </Modal>
  );
}

function Rules({ meta }: { meta: Meta }) {
  const q = useApi<any[]>(['rules'], '/rules');
  const toggle = useAction((r: any) => api(`/rules/${r.id}`, { method: 'PATCH', body: { enabled: !r.enabled } }));
  const del = useAction((id: number) => api(`/rules/${id}`, { method: 'DELETE' }));
  if (q.isLoading) return <Spinner />;
  return (
    <Card>
      <CardHeader title="Quy tắc đã học" sub={`Quy tắc được xác nhận ≥ ${meta.settings.autoApproveMinConfirmations} lần sẽ tự thay gợi ý của file nạp và đủ điều kiện tự duyệt.`} />
      {!q.data?.length ? (
        <p className="px-4 pb-4 text-sm text-muted">Chưa có. Khi duyệt, tích "Nhớ cách xử lý này" để tạo quy tắc.</p>
      ) : (
        <ul className="divide-y divide-line px-4 pb-2">
          {q.data.map((r) => (
            <li key={r.id} className={cx('flex flex-wrap items-center gap-3 py-3 text-sm', !r.enabled && 'opacity-50')}>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-medium">{r.name}</p>
                <p className="text-xs text-muted">
                  {Object.entries(r.match)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(' · ')}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <SuggestionChip s={r.action} meta={meta} />
                  <Badge tone="ok">✓ {r.confirmations}</Badge>
                  {r.overrides > 0 && <Badge tone="warn">sửa {r.overrides}</Badge>}
                  <Badge>khớp {r.hits}</Badge>
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => toggle.mutate(r)}>
                {r.enabled ? 'Tắt' : 'Bật'}
              </Button>
              <IconButton label="Xoá" onClick={() => del.mutate(r.id)}>
                <Trash2 className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ApiTokens() {
  const q = useApi<any[]>(['tokens'], '/tokens');
  const [name, setName] = useState('Claude Code');
  const [scopes, setScopes] = useState<string[]>(['import', 'read']);
  const [created, setCreated] = useState<string | null>(null);
  const toast = useToast();
  const create = useAction(() => api('/tokens', { body: { name, scopes } }), { onSuccess: (r: any) => setCreated(r.token) });
  const revoke = useAction((id: number) => api(`/tokens/${id}`, { method: 'DELETE' }));
  const origin = location.origin;
  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <h2 className="font-semibold">Tạo token</h2>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Tên">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Checkbox checked={scopes.includes('import')} onChange={(v) => setScopes(v ? [...scopes, 'import'] : scopes.filter((s) => s !== 'import'))} label="Nạp giao dịch" />
          <Checkbox checked={scopes.includes('read')} onChange={(v) => setScopes(v ? [...scopes, 'read'] : scopes.filter((s) => s !== 'read'))} label="Đọc dữ liệu học" />
          <Button variant="primary" icon={<KeyRound className="size-4" />} disabled={!scopes.length} loading={create.isPending} onClick={() => create.mutate(undefined)}>
            Tạo
          </Button>
        </div>
        {created && (
          <Note tone="warn">
            <p className="mb-2">Token chỉ hiện một lần. Lưu vào biến môi trường MONEYLOV_TOKEN trên máy chạy Claude Code.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-surface px-2 py-1 font-mono text-xs break-all text-fg">{created}</code>
              <IconButton
                label="Copy"
                onClick={() => {
                  copy(created);
                  toast('Đã copy token');
                }}
              >
                <Copy className="size-4" />
              </IconButton>
            </div>
          </Note>
        )}
      </Card>
      <Card>
        <CardHeader title="Token đang có" />
        <ul className="divide-y divide-line px-4 pb-2 text-sm">
          {q.data?.map((t) => (
            <li key={t.id} className={cx('flex items-center gap-3 py-2.5', t.revokedAt && 'opacity-50')}>
              <span className="flex-1">
                <span className="font-medium">{t.name}</span> <code className="text-xs text-muted">{t.prefix}…</code>
                <span className="block text-xs text-muted">
                  {t.scopes.join(', ')} · {t.lastUsedAt ? `dùng lần cuối ${new Date(t.lastUsedAt).toLocaleString('vi-VN')}` : 'chưa dùng'}
                </span>
              </span>
              {t.revokedAt ? (
                <Badge>Đã thu hồi</Badge>
              ) : (
                <Button size="sm" variant="ghost" className="text-danger" onClick={() => revoke.mutate(t.id)}>
                  Thu hồi
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <Card className="space-y-2 p-4 text-sm">
        <h2 className="font-semibold">Cách Claude dùng</h2>
        <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 text-xs">{`# Chạy thử (không ghi gì)
curl -sS -X POST "${origin}/api/import?dry_run=1&filename=dot-2026-12-24.json" \\
  -H "Authorization: Bearer $MONEYLOV_TOKEN" -H "Content-Type: application/json" \\
  --data-binary @dot-2026-12-24.json

# Nạp thật: bỏ dry_run=1
# Dữ liệu học trước khi tạo file nạp đợt sau:
curl -sS "${origin}/api/learning-export" -H "Authorization: Bearer $MONEYLOV_TOKEN"`}</pre>
        <p className="text-muted">Định dạng file: xem docs/import-schema.md trong mã nguồn.</p>
      </Card>
    </div>
  );
}

function DataTab({ meta }: { meta: Meta }) {
  const [s, setS] = useState(meta.settings);
  const toast = useToast();
  const save = useAction(() => api('/settings', { method: 'PUT', body: s }), { onSuccess: () => toast('Đã lưu') });
  const [restore, setRestore] = useState<any>(null);
  const [confirm, setConfirm] = useState('');
  const doRestore = useAction(() => api('/restore', { body: { confirm, backup: restore } }), {
    onSuccess: () => {
      toast('Đã khôi phục');
      setRestore(null);
    },
  });
  const [pw, setPw] = useState({ current: '', next: '' });
  const changePw = useAction(() => api('/auth/password', { body: pw }), {
    onSuccess: () => {
      toast('Đã đổi mật khẩu');
      setPw({ current: '', next: '' });
    },
  });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-3 p-4">
        <h2 className="font-semibold">Duyệt & nhắc nợ</h2>
        <Field label="Số lần xác nhận để quy tắc được tự duyệt">
          <Input type="number" min={1} max={50} value={s.autoApproveMinConfirmations} onChange={(e) => setS({ ...s, autoApproveMinConfirmations: Number(e.target.value) })} />
        </Field>
        <Field label="Dòng số tài khoản trong tin nhắn nhắc nợ">
          <Input value={s.bankLine} onChange={(e) => setS({ ...s, bankLine: e.target.value })} />
        </Field>
        <Field label="Người giữ sổ (người ứng tiền)">
          <Select value={s.hub} onChange={(e) => setS({ ...s, hub: e.target.value })}>
            {meta.people.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Button variant="primary" loading={save.isPending} onClick={() => save.mutate(undefined)}>
          Lưu
        </Button>
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="font-semibold">Sao lưu</h2>
        <p className="text-sm text-muted">Toàn bộ dữ liệu ra một file JSON. Server cũng tự sao lưu Postgres hằng ngày.</p>
        <div className="flex flex-wrap gap-2">
          <Button icon={<Download className="size-4" />} onClick={() => window.open('/api/backup', '_blank')}>
            Tải bản sao lưu
          </Button>
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-line px-3.5 text-sm font-medium hover:bg-surface-2">
            <Upload className="size-4" /> Khôi phục từ file
            <input
              type="file"
              accept=".json"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setRestore(JSON.parse(await f.text()));
              }}
            />
          </label>
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="font-semibold">Đổi mật khẩu</h2>
        <Input type="password" placeholder="Mật khẩu hiện tại" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" />
        <Input type="password" placeholder="Mật khẩu mới (≥ 8 ký tự)" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" />
        {changePw.error && <ErrorBox error={changePw.error} />}
        <Button disabled={pw.next.length < 8} loading={changePw.isPending} onClick={() => changePw.mutate(undefined)}>
          Đổi mật khẩu
        </Button>
      </Card>

      <Modal
        open={!!restore}
        onClose={() => setRestore(null)}
        title="Khôi phục dữ liệu"
        footer={
          <Button variant="danger" disabled={confirm !== 'KHOI PHUC'} loading={doRestore.isPending} onClick={() => doRestore.mutate(undefined)}>
            Xoá và khôi phục
          </Button>
        }
      >
        <div className="space-y-3 text-sm">
          <Note tone="warn">Toàn bộ dữ liệu hiện tại sẽ bị xoá và thay bằng bản sao lưu ({restore?.exportedAt?.slice(0, 10)}). Nên tải bản sao lưu hiện tại trước.</Note>
          <Field label='Gõ "KHOI PHUC" để xác nhận'>
            <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          {doRestore.error && <ErrorBox error={doRestore.error} />}
        </div>
      </Modal>
    </div>
  );
}

