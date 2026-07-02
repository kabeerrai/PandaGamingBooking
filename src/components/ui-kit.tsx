import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("glow-card p-5", className)}>{children}</div>;
}

export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold neon-text">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "rounded-md bg-input border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring w-full transition hover:border-primary/50 focus:border-primary/70";

export function Btn({
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "outline" }) {
  const variants: Record<string, string> = {
    primary: "bg-primary text-primary-foreground shadow-glow-sm hover:opacity-90 hover:-translate-y-0.5",
    ghost: "hover:bg-accent/20 hover:-translate-y-0.5",
    danger: "bg-destructive text-destructive-foreground hover:opacity-90 hover:-translate-y-0.5",
    outline: "border border-border hover:bg-accent/10 hover:border-primary/40 hover:-translate-y-0.5",
  };
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer",
        variants[variant],
        className,
      )}
    />
  );
}

export function Badge({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "success" | "warn" | "danger" | "info" }) {
  const tones: Record<string, string> = {
    default: "bg-muted text-muted-foreground",
    success: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
    warn: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
    danger: "bg-red-500/15 text-red-300 border border-red-500/30",
    info: "bg-primary/15 text-primary border border-primary/30",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", tones[tone])}>
      {children}
    </span>
  );
}

export function statusTone(status: string) {
  switch (status) {
    case "Confirmed":
    case "Active":
      return "success" as const;
    case "Pending":
    case "Maintenance":
      return "warn" as const;
    case "Cancelled":
    case "Deleted":
    case "Inactive":
      return "danger" as const;
    case "Completed":
      return "info" as const;
    default:
      return "default" as const;
  }
}

export function ErrorBanner({ error }: { error: unknown }) {
  if (!error) return null;
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/10 text-destructive-foreground px-3 py-2 text-sm mt-3">
      {msg}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="text-center text-sm text-muted-foreground py-10">{children}</div>;
}
