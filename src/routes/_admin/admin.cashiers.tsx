import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { callApi, getLastApiResponse, type Cashier } from "@/lib/api";
import { requireAdminAccess } from "@/lib/gate.functions";
import { PageHeader, Card, Btn, Field, inputCls, Badge, ErrorBanner, EmptyState, statusTone } from "@/components/ui-kit";
import { Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_admin/admin/cashiers")({
  beforeLoad: async () => {
    const access = await requireAdminAccess();
    if (!access.ok) throw redirect({ to: "/admin" });
  },
  component: CashiersPage,
});

type CashierForm = {
  cashier_name: string;
  username: string;
  password: string;
  status: string;
};

const emptyForm: CashierForm = { cashier_name: "", username: "", password: "", status: "Active" };

function CashiersPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<CashierForm>(emptyForm);
  const [editing, setEditing] = useState<Cashier | null>(null);

  const cashiers = useQuery({
    queryKey: ["cashiers"],
    queryFn: () => callApi<{ success: true; data: Cashier[] }>("getCashiers"),
    initialData: () => getLastApiResponse<{ success: true; data: Cashier[] }>("getCashiers"),
    staleTime: 60_000,
  });

  const add = useMutation({
    mutationFn: () => callApi("addCashier", form),
    onSuccess: () => {
      toast.success("Cashier added");
      setForm(emptyForm);
      qc.invalidateQueries({ queryKey: ["cashiers"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const update = useMutation({
    mutationFn: (payload: Cashier) => callApi("updateCashier", payload),
    onSuccess: () => {
      toast.success("Cashier updated");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["cashiers"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const del = useMutation({
    mutationFn: (cashier_id: string) => callApi("deleteCashier", { cashier_id }),
    onSuccess: () => {
      toast.success("Cashier deleted");
      qc.invalidateQueries({ queryKey: ["cashiers"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const rows = cashiers.data?.data ?? [];

  return (
    <div>
      <PageHeader title="Cashiers" subtitle="Admin-only cashier accounts. Add cashiers and change their passwords without touching code." />
      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Card className="lg:col-span-1">
          <h2 className="font-semibold mb-3">Add cashier</h2>
          <div className="space-y-3">
            <Field label="Cashier name"><input className={inputCls} value={form.cashier_name} onChange={(e) => setForm({ ...form, cashier_name: e.target.value })} placeholder="e.g. Ali" /></Field>
            <Field label="Username"><input className={inputCls} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="e.g. ali" /></Field>
            <Field label="Password"><input className={inputCls} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Cashier password" /></Field>
            <Field label="Status">
              <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </Field>
          </div>
          <ErrorBanner error={add.error} />
          <div className="mt-4"><Btn onClick={() => add.mutate()} disabled={add.isPending || !form.cashier_name || !form.username || !form.password}>{add.isPending ? "Saving…" : "Add cashier"}</Btn></div>
        </Card>

        <Card className="lg:col-span-2 p-0 overflow-hidden">
          <div className="p-5 border-b border-border">
            <h2 className="font-semibold">Saved cashiers</h2>
            <p className="text-sm text-muted-foreground">You can view and change passwords here.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="p-3">Name</th>
                  <th className="p-3">Username</th>
                  <th className="p-3">Password</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.cashier_id} className="border-b border-border/50 hover:bg-accent/10 transition-colors">
                    <td className="p-3 font-medium">{c.cashier_name}</td>
                    <td className="p-3">{c.username}</td>
                    <td className="p-3 font-mono text-xs">{c.password}</td>
                    <td className="p-3"><Badge tone={statusTone(c.status)}>{c.status || "Active"}</Badge></td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Btn variant="ghost" onClick={() => setEditing(c)}><Pencil className="size-3" /></Btn>
                        <Btn variant="ghost" onClick={() => { if (confirm("Delete this cashier? Their old shift records will remain.")) del.mutate(c.cashier_id); }}><Trash2 className="size-3" /></Btn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <EmptyState>No cashiers saved yet.</EmptyState>}
          </div>
        </Card>
      </div>

      {editing && <EditCashierModal cashier={editing} onClose={() => setEditing(null)} onSave={(payload) => update.mutate(payload)} saving={update.isPending} />}
    </div>
  );
}

function EditCashierModal({ cashier, onClose, onSave, saving }: { cashier: Cashier; onClose: () => void; onSave: (payload: Cashier) => void; saving: boolean }) {
  const [form, setForm] = useState<Cashier>({ ...cashier });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-semibold">Edit cashier</h2>
            <p className="text-sm text-muted-foreground">Change name, username, password, or status.</p>
          </div>
          <Btn variant="ghost" onClick={onClose}><X className="size-4" /></Btn>
        </div>
        <div className="space-y-3">
          <Field label="Cashier name"><input className={inputCls} value={form.cashier_name} onChange={(e) => setForm({ ...form, cashier_name: e.target.value })} /></Field>
          <Field label="Username"><input className={inputCls} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></Field>
          <Field label="Password"><input className={inputCls} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
          <Field label="Status">
            <select className={inputCls} value={form.status || "Active"} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Btn variant="outline" onClick={onClose}>Cancel</Btn>
          <Btn onClick={() => onSave(form)} disabled={saving}>{saving ? "Saving…" : "Save cashier"}</Btn>
        </div>
      </div>
    </div>
  );
}
