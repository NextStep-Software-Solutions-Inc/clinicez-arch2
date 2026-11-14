import React, { useState, useEffect } from 'react';
import {
  adminService,
  TenantOverridesDto,
  BillingPlan,
  UpdateTenantOverridesPayload,
  AdminTeleconsultBillingDto,
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
  IconVideo,
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
  const [activeSubTab, setActiveSubTab] = useState<'limits' | 'features' | 'teleconsult'>('limits');

  // Teleconsultation PAYG Billing state
  const [teleconsultBilling, setTeleconsultBilling] = useState<AdminTeleconsultBillingDto | null>(null);
  const [tcEnabled, setTcEnabled] = useState(false);
  const [tcBillingMode, setTcBillingMode] = useState<'Prepaid' | 'Postpaid'>('Postpaid');
  const [tcRatePerMinute, setTcRatePerMinute] = useState(5.00);
  const [tcAllocatedBudget, setTcAllocatedBudget] = useState(0);
  const [tcAllowOverage, setTcAllowOverage] = useState(true);
  const [tcCreditGrantInput, setTcCreditGrantInput] = useState('');
  const [savingTc, setSavingTc] = useState(false);
  const [grantingCredit, setGrantingCredit] = useState(false);

  const loadOverridesAndPlans = async () => {
    try {
      setLoading(true);
      setError(null);
      const [overridesRes, plansRes, tcRes] = await Promise.all([
        adminService.getTenantOverrides(tenantId),
        adminService.getPlans(),
        adminService.getTenantTeleconsultBilling(tenantId).catch(() => null),
      ]);
      setData(overridesRes);
      setPlans(plansRes);
      if (tcRes) {
        setTeleconsultBilling(tcRes);
        setTcEnabled(Boolean(tcRes.isEnabled));
        setTcBillingMode(tcRes.billingMode === 'Prepaid' ? 'Prepaid' : 'Postpaid');
        setTcRatePerMinute(tcRes.ratePerMinutePhp ?? 5.00);
        setTcAllocatedBudget(tcRes.allocatedBudgetPhp ?? 0);
        setTcAllowOverage(tcRes.allowOverageBeyondAllocation ?? true);
      }

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
    if (data?.baselineLimits && key in data.baselineLimits) {
      const val = data.baselineLimits[key];
      return val === null ? -1 : val;
    }
    if (currentPlan?.limits && key in currentPlan.limits) {
      return currentPlan.limits[key];
    }
    const meta = QUANTITATIVE_LIMITS.find((l) => l.key === key);
    return meta ? meta.defaultVal : 0;
  };

  const getBaselineFeature = (key: string): boolean => {
    if (Array.isArray(data?.baselineFeatures) && data.baselineFeatures.length > 0) {
      return data.baselineFeatures.includes(key);
    }
    if (Array.isArray(currentPlan?.enabledFeatures)) {
      return currentPlan.enabledFeatures.includes(key);
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

  const handleSaveTeleconsultBilling = async () => {
    setSavingTc(true);
    try {
      const updated = await adminService.updateTenantTeleconsultBilling(tenantId, {
        isEnabled: tcEnabled,
        billingMode: tcBillingMode,
        ratePerMinutePhp: tcRatePerMinute,
        allocatedBudgetPhp: tcAllocatedBudget,
        allowOverageBeyondAllocation: tcAllowOverage,
      });
      setTeleconsultBilling(updated);
      setTcEnabled(Boolean(updated.isEnabled));
      setTcBillingMode(updated.billingMode === 'Prepaid' ? 'Prepaid' : 'Postpaid');
      setTcRatePerMinute(updated.ratePerMinutePhp ?? 5.00);
      setTcAllocatedBudget(updated.allocatedBudgetPhp ?? 0);
      setTcAllowOverage(updated.allowOverageBeyondAllocation ?? true);
      toast.success('Workspace teleconsultation billing settings updated.');
      if (onSaved) onSaved();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to update teleconsultation billing');
    } finally {
      setSavingTc(false);
    }
  };

  const handleGrantCredit = async () => {
    const amount = parseFloat(tcCreditGrantInput);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid positive credit grant amount.');
      return;
    }

    setGrantingCredit(true);
    try {
      const updated = await adminService.updateTenantTeleconsultBilling(tenantId, {
        prepaidCreditGrantPhp: amount,
      });
      setTeleconsultBilling(updated);
      setTcCreditGrantInput('');
      toast.success(`Granted ₱${amount.toLocaleString()} prepaid credit to workspace.`);
      if (onSaved) onSaved();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to grant prepaid credit');
    } finally {
      setGrantingCredit(false);
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
              <span className="font-semibold text-text">{data?.planName || data?.planSlug || 'Unassigned'}</span>)
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
            <button
              type="button"
              onClick={() => setActiveSubTab('teleconsult')}
              className={`px-4 py-2 text-xs font-medium transition-colors border-b-2 -mb-px cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'teleconsult'
                  ? 'border-primary text-primary font-semibold'
                  : 'border-transparent text-text-muted hover:text-text'
              }`}
            >
              <IconVideo className="h-3.5 w-3.5" />
              <span>Teleconsult PAYG Billing</span>
              {teleconsultBilling?.isEnabled && (
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              )}
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

          {/* Subtab 3: Teleconsultation PAYG Billing */}
          {activeSubTab === 'teleconsult' && (
            <div className="space-y-4">
              {/* Activation & Mode Card */}
              <div className="p-4 rounded-xl border border-border bg-surface-muted/40 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-text flex items-center gap-2">
                      <IconVideo className="h-4 w-4 text-primary" />
                      <span>Teleconsultation PAYG Enablement</span>
                    </div>
                    <p className="text-[11px] text-text-muted mt-0.5">
                      Master platform toggle for this tenant workspace. Turning this off locks video teleconsultation across all facilities.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTcEnabled((prev) => !prev)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      tcEnabled
                        ? 'bg-primary text-white'
                        : 'bg-surface border border-border text-text hover:bg-surface-muted'
                    }`}
                  >
                    {tcEnabled ? 'Active (Enabled)' : 'Disabled'}
                  </button>
                </div>

                <div className="pt-3 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-text">Billing Mode:</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setTcBillingMode('Postpaid')}
                      className={`px-3 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                        tcBillingMode === 'Postpaid'
                          ? 'bg-primary text-white font-semibold'
                          : 'bg-surface border border-border text-text hover:bg-surface-muted'
                      }`}
                    >
                      Postpaid Metered
                    </button>
                    <button
                      type="button"
                      onClick={() => setTcBillingMode('Prepaid')}
                      className={`px-3 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                        tcBillingMode === 'Prepaid'
                          ? 'bg-primary text-white font-semibold'
                          : 'bg-surface border border-border text-text hover:bg-surface-muted'
                      }`}
                    >
                      Prepaid Credits
                    </button>
                  </div>
                </div>
              </div>

              {/* Rate & Budget Configuration */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Per-Tenant Per-Minute Rate */}
                <div className="p-3.5 rounded-xl border border-border bg-surface-muted/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-text">Per-Minute Rate (₱)</span>
                    <span className="text-[10px] text-text-muted font-mono">Platform Standard: ₱5.00</span>
                  </div>
                  <input
                    type="number"
                    min="0.01"
                    step="0.50"
                    value={tcRatePerMinute}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setTcRatePerMinute(isNaN(val) || val <= 0 ? 0.01 : val);
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-border text-text font-mono text-xs focus:outline-hidden"
                  />
                  <p className="text-[11px] text-text-muted">
                    Custom rate charged per metered call minute for this workspace.
                  </p>
                </div>

                {/* Monthly Cost Allocation Budget */}
                <div className="p-3.5 rounded-xl border border-border bg-surface-muted/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-text">Monthly Budget Cap (₱)</span>
                    <span className="text-[10px] text-text-muted font-mono">
                      {tcAllocatedBudget > 0 ? `~${Math.floor(tcAllocatedBudget / tcRatePerMinute)} mins` : 'Uncapped'}
                    </span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={tcAllocatedBudget}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setTcAllocatedBudget(isNaN(val) || val < 0 ? 0 : val);
                    }}
                    placeholder="0 (Uncapped)"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-border text-text font-mono text-xs focus:outline-hidden"
                  />
                  <p className="text-[11px] text-text-muted">
                    Target monthly allocation in PHP. Set to 0 for unlimited postpaid usage.
                  </p>
                </div>
              </div>

              {/* Prepaid Credit Grant (Additive +=) */}
              <div className="p-4 rounded-xl border border-border bg-surface space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-2.5">
                  <div>
                    <span className="font-semibold text-text">Prepaid Minute Credit Grant (₱)</span>
                    <p className="text-[11px] text-text-muted">
                      SuperAdmins can grant complimentary or promotional credit balance directly.
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-text-muted uppercase">Current Balance</span>
                    <div className="text-sm font-bold font-mono text-text">
                      ₱{(teleconsultBilling?.prepaidBalancePhp ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    step="50"
                    value={tcCreditGrantInput}
                    onChange={(e) => setTcCreditGrantInput(e.target.value)}
                    placeholder="Enter grant amount (₱) to add"
                    className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono text-xs focus:outline-hidden"
                  />
                  <button
                    type="button"
                    disabled={grantingCredit || !tcCreditGrantInput || parseFloat(tcCreditGrantInput) <= 0}
                    onClick={handleGrantCredit}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-primary hover:bg-primary-hover transition-colors shrink-0 disabled:opacity-50 cursor-pointer"
                  >
                    {grantingCredit ? <IconLoader className="h-4 w-4 animate-spin" /> : 'Grant Credit (+=)'}
                  </button>
                </div>
                <p className="text-[11px] text-text-muted">
                  Note: Credit grants are additive (<code className="font-mono">+=</code>) and increment the tenant's current prepaid balance.
                </p>
              </div>

              {/* Overage Policy & Cutoff Protection */}
              <div className="p-3.5 rounded-xl border border-border bg-surface-muted/30 flex items-start gap-3">
                <input
                  type="checkbox"
                  id="tc-allow-overage"
                  checked={tcAllowOverage}
                  onChange={(e) => setTcAllowOverage(e.target.checked)}
                  className="mt-0.5 rounded border-border"
                />
                <div className="space-y-0.5">
                  <label htmlFor="tc-allow-overage" className="font-semibold text-text cursor-pointer">
                    Allow Overage Beyond Allocation
                  </label>
                  <p className="text-[11px] text-text-muted">
                    When checked, ongoing clinical teleconsultations are never terminated mid-call if allocation is reached; overage minutes are recorded and billed separately.
                  </p>
                </div>
              </div>

              {/* Telemetry Summary */}
              <div className="p-3.5 rounded-xl border border-border bg-surface space-y-2">
                <span className="font-semibold text-text">
                  Usage Telemetry ({teleconsultBilling?.currentPeriodYearMonth || 'Current Period'})
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  <div className="p-2 rounded-lg bg-surface-muted border border-border">
                    <span className="text-[10px] text-text-muted block">Minutes Used</span>
                    <span className="text-xs font-bold font-mono text-text">
                      {teleconsultBilling?.currentPeriodMinutesUsed ?? 0}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-surface-muted border border-border">
                    <span className="text-[10px] text-text-muted block">Amount Billed</span>
                    <span className="text-xs font-bold font-mono text-text">
                      ₱{(teleconsultBilling?.currentPeriodBilledPhp ?? 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-surface-muted border border-border">
                    <span className="text-[10px] text-text-muted block">Overage Billed</span>
                    <span className="text-xs font-bold font-mono text-amber-600 dark:text-amber-400">
                      ₱{(teleconsultBilling?.currentPeriodOveragePhp ?? 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-surface-muted border border-border">
                    <span className="text-[10px] text-text-muted block">Available Minutes</span>
                    <span className="text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400">
                      {teleconsultBilling?.estimatedAvailableMinutes === 2147483647
                        ? '∞ (Uncapped Postpaid)'
                        : (teleconsultBilling?.estimatedAvailableMinutes ?? 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Save Teleconsultation Settings Button */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleSaveTeleconsultBilling}
                  disabled={savingTc}
                  className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded-xl transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {savingTc && <IconLoader className="h-4 w-4 animate-spin" />}
                  <span>Save Teleconsultation Settings</span>
                </button>
              </div>
            </div>
          )}

          {/* Audit Authorization Reason Input & Save Button for Limits & Feature Overrides */}
          {activeSubTab !== 'teleconsult' && (
            <>
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
