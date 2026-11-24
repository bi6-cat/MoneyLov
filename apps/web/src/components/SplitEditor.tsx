import { useMemo, useState } from 'react';
import { ChevronDown, Minus, Plus, Trash2 } from 'lucide-react';
import { computeSplit, type SplitConfig } from '@moneylov/core';
import type { Meta } from '../lib/api';
import { MODE_LABEL, vnd } from '../lib/format';
import { Avatar } from './bits';
import { Button, Checkbox, Chip, cx, IconButton, Input, MoneyInput, Segmented, Select } from './ui';

export type SplitCfg = Omit<SplitConfig, 'total'>;

const MODES = ['equal', 'items', 'exact', 'percent', 'shares', 'rent'] as const;

export function SplitEditor({ value, onChange, total, meta }: { value: SplitCfg; onChange: (v: SplitCfg) => void; total: number; meta: Meta }) {
  const hub = meta.settings.hub;
  const people = meta.people.filter((p) => p.active);
  const room = people.filter((p) => p.role === 'roommate').map((p) => p.code);
  const set = (patch: Partial<SplitCfg>) => onChange({ ...value, ...patch });
  const [advanced, setAdvanced] = useState(!!(value.covers?.length || value.privates?.length || value.adjustments?.length || value.payers?.length));

  const preview = useMemo(() => {
    try {
      const cfg: SplitConfig = { ...value, total };
      if (cfg.mode === 'rent' && !cfg.people?.length) cfg.people = room;
      return { r: computeSplit(cfg, hub) };
    } catch (e: any) {
      return { error: e.message as string };
    }
  }, [value, total, hub, room.join()]);

  const toggle = (list: string[] | undefined, code: string) => (list?.includes(code) ? list.filter((x) => x !== code) : [...(list ?? []), code]);
  const name = (c: string) => people.find((p) => p.code === c)?.name ?? c;

  return (
    <div className="space-y-4">
      <Segmented
        value={value.mode}
        onChange={(mode) => set({ mode, ...(mode === 'rent' ? { people: room } : {}) })}
        options={MODES.map((m) => ({ value: m, label: MODE_LABEL[m] }))}
        size="sm"
      />

      {(value.mode === 'equal' || value.mode === 'rent') && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {people.map((p) => (
              <Chip key={p.code} active={!!value.people?.includes(p.code)} onClick={() => set({ people: toggle(value.people, p.code) })} title={p.role === 'roommate' ? 'Ở phòng' : 'Ăn chung'}>
                {p.name}
              </Chip>
            ))}
          </div>
          <div className="flex gap-2 text-xs">
            <button type="button" className="text-primary hover:underline" onClick={() => set({ people: room })}>
              Cả phòng ({room.length})
            </button>
            <button type="button" className="text-primary hover:underline" onClick={() => set({ people: [] })}>
              Bỏ chọn
            </button>
          </div>
        </div>
      )}

      {value.mode === 'items' && <ItemsEditor value={value} onChange={onChange} meta={meta} total={total} />}

      {(value.mode === 'exact' || value.mode === 'percent' || value.mode === 'shares') && (
        <PerPerson
          meta={meta}
          kind={value.mode}
          values={(value.mode === 'exact' ? value.amounts : value.mode === 'percent' ? value.percents : value.weights) ?? {}}
          onChange={(m) => set(value.mode === 'exact' ? { amounts: m } : value.mode === 'percent' ? { percents: m } : { weights: m })}
          total={total}
        />
      )}

      <button type="button" onClick={() => setAdvanced(!advanced)} className="flex items-center gap-1 text-sm font-medium text-muted hover:text-fg">
        <ChevronDown className={cx('size-4 transition', advanced && 'rotate-180')} />
        Tình huống đặc biệt: người bao, đồ riêng, điều chỉnh, người khác trả
      </button>
      {advanced && <Advanced value={value} set={set} meta={meta} total={total} />}

      <div className="rounded-lg border border-line bg-surface-2 p-3">
        {'error' in preview ? (
          <p className="text-sm text-danger">{preview.error}</p>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between text-xs text-muted">
              <span>Mỗi người phải chịu</span>
              <span className="num">Tổng {vnd(total)} đ</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
              {Object.entries(preview.r!.shares)
                .filter(([, v]) => v)
                .map(([p, v]) => (
                  <div key={p} className="flex items-center gap-2 text-sm">
                    <Avatar p={{ code: p, name: name(p) }} size="sm" />
                    <span className="flex-1 truncate">{name(p)}</span>
                    <span className="num font-medium">{vnd(v)}</span>
                  </div>
                ))}
            </div>
            {preview.r!.warnings.map((w) => (
              <p key={w} className="mt-2 text-xs text-warn">
                {w}
              </p>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function PerPerson({ meta, kind, values, onChange, total }: { meta: Meta; kind: 'exact' | 'percent' | 'shares'; values: Record<string, number>; onChange: (m: Record<string, number>) => void; total: number }) {
  const people = meta.people.filter((p) => p.active);
  const sum = Object.values(values).reduce((a, b) => a + b, 0);
  const upd = (c: string, v: number | null) => {
    const m = { ...values };
    if (!v) delete m[c];
    else m[c] = v;
    onChange(m);
  };
  return (
    <div className="space-y-1.5">
      {people.map((p) => (
        <div key={p.code} className="flex items-center gap-2">
          <Avatar p={p} size="sm" />
          <span className="flex-1 text-sm">{p.name}</span>
          {kind === 'exact' ? (
            <MoneyInput className="w-32" value={values[p.code] ?? null} onChange={(v) => upd(p.code, v)} />
          ) : kind === 'percent' ? (
            <div className="flex items-center gap-1">
              <Input type="number" min={0} max={100} className="num w-20 text-right" value={values[p.code] ?? ''} onChange={(e) => upd(p.code, e.target.value === '' ? null : Number(e.target.value))} />
              <span className="text-sm text-muted">%</span>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <IconButton label="Bớt" type="button" onClick={() => upd(p.code, Math.max(0, (values[p.code] ?? 0) - 1))}>
                <Minus className="size-4" />
              </IconButton>
              <span className="num w-6 text-center text-sm font-medium">{values[p.code] ?? 0}</span>
              <IconButton label="Thêm" type="button" onClick={() => upd(p.code, (values[p.code] ?? 0) + 1)}>
                <Plus className="size-4" />
              </IconButton>
            </div>
          )}
        </div>
      ))}
      <p className={cx('text-right text-xs', kind === 'exact' && sum !== total ? 'text-warn' : 'text-muted')}>
        {kind === 'exact' ? `Đã nhập ${vnd(sum)} / ${vnd(total)} đ${sum !== total ? ' (sẽ chia theo tỉ lệ)' : ''}` : kind === 'percent' ? `Tổng ${sum}%` : `${sum} phần`}
      </p>
    </div>
  );
}

function ItemsEditor({ value, onChange, meta, total }: { value: SplitCfg; onChange: (v: SplitCfg) => void; meta: Meta; total: number }) {
  const items = value.items ?? [];
  const people = meta.people.filter((p) => p.active);
  const setItems = (items: SplitCfg['items']) => onChange({ ...value, items });
  const sum = items.reduce((a, i) => a + i.price, 0);
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="space-y-1.5 rounded-lg border border-line p-2">
          <div className="flex gap-2">
            <Input value={it.name} placeholder="Tên món" onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <MoneyInput className="w-32" value={it.price} onChange={(v) => setItems(items.map((x, j) => (j === i ? { ...x, price: v ?? 0 } : x)))} />
            <IconButton label="Xoá món" type="button" onClick={() => setItems(items.filter((_, j) => j !== i))}>
              <Trash2 className="size-4" />
            </IconButton>
          </div>
          <div className="flex flex-wrap gap-1">
            {people.map((p) => (
              <button
                key={p.code}
                type="button"
                onClick={() => setItems(items.map((x, j) => (j === i ? { ...x, people: x.people.includes(p.code) ? x.people.filter((c) => c !== p.code) : [...x.people, p.code] } : x)))}
                className={cx('rounded-full border px-2 py-0.5 text-xs', it.people.includes(p.code) ? 'border-primary bg-primary-soft text-primary' : 'border-line text-muted')}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      ))}
      <Button type="button" size="sm" icon={<Plus className="size-4" />} onClick={() => setItems([...items, { name: '', price: 0, people: [] }])}>
        Thêm món
      </Button>
      {items.length > 0 && (
        <p className="text-xs text-muted">
          Giá gốc {vnd(sum)} đ, thực trả {vnd(total)} đ. {sum !== total && `Chênh ${vnd(total - sum)} đ (ship, phí, giảm giá) được chia theo tỉ lệ giá món.`}
        </p>
      )}
    </div>
  );
}

function Advanced({ value, set, meta, total }: { value: SplitCfg; set: (p: Partial<SplitCfg>) => void; meta: Meta; total: number }) {
  const people = meta.people.filter((p) => p.active);
  const hub = meta.settings.hub;
  const covers = value.covers ?? [];
  const privates = value.privates ?? [];
  const adjustments = value.adjustments ?? [];
  const payers = value.payers ?? [];
  return (
    <div className="space-y-4 rounded-lg border border-dashed border-line p-3">
      <section className="space-y-2">
        <h4 className="text-sm font-medium">Người bao</h4>
        <p className="text-xs text-muted">Ví dụ "Duy bao 300k": Duy gánh 300k, phần còn lại chia như trên. Chọn "cả bill" nếu một người bao hết.</p>
        {covers.map((c, i) => (
          <RemovableRow key={i} onRemove={() => set({ covers: covers.filter((_, j) => j !== i) })}>
            <PersonSelect people={people} v={c.person} onChange={(person) => set({ covers: covers.map((x, j) => (j === i ? { ...x, person } : x)) })} />
            {!c.full && <MoneyInput className="w-32" value={c.amount ?? null} onChange={(amount) => set({ covers: covers.map((x, j) => (j === i ? { ...x, amount: amount ?? 0 } : x)) })} />}
            <Checkbox checked={!!c.full} onChange={(full) => set({ covers: covers.map((x, j) => (j === i ? { ...x, full } : x)) })} label="Cả bill" />
          </RemovableRow>
        ))}
        <Button type="button" size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => set({ covers: [...covers, { person: people[1]?.code ?? hub, amount: 0 }] })}>
          Thêm người bao
        </Button>
      </section>

      <section className="space-y-2">
        <h4 className="text-sm font-medium">Đồ riêng trong bill</h4>
        <p className="text-xs text-muted">Món của riêng một người, không chia. Đồ riêng của bạn được tính vào chi tiêu Riêng.</p>
        {privates.map((c, i) => (
          <RemovableRow key={i} onRemove={() => set({ privates: privates.filter((_, j) => j !== i) })}>
            <PersonSelect people={people} v={c.person} onChange={(person) => set({ privates: privates.map((x, j) => (j === i ? { ...x, person } : x)) })} />
            <MoneyInput className="w-32" value={c.amount} onChange={(amount) => set({ privates: privates.map((x, j) => (j === i ? { ...x, amount: amount ?? 0 } : x)) })} />
            <Input placeholder="Ghi chú" value={c.note ?? ''} onChange={(e) => set({ privates: privates.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)) })} />
          </RemovableRow>
        ))}
        <Button type="button" size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => set({ privates: [...privates, { person: hub, amount: 0 }] })}>
          Thêm đồ riêng
        </Button>
      </section>

      <section className="space-y-2">
        <h4 className="text-sm font-medium">Điều chỉnh ±</h4>
        <p className="text-xs text-muted">Cộng/trừ cho một người sau khi chia; phần chênh được bù đều cho những người còn lại.</p>
        {adjustments.map((c, i) => (
          <RemovableRow key={i} onRemove={() => set({ adjustments: adjustments.filter((_, j) => j !== i) })}>
            <PersonSelect people={people} v={c.person} onChange={(person) => set({ adjustments: adjustments.map((x, j) => (j === i ? { ...x, person } : x)) })} />
            <MoneyInput className="w-32" value={c.delta} onChange={(delta) => set({ adjustments: adjustments.map((x, j) => (j === i ? { ...x, delta: delta ?? 0 } : x)) })} />
          </RemovableRow>
        ))}
        <Button type="button" size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => set({ adjustments: [...adjustments, { person: hub, delta: 0 }] })}>
          Thêm điều chỉnh
        </Button>
      </section>

      <section className="space-y-2">
        <h4 className="text-sm font-medium">Ai đã trả bill</h4>
        <p className="text-xs text-muted">Để trống nếu bạn trả hết. Nếu người khác trả (hoặc trả chung), phần họ đã trả được trừ vào nợ.</p>
        {payers.map((c, i) => (
          <RemovableRow key={i} onRemove={() => set({ payers: payers.filter((_, j) => j !== i) })}>
            <PersonSelect people={people} v={c.person} onChange={(person) => set({ payers: payers.map((x, j) => (j === i ? { ...x, person } : x)) })} />
            <MoneyInput className="w-32" value={c.amount} onChange={(amount) => set({ payers: payers.map((x, j) => (j === i ? { ...x, amount: amount ?? 0 } : x)) })} />
          </RemovableRow>
        ))}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          icon={<Plus className="size-4" />}
          onClick={() => set({ payers: payers.length ? [...payers, { person: people[1]?.code ?? hub, amount: 0 }] : [{ person: hub, amount: total }] })}
        >
          {payers.length ? 'Thêm người trả' : 'Nhiều người trả / người khác trả'}
        </Button>
      </section>
    </div>
  );
}

function PersonSelect({ v, onChange, people }: { v: string; onChange: (c: string) => void; people: Meta['people'] }) {
  return (
    <Select className="w-32" value={v} onChange={(e) => onChange(e.target.value)}>
      {people.map((p) => (
        <option key={p.code} value={p.code}>
          {p.name}
        </option>
      ))}
    </Select>
  );
}

function RemovableRow({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-2">
      {children}
      <IconButton label="Xoá" type="button" onClick={onRemove}>
        <Trash2 className="size-4" />
      </IconButton>
    </div>
  );
}
