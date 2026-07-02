import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { callApi, getLastApiResponse, type ShiftSummary } from "@/lib/api";
import { requireAdminAccess } from "@/lib/gate.functions";
import { PageHeader, Card, Btn, StatCard, Badge, ErrorBanner, EmptyState, statusTone } from "@/components/ui-kit";
import { toast } from "sonner";

export const Route = createFileRoute("/_admin/admin/shifts")({
  beforeLoad: async () => {
    const access = await requireAdminAccess();
    if (!access.ok) throw redirect({ to: "/admin" });
  },
  component: ShiftsPage,
});

function money(amount?: number) {
  return `Rs ${Number(amount || 0).toLocaleString()}`;
}

function ShiftsPage() {
  const qc = useQueryClient();
  const reports = useQuery({
    queryKey: ["shiftReports"],
    queryFn: () => callApi<{ success: true; data: ShiftSummary[] }>("getShiftReports", { limit: 100 }),
    initialData: () => getLastApiResponse<{ success: true; data: ShiftSummary[] }>("getShiftReports", { limit: 100 }),
    staleTime: 30_000,
  });

  const close = useMutation({
    mutationFn: (shift_id: string) => callApi("closeShift", { shift_id }),
    onSuccess: () => {
      toast.success("Shift closed");
      qc.invalidateQueries({ queryKey: ["shiftReports"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const rows = reports.data?.data ?? [];
  const active = rows.filter((r) => r.status === "Active");
  const today = new Date().toISOString().slice(0, 10);
  const todayRows = rows.filter((r) => String(r.clock_in_at || "").startsWith(today));
  const todayExpectedCash = todayRows.reduce((sum, r) => sum + Number(r.expected_cash || 0), 0);
  const todayRevenue = todayRows.reduce((sum, r) => sum + Number(r.total_revenue || 0), 0);

  return (
    <div>
      <PageHeader title="Cashier Shifts" subtitle="Admin-only shift reports. Check expected cash against the drawer when you arrive." />
      <ErrorBanner error={reports.error} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <StatCard label="Active shifts" value={active.length} />
        <StatCard label="Today revenue" value={money(todayRevenue)} hint="Bookings + member topups" />
        <StatCard label="Today expected cash" value={money(todayExpectedCash)} hint="Cash collected - cash expenses" />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-border">
                <th className="p-3">Cashier</th>
                <th className="p-3">Clock in</th>
                <th className="p-3">Clock out</th>
                <th className="p-3">Status</th>
                <th className="p-3">Bookings</th>
                <th className="p-3">Revenue</th>
                <th className="p-3">Cash</th>
                <th className="p-3">Online</th>
                <th className="p-3">Expenses</th>
                <th className="p-3">Expected Cash</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.shift_id} className="border-b border-border/50 hover:bg-accent/10 transition-colors align-top">
                  <td className="p-3 font-medium">{r.cashier_name}<div className="text-xs text-muted-foreground">{r.shift_id}</div></td>
                  <td className="p-3 whitespace-nowrap">{r.clock_in_at}</td>
                  <td className="p-3 whitespace-nowrap">{r.clock_out_at || "—"}</td>
                  <td className="p-3"><Badge tone={statusTone(r.status)}>{r.status}</Badge></td>
                  <td className="p-3"><div>{r.bookings_created} created</div><div className="text-xs text-muted-foreground">{r.completed_bookings} paid</div></td>
                  <td className="p-3 neon-text font-semibold">{money(r.total_revenue)}</td>
                  <td className="p-3">{money(r.cash_collected)}</td>
                  <td className="p-3">{money(r.online_collected)}</td>
                  <td className="p-3">{money(r.expenses_total)}</td>
                  <td className="p-3 font-semibold">{money(r.expected_cash)}</td>
                  <td className="p-3 text-right">
                    {r.status === "Active" ? <Btn variant="outline" onClick={() => close.mutate(r.shift_id)} disabled={close.isPending}>Close</Btn> : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <EmptyState>No shifts found yet. Cashier shifts start when a cashier logs in.</EmptyState>}
        </div>
      </Card>
    </div>
  );
}
