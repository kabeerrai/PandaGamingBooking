import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { callApi, getAppsScriptUrl, getLastApiResponse, type DashboardSummary, type AvailabilityResult, type Tier, type SlotSuggestion } from "@/lib/api";
import { getSessionAccess, type UserRole } from "@/lib/gate.functions";
import { PageHeader, StatCard, Card, Field, inputCls, Btn, Badge, ErrorBanner } from "@/components/ui-kit";

export const Route = createFileRoute("/_admin/admin/")({
  component: DashboardPage,
});

type DashboardData = {
  summary: DashboardSummary;
  tiers: Tier[];
};

function money(currency: string, amount?: number) {
  return `${currency} ${Number(amount || 0).toLocaleString()}`;
}

function DashboardPage() {
  const [apiReady, setApiReady] = useState(false);
  const [role, setRole] = useState<UserRole | null>(null);
  const getAccess = useServerFn(getSessionAccess);

  useEffect(() => {
    setApiReady(!!getAppsScriptUrl());
    getAccess().then((r) => setRole(r.role as UserRole | null)).catch(() => setRole(null));
  }, [getAccess]);

  const dashboard = useQuery({
    queryKey: ["dashboardData"],
    queryFn: () => callApi<{ success: true; data: DashboardData }>("getDashboardData"),
    initialData: () => getLastApiResponse<{ success: true; data: DashboardData }>("getDashboardData"),
    enabled: apiReady,
    staleTime: 30_000,
  });

  const s = dashboard.data?.data.summary;
  const tiers = dashboard.data?.data.tiers ?? [];
  const currency = s?.currency ?? "PKR";

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Panda Gaming Zone — Live overview" />
      {!apiReady && (
        <Card className="mb-4">
          <p className="text-sm text-muted-foreground">
            Google Apps Script URL is not configured in this browser. Open Settings and paste your Web App URL first.
          </p>
        </Card>
      )}
      <ErrorBanner error={dashboard.error} />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        <StatCard label="Total PCs" value={s?.total_pcs ?? "—"} />
        <StatCard label="Available Now" value={s?.available_now ?? "—"} />
        <StatCard label="Booked Now" value={s?.booked_now ?? "—"} />
        <StatCard label="Today's Bookings" value={s?.todays_bookings ?? "—"} />
        <StatCard label="Pending" value={s?.pending_bookings ?? "—"} />
      </div>
      {role === "admin" && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
          <StatCard label="Earnings Today" value={s ? money(currency, s.todays_revenue) : "—"} hint="Bookings + member topups" />
          <StatCard label="Cash Today" value={s ? money(currency, s.todays_cash) : "—"} />
          <StatCard label="Online Today" value={s ? money(currency, s.todays_online) : "—"} />
          <StatCard label="Topups Today" value={s ? money(currency, s.todays_topups) : "—"} />
          <StatCard label="Expenses Today" value={s ? money(currency, s.todays_expenses) : "—"} />
          <StatCard label="Net This Month" value={s ? money(currency, s.monthly_net) : "—"} hint="Earnings minus expenses" />
        </div>
      )}
      <QuickCheck tiers={tiers} />
    </div>
  );
}

function QuickCheck({ tiers }: { tiers: Tier[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    date: today,
    start_time: "18:00",
    duration_minutes: 120,
    tier_id: "",
    pcs_required: 1,
  });
  const [result, setResult] = useState<AvailabilityResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<unknown>(null);

  const beforeSlots = useMemo(() => (result?.suggestions ?? []).filter((s) => s.relation === "before"), [result]);
  const afterSlots = useMemo(() => (result?.suggestions ?? []).filter((s) => s.relation !== "before"), [result]);

  async function check() {
    setLoading(true); setErr(null);
    try {
      const r = await callApi<AvailabilityResult>("checkAvailability", form);
      setResult(r);
    } catch (e) { setErr(e); setResult(null); }
    finally { setLoading(false); }
  }

  return (
    <Card>
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Quick Availability Check</h2>
        <p className="text-sm text-muted-foreground">Instantly see open PCs for a time slot.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Field label="Date"><input type="date" className={inputCls} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
        <Field label="Start time"><input type="time" className={inputCls} value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></Field>
        <Field label="Duration (min)"><input type="number" min={30} step={30} className={inputCls} value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: +e.target.value })} /></Field>
        <Field label="Tier">
          <select className={inputCls} value={form.tier_id} onChange={(e) => setForm({ ...form, tier_id: e.target.value })}>
            <option value="">Any</option>
            {tiers.map((t) => <option key={t.tier_id} value={t.tier_id}>{t.tier_name}</option>)}
          </select>
        </Field>
        <Field label="# PCs"><input type="number" min={1} className={inputCls} value={form.pcs_required} onChange={(e) => setForm({ ...form, pcs_required: +e.target.value })} /></Field>
      </div>
      <div className="mt-4"><Btn onClick={check} disabled={loading}>{loading ? "Checking…" : "Check availability"}</Btn></div>
      <ErrorBanner error={err} />
      {result && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2">
            <Badge tone={result.can_book ? "success" : "danger"}>
              {result.can_book ? "Available" : "Not enough PCs"}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {result.available_count} available · {result.booked_pcs.length} booked
            </span>
          </div>
          {result.available_pcs.length > 0 && (
            <div className="text-sm"><span className="text-muted-foreground">Available: </span>{result.available_pcs.join(", ")}</div>
          )}
          {result.message && <div className="text-sm text-amber-300">{result.message}</div>}
          {!result.can_book && result.suggestions && result.suggestions.length > 0 && (
            <div className="space-y-3">
              <SlotSection title="Available before checked time" slots={beforeSlots} />
              <SlotSection title="Available after checked time" slots={afterSlots} />
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function SlotSection({ title, slots }: { title: string; slots: SlotSuggestion[] }) {
  if (!slots.length) return null;
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{title}</div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 max-h-60 overflow-auto pr-1">
        {slots.map((sg, i) => (
          <div key={`${sg.start_time}-${i}`} className="rounded-md border border-border p-3 text-sm hover:border-primary/40 hover:bg-accent/10 transition">
            <div className="font-medium">{sg.start_time} – {sg.end_time}</div>
            <div className="text-xs text-muted-foreground">{sg.available_count} PCs available</div>
          </div>
        ))}
      </div>
    </div>
  );
}
