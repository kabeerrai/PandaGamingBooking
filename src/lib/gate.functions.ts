// src/lib/gate.functions.ts
import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { ADMIN_PASSWORD, CASHIER_PASSWORD, SESSION_SECRET } from "./site-config.server";

export type UserRole = "admin" | "cashier";
type GateSession = {
  unlocked?: boolean;
  role?: UserRole;
  username?: string;
  cashier_id?: string;
  cashier_name?: string;
  shift_id?: string;
  shift_started_at?: string;
};

function sessionConfig() {
  return {
    password: SESSION_SECRET,
    name: "panda-gate",
    maxAge: 60 * 60 * 24 * 7,
    cookie: { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" },
  };
}

function passwordMatches(input: string, expected: string) {
  const a = createHash("sha256").update(input || "", "utf8").digest();
  const b = createHash("sha256").update(expected || "", "utf8").digest();
  return a.length === b.length && timingSafeEqual(a, b);
}

async function callAppsScript(url: string, action: string, payload: any) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, payload }),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Google Apps Script HTTP ${res.status}`);
  const data = await res.json();
  if (data?.success === false) throw new Error(data.error || "Google Apps Script request failed");
  return data;
}

export const unlockSite = createServerFn({ method: "POST" })
  .validator((data: { username?: string; password: string; appsScriptUrl?: string | null }) => data)
  .handler(async ({ data }) => {
    if (!ADMIN_PASSWORD || !CASHIER_PASSWORD) throw new Error("Site passwords are not configured");

    const username = String(data.username || "").trim();
    const password = String(data.password || "");
    const normalizedUsername = username.toLowerCase();

    // Admin remains code-based so you can always get in even if Sheets is temporarily slow/down.
    if ((!normalizedUsername || normalizedUsername === "admin") && passwordMatches(password, ADMIN_PASSWORD)) {
      const session = await useSession<GateSession>(sessionConfig());
      await session.update({ unlocked: true, role: "admin", username: "admin" });
      return { ok: true as const, role: "admin" as const, username: "admin" };
    }

    // New cashier accounts live in Google Sheets. Login also starts/reuses an active shift.
    if (data.appsScriptUrl) {
      try {
        const result = await callAppsScript(data.appsScriptUrl, "loginCashier", { username, password });
        const user = result?.data;
        if (user?.role === "cashier") {
          const session = await useSession<GateSession>(sessionConfig());
          await session.update({
            unlocked: true,
            role: "cashier",
            username: user.username || username || "cashier",
            cashier_id: user.cashier_id || "",
            cashier_name: user.cashier_name || user.username || "Cashier",
            shift_id: user.shift_id || "",
            shift_started_at: user.shift_started_at || "",
          });
          return { ok: true as const, ...user };
        }
      } catch {
        // Fall through to the old single cashier password below. This keeps old setups working.
      }
    }

    if (passwordMatches(password, CASHIER_PASSWORD)) {
      const session = await useSession<GateSession>(sessionConfig());
      await session.update({ unlocked: true, role: "cashier", username: "cashier", cashier_name: "Cashier" });
      return { ok: true as const, role: "cashier" as const, username: "cashier", cashier_name: "Cashier" };
    }

    return { ok: false as const };
  });

export const lockSite = createServerFn({ method: "POST" })
  .validator((data?: { appsScriptUrl?: string | null }) => data || {})
  .handler(async ({ data }) => {
    const session = await useSession<GateSession>(sessionConfig());
    const shiftId = session.data.shift_id;
    if (shiftId && data?.appsScriptUrl) {
      try {
        await callAppsScript(data.appsScriptUrl, "logoutCashier", { shift_id: shiftId });
      } catch {
        // Still clear local access even if clock-out fails.
      }
    }
    await session.clear();
    return { ok: true as const };
  });

export const isUnlocked = createServerFn({ method: "GET" }).handler(async () => {
  const session = await useSession<GateSession>(sessionConfig());
  return { unlocked: !!session.data.unlocked, ...session.data };
});

export const getSessionAccess = createServerFn({ method: "GET" }).handler(async () => {
  const session = await useSession<GateSession>(sessionConfig());
  return { unlocked: !!session.data.unlocked, ...session.data };
});

export const requireAdminAccess = createServerFn({ method: "GET" }).handler(async () => {
  const session = await useSession<GateSession>(sessionConfig());
  return { ok: !!session.data.unlocked && session.data.role === "admin", ...session.data };
});
