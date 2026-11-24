import {
  Book,
  Car,
  Circle,
  Film,
  Gift,
  Heart,
  Home,
  Plus,
  Receipt,
  Repeat,
  ShoppingBag,
  Utensils,
  Wallet,
  Landmark,
  CreditCard,
  Banknote,
  Smartphone,
  PiggyBank,
  type LucideIcon,
} from 'lucide-react';
import type { Account, Category, Meta, PersonRow } from '../lib/api';
import { ACTION_LABEL, MODE_LABEL, SCOPE_LABEL, short } from '../lib/format';
import { Badge, cx } from './ui';

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  utensils: Utensils,
  car: Car,
  home: Home,
  book: Book,
  heart: Heart,
  'shopping-bag': ShoppingBag,
  film: Film,
  repeat: Repeat,
  receipt: Receipt,
  gift: Gift,
  circle: Circle,
  wallet: Wallet,
  plus: Plus,
};
export const ACCOUNT_ICONS: Record<Account['type'], LucideIcon> = { bank: Landmark, credit: CreditCard, cash: Banknote, ewallet: Smartphone, saving: PiggyBank };

export function CatIcon({ cat, size = 'md' }: { cat?: Pick<Category, 'icon' | 'color'> | null; size?: 'sm' | 'md' }) {
  const I = CATEGORY_ICONS[cat?.icon ?? 'circle'] ?? Circle;
  return (
    <span className={cx('inline-flex shrink-0 items-center justify-center rounded-full', size === 'sm' ? 'size-6' : 'size-9')} style={{ background: `${cat?.color ?? '#94a3b8'}22`, color: cat?.color ?? '#94a3b8' }}>
      <I className={size === 'sm' ? 'size-3.5' : 'size-4.5'} />
    </span>
  );
}

export function AccountDot({ acc }: { acc?: Account | null }) {
  if (!acc) return null;
  const I = ACCOUNT_ICONS[acc.type];
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted">
      <I className="size-3.5" style={{ color: acc.color }} />
      {acc.name}
    </span>
  );
}

export function Avatar({ p, size = 'md' }: { p?: Pick<PersonRow, 'code' | 'name'> | null; size?: 'sm' | 'md' }) {
  const palette = ['#0ea5e9', '#f97316', '#8b5cf6', '#10b981', '#ec4899', '#eab308', '#ef4444', '#14b8a6'];
  const code = p?.code ?? '?';
  const color = palette[[...code].reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length];
  return (
    <span title={p?.name} className={cx('inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white', size === 'sm' ? 'size-6 text-[10px]' : 'size-8 text-xs')} style={{ background: color }}>
      {code}
    </span>
  );
}

/** Mô tả ngắn một gợi ý/quyết định, dùng trong danh sách. */
export function SuggestionChip({ s, meta }: { s: any; meta: Meta }) {
  if (!s) return <Badge>Chưa có gợi ý</Badge>;
  const name = (c: string) => meta.people.find((p) => p.code === c)?.name ?? c;
  switch (s.action) {
    case 'expense':
      return (
        <Badge tone="neutral">
          {SCOPE_LABEL[(s.scope ?? 'Rieng') as keyof typeof SCOPE_LABEL]}
          {s.category ? ` · ${s.category}` : ''}
        </Badge>
      );
    case 'split': {
      const sp = s.split ?? {};
      const who = sp.people?.length ? sp.people.join('') : sp.amounts ? Object.keys(sp.amounts).join('') : sp.items?.length ? `${sp.items.length} món` : '';
      return (
        <Badge tone="primary">
          {s.isRent ? 'Tiền nhà' : `Chia · ${MODE_LABEL[sp.mode] ?? sp.mode}`}
          {who && ` · ${who}`}
        </Badge>
      );
    }
    case 'settlement':
      return <Badge tone="ok">Trả nợ · {s.person ? name(s.person) : '?'}</Badge>;
    case 'loan':
      return <Badge tone="warn">Vay/cho vay · {s.person ? name(s.person) : '?'}</Badge>;
    case 'ignore':
      return <Badge>Bỏ qua{s.reason ? ` · ${s.reason}` : ''}</Badge>;
    case 'income':
      return <Badge tone="ok">Thu nhập</Badge>;
    default:
      return <Badge>{ACTION_LABEL[s.action] ?? s.action}</Badge>;
  }
}

/** Phần từng người, hiển thị gọn: Q 150k · D 301k */
export function SharesLine({ shares, meta }: { shares: Record<string, number>; meta: Meta }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Object.entries(shares)
        .filter(([, v]) => v)
        .map(([p, v]) => (
          <span key={p} className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-0.5 pr-2 pl-0.5 text-xs">
            <Avatar p={meta.people.find((x) => x.code === p) ?? { code: p, name: p }} size="sm" />
            <span className="num">{short(v)}</span>
          </span>
        ))}
    </div>
  );
}
