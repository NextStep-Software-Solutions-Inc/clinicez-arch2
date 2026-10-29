import React, { useState, useEffect } from 'react';
import {
  adminService,
  TenantOverridesDto,
  BillingPlan,
  UpdateTenantOverridesPayload,
} from '@/services/admin.service';
import { QUANTITATIVE_LIMITS, CAPABILITY_FLAGS } from './PlanEditorDialog';
import { toast } from 'sonner';
import {
  IconLoader,
  IconCheck,
  IconX,
  IconInfinity,
  IconRefresh,
  IconRotateClockwise,
  IconShieldLock,
  IconAdjustments,
  IconAlertCircle,
} from '@tabler/icons-react';

interface TenantEntitlementsCardProps {
  tenantId: string;
  tenantSlug: string;
  onSaved?: () => void;
  embedded?: boolean;
}

export function TenantEntitlementsCard({
  tenantId,
  tenantSlug,
  onSaved,
  embedded = false,
}: TenantEntitlementsCardProps) {
  const [data, setData] = useState<TenantOverridesDto | null>(null);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [limitOverrides, setLimitOverrides] = useState<Record<string, number | null>>({});
  const [featureOverrides, setFeatureOverrides] = useState<Record<string, boolean | null>>({});
  const [reason, setReason] = useState('');
  const [activeSubTab, setActiveSubTab] = useState<'limits' | 'features'>('limits');

  const loadOverridesAndPlans = async () => {
    try {
      setLoading(true);
      setError(null);
      const [overridesRes, plansRes] = await Promise.all([
        adminService.getTenantOverrides(tenantId),
        adminService.getPlans(),
      ]);
      setData(overridesRes);
      setPlans(plansRes);

      // Initialize limit overrides
      const currentLimits: Record<string, number | null> = {};
      QUANTITATIVE_LIMITS.forEach((l) => {
        if (overridesRes.limits && l.key in overridesRes.limits) {
          currentLimits[l.key] =
            overridesRes.limits[l.key] === null ? -1 : overridesRes.limits[l.key];
        } else {
          currentLimits[l.key] = null; // inheriting default
        }
      });
      setLimitOverrides(currentLimits);

      // Initialize feature overrides
      const currentFeatures: Record<string, boolean | null> = {};
      CAPABILITY_FLAGS.forEach((f) => {
        if (overridesRes.features && overridesRes.features[f.key] !== undefined) {
          currentFeatures[f.key] = overridesRes.features[f.key];
        } else {
          currentFeatures[f.key] = null; // inheriting default
        }
      });
      setFeatureOverrides(currentFeatures);
      setReason(overridesRes.reason || '');
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || 'Failed to load workspace entitlement overrides');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tenantId) {
      loadOverridesAndPlans();
    }
  }, [tenantId]);

  // Current base plan resolution
  const currentPlan = plans.find(
    (p) => p.slug === data?.planSlug || p.name === data?.planName
  );

  const getBaselineLimit = (key: string): number => {
    if (currentPlan?.limits && key in currentPlan.limits) {
      return currentPlan.limits[key];
    }
    const meta = QUANTITATIVE_LIMITS.find((l) => l.key === key);
    return meta ? meta.defaultVal : 0;
  };

  const getBaselineFeature = (key: string): boolean => {
    if (currentPlan?.featuresConfig && key in currentPlan.featuresConfig) {
      return Boolean(currentPlan.featuresConfig[key]);
    }
    const meta = CAPABILITY_FLAGS.find((f) => f.key === key);
    return meta ? meta.defaultVal : false;
  };

  const handleSaveOverrides = async () => {
    if (!reason.trim()) {
      toast.error("An audit reason / authorization reference is required to apply entitlement overrides.");
      return;
    }

    setSaving(true);
    try {
      const payload: UpdateTenantOverridesPayload = {
        limits: {},
        features: {},
        reason: reason.trim(),
      };

      // Only pack non-null overrides
      Object.entries(limitOverrides).forEach(([k, v]) => {
        if (v !== null) {
          payload.limits[k] = v < -1 ? 0 : v;
        }
      });

      Object.entries(featureOverrides).forEach(([k, v]) => {
        if (v !== null) {
          payload.features[k] = v;
        }
      });

      await adminService.updateTenantOverrides(tenantId, payload);
      toast.success('Workspace custom entitlements & overrides updated.');
      if (onSaved) onSaved();
      await loadOverridesAndPlans();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to update overrides');
    } finally {
      setSaving(false);
    }
  };

  const activeOverridesCount =
    Object.values(limitOverrides).filter((v) => v !== null).length +
    Object.values(featureOverrides).filter((v) => v !== null).length;

  return (
    <div className="p-6 rounded-2xl bg-surface border border-border space-y-5 text-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary-subtle text-primary shrink-0">
            <IconAdjustments className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-text">Workspace Entitlement Overrides</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary-subtle text-primary border border-primary/20">
                {activeOverridesCount} Active Overrides
              </span>
            </div>
            <p className="text-[11px] text-text-muted mt-0.5">
              Custom resource ceilings and capability flags for {tenantSlug} (Base Plan:{' '}
              <span className="font-semibold text-text">{data?.planName || 'Standard'}</span>)
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={loadOverridesAndPlans}
          disabled={loading}
          className="p-1.5 rounded-xl text-text-muted hover:text-text hover:bg-surface-muted transition-colors cursor-pointer self-start sm:self-auto"
          title="Reload Overrides"
        >
          <IconRefresh className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* 4-State Rendering */}
      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center gap-2 text-text-muted">
          <IconLoader className="h-5 w-5 animate-spin text-primary" />
          <span>Synchronizing baseline entitlements and registered overrides...</span>
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 space-y-2">
          <div className="font-semibold flex items-center gap-2">
            <IconAlertCircle className="h-4 w-4" />
            <span>Failed to load entitlements</span>
          </div>
          <p>{error}</p>
          <button
            type="button"
            onClick={loadOverridesAndPlans}
            className="px-3 py-1 bg-red-500/20 rounded-lg text-xs font-semibold cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Subtab Navigation */}
          <div className="flex items-center gap-2 border-b border-border pb-px">
            <button
              type="button"
              onClick={() => setActiveSubTab('limits')}
              className={`px-4 py-2 text-xs font-medium transition-colors border-b-2 -mb-px cursor-pointer ${
                activeSubTab === 'limits'
                  ? 'border-primary text-primary font-semibold'
                  : 'border-transparent text-text-muted hover:text-text'
              }`}
            >
              14 Quantitative Limits
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('features')}
              className={`px-4 py-2 text-xs font-medium transition-colors border-b-2 -mb-px cursor-pointer ${
                activeSubTab === 'features'
                  ? 'border-primary text-primary font-semibold'
                  : 'border-transparent text-text-muted hover:text-text'
              }`}
            >
              10 Capability Feature Flags
            </button>
          </div>

          {/* Subtab 1: 14 Limits */}
          {activeSubTab === 'limits' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {QUANTITATIVE_LIMITS.map((lim) => {
                  const Icon = lim.icon;
                  const baseline = getBaselineLimit(lim.key);
                  const overrideVal = limitOverrides[lim.key];
                  const hasOverride = overrideVal !== null && overrideVal !== undefined;
                  const isUnlimited = overrideVal === -1;

                  return (
                    <div
                      key={lim.key}
                      className={`p-3.5 rounded-xl border transition-colors space-y-2.5 ${
                        hasOverride
                          ? 'border-primary/50 bg-primary-subtle/20'
                          : 'border-border bg-surface-muted/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-primary shrink-0" />
                          <span className="font-semibold text-text">{lim.label}</span>
                        </div>
                        {hasOverride ? (
                          <button
                            type="button"
                            onClick={() =>
                              setLimitOverrides((prev) => ({ ...prev, [lim.key]: null }))
                            }
                            className="text-[10px] text-primary hover:underline font-medium cursor-pointer"
                          >
                            Reset to Base
                          </button>
                        ) : (
                          <span className="text-[10px] text-text-muted">Inherits Base</span>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-text-muted">
                        <span>Baseline: {baseline === -1 ? '∞' : baseline}</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setLimitOverrides((prev) => ({
                                ...prev,
                                [lim.key]: isUnlimited ? baseline : -1,
                              }))
                            }
                            className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors cursor-pointer ${
                              isUnlimited
                                ? 'bg-primary text-white font-semibold'
                                : 'bg-surface border border-border text-text hover:text-primary'
                            }`}
                          >
                            {isUnlimited ? 'Unlimited (∞)' : 'Set ∞'}
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={hasOverride ? (overrideVal === -1 ? '' : overrideVal) : baseline}
                          onChange={(e) => {
                            const parsed = parseInt(e.target.value);
                            const val = e.target.value === '' ? null : (parsed < -1 ? 0 : parsed);
                            setLimitOverrides((prev) => ({ ...prev, [lim.key]: val }));
                          }}
                          disabled={isUnlimited}
                          placeholder={isUnlimited ? 'Unlimited (∞)' : String(baseline)}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-border text-text font-mono text-xs focus:outline-hidden disabled:opacity-50"
                        />
                        {lim.unit && (
                          <span className="text-[11px] text-text-muted font-medium">{lim.unit}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Subtab 2: 10 Capability Feature Flags */}
          {activeSubTab === 'features' && (
            <div className="space-y-2.5">
              {CAPABILITY_FLAGS.map((cap) => {
                const Icon = cap.icon;
                const baseline = getBaselineFeature(cap.key);
                const overrideVal = featureOverrides[cap.key];
                const hasOverride = overrideVal !== null && overrideVal !== undefined;
                const effective = hasOverride ? overrideVal : baseline;

                return (
                  <div
                    key={cap.key}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-4 transition-colors ${
                      hasOverride
                        ? 'border-primary/50 bg-primary-subtle/20'
                        : 'border-border bg-surface-muted/50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${
                          effective ? 'bg-primary text-white' : 'bg-surface text-text-muted border border-border'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-semibold text-text flex items-center gap-2">
                          <span>{cap.label}</span>
                          {hasOverride ? (
                            <span className="text-[10px] text-primary font-mono font-medium">
                              (Overridden: {overrideVal ? 'Enabled' : 'Disabled'})
                            </span>
                          ) : (
                            <span className="text-[10px] text-text-muted font-normal">
                              (Base: {baseline ? 'Enabled' : 'Disabled'})
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-text-muted mt-0.5">{cap.description}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {hasOverride && (
                        <button
                          type="button"
                          onClick={() =>
                            setFeatureOverrides((prev) => ({ ...prev, [cap.key]: null }))
                          }
                          className="text-[10px] text-text-muted hover:text-text cursor-pointer pr-1"
                        >
                          Inherit
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setFeatureOverrides((prev) => ({
                            ...prev,
                            [cap.key]: !effective,
                          }))
                        }
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                          effective
                            ? 'bg-primary text-white'
                            : 'bg-surface border border-border text-text hover:bg-surface-muted'
                        }`}
                      >
                        {effective ? 'Enabled' : 'Disabled'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Audit Authorization Reason Input */}
          <div className="pt-3 border-t border-border space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-text flex items-center gap-1.5">
                <IconShieldLock className="h-4 w-4 text-primary" />
                <span>Audit Authorization Reason (Mandatory)</span>
              </label>
              <span className="text-[10px] text-text-muted">Recorded in immutable audit trail</span>
            </div>
            <input
              type="text"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Enterprise pilot agreement signed on 2026-10-28 (Ref #AGR-4910)"
              className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text focus:outline-hidden"
            />
          </div>

          {/* Save Button */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleSaveOverrides}
              disabled={saving || !reason.trim()}
              className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded-xl transition-colors cursor-pointer shadow-xs disabled:opacity-50"
            >
              {saving && <IconLoader className="h-4 w-4 animate-spin" />}
              <span>Save Workspace Entitlements</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
