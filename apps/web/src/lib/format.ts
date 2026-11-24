const nf = new Intl.NumberFormat('vi-VN');

/** 455091 → "455.091" */
export const vnd = (d: number | null | undefined) => nf.format(Math.round(d ?? 0));
/** 455091 → "455k", 12036799 → "12,04tr" */
export function short(d: number): string {
  const a = Math.abs(d);
  if (a >= 1_000_000) return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(d / 1_000_000)}tr`;
  if (a >= 1000) return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(d / 1000)}k`;
  return nf.format(d);
}

/** Nhập tiền linh hoạt: "455k", "1,5tr", "455.091", "455091" → đồng. */
export function parseMoney(s: string): number | null {
  const t = s.trim().toLowerCase().replace(/\s/g, '').replace(/đ$/, '');
  if (!t) return null;
  const m = t.match(/^(-?[\d.,]+)(k|tr|m)?$/);
  if (!m) return null;
  let num = m[1];
  if (m[2]) num = num.replace(',', '.');
  else num = num.replace(/[.,]/g, '');
  const v = Number(num);
  if (!Number.isFinite(v)) return null;
  const mul = m[2] === 'k' ? 1000 : m[2] === 'tr' || m[2] === 'm' ? 1_000_000 : 1;
  return Math.round(v * mul);
}

export const dayLabel = (iso: string) => {
  const d = new Date(iso.slice(0, 10) + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - d.getTime()) / 86400_000);
  const base = d.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' });
  return diff === 0 ? `Hôm nay · ${base}` : diff === 1 ? `Hôm qua · ${base}` : base;
};
export const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export const hhmm = (iso: string) => iso.slice(11, 16);
export const todayIso = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
export const monthLabel = (m: string) => `Tháng ${Number(m.slice(5, 7))}/${m.slice(0, 4)}`;

export const ACTION_LABEL: Record<string, string> = {
  expense: 'Chi tiêu',
  split: 'Chia tiền',
  income: 'Thu nhập',
  settlement: 'Trả nợ phòng',
  loan: 'Vay / cho vay',
  transfer: 'Chuyển ví',
  ignore: 'Bỏ qua',
};
export const SCOPE_LABEL = { Rieng: 'Riêng', Chung: 'Chung', Nha: 'Nhà' } as const;
export const MODE_LABEL: Record<string, string> = {
  equal: 'Chia đều',
  items: 'Theo món',
  exact: 'Số tiền',
  percent: 'Phần trăm',
  shares: 'Số phần',
  rent: 'Tiền nhà',
};

export function copy(text: string) {
  return navigator.clipboard?.writeText(text);
}
