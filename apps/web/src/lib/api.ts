import { QueryClient, useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: any,
  ) {
    super(message);
  }
}

export async function api<T = any>(path: string, opt: { method?: string; body?: unknown; raw?: boolean } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opt.method ?? (opt.body !== undefined ? 'POST' : 'GET'),
    headers: opt.body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: opt.body !== undefined ? JSON.stringify(opt.body) : undefined,
    credentials: 'same-origin',
  });
  if (opt.raw) return res as unknown as T;
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth')) window.dispatchEvent(new Event('ml:unauthorized'));
    throw new ApiError(res.status, json?.error ?? res.statusText, json);
  }
  return json as T;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2, refetchOnWindowFocus: false },
  },
});

export const useApi = <T = any>(key: QueryKey, path: string | null, enabled = true) =>
  useQuery<T>({ queryKey: key, queryFn: () => api<T>(path!), enabled: enabled && !!path });

/** Mutation gọi API rồi làm mới mọi dữ liệu liên quan (app nhỏ, làm mới hết cho chắc). */
export function useAction<V = any, R = any>(fn: (v: V) => Promise<R>, opt: { onSuccess?: (r: R, v: V) => void; invalidate?: boolean } = {}) {
  const qc = useQueryClient();
  return useMutation<R, ApiError, V>({
    mutationFn: fn,
    onSuccess: (r, v) => {
      if (opt.invalidate !== false) qc.invalidateQueries();
      opt.onSuccess?.(r, v);
    },
  });
}

/* ---------- Kiểu dữ liệu từ API ---------- */
export interface Account {
  id: number;
  name: string;
  type: 'bank' | 'credit' | 'cash' | 'ewallet' | 'saving';
  number: string | null;
  importSource: string | null;
  openingBalance: number;
  creditLimit: number | null;
  color: string;
  archived: boolean;
  balance: number;
  txCount: number;
}
export interface Category {
  id: number;
  name: string;
  kind: 'expense' | 'income';
  parentId: number | null;
  icon: string;
  color: string;
  archived: boolean;
}
export interface PersonRow {
  code: string;
  name: string;
  role: 'roommate' | 'food';
  paidBy: string | null;
  sheetColumn: string | null;
  aliases: string[];
  active: boolean;
}
export interface PeriodLite {
  id: number;
  name: string;
  fromDate: string;
  toDate: string;
  status: 'open' | 'closed';
  rentTotal: number | null;
}
export interface Meta {
  accounts: Account[];
  categories: Category[];
  people: PersonRow[];
  periods: PeriodLite[];
  settings: { hub: string; autoApproveMinConfirmations: number; bankLine: string };
  pending: number;
}
export interface TxRow {
  id: number;
  extId: string | null;
  accountId: number | null;
  occurredAt: string;
  amount: number;
  direction: 'in' | 'out';
  kind: string | null;
  categoryId: number | null;
  scope: 'Rieng' | 'Chung' | 'Nha' | null;
  title: string | null;
  counterparty: string | null;
  counterpartyAccount: string | null;
  counterpartyBank: string | null;
  rawContent: string;
  note: string | null;
  tags: string[];
  status: 'pending' | 'approved';
  suggestion: any;
  confidence: 'chac' | 'nghi';
  question: string | null;
  answer: string | null;
  pairExtId: string | null;
  ruleId: number | null;
  person: string | null;
  toAccountId: number | null;
  periodId: number | null;
  approvedBy: string | null;
  split?: any;
  auto?: { ok: boolean; reason: string };
  rule?: any;
}

export const useMeta = () => useApi<Meta>(['meta'], '/meta');
