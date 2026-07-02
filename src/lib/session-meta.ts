import type { UserRole } from "./gate.functions";

export type PublicSessionMeta = {
  unlocked?: boolean;
  role?: UserRole | null;
  username?: string;
  cashier_id?: string;
  cashier_name?: string;
  shift_id?: string;
  shift_started_at?: string;
};

export const SESSION_META_KEY = "panda:session-meta";

export function setPublicSessionMeta(meta: PublicSessionMeta | null) {
  if (typeof window === "undefined") return;
  if (!meta || !meta.unlocked) {
    window.localStorage.removeItem(SESSION_META_KEY);
    return;
  }
  window.localStorage.setItem(SESSION_META_KEY, JSON.stringify(meta));
}

export function getPublicSessionMeta(): PublicSessionMeta | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_META_KEY);
    return raw ? (JSON.parse(raw) as PublicSessionMeta) : null;
  } catch {
    return null;
  }
}
