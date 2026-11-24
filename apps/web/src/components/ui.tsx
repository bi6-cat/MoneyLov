import { createContext, forwardRef, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { X, Loader2, Check, AlertTriangle, Info } from 'lucide-react';
import { vnd } from '../lib/format';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/* ---------- Button ---------- */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';
const VARIANT: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary hover:opacity-90 shadow-sm',
  secondary: 'bg-surface border border-line text-fg hover:bg-surface-2',
  ghost: 'text-fg hover:bg-surface-2',
  danger: 'bg-danger text-white hover:opacity-90',
  soft: 'bg-primary-soft text-primary hover:opacity-90',
};
export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean; icon?: ReactNode }>(
  ({ variant = 'secondary', size = 'md', loading, icon, className, children, disabled, ...p }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap',
        size === 'sm' ? 'h-8 px-2.5 text-sm' : size === 'lg' ? 'h-11 px-5 text-base' : 'h-9 px-3.5 text-sm',
        VARIANT[variant],
        className,
      )}
      {...p}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  ),
);

export const IconButton = ({ label, className, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) => (
  <button aria-label={label} title={label} className={cx('inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg', className)} {...p}>
    {children}
  </button>
);

/* ---------- Layout bits ---------- */
export const Card = ({ className, children, ...p }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cx('rounded-xl border border-line bg-surface', className)} {...p}>
    {children}
  </div>
);
export const CardHeader = ({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) => (
  <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-2">
    <div className="min-w-0">
      <h2 className="font-semibold">{title}</h2>
      {sub && <p className="text-sm text-muted">{sub}</p>}
    </div>
    {right}
  </div>
);
export const PageHeader = ({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) => (
  <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
    <div className="min-w-0">
      <h1 className="text-xl font-semibold sm:text-2xl">{title}</h1>
      {sub && <p className="text-sm text-muted">{sub}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

type Tone = 'neutral' | 'primary' | 'ok' | 'warn' | 'danger' | 'info';
const TONE: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-muted',
  primary: 'bg-primary-soft text-primary',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
};
export const Badge = ({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) => (
  <span className={cx('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap', TONE[tone], className)}>{children}</span>
);

export const Money = ({ value, direction, className, sign }: { value: number; direction?: 'in' | 'out'; className?: string; sign?: boolean }) => (
  <span className={cx('num font-medium whitespace-nowrap', direction === 'in' && 'text-money-in', value < 0 && sign && 'text-danger', className)}>
    {direction === 'in' ? '+' : direction === 'out' ? '−' : ''}
    {vnd(direction ? Math.abs(value) : value)}
  </span>
);

export const Empty = ({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) => (
  <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
    {icon && <div className="text-muted">{icon}</div>}
    <p className="font-medium">{title}</p>
    {children && <div className="max-w-md text-sm text-muted">{children}</div>}
  </div>
);

export const Spinner = () => (
  <div className="flex justify-center py-12 text-muted">
    <Loader2 className="size-6 animate-spin" />
  </div>
);

export const ErrorBox = ({ error }: { error: unknown }) => (
  <div className="flex items-start gap-2 rounded-lg bg-danger-soft p-3 text-sm text-danger">
    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
    <span>{(error as any)?.message ?? String(error)}</span>
  </div>
);

export const Note = ({ tone = 'info', children }: { tone?: 'info' | 'warn'; children: ReactNode }) => (
  <div className={cx('flex items-start gap-2 rounded-lg p-3 text-sm', tone === 'warn' ? 'bg-warn-soft text-warn' : 'bg-info-soft text-info')}>
    {tone === 'warn' ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <Info className="mt-0.5 size-4 shrink-0" />}
    <div>{children}</div>
  </div>
);

/* ---------- Form ---------- */
const inputCls = 'h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20';
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => <input ref={ref} className={cx(inputCls, className)} {...p} />);
export const Select = ({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select className={cx(inputCls, 'pr-8', className)} {...p}>
    {children}
  </select>
);
export const Textarea = (p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cx(inputCls, 'h-auto min-h-16 py-2', p.className)} />;
export const Field = ({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) => (
  <label className={cx('block space-y-1', className)}>
    <span className="text-sm font-medium">{label}</span>
    {children}
    {hint && <span className="block text-xs text-muted">{hint}</span>}
  </label>
);
export const Checkbox = ({ checked, onChange, label, className }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; className?: string }) => (
  <label className={cx('inline-flex cursor-pointer items-center gap-2 text-sm select-none', className)}>
    <span className={cx('flex size-4.5 items-center justify-center rounded border', checked ? 'border-primary bg-primary text-on-primary' : 'border-line bg-surface')}>
      {checked && <Check className="size-3.5" strokeWidth={3} />}
    </span>
    <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    {label}
  </label>
);

/** Ô nhập tiền: gõ "455k", "1,5tr", "455.091". Hiển thị lại định dạng khi rời ô. */
export function MoneyInput({ value, onChange, className, placeholder, autoFocus }: { value: number | null; onChange: (v: number | null) => void; className?: string; placeholder?: string; autoFocus?: boolean }) {
  const [text, setText] = useState(value != null ? vnd(value) : '');
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value != null ? vnd(value) : '');
  }, [value]);
  return (
    <Input
      inputMode="decimal"
      autoFocus={autoFocus}
      className={cx('num text-right', className)}
      placeholder={placeholder ?? '0'}
      value={text}
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false;
        setText(value != null ? vnd(value) : '');
      }}
      onChange={(e) => {
        setText(e.target.value);
        const t = e.target.value.trim().toLowerCase().replace(/\s/g, '');
        if (!t) return onChange(null);
        const m = t.match(/^(-?[\d.,]+)(k|tr|m)?$/);
        if (!m) return;
        const n = m[2] ? Number(m[1].replace(',', '.')) : Number(m[1].replace(/[.,]/g, ''));
        if (Number.isFinite(n)) onChange(Math.round(n * (m[2] === 'k' ? 1000 : m[2] ? 1_000_000 : 1)));
      }}
    />
  );
}

export function Segmented<T extends string>({ value, onChange, options, size = 'md', className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; title?: string }[]; size?: 'sm' | 'md'; className?: string }) {
  return (
    <div className={cx('inline-flex max-w-full overflow-x-auto rounded-lg bg-surface-2 p-0.5', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          title={o.title}
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx('rounded-md font-medium whitespace-nowrap transition', size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm', value === o.value ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const Chip = ({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: ReactNode; title?: string }) => (
  <button
    type="button"
    title={title}
    onClick={onClick}
    className={cx('h-8 rounded-full border px-3 text-sm font-medium transition', active ? 'border-primary bg-primary-soft text-primary' : 'border-line bg-surface text-muted hover:text-fg')}
  >
    {children}
  </button>
);

/* ---------- Modal & Drawer ---------- */
export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cx('m-auto w-[calc(100%-2rem)] rounded-2xl border border-line bg-surface p-0 text-fg shadow-xl', wide ? 'max-w-3xl' : 'max-w-lg')}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h3 className="font-semibold">{title}</h3>
            <IconButton label="Đóng" onClick={onClose}>
              <X className="size-4" />
            </IconButton>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

/** Bảng bên phải trên desktop, trượt từ dưới lên trên điện thoại. */
export function Drawer({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <aside className="absolute inset-x-0 bottom-0 flex max-h-[92vh] flex-col rounded-t-2xl border border-line bg-surface shadow-2xl sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:w-[min(560px,100vw)] sm:rounded-none sm:rounded-l-2xl">
        <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-3">
          <div className="min-w-0 flex-1 font-semibold">{title}</div>
          <IconButton label="Đóng (Esc)" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="safe-bottom border-t border-line px-5 py-3">{footer}</div>}
      </aside>
    </div>
  );
}

/* ---------- Toast ---------- */
type ToastT = { id: number; text: string; tone: 'ok' | 'danger' | 'info' };
const ToastCtx = createContext<(text: string, tone?: ToastT['tone']) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastT[]>([]);
  const push = useCallback((text: string, tone: ToastT['tone'] = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6">
        {items.map((t) => (
          <div key={t.id} className={cx('pointer-events-auto rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg', t.tone === 'danger' ? 'bg-danger text-white' : t.tone === 'info' ? 'bg-fg text-bg' : 'bg-primary text-on-primary')}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function Progress({ value, tone }: { value: number; tone?: 'ok' | 'warn' | 'over' }) {
  const color = tone === 'over' ? 'bg-danger' : tone === 'warn' ? 'bg-warn' : 'bg-primary';
  return (
    <div className="h-2 overflow-hidden rounded-full bg-surface-2">
      <div className={cx('h-full rounded-full transition-all', color)} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
    </div>
  );
}
