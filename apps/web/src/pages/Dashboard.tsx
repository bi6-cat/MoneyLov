import { Link } from 'react-router-dom';
import { ArrowRight, CalendarClock, Inbox } from 'lucide-react';
import { useApi, type Meta } from '../lib/api';
import { ddmm, monthLabel, short, vnd } from '../lib/format';
import { ACCOUNT_ICONS, Avatar } from '../components/bits';
import { Badge, Button, Card, CardHeader, cx, ErrorBox, Money, PageHeader, Progress, Spinner } from '../components/ui';

export default function Dashboard({ meta }: { meta: Meta }) {
  const q = useApi<any>(['dashboard'], '/dashboard');
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data;
  const total = d.budget.items.find((b: any) => !b.category);
  const catBudgets = d.budget.items.filter((b: any) => b.category).slice(0, 4);

  return (
    <div className="space-y-4">
      <PageHeader title="Tổng quan" sub={monthLabel(d.month)} />

      {d.pending > 0 && (
        <Link to="/review" className="flex items-center gap-3 rounded-xl border border-warn/40 bg-warn-soft p-4 text-warn">
          <Inbox className="size-5" />
          <span className="flex-1 font-medium">{d.pending} giao dịch đang chờ duyệt</span>
          <ArrowRight className="size-4" />
        </Link>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm text-muted">Chi tiêu của tôi tháng này</p>
          <p className="num mt-1 text-2xl font-semibold">{vnd(d.spentThisMonth)} đ</p>
          <p className="mt-1 text-xs text-muted">
            Riêng {short(d.scope.Rieng)} · Chung {short(d.scope.Chung)} · Nhà {short(d.scope.Nha)}
          </p>
          {total && (
            <div className="mt-3 space-y-1">
              <Progress value={total.pct} tone={total.level} />
              <p className="text-xs text-muted">
                {total.remaining >= 0 ? `Còn ${vnd(total.remaining)} đ` : `Vượt ${vnd(-total.remaining)} đ`} / ngân sách {vnd(total.limit)} đ
              </p>
            </div>
          )}
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted">Tổng số dư các ví</p>
          <p className={cx('num mt-1 text-2xl font-semibold', d.netWorth < 0 && 'text-danger')}>{vnd(d.netWorth)} đ</p>
          <p className="mt-1 text-xs text-muted">Thẻ tín dụng tính số âm (dư nợ)</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted">Người khác đang nợ tôi</p>
          <p className="num mt-1 text-2xl font-semibold">{vnd((d.period?.rows ?? []).reduce((a: number, r: any) => a + Math.max(0, r.conLai), 0) + (d.loans.lend ?? 0))} đ</p>
          <p className="mt-1 text-xs text-muted">
            Đợt {d.period?.name ?? '—'} {d.loans.lend ? `+ cho vay ngoài ${short(d.loans.lend)}` : ''} {d.loans.borrow ? `· tôi đang nợ ${short(d.loans.borrow)}` : ''}
          </p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Ví & tài khoản" right={<Link to="/settings" className="text-sm text-primary">Quản lý</Link>} />
          <ul className="divide-y divide-line px-4 pb-2">
            {d.accounts.map((a: any) => {
              const I = ACCOUNT_ICONS[a.type as keyof typeof ACCOUNT_ICONS];
              return (
                <li key={a.id} className="flex items-center gap-3 py-2.5">
                  <span className="flex size-8 items-center justify-center rounded-lg" style={{ background: `${a.color}22`, color: a.color }}>
                    <I className="size-4" />
                  </span>
                  <span className="flex-1 text-sm">{a.name}</span>
                  <span className={cx('num text-sm font-medium', a.balance < 0 && 'text-danger')}>{vnd(a.balance)}</span>
                </li>
              );
            })}
          </ul>
        </Card>

        {d.period && (
          <Card>
            <CardHeader title={`Chia tiền · ${d.period.name}`} right={<Link to={`/split/${d.period.id}`} className="text-sm text-primary">Xem đợt</Link>} />
            <ul className="divide-y divide-line px-4 pb-2">
              {d.period.rows.map((r: any) => (
                <li key={r.person} className="flex items-center gap-3 py-2.5">
                  <Avatar p={{ code: r.person, name: r.name }} size="sm" />
                  <span className="flex-1 text-sm">{r.name}</span>
                  <span className={cx('num text-sm font-medium', r.conLai < 0 && 'text-ok')}>{r.conLai < 0 ? `trả dư ${vnd(-r.conLai)}` : vnd(r.conLai)}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card>
          <CardHeader title="Ngân sách tháng" right={<Link to="/budgets" className="text-sm text-primary">Chi tiết</Link>} />
          <div className="space-y-3 px-4 pb-4">
            {catBudgets.length ? (
              catBudgets.map((b: any) => (
                <div key={b.budget.id} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>{b.category.name}</span>
                    <span className="num text-muted">
                      {short(b.spent)} / {short(b.limit)}
                    </span>
                  </div>
                  <Progress value={b.pct} tone={b.level} />
                </div>
              ))
            ) : (
              <div className="flex items-center justify-between gap-3 text-sm text-muted">
                Chưa đặt ngân sách cho danh mục nào.
                <Link to="/budgets">
                  <Button size="sm">Đặt ngân sách</Button>
                </Link>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Sắp đến hạn" right={<Link to="/plans" className="text-sm text-primary">Định kỳ</Link>} />
          <ul className="divide-y divide-line px-4 pb-2">
            {d.upcoming.slice(0, 6).map((u: any, i: number) => (
              <li key={i} className="flex items-center gap-3 py-2.5 text-sm">
                <CalendarClock className="size-4 text-muted" />
                <span className="flex-1">{u.recurring.name}</span>
                <span className="text-xs text-muted">{ddmm(u.due)}</span>
                <Badge tone={u.status === 'paid' ? 'ok' : u.status === 'overdue' ? 'danger' : 'neutral'}>{u.status === 'paid' ? 'Đã trả' : u.status === 'overdue' ? 'Quá hạn' : 'Sắp tới'}</Badge>
                <Money value={u.recurring.amount} className="text-sm" />
              </li>
            ))}
            {!d.upcoming.length && <li className="py-3 text-sm text-muted">Không có khoản nào trong 2 tuần tới.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
