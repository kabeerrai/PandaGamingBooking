import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { unlockSite } from "@/lib/gate.functions";
import { getAppsScriptUrl } from "@/lib/api";
import { setPublicSessionMeta } from "@/lib/session-meta";
import { Gamepad2 } from "lucide-react";

export const Route = createFileRoute("/unlock")({
  head: () => ({
    meta: [
      { title: "Admin Access — Panda Gaming Zone" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Unlock,
});

function Unlock() {
  const router = useRouter();
  const unlock = useServerFn(unlockSite);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const username = String(form.get("username") || "").trim();
    const password = String(form.get("password") || "");
    try {
      const result = await unlock({ data: { username, password, appsScriptUrl: getAppsScriptUrl() } });
      if (result.ok) {
        setPublicSessionMeta(result as any);
        await router.navigate({ to: "/admin" });
        router.invalidate();
      } else setError("Incorrect username or password");
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form onSubmit={onSubmit} className="glow-card w-full max-w-sm p-8 space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="rounded-full p-3 bg-primary/10 text-primary shadow-glow">
            <Gamepad2 className="size-8" />
          </div>
          <h1 className="text-2xl font-bold neon-text">Panda Gaming Zone</h1>
          <p className="text-sm text-muted-foreground">Admin / cashier dashboard access</p>
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Username</label>
            <input
              name="username"
              type="text"
              autoComplete="username"
              autoFocus
              placeholder="admin or cashier username"
              className="w-full rounded-md bg-input border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">Admin can type admin or leave username empty.</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Password</label>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded-md bg-input border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-primary text-primary-foreground font-medium py-2 shadow-glow hover:opacity-90 transition disabled:opacity-50"
        >
          {loading ? "Checking…" : "Enter"}
        </button>
      </form>
    </div>
  );
}
