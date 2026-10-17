"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { UserButton, useAuth } from "@clerk/nextjs";
import { setupAxiosInterceptors } from "@/transport/apiClient";
import { adminService, AdminMeDto } from "@/services/admin.service";
import {
  IconDashboard,
  IconHospital,
  IconAddressBook,
  IconNotebook,
  IconKey,
  IconUsers,
  IconLock,
  IconSun,
  IconMoon,
  IconMenu2,
  IconAdjustments,
  IconCreditCard
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { ClinicEzMark } from "@/components/ClinicEzLogo";

interface AdminContextType {
  admin: AdminMeDto | null;
  hasPermission: (permission: string) => boolean;
  refreshAdmin: () => Promise<void>;
}

const AdminContext = createContext<AdminContextType>({
  admin: null,
  hasPermission: () => false,
  refreshAdmin: async () => {},
});

export const useAdmin = () => useContext(AdminContext);

export default function AdminLayoutClient({ children }: { children: React.ReactNode }) {
  const { getToken, isLoaded, userId } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [admin, setAdmin] = useState<AdminMeDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Setup theme
  useEffect(() => {
    const savedTheme = localStorage.getItem("admin-theme") as "light" | "dark" | null;
    const initialTheme = savedTheme || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(initialTheme);
    if (initialTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    localStorage.setItem("admin-theme", nextTheme);
    if (nextTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  const fetchAdminProfile = useCallback(async () => {
    try {
      setupAxiosInterceptors(getToken);
      const profile = await adminService.getMe();
      setAdmin(profile);
    } catch (err: any) {
      console.error("Failed to load admin profile", err);
      setError(err.message || "You are not authorized to access the admin portal.");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  // Auth and Admin profile resolution
  useEffect(() => {
    if (!isLoaded) return;

    if (!userId) {
      router.push("/sign-in");
      return;
    }

    fetchAdminProfile();
  }, [isLoaded, userId, router, fetchAdminProfile]);

  const hasPermission = (permission: string) => {
    if (!admin) return false;
    return admin.permissions?.includes(permission) ?? false;
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-slate-900 via-indigo-950 to-slate-950 text-slate-100 relative overflow-hidden">
        <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary/20 rounded-full blur-3xl opacity-30 animate-pulse pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-96 h-96 bg-violet-500/20 rounded-full blur-3xl opacity-30 animate-pulse pointer-events-none" />

        <div className="flex flex-col items-center gap-6 relative z-10">
          <div className="relative flex items-center justify-center">
            <div className="h-16 w-16 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
            <div className="absolute h-10 w-10 animate-ping rounded-full bg-primary/20" />
          </div>
          <div className="space-y-1 text-center">
            <h3 className="text-lg font-bold tracking-tight text-white">Verifying Credentials</h3>
            <p className="text-xs font-semibold text-slate-400 animate-pulse uppercase tracking-wider">
              Authenticating Administrative Access...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !admin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-linear-to-br from-slate-900 via-indigo-950 to-slate-950 text-slate-100 p-6 text-center overflow-hidden relative">
        <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary/20 rounded-full blur-3xl opacity-30 animate-pulse pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-96 h-96 bg-violet-500/20 rounded-full blur-3xl opacity-30 animate-pulse pointer-events-none" />

        <div className="max-w-md w-full backdrop-blur-xl bg-white/5 border border-white/10 p-8 rounded-[32px] shadow-2xl space-y-6 relative z-10 transition-all duration-300 hover:scale-[1.01]">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-tr from-red-500/20 to-rose-500/30 text-red-400 border border-red-500/30 shadow-[0_0_20px_rgba(239,68,68,0.15)] mb-4">
            <IconLock className="h-10 w-10 animate-pulse" />
          </div>
          <div className="space-y-2">
            <h2 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">Access Denied</h2>
            <p className="text-sm text-slate-400 leading-relaxed max-w-sm mx-auto">
              {error || "Your account does not possess the administrative privileges required to access this portal."}
            </p>
          </div>
          <div className="flex flex-col gap-3 pt-2">
            <Button asChild className="w-full bg-gradient-to-r from-primary to-violet-600 hover:from-primary/95 hover:to-violet-600/95 text-white rounded-xl py-6 font-bold shadow-lg hover:shadow-primary/10 transition-all">
              <Link href="/">Return to Home</Link>
            </Button>
            <div className="flex items-center justify-center gap-2 pt-3 border-t border-white/5 mt-4">
              <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Signed in as:</span>
              <div className="p-1 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                <UserButton afterSignOutUrl="/" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Navigation configurations filtered by permissions
  const navItems = [
    {
      title: "Overview",
      href: "/admin",
      icon: IconDashboard,
      permission: "view:analytics"
    },
    {
      title: "Tenants",
      href: "/admin/tenants",
      icon: IconHospital,
      permission: "view:tenants"
    },
    {
      title: "Plans",
      href: "/admin/plans",
      icon: IconCreditCard,
      permission: "manage:plans"
    },
    {
      title: "Leads",
      href: "/admin/leads",
      icon: IconAddressBook,
      permission: "view:tenants"
    },
    {
      title: "Blog CRM",
      href: "/admin/blog",
      icon: IconNotebook,
      permission: "manage:blogs"
    },
    {
      title: "Roles & Access",
      href: "/admin/roles",
      icon: IconKey,
      permission: "manage:roles"
    },
    {
      title: "Admin Users",
      href: "/admin/users",
      icon: IconUsers,
      permission: "manage:admins"
    },
    {
      title: "Platform Settings",
      href: "/admin/settings",
      icon: IconAdjustments,
      permission: "manage:settings"
    }
  ].filter(item =>
    hasPermission(item.permission) ||
    (item.permission === "manage:plans" && (hasPermission("manage:tenants") || hasPermission("view:tenants"))) ||
    (item.permission === "manage:settings" && hasPermission("manage:tenants"))
  );

  const SidebarContent = () => (
    <>
      {/* Header */}
      <div className="h-16 flex items-center px-6 border-b border-slate-100 dark:border-slate-800 gap-3">
        <ClinicEzMark variant="squircle" className="h-9 w-9 shrink-0 shadow-sm" />
        <div>
          <span className="block font-black text-sm tracking-wide bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
            CLINIC EZ
          </span>
          <span className="block text-[10px] font-bold text-violet-500 uppercase tracking-widest leading-none">
            Admin Panel
          </span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all duration-200 group ${isActive
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/10"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white"
                }`}
            >
              <item.icon className={`h-5 w-5 ${isActive ? "scale-110" : "opacity-75 group-hover:scale-105 transition-transform"}`} />
              {item.title}
            </Link>
          );
        })}
      </nav>

      {/* Sidebar Footer */}
      <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 truncate">
          <UserButton afterSignOutUrl="/" />
          <div className="truncate">
            <span className="block text-xs font-bold truncate leading-tight">
              {admin.fullName}
            </span>
            <span className="block text-[10px] text-muted-foreground truncate leading-none">
              {admin.roleName}
            </span>
          </div>
        </div>
        <button
          onClick={toggleTheme}
          className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
        >
          {theme === "light" ? <IconMoon className="h-4.5 w-4.5" /> : <IconSun className="h-4.5 w-4.5" />}
        </button>
      </div>
    </>
  );

  return (
    <AdminContext.Provider value={{ admin, hasPermission, refreshAdmin: fetchAdminProfile }}>
      <div className="flex h-screen w-screen overflow-hidden bg-slate-50 dark:bg-slate-950 text-foreground transition-colors duration-300">

        {/* Mobile Sidebar Overlay Backdrop */}
        {isMobileMenuOpen && (
          <div
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-40 md:hidden animate-in fade-in duration-200"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}

        {/* Mobile Sidebar Panel */}
        <aside className={`fixed inset-y-0 left-0 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col z-50 transition-transform duration-300 ease-in-out md:hidden ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}>
          <SidebarContent />
        </aside>

        {/* Desktop Sidebar Panel */}
        <aside className="w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hidden md:flex md:flex-col shrink-0 shadow-sm">
          <SidebarContent />
        </aside>

        {/* Content Area */}
        <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          {/* Header */}
          <header className="h-16 shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md flex items-center justify-between px-4 sm:px-8 sticky top-0 z-20 shadow-xs">
            <div className="flex items-center">
              <button
                onClick={() => setIsMobileMenuOpen(true)}
                className="p-2 mr-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 md:hidden transition-colors"
              >
                <IconMenu2 className="h-5 w-5" />
              </button>
              <h1 className="text-base sm:text-lg font-bold tracking-tight capitalize">
                {pathname.split("/").pop() || "Overview"}
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-bold">
                PROD Central Server
              </span>
            </div>
          </header>

          {/* Child views */}
          <div className="p-4 sm:p-8 max-w-7xl mx-auto w-full">
            {children}
          </div>
        </main>
      </div>
    </AdminContext.Provider>
  );
}
