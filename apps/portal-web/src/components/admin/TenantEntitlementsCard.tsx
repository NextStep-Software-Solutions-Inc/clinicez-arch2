"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  adminService,
  TenantOverridesDto,
  BillingPlan,
  UpdateTenantOverridesPayload
} from "@/services/admin.service";
import { QUANTITATIVE_LIMITS, CAPABILITY_FLAGS } from "./PlanEditorDialog";
import {
  IconLoader,
  IconCheck,
  IconX,
  IconInfinity,
  IconRefresh,
  IconRotateClockwise,
  IconHistory,
  IconShieldLock,
  IconSparkles,
  IconStack,
  IconAdjustments
} from "@tabler/icons-react";

interface TenantEntitlementsCardProps {
  tenantId: string;
  tenantSlug: string;
  onSaved?: () => void;
  embedded?: boolean;
}

export function TenantEntitlementsCard({ tenantId, tenantSlug, onSaved, embedded = false }: TenantEntitlementsCardProps) {
  const [data, setData] = useState<TenantOverridesDto | null>(null);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  // limits: key -> number | null (null means inherit baseline plan default)
  const [limitOverrides, setLimitOverrides] = useState<Record<string, number | null>>({});
  // features: key -> boolean | null (null means inherit baseline plan default)
  const [featureOverrides, setFeatureOverrides] = useState<Record<string, boolean | null>>({});
  const [reason, setReason] = useState("");
  const [activeSubTab, setActiveSubTab] = useState<"limits" | "features">("limits");

  const loadOverridesAndPlans = async () => {
    try {
      setLoading(true);
      setError(null);
      const [overridesRes, plansRes] = await Promise.all([
        adminService.getTenantOverrides(tenantId),
        adminService.getPlans()
      ]);
      setData(overridesRes);
      setPlans(plansRes);

      // Initialize limit overrides
      const currentLimits: Record<string, number | null> = {};
      QUANTITATIVE_LIMITS.forEach(l => {
        if (overridesRes.limits && l.key in overridesRes.limits) {
          currentLimits[l.key] = overridesRes.limits[l.key] === null ? -1 : overridesRes.limits[l.key];
        } else {
          currentLimits[l.key] = null; // inheriting default
        }
      });
      setLimitOverrides(currentLimits);

      // Initialize feature overrides
      const currentFeatures: Record<string, boolean | null> = {};
      CAPABILITY_FLAGS.forEach(f => {
        if (overridesRes.features && overridesRes.features[f.key] !== undefined) {
          currentFeatures[f.key] = overridesRes.features[f.key];
        } else {
          currentFeatures[f.key] = null; // inheriting default
        }
      });
      setFeatureOverrides(currentFeatures);
      setReason(overridesRes.reason || "");
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || "Failed to load workspace entitlement overrides");
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
  const currentPlan = plans.find(p => p.slug === data?.planSlug || p.name === data?.planName);

  const getBaselineLimit = (key: string): number => {
    if (!currentPlan?.limits) return 0;
    return currentPlan.limits[key] ?? 0;
  };

  const getBaselineFeature = (key: string): boolean => {
    if (!currentPlan?.enabledFeatures) return false;
    return currentPlan.enabledFeatures.includes(key);
  };

  const handleSetLimitOverride = (key: string, value: number | null) => {
    setLimitOverrides(prev => ({ ...prev, [key]: value }));
  };

  const handleSetFeatureOverride = (key: string, value: boolean | null) => {
    setFeatureOverrides(prev => ({ ...prev, [key]: value }));
  };

  const handleResetAllToBaseline = () => {
    const clearedLimits: Record<string, number | null> = {};
    QUANTITATIVE_LIMITS.forEach(l => {
      clearedLimits[l.key] = null;
    });
    setLimitOverrides(clearedLimits);

    const clearedFeatures: Record<string, boolean | null> = {};
    CAPABILITY_FLAGS.forEach(f => {
      clearedFeatures[f.key] = null;
    });
    setFeatureOverrides(clearedFeatures);
    toast.info("All overrides cleared to plan baseline. Click Save to persist.");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      toast.error("An audit reason / authorization reference is required to apply entitlement overrides.");
      return;
    }

    try {
      setSaving(true);

      // Filter limits: only pass non-null overrides and sanitize values below -1
      const activeLimits: Record<string, number | null> = {};
      Object.entries(limitOverrides).forEach(([k, v]) => {
        if (v !== null) {
          activeLimits[k] = v < -1 ? 0 : v;
        }
      });

      // Filter features: only pass boolean overrides
      const activeFeatures: Record<string, boolean> = {};
      Object.entries(featureOverrides).forEach(([k, v]) => {
        if (v !== null) {
          activeFeatures[k] = v;
        }
      });

      const payload: UpdateTenantOverridesPayload = {
        limits: activeLimits,
        features: activeFeatures,
        reason: reason.trim() || undefined
      };

      const updated = await adminService.updateTenantOverrides(tenantId, payload);
      setData(updated);
      toast.success("Workspace entitlement overrides saved and licenses re-staged.");
      onSaved?.();
      loadOverridesAndPlans();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err.message || "Failed to update workspace entitlement overrides");
    } finally {
      setSaving(false);
    }
  };

  const activeOverridesCount =
    Object.values(limitOverrides).filter(v => v !== null).length +
    Object.values(featureOverrides).filter(v => v !== null).length;

  if (loading) {
    return (
      <Card className="rounded-3xl border-border bg-card p-8">
        <div className="flex flex-col items-center justify-center py-10 gap-3">
          <IconLoader className="h-8 w-8 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground animate-pulse">Loading workspace entitlement overrides...</p>
        </div>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="rounded-3xl border-destructive/20 bg-destructive/5 p-6 text-destructive">
        <div className="flex items-center gap-3">
          <IconShieldLock className="h-6 w-6 shrink-0" />
          <div>
            <h4 className="text-sm font-bold">Failed to Load Entitlement Overrides</h4>
            <p className="text-xs opacity-90 mt-0.5">{error || "Could not retrieve entitlement configuration"}</p>
          </div>
          <Button onClick={loadOverridesAndPlans} variant="outline" size="sm" className="ml-auto text-xs rounded-xl">
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  if (embedded) {
    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        {/* Header summary */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-muted/20 border border-border">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <IconAdjustments className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-foreground">
                  Workspace Entitlement Overrides
                </h3>
                <Badge variant="outline" className="text-xs font-mono font-bold border-border bg-muted/40">
                  Version {data.entitlementVersion}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Current Plan: <strong className="text-foreground">{data.planName || data.planSlug || "Custom"}</strong>.
                Custom overrides supersede base plan limits and re-issue cryptographic facility licenses.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeOverridesCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleResetAllToBaseline}
                className="rounded-xl text-xs font-bold text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <IconRotateClockwise className="h-3.5 w-3.5 mr-1" />
                Reset to Plan Default
              </Button>
            )}
            <Badge className="bg-primary/10 text-primary border-primary/20 text-xs font-bold px-3 py-1">
              {activeOverridesCount} Active {activeOverridesCount === 1 ? "Override" : "Overrides"}
            </Badge>
          </div>
        </div>

        {/* Sub-tab Switcher */}
        <div className="flex items-center gap-2 border-b border-border">
          <button
            type="button"
            onClick={() => setActiveSubTab("limits")}
            className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === "limits"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <IconStack className="h-4 w-4" />
            Quantitative Limits ({QUANTITATIVE_LIMITS.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab("features")}
            className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === "features"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <IconSparkles className="h-4 w-4" />
            Capability Feature Flags ({CAPABILITY_FLAGS.length})
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {/* TAB 1: QUANTITATIVE LIMITS */}
          {activeSubTab === "limits" && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="p-3.5 rounded-xl bg-muted/40 border border-border text-xs text-muted-foreground flex items-center justify-between">
                <span>
                  Adjust ceilings for this workspace. Set <strong>Unlimited (-1)</strong>, a custom number, or <strong>Inherit</strong> to use plan baseline.
                </span>
                <span className="font-bold text-foreground">
                  Baseline Plan: {data.planName || data.planSlug || "None"}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {QUANTITATIVE_LIMITS.map((limitDef) => {
                  const baselineVal = getBaselineLimit(limitDef.key);
                  const overrideVal = limitOverrides[limitDef.key];
                  const hasOverride = overrideVal !== null && overrideVal !== undefined;

                  return (
                    <div
                      key={limitDef.key}
                      className={`p-3.5 rounded-2xl border transition-all ${
                        hasOverride
                          ? "bg-primary/5 border-primary/30"
                          : "bg-card border-border hover:border-input"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-foreground">{limitDef.label}</span>
                            {hasOverride ? (
                              <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] font-bold px-1.5 py-0">
                                Overridden
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="border-border text-muted-foreground text-[10px] px-1.5 py-0">
                                Plan Default
                              </Badge>
                            )}
                          </div>
                          <code className="text-[10px] font-mono text-muted-foreground">{limitDef.key}</code>
                        </div>

                        <div className="text-right">
                          <span className="text-[10px] text-muted-foreground block">Plan Base</span>
                          <span className="text-xs font-mono font-bold text-foreground">
                            {baselineVal === -1 ? "Unlimited" : baselineVal.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {/* Controls */}
                      <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border/60">
                        <Button
                          type="button"
                          size="sm"
                          variant={!hasOverride ? "secondary" : "outline"}
                          onClick={() => handleSetLimitOverride(limitDef.key, null)}
                          className={`h-7 px-2.5 text-[11px] font-bold rounded-lg cursor-pointer ${
                            !hasOverride ? "bg-muted text-foreground font-bold" : "border-border text-muted-foreground"
                          }`}
                        >
                          Inherit
                        </Button>

                        <Button
                          type="button"
                          size="sm"
                          variant={overrideVal === -1 ? "default" : "outline"}
                          onClick={() => handleSetLimitOverride(limitDef.key, -1)}
                          className={`h-7 px-2.5 text-[11px] font-bold rounded-lg cursor-pointer ${
                            overrideVal === -1 ? "bg-primary text-primary-foreground" : "border-border text-muted-foreground"
                          }`}
                        >
                          <IconInfinity className="h-3.5 w-3.5 mr-1" />
                          Unlimited
                        </Button>

                        <div className="relative flex-1">
                          <input
                            type="number"
                            min="0"
                            placeholder={baselineVal === -1 ? "Unlimited" : String(baselineVal)}
                            value={hasOverride && overrideVal !== -1 ? overrideVal : ""}
                            onChange={(e) => {
                              const parsed = parseInt(e.target.value);
                              if (isNaN(parsed)) {
                                handleSetLimitOverride(limitDef.key, null);
                              } else if (parsed < -1) {
                                handleSetLimitOverride(limitDef.key, 0);
                              } else {
                                handleSetLimitOverride(limitDef.key, parsed);
                              }
                            }}
                            className={`w-full h-7 px-2.5 text-xs font-mono font-bold rounded-lg border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary ${
                              hasOverride && overrideVal !== -1
                                ? "border-primary/50 text-primary"
                                : "border-input placeholder:text-muted-foreground"
                            }`}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: CAPABILITY FLAGS */}
          {activeSubTab === "features" && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="p-3.5 rounded-xl bg-muted/40 border border-border text-xs text-muted-foreground flex items-center justify-between">
                <span>
                  Explicitly grant or revoke capability features for this workspace, or leave as <strong>Inherit</strong>.
                </span>
                <span className="font-bold text-foreground">
                  Baseline Plan: {data.planName || data.planSlug || "None"}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {CAPABILITY_FLAGS.map((feat) => {
                  const baselineState = getBaselineFeature(feat.key);
                  const overrideState = featureOverrides[feat.key];
                  const hasOverride = overrideState !== null && overrideState !== undefined;

                  return (
                    <div
                      key={feat.key}
                      className={`p-3.5 rounded-2xl border transition-all ${
                        hasOverride
                          ? "bg-primary/5 border-primary/30"
                          : "bg-card border-border hover:border-input"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-foreground">{feat.label}</span>
                            {hasOverride ? (
                              <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] font-bold px-1.5 py-0">
                                Overridden
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="border-border text-muted-foreground text-[10px] px-1.5 py-0">
                                Plan Default
                              </Badge>
                            )}
                          </div>
                          <code className="text-[10px] font-mono text-muted-foreground">{feat.key}</code>
                        </div>

                        <div className="text-right">
                          <span className="text-[10px] text-muted-foreground block">Plan Base</span>
                          <span className={`text-[11px] font-bold ${baselineState ? "text-primary" : "text-muted-foreground"}`}>
                            {baselineState ? "Enabled" : "Disabled"}
                          </span>
                        </div>
                      </div>

                      <p className="text-[11px] text-muted-foreground mt-1 mb-2 line-clamp-1">
                        {feat.description}
                      </p>

                      <div className="flex items-center gap-1.5 pt-2 border-t border-border/60">
                        <Button
                          type="button"
                          size="sm"
                          variant={!hasOverride ? "secondary" : "outline"}
                          onClick={() => handleSetFeatureOverride(feat.key, null)}
                          className={`flex-1 h-7 text-[11px] font-bold rounded-lg cursor-pointer ${
                            !hasOverride ? "bg-muted text-foreground font-bold" : "border-border text-muted-foreground"
                          }`}
                        >
                          Inherit Base
                        </Button>

                        <Button
                          type="button"
                          size="sm"
                          variant={overrideState === true ? "default" : "outline"}
                          onClick={() => handleSetFeatureOverride(feat.key, true)}
                          className={`flex-1 h-7 text-[11px] font-bold rounded-lg cursor-pointer ${
                            overrideState === true
                              ? "bg-primary text-primary-foreground"
                              : "border-border text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <IconCheck className="h-3.5 w-3.5 mr-1" />
                          Force Grant
                        </Button>

                        <Button
                          type="button"
                          size="sm"
                          variant={overrideState === false ? "destructive" : "outline"}
                          onClick={() => handleSetFeatureOverride(feat.key, false)}
                          className={`flex-1 h-7 text-[11px] font-bold rounded-lg cursor-pointer ${
                            overrideState === false
                              ? "bg-destructive text-destructive-foreground"
                              : "border-border text-muted-foreground hover:text-destructive"
                          }`}
                        >
                          <IconX className="h-3.5 w-3.5 mr-1" />
                          Force Revoke
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Audit Reason & History */}
          <div className="space-y-2 p-4 rounded-2xl bg-muted/20 border border-border">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
              Audit Reason / Authorization Reference <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Enterprise pilot expansion agreement, SLA addendum signed by Regional Director"
              className="w-full h-10 px-3.5 text-xs rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {data.updatedAt && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1 pt-1">
                <IconHistory className="h-3.5 w-3.5" />
                Last overridden on {new Date(data.updatedAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit"
                })}
              </p>
            )}
          </div>

          <div className="pt-4 border-t border-border flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              Saving updates increments the workspace entitlement version and triggers immediate license re-issuance.
            </div>
            <Button
              type="submit"
              disabled={saving || !reason.trim()}
              className="rounded-xl text-xs font-bold px-6 bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer shadow-md"
            >
              {saving ? (
                <>
                  <IconLoader className="h-4 w-4 animate-spin mr-1.5" />
                  Saving Overrides...
                </>
              ) : (
                <>
                  <IconCheck className="h-4 w-4 mr-1.5" />
                  Save Entitlement Overrides
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <Card className="rounded-3xl border-border bg-card shadow-xs overflow-hidden">
      {/* Header */}
      <CardHeader className="p-6 border-b border-border bg-muted/10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <IconAdjustments className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-bold text-foreground">
                  Workspace Entitlement Overrides
                </CardTitle>
                <Badge variant="outline" className="text-xs font-mono font-bold border-border bg-muted/40">
                  Version {data.entitlementVersion}
                </Badge>
              </div>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Current Plan: <strong className="text-foreground">{data.planName || data.planSlug || "Custom"}</strong>.
                Custom overrides supersede base plan limits and re-issue cryptographic facility licenses.
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeOverridesCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleResetAllToBaseline}
                className="rounded-xl text-xs font-bold text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <IconRotateClockwise className="h-3.5 w-3.5 mr-1" />
                Reset All to Plan Default
              </Button>
            )}
            <Badge className="bg-primary/10 text-primary border-primary/20 text-xs font-bold px-3 py-1">
              {activeOverridesCount} Active {activeOverridesCount === 1 ? "Override" : "Overrides"}
            </Badge>
          </div>
        </div>

        {/* Sub-tab Switcher */}
        <div className="flex items-center gap-2 mt-4 border-b border-border/60">
          <button
            type="button"
            onClick={() => setActiveSubTab("limits")}
            className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === "limits"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <IconStack className="h-4 w-4" />
            Quantitative Limits ({QUANTITATIVE_LIMITS.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab("features")}
            className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === "features"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <IconSparkles className="h-4 w-4" />
            Capability Feature Flags ({CAPABILITY_FLAGS.length})
          </button>
        </div>
      </CardHeader>

      <form onSubmit={handleSave}>
        <CardContent className="p-6 space-y-6">
          {/* TAB 1: QUANTITATIVE LIMITS */}
          {activeSubTab === "limits" && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="p-3.5 rounded-xl bg-muted/40 border border-border text-xs text-muted-foreground flex items-center justify-between">
                <span>
                  Adjust ceilings for this workspace. Set <strong>Unlimited (-1)</strong>, a custom number, or <strong>Inherit</strong> to use plan baseline.
                </span>
                <span className="font-bold text-foreground">
                  Baseline Plan: {data.planName || data.planSlug || "None"}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {QUANTITATIVE_LIMITS.map((limitDef) => {
                  const baselineVal = getBaselineLimit(limitDef.key);
                  const overrideVal = limitOverrides[limitDef.key];
                  const hasOverride = overrideVal !== null && overrideVal !== undefined;
                  const effectiveVal = data.effectiveLimits?.[limitDef.key] ?? (hasOverride ? overrideVal : baselineVal);

                  return (
                    <div
                      key={limitDef.key}
                      className={`p-3.5 rounded-2xl border transition-all ${
                        hasOverride
                          ? "bg-primary/5 border-primary/30"
                          : "bg-card border-border hover:border-input"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-foreground">{limitDef.label}</span>
                            {hasOverride ? (
                              <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] font-bold px-1.5 py-0">
                                Overridden
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="border-border text-muted-foreground text-[10px] px-1.5 py-0">
                                Plan Default
                              </Badge>
                            )}
                          </div>
                          <code className="text-[10px] font-mono text-muted-foreground">{limitDef.key}</code>
                        </div>

                        <div className="text-right">
                          <span className="text-[10px] text-muted-foreground block">Plan Base</span>
                          <span className="text-xs font-mono font-bold text-foreground">
                            {baselineVal === -1 ? "Unlimited" : baselineVal.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {/* Controls */}
                      <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border/60">
                        {/* Inherit Button */}
                        <Button
                          type="button"
                          size="sm"
                          variant={!hasOverride ? "secondary" : "outline"}
                          onClick={() => handleSetLimitOverride(limitDef.key, null)}
                          className={`h-7 px-2.5 text-[11px] font-bold rounded-lg cursor-pointer ${
                            !hasOverride ? "bg-muted text-foreground font-bold" : "border-border text-muted-foreground"
                          }`}
                        >
                          Inherit
                        </Button>

                        {/* Unlimited Button */}
                        <Button
                          type="button"
                          size="sm"
                          variant={overrideVal === -1 ? "default" : "outline"}
                          onClick={() => handleSetLimitOverride(limitDef.key, -1)}
                          className={`h-7 px-2.5 text-[11px] font-bold rounded-lg cursor-pointer ${
                            overrideVal === -1 ? "bg-primary text-primary-foreground" : "border-border text-muted-foreground"
                          }`}
                        >
                          <IconInfinity className="h-3.5 w-3.5 mr-1" />
                          Unlimited
                        </Button>

                        {/* Custom Numeric Input */}
                        <div className="relative flex-1">
                          <input
                            type="number"
                            min="0"
                            placeholder={baselineVal === -1 ? "Unlimited" : String(baselineVal)}
                            value={hasOverride && overrideVal !== -1 ? overrideVal : ""}
                            onChange={(e) => {
                              const parsed = parseInt(e.target.value);
                              if (isNaN(parsed)) {
                                handleSetLimitOverride(limitDef.key, null);
                              } else if (parsed < -1) {
                                handleSetLimitOverride(limitDef.key, 0);
                              } else {
                                handleSetLimitOverride(limitDef.key, parsed);
                              }
                            }}
                            className={`w-full h-7 px-2.5 text-xs font-mono font-bold rounded-lg border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary ${
                              hasOverride && overrideVal !== -1
                                ? "border-primary/50 text-primary"
                                : "border-input placeholder:text-muted-foreground"
                            }`}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: CAPABILITY FLAGS */}
          {activeSubTab === "features" && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="p-3.5 rounded-xl bg-muted/40 border border-border text-xs text-muted-foreground flex items-center justify-between">
                <span>
                  Explicitly grant or revoke capability features for this workspace, or leave as <strong>Inherit</strong>.
                </span>
                <span className="font-bold text-foreground">
                  Baseline Plan: {data.planName || data.planSlug || "None"}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {CAPABILITY_FLAGS.map((feat) => {
                  const baselineState = getBaselineFeature(feat.key);
                  const overrideState = featureOverrides[feat.key];
                  const hasOverride = overrideState !== null && overrideState !== undefined;
                  const effectiveState = data.effectiveFeatures?.includes(feat.key) ?? (hasOverride ? overrideState : baselineState);

                  return (
                    <div
                      key={feat.key}
                      className={`p-3.5 rounded-2xl border transition-all ${
                        hasOverride
                          ? "bg-primary/5 border-primary/30"
                          : "bg-card border-border hover:border-input"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-foreground">{feat.label}</span>
                            {hasOverride ? (
                              <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] font-bold px-1.5 py-0">
                                Overridden
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="border-border text-muted-foreground text-[10px] px-1.5 py-0">
                                Plan Default
                              </Badge>
                            )}
                          </div>
                          <code className="text-[10px] font-mono text-muted-foreground">{feat.key}</code>
                        </div>

                        <div className="text-right">
                          <span className="text-[10px] text-muted-foreground block">Plan Base</span>
                          <span className={`text-[11px] font-bold ${baselineState ? "text-primary" : "text-muted-foreground"}`}>
                            {baselineState ? "Enabled" : "Disabled"}
                          </span>
                        </div>
                      </div>

                      <p className="text-[11px] text-muted-foreground mt-1 mb-2 line-clamp-1">
                        {feat.description}
                      </p>

                      {/* Tri-state Controls: Inherit | Force Enable | Force Revoke */}
                      <div className="flex items-center gap-1.5 pt-2 border-t border-border/60">
                        <Button
                          type="button"
                          size="sm"
                          variant={!hasOverride ? "secondary" : "outline"}
                          onClick={() => handleSetFeatureOverride(feat.key, null)}
                          className={`flex-1 h-7 text-[11px] font-bold rounded-lg cursor-pointer ${
                            !hasOverride ? "bg-muted text-foreground font-bold" : "border-border text-muted-foreground"
                          }`}
                        >
                          Inherit Base
                        </Button>

                        <Button
                          type="button"
                          size="sm"
                          variant={overrideState === true ? "default" : "outline"}
                          onClick={() => handleSetFeatureOverride(feat.key, true)}
                          className={`flex-1 h-7 text-[11px] font-bold rounded-lg cursor-pointer ${
                            overrideState === true
                              ? "bg-primary text-primary-foreground"
                              : "border-border text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <IconCheck className="h-3.5 w-3.5 mr-1" />
                          Force Grant
                        </Button>

                        <Button
                          type="button"
                          size="sm"
                          variant={overrideState === false ? "destructive" : "outline"}
                          onClick={() => handleSetFeatureOverride(feat.key, false)}
                          className={`flex-1 h-7 text-[11px] font-bold rounded-lg cursor-pointer ${
                            overrideState === false
                              ? "bg-destructive text-destructive-foreground"
                              : "border-border text-muted-foreground hover:text-destructive"
                          }`}
                        >
                          <IconX className="h-3.5 w-3.5 mr-1" />
                          Force Revoke
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Audit Reason & History */}
          <div className="space-y-2 p-4 rounded-2xl bg-muted/20 border border-border">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
              Audit Reason / Authorization Reference <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Enterprise pilot expansion agreement, SLA addendum signed by Regional Director"
              className="w-full h-10 px-3.5 text-xs rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {data.updatedAt && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1 pt-1">
                <IconHistory className="h-3.5 w-3.5" />
                Last overridden on {new Date(data.updatedAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit"
                })}
              </p>
            )}
          </div>
        </CardContent>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-muted/10 flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            Saving updates increments the workspace entitlement version and triggers immediate license re-issuance.
          </div>
          <Button
            type="submit"
            disabled={saving || !reason.trim()}
            className="rounded-xl text-xs font-bold px-6 bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer shadow-md"
          >
            {saving ? (
              <>
                <IconLoader className="h-4 w-4 animate-spin mr-1.5" />
                Saving Overrides...
              </>
            ) : (
              <>
                <IconCheck className="h-4 w-4 mr-1.5" />
                Save Entitlement Overrides
              </>
            )}
          </Button>
        </div>
      </form>
    </Card>
  );
}
