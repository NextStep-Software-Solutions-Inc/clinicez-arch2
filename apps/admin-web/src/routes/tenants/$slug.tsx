import React, { useEffect, useState } from 'react';
import { createRoute, Link } from '@tanstack/react-router';
import { Route as authRoute } from '../_auth';
import { adminService, AdminTenantDto } from '@/services/admin.service';
import { getTenantWorkspaceUrl } from '@/lib/urls';
import { TenantEntitlementsCard } from '@/components/TenantEntitlementsCard';
import { RecordPaymentDialog } from '@/components/RecordPaymentDialog';
import { TenantCleanupDialog } from '@/components/TenantCleanupDialog';
import { Button, Chip, Tabs, Text } from '@/components/ui';
import { toast } from 'sonner';
import {
  IconBuildingHospital,
  IconArrowLeft,
  IconWorld,
  IconCheck,
  IconAlertCircle,
  IconRefresh,
  IconCreditCard,
  IconTrash,
  IconCopy,
  IconAdjustments,
  IconChartBar,
  IconLoader,
} from '@tabler/icons-react';

function TenantDetailPage() {
  const { slug } = Route.useParams();
  const [tenant, setTenant] = useState<AdminTenantDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'subscription' | 'entitlements' | 'usage'>('subscription');

  // Dialog triggers
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isCleanupOpen, setIsCleanupOpen] = useState(false);

  // Usage override form state
  const [branchesVal, setBranchesVal] = useState(0);
  const [staffVal, setStaffVal] = useState(0);
  const [patientsVal, setPatientsVal] = useState(0);
  const [apiUsedVal, setApiUsedVal] = useState(0);
  const [apiLimitVal, setApiLimitVal] = useState(0);
  const [savingUsage, setSavingUsage] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const t = await adminService.getTenantBySlug(slug);
      if (!t) {
        setError(`Tenant '${slug}' was not found in the registry.`);
        return;
      }
      setTenant(t);
      setBranchesVal(t.facilitiesCount ?? 0);
      setStaffVal(t.staffAccountsCount ?? 0);
      setPatientsVal(t.activePatientRecordsCount ?? 0);
      setApiUsedVal(t.monthlyApiQuotaUsed ?? 0);
      setApiLimitVal(t.monthlyApiQuotaLimit ?? 0);
    } catch (err: any) {
      setError(err?.message || 'Failed to load tenant workstation.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [slug]);

  const handleSaveUsage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) return;

    setSavingUsage(true);
    try {
      await adminService.updateTenantUsage(tenant.id, {
        facilitiesCount: branchesVal,
        staffAccountsCount: staffVal,
        activePatientRecordsCount: patientsVal,
        monthlyApiQuotaUsed: apiUsedVal,
        monthlyApiQuotaLimit: apiLimitVal,
      });
      toast.success('Workspace usage telemetry updated.');
      await loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to update usage telemetry');
    } finally {
      setSavingUsage(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-6 w-32 bg-surface-muted rounded-md" />
        <div className="p-8 rounded-2xl bg-surface border border-border flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-6 w-48 bg-surface-muted rounded-md" />
            <div className="h-4 w-32 bg-surface-muted rounded-md" />
          </div>
          <div className="h-10 w-32 bg-surface-muted rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !tenant) {
    return (
      <div className="space-y-4">
        <Link
          to="/tenants"
          className="inline-flex items-center gap-2 text-xs text-text-secondary hover:text-text"
        >
          <IconArrowLeft className="h-4 w-4" />
          <span>Back to Tenants</span>
        </Link>
        <div className="p-6 rounded-2xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400 space-y-3">
          <p className="font-semibold">{error || 'Tenant not found.'}</p>
          <Button
            variant="dangerSubtle"
            size="md"
            onClick={loadData}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const isActive = tenant.subscriptionStatus.toUpperCase() === 'ACTIVE';

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Back Link */}
      <div>
        <Link
          to="/tenants"
          className="inline-flex items-center gap-2 text-xs text-text-secondary hover:text-text transition-colors"
        >
          <IconArrowLeft className="h-4 w-4" />
          <span>Back to Tenants Registry</span>
        </Link>
      </div>

      {/* Header Banner */}
      <div className="p-6 rounded-2xl bg-surface border border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="p-3.5 rounded-2xl bg-primary-subtle text-primary shrink-0">
            <IconBuildingHospital className="h-8 w-8" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-3 min-w-0">
              <Text as="h1" className="text-xl font-bold text-text">
                {tenant.clinicName}
              </Text>
              <Chip tone={isActive ? 'success' : 'warning'} size="xs" className="px-2.5 shrink-0">
                {tenant.subscriptionStatus}
              </Chip>
            </div>
            <p className="text-xs text-text-muted mt-1 font-mono flex items-center gap-2 flex-wrap">
              <span>Slug: {tenant.tenantSlug}</span>
              <span>•</span>
              <span>ID: {tenant.id}</span>
              <Button
                variant="ghost"
                size="custom"
                onClick={() => {
                  navigator.clipboard.writeText(getTenantWorkspaceUrl(tenant.tenantSlug));
                  toast.success('Workspace portal URL copied to clipboard');
                }}
                className="p-0.5 rounded text-text-muted hover:text-text hover:bg-transparent shrink-0"
                title="Copy Workspace URL"
                aria-label="Copy Workspace URL"
              >
                <IconCopy className="h-3 w-3" />
              </Button>
            </p>
          </div>
        </div>

        {/* Operational Actions */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <Button
            variant="secondary"
            size="md"
            onClick={() => setIsPaymentOpen(true)}
            leadingIcon={<IconCreditCard className="h-4 w-4 text-primary" />}
            className="font-semibold"
          >
            Record Payment
          </Button>

          <Button
            variant="dangerSubtle"
            size="md"
            onClick={() => setIsCleanupOpen(true)}
            leadingIcon={<IconTrash className="h-4 w-4" />}
            className="border-0 text-red-600 dark:text-red-400"
          >
            Offboard
          </Button>

          <a
            href={getTenantWorkspaceUrl(tenant.tenantSlug)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded-xl transition-colors shadow-xs"
          >
            <IconWorld className="h-4 w-4" />
            <span>Launch Workspace</span>
          </a>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        ariaLabel="Tenant workspace sections"
        variant="underline"
        value={activeTab}
        onValueChange={setActiveTab}
        className="w-full gap-2"
        tabClassName="px-4 py-2.5"
        items={[
          { value: 'subscription', label: 'Subscription Settings' },
          { value: 'entitlements', label: 'Entitlements & Overrides' },
          { value: 'usage', label: 'Usage & Telemetry' },
        ]}
      />

      {/* Tab Panels */}
      {activeTab === 'subscription' && (
        <div className="p-6 rounded-2xl bg-surface border border-border space-y-5">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-border">
            <div>
              <h2 className="text-sm font-bold text-text">Commercial Subscription Plan</h2>
              <p className="text-[11px] text-text-muted mt-0.5">
                Active commercial license and billing parameters
              </p>
            </div>
            <Chip tone="neutral" size="xs" className="font-mono px-2.5 py-1 border-0">
              Plan ID: {tenant.subscriptionPlanId || '—'}
            </Chip>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-surface-muted border border-border space-y-1">
              <span className="text-text-muted">Subscription Tier:</span>
              <Text as="p" className="font-semibold text-text text-sm capitalize">
                {tenant.subscriptionPlanId || '—'}
              </Text>
            </div>
            <div className="p-4 rounded-xl bg-surface-muted border border-border space-y-1">
              <span className="text-text-muted">Billing Cadence:</span>
              <p className="font-semibold text-text text-sm">
                {tenant.isAnnual ? 'Annual Billing (₱ Discounted)' : 'Monthly Billing'}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-surface-muted border border-border space-y-1 min-w-0">
              <span className="text-text-muted">Registered Contact:</span>
              <Text as="p" className="font-semibold text-text text-sm">
                {tenant.ownerName}
              </Text>
              <Text as="p" className="text-[11px] text-text-muted">
                {tenant.email}
              </Text>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'entitlements' && (
        <TenantEntitlementsCard
          tenantId={tenant.id}
          tenantSlug={tenant.tenantSlug}
          onSaved={loadData}
          embedded={true}
        />
      )}

      {activeTab === 'usage' && (
        <div className="p-6 rounded-2xl bg-surface border border-border space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <div>
              <h2 className="text-sm font-bold text-text">Live Usage Telemetry</h2>
              <p className="text-[11px] text-text-muted mt-0.5">
                Active clinical resources in service for {tenant.clinicName}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-surface-muted border border-border space-y-1">
              <span className="text-text-muted">Clinical Branches:</span>
              <p className="font-bold text-lg text-text">{tenant.facilitiesCount}</p>
            </div>
            <div className="p-4 rounded-xl bg-surface-muted border border-border space-y-1">
              <span className="text-text-muted">Staff Accounts:</span>
              <p className="font-bold text-lg text-text">{tenant.staffAccountsCount}</p>
            </div>
            <div className="p-4 rounded-xl bg-surface-muted border border-border space-y-1">
              <span className="text-text-muted">Active Patient Records:</span>
              <p className="font-bold text-lg text-text">{tenant.activePatientRecordsCount}</p>
            </div>
            <div className="p-4 rounded-xl bg-surface-muted border border-border space-y-1">
              <span className="text-text-muted">Monthly API Quota:</span>
              <p className="font-bold text-lg text-text">
                {tenant.monthlyApiQuotaUsed ?? 0} /{' '}
                {tenant.monthlyApiQuotaLimit === -1 ? '∞' : (tenant.monthlyApiQuotaLimit ?? 0)}
              </p>
            </div>
          </div>

          {/* Telemetry Override Form */}
          <form onSubmit={handleSaveUsage} className="p-5 rounded-xl bg-surface-muted border border-border space-y-4">
            <h3 className="font-semibold text-text text-xs">In-Place Resource Telemetry Calibration</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="space-y-1.5">
                <Text as="label" className="font-medium text-text text-xs">
                  Facility Branches
                </Text>
                <input
                  type="number"
                  value={branchesVal}
                  onChange={(e) => setBranchesVal(Number(e.target.value))}
                  min={0}
                  className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-text font-mono text-xs focus:outline-hidden"
                />
              </div>
              <div className="space-y-1.5">
                <Text as="label" className="font-medium text-text text-xs">
                  Staff Accounts
                </Text>
                <input
                  type="number"
                  value={staffVal}
                  onChange={(e) => setStaffVal(Number(e.target.value))}
                  min={0}
                  className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-text font-mono text-xs focus:outline-hidden"
                />
              </div>
              <div className="space-y-1.5">
                <Text as="label" className="font-medium text-text text-xs">
                  Patient Records
                </Text>
                <input
                  type="number"
                  value={patientsVal}
                  onChange={(e) => setPatientsVal(Number(e.target.value))}
                  min={0}
                  className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-text font-mono text-xs focus:outline-hidden"
                />
              </div>
              <div className="space-y-1.5">
                <Text as="label" className="font-medium text-text text-xs">
                  Monthly API Used
                </Text>
                <input
                  type="number"
                  value={apiUsedVal}
                  onChange={(e) => setApiUsedVal(Number(e.target.value))}
                  min={0}
                  className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-text font-mono text-xs focus:outline-hidden"
                />
              </div>
              <div className="space-y-1.5">
                <Text as="label" className="font-medium text-text text-xs">
                  Monthly API Limit
                </Text>
                <input
                  type="number"
                  value={apiLimitVal}
                  onChange={(e) => setApiLimitVal(Number(e.target.value))}
                  min={-1}
                  className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-text font-mono text-xs focus:outline-hidden"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={savingUsage}
                leadingIcon={savingUsage ? <IconLoader className="h-4 w-4 animate-spin" /> : undefined}
                className="px-5"
              >
                Calibrate Telemetry
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Operational Dialogs */}
      {isPaymentOpen && (
        <RecordPaymentDialog
          isOpen={isPaymentOpen}
          onClose={() => setIsPaymentOpen(false)}
          onSuccess={loadData}
          tenantId={tenant.id}
          tenantSlug={tenant.tenantSlug}
          clinicName={tenant.clinicName}
          currentPlanSlug={tenant.subscriptionPlanId}
        />
      )}

      {isCleanupOpen && (
        <TenantCleanupDialog
          isOpen={isCleanupOpen}
          onClose={() => setIsCleanupOpen(false)}
          onSuccess={() => {
            window.location.href = '/tenants';
          }}
          tenantId={tenant.id}
          tenantSlug={tenant.tenantSlug}
          clinicName={tenant.clinicName}
          archivedAt={tenant.archivedAt}
        />
      )}
    </div>
  );
}

export const Route = createRoute({
  getParentRoute: () => authRoute,
  path: 'tenants/$slug',
  component: TenantDetailPage,
});
