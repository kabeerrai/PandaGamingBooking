import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { callApi, getLastApiResponse, type Booking, type Tier, type PC } from "@/lib/api";
import { PageHeader, Card, Btn, Field, inputCls, Badge, ErrorBanner, EmptyState, statusTone } from "@/components/ui-kit";
import { X, Trash2, Pencil, CheckCheck, Ban } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_admin/admin/bookings/")({
  component: BookingsPage,
});

const STATUSES = ["All", "Pending", "Confirmed", "Cancelled", "Completed"] as const;
const ONLINE_METHODS = ["", "JazzCash", "Easypaisa", "Bank"] as const;

function BookingsPage() {
  const qc = useQueryClient();
  const pageData = useQuery({
    queryKey: ["bookingsPageData"],
    queryFn: () => callApi<{ success: true; data: { bookings: Booking[]; tiers: Tier[]; pcs: PC[] } }>("getBookingsPageData"),
    initialData: () => getLastApiResponse<{ success: true; data: { bookings: Booking[]; tiers: Tier[]; pcs: PC[] } }>("getBookingsPageData"),
    staleTime: 30_000,
  });

  const bookings = pageData.data?.data.bookings ?? [];
  const tiers = pageData.data?.data.tiers ?? [];
  const pcs = pageData.data?.data.pcs ?? [];

  const [filters, setFilters] = useState({ date: "", status: "All", tier: "", pc: "", search: "" });
  const [editing, setEditing] = useState<Booking | null>(null);
  const [completing, setCompleting] = useState<Booking | null>(null);

  const tierName = (id: string) => tiers.find((t) => t.tier_id === id)?.tier_name ?? id;

  const filtered = useMemo(() => {
    return bookings.filter((b) => {
      if (b.status === "Deleted") return false;
      if (filters.date && b.booking_date !== filters.date) return false;
      if (filters.status !== "All" && b.status !== filters.status) return false;
      if (filters.tier && b.tier_id !== filters.tier) return false;
      if (filters.pc && !String(b.assigned_pc_ids || "").split(",").map((s) => s.trim()).includes(filters.pc)) return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        if (!String(b.customer_name || "").toLowerCase().includes(q) && !String(b.phone_number || "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [bookings, filters]);

  const cancel = useMutation({
    mutationFn: (id: string) => callApi("cancelBooking", { booking_id: id }),
    onSuccess: () => { toast.success("Booking cancelled"); qc.invalidateQueries({ queryKey: ["bookingsPageData"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
  const del = useMutation({
    mutationFn: (id: string) => callApi("deleteBooking", { booking_id: id }),
    onSuccess: () => { toast.success("Booking deleted"); qc.invalidateQueries({ queryKey: ["bookingsPageData"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
  const complete = useMutation({
    mutationFn: (payload: any) => callApi<{ success: true; data: { amount_due: number; total_collected: number; payment_status: string } }>("completeBooking", payload),
    onSuccess: (r) => {
      toast.success(`Completed · ${r.data.payment_status} · Collected ${Number(r.data.total_collected).toLocaleString()}`);
      setCompleting(null);
      qc.invalidateQueries({ queryKey: ["bookingsPageData"] });
      qc.invalidateQueries({ queryKey: ["dashboardData"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  return (
    <div>
      <PageHeader title="All Bookings" subtitle="Filter, edit, cancel or complete reservations." />
      <Card className="mb-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Field label="Date"><input type="date" className={inputCls} value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} /></Field>
          <Field label="Status">
            <select className={inputCls} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Tier">
            <select className={inputCls} value={filters.tier} onChange={(e) => setFilters({ ...filters, tier: e.target.value })}>
              <option value="">All</option>
              {tiers.map((t) => <option key={t.tier_id} value={t.tier_id}>{t.tier_name}</option>)}
            </select>
          </Field>
          <Field label="PC">
            <select className={inputCls} value={filters.pc} onChange={(e) => setFilters({ ...filters, pc: e.target.value })}>
              <option value="">All</option>
              {pcs.map((p) => <option key={p.pc_id} value={p.pc_id}>{p.pc_name}</option>)}
            </select>
          </Field>
          <Field label="Search"><input className={inputCls} value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="Name or phone" /></Field>
        </div>
      </Card>

      <ErrorBanner error={pageData.error} />

      {editing && (
        <EditBookingForm
          booking={editing}
          tiers={tiers}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["bookingsPageData"] }); }}
        />
      )}

      {completing && (
        <CompletePaymentModal
          booking={completing}
          onClose={() => setCompleting(null)}
          onSubmit={(payload) => complete.mutate(payload)}
          isSaving={complete.isPending}
        />
      )}

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-border">
                <th className="p-3">Customer</th>
                <th className="p-3">Phone</th>
                <th className="p-3">Tier</th>
                <th className="p-3">Date</th>
                <th className="p-3">Time</th>
                <th className="p-3">Dur</th>
                <th className="p-3">PCs</th>
                <th className="p-3">Status</th>
                <th className="p-3">Total</th>
                <th className="p-3">Paid</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => (
                <tr key={b.booking_id} className="border-b border-border/50 hover:bg-accent/10 transition-colors align-top">
                  <td className="p-3 font-medium">{b.customer_name}{b.notes && <div className="text-xs text-muted-foreground">{b.notes}</div>}</td>
                  <td className="p-3">{b.phone_number}</td>
                  <td className="p-3">{tierName(b.tier_id)}</td>
                  <td className="p-3">{b.booking_date}</td>
                  <td className="p-3 whitespace-nowrap">{b.start_time}–{b.end_time}</td>
                  <td className="p-3">{b.duration_minutes}m</td>
                  <td className="p-3 text-xs">{b.assigned_pc_ids}</td>
                  <td className="p-3"><Badge tone={statusTone(b.status)}>{b.status}</Badge></td>
                  <td className="p-3 neon-text font-semibold">{Number(b.total_price || 0).toLocaleString()}</td>
                  <td className="p-3">
                    {b.status === "Completed" ? (
                      <div className="text-xs">
                        <div className="font-semibold">{Number(b.total_collected || 0).toLocaleString()}</div>
                        <div className="text-muted-foreground">{b.payment_status || "—"}</div>
                      </div>
                    ) : "—"}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Btn variant="ghost" title="Edit" onClick={() => setEditing(b)}><Pencil className="size-3" /></Btn>
                      {b.status !== "Completed" && (
                        <Btn variant="ghost" title="Mark completed" onClick={() => setCompleting(b)}><CheckCheck className="size-3" /></Btn>
                      )}
                      {b.status !== "Cancelled" && b.status !== "Completed" && (
                        <Btn variant="ghost" title="Cancel" onClick={() => { if (confirm("Cancel this booking?")) cancel.mutate(b.booking_id); }}><Ban className="size-3" /></Btn>
                      )}
                      <Btn variant="ghost" title="Delete" onClick={() => { if (confirm("Delete this booking permanently from the Bookings sheet? Revenue remains saved in Payments.")) del.mutate(b.booking_id); }}><Trash2 className="size-3" /></Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <EmptyState>No bookings match filters.</EmptyState>}
        </div>
      </Card>
    </div>
  );
}

function CompletePaymentModal({ booking, onClose, onSubmit, isSaving }: { booking: Booking; onClose: () => void; onSubmit: (payload: any) => void; isSaving: boolean }) {
  const [bookingType, setBookingType] = useState<"Standard" | "Member">("Standard");
  const [cash, setCash] = useState(0);
  const [onlineMethod, setOnlineMethod] = useState<(typeof ONLINE_METHODS)[number]>("");
  const [online, setOnline] = useState(0);
  const [keepPermanent, setKeepPermanent] = useState(false);

  const gross = Number(booking.total_price || 0);
  const memberDiscountPerHour = 50;
  const hours = Number(booking.duration_minutes || 0) / 60;
  const pcCount = Number(booking.pcs_required || 1);
  const discount = bookingType === "Member" ? memberDiscountPerHour * hours * pcCount : 0;
  const amountDue = Math.max(0, gross - discount);
  const totalCollected = Number(cash || 0) + Number(online || 0);
  const remaining = amountDue - totalCollected;

  function submit() {
    onSubmit({
      booking_id: booking.booking_id,
      booking_type: bookingType,
      discount_amount: discount,
      cash_collected: Number(cash || 0),
      online_method: onlineMethod,
      online_collected: Number(online || 0),
      keep_permanent: keepPermanent,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-semibold">Complete Booking · {booking.booking_id}</h2>
            <p className="text-sm text-muted-foreground">Enter the payment details before marking this booking completed.</p>
          </div>
          <Btn variant="ghost" onClick={onClose}><X className="size-4" /></Btn>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
          <div className="rounded-lg border border-border p-3">
            <div className="text-xs uppercase text-muted-foreground">Gross total</div>
            <div className="text-lg font-bold">Rs {gross.toLocaleString()}</div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="text-xs uppercase text-muted-foreground">Money to collect</div>
            <div className="text-lg font-bold neon-text">Rs {amountDue.toLocaleString()}</div>
          </div>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Member discount: Rs {memberDiscountPerHour}/hour × {hours.toFixed(2)} hours × {pcCount} PC(s) = Rs {discount.toLocaleString()}.
        </p>

        <div className="grid md:grid-cols-2 gap-3">
          <Field label="Booking type" hint="Member booking applies Rs 50 off per hour per PC.">
            <select className={inputCls} value={bookingType} onChange={(e) => setBookingType(e.target.value as "Standard" | "Member")}>
              <option value="Standard">Standard booking</option>
              <option value="Member">Member booking - Rs 50/hr off</option>
            </select>
          </Field>
          <Field label="Discount"><input className={inputCls} value={discount} readOnly /></Field>
          <Field label="Cash collected"><input type="number" min={0} className={inputCls} value={cash} onChange={(e) => setCash(+e.target.value)} /></Field>
          <Field label="Online method">
            <select className={inputCls} value={onlineMethod} onChange={(e) => setOnlineMethod(e.target.value as any)}>
              <option value="">None</option>
              <option value="JazzCash">JazzCash</option>
              <option value="Easypaisa">Easypaisa</option>
              <option value="Bank">Bank</option>
            </select>
          </Field>
          <Field label="Online collected"><input type="number" min={0} className={inputCls} value={online} onChange={(e) => setOnline(+e.target.value)} /></Field>
          <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm cursor-pointer hover:border-primary/40 transition">
            <input type="checkbox" checked={keepPermanent} onChange={(e) => setKeepPermanent(e.target.checked)} />
            Keep booking permanently
          </label>
        </div>

        <div className="mt-4 rounded-lg border border-border p-3 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Total collected</span><span>Rs {totalCollected.toLocaleString()}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Remaining</span><span className={remaining > 0 ? "text-amber-300" : "text-emerald-300"}>Rs {Math.max(0, remaining).toLocaleString()}</span></div>
          {!keepPermanent && <p className="mt-2 text-xs text-muted-foreground">This completed booking will be removed from the Bookings sheet after 24 hours. The payment stays saved in the Payments sheet for revenue reports.</p>}
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Btn variant="outline" onClick={onClose}>Cancel</Btn>
          <Btn onClick={submit} disabled={isSaving}>{isSaving ? "Saving…" : "Save payment & complete"}</Btn>
        </div>
      </div>
    </div>
  );
}

function EditBookingForm({ booking, tiers, onClose, onSaved }: { booking: Booking; tiers: Tier[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    customer_name: booking.customer_name,
    phone_number: booking.phone_number,
    tier_id: booking.tier_id,
    booking_date: booking.booking_date,
    start_time: booking.start_time,
    duration_minutes: booking.duration_minutes,
    pcs_required: booking.pcs_required,
    notes: booking.notes ?? "",
    status: booking.status,
  });
  const [err, setErr] = useState<unknown>(null);
  const save = useMutation({
    mutationFn: () => callApi("updateBooking", { booking_id: booking.booking_id, ...form }),
    onSuccess: () => { toast.success("Booking updated"); onSaved(); },
    onError: setErr,
  });

  return (
    <Card className="mb-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">Edit Booking · {booking.booking_id}</h2>
        <Btn variant="ghost" onClick={onClose}><X className="size-4" /></Btn>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Field label="Customer"><input className={inputCls} value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} /></Field>
        <Field label="Phone"><input className={inputCls} value={form.phone_number} onChange={(e) => setForm({ ...form, phone_number: e.target.value })} /></Field>
        <Field label="Tier">
          <select className={inputCls} value={form.tier_id} onChange={(e) => setForm({ ...form, tier_id: e.target.value })}>
            {tiers.map((t) => <option key={t.tier_id} value={t.tier_id}>{t.tier_name}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as any })}>
            {["Pending", "Confirmed", "Cancelled", "Completed"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Date"><input type="date" className={inputCls} value={form.booking_date} onChange={(e) => setForm({ ...form, booking_date: e.target.value })} /></Field>
        <Field label="Start time"><input type="time" className={inputCls} value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></Field>
        <Field label="Duration (min)"><input type="number" step={30} min={30} className={inputCls} value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: +e.target.value })} /></Field>
        <Field label="# PCs"><input type="number" min={1} className={inputCls} value={form.pcs_required} onChange={(e) => setForm({ ...form, pcs_required: +e.target.value })} /></Field>
        <Field label="Notes"><input className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
      </div>
      <ErrorBanner error={err} />
      <div className="mt-4 flex gap-2">
        <Btn onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save changes"}</Btn>
        <Btn variant="outline" onClick={onClose}>Cancel</Btn>
      </div>
    </Card>
  );
}
