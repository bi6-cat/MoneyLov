import { kToDong } from './money';
import type { ImportCheck, ImportedTx, ParsedImport, SplitConfig, Suggestion } from './types';

/* Định dạng file nạp cũ (phien_ban 1), do build.py tạo ra. */
interface V1Tx {
  id: string;
  ngay: string;
  so_tien_k: number;
  chieu: 'ra' | 'vao';
  nguon: string;
  noi_dung_goc?: string;
  doi_tac?: string;
  tai_khoan_doi_tac?: string;
  ngan_hang_doi_tac?: string;
  xap: 'loc' | 'rieng' | 'chia' | 'vao';
  ly_do_loc?: string | null;
  goi_y?: Record<string, any>;
  do_tin_cay?: 'chac' | 'nghi';
  can_hoi?: string | null;
  cap_voi?: string | null;
}

const kMap = (m: Record<string, number> | undefined) =>
  Object.fromEntries(Object.entries(m ?? {}).map(([p, v]) => [p, kToDong(v)]));

export function v1Suggestion(t: V1Tx): Suggestion {
  const g = t.goi_y ?? {};
  switch (t.xap) {
    case 'loc':
      return { action: 'ignore', reason: t.ly_do_loc ?? undefined };
    case 'rieng':
      return { action: 'expense', scope: 'Rieng', category: g.danh_muc };
    case 'vao': {
      if (g.loai_vao === 'tra_no_phong') return { action: 'settlement', person: g.nguoi };
      if (g.loai_vao === 'thu_nhap') return { action: 'income', incomeType: 'thu_nhap', category: 'Thu nhập' };
      return { action: 'income', incomeType: g.loai_vao === 'ngoai_602' ? 'ngoai_602' : 'khac' };
    }
    case 'chia': {
      let split: Omit<SplitConfig, 'total'>;
      let isRent = false;
      switch (g.che_do) {
        case 'theo_mon':
          split = g.gia_goc
            ? {
                mode: 'items',
                label: 'theo_mon',
                items: Object.entries(g.gia_goc as Record<string, number>).map(([p, v]) => ({
                  name: `Món của ${p}`,
                  price: kToDong(v),
                  people: [p],
                })),
              }
            : { mode: 'items', label: 'theo_mon', items: [] };
          break;
        case 'grab_nhom':
          split = { mode: 'exact', label: 'grab_nhom', amounts: kMap(g.so_tien_nguoi) };
          break;
        case 'tien_nha':
          split = { mode: 'rent', label: 'tien_nha' };
          isRent = true;
          break;
        default:
          split = { mode: 'equal', label: g.che_do ?? 'chia_deu', people: g.nguoi ?? [] };
      }
      return { action: 'split', split, category: g.danh_muc, isRent };
    }
  }
}

export function parseV1(json: any): ParsedImport {
  const list: V1Tx[] = json.giao_dich ?? [];
  const transactions: ImportedTx[] = list.map((t) => ({
    extId: String(t.id),
    occurredAt: t.ngay.replace(' ', 'T'),
    amount: kToDong(t.so_tien_k),
    direction: t.chieu === 'vao' ? 'in' : 'out',
    source: t.nguon,
    rawContent: t.noi_dung_goc ?? '',
    counterparty: t.doi_tac?.trim() || null,
    counterpartyAccount: t.tai_khoan_doi_tac ?? null,
    counterpartyBank: t.ngan_hang_doi_tac ?? null,
    suggestion: v1Suggestion(t),
    confidence: t.do_tin_cay === 'chac' ? 'chac' : 'nghi',
    question: t.can_hoi ?? null,
    pairExtId: t.cap_voi ?? null,
  }));

  const d = json.dot;
  const period = d
    ? {
        name: d.ten,
        from: d.tu_ngay,
        to: d.den_ngay,
        rentTotal: d.tong_tien_nha_k != null ? kToDong(d.tong_tien_nha_k) : null,
        carried: kMap(d.no_cu_k),
      }
    : null;

  const ds = json.doi_soat;
  const reconciliation = ds
    ? Object.fromEntries(Object.entries(ds).map(([k, v]) => [k, typeof v === 'number' && k.endsWith('_k') ? kToDong(v) : (v as number)]))
    : null;

  return { version: 1, period, transactions, checks: checkImport(transactions, reconciliation), reconciliation };
}

/** Kiểm tra trước khi nạp: id trùng, số dòng, tổng vào/ra, số dư đầu + vào − ra = cuối. */
export function checkImport(txs: ImportedTx[], rec: Record<string, number> | null): ImportCheck[] {
  const checks: ImportCheck[] = [];
  const ids = new Map<string, number>();
  txs.forEach((t) => ids.set(t.extId, (ids.get(t.extId) ?? 0) + 1));
  const dup = [...ids].filter(([, n]) => n > 1).map(([id]) => id);
  checks.push({ key: 'dup', label: 'Không trùng id', ok: dup.length === 0, detail: dup.length ? `Trùng: ${dup.join(', ')}` : `${txs.length} id khác nhau` });

  const pairs = txs.filter((t) => t.pairExtId && !ids.has(t.pairExtId));
  checks.push({ key: 'pairs', label: 'Cặp giao dịch đủ hai đầu', ok: pairs.length === 0, detail: pairs.length ? pairs.map((p) => `${p.extId} → ${p.pairExtId}`).join(', ') : 'Đủ' });

  const mb = txs.filter((t) => t.source === 'MB');
  const out = mb.filter((t) => t.direction === 'out').reduce((a, t) => a + t.amount, 0);
  const inn = mb.filter((t) => t.direction === 'in').reduce((a, t) => a + t.amount, 0);
  if (rec) {
    if (rec.so_dong_sao_ke != null)
      checks.push({ key: 'rows', label: 'Số dòng sao kê', ok: rec.so_dong_sao_ke === mb.length, detail: `${mb.length} / ${rec.so_dong_sao_ke}` });
    if (rec.so_email_the != null) {
      const card = txs.length - mb.length;
      checks.push({ key: 'cards', label: 'Số email thẻ', ok: rec.so_email_the === card, detail: `${card} / ${rec.so_email_the}` });
    }
    if (rec.tong_ra_sao_ke_k != null)
      checks.push({ key: 'out', label: 'Tổng ra', ok: rec.tong_ra_sao_ke_k === out, detail: `${out} / ${rec.tong_ra_sao_ke_k}` });
    if (rec.tong_vao_sao_ke_k != null)
      checks.push({ key: 'in', label: 'Tổng vào', ok: rec.tong_vao_sao_ke_k === inn, detail: `${inn} / ${rec.tong_vao_sao_ke_k}` });
    if (rec.so_du_dau_k != null && rec.so_du_cuoi_k != null) {
      const end = rec.so_du_dau_k + inn - out;
      checks.push({ key: 'balance', label: 'Đầu + vào − ra = cuối', ok: end === rec.so_du_cuoi_k, detail: `${rec.so_du_dau_k} + ${inn} − ${out} = ${end} (sao kê ${rec.so_du_cuoi_k})` });
    }
  }
  return checks;
}
