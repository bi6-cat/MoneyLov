/** Tiền luôn là số nguyên đồng (VND). File nạp cũ ghi "k" (nghìn đồng) dạng số thực. */

export const kToDong = (k: number): number => Math.round(k * 1000);
export const dongToK = (d: number): number => Math.round(d) / 1000;

/**
 * Chia `total` đồng theo trọng số, dùng phương pháp phần dư lớn nhất,
 * nên tổng các phần luôn đúng bằng `total`.
 */
export function allocate(total: number, weights: number[]): number[] {
  if (!Number.isInteger(total)) throw new Error(`allocate: total phải là số nguyên, nhận ${total}`);
  if (weights.length === 0) {
    if (total === 0) return [];
    throw new Error('allocate: không có người nào để chia');
  }
  if (weights.some((w) => w < 0 || !Number.isFinite(w))) throw new Error('allocate: trọng số không hợp lệ');
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (sumW === 0) {
    if (total === 0) return weights.map(() => 0);
    throw new Error('allocate: tổng trọng số bằng 0');
  }
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const raw = weights.map((w) => (abs * w) / sumW);
  const floors = raw.map(Math.floor);
  let rest = abs - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r), w: weights[i] }))
    .filter((x) => x.w > 0)
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let j = 0; rest > 0; j = (j + 1) % order.length, rest--) floors[order[j].i] += 1;
  return floors.map((f) => f * sign);
}

const nf = new Intl.NumberFormat('vi-VN');
/** 455091 → "455.091 đ" */
export const formatVND = (d: number): string => `${nf.format(Math.round(d))} đ`;
/** 455091 → "455,1k" (gọn, dùng cho thẻ và biểu đồ) */
export function formatK(d: number, digits = 1): string {
  const k = d / 1000;
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: digits }).format(k)}k`;
}

/** Bỏ dấu tiếng Việt và hạ chữ thường, dùng để so khớp đối tác và nội dung. */
export function normalizeText(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** JSON có thứ tự khoá cố định, bỏ trường undefined/null, để so sánh hai cấu hình. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (v && typeof v === 'object')
    return `{${Object.entries(v)
      .filter(([, x]) => x !== undefined && x !== null)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, x]) => `${JSON.stringify(k)}:${canonicalJson(x)}`)
      .join(',')}}`;
  return JSON.stringify(v ?? null);
}
