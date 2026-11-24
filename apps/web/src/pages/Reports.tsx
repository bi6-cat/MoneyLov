import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApi, type Meta } from '../lib/api';
import { ddmm, short, vnd } from '../lib/format';
import { CatIcon } from '../components/bits';
import { Button, Card, CardHeader, Empty, ErrorBox, Input, PageHeader, Segmented, Spinner } from '../components/ui';

type Preset = 'month' | '3m' | '12m' | 'period' | 'custom';
const iso = (d: Date) => d.toISOString().slice(0, 10);
const SCOPES = [
  { key: 'Rieng', label: 'Riêng', color: 'var(--series-1)' },
  { key: 'Chung', label: 'Chung', color: 'var(--series-2)' },
  { key: 'Nha', label: 'Nhà', color: 'var(--series-3)' },
] as const;

function range(p: Preset, meta: Meta): { from: string; to: string } {
  const now = new Date();
  const to = iso(now);
  if (p === 'month') return { from: iso(new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1))), to };
  if (p === '3m') return { from: iso(new Date(Date.UTC(now.getFullYear(), now.getMonth() - 2, 1))), to };
  if (p === 'period') {
    const per = meta.periods[0];
    if (per) return { from: per.fromDate, to: per.toDate };
  }
  return { from: iso(new Date(Date.UTC(now.getFullYear(), now.getMonth() - 11, 1))), to };
}

const axisTick = { fill: 'var(--muted)', fontSize: 12 };

function ChartTooltip({ active, payload, label, labelFmt }: any) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((a: number, p: any) => a + (p.value ?? 0), 0);
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium">{labelFmt ? labelFmt(label) : label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="size-2.5 rounded-sm" style={{ background: p.color }} />
          <span className="flex-1 text-muted">{p.name}</span>
          <span className="num font-medium">{vnd(p.value)}</span>
        </div>
      ))}
      {payload.length > 1 && (
        <div className="mt-1 flex justify-between border-t border-line pt-1">
          <span className="text-muted">Tổng</span>
          <span className="num font-medium">{vnd(total)}</span>
        </div>
      )}
    </div>
  );
}

export default function Reports({ meta }: { meta: Meta }) {
  const [preset, setPreset] = useState<Preset>('12m');
  const [custom, setCustom] = useState(range('12m', meta));
  const r = preset === 'custom' ? custom : range(preset, meta);
  const q = useApi<any>(['reports', r.from, r.to], `/reports?from=${r.from}&to=${r.to}`);
  const [table, setTable] = useState(false);
  const d = q.data;
  const maxCat = useMemo(() => Math.max(1, ...(d?.byCategory ?? []).map((c: any) => c.amount)), [d]);
  // Điền 0 cho ngày không chi để đường không nối tắt qua các ngày trống
  const days = useMemo(() => {
    if (!d?.byDay?.length) return [];
    const m = new Map<string, number>(d.byDay.map((x: any) => [x.date, x.amount]));
    const out: { date: string; amount: number }[] = [];
    const start = Date.parse(d.byDay[0].date + 'T00:00:00Z');
    const end = Date.parse(d.byDay[d.byDay.length - 1].date + 'T00:00:00Z');
    for (let t = start; t <= end; t += 86400_000) {
      const k = new Date(t).toISOString().slice(0, 10);
      out.push({ date: k, amount: m.get(k) ?? 0 });
    }
    return out;
  }, [d]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Báo cáo"
        sub="Chi tiêu của bạn: Riêng + phần Chung + phần Nhà (không gồm phần người khác trả lại)"
        actions={
          <Button icon={<Download className="size-4" />} onClick={() => window.open(`/api/reports/export.csv?from=${r.from}&to=${r.to}`, '_blank')}>
            Xuất CSV
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={preset}
          onChange={setPreset}
          options={[
            { value: 'month', label: 'Tháng này' },
            { value: '3m', label: '3 tháng' },
            { value: '12m', label: '12 tháng' },
            { value: 'period', label: 'Đợt gần nhất' },
            { value: 'custom', label: 'Tuỳ chọn' },
          ]}
        />
        {preset === 'custom' && (
          <div className="flex items-center gap-2">
            <Input type="date" className="w-auto" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
            <span className="text-muted">→</span>
            <Input type="date" className="w-auto" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
          </div>
        )}
      </div>

      {q.isLoading ? (
        <Spinner />
      ) : q.error ? (
        <ErrorBox error={q.error} />
      ) : !d.total ? (
        <Card>
          <Empty title="Chưa có chi tiêu đã duyệt trong khoảng này" />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Tổng chi của tôi" value={vnd(d.total)} />
            <Kpi label="Trung bình / ngày" value={vnd(d.perDay)} />
            <Kpi label="Thu nhập" value={vnd(d.income)} />
            <Kpi label="Riêng · Chung · Nhà" value={`${short(d.scope.Rieng)} · ${short(d.scope.Chung)} · ${short(d.scope.Nha)}`} small />
          </div>

          <Card>
            <CardHeader
              title="Chi theo tháng"
              sub="Phân theo Riêng / Chung / Nhà"
              right={
                <Segmented
                  size="sm"
                  value={table ? 'table' : 'chart'}
                  onChange={(v) => setTable(v === 'table')}
                  options={[
                    { value: 'chart', label: 'Biểu đồ' },
                    { value: 'table', label: 'Bảng' },
                  ]}
                />
              }
            />
            <div className="flex flex-wrap gap-4 px-4 text-xs text-muted">
              {SCOPES.map((s) => (
                <span key={s.key} className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm" style={{ background: s.color }} />
                  {s.label}
                </span>
              ))}
            </div>
            {table ? (
              <div className="overflow-x-auto px-4 pb-4">
                <table className="mt-2 w-full text-sm">
                  <thead className="text-xs text-muted">
                    <tr>
                      <th className="py-1 text-left font-medium">Tháng</th>
                      {SCOPES.map((s) => (
                        <th key={s.key} className="py-1 text-right font-medium">
                          {s.label}
                        </th>
                      ))}
                      <th className="py-1 text-right font-medium">Tổng</th>
                      <th className="py-1 text-right font-medium">Thu nhập</th>
                    </tr>
                  </thead>
                  <tbody className="num">
                    {d.byMonth.map((m: any) => (
                      <tr key={m.month} className="border-t border-line">
                        <td className="py-1.5">{m.month.slice(5, 7)}/{m.month.slice(0, 4)}</td>
                        <td className="py-1.5 text-right">{vnd(m.Rieng)}</td>
                        <td className="py-1.5 text-right">{vnd(m.Chung)}</td>
                        <td className="py-1.5 text-right">{vnd(m.Nha)}</td>
                        <td className="py-1.5 text-right font-medium">{vnd(m.Rieng + m.Chung + m.Nha)}</td>
                        <td className="py-1.5 text-right">{vnd(m.income)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="h-72 px-2 pb-3">
                <ResponsiveContainer>
                  <BarChart data={d.byMonth} margin={{ top: 12, right: 12, left: 0, bottom: 0 }} barCategoryGap="30%">
                    <CartesianGrid vertical={false} stroke="var(--grid)" />
                    <XAxis dataKey="month" tickFormatter={(m) => `T${Number(m.slice(5, 7))}`} tick={axisTick} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={short} tick={axisTick} axisLine={false} tickLine={false} width={48} />
                    <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTooltip labelFmt={(m: string) => `Tháng ${Number(m.slice(5, 7))}/${m.slice(0, 4)}`} />} />
                    {SCOPES.map((s, i) => (
                      <Bar key={s.key} dataKey={s.key} name={s.label} stackId="a" fill={s.color} stroke="var(--surface)" strokeWidth={2} maxBarSize={44} radius={i === SCOPES.length - 1 ? [4, 4, 0, 0] : 0} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Theo danh mục" sub={`${d.byCategory.length} danh mục`} />
              <ul className="space-y-3 px-4 pb-4">
                {d.byCategory.map((c: any) => (
                  <li key={c.name} className="flex items-center gap-3" title={`${c.count} khoản`}>
                    <CatIcon cat={c} size="sm" />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex justify-between gap-2 text-sm">
                        <span className="truncate">{c.name}</span>
                        <span className="num font-medium">
                          {vnd(c.amount)} <span className="font-normal text-muted">· {Math.round((c.amount / d.total) * 100)}%</span>
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full rounded-full" style={{ width: `${(c.amount / maxCat) * 100}%`, background: 'var(--series-1)' }} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <CardHeader title="Chi theo ngày" sub="Phần của bạn mỗi ngày" />
              <div className="h-64 px-2 pb-3">
                <ResponsiveContainer>
                  <LineChart data={days} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--grid)" />
                    <XAxis dataKey="date" tickFormatter={ddmm} tick={axisTick} axisLine={false} tickLine={false} minTickGap={24} />
                    <YAxis tickFormatter={short} tick={axisTick} axisLine={false} tickLine={false} width={48} />
                    <Tooltip cursor={{ stroke: 'var(--muted)', strokeDasharray: '3 3' }} content={<ChartTooltip labelFmt={(x: string) => ddmm(x) + '/' + x.slice(0, 4)} />} />
                    <Line type="linear" dataKey="amount" name="Chi" stroke="var(--series-1)" strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader title="Chi nhiều nhất" sub="Theo tên khoản" />
            <ul className="divide-y divide-line px-4 pb-2 text-sm">
              {d.top.map((t: any, i: number) => (
                <li key={t.name} className="flex items-center gap-3 py-2">
                  <span className="num w-5 text-muted">{i + 1}</span>
                  <span className="flex-1 truncate">{t.name}</span>
                  <span className="num font-medium">{vnd(t.amount)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}

const Kpi = ({ label, value, small }: { label: string; value: string; small?: boolean }) => (
  <Card className="p-4">
    <p className="text-xs text-muted">{label}</p>
    <p className={small ? 'num mt-1 text-base font-semibold' : 'num mt-1 text-xl font-semibold'}>{value}</p>
  </Card>
);
