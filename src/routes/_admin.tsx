import { createFileRoute, Link, Outlet, redirect, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { getSessionAccess, isUnlocked, lockSite, type UserRole } from "@/lib/gate.functions";
import { getAppsScriptUrl } from "@/lib/api";
import { setPublicSessionMeta, type PublicSessionMeta } from "@/lib/session-meta";
import {
  LayoutDashboard, CalendarPlus, CalendarSearch, ListChecks,
  MonitorSmartphone, Layers, Settings as SettingsIcon, LogOut, Gamepad2,
  WalletCards, ReceiptText, BarChart3, Menu, X, Moon, Sun, Users, Clock3,
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
  { to: "/admin/shifts", label: "Cashier Shifts", icon: Clock3, adminOnly: true },
  { to: "/admin/cashiers", label: "Cashiers", icon: Users, adminOnly: true },
  { to: "/admin/pcs", label: "Manage PCs", icon: MonitorSmartphone },
  { to: "/admin/tiers", label: "Manage Tiers", icon: Layers },
  { to: "/admin/settings", label: "Settings", icon: SettingsIcon },
];

const THEME_KEY = "panda:theme";

function getInitialDarkMode() {
  if (typeof window === "undefined") return false;
  const stored = window.localStorage.getItem(THEME_KEY);
  if (stored === "dark") return true;
  if (stored === "light") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function AdminLayout() {
  const router = useRouter();
  const lock = useServerFn(lockSite);
  const getAccess = useServerFn(getSessionAccess);
  const [access, setAccess] = useState<PublicSessionMeta | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const initial = getInitialDarkMode();
    setDarkMode(initial);
    document.documentElement.classList.toggle("dark", initial);
  }, []);

  useEffect(() => {
    getAccess()
      .then((r) => {
        const meta = r as PublicSessionMeta;
        setAccess(meta);
        setPublicSessionMeta(meta);
      })
      .catch(() => {
        setAccess(null);
        setPublicSessionMeta(null);
      });
  }, [getAccess]);

  async function handleLock() {
    await lock({ data: { appsScriptUrl: getAppsScriptUrl() } });
    setPublicSessionMeta(null);
    router.navigate({ to: "/unlock" });
  }

  function toggleTheme() {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.classList.toggle("dark", next);
    window.localStorage.setItem(THEME_KEY, next ? "dark" : "light");
  }

  const role = access?.role as UserRole | null | undefined;
  const visibleNav = NAV.filter((item) => !item.adminOnly || role === "admin");
  const displayName = access?.role === "admin" ? "Admin" : access?.cashier_name || access?.username || "Cashier";
  const roleLabel = access?.role ? access.role : "user";

  const Brand = ({ showClose = false }: { showClose?: boolean }) => (
    <div className="p-5 flex items-center gap-2 border-b border-sidebar-border">
      <div className="rounded-md p-1.5 bg-primary/15 text-primary">
        <Gamepad2 className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold neon-text leading-tight">Panda</div>
        <div className="text-xs text-muted-foreground leading-tight">Gaming Zone</div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1 truncate">
          {displayName} · {roleLabel}
        </div>
        {access?.shift_id && <div className="text-[10px] text-muted-foreground truncate">Shift: {access.shift_id}</div>}
      </div>
      {showClose && (
        <button onClick={() => setDrawerOpen(false)} className="rounded-md p-2 hover:bg-sidebar-accent transition">
          <X className="size-5" />
        </button>
      )}
    </div>
  );

  const NavLinks = () => (
    <nav className="flex flex-col gap-1 p-3 overflow-y-auto flex-1">
      {visibleNav.map((item) => (
        <Link
          key={item.to}
          to={item.to as any}
          activeOptions={{ exact: item.exact ?? false }}
          onClick={() => setDrawerOpen(false)}
          className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:-translate-y-0.5 active:scale-[0.98] transition whitespace-nowrap data-[status=active]:bg-primary/15 data-[status=active]:text-primary data-[status=active]:shadow-glow-sm"
        >
          <item.icon className="size-4" />
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );

  const DrawerActions = () => (
    <div className="p-3 border-t border-sidebar-border space-y-2">
      <button
        onClick={toggleTheme}
        className="w-full flex items-center gap-2 px-4 py-3 rounded-md text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:-translate-y-0.5 active:scale-[0.98] transition border border-sidebar-border cursor-pointer"
      >
        {darkMode ? <Sun className="size-4" /> : <Moon className="size-4" />}
        {darkMode ? "Light theme" : "Dark theme"}
      </button>
      <button
        onClick={handleLock}
        className="w-full flex items-center gap-2 px-4 py-3 rounded-md text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:-translate-y-0.5 active:scale-[0.98] transition border border-sidebar-border cursor-pointer"
      >
        <LogOut className="size-4" /> Logout / Clock out
      </button>
    </div>
  );

  return (
    <div className="min-h-screen md:flex bg-background text-foreground">
      <header className="sticky top-0 z-40 md:hidden border-b border-border bg-background/95 backdrop-blur px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => setDrawerOpen(true)}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent/20 active:scale-[0.98] transition"
        >
          <Menu className="size-4" /> Menu
        </button>
        <div className="text-right min-w-0">
          <div className="text-sm font-semibold truncate">{displayName}</div>
          <div className="text-[10px] uppercase text-muted-foreground">{roleLabel}</div>
        </div>
      </header>

      <aside className="hidden md:flex md:w-64 md:min-h-screen bg-sidebar border-r border-sidebar-border flex-col sticky top-0 h-screen">
        <Brand />
        <NavLinks />
        <DrawerActions />
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button className="absolute inset-0 bg-black/60" onClick={() => setDrawerOpen(false)} aria-label="Close menu" />
          <aside className="absolute left-0 top-0 bottom-0 w-[82vw] max-w-xs bg-sidebar border-r border-sidebar-border shadow-2xl flex flex-col">
            <Brand showClose />
            <NavLinks />
            <DrawerActions />
          </aside>
        </div>
      )}

      <main className="flex-1 p-4 md:p-8 max-w-full">
        <Outlet />
      </main>
    </div>
  );
}
