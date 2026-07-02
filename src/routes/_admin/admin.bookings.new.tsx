import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import { callApi, getLastApiResponse, type AvailabilityResult, type Customer, type Tier } from "@/lib/api";
import { PageHeader, Card, Btn, Field, inputCls, Badge, ErrorBanner } from "@/components/ui-kit";
import { toast } from "sonner";

export const Route = createFileRoute("/_admin/admin/bookings/new")({
  validateSearch: (s: Record<string, unknown>) => ({
    date: (s.date as string) || "",
    start_time: (s.start_time as string) || "",
    duration_minutes: s.duration_minutes ? Number(s.duration_minutes) : 0,
    tier_id: (s.tier_id as string) || "",
    pcs_required: s.pcs_required ? Number(s.pcs_required) : 0,
  }),
  component: NewBookingPage,
});

const STATUSES = ["Pending", "Confirmed", "Cancelled", "Completed"] as const;

function NewBookingPage() {
  const nav = useNavigate();
  const search = Route.useSearch();
  const tiers = useQuery({
    queryKey: ["tiers"],
    queryFn: () => callApi<{ success: true; data: Tier[] }>("getTiers"),
    initialData: () => getLastApiResponse<{ success: true; data: Tier[] }>("getTiers"),
  });
  const customers = useQuery({
    queryKey: ["customers"],
    queryFn: () => callApi<{ success: true; data: Customer[] }>("getCustomers"),
    initialData: () => getLastApiResponse<{ success: true; data: Customer[] }>("getCustomers"),
    staleTime: 120_000,
  });
  const today = new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState({
    customer_name: "",
    phone_number: "",
    tier_id: search.tier_id || "",
    booking_date: search.date || today,
    start_time: search.start_time || "18:00",
    duration_minutes: search.duration_minutes || 60,
    pcs_required: search.pcs_required || 1,
    notes: "",
    status: "Pending" as (typeof STATUSES)[number],
  });

  useEffect(() => {
    if (!form.tier_id && tiers.data?.data[0]) {
      setForm((f) => ({ ...f, tier_id: tiers.data!.data[0].tier_id }));
    }
  }, [tiers.data, form.tier_id]);

  const [avail, setAvail] = useState<AvailabilityResult | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");

  const check = useMutation({
    mutationFn: () =>
      callApi<AvailabilityResult>("checkAvailability", {
        date: form.booking_date,
        start_time: form.start_time,
        duration_minutes: form.duration_minutes,
        tier_id: form.tier_id,
        pcs_required: form.pcs_required,
      }),
    onSuccess: setAvail,
  });

  const create = useMutation({
    mutationFn: () => callApi<{ success: true; data: { booking_id: string } }>("addBooking", form),
    onSuccess: (r) => {
      toast.success(`Booking ${r.data.booking_id} created`);
      nav({ to: "/admin/bookings" });
    },
  });

  const tier = useMemo(() => tiers.data?.data.find((t) => t.tier_id === form.tier_id), [tiers.data, form.tier_id]);
  const totalPrice = tier ? (tier.price_per_hour * form.duration_minutes / 60) * form.pcs_required : 0;
  const customerMatches = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return [];
    return (customers.data?.data ?? [])
      .filter((c) =>
        String(c.customer_name || "").toLowerCase().includes(q) ||
        String(c.phone_number || "").toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [customers.data, customerSearch]);

  function pickCustomer(c: Customer) {
    setForm((f) => ({ ...f, customer_name: c.customer_name || "", phone_number: c.phone_number || "" }));
    setCustomerSearch(`${c.customer_name || ""} ${c.phone_number || ""}`.trim());
    toast.success("Customer added to booking form");
  }

  return (
    <div>
      <PageHeader title="Add Booking" subtitle="Create a new PC reservation." />
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <div className="mb-4 rounded-lg border border-border/70 bg-background/40 p-3">
            <Field label="Search existing customer" hint="Type name or phone number, then click a saved customer to fill the form.">
              <input
                className={inputCls}
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="Search name or phone"
              />
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
                    <div className="font-medium">{c.customer_name || "Unnamed customer"}</div>
                    <div className="text-xs text-muted-foreground">{c.phone_number || "No phone"}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <Field label="Customer Name"><input className={inputCls} value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} /></Field>
            <Field label="Phone Number"><input className={inputCls} value={form.phone_number} onChange={(e) => setForm({ ...form, phone_number: e.target.value })} /></Field>
            <Field label="Tier">
              <select className={inputCls} value={form.tier_id} onChange={(e) => setForm({ ...form, tier_id: e.target.value })}>
                {tiers.data?.data.map((t) => <option key={t.tier_id} value={t.tier_id}>{t.tier_name} ({t.price_per_hour}/hr)</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as any })}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Date"><input type="date" className={inputCls} value={form.booking_date} onChange={(e) => setForm({ ...form, booking_date: e.target.value })} /></Field>
            <Field label="Start Time"><input type="time" className={inputCls} value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></Field>
            <Field label="Duration (minutes)"><input type="number" min={30} step={30} className={inputCls} value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: +e.target.value })} /></Field>
            <Field label="# PCs required"><input type="number" min={1} className={inputCls} value={form.pcs_required} onChange={(e) => setForm({ ...form, pcs_required: +e.target.value })} /></Field>
            <Field label="Notes"><textarea className={inputCls + " min-h-[80px]"} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          </div>
          <ErrorBanner error={check.error || create.error} />
          <div className="mt-4 flex gap-2 flex-wrap">
            <Btn variant="outline" onClick={() => check.mutate()} disabled={check.isPending || !form.tier_id}>
              {check.isPending ? "Checking…" : "Check availability"}
            </Btn>
            <Btn
              onClick={() => create.mutate()}
              disabled={create.isPending || !form.customer_name || !form.phone_number || !form.tier_id || !(avail?.can_book)}
            >
              {create.isPending ? "Saving…" : "Save booking"}
            </Btn>
          </div>
        </Card>

        <Card>
          <h3 className="font-semibold mb-3">Summary</h3>
          <dl className="text-sm space-y-2">
            <Row label="Tier" value={tier?.tier_name ?? "—"} />
            <Row label="Price/hr" value={tier ? tier.price_per_hour : "—"} />
            <Row label="Duration" value={`${form.duration_minutes} min`} />
            <Row label="# PCs" value={form.pcs_required} />
            <div className="pt-2 border-t border-border flex justify-between">
              <span className="text-muted-foreground">Total</span>
              <span className="neon-text font-bold text-lg">{totalPrice.toLocaleString()}</span>
            </div>
          </dl>

          {avail && (
            <div className="mt-4 pt-4 border-t border-border">
              <div className="flex items-center gap-2 mb-2">
                <Badge tone={avail.can_book ? "success" : "danger"}>
                  {avail.can_book ? `${avail.available_count} available` : "Not enough"}
                </Badge>
              </div>
              {avail.available_pcs.length > 0 && (
                <div className="text-xs text-muted-foreground">Will assign: {avail.available_pcs.slice(0, form.pcs_required).join(", ")}</div>
              )}
              {avail.message && <div className="text-xs text-amber-300 mt-1">{avail.message}</div>}
              {avail.suggestions && avail.suggestions.length > 0 && (
                <div className="mt-3 space-y-1">
                  <div className="text-xs uppercase text-muted-foreground">Try instead</div>
                  {avail.suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => setForm({ ...form, start_time: s.start_time })}
                      className="w-full text-left text-xs rounded-md border border-border px-2 py-1.5 hover:bg-accent/10"
                    >
                      {s.start_time}–{s.end_time} · {s.available_count} PCs
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
