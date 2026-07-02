import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { callApi, getLastApiResponse, type RevenueAnalytics } from "@/lib/api";
import { requireAdminAccess } from "@/lib/gate.functions";
import { PageHeader, Card, StatCard, Field, inputCls, ErrorBanner, EmptyState } from "@/components/ui-kit";

export const Route = createFileRoute("/_admin/admin/revenue")({
  beforeLoad: async () => {
    const access = await requireAdminAccess();
    if (!access.ok) throw redirect({ to: "/admin" });
  },
  component: RevenuePage,
});

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}
function currentYear() {
  return new Date().toISOString().slice(0, 4);
}
function money(currency: string, amount?: number) {
  return `${currency} ${Number(amount || 0).toLocaleString()}`;
}
function percent(value: number, total: number) {
  if (!total) return 0;
  return Math.min(100, Math.round((Number(value || 0) / total) * 100));
}

function RevenuePage() {
  const [filters, setFilters] = useState({ month: currentMonth(), year: currentYear() });
  const analytics = useQuery({
    queryKey: ["revenueAnalytics", filters.month, filters.year],
    queryFn: () => callApi<{ success: true; data: RevenueAnalytics }>("getRevenueAnalytics", filters),
    initialData: () => getLastApiResponse<{ success: true; data: RevenueAnalytics }>("getRevenueAnalytics", filters),
    staleTime: 60_000,
  });

  const data = analytics.data?.data;
  const currency = data?.currency ?? "PKR";
  const maxTierRevenue = useMemo(() => Math.max(0, ...(data?.tier_revenue ?? []).map((r) => Number(r.revenue || 0))), [data]);
  const maxPcRevenue = useMemo(() => Math.max(0, ...(data?.pc_revenue ?? []).map((r) => Number(r.revenue || 0))), [data]);

  return (
    <div>
      <PageHeader title="Revenue" subtitle="Admin-only revenue breakdown by month, year, tier, and PC." />

      <Card className="mb-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Month for PC/Tier breakdown">
            <input
              type="month"
              className={inputCls}
              value={filters.month}
              onChange={(e) => setFilters((f) => ({ ...f, month: e.target.value, year: e.target.value.slice(0, 4) || f.year }))}
            />
          </Field>
          <Field label="Year for yearly report">
            <input
              type="number"
              min={2020}
              max={2100}
              className={inputCls}
              value={filters.year}
              onChange={(e) => setFilters((f) => ({ ...f, year: e.target.value }))}
            />
          </Field>
        </div>
      </Card>

      <ErrorBanner error={analytics.error} />

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        <StatCard label="Month Booking Revenue" value={data ? money(currency, data.totals.month_booking_revenue) : "—"} />
        <StatCard label="Month Topups" value={data ? money(currency, data.totals.month_topups) : "—"} />
        <StatCard label="Month Expenses" value={data ? money(currency, data.totals.month_expenses) : "—"} />
        <StatCard label="Month Total Revenue" value={data ? money(currency, data.totals.month_total_revenue) : "—"} hint="Bookings + topups" />
        <StatCard label="Month Net" value={data ? money(currency, data.totals.month_net) : "—"} hint="Revenue - expenses" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <StatCard label="Year Booking Revenue" value={data ? money(currency, data.totals.year_booking_revenue) : "—"} />
        <StatCard label="Year Topups" value={data ? money(currency, data.totals.year_topups) : "—"} />
        <StatCard label="Year Expenses" value={data ? money(currency, data.totals.year_expenses) : "—"} />
        <StatCard label="Year Total Revenue" value={data ? money(currency, data.totals.year_total_revenue) : "—"} hint="Bookings + topups" />
        <StatCard label="Year Net" value={data ? money(currency, data.totals.year_net) : "—"} hint="Revenue - expenses" />
      </div>

      <div className="grid xl:grid-cols-2 gap-4 mb-4">
        <Card>
          <h2 className="font-semibold mb-1">Revenue by Tier</h2>
          <p className="text-sm text-muted-foreground mb-4">Shows which category earns more, like Standard, Pro, VIP, or PS5.</p>
          <div className="space-y-3">
            {(data?.tier_revenue ?? []).map((row) => (
              <RevenueBar
                key={row.tier_id}
                label={row.tier_name || row.tier_id}
                sub={`${row.bookings} booking(s) · ${row.hours} hour(s)`}
                amount={row.revenue}
                currency={currency}
                width={percent(row.revenue, maxTierRevenue)}
              />
            ))}
            {data && data.tier_revenue.length === 0 && <EmptyState>No completed booking payments found for this month yet.</EmptyState>}
          </div>
        </Card>

        <Card>
          <h2 className="font-semibold mb-1">Top Earning PCs</h2>
          <p className="text-sm text-muted-foreground mb-4">For multi-PC bookings, revenue is split evenly between the assigned PCs.</p>
          <div className="space-y-3 max-h-[520px] overflow-auto pr-1">
            {(data?.pc_revenue ?? []).map((row) => (
              <RevenueBar
                key={row.pc_id}
                label={row.pc_name || row.pc_id}
                sub={`${row.tier_name || "Tier"} · ${row.bookings} booking(s) · ${row.hours} hour(s)`}
                amount={row.revenue}
                currency={currency}
                width={percent(row.revenue, maxPcRevenue)}
              />
            ))}
            {data && data.pc_revenue.length === 0 && <EmptyState>No PC-level revenue found for this month yet.</EmptyState>}
          </div>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="p-5 border-b border-border">
          <h2 className="font-semibold">Monthly Revenue for {filters.year}</h2>
          <p className="text-sm text-muted-foreground">Booking revenue, member topups, expenses, and net revenue by month.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-border">
                <th className="p-3">Month</th>
                <th className="p-3">Bookings</th>
                <th className="p-3">Topups</th>
                <th className="p-3">Total Revenue</th>
                <th className="p-3">Expenses</th>
                <th className="p-3">Net</th>
              </tr>
            </thead>
            <tbody>
              {(data?.monthly_breakdown ?? []).map((m) => (
                <tr key={m.month} className="border-b border-border/50 hover:bg-accent/10 transition-colors">
                  <td className="p-3 font-medium">{m.month}</td>
                  <td className="p-3">{money(currency, m.booking_revenue)}</td>
                  <td className="p-3">{money(currency, m.topups)}</td>
                  <td className="p-3 neon-text font-semibold">{money(currency, m.total_revenue)}</td>
                  <td className="p-3">{money(currency, m.expenses)}</td>
                  <td className="p-3 font-semibold">{money(currency, m.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && data.monthly_breakdown.length === 0 && <EmptyState>No revenue data found for this year.</EmptyState>}
        </div>
      </Card>
    </div>
  );
}

function RevenueBar({ label, sub, amount, currency, width }: { label: string; sub: string; amount: number; currency: string; width: number }) {
  return (
    <div className="rounded-lg border border-border/70 p-3 hover:border-primary/40 hover:bg-accent/10 transition">
      <div className="flex items-start justify-between gap-3 text-sm">
        <div>
          <div className="font-medium">{label}</div>
          <div className="text-xs text-muted-foreground">{sub}</div>
        </div>
        <div className="font-semibold neon-text whitespace-nowrap">{money(currency, amount)}</div>
      </div>
      <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-primary/80" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
