import React, { useEffect, useState, useMemo } from 'react';
import { createRoute } from '@tanstack/react-router';
import { Route as authRoute } from './_auth';
import { adminService, BillingPlan } from '@/services/admin.service';
import {
  PlanEditorDialog,
  calculateAnnualDiscountPercent,
} from '@/components/PlanEditorDialog';
import { Button, Chip, Text } from '@/components/ui';
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
          <Button
            variant="secondary"
            size="md"
            onClick={loadPlans}
            disabled={loading}
            leadingIcon={<IconRefresh className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleCreate}
            leadingIcon={<IconPlus className="h-4 w-4" />}
          >
            New Plan
          </Button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <IconAlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <Button
            variant="dangerSubtle"
            size="xs"
            onClick={loadPlans}
            className="shrink-0"
          >
            Retry
          </Button>
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
              <Button
                variant="unstyled"
                size="md"
                onClick={() => setSearch('')}
                className="px-4 font-semibold text-primary bg-primary-subtle hover:bg-primary/20"
              >
                Clear Search
              </Button>
            ) : (
              <Button
                variant="primary"
                size="lg"
                onClick={handleCreate}
                leadingIcon={<IconPlus className="h-4 w-4" />}
                className="px-5 text-xs"
              >
                Author First Plan
              </Button>
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
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Text as="h3" className="font-bold text-base text-text">
                        {p.name}
                      </Text>
                      {p.highlighted && (
                        <Chip tone="primary" size="xs" className="shrink-0">
                          Popular
                        </Chip>
                      )}
                    </div>
                    <Chip
                      tone="neutral"
                      size="xs"
                      className="font-mono text-text-muted rounded-md shrink-0"
                    >
                      Rank {p.rank}
                    </Chip>
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
                        <Chip tone="success" size="xs" className="rounded-md px-1.5">
                          Save {discountPct}%
                        </Chip>
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
                        <li key={i} className="flex items-center gap-2 min-w-0">
                          <IconCheck className="h-3.5 w-3.5 text-primary shrink-0" />
                          <Text>{f}</Text>
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
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleEdit(p)}
                    leadingIcon={<IconEdit className="h-3.5 w-3.5" />}
                    className="font-semibold bg-surface-muted hover:bg-surface rounded-xl"
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPlanToDelete(p)}
                    leadingIcon={<IconTrash className="h-3.5 w-3.5" />}
                    className="font-semibold text-red-600 dark:text-red-400 hover:text-red-600 hover:bg-red-500/10 rounded-xl"
                  >
                    Delete
                  </Button>
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
              <Button
                variant="ghost"
                size="md"
                onClick={() => setPlanToDelete(null)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="md"
                onClick={handleDelete}
                disabled={deleteLoading}
                leadingIcon={deleteLoading ? <IconLoader className="h-4 w-4 animate-spin" /> : undefined}
                className="px-5"
              >
                Confirm Delete
              </Button>
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
