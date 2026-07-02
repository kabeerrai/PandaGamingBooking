import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { callApi, getLastApiResponse, type Customer, type MemberTopup } from "@/lib/api";
import { PageHeader, Card, Btn, Field, inputCls, ErrorBanner, EmptyState } from "@/components/ui-kit";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_admin/admin/member-topup")({
  component: MemberTopupPage,
});

const PAYMENT_METHODS = ["Cash", "JazzCash", "Easypaisa", "Bank"] as const;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function MemberTopupPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    member_name: "",
    phone_number: "",
    amount: 0,
    topup_date: today(),
    payment_method: "Cash",
    notes: "",
  });

  const customers = useQuery({
    queryKey: ["customers"],
    queryFn: () => callApi<{ success: true; data: Customer[] }>("getCustomers"),
    initialData: () => getLastApiResponse<{ success: true; data: Customer[] }>("getCustomers"),
    staleTime: 120_000,
  });

  const topups = useQuery({
    queryKey: ["memberTopups"],
    queryFn: () => callApi<{ success: true; data: MemberTopup[] }>("getMemberTopups"),
    initialData: () => getLastApiResponse<{ success: true; data: MemberTopup[] }>("getMemberTopups"),
    staleTime: 30_000,
  });

  const add = useMutation({
    mutationFn: () => callApi("addMemberTopup", form),
    onSuccess: () => {
      toast.success("Member topup saved");
      setForm({ member_name: "", phone_number: "", amount: 0, topup_date: today(), payment_method: "Cash", notes: "" });
      setSearch("");
      qc.invalidateQueries({ queryKey: ["memberTopups"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["dashboardData"] });
    },
  });

  const del = useMutation({
    mutationFn: (topup_id: string) => callApi("deleteMemberTopup", { topup_id }),
    onSuccess: () => {
      toast.success("Topup deleted");
      qc.invalidateQueries({ queryKey: ["memberTopups"] });
      qc.invalidateQueries({ queryKey: ["dashboardData"] });
    },
  });

  const customerMatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return (customers.data?.data ?? [])
      .filter((c) =>
        String(c.customer_name || "").toLowerCase().includes(q) ||
        String(c.phone_number || "").toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [customers.data, search]);

  const rows = (topups.data?.data ?? []).slice().sort((a, b) => String(b.topup_date || "").localeCompare(String(a.topup_date || "")));
  const totalToday = rows.filter((r) => r.topup_date === today()).reduce((sum, r) => sum + Number(r.amount || 0), 0);

  function pickCustomer(c: Customer) {
    setForm((f) => ({ ...f, member_name: c.customer_name || "", phone_number: c.phone_number || "" }));
    setSearch(`${c.customer_name || ""} ${c.phone_number || ""}`.trim());
  }

  return (
    <div>
      <PageHeader title="Member Topup" subtitle="Record member balance topups as sales." />

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Card className="lg:col-span-2">
          <h2 className="font-semibold mb-3">Add Topup</h2>
          <div className="mb-4 rounded-lg border border-border/70 bg-background/40 p-3">
            <Field label="Find saved customer" hint="Optional — search by name or phone.">
              <input className={inputCls} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer" />
            </Field>
            {customerMatches.length > 0 && (
              <div className="mt-2 grid sm:grid-cols-2 gap-2">
                {customerMatches.map((c) => (
                  <button
                    key={c.customer_id || `${c.customer_name}-${c.phone_number}`}
                    type="button"
                    onClick={() => pickCustomer(c)}
                    className="rounded-md border border-border px-3 py-2 text-left text-sm hover:border-primary/50 hover:bg-accent/10 active:scale-[0.99] transition"
                  >
                    <div className="font-medium">{c.customer_name || "Unnamed"}</div>
                    <div className="text-xs text-muted-foreground">{c.phone_number || "No phone"}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <Field label="Member name"><input className={inputCls} value={form.member_name} onChange={(e) => setForm({ ...form, member_name: e.target.value })} /></Field>
            <Field label="Phone number"><input className={inputCls} value={form.phone_number} onChange={(e) => setForm({ ...form, phone_number: e.target.value })} /></Field>
            <Field label="Topup amount"><input type="number" min={0} className={inputCls} value={form.amount} onChange={(e) => setForm({ ...form, amount: +e.target.value })} /></Field>
            <Field label="Date"><input type="date" className={inputCls} value={form.topup_date} onChange={(e) => setForm({ ...form, topup_date: e.target.value })} /></Field>
            <Field label="Payment method">
              <select className={inputCls} value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Notes"><input className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional" /></Field>
          </div>
          <ErrorBanner error={add.error} />
          <div className="mt-4"><Btn onClick={() => add.mutate()} disabled={add.isPending || !form.member_name || !form.amount}>{add.isPending ? "Saving…" : "Save topup"}</Btn></div>
        </Card>

        <Card>
          <div className="text-xs uppercase text-muted-foreground">Topups today</div>
          <div className="text-3xl font-bold neon-text mt-1">Rs {totalToday.toLocaleString()}</div>
          <p className="text-sm text-muted-foreground mt-2">Topups are counted as earnings in the admin dashboard.</p>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-border">
                <th className="p-3">Date</th>
                <th className="p-3">Member</th>
                <th className="p-3">Phone</th>
                <th className="p-3">Method</th>
                <th className="p-3">Notes</th>
                <th className="p-3">Amount</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.topup_id} className="border-b border-border/50 hover:bg-accent/10 transition-colors">
                  <td className="p-3">{r.topup_date}</td>
                  <td className="p-3 font-medium">{r.member_name}</td>
                  <td className="p-3">{r.phone_number || "—"}</td>
                  <td className="p-3">{r.payment_method || "Cash"}</td>
                  <td className="p-3 text-muted-foreground">{r.notes || "—"}</td>
                  <td className="p-3 neon-text font-semibold">Rs {Number(r.amount || 0).toLocaleString()}</td>
                  <td className="p-3 text-right"><Btn variant="ghost" onClick={() => { if (confirm("Delete this topup?")) del.mutate(r.topup_id); }}><Trash2 className="size-3" /></Btn></td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <EmptyState>No member topups saved yet.</EmptyState>}
        </div>
      </Card>
    </div>
  );
}
