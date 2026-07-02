import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { callApi, getAppsScriptUrl, getLastApiResponse, type DashboardSummary, type AvailabilityResult, type Tier, type SlotSuggestion, type ShiftSummary } from "@/lib/api";
import { getSessionAccess, type UserRole } from "@/lib/gate.functions";
import { PageHeader, StatCard, Card, Field, inputCls, Btn, Badge, ErrorBanner } from "@/components/ui-kit";

export const Route = createFileRoute("/_admin/admin/")({
  component: DashboardPage,
});

type DashboardData = {
  summary: DashboardSummary;
  tiers: Tier[];
};

type SessionInfo = {
  role?: UserRole | null;
  cashier_name?: string;
  shift_id?: string;
  shift_started_at?: string;
};

function money(currency: string, amount?: number) {
  return `${currency} ${Number(amount || 0).toLocaleString()}`;
}

function DashboardPage() {
  const [apiReady, setApiReady] = useState(false);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const getAccess = useServerFn(getSessionAccess);

  useEffect(() => {
    setApiReady(!!getAppsScriptUrl());
    getAccess().then((r) => setSession(r as SessionInfo)).catch(() => setSession(null));
  }, [getAccess]);

  const dashboard = useQuery({
    queryKey: ["dashboardData"],
    queryFn: () => callApi<{ success: true; data: DashboardData }>("getDashboardData"),
    initialData: () => getLastApiResponse<{ success: true; data: DashboardData }>("getDashboardData"),
    enabled: apiReady,
    staleTime: 30_000,
  });

  const shiftSummary = useQuery({
    queryKey: ["myShiftSummary", session?.shift_id],
    queryFn: () => callApi<{ success: true; data: ShiftSummary | null }>("getMyShiftSummary", { shift_id: session?.shift_id }),
    initialData: () => getLastApiResponse<{ success: true; data: ShiftSummary | null }>("getMyShiftSummary", { shift_id: session?.shift_id }),
    enabled: apiReady && session?.role === "cashier" && !!session?.shift_id,
    refetchInterval: 30_000,
    staleTime: 10_000,
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
      {session?.role === "cashier" && shiftSummary.data?.data && (
        <CashierShiftCard shift={shiftSummary.data.data} />
      )}
      {session?.role === "admin" && (
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

function CashierShiftCard({ shift }: { shift: ShiftSummary }) {
  const money = (amount?: number) => `Rs ${Number(amount || 0).toLocaleString()}`;
  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold">My Active Shift</h2>
          <p className="text-sm text-muted-foreground">Clocked in as {shift.cashier_name} · {shift.shift_id}</p>
        </div>
        <Badge tone={shift.status === "Active" ? "success" : "default"}>{shift.status}</Badge>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatCard label="Bookings Created" value={shift.bookings_created} />
        <StatCard label="Completed" value={shift.completed_bookings} />
        <StatCard label="Shift Revenue" value={money(shift.total_revenue)} hint="Bookings + topups" />
        <StatCard label="Cash Collected" value={money(shift.cash_collected)} />
        <StatCard label="Expenses" value={money(shift.expenses_total)} />
        <StatCard label="Expected Cash" value={money(shift.expected_cash)} hint="Cash - cash expenses" />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">When admin checks the drawer, expected cash should roughly match the cash physically available for this shift.</p>
    </Card>
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
