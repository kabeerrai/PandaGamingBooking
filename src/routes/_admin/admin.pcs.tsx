import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { callApi, getLastApiResponse, type PC, type Tier } from "@/lib/api";
import { PageHeader, Card, Btn, Field, inputCls, Badge, ErrorBanner, EmptyState, statusTone } from "@/components/ui-kit";
import { Plus, Trash2, Pencil, X } from "lucide-react";

export const Route = createFileRoute("/_admin/admin/pcs")({
  component: PCsPage,
});

const STATUSES = ["Active", "Inactive", "Maintenance"] as const;

function PCsPage() {
  const qc = useQueryClient();
  const pcs = useQuery({
    queryKey: ["pcs"],
    queryFn: () => callApi<{ success: true; data: PC[] }>("getPCs"),
    initialData: () => getLastApiResponse<{ success: true; data: PC[] }>("getPCs"),
  });
  const tiers = useQuery({
    queryKey: ["tiers"],
    queryFn: () => callApi<{ success: true; data: Tier[] }>("getTiers"),
    initialData: () => getLastApiResponse<{ success: true; data: Tier[] }>("getTiers"),
  });
  const [editing, setEditing] = useState<PC | null>(null);
  const [showForm, setShowForm] = useState(false);

  const del = useMutation({
    mutationFn: (pc_id: string) => callApi("deletePC", { pc_id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pcs"] }),
  });

  const tierName = (id: string) => tiers.data?.data.find((t) => t.tier_id === id)?.tier_name ?? id;

  return (
    <div>
      <PageHeader
        title="Manage PCs"
        subtitle="Add, edit, or remove gaming stations."
        action={
          <Btn onClick={() => { setEditing(null); setShowForm(true); }}>
            <Plus className="size-4" /> Add PC
          </Btn>
        }
      />
      <ErrorBanner error={pcs.error} />
      {showForm && (
        <PCForm
          initial={editing}
          tiers={tiers.data?.data ?? []}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); qc.invalidateQueries({ queryKey: ["pcs"] }); }}
        />
      )}
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-border">
                <th className="p-3">PC</th><th className="p-3">Tier</th><th className="p-3">Status</th><th className="p-3">Updated</th><th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pcs.data?.data.map((pc) => (
                <tr key={pc.pc_id} className="border-b border-border/50 hover:bg-accent/5">
                  <td className="p-3 font-medium">{pc.pc_name}</td>
                  <td className="p-3">{tierName(pc.tier_id)}</td>
                  <td className="p-3"><Badge tone={statusTone(pc.status)}>{pc.status}</Badge></td>
                  <td className="p-3 text-muted-foreground">{pc.updated_at ?? "—"}</td>
                  <td className="p-3 text-right space-x-1">
                    <Btn variant="ghost" onClick={() => { setEditing(pc); setShowForm(true); }}><Pencil className="size-3" /></Btn>
                    <Btn variant="ghost" onClick={() => { if (confirm(`Delete ${pc.pc_name}?`)) del.mutate(pc.pc_id); }}><Trash2 className="size-3" /></Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pcs.data?.data.length === 0 && <EmptyState>No PCs yet — add your first station.</EmptyState>}
        </div>
      </Card>
    </div>
  );
}

function PCForm({ initial, tiers, onClose, onSaved }: { initial: PC | null; tiers: Tier[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    pc_name: initial?.pc_name ?? "",
    tier_id: initial?.tier_id ?? tiers[0]?.tier_id ?? "",
    status: initial?.status ?? "Active",
  });
  const [err, setErr] = useState<unknown>(null);
  const save = useMutation({
    mutationFn: () => callApi(initial ? "updatePC" : "addPC", initial ? { pc_id: initial.pc_id, ...form } : form),
    onSuccess: onSaved,
    onError: setErr,
  });

  return (
    <Card className="mb-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">{initial ? "Edit PC" : "Add PC"}</h2>
        <Btn variant="ghost" onClick={onClose}><X className="size-4" /></Btn>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="PC Name"><input className={inputCls} value={form.pc_name} onChange={(e) => setForm({ ...form, pc_name: e.target.value })} placeholder="PC-01" /></Field>
        <Field label="Tier">
          <select className={inputCls} value={form.tier_id} onChange={(e) => setForm({ ...form, tier_id: e.target.value })}>
            {tiers.map((t) => <option key={t.tier_id} value={t.tier_id}>{t.tier_name}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as any })}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
      </div>
      <ErrorBanner error={err} />
      <div className="mt-4 flex gap-2">
        <Btn onClick={() => save.mutate()} disabled={save.isPending || !form.pc_name || !form.tier_id}>
          {save.isPending ? "Saving…" : "Save"}
        </Btn>
        <Btn variant="outline" onClick={onClose}>Cancel</Btn>
      </div>
    </Card>
  );
}
