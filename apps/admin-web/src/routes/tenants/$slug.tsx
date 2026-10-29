import React, { useEffect, useState } from 'react';
import { createRoute, Link } from '@tanstack/react-router';
import { Route as authRoute } from '../_auth';
import { adminService, AdminTenantDto } from '@/services/admin.service';
import { getTenantWorkspaceUrl } from '@/lib/urls';
import { TenantEntitlementsCard } from '@/components/TenantEntitlementsCard';
import { RecordPaymentDialog } from '@/components/RecordPaymentDialog';
import { TenantCleanupDialog } from '@/components/TenantCleanupDialog';
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
          <button
            type="button"
            onClick={loadData}
            className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-xs font-semibold rounded-xl cursor-pointer"
          >
            Retry
          </button>
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
        <div className="flex items-center gap-4">
          <div className="p-3.5 rounded-2xl bg-primary-subtle text-primary shrink-0">
            <IconBuildingHospital className="h-8 w-8" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-text">{tenant.clinicName}</h1>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                  isActive
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                }`}
              >
                {tenant.subscriptionStatus}
              </span>
            </div>
            <p className="text-xs text-text-muted mt-1 font-mono flex items-center gap-2">
              <span>Slug: {tenant.tenantSlug}</span>
              <span>•</span>
              <span>ID: {tenant.id}</span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(getTenantWorkspaceUrl(tenant.tenantSlug));
                  toast.success('Workspace portal URL copied to clipboard');
                }}
                className="text-text-muted hover:text-text cursor-pointer"
                title="Copy Workspace URL"
              >
                <IconCopy className="h-3 w-3" />
              </button>
            </p>
          </div>
        </div>

        {/* Operational Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsPaymentOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-text-secondary bg-surface border border-border hover:bg-surface-muted rounded-xl transition-colors cursor-pointer"
          >
            <IconCreditCard className="h-4 w-4 text-primary" />
            <span>Record Payment</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCleanupOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-red-600 bg-red-500/10 hover:bg-red-500/20 rounded-xl transition-colors cursor-pointer"
          >
            <IconTrash className="h-4 w-4" />
            <span>Offboard</span>
          </button>

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
      <div className="flex items-center gap-2 border-b border-border pb-px">
        {[
          { id: 'subscription', label: 'Subscription Settings' },
          { id: 'entitlements', label: 'Entitlements & Overrides' },
          { id: 'usage', label: 'Usage & Telemetry' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px cursor-pointer ${
              activeTab === tab.id
                ? 'border-primary text-primary font-semibold'
                : 'border-transparent text-text-muted hover:text-text'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Panels */}
      {activeTab === 'subscription' && (
        <div className="p-6 rounded-2xl bg-surface border border-border space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <div>
              <h2 className="text-sm font-bold text-text">Commercial Subscription Plan</h2>
              <p className="text-[11px] text-text-muted mt-0.5">
                Active commercial license and billing parameters
              </p>
            </div>
            <span className="text-[10px] font-mono font-semibold px-2.5 py-1 rounded-full bg-surface-muted text-text-secondary">
              Plan ID: {tenant.subscriptionPlanId || '—'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-surface-muted border border-border space-y-1">
              <span className="text-text-muted">Subscription Tier:</span>
              <p className="font-semibold text-text text-sm capitalize">
                {tenant.subscriptionPlanId || '—'}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-surface-muted border border-border space-y-1">
              <span className="text-text-muted">Billing Cadence:</span>
              <p className="font-semibold text-text text-sm">
                {tenant.isAnnual ? 'Annual Billing (₱ Discounted)' : 'Monthly Billing'}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-surface-muted border border-border space-y-1">
              <span className="text-text-muted">Registered Contact:</span>
              <p className="font-semibold text-text text-sm">{tenant.ownerName}</p>
              <p className="text-[11px] text-text-muted">{tenant.email}</p>
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
                <label className="font-medium text-text text-xs">Facility Branches</label>
                <input
                  type="number"
                  value={branchesVal}
                  onChange={(e) => setBranchesVal(Number(e.target.value))}
                  min={0}
                  className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-text font-mono text-xs focus:outline-hidden"
                />
              </div>
              <div className="space-y-1.5">
                <label className="font-medium text-text text-xs">Staff Accounts</label>
                <input
                  type="number"
                  value={staffVal}
                  onChange={(e) => setStaffVal(Number(e.target.value))}
                  min={0}
                  className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-text font-mono text-xs focus:outline-hidden"
                />
              </div>
              <div className="space-y-1.5">
                <label className="font-medium text-text text-xs">Patient Records</label>
                <input
                  type="number"
                  value={patientsVal}
                  onChange={(e) => setPatientsVal(Number(e.target.value))}
                  min={0}
                  className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-text font-mono text-xs focus:outline-hidden"
                />
              </div>
              <div className="space-y-1.5">
                <label className="font-medium text-text text-xs">Monthly API Used</label>
                <input
                  type="number"
                  value={apiUsedVal}
                  onChange={(e) => setApiUsedVal(Number(e.target.value))}
                  min={0}
                  className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-text font-mono text-xs focus:outline-hidden"
                />
              </div>
              <div className="space-y-1.5">
                <label className="font-medium text-text text-xs">Monthly API Limit</label>
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
              <button
                type="submit"
                disabled={savingUsage}
                className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded-xl transition-colors cursor-pointer shadow-xs disabled:opacity-50"
              >
                {savingUsage && <IconLoader className="h-4 w-4 animate-spin" />}
                <span>Calibrate Telemetry</span>
              </button>
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
