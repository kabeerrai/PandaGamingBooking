import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { callApi, getLastApiResponse, type AvailabilityResult, type Tier, type SlotSuggestion } from "@/lib/api";
import { PageHeader, Card, Btn, Field, inputCls, Badge, ErrorBanner } from "@/components/ui-kit";

export const Route = createFileRoute("/_admin/admin/availability")({
  component: AvailabilityPage,
});

function AvailabilityPage() {
  const nav = useNavigate();
  const tiers = useQuery({
    queryKey: ["tiers"],
    queryFn: () => callApi<{ success: true; data: Tier[] }>("getTiers"),
    initialData: () => getLastApiResponse<{ success: true; data: Tier[] }>("getTiers"),
  });
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    date: today,
    start_time: "18:00",
    duration_minutes: 120,
    tier_id: "",
    pcs_required: 1,
  });
  const [result, setResult] = useState<AvailabilityResult | null>(null);
  const check = useMutation({
    mutationFn: () => callApi<AvailabilityResult>("checkAvailability", form),
    onSuccess: setResult,
  });

  const beforeSlots = useMemo(() => (result?.suggestions ?? []).filter((s) => s.relation === "before"), [result]);
  const afterSlots = useMemo(() => (result?.suggestions ?? []).filter((s) => s.relation !== "before"), [result]);

  function proceedBook(overrideStart?: string) {
    nav({
      to: "/admin/bookings/new",
      search: {
        date: form.date,
        start_time: overrideStart ?? form.start_time,
        duration_minutes: form.duration_minutes,
        tier_id: form.tier_id,
        pcs_required: form.pcs_required,
      } as any,
    });
  }

  return (
    <div>
      <PageHeader title="Availability Checker" subtitle="Find open PCs before creating a booking." />
      <Card className="mb-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Field label="Date"><input type="date" className={inputCls} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="Start time"><input type="time" className={inputCls} value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></Field>
          <Field label="Duration (min)"><input type="number" min={30} step={30} className={inputCls} value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: +e.target.value })} /></Field>
          <Field label="Tier">
            <select className={inputCls} value={form.tier_id} onChange={(e) => setForm({ ...form, tier_id: e.target.value })}>
              <option value="">Select tier</option>
              {tiers.data?.data.map((t) => <option key={t.tier_id} value={t.tier_id}>{t.tier_name}</option>)}
            </select>
          </Field>
          <Field label="# PCs"><input type="number" min={1} className={inputCls} value={form.pcs_required} onChange={(e) => setForm({ ...form, pcs_required: +e.target.value })} /></Field>
        </div>
        <div className="mt-4">
          <Btn onClick={() => check.mutate()} disabled={check.isPending || !form.tier_id}>{check.isPending ? "Checking…" : "Check"}</Btn>
        </div>
        <ErrorBanner error={check.error} />
      </Card>

      {result && (
        <Card>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Badge tone={result.can_book ? "success" : "danger"}>
                {result.can_book ? `Available — ${result.available_count} PCs` : "Not enough PCs"}
              </Badge>
              <span className="text-sm text-muted-foreground">{result.requested.start_time} – {result.requested.end_time}</span>
            </div>
            {result.can_book && <Btn onClick={() => proceedBook()}>Create booking</Btn>}
          </div>
          <div className="mt-3 grid md:grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-1">Available</div>
              <div>{result.available_pcs.length ? result.available_pcs.join(", ") : "—"}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-1">Booked</div>
              <div>{result.booked_pcs.length ? result.booked_pcs.join(", ") : "—"}</div>
            </div>
          </div>
          {result.message && <div className="mt-3 text-sm text-amber-300">{result.message}</div>}
          {!result.can_book && result.suggestions && result.suggestions.length > 0 && (
            <div className="mt-4 space-y-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Available before checked time</div>
                {beforeSlots.length ? <SlotGrid slots={beforeSlots} onPick={(s) => proceedBook(s.start_time)} /> : <p className="text-sm text-muted-foreground">No earlier slots for this duration.</p>}
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Available after checked time</div>
                {afterSlots.length ? <SlotGrid slots={afterSlots} onPick={(s) => proceedBook(s.start_time)} /> : <p className="text-sm text-muted-foreground">No later slots for this duration.</p>}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function SlotGrid({ slots, onPick }: { slots: SlotSuggestion[]; onPick: (slot: SlotSuggestion) => void }) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 max-h-72 overflow-auto pr-1">
      {slots.map((s, i) => (
        <button
          key={`${s.start_time}-${i}`}
          onClick={() => onPick(s)}
          className="text-left rounded-md border border-border p-3 text-sm hover:bg-accent/10 hover:border-primary/40 active:scale-[0.98] transition cursor-pointer"
        >
          <div className="font-medium">{s.start_time} – {s.end_time}</div>
          <div className="text-xs text-muted-foreground">{s.available_count} PCs available</div>
        </button>
      ))}
    </div>
  );
}
