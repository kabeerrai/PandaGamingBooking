import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { callApi, getLastApiResponse, type Tier } from "@/lib/api";
import { PageHeader, Card, Btn, Field, inputCls, ErrorBanner, EmptyState } from "@/components/ui-kit";
import { Plus, Trash2, Pencil, X } from "lucide-react";

export const Route = createFileRoute("/_admin/admin/tiers")({
  component: TiersPage,
});

function TiersPage() {
  const qc = useQueryClient();
  const tiers = useQuery({
    queryKey: ["tiers"],
    queryFn: () => callApi<{ success: true; data: Tier[] }>("getTiers"),
    initialData: () => getLastApiResponse<{ success: true; data: Tier[] }>("getTiers"),
  });
  const [editing, setEditing] = useState<Tier | null>(null);
  const [showForm, setShowForm] = useState(false);

  const del = useMutation({
    mutationFn: (tier_id: string) => callApi("deleteTier", { tier_id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tiers"] }),
  });

  return (
    <div>
      <PageHeader
        title="Manage Tiers"
        subtitle="Pricing tiers assigned to PCs."
        action={<Btn onClick={() => { setEditing(null); setShowForm(true); }}><Plus className="size-4" /> Add Tier</Btn>}
      />
      <ErrorBanner error={tiers.error} />
      {showForm && (
        <TierForm
          initial={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); qc.invalidateQueries({ queryKey: ["tiers"] }); }}
        />
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {tiers.data?.data.map((t) => (
          <Card key={t.tier_id}>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs text-muted-foreground">{t.tier_id}</div>
                <div className="text-lg font-semibold">{t.tier_name}</div>
              </div>
              <div className="flex gap-1">
                <Btn variant="ghost" onClick={() => { setEditing(t); setShowForm(true); }}><Pencil className="size-3" /></Btn>
                <Btn variant="ghost" onClick={() => { if (confirm(`Delete ${t.tier_name}?`)) del.mutate(t.tier_id); }}><Trash2 className="size-3" /></Btn>
              </div>
            </div>
            <div className="mt-2 neon-text text-xl font-bold">{Number(t.price_per_hour).toLocaleString()}<span className="text-xs text-muted-foreground ml-1">/hr</span></div>
            {t.description && <p className="text-sm text-muted-foreground mt-2">{t.description}</p>}
          </Card>
        ))}
      </div>
      {tiers.data?.data.length === 0 && <EmptyState>No tiers yet.</EmptyState>}
    </div>
  );
}

function TierForm({ initial, onClose, onSaved }: { initial: Tier | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    tier_name: initial?.tier_name ?? "",
    price_per_hour: initial?.price_per_hour ?? 0,
    description: initial?.description ?? "",
  });
  const [err, setErr] = useState<unknown>(null);
  const save = useMutation({
    mutationFn: () => callApi(initial ? "updateTier" : "addTier", initial ? { tier_id: initial.tier_id, ...form } : form),
    onSuccess: onSaved,
    onError: setErr,
  });
  return (
    <Card className="mb-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">{initial ? "Edit Tier" : "Add Tier"}</h2>
        <Btn variant="ghost" onClick={onClose}><X className="size-4" /></Btn>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Tier Name"><input className={inputCls} value={form.tier_name} onChange={(e) => setForm({ ...form, tier_name: e.target.value })} placeholder="Premium" /></Field>
        <Field label="Price per hour"><input type="number" min={0} className={inputCls} value={form.price_per_hour} onChange={(e) => setForm({ ...form, price_per_hour: +e.target.value })} /></Field>
        <Field label="Description"><input className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="High-end gaming PC" /></Field>
      </div>
      <ErrorBanner error={err} />
      <div className="mt-4 flex gap-2">
        <Btn onClick={() => save.mutate()} disabled={save.isPending || !form.tier_name}>{save.isPending ? "Saving…" : "Save"}</Btn>
        <Btn variant="outline" onClick={onClose}>Cancel</Btn>
      </div>
    </Card>
  );
}
