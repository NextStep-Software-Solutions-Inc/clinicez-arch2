import React, { useEffect, useState, useMemo } from 'react';
import { createRoute, Link } from '@tanstack/react-router';
import { Route as authRoute } from '../_auth';
import { adminService, AdminTenantDto, BillingPlan } from '@/services/admin.service';
import { getTenantWorkspaceUrl } from '@/lib/urls';
import { TenantCleanupDialog } from '@/components/TenantCleanupDialog';
import { Button, Chip, SelectField, Text } from '@/components/ui';
import { toast } from 'sonner';
import {
  IconBuildingHospital,
  IconSearch,
  IconWorld,
  IconChevronRight,
  IconRefresh,
  IconTrash,
  IconToggleLeft,
  IconToggleRight,
  IconAlertCircle,
  IconCircleCheck,
  IconCopy,
  IconFilter,
} from '@tabler/icons-react';

function TenantsPage() {
  const [tenants, setTenants] = useState<AdminTenantDto[]>([]);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [planFilter, setPlanFilter] = useState('ALL');
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Cleanup Dialog state
  const [cleanupTenant, setCleanupTenant] = useState<AdminTenantDto | null>(null);

  const loadTenants = async () => {
    try {
      setLoading(true);
      setError(null);
      const [data, fetchedPlans] = await Promise.all([
        adminService.getTenants(),
        adminService.getPlans().catch(() => []),
      ]);
      setTenants(data);
      setPlans([...fetchedPlans].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)));
    } catch (err: any) {
      setError(err?.message || 'Failed to load tenant clinics registry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTenants();
  }, []);

  const handleToggleSubscription = async (tenant: AdminTenantDto) => {
    const isCurrentlyActive = tenant.subscriptionStatus.toUpperCase() === 'ACTIVE';

    setTogglingId(tenant.id);
    try {
      const updated = await adminService.toggleSubscription(tenant.id);
      const nextStatus = updated?.subscriptionStatus || (isCurrentlyActive ? 'TRIALING' : 'ACTIVE');
      toast.success(
        `Subscription for '${tenant.clinicName}' transitioned to ${nextStatus}.`
      );
      setTenants((prev) =>
        prev.map((t) =>
          t.id === tenant.id
            ? updated
              ? { ...t, ...updated }
              : { ...t, subscriptionStatus: nextStatus }
            : t
        )
      );
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to toggle subscription status');
    } finally {
      setTogglingId(null);
    }
  };

  const filteredTenants = useMemo(() => {
    return tenants.filter((t) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        t.clinicName.toLowerCase().includes(q) ||
        t.tenantSlug.toLowerCase().includes(q) ||
        t.ownerName.toLowerCase().includes(q) ||
        t.email.toLowerCase().includes(q);

      const matchesStatus =
        statusFilter === 'ALL' ||
        t.subscriptionStatus.toUpperCase() === statusFilter.toUpperCase();

      const matchesPlan =
        planFilter === 'ALL' ||
        (t.subscriptionPlanId &&
          t.subscriptionPlanId.toLowerCase().includes(planFilter.toLowerCase()));

      return matchesSearch && matchesStatus && matchesPlan;
    });
  }, [tenants, search, statusFilter, planFilter]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">Tenants Registry</h1>
          <p className="text-xs text-text-muted mt-1">
            Registered medical practices, hospital networks, and corporate health facilities.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="md"
            onClick={loadTenants}
            disabled={loading}
            leadingIcon={<IconRefresh className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <IconAlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <Button
            variant="dangerSubtle"
            size="xs"
            onClick={loadTenants}
            className="shrink-0"
          >
            Retry
          </Button>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="p-4 rounded-2xl bg-surface border border-border flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <IconSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by clinic name, slug, or owner..."
            className="w-full pl-10 pr-4 py-2 text-xs rounded-xl bg-surface-muted border border-border text-text placeholder:text-text-muted focus:outline-hidden focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <div className="flex items-center gap-1.5 text-xs text-text-muted shrink-0">
            <IconFilter className="h-3.5 w-3.5" />
            <span>Filters:</span>
          </div>
          <div className="w-36 shrink-0">
            <SelectField
              ariaLabel="Filter tenants by status"
              value={statusFilter}
              onValueChange={setStatusFilter}
              searchable={false}
              align="right"
              options={[
                { value: 'ALL', label: 'All Statuses' },
                { value: 'ACTIVE', label: 'Active' },
                { value: 'TRIALING', label: 'Trialing' },
                { value: 'ARCHIVED', label: 'Archived' },
                { value: 'CANCELLED', label: 'Cancelled' },
                { value: 'ORPHANED', label: 'Orphaned' },
              ]}
            />
          </div>

          <div className="w-40 shrink-0">
            <SelectField
              ariaLabel="Filter tenants by plan"
              value={planFilter}
              onValueChange={setPlanFilter}
              searchable={false}
              align="right"
              options={[
                { value: 'ALL', label: 'All Plans' },
                ...plans.map((p) => ({
                  value: p.slug,
                  label: p.name,
                })),
              ]}
            />
          </div>
        </div>
      </div>

      {/* Table Viewport with 4-State UX */}
      <div className="rounded-2xl bg-surface border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-muted border-b border-border text-text-muted font-semibold">
              <tr>
                <th className="px-5 py-3.5">Clinic Name & Slug</th>
                <th className="px-5 py-3.5">Owner / Contact</th>
                <th className="px-5 py-3.5">Plan / Status</th>
                <th className="px-5 py-3.5">Branches / Staff</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                /* Skeleton State */
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-5 py-4">
                      <div className="h-4 w-36 bg-surface-muted rounded-md mb-1.5" />
                      <div className="h-3 w-24 bg-surface-muted rounded-md" />
                    </td>
                    <td className="px-5 py-4">
                      <div className="h-4 w-28 bg-surface-muted rounded-md mb-1.5" />
                      <div className="h-3 w-32 bg-surface-muted rounded-md" />
                    </td>
                    <td className="px-5 py-4">
                      <div className="h-4 w-16 bg-surface-muted rounded-md" />
                    </td>
                    <td className="px-5 py-4">
                      <div className="h-4 w-20 bg-surface-muted rounded-md" />
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="h-4 w-12 bg-surface-muted rounded-md ml-auto" />
                    </td>
                  </tr>
                ))
              ) : filteredTenants.length === 0 ? (
                /* Contextual Empty State */
                <tr>
                  <td colSpan={5} className="py-12 text-center space-y-2">
                    <div className="inline-flex p-3 rounded-2xl bg-surface-muted text-text-muted">
                      <IconBuildingHospital className="h-6 w-6" />
                    </div>
                    <div className="font-semibold text-text">No Matching Tenant Clinics</div>
                    <p className="text-xs text-text-muted max-w-sm mx-auto">
                      {search || statusFilter !== 'ALL' || planFilter !== 'ALL'
                        ? 'No tenant workspaces matched your current search filters. Clear filters to view all clinics.'
                        : 'No tenant organizations have been registered in the platform yet.'}
                    </p>
                    {(search || statusFilter !== 'ALL' || planFilter !== 'ALL') && (
                      <Button
                        variant="unstyled"
                        size="custom"
                        onClick={() => {
                          setSearch('');
                          setStatusFilter('ALL');
                          setPlanFilter('ALL');
                        }}
                        className="px-4 py-1.5 text-xs font-semibold text-primary bg-primary-subtle rounded-xl hover:bg-primary/20"
                      >
                        Reset Search Filters
                      </Button>
                    )}
                  </td>
                </tr>
              ) : (
                /* Active Table State */
                filteredTenants.map((tenant) => {
                  const isActive = tenant.subscriptionStatus.toUpperCase() === 'ACTIVE';
                  const matchedPlan = plans.find(
                    (p) =>
                      p.slug.toLowerCase() === (tenant.subscriptionPlanId || '').toLowerCase() ||
                      p.id === tenant.subscriptionPlanId
                  );

                  return (
                    <tr
                      key={tenant.id}
                      className="hover:bg-surface-muted/50 transition-colors"
                    >
                      <td className="px-5 py-4 max-w-[280px]">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="p-2 rounded-xl bg-primary-subtle text-primary shrink-0">
                            <IconBuildingHospital className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <Link
                              to="/tenants/$slug"
                              params={{ slug: tenant.tenantSlug }}
                              className="block font-semibold text-text hover:text-primary transition-colors"
                            >
                              <Text as="span" className="block">
                                {tenant.clinicName}
                              </Text>
                            </Link>
                            <div className="text-[11px] text-text-muted font-mono mt-0.5 flex items-center gap-1.5 min-w-0">
                              <Text>{tenant.tenantSlug}</Text>
                              <Button
                                variant="ghost"
                                size="custom"
                                onClick={() => {
                                  navigator.clipboard.writeText(tenant.tenantSlug);
                                  toast.success(`Slug '${tenant.tenantSlug}' copied`);
                                }}
                                className="p-0.5 rounded text-text-muted hover:text-text hover:bg-transparent shrink-0"
                                title="Copy Slug"
                                aria-label="Copy Slug"
                              >
                                <IconCopy className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 max-w-[240px]">
                        <Text as="div" className="text-text font-medium">
                          {tenant.ownerName}
                        </Text>
                        <Text as="div" className="text-[11px] text-text-muted">
                          {tenant.email}
                        </Text>
                      </td>
                      <td className="px-5 py-4">
                        <Chip tone={isActive ? 'success' : 'warning'} size="xs">
                          {tenant.subscriptionStatus}
                        </Chip>
                        <Text as="div" className="text-[11px] text-text-muted mt-0.5 capitalize max-w-[160px]">
                          {matchedPlan?.name || tenant.subscriptionPlanId || '—'}
                        </Text>
                      </td>
                      <td className="px-5 py-4 text-text-secondary">
                        <div>{tenant.facilitiesCount} branches</div>
                        <div className="text-[11px] text-text-muted">
                          {tenant.staffAccountsCount} staff logins
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          {/* Toggle Subscription */}
                          <Button
                            variant="ghost"
                            size="iconSm"
                            onClick={() => handleToggleSubscription(tenant)}
                            disabled={togglingId === tenant.id}
                            className="text-text-muted hover:text-text"
                            title={isActive ? 'Deactivate / Archive' : 'Activate Subscription'}
                            aria-label={isActive ? 'Deactivate / Archive' : 'Activate Subscription'}
                          >
                            {isActive ? (
                              <IconToggleRight className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <IconToggleLeft className="h-4 w-4 text-text-muted" />
                            )}
                          </Button>

                          {/* Launch Tenant Workspace */}
                          <a
                            href={getTenantWorkspaceUrl(tenant.tenantSlug)}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 rounded-lg text-text-muted hover:text-primary hover:bg-surface-muted transition-colors cursor-pointer"
                            title="Launch Tenant Workspace"
                          >
                            <IconWorld className="h-4 w-4" />
                          </a>

                          {/* Cleanup / Offboard Trigger */}
                          <Button
                            variant="ghost"
                            size="iconSm"
                            onClick={() => setCleanupTenant(tenant)}
                            className="text-text-muted hover:text-red-600 hover:bg-red-500/10"
                            title="Offboard / Cleanup Workspace"
                            aria-label="Offboard / Cleanup Workspace"
                          >
                            <IconTrash className="h-4 w-4" />
                          </Button>

                          {/* View Detail Link */}
                          <Link
                            to="/tenants/$slug"
                            params={{ slug: tenant.tenantSlug }}
                            className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-muted transition-colors cursor-pointer"
                            title="Open Workstation Details"
                          >
                            <IconChevronRight className="h-4 w-4" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tenant Cleanup Dialog */}
      {cleanupTenant && (
        <TenantCleanupDialog
          isOpen={Boolean(cleanupTenant)}
          onClose={() => setCleanupTenant(null)}
          onSuccess={loadTenants}
          tenantId={cleanupTenant.id}
          tenantSlug={cleanupTenant.tenantSlug}
          clinicName={cleanupTenant.clinicName}
          archivedAt={cleanupTenant.archivedAt}
        />
      )}
    </div>
  );
}

export const Route = createRoute({
  getParentRoute: () => authRoute,
  path: 'tenants',
  component: TenantsPage,
});
