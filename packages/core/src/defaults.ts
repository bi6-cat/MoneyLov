import type { Person } from './types';

/** Dữ liệu khởi tạo cho phòng 602 (theo HANDOFF). */
export const DEFAULT_PEOPLE: (Person & { aliases: string[] })[] = [
  { code: 'Q', name: 'Quang', role: 'roommate', sheetColumn: 'Quang+Ngọc', aliases: ['Bạn (Trưởng nhóm)', 'Bạn'] },
  { code: 'D', name: 'Duy', role: 'roommate', sheetColumn: 'Duy', aliases: ['Nguyễn Duy'] },
  { code: 'C', name: 'Chung', role: 'roommate', sheetColumn: 'Chung', aliases: ['chung'] },
  { code: 'M', name: 'Minh', role: 'roommate', sheetColumn: 'Minh', aliases: ['Trần Minh'] },
  { code: 'N', name: 'Ngọc', role: 'food', paidBy: 'Q', sheetColumn: 'Quang+Ngọc', aliases: ['Minh Ngọc'] },
  { code: 'K', name: 'Khải', role: 'food', sheetColumn: 'Khải', aliases: [] },
  { code: 'Cg', name: 'Cường', role: 'food', sheetColumn: 'Cường', aliases: ['Cường phạm'] },
  { code: 'Qy', name: 'aQuy', role: 'food', sheetColumn: 'aQuy', aliases: ['Quy'] },
];

export const DEFAULT_ACCOUNTS = [
  { name: 'MB', type: 'bank', number: '2888666222', importSource: 'MB', color: '#1d4ed8' },
  { name: 'Thẻ MB 8508', type: 'credit', number: '8508', importSource: 'Card 8508', color: '#7c3aed' },
  { name: 'Thẻ MB 9786', type: 'credit', number: '9786', importSource: 'Card 9786', color: '#db2777' },
  { name: 'TPBank', type: 'bank', number: null, importSource: null, color: '#6d28d9' },
  { name: 'Techcombank 8822', type: 'bank', number: '8822', importSource: null, color: '#dc2626' },
  { name: 'Tiền mặt', type: 'cash', number: null, importSource: 'Tiền mặt', color: '#16a34a' },
  { name: 'Zalopay', type: 'ewallet', number: null, importSource: null, color: '#0284c7' },
  { name: 'ShopeePay', type: 'ewallet', number: null, importSource: null, color: '#ea580c' },
] as const;

export const DEFAULT_CATEGORIES: { name: string; kind: 'expense' | 'income'; icon: string; color: string }[] = [
  { name: 'Ăn uống', kind: 'expense', icon: 'utensils', color: '#f97316' },
  { name: 'Đi lại', kind: 'expense', icon: 'car', color: '#0ea5e9' },
  { name: 'Nhà ở', kind: 'expense', icon: 'home', color: '#8b5cf6' },
  { name: 'Học', kind: 'expense', icon: 'book', color: '#14b8a6' },
  { name: 'Sức khỏe', kind: 'expense', icon: 'heart', color: '#ef4444' },
  { name: 'Mua sắm', kind: 'expense', icon: 'shopping-bag', color: '#ec4899' },
  { name: 'Giải trí', kind: 'expense', icon: 'film', color: '#a855f7' },
  { name: 'Dịch vụ & thuê bao', kind: 'expense', icon: 'repeat', color: '#6366f1' },
  { name: 'Hoá đơn', kind: 'expense', icon: 'receipt', color: '#64748b' },
  { name: 'Quà tặng', kind: 'expense', icon: 'gift', color: '#e11d48' },
  { name: 'Khác', kind: 'expense', icon: 'circle', color: '#94a3b8' },
  { name: 'Thu nhập', kind: 'income', icon: 'wallet', color: '#22c55e' },
  { name: 'Thu khác', kind: 'income', icon: 'plus', color: '#84cc16' },
];
