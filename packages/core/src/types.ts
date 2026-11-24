export type PersonCode = string; // 'Q', 'D', 'C', 'M', 'N', 'K', 'Cg', 'Qy'

export interface Person {
  code: PersonCode;
  name: string;
  /** roommate: ở phòng, chia tiền nhà. food: chỉ ăn chung. */
  role: 'roommate' | 'food';
  /** Người trả hộ (Ngọc → Quang). Phần của người này được gộp vào người trả hộ. */
  paidBy?: PersonCode | null;
  /** Tên cột trên Google Sheet TRANG TỔNG (Quang+Ngọc, Duy, …). */
  sheetColumn?: string | null;
  active?: boolean;
}

export type Scope = 'Rieng' | 'Chung' | 'Nha';
export type Confidence = 'chac' | 'nghi';

export type SplitMode = 'equal' | 'exact' | 'percent' | 'shares' | 'items' | 'rent';

export interface SplitItem {
  name: string;
  /** Giá gốc (đồng). Ship, phí, giảm giá được phân bổ theo tỉ lệ giá gốc. */
  price: number;
  people: PersonCode[];
}

export interface SplitConfig {
  mode: SplitMode;
  /** Tổng bill (đồng). */
  total: number;
  /** equal / rent: những người cùng chia. */
  people?: PersonCode[];
  /** exact: số tiền từng người (đồng), ví dụ đơn Grab nhóm. */
  amounts?: Record<PersonCode, number>;
  /** percent: phần trăm từng người. */
  percents?: Record<PersonCode, number>;
  /** shares: số phần từng người (ví dụ 2 suất, 1 suất). */
  weights?: Record<PersonCode, number>;
  /** items: chia theo món. */
  items?: SplitItem[];
  /** Người bao: trả hộ một khoản cố định, hoặc cả bill nếu `full`. */
  covers?: { person: PersonCode; amount?: number; full?: boolean }[];
  /** Đồ riêng của một người nằm trong bill (không chia). */
  privates?: { person: PersonCode; amount: number; note?: string }[];
  /** Điều chỉnh ± sau khi chia; phần chênh được bù đều cho những người còn lại. */
  adjustments?: { person: PersonCode; delta: number }[];
  /** Ai đã trả bill. Mặc định là người giữ sổ (Q) trả toàn bộ. */
  payers?: { person: PersonCode; amount: number }[];
  /** Nhãn gốc từ file nạp (chia_deu, theo_mon, grab_nhom, tien_nha) để hiển thị. */
  label?: string;
}

export interface SplitResult {
  /** Phần tiêu dùng của từng người (đã gồm phần bao và đồ riêng). */
  shares: Record<PersonCode, number>;
  /** Số đã trả của từng người. */
  paid: Record<PersonCode, number>;
  /** Phần đồ riêng của từng người. */
  privates: Record<PersonCode, number>;
  /** Phần người bao gánh thêm. */
  covered: Record<PersonCode, number>;
  warnings: string[];
}

/** Gợi ý xử lý một giao dịch (từ file nạp, quy tắc, hoặc người dùng). */
export type Suggestion =
  | { action: 'ignore'; reason?: string }
  | { action: 'expense'; scope?: Scope; category?: string }
  | { action: 'split'; split: Omit<SplitConfig, 'total'>; category?: string; isRent?: boolean }
  | { action: 'income'; category?: string; incomeType?: 'thu_nhap' | 'ngoai_602' | 'khac' }
  | { action: 'settlement'; person?: PersonCode }
  | { action: 'loan'; person?: PersonCode; direction?: 'lend' | 'borrow' | 'repay_in' | 'repay_out' }
  | { action: 'transfer'; toAccount?: string };

export interface ImportedTx {
  extId: string;
  occurredAt: string; // ISO local 'YYYY-MM-DDTHH:mm'
  amount: number; // đồng, luôn dương
  direction: 'in' | 'out';
  source: string; // 'MB', 'Card 8508', 'Card 9786', …
  rawContent: string;
  counterparty: string | null;
  counterpartyAccount: string | null;
  counterpartyBank: string | null;
  suggestion: Suggestion;
  confidence: Confidence;
  question: string | null;
  pairExtId: string | null;
}

export interface ImportCheck {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
}

export interface ParsedImport {
  version: number;
  period: {
    name: string;
    from: string;
    to: string;
    rentTotal: number | null;
    carried: Record<PersonCode, number>;
  } | null;
  transactions: ImportedTx[];
  checks: ImportCheck[];
  reconciliation: Record<string, number> | null;
}
