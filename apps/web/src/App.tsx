import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { CalendarClock, Inbox, LayoutDashboard, List, LogOut, Menu, Moon, PieChart, Plus, Settings, Sun, Target, Users, X } from 'lucide-react';
import { api, useApi, useMeta } from './lib/api';
import { Badge, Button, cx, ErrorBox, Input, Spinner } from './components/ui';
import { AddTxModal } from './components/AddTxModal';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Review = lazy(() => import('./pages/Review'));
const Transactions = lazy(() => import('./pages/Transactions'));
const Split = lazy(() => import('./pages/Split'));
const Budgets = lazy(() => import('./pages/Budgets'));
const Reports = lazy(() => import('./pages/Reports'));
const Plans = lazy(() => import('./pages/Plans'));
const SettingsPage = lazy(() => import('./pages/Settings'));

const NAV = [
  { to: '/', label: 'Tổng quan', icon: LayoutDashboard, mobile: true },
  { to: '/review', label: 'Duyệt', icon: Inbox, mobile: true, badge: true },
  { to: '/transactions', label: 'Giao dịch', icon: List, mobile: true },
  { to: '/split', label: 'Chia tiền', icon: Users, mobile: true },
  { to: '/budgets', label: 'Ngân sách', icon: Target },
  { to: '/reports', label: 'Báo cáo', icon: PieChart },
  { to: '/plans', label: 'Định kỳ & nợ', icon: CalendarClock },
  { to: '/settings', label: 'Cài đặt', icon: Settings },
];

function ThemeToggle() {
  const [theme, setTheme] = useState<string>(() => document.documentElement.dataset.theme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  return (
    <button
      className="flex h-9 w-full items-center gap-3 rounded-lg px-3 text-sm text-muted hover:bg-surface-2 hover:text-fg"
      onClick={() => {
        const next = theme === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem('theme', next);
        } catch {}
        setTheme(next);
      }}
    >
      {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
      {theme === 'dark' ? 'Giao diện sáng' : 'Giao diện tối'}
    </button>
  );
}

function Shell() {
  const meta = useMeta();
  const [adding, setAdding] = useState(false);
  const [more, setMore] = useState(false);
  const loc = useLocation();
  useEffect(() => setMore(false), [loc.pathname]);
  const pending = meta.data?.pending ?? 0;

  const logout = async () => {
    await api('/auth/logout', { body: {} });
    location.reload();
  };

  const link = (n: (typeof NAV)[number]) => (
    <NavLink
      key={n.to}
      to={n.to}
      end={n.to === '/'}
      className={({ isActive }) => cx('flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium', isActive ? 'bg-primary-soft text-primary' : 'text-muted hover:bg-surface-2 hover:text-fg')}
    >
      <n.icon className="size-4" />
      <span className="flex-1">{n.label}</span>
      {n.badge && pending > 0 && <Badge tone="warn">{pending}</Badge>}
    </NavLink>
  );

  return (
    <div className="min-h-screen lg:pl-60">
      {/* Thanh bên (desktop) */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-line bg-surface px-3 py-4 lg:flex">
        <div className="mb-4 flex items-center gap-2 px-3">
          <img src="/icon.svg" className="size-7" alt="" />
          <span className="font-semibold">MoneyLov</span>
        </div>
        <Button variant="primary" className="mb-4" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
          Thêm giao dịch
        </Button>
        <nav className="flex-1 space-y-0.5">{NAV.map(link)}</nav>
        <div className="space-y-0.5 border-t border-line pt-3">
          <ThemeToggle />
          <button className="flex h-9 w-full items-center gap-3 rounded-lg px-3 text-sm text-muted hover:bg-surface-2 hover:text-fg" onClick={logout}>
            <LogOut className="size-4" /> Đăng xuất
          </button>
        </div>
      </aside>

      <main className="mx-auto max-w-6xl px-4 pt-4 pb-28 sm:px-6 lg:pt-8 lg:pb-12">
        {meta.error ? (
          <ErrorBox error={meta.error} />
        ) : !meta.data ? (
          <Spinner />
        ) : (
          <Suspense fallback={<Spinner />}>
            <Routes>
              <Route path="/" element={<Dashboard meta={meta.data} />} />
              <Route path="/review" element={<Review meta={meta.data} />} />
              <Route path="/transactions" element={<Transactions meta={meta.data} />} />
              <Route path="/split" element={<Split meta={meta.data} />} />
              <Route path="/split/:id" element={<Split meta={meta.data} />} />
              <Route path="/budgets" element={<Budgets meta={meta.data} />} />
              <Route path="/reports" element={<Reports meta={meta.data} />} />
              <Route path="/plans" element={<Plans meta={meta.data} />} />
              <Route path="/settings" element={<SettingsPage meta={meta.data} />} />
            </Routes>
          </Suspense>
        )}
      </main>

      {/* Nút thêm (mobile) */}
      <button
        aria-label="Thêm giao dịch"
        onClick={() => setAdding(true)}
        className="fixed right-4 bottom-20 z-30 flex size-14 items-center justify-center rounded-full bg-primary text-on-primary shadow-lg lg:hidden"
      >
        <Plus className="size-6" />
      </button>

      {/* Thanh dưới (mobile) */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface lg:hidden">
        {NAV.filter((n) => n.mobile).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => cx('relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-primary' : 'text-muted')}>
            <n.icon className="size-5" />
            {n.label}
            {n.badge && pending > 0 && <span className="absolute top-1 right-1/4 min-w-4 rounded-full bg-warn px-1 text-[10px] text-white">{pending}</span>}
          </NavLink>
        ))}
        <button onClick={() => setMore(true)} className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted">
          <Menu className="size-5" />
          Thêm
        </button>
      </nav>
      {more && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMore(false)} />
          <div className="safe-bottom absolute inset-x-0 bottom-0 space-y-1 rounded-t-2xl bg-surface p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold">Mục khác</span>
              <button aria-label="Đóng" onClick={() => setMore(false)}>
                <X className="size-5" />
              </button>
            </div>
            {NAV.filter((n) => !n.mobile).map(link)}
            <ThemeToggle />
            <button className="flex h-9 w-full items-center gap-3 rounded-lg px-3 text-sm text-muted" onClick={logout}>
              <LogOut className="size-4" /> Đăng xuất
            </button>
          </div>
        </div>
      )}

      {meta.data && <AddTxModal open={adding} onClose={() => setAdding(false)} meta={meta.data} />}
    </div>
  );
}

function Login({ setup, onDone }: { setup: boolean; onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (setup && pw !== pw2) return setErr('Hai mật khẩu không khớp');
    setBusy(true);
    try {
      await api(setup ? '/auth/setup' : '/auth/login', { body: { password: pw } });
      onDone();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-surface p-6">
        <div className="flex items-center gap-2">
          <img src="/icon.svg" className="size-8" alt="" />
          <div>
            <h1 className="font-semibold">MoneyLov</h1>
            <p className="text-sm text-muted">{setup ? 'Lần đầu sử dụng: đặt mật khẩu' : 'Đăng nhập'}</p>
          </div>
        </div>
        <Input type="password" autoFocus placeholder="Mật khẩu" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={setup ? 'new-password' : 'current-password'} />
        {setup && <Input type="password" placeholder="Nhập lại mật khẩu" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />}
        {err && <p className="text-sm text-danger">{err}</p>}
        <Button variant="primary" className="w-full" size="lg" loading={busy}>
          {setup ? 'Đặt mật khẩu' : 'Đăng nhập'}
        </Button>
      </form>
    </div>
  );
}

export default function App() {
  const me = useApi(['me'], '/auth/me');
  const status = useApi<{ setup: boolean }>(['auth-status'], '/auth/status');
  const [, force] = useState(0);
  useEffect(() => {
    const h = () => me.refetch();
    window.addEventListener('ml:unauthorized', h);
    return () => window.removeEventListener('ml:unauthorized', h);
  }, []);
  if (me.isLoading || status.isLoading) return <Spinner />;
  if (me.error)
    return (
      <Login
        setup={!!status.data?.setup}
        onDone={() => {
          me.refetch();
          status.refetch();
          force((x) => x + 1);
        }}
      />
    );
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  );
}
