import React, { useState, useEffect } from 'react';
import { createRoute, Outlet, Link, useLocation } from '@tanstack/react-router';
import { useAuth, useUser, useClerk } from '@clerk/clerk-react';
import { Route as rootRoute } from './__root';
import { MfaGate } from '@/components/MfaGate';
import { CommandPalette } from '@/components/CommandPalette';
import { ClinicEzLogo, ClinicEzMark } from '@/components/ClinicEzLogo';
import { Button, Chip, Text } from '@/components/ui';
import { setupAxiosInterceptors } from '@/lib/api';
import { getEnvironmentBadge, readRuntimeEnvironmentSignals } from '@/lib/envBadge';
import { hasVerifiedMfa } from '@/lib/mfaGuard';
import {
  IconDashboard,
  IconBuildingHospital,
  IconCash,
  IconClipboardCheck,
  IconUsersGroup,
  IconArticle,
  IconMail,
  IconShieldCheck,
  IconShieldOff,
  IconUserShield,
  IconSettings,
  IconDatabaseImport,
  IconId,
  IconSun,
  IconMoon,
  IconLogout,
  IconChevronRight,
  IconLayoutSidebarLeftExpand,
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
      { label: 'Directory Verifications', to: '/verifications', icon: IconClipboardCheck },
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
      { label: 'Patient Identities', to: '/patient-identities', icon: IconId },
      { label: 'v1 Migration & Sync', to: '/v1-sync', icon: IconDatabaseImport },
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
  const BREADCRUMB_LABELS: Record<string, string> = {
    'patient-identities': 'Patient Identities',
    'v1-sync': 'v1 Migration & Sync',
  };
  const pathSegments = currentPath.split('/').filter(Boolean);
  const breadcrumbItems = [
    { label: 'Workstation', to: '/' },
    ...pathSegments.map((segment, index) => {
      const url = `/${pathSegments.slice(0, index + 1).join('/')}`;
      const title =
        BREADCRUMB_LABELS[segment] ?? segment.charAt(0).toUpperCase() + segment.slice(1);
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
          className={`hidden md:flex flex-col shrink-0 sticky top-0 h-screen self-start overflow-hidden border-r border-sidebar-border bg-sidebar transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] z-30 ${
            sidebarOpen ? 'w-64' : 'w-20'
          }`}
        >
          {/* Logo / Workstation Header */}
          <div className="h-16 shrink-0 flex items-center border-b border-sidebar-border pl-[21.5px] pr-3 overflow-hidden">
            <Link
              to="/"
              className="flex items-center min-w-0 flex-1 overflow-hidden"
              title={!sidebarOpen ? 'Clinic EZ Governance' : undefined}
            >
              <ClinicEzLogo
                variant="squircle"
                className="inline-flex items-center gap-2.5 min-w-0"
                markClassName="h-9 w-9 shrink-0 drop-shadow-xs"
                textClassName="font-bold text-sm tracking-tight whitespace-nowrap text-text leading-tight"
                subtitle="Governance"
                showWordmark={true}
                wordmarkClassName={`transition-opacity duration-200 ${
                  sidebarOpen ? 'opacity-100 delay-75' : 'opacity-0 pointer-events-none'
                }`}
              />
            </Link>
            <Button
              variant="unstyled"
              size="custom"
              onClick={() => setSidebarOpen(false)}
              disabled={!sidebarOpen}
              tabIndex={sidebarOpen ? 0 : -1}
              aria-hidden={!sidebarOpen}
              className={`h-7 rounded-lg text-text-muted hover:text-text hover:bg-surface-muted transition-[width,opacity,margin] duration-200 shrink-0 ${
                sidebarOpen ? 'w-7 opacity-100 ml-2' : 'w-0 opacity-0 ml-0 pointer-events-none'
              }`}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <IconChevronRight className="h-4 w-4 rotate-180 shrink-0" />
            </Button>
          </div>

          {/* Grouped Nav Items */}
          <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2.5 px-5 space-y-2.5">
            {SIDEBAR_GROUPS.map((group, groupIdx) => (
              <div key={group.name} className="space-y-1">
                <div className="relative h-5 flex items-center overflow-hidden">
                  <span
                    aria-hidden={!sidebarOpen}
                    className={`pl-3 text-[10px] font-bold uppercase tracking-wider text-text-muted whitespace-nowrap transition-opacity duration-200 ${
                      sidebarOpen ? 'opacity-100 delay-75' : 'opacity-0 pointer-events-none'
                    }`}
                  >
                    {group.name}
                  </span>
                  {groupIdx > 0 && (
                    <span
                      aria-hidden="true"
                      className={`absolute inset-x-1 top-1/2 -translate-y-1/2 h-px bg-sidebar-border/80 transition-opacity duration-200 ${
                        sidebarOpen ? 'opacity-0' : 'opacity-100 delay-75'
                      }`}
                    />
                  )}
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
                      className={`flex items-center h-9 w-full rounded-xl text-xs font-medium overflow-hidden transition-colors duration-150 ${
                        isActive
                          ? 'bg-primary text-white shadow-xs'
                          : 'text-text-secondary hover:bg-surface-muted hover:text-text'
                      }`}
                      title={!sidebarOpen ? item.label : undefined}
                      aria-label={!sidebarOpen ? item.label : undefined}
                    >
                      <span className="w-[39px] h-9 shrink-0 flex items-center justify-center">
                        <Icon className="h-4 w-4 shrink-0" />
                      </span>
                      <span
                        aria-hidden={!sidebarOpen}
                        className={`whitespace-nowrap pr-3 transition-opacity duration-200 ${
                          sidebarOpen ? 'opacity-100 delay-75' : 'opacity-0'
                        }`}
                      >
                        {item.label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* Footer Environment & Security Status */}
          <div className="h-12 shrink-0 px-5 border-t border-sidebar-border flex items-center overflow-hidden">
            <div className="relative w-full h-full flex items-center">
              <div
                aria-hidden={!sidebarOpen}
                className={`w-full flex items-center justify-between text-[11px] text-text-muted whitespace-nowrap transition-opacity duration-200 ${
                  sidebarOpen ? 'opacity-100 delay-75' : 'opacity-0 pointer-events-none'
                }`}
              >
                <span>Security Engine</span>
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Active
                </span>
              </div>
              <div
                aria-hidden={sidebarOpen}
                title="Security Engine: Active"
                className={`absolute left-0 inset-y-0 w-[39px] flex items-center justify-center transition-opacity duration-200 ${
                  sidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100 delay-75'
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-emerald-500 ring-4 ring-emerald-500/15" />
              </div>
            </div>
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
                <Button
                  variant="ghost"
                  size="iconSm"
                  onClick={() => setMobileDrawerOpen(false)}
                  aria-label="Close mobile menu"
                  title="Close menu"
                >
                  <IconX className="h-5 w-5" />
                </Button>
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
          <header className="h-16 sticky top-0 z-20 bg-surface/80 backdrop-blur-md border-b border-border flex items-center justify-between gap-3 px-4 lg:px-6">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <Button
                variant="unstyled"
                size="custom"
                onClick={() => setMobileDrawerOpen(true)}
                className="md:hidden p-2 rounded-xl text-text-muted hover:text-text hover:bg-surface-muted shrink-0"
                aria-label="Open mobile menu"
                title="Open menu"
              >
                <IconMenu2 className="h-5 w-5" />
              </Button>

              <div className="flex items-center min-w-0 shrink-0">
                <Button
                  variant="unstyled"
                  size="custom"
                  onClick={() => setSidebarOpen(true)}
                  disabled={sidebarOpen}
                  tabIndex={sidebarOpen ? -1 : 0}
                  aria-hidden={sidebarOpen}
                  className={`hidden md:inline-flex h-8 rounded-xl text-text-muted hover:text-text hover:bg-surface-muted border border-transparent hover:border-border transition-[width,opacity,margin] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] shrink-0 ${
                    sidebarOpen
                      ? 'w-0 opacity-0 mr-0 border-0 pointer-events-none'
                      : 'w-8 opacity-100 mr-3'
                  }`}
                  aria-label="Expand sidebar"
                  title="Expand sidebar"
                >
                  <IconLayoutSidebarLeftExpand className="h-4 w-4 shrink-0" />
                </Button>

                {/* Dynamic Breadcrumbs Trail */}
                <nav
                  className="hidden sm:flex items-center gap-1.5 text-xs text-text-muted min-w-0 shrink-0 max-w-[170px] xl:max-w-[260px]"
                  aria-label="Breadcrumb"
                >
                  {breadcrumbItems.map((item, idx) => {
                    const isLast = idx === breadcrumbItems.length - 1;
                    return (
                      <React.Fragment key={item.to}>
                        {idx > 0 && (
                          <span
                            className={`text-text-muted/60 shrink-0 ${
                              idx === 1 && breadcrumbItems.length > 1 ? 'hidden xl:inline' : ''
                            }`}
                          >
                            /
                          </span>
                        )}
                        <Link
                          to={item.to}
                          title={item.label}
                          className={`truncate whitespace-nowrap ${
                            isLast
                              ? 'font-semibold text-text'
                              : 'hover:text-text hidden xl:inline'
                          }`}
                        >
                          {item.label}
                        </Link>
                      </React.Fragment>
                    );
                  })}
                </nav>
              </div>

              {/* ⌘K Command Palette Quick Trigger — flexes cleanly across available header space */}
              <Button
                variant="unstyled"
                size="custom"
                onClick={() => setCommandPaletteOpen(true)}
                title="Search or jump to any section (⌘K)"
                aria-label="Search or jump to any section"
                className="flex-1 max-w-md justify-between gap-2 h-8 px-3 rounded-xl bg-surface-muted border border-border text-xs text-text-muted hover:text-text hover:border-primary/40"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <IconSearch className="h-3.5 w-3.5 shrink-0" />
                  <Text className="text-inherit" tooltip={false}>
                    Search or jump to...
                  </Text>
                </span>
                <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono bg-surface border border-border shrink-0">
                  <IconCommand className="h-3 w-3 inline" />
                  <span>K</span>
                </kbd>
              </Button>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Dynamic Environment Badge */}
              {envBadge === 'LOCAL' && (
                <Chip
                  tone="success"
                  size="custom"
                  dot
                  title="Local environment"
                  className="h-8 px-2.5 text-[11px] shrink-0"
                >
                  LOCAL
                </Chip>
              )}
              {envBadge === 'DEV' && (
                <Chip
                  tone="warning"
                  size="custom"
                  dot
                  title="Development environment"
                  className="h-8 px-2.5 text-[11px] shrink-0"
                >
                  DEV
                </Chip>
              )}
              {envBadge === 'PROD' && (
                <Chip
                  tone="primary"
                  size="custom"
                  dot
                  title="Production environment"
                  className="h-8 px-2.5 text-[11px] shrink-0"
                >
                  PROD
                </Chip>
              )}

              {/* Dynamic MFA / Session Status Indicator */}
              {hasVerifiedMfa(user) ? (
                <Chip
                  tone="neutral"
                  size="custom"
                  className="justify-center h-8 w-8 xl:w-auto xl:px-2.5 text-[11px] font-medium bg-surface-muted border-border text-text-secondary shrink-0"
                  title="MFA Active — Admin session authenticated with MFA protection"
                  aria-label="MFA Active"
                  leadingIcon={<IconShieldCheck className="h-4 w-4 text-primary" />}
                >
                  <span className="hidden xl:inline">MFA Active</span>
                </Chip>
              ) : (
                <Chip
                  tone="neutral"
                  size="custom"
                  className="justify-center h-8 w-8 xl:w-auto xl:px-2.5 text-[11px] font-medium bg-surface-muted border-border text-text-muted shrink-0"
                  title="MFA Inactive — Session active without MFA factor enrolled"
                  aria-label="MFA Inactive"
                  leadingIcon={<IconShieldOff className="h-4 w-4 text-text-muted" />}
                >
                  <span className="hidden xl:inline">MFA Inactive</span>
                </Chip>
              )}

              {/* Theme Toggle */}
              <Button
                variant="ghost"
                size="iconSm"
                onClick={toggleTheme}
                className="rounded-xl shrink-0"
                aria-label="Toggle theme"
                title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {isDarkMode ? (
                  <IconSun className="h-4 w-4 text-amber-400" />
                ) : (
                  <IconMoon className="h-4 w-4" />
                )}
              </Button>

              {/* User profile (full name on xl+; compact monogram on smaller screens) */}
              {user && (
                <div
                  className="hidden sm:flex items-center gap-2 text-xs text-text-secondary pl-2 border-l border-border shrink-0"
                  title={user.fullName || user.primaryEmailAddress?.emailAddress || ''}
                >
                  <span className="xl:hidden inline-flex items-center justify-center h-7 w-7 rounded-full bg-primary-subtle text-primary border border-primary/20 text-[11px] font-bold">
                    {(user.fullName || user.primaryEmailAddress?.emailAddress || 'A')
                      .trim()
                      .charAt(0)
                      .toUpperCase()}
                  </span>
                  <Text className="hidden xl:inline font-medium text-text max-w-[150px]">
                    {user.fullName || user.primaryEmailAddress?.emailAddress}
                  </Text>
                </div>
              )}

              {/* Sign Out (icon-only on small/medium screens, icon + text on xl+) */}
              <Button
                variant="unstyled"
                size="custom"
                onClick={async () => {
                  try {
                    await signOut();
                  } catch {
                    // ignore
                  }
                  window.location.href = '/sign-in';
                }}
                className="h-8 w-8 xl:w-auto xl:px-2.5 text-xs font-medium shrink-0 text-text-secondary hover:text-red-600 hover:bg-surface-muted rounded-xl"
                title="Sign Out"
                aria-label="Sign Out"
                leadingIcon={<IconLogout className="h-4 w-4" />}
              >
                <span className="hidden xl:inline">Sign Out</span>
              </Button>
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
