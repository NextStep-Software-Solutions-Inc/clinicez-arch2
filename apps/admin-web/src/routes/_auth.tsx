import React, { useState, useEffect } from 'react';
import { createRoute, Outlet, Link, useLocation } from '@tanstack/react-router';
import { useAuth, useUser, useClerk } from '@clerk/clerk-react';
import { Route as rootRoute } from './__root';
import { MfaGate } from '@/components/MfaGate';
import { CommandPalette } from '@/components/CommandPalette';
import { ClinicEzLogo, ClinicEzMark } from '@/components/ClinicEzLogo';
import { setupAxiosInterceptors } from '@/lib/api';
import { getEnvironmentBadge, readRuntimeEnvironmentSignals } from '@/lib/envBadge';
import { hasVerifiedMfa } from '@/lib/mfaGuard';
import {
  IconDashboard,
  IconBuildingHospital,
  IconCash,
  IconUsersGroup,
  IconArticle,
  IconMail,
  IconShieldCheck,
  IconShieldOff,
  IconUserShield,
  IconSettings,
  IconSun,
  IconMoon,
  IconLogout,
  IconChevronRight,
  IconShield,
  IconMenu2,
  IconX,
  IconSearch,
  IconCommand,
} from '@tabler/icons-react';

export { getEnvironmentBadge } from '@/lib/envBadge';

interface NavItem {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  name: string;
  items: NavItem[];
}

export const SIDEBAR_GROUPS: NavGroup[] = [
  {
    name: 'Overview',
    items: [{ label: 'Overview', to: '/', icon: IconDashboard }],
  },
  {
    name: 'Tenants & Organizations',
    items: [
      { label: 'Tenants', to: '/tenants', icon: IconBuildingHospital },
      { label: 'Leads', to: '/leads', icon: IconUsersGroup },
    ],
  },
  {
    name: 'Commercial & Billing',
    items: [{ label: 'Plans', to: '/plans', icon: IconCash }],
  },
  {
    name: 'Marketing & Growth',
    items: [
      { label: 'Blog CRM', to: '/blog', icon: IconArticle },
      { label: 'Subscribers', to: '/subscribers', icon: IconMail },
    ],
  },
  {
    name: 'Administration & Security',
    items: [
      { label: 'Roles & Access', to: '/roles', icon: IconShieldCheck },
      { label: 'Admin Users', to: '/users', icon: IconUserShield },
      { label: 'Settings', to: '/settings', icon: IconSettings },
    ],
  },
];

function AuthLayout() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 1024;
    }
    return true;
  });
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return false;
  });

  let isSignedIn = true;
  let isLoaded = true;
  let user: any = null;
  let signOut: any = async () => {};

  try {
    const auth = useAuth();
    isLoaded = auth.isLoaded;
    isSignedIn = Boolean(auth.isSignedIn);
    if (auth.getToken) {
      setupAxiosInterceptors(auth.getToken);
    }
    const userRes = useUser();
    user = userRes.user;
    const clerk = useClerk();
    signOut = clerk.signOut;
  } catch {
    // Outside ClerkProvider in unit tests
  }

  // Keyboard shortcut for ⌘K or Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Auto-collapse on small screens
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setSidebarOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    setMobileDrawerOpen(false);
  }, [location.pathname]);

  const toggleTheme = () => {
    const nextDark = !isDarkMode;
    setIsDarkMode(nextDark);
    if (nextDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('admin-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('admin-theme', 'light');
    }
  };

  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const envBadge = getEnvironmentBadge(hostname, readRuntimeEnvironmentSignals());

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-text">
        <div className="flex flex-col items-center gap-4">
          <ClinicEzMark variant="squircle" className="h-11 w-11 shrink-0 drop-shadow-sm animate-pulse" />
          <div className="flex items-center gap-2.5 text-text-muted text-sm">
            <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <span>Loading Clinic EZ Governance Workstation...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6 text-text">
        <div className="max-w-md w-full bg-surface border border-border rounded-3xl p-8 shadow-xl text-center space-y-5">
          <div className="flex justify-center pb-1">
            <ClinicEzLogo
              markClassName="h-8 w-9 shrink-0"
              textClassName="text-lg font-bold tracking-tight text-text"
              subtitle="Governance"
            />
          </div>
          <div className="inline-flex p-3 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <IconShield className="h-8 w-8" />
          </div>
          <h2 className="text-lg font-bold text-text">Authentication Required</h2>
          <p className="text-xs text-text-secondary leading-relaxed">
            You must be signed in with an authorized Platform Administrator account to access the Governance Workstation.
          </p>
          <div className="pt-2">
            <Link
              to="/sign-in"
              className="inline-flex items-center justify-center px-5 py-2.5 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded-xl transition-colors cursor-pointer"
            >
              Go to Administrative Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const currentPath = location.pathname;

  // Breadcrumbs calculation
  const pathSegments = currentPath.split('/').filter(Boolean);
  const breadcrumbItems = [
    { label: 'Workstation', to: '/' },
    ...pathSegments.map((segment, index) => {
      const url = `/${pathSegments.slice(0, index + 1).join('/')}`;
      const title = segment.charAt(0).toUpperCase() + segment.slice(1);
      return { label: title, to: url };
    }),
  ];

  return (
    <MfaGate>
      <div className="min-h-screen flex bg-background text-text">
        {/* Command Palette Jump Dialog */}
        <CommandPalette
          isOpen={commandPaletteOpen}
          onClose={() => setCommandPaletteOpen(false)}
        />

        {/* Desktop Sidebar */}
        <aside
          className={`hidden md:flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200 z-30 ${
            sidebarOpen ? 'w-64' : 'w-20'
          }`}
        >
          {/* Logo / Workstation Header */}
          <div
            className={`h-16 flex items-center justify-between border-b border-sidebar-border ${
              sidebarOpen ? 'px-4' : 'px-2.5'
            }`}
          >
            <Link to="/" className="flex items-center min-w-0">
              <ClinicEzLogo
                variant="squircle"
                markClassName={`${sidebarOpen ? 'h-9 w-9' : 'h-8 w-8'} shrink-0 drop-shadow-xs`}
                textClassName="font-bold text-sm tracking-tight text-text leading-tight"
                subtitle="Governance"
                showWordmark={sidebarOpen}
              />
            </Link>
            <button
              type="button"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-text-muted hover:text-text p-1.5 rounded-lg transition-colors cursor-pointer shrink-0"
              aria-label="Toggle sidebar"
            >
              <IconChevronRight
                className={`h-4 w-4 transition-transform duration-200 ${
                  sidebarOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
          </div>

          {/* Grouped Nav Items */}
          <nav className="flex-1 overflow-y-auto p-3 space-y-4">
            {SIDEBAR_GROUPS.map((group) => (
              <div key={group.name} className="space-y-1">
                {sidebarOpen && (
                  <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                    {group.name}
                  </div>
                )}
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    item.to === '/'
                      ? currentPath === '/'
                      : currentPath.startsWith(item.to);

                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                        isActive
                          ? 'bg-primary text-white shadow-xs'
                          : 'text-text-secondary hover:bg-surface-muted hover:text-text'
                      }`}
                      title={!sidebarOpen ? item.label : undefined}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {sidebarOpen && <span>{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* Footer Environment & Security Status */}
          <div className="p-4 border-t border-sidebar-border space-y-2">
            {sidebarOpen ? (
              <div className="flex items-center justify-between text-[11px] text-text-muted">
                <span>Security Engine</span>
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Active
                </span>
              </div>
            ) : null}
          </div>
        </aside>

        {/* Mobile Header / Drawer */}
        {mobileDrawerOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex">
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-xs"
              onClick={() => setMobileDrawerOpen(false)}
            />
            <div className="relative w-72 bg-sidebar border-r border-sidebar-border flex flex-col z-10 p-4 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-sidebar-border">
                <ClinicEzLogo
                  variant="squircle"
                  markClassName="h-8 w-8 shrink-0 drop-shadow-xs"
                  textClassName="font-bold text-sm tracking-tight text-text leading-tight"
                  subtitle="Governance"
                />
                <button
                  type="button"
                  onClick={() => setMobileDrawerOpen(false)}
                  className="p-1.5 rounded-lg text-text-muted hover:text-text"
                >
                  <IconX className="h-5 w-5" />
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto space-y-4">
                {SIDEBAR_GROUPS.map((group) => (
                  <div key={group.name} className="space-y-1">
                    <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                      {group.name}
                    </div>
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const isActive =
                        item.to === '/'
                          ? currentPath === '/'
                          : currentPath.startsWith(item.to);
                      return (
                        <Link
                          key={item.to}
                          to={item.to}
                          className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                            isActive
                              ? 'bg-primary text-white shadow-xs'
                              : 'text-text-secondary hover:bg-surface-muted hover:text-text'
                          }`}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                ))}
              </nav>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Sticky Command Bar */}
          <header className="h-16 sticky top-0 z-20 bg-surface/80 backdrop-blur-md border-b border-border flex items-center justify-between px-6">
            <div className="flex items-center gap-4 min-w-0">
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(true)}
                className="md:hidden p-2 rounded-xl text-text-muted hover:text-text hover:bg-surface-muted"
                aria-label="Open mobile menu"
              >
                <IconMenu2 className="h-5 w-5" />
              </button>

              {/* Dynamic Breadcrumbs Trail */}
              <nav className="hidden sm:flex items-center gap-1.5 text-xs text-text-muted truncate">
                {breadcrumbItems.map((item, idx) => (
                  <React.Fragment key={item.to}>
                    {idx > 0 && <span className="text-text-muted/60">/</span>}
                    <Link
                      to={item.to}
                      className={`truncate ${
                        idx === breadcrumbItems.length - 1
                          ? 'font-semibold text-text'
                          : 'hover:text-text'
                      }`}
                    >
                      {item.label}
                    </Link>
                  </React.Fragment>
                ))}
              </nav>

              {/* ⌘K Command Palette Quick Trigger */}
              <button
                type="button"
                onClick={() => setCommandPaletteOpen(true)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-muted border border-border text-xs text-text-muted hover:text-text hover:border-primary/40 transition-colors cursor-pointer"
              >
                <IconSearch className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">Search or jump to...</span>
                <span className="lg:hidden">Search</span>
                <kbd className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono bg-surface border border-border">
                  <IconCommand className="h-3 w-3 inline" />
                  <span>K</span>
                </kbd>
              </button>
            </div>

            <div className="flex items-center gap-3">
              {/* Dynamic Environment Badge */}
              {envBadge === 'LOCAL' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  LOCAL
                </span>
              )}
              {envBadge === 'DEV' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  DEV
                </span>
              )}
              {envBadge === 'PROD' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-primary-subtle text-primary border border-primary/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  PROD
                </span>
              )}

              {/* Dynamic MFA / Session Status Indicator */}
              {hasVerifiedMfa(user) ? (
                <div
                  className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-surface-muted border border-border text-text-secondary"
                  title="Admin session authenticated with MFA protection"
                >
                  <IconShieldCheck className="h-3.5 w-3.5 text-primary" />
                  <span>MFA Active</span>
                </div>
              ) : (
                <div
                  className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-surface-muted border border-border text-text-muted"
                  title="Session active without MFA factor enrolled"
                >
                  <IconShieldOff className="h-3.5 w-3.5 text-text-muted" />
                  <span>MFA Inactive</span>
                </div>
              )}

              {/* Theme Toggle */}
              <button
                type="button"
                onClick={toggleTheme}
                className="p-2 rounded-xl text-text-muted hover:text-text hover:bg-surface-muted transition-colors cursor-pointer"
                aria-label="Toggle theme"
              >
                {isDarkMode ? (
                  <IconSun className="h-4 w-4 text-amber-400" />
                ) : (
                  <IconMoon className="h-4 w-4" />
                )}
              </button>

              {/* User profile & Sign Out */}
              {user && (
                <div className="hidden sm:flex items-center gap-2 text-xs text-text-secondary pl-2 border-l border-border">
                  <span className="font-medium text-text">
                    {user.fullName || user.primaryEmailAddress?.emailAddress}
                  </span>
                </div>
              )}

              <button
                type="button"
                onClick={async () => {
                  try {
                    await signOut();
                  } catch {
                    // ignore
                  }
                  window.location.href = '/sign-in';
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-red-600 rounded-lg transition-colors cursor-pointer"
                title="Sign Out"
              >
                <IconLogout className="h-4 w-4" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          </header>

          {/* Workstation Viewport */}
          <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </MfaGate>
  );
}

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  id: '_auth',
  component: AuthLayout,
});
