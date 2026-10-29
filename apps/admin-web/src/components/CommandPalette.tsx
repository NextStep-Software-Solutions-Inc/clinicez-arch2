import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { adminService, AdminTenantDto } from '@/services/admin.service';
import {
  IconSearch,
  IconDashboard,
  IconBuildingHospital,
  IconCash,
  IconUsersGroup,
  IconArticle,
  IconMail,
  IconShieldCheck,
  IconUserShield,
  IconSettings,
  IconPlus,
  IconArrowRight,
  IconX,
} from '@tabler/icons-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

interface CommandItem {
  id: string;
  category: 'Workstation' | 'Quick Actions' | 'Tenants';
  title: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [tenants, setTenants] = useState<AdminTenantDto[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);

      // Pre-fetch tenants for instant jump
      adminService
        .getTenants()
        .then((data) => setTenants(data))
        .catch(() => {});
    }
  }, [isOpen]);

  const workstationRoutes: CommandItem[] = [
    {
      id: 'route-overview',
      category: 'Workstation',
      title: 'Overview Dashboard',
      subtitle: 'Central telemetry and KPIs',
      icon: IconDashboard,
      action: () => {
        navigate({ to: '/' });
        onClose();
      },
    },
    {
      id: 'route-tenants',
      category: 'Workstation',
      title: 'Tenants Registry',
      subtitle: 'Registered multi-facility workspaces',
      icon: IconBuildingHospital,
      action: () => {
        navigate({ to: '/tenants' });
        onClose();
      },
    },
    {
      id: 'route-plans',
      category: 'Workstation',
      title: 'Commercial Plans',
      subtitle: 'Subscription ladders & limits',
      icon: IconCash,
      action: () => {
        navigate({ to: '/plans' });
        onClose();
      },
    },
    {
      id: 'route-leads',
      category: 'Workstation',
      title: 'Conversion Leads',
      subtitle: 'Trial onboarding pipeline',
      icon: IconUsersGroup,
      action: () => {
        navigate({ to: '/leads' });
        onClose();
      },
    },
    {
      id: 'route-blog',
      category: 'Workstation',
      title: 'Blog CRM',
      subtitle: 'Editorial articles & notices',
      icon: IconArticle,
      action: () => {
        navigate({ to: '/blog' });
        onClose();
      },
    },
    {
      id: 'route-subscribers',
      category: 'Workstation',
      title: 'Subscribers Directory',
      subtitle: 'Audience & RFC-4180 CSV export',
      icon: IconMail,
      action: () => {
        navigate({ to: '/subscribers' });
        onClose();
      },
    },
    {
      id: 'route-roles',
      category: 'Workstation',
      title: 'Roles & Access Control',
      subtitle: 'RBAC permissions matrix',
      icon: IconShieldCheck,
      action: () => {
        navigate({ to: '/roles' });
        onClose();
      },
    },
    {
      id: 'route-users',
      category: 'Workstation',
      title: 'Platform Admin Accounts',
      subtitle: 'Staff credentials & resets',
      icon: IconUserShield,
      action: () => {
        navigate({ to: '/users' });
        onClose();
      },
    },
    {
      id: 'route-settings',
      category: 'Workstation',
      title: 'Platform Settings',
      subtitle: 'N-Bank accounts & VAT configs',
      icon: IconSettings,
      action: () => {
        navigate({ to: '/settings' });
        onClose();
      },
    },
  ];

  const quickActions: CommandItem[] = [
    {
      id: 'action-new-plan',
      category: 'Quick Actions',
      title: 'New Commercial Plan',
      subtitle: 'Launch multi-step plan authoring wizard',
      icon: IconPlus,
      action: () => {
        navigate({ to: '/plans' });
        onClose();
      },
    },
    {
      id: 'action-invite-admin',
      category: 'Quick Actions',
      title: 'Invite Platform Administrator',
      subtitle: 'Generate administrative invite token',
      icon: IconPlus,
      action: () => {
        navigate({ to: '/users' });
        onClose();
      },
    },
    {
      id: 'action-record-payment',
      category: 'Quick Actions',
      title: 'Record Offline Payment',
      subtitle: 'Log manual bank or GCash payment',
      icon: IconCash,
      action: () => {
        navigate({ to: '/tenants' });
        onClose();
      },
    },
  ];

  const tenantItems: CommandItem[] = tenants.map((t) => ({
    id: `tenant-${t.id}`,
    category: 'Tenants',
    title: t.clinicName,
    subtitle: `Slug: ${t.tenantSlug} • ${t.subscriptionStatus}`,
    icon: IconBuildingHospital,
    action: () => {
      navigate({ to: '/tenants/$slug', params: { slug: t.tenantSlug } });
      onClose();
    },
  }));

  const allItems = [...workstationRoutes, ...quickActions, ...tenantItems];

  const q = query.trim().toLowerCase();
  const filteredItems = q
    ? allItems.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          (item.subtitle && item.subtitle.toLowerCase().includes(q))
      )
    : allItems.slice(0, 12);

  // Group items by category
  const categories = Array.from(new Set(filteredItems.map((item) => item.category)));

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredItems.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev <= 0 ? filteredItems.length - 1 : prev - 1
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        filteredItems[selectedIndex].action();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col text-text"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-border gap-3">
          <IconSearch className="h-5 w-5 text-text-muted shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Type a command, route, or search tenant clinics..."
            className="flex-1 bg-transparent border-0 outline-hidden text-sm text-text placeholder:text-text-muted"
          />
          <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-[10px] font-mono font-medium rounded-md bg-surface-muted border border-border text-text-muted">
            ESC
          </kbd>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-text-muted hover:text-text"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto p-2 space-y-3">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-center text-xs text-text-muted">
              No matching routes, actions, or tenants found for &ldquo;{query}&rdquo;.
            </div>
          ) : (
            categories.map((cat) => {
              const catItems = filteredItems.filter((i) => i.category === cat);
              return (
                <div key={cat} className="space-y-1">
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                    {cat}
                  </div>
                  {catItems.map((item) => {
                    const itemGlobalIndex = filteredItems.indexOf(item);
                    const isSelected = itemGlobalIndex === selectedIndex;
                    const Icon = item.icon;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={item.action}
                        onMouseEnter={() => setSelectedIndex(itemGlobalIndex)}
                        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-left text-xs transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-primary text-white'
                            : 'hover:bg-surface-muted text-text'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Icon
                            className={`h-4 w-4 shrink-0 ${
                              isSelected ? 'text-white' : 'text-primary'
                            }`}
                          />
                          <div className="truncate">
                            <div className="font-semibold truncate">{item.title}</div>
                            {item.subtitle && (
                              <div
                                className={`text-[11px] truncate ${
                                  isSelected ? 'text-white/80' : 'text-text-muted'
                                }`}
                              >
                                {item.subtitle}
                              </div>
                            )}
                          </div>
                        </div>
                        <IconArrowRight
                          className={`h-3.5 w-3.5 shrink-0 transition-opacity ${
                            isSelected ? 'opacity-100 text-white' : 'opacity-0'
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2 bg-surface-muted border-t border-border flex items-center justify-between text-[11px] text-text-muted">
          <div className="flex items-center gap-3">
            <span>Navigation:</span>
            <span className="flex items-center gap-1 font-mono">
              <kbd className="px-1.5 py-0.5 rounded bg-surface border border-border">↑</kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-surface border border-border">↓</kbd>
            </span>
            <span>Select:</span>
            <kbd className="px-1.5 py-0.5 rounded bg-surface border border-border font-mono">↵</kbd>
          </div>
          <div>Clinic EZ Governance Workstation</div>
        </div>
      </div>
    </div>
  );
}
