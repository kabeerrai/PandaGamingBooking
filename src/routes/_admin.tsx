import { createFileRoute, Link, Outlet, redirect, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { getSessionAccess, isUnlocked, lockSite, type UserRole } from "@/lib/gate.functions";
import {
  LayoutDashboard, CalendarPlus, CalendarSearch, ListChecks,
  MonitorSmartphone, Layers, Settings as SettingsIcon, LogOut, Gamepad2,
  WalletCards, ReceiptText, BarChart3,
} from "lucide-react";

export const Route = createFileRoute("/_admin")({
  beforeLoad: async () => {
    const { unlocked } = await isUnlocked();
    if (!unlocked) throw redirect({ to: "/unlock" });
  },
  head: () => ({
    meta: [
      { title: "Admin — Panda Gaming Zone" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminLayout,
});

type NavItem = { to: string; label: string; icon: any; exact?: boolean; adminOnly?: boolean };
const NAV: NavItem[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/bookings/new", label: "Add Booking", icon: CalendarPlus },
  { to: "/admin/availability", label: "Availability", icon: CalendarSearch },
  { to: "/admin/bookings", label: "All Bookings", icon: ListChecks, exact: true },
  { to: "/admin/member-topup", label: "Member Topup", icon: WalletCards },
  { to: "/admin/expenses", label: "Expenses", icon: ReceiptText },
  { to: "/admin/revenue", label: "Revenue", icon: BarChart3, adminOnly: true },
  { to: "/admin/pcs", label: "Manage PCs", icon: MonitorSmartphone },
  { to: "/admin/tiers", label: "Manage Tiers", icon: Layers, adminOnly: true },
  { to: "/admin/settings", label: "Settings", icon: SettingsIcon, adminOnly: true },
];

function AdminLayout() {
  const router = useRouter();
  const lock = useServerFn(lockSite);
  const getAccess = useServerFn(getSessionAccess);
  const [role, setRole] = useState<UserRole | null>(null);

  useEffect(() => {
    getAccess().then((r) => setRole(r.role as UserRole | null)).catch(() => setRole(null));
  }, [getAccess]);

  async function handleLock() {
    await lock();
    router.navigate({ to: "/unlock" });
  }

  const visibleNav = NAV.filter((item) => !item.adminOnly || role === "admin");

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <aside className="md:w-64 md:min-h-screen bg-sidebar border-b md:border-b-0 md:border-r border-sidebar-border flex md:flex-col">
        <div className="p-5 flex items-center gap-2 border-r md:border-r-0 md:border-b border-sidebar-border">
          <div className="rounded-md p-1.5 bg-primary/15 text-primary">
            <Gamepad2 className="size-5" />
          </div>
          <div className="hidden sm:block">
            <div className="text-sm font-bold neon-text leading-tight">Panda</div>
            <div className="text-xs text-muted-foreground leading-tight">Gaming Zone</div>
            {role && <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{role}</div>}
          </div>
        </div>
        <nav className="flex md:flex-col gap-1 p-2 md:p-3 overflow-x-auto md:overflow-visible flex-1">
          {visibleNav.map((item) => (
            <Link
              key={item.to}
              to={item.to as any}
              activeOptions={{ exact: item.exact ?? false }}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:-translate-y-0.5 active:scale-[0.98] transition whitespace-nowrap data-[status=active]:bg-primary/15 data-[status=active]:text-primary data-[status=active]:shadow-glow-sm"
            >
              <item.icon className="size-4" />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <button
          onClick={handleLock}
          className="hidden md:flex items-center gap-2 px-4 py-3 m-3 rounded-md text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:-translate-y-0.5 active:scale-[0.98] transition border border-sidebar-border cursor-pointer"
        >
          <LogOut className="size-4" /> Lock
        </button>
      </aside>
      <main className="flex-1 p-4 md:p-8 max-w-full">
        <Outlet />
      </main>
    </div>
  );
}
