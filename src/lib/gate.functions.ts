// src/lib/gate.functions.ts
import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { ADMIN_PASSWORD, CASHIER_PASSWORD, SESSION_SECRET } from "./site-config.server";

export type UserRole = "admin" | "cashier";
type GateSession = { unlocked?: boolean; role?: UserRole };

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

export const unlockSite = createServerFn({ method: "POST" })
  .validator((data: { password: string }) => data)
  .handler(async ({ data }) => {
    if (!ADMIN_PASSWORD || !CASHIER_PASSWORD) throw new Error("Site passwords are not configured");

    let role: UserRole | null = null;
    if (passwordMatches(data.password, ADMIN_PASSWORD)) role = "admin";
    else if (passwordMatches(data.password, CASHIER_PASSWORD)) role = "cashier";

    if (!role) return { ok: false as const };
    const session = await useSession<GateSession>(sessionConfig());
    await session.update({ unlocked: true, role });
    return { ok: true as const, role };
  });

export const lockSite = createServerFn({ method: "POST" }).handler(async () => {
  const session = await useSession<GateSession>(sessionConfig());
  await session.clear();
  return { ok: true as const };
});

export const isUnlocked = createServerFn({ method: "GET" }).handler(async () => {
  const session = await useSession<GateSession>(sessionConfig());
  return { unlocked: !!session.data.unlocked, role: session.data.role ?? null };
});

export const getSessionAccess = createServerFn({ method: "GET" }).handler(async () => {
  const session = await useSession<GateSession>(sessionConfig());
  return { unlocked: !!session.data.unlocked, role: session.data.role ?? null };
});

export const requireAdminAccess = createServerFn({ method: "GET" }).handler(async () => {
  const session = await useSession<GateSession>(sessionConfig());
  return { ok: !!session.data.unlocked && session.data.role === "admin", role: session.data.role ?? null };
});
