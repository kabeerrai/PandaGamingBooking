// src/lib/api.ts
import { getPublicSessionMeta } from "./session-meta";
export const APPS_SCRIPT_URL_KEY = "panda:appsScriptUrl";

const API_CACHE_PREFIX = "panda:api-cache:";

const READ_CACHE_TTL_MS: Record<string, number> = {
  getDashboardData: 20_000,
  getDashboardSummary: 20_000,
  getBookingsPageData: 15_000,
  getBookings: 15_000,
  getPCs: 60_000,
  getTiers: 120_000,
  getSettings: 120_000,
  getCustomers: 120_000,
  getMemberTopups: 30_000,
  getExpenses: 30_000,
  getPayments: 30_000,
  getRevenueSummary: 30_000,
  getRevenueAnalytics: 60_000,
  getCashiers: 60_000,
  getMyShiftSummary: 10_000,
  getShiftReports: 30_000,
};

const WRITE_ACTIONS = new Set([
  "addPC", "updatePC", "deletePC",
  "addTier", "updateTier", "deleteTier",
  "addBooking", "updateBooking", "cancelBooking", "deleteBooking", "completeBooking",
  "addMemberTopup", "deleteMemberTopup",
  "addExpense", "deleteExpense",
  "addCashier", "updateCashier", "deleteCashier", "closeShift",
  "updateSettings", "cleanupOldBookings",
]);

const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbxZwTQsVkbWjN9wXaDDtd1KzNgD0hcUiScEbR2SczFEBi5M85Xhx35W2Hi5lGNph_o5Sg/exec";

export function getAppsScriptUrl(): string | null {
  return APPS_SCRIPT_URL;
}
export function setAppsScriptUrl(url: string) {
  window.localStorage.setItem(APPS_SCRIPT_URL_KEY, url);
  clearApiCache();
}

export class ApiError extends Error {}

type CacheEntry<T> = {
  expiresAt: number;
  savedAt: number;
  data: T;
};

function stableStringify(value: any): string {
  if (!value || typeof value !== "object") return JSON.stringify(value ?? {});
  if (Array.isArray(value)) return JSON.stringify(value.map((v) => JSON.parse(stableStringify(v))));
  const ordered: Record<string, any> = {};
  Object.keys(value).sort().forEach((key) => {
    ordered[key] = value[key];
  });
  return JSON.stringify(ordered);
}

function cacheKey(action: string, payload: any = {}) {
  return `${API_CACHE_PREFIX}${action}:${stableStringify(payload)}`;
}

function readCached<T>(action: string, payload: any = {}): T | null {
  if (typeof window === "undefined") return null;
  const ttl = READ_CACHE_TTL_MS[action];
  if (!ttl) return null;
  try {
    const raw = window.localStorage.getItem(cacheKey(action, payload));
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (!entry || Date.now() > entry.expiresAt) {
      window.localStorage.removeItem(cacheKey(action, payload));
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

function writeCached<T>(action: string, payload: any = {}, data: T) {
  if (typeof window === "undefined") return;
  const ttl = READ_CACHE_TTL_MS[action];
  if (!ttl) return;
  try {
    const entry: CacheEntry<T> = {
      expiresAt: Date.now() + ttl,
      savedAt: Date.now(),
      data,
    };
    window.localStorage.setItem(cacheKey(action, payload), JSON.stringify(entry));
  } catch {
    // Ignore quota/private browsing errors.
  }
}

export function getCachedApiResponse<T = any>(action: string, payload: any = {}): T | undefined {
  return readCached<T>(action, payload) ?? undefined;
}

export function getLastApiResponse<T = any>(action: string, payload: any = {}): T | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(cacheKey(action, payload));
    if (!raw) return undefined;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    return entry?.data;
  } catch {
    return undefined;
  }
}

export function clearApiCache() {
  if (typeof window === "undefined") return;
  try {
    Object.keys(window.localStorage)
      .filter((key) => key.startsWith(API_CACHE_PREFIX))
      .forEach((key) => window.localStorage.removeItem(key));
  } catch {}
}

export async function callApi<T = any>(action: string, payload: any = {}): Promise<T> {
  const cached = readCached<T>(action, payload);
  if (cached) return cached;

  const url = getAppsScriptUrl();
  if (!url) {
    throw new ApiError(
      "Google Apps Script URL is not configured. Open Settings and paste your Web App URL.",
    );
  }

  const sessionMeta = getPublicSessionMeta();
  const requestPayload = { ...(payload || {}) };
  if (sessionMeta) requestPayload.__session = sessionMeta;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, payload: requestPayload }),
    redirect: "follow",
  });
  if (!res.ok) throw new ApiError(`HTTP ${res.status}`);
  const data = await res.json();
  if (data && data.success === false) {
    throw new ApiError(data.error || "Request failed");
  }

  if (WRITE_ACTIONS.has(action)) clearApiCache();
  else writeCached(action, payload, data as T);

  return data as T;
}

export type PC = {
  pc_id: string;
  pc_name: string;
  tier_id: string;
  status: "Active" | "Inactive" | "Maintenance";
  created_at?: string;
  updated_at?: string;
};

export type Tier = {
  tier_id: string;
  tier_name: string;
  price_per_hour: number;
  description?: string;
  created_at?: string;
  updated_at?: string;
};

export type Customer = {
  customer_id: string;
  customer_name: string;
  phone_number: string;
  total_bookings?: number;
  last_booking_at?: string;
  created_at?: string;
  updated_at?: string;
};

export type MemberTopup = {
  topup_id: string;
  member_name: string;
  phone_number?: string;
  amount: number;
  topup_date: string;
  payment_method?: "Cash" | "JazzCash" | "Easypaisa" | "Bank" | string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
  cashier_id?: string;
  cashier_name?: string;
  shift_id?: string;
};

export type Expense = {
  expense_id: string;
  expense_date: string;
  category: "Miscellaneous" | "Fixed" | "Repairs" | string;
  amount: number;
  notes?: string;
  payment_method?: "Cash" | "JazzCash" | "Easypaisa" | "Bank" | string;
  created_at?: string;
  updated_at?: string;
  cashier_id?: string;
  cashier_name?: string;
  shift_id?: string;
};

export type Booking = {
  booking_id: string;
  customer_name: string;
  phone_number: string;
  tier_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  pcs_required: number;
  assigned_pc_ids: string;
  status: "Pending" | "Confirmed" | "Cancelled" | "Completed" | "Deleted";
  notes?: string;
  total_price: number;
  created_at?: string;
  updated_at?: string;
  booking_type?: "Standard" | "Member" | string;
  discount_amount?: number;
  amount_due?: number;
  cash_collected?: number;
  online_method?: "" | "JazzCash" | "Easypaisa" | "Bank" | string;
  online_collected?: number;
  total_collected?: number;
  payment_status?: "" | "Paid" | "Partial" | "Overpaid" | string;
  completed_at?: string;
  keep_permanent?: "Yes" | "No" | string;
  cashier_id?: string;
  cashier_name?: string;
  shift_id?: string;
};

export type SlotSuggestion = {
  start_time: string;
  end_time: string;
  available_count: number;
  relation?: "before" | "after";
};

export type AvailabilityResult = {
  success: true;
  requested: {
    tier: string;
    date: string;
    start_time: string;
    end_time: string;
    pcs_required: number;
  };
  available_count: number;
  available_pcs: string[];
  booked_pcs: string[];
  can_book: boolean;
  message?: string;
  suggestions?: SlotSuggestion[];
};

export type Cashier = {
  cashier_id: string;
  cashier_name: string;
  username: string;
  password: string;
  status: "Active" | "Inactive" | string;
  created_at?: string;
  updated_at?: string;
};

export type ShiftSummary = {
  shift_id: string;
  cashier_id: string;
  cashier_name: string;
  clock_in_at: string;
  clock_out_at?: string;
  status: "Active" | "Closed" | string;
  bookings_created: number;
  completed_bookings: number;
  booking_revenue: number;
  topups_total: number;
  expenses_total: number;
  total_revenue: number;
  net_revenue: number;
  cash_collected: number;
  online_collected: number;
  cash_expenses: number;
  expected_cash: number;
};

export type RevenueAnalytics = {
  currency: string;
  selected_month: string;
  selected_year: string;
  totals: {
    month_booking_revenue: number;
    month_topups: number;
    month_expenses: number;
    month_total_revenue: number;
    month_net: number;
    year_booking_revenue: number;
    year_topups: number;
    year_expenses: number;
    year_total_revenue: number;
    year_net: number;
  };
  tier_revenue: Array<{
    tier_id: string;
    tier_name: string;
    revenue: number;
    bookings: number;
    hours: number;
  }>;
  pc_revenue: Array<{
    pc_id: string;
    pc_name: string;
    tier_id: string;
    tier_name: string;
    revenue: number;
    bookings: number;
    hours: number;
  }>;
  monthly_breakdown: Array<{
    month: string;
    booking_revenue: number;
    topups: number;
    expenses: number;
    total_revenue: number;
    net: number;
  }>;
};

export type DashboardSummary = {
  total_pcs: number;
  available_now: number;
  booked_now: number;
  todays_bookings: number;
  pending_bookings: number;
  todays_revenue: number;
  todays_cash: number;
  todays_online: number;
  monthly_revenue: number;
  monthly_cash: number;
  monthly_online: number;
  todays_topups?: number;
  monthly_topups?: number;
  todays_expenses?: number;
  monthly_expenses?: number;
  todays_net?: number;
  monthly_net?: number;
  currency: string;
};
