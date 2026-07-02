import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { callApi, getLastApiResponse, type Expense } from "@/lib/api";
import { PageHeader, Card, Btn, Field, inputCls, ErrorBanner, EmptyState } from "@/components/ui-kit";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_admin/admin/expenses")({
  component: ExpensesPage,
});

const CATEGORIES = ["Miscellaneous", "Fixed", "Repairs"] as const;
const PAYMENT_METHODS = ["Cash", "JazzCash", "Easypaisa", "Bank"] as const;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function ExpensesPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ expense_date: today(), category: "Miscellaneous", amount: 0, payment_method: "Cash", notes: "" });
  const [filters, setFilters] = useState({ month: today().slice(0, 7), category: "" });

  const expenses = useQuery({
    queryKey: ["expenses"],
    queryFn: () => callApi<{ success: true; data: Expense[] }>("getExpenses"),
    initialData: () => getLastApiResponse<{ success: true; data: Expense[] }>("getExpenses"),
    staleTime: 30_000,
  });

  const add = useMutation({
    mutationFn: () => callApi("addExpense", form),
    onSuccess: () => {
      toast.success("Expense saved");
      setForm({ expense_date: today(), category: "Miscellaneous", amount: 0, payment_method: "Cash", notes: "" });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["dashboardData"] });
    },
  });

  const del = useMutation({
    mutationFn: (expense_id: string) => callApi("deleteExpense", { expense_id }),
    onSuccess: () => {
      toast.success("Expense deleted");
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["dashboardData"] });
    },
  });

  const rows = useMemo(() => {
    return (expenses.data?.data ?? [])
      .filter((e) => !filters.month || String(e.expense_date || "").startsWith(filters.month))
      .filter((e) => !filters.category || e.category === filters.category)
      .sort((a, b) => String(b.expense_date || "").localeCompare(String(a.expense_date || "")));
  }, [expenses.data, filters]);

  const total = rows.reduce((sum, e) => sum + Number(e.amount || 0), 0);

  return (
    <div>
      <PageHeader title="Expenses" subtitle="Track fixed, repair, and miscellaneous expenses." />

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Card className="lg:col-span-2">
          <h2 className="font-semibold mb-3">Add Expense</h2>
          <div className="grid md:grid-cols-2 gap-3">
            <Field label="Date"><input type="date" className={inputCls} value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} /></Field>
            <Field label="Category">
              <select className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Amount"><input type="number" min={0} className={inputCls} value={form.amount} onChange={(e) => setForm({ ...form, amount: +e.target.value })} /></Field>
            <Field label="Payment method">
              <select className={inputCls} value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Notes"><input className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional details" /></Field>
          </div>
          <ErrorBanner error={add.error} />
          <div className="mt-4"><Btn onClick={() => add.mutate()} disabled={add.isPending || !form.amount}>{add.isPending ? "Saving…" : "Save expense"}</Btn></div>
        </Card>

        <Card>
          <div className="text-xs uppercase text-muted-foreground">Filtered expenses</div>
          <div className="text-3xl font-bold neon-text mt-1">Rs {total.toLocaleString()}</div>
          <p className="text-sm text-muted-foreground mt-2">Cash expenses reduce expected cash in shift reports.</p>
        </Card>
      </div>

      <Card className="mb-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Month"><input type="month" className={inputCls} value={filters.month} onChange={(e) => setFilters({ ...filters, month: e.target.value })} /></Field>
          <Field label="Category">
            <select className={inputCls} value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}>
              <option value="">All</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        </div>
      </Card>

      <ErrorBanner error={expenses.error} />
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-border">
                <th className="p-3">Date</th>
                <th className="p-3">Category</th>
                <th className="p-3">Notes</th>
                <th className="p-3">Method</th>
                <th className="p-3">Amount</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.expense_id} className="border-b border-border/50 hover:bg-accent/10 transition-colors">
                  <td className="p-3">{e.expense_date}</td>
                  <td className="p-3 font-medium">{e.category}</td>
                  <td className="p-3 text-muted-foreground">{e.notes || "—"}</td>
                  <td className="p-3">{e.payment_method || "Cash"}</td>
                  <td className="p-3 neon-text font-semibold">Rs {Number(e.amount || 0).toLocaleString()}</td>
                  <td className="p-3 text-right"><Btn variant="ghost" onClick={() => { if (confirm("Delete this expense?")) del.mutate(e.expense_id); }}><Trash2 className="size-3" /></Btn></td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <EmptyState>No expenses match these filters.</EmptyState>}
        </div>
      </Card>
    </div>
  );
}
