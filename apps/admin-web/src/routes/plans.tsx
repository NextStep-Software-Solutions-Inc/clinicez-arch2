import React, { useEffect, useState, useMemo } from 'react';
import { createRoute } from '@tanstack/react-router';
import { Route as authRoute } from './_auth';
import { adminService, BillingPlan } from '@/services/admin.service';
import {
  PlanEditorDialog,
  calculateAnnualDiscountPercent,
} from '@/components/PlanEditorDialog';
import { toast } from 'sonner';
import {
  IconCash,
  IconPlus,
  IconRefresh,
  IconCheck,
  IconEdit,
  IconTrash,
  IconSearch,
  IconAlertCircle,
  IconStack,
  IconLoader,
  IconX,
} from '@tabler/icons-react';

function PlansPage() {
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Dialog states
  const [isEditorOpen, setIsEditorOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      return sp.get('action') === 'create';
    }
    return false;
  });
  const [selectedPlan, setSelectedPlan] = useState<BillingPlan | null>(null);
  const [planToDelete, setPlanToDelete] = useState<BillingPlan | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const loadPlans = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await adminService.getPlans();
      const sorted = [...res].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
      setPlans(sorted);
    } catch (err: any) {
      setError(err?.message || 'Failed to load commercial subscription plans.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlans();
  }, []);

  const handleCreate = () => {
    setSelectedPlan(null);
    setIsEditorOpen(true);
  };

  const handleEdit = (plan: BillingPlan) => {
    setSelectedPlan(plan);
    setIsEditorOpen(true);
  };

  const handleDelete = async () => {
    if (!planToDelete) return;

    setDeleteLoading(true);
    try {
      await adminService.deletePlan(planToDelete.id);
      toast.success(`Plan '${planToDelete.name}' deleted successfully.`);
      setPlanToDelete(null);
      await loadPlans();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to delete plan');
    } finally {
      setDeleteLoading(false);
    }
  };

  const filteredPlans = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return plans;
    return plans.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q))
    );
  }, [plans, search]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">Commercial Subscription Plans</h1>
          <p className="text-xs text-text-muted mt-1">
            Configure subscription tiers, quantitative limits, pricing, and entitlement feature matrices.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={loadPlans}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-text-secondary bg-surface border border-border hover:bg-surface-muted rounded-xl transition-colors cursor-pointer"
          >
            <IconRefresh className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={handleCreate}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded-xl transition-colors cursor-pointer shadow-xs"
          >
            <IconPlus className="h-4 w-4" />
            <span>New Plan</span>
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconAlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={loadPlans}
            className="px-3 py-1 font-semibold rounded-lg bg-red-500/20 hover:bg-red-500/30 transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Search Bar */}
      <div className="p-4 rounded-2xl bg-surface border border-border flex items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <IconSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search plans by name, slug, or tier..."
            className="w-full pl-10 pr-4 py-2 text-xs rounded-xl bg-surface-muted border border-border text-text placeholder:text-text-muted focus:outline-hidden focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="text-xs text-text-muted font-medium">
          {filteredPlans.length} {filteredPlans.length === 1 ? 'tier' : 'tiers'} configured
        </div>
      </div>

      {/* 4-State Plans Grid */}
      {loading ? (
        /* Skeleton Grid */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="p-6 rounded-2xl bg-surface border border-border space-y-4 animate-pulse"
            >
              <div className="flex justify-between">
                <div className="h-5 w-32 bg-surface-muted rounded-md" />
                <div className="h-4 w-12 bg-surface-muted rounded-md" />
              </div>
              <div className="h-3 w-48 bg-surface-muted rounded-md" />
              <div className="h-8 w-24 bg-surface-muted rounded-md" />
              <div className="pt-4 border-t border-border space-y-2">
                <div className="h-3 w-36 bg-surface-muted rounded-md" />
                <div className="h-3 w-40 bg-surface-muted rounded-md" />
                <div className="h-3 w-28 bg-surface-muted rounded-md" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredPlans.length === 0 ? (
        /* Empty State */
        <div className="p-12 rounded-2xl bg-surface border border-dashed border-border text-center space-y-3">
          <div className="inline-flex p-3 rounded-2xl bg-surface-muted text-text-muted">
            <IconStack className="h-8 w-8" />
          </div>
          <h3 className="font-bold text-sm text-text">No Commercial Plans Found</h3>
          <p className="text-xs text-text-muted max-w-sm mx-auto">
            {search
              ? 'No plans matched your search query. Try clearing the search term.'
              : 'Zero commercial plans exist in the platform registry. Author your first tier to get started.'}
          </p>
          <div className="pt-2">
            {search ? (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="px-4 py-2 text-xs font-semibold text-primary bg-primary-subtle rounded-xl hover:bg-primary/20 transition-colors cursor-pointer"
              >
                Clear Search
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCreate}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded-xl transition-colors cursor-pointer shadow-xs"
              >
                <IconPlus className="h-4 w-4" />
                <span>Author First Plan</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Active Cards Grid */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {filteredPlans.map((p) => {
            const displayFeatures =
              p.features && p.features.length > 0 ? p.features : p.enabledFeatures || [];
            const hasFeatures = displayFeatures.length > 0;
            const discountPct = calculateAnnualDiscountPercent(
              p.monthlyPrice ?? 0,
              p.annualPrice ?? 0
            );
            return (
              <div
                key={p.id}
                className={`p-6 rounded-2xl bg-surface border flex flex-col justify-between space-y-5 transition-all hover:shadow-md ${
                  p.highlighted
                    ? 'border-primary ring-1 ring-primary/30'
                    : 'border-border'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-base text-text">{p.name}</h3>
                      {p.highlighted && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary-subtle text-primary border border-primary/20">
                          Popular
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-surface-muted border border-border text-text-muted">
                      Rank {p.rank}
                    </span>
                  </div>

                  <p className="text-xs text-text-muted leading-relaxed line-clamp-2">
                    {p.description || 'No description provided.'}
                  </p>

                  <div className="pt-2">
                    <span className="text-2xl font-bold text-text">
                      ₱{(p.monthlyPrice ?? 0).toLocaleString()}
                    </span>
                    <span className="text-xs text-text-muted"> / month</span>
                    <div className="text-[11px] text-text-muted mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>Annual: ₱{(p.annualPrice ?? 0).toLocaleString()} / yr</span>
                      {discountPct > 0 && (
                        <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          Save {discountPct}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Features & Limits Preview */}
                <div className="pt-4 border-t border-border space-y-3 text-xs">
                  <div className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">
                    Tier Features & Entitlements:
                  </div>

                  {hasFeatures ? (
                    <ul className="space-y-1.5 text-text-secondary">
                      {displayFeatures.slice(0, 5).map((f, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <IconCheck className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="truncate">{f}</span>
                        </li>
                      ))}
                      {displayFeatures.length > 5 && (
                        <li className="text-[11px] text-text-muted font-medium pl-5.5">
                          + {displayFeatures.length - 5} more capabilities
                        </li>
                      )}
                    </ul>
                  ) : (
                    <p className="text-[11px] text-text-muted italic">Zero specific capability flags defined.</p>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="pt-4 border-t border-border flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => handleEdit(p)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-text-secondary hover:text-text bg-surface-muted hover:bg-surface border border-border rounded-xl transition-colors cursor-pointer"
                  >
                    <IconEdit className="h-3.5 w-3.5" />
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlanToDelete(p)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-500/10 rounded-xl transition-colors cursor-pointer"
                  >
                    <IconTrash className="h-3.5 w-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Plan Editor Dialog */}
      {isEditorOpen && (
        <PlanEditorDialog
          isOpen={isEditorOpen}
          onClose={() => setIsEditorOpen(false)}
          onSaved={loadPlans}
          plan={selectedPlan}
          existingPlans={plans}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {planToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setPlanToDelete(null)}
        >
          <div
            className="w-full max-w-md bg-surface border border-border rounded-2xl shadow-2xl p-6 text-text space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400">
                <IconTrash className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-text">Delete Commercial Plan</h3>
                <p className="text-xs text-text-muted">Clinic EZ Commercial Operations</p>
              </div>
            </div>

            <p className="text-xs text-text-secondary leading-relaxed">
              Are you sure you want to permanently delete plan{' '}
              <span className="font-semibold text-text">{planToDelete.name}</span>? Existing subscribers will retain their baseline entitlement until their next billing cycle renewal.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setPlanToDelete(null)}
                className="px-4 py-2 text-xs font-medium text-text-secondary hover:text-text rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteLoading}
                className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors cursor-pointer shadow-xs disabled:opacity-50"
              >
                {deleteLoading && <IconLoader className="h-4 w-4 animate-spin" />}
                <span>Confirm Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const Route = createRoute({
  getParentRoute: () => authRoute,
  path: 'plans',
  component: PlansPage,
});
