"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { adminService, BillingPlan } from "@/services/admin.service";
import {
  IconLoader,
  IconCheck,
  IconX,
  IconPlus,
  IconTrash,
  IconStack,
  IconGauge,
  IconSparkles,
  IconInfinity
} from "@tabler/icons-react";

export interface PlanEditorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  plan?: BillingPlan | null;
}

interface LimitMetadata {
  key: string;
  label: string;
  category: string;
  description: string;
  defaultVal: number;
  unit?: string;
}

export const QUANTITATIVE_LIMITS: LimitMetadata[] = [
  // Facilities & Multi-tenant Hierarchy
  { key: "limit.clinics", label: "Clinics / Outpatient Centers", category: "Facilities & Hierarchy", description: "Primary care clinic facilities permitted under this plan", defaultVal: 1 },
  { key: "limit.laboratories", label: "Diagnostic Laboratories", category: "Facilities & Hierarchy", description: "Clinical laboratory diagnostic units", defaultVal: 0 },
  { key: "limit.pharmacies", label: "Dispensary Pharmacies", category: "Facilities & Hierarchy", description: "Retail or in-clinic dispensary pharmacies", defaultVal: 0 },
  { key: "limit.organizations", label: "Health Organizations", category: "Facilities & Hierarchy", description: "Top-level enterprise tenant organizations", defaultVal: 1 },
  { key: "limit.branches", label: "Clinical Branches", category: "Facilities & Hierarchy", description: "Operating clinical branches or satellite sites", defaultVal: 1 },
  { key: "limit.members", label: "Enrolled Members", category: "Facilities & Hierarchy", description: "Corporate or insurance enrolled member roster ceiling", defaultVal: 0 },

  // Users, Hardware & Resources
  { key: "limit.staff", label: "Staff Accounts Pool", category: "Staff & Infrastructure", description: "Total doctors, nurses, cashiers, and admin accounts allowed", defaultVal: 5 },
  { key: "limit.storage_gb", label: "Storage Capacity", category: "Staff & Infrastructure", description: "Encrypted medical chart vault & attachment storage", defaultVal: 10, unit: "GB" },
  { key: "limit.terminals", label: "Concurrent POS/Workstations", category: "Staff & Infrastructure", description: "Simultaneous live connected terminals per facility", defaultVal: 3 },
  { key: "limit.beds", label: "Inpatient Beds", category: "Staff & Infrastructure", description: "Licensed inpatient beds for admission and monitoring", defaultVal: 0 },
  { key: "limit.analyzers", label: "Laboratory Analyzers", category: "Staff & Infrastructure", description: "Direct RS-232 / TCP machine instrument interfaces", defaultVal: 0 },

  // Clinical Encounters & API Quotas
  { key: "limit.monthly_consultations", label: "Monthly Consultations", category: "Clinical Encounters & API", description: "SOAP consultations allowed per calendar month", defaultVal: 500 },
  { key: "limit.api_requests_monthly", label: "Monthly API Quota", category: "Clinical Encounters & API", description: "PhilHealth proxy transmittal and external API requests", defaultVal: 10000 },
  { key: "limit.patients", label: "Active Patient Records", category: "Clinical Encounters & API", description: "Total unique patient electronic medical records", defaultVal: 1000 }
];

interface FeatureMetadata {
  key: string;
  label: string;
  description: string;
}

export const CAPABILITY_FLAGS: FeatureMetadata[] = [
  { key: "feature.cross_tenant_interop", label: "Cross-Tenant Interoperability", description: "Direct referral routing and cryptographic record sharing via Interop Hub" },
  { key: "feature.teleconsultation", label: "Teleconsultation Suite", description: "Integrated WebRTC encrypted video consults and virtual waiting room" },
  { key: "feature.electronic_prescriptions", label: "Electronic Prescriptions (e-Rx)", description: "Digitally signed FDA/DOH-compliant prescriptions with QR verification" },
  { key: "feature.lis_integration", label: "LIS Machine Integration", description: "Bidirectional interface for automated laboratory analyzer test runs" },
  { key: "feature.inventory_management", label: "Pharmacy & Inventory Management", description: "Real-time stock ledger, batch/expiry alerts, and point-of-sale dispensing" },
  { key: "feature.philhealth_konsulta", label: "PhilHealth Konsulta / Yakap", description: "Statutory XML generation, eKAS, eSER, and accreditation claims pipeline" },
  { key: "feature.multi_terminal_sync", label: "Multi-Terminal Real-Time Sync", description: "Sub-second queue, triage, and consultation status synchronization" },
  { key: "feature.advanced_analytics", label: "Advanced Executive Analytics", description: "Revenue forecasting, patient retention, and clinical epidemiology reports" },
  { key: "feature.custom_letterhead", label: "Custom Letterhead & Stationery", description: "Clinic watermark, custom logo, and personalized medical certificate branding" },
  { key: "feature.on_prem", label: "On-Premises / Edge Deployment", description: "Local LAN edge cell server operation with offline-first synchronization" }
];

export function PlanEditorDialog({ isOpen, onClose, onSaved, plan }: PlanEditorDialogProps) {
  const isEditing = Boolean(plan);

  const [activeTab, setActiveTab] = useState<"details" | "limits" | "features">("details");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [rank, setRank] = useState(1);
  const [monthlyPrice, setMonthlyPrice] = useState(0);
  const [annualPrice, setAnnualPrice] = useState(0);
  const [isHighlighted, setIsHighlighted] = useState(false);
  const [requiresCheckout, setRequiresCheckout] = useState(true);
  const [marketingFeatures, setMarketingFeatures] = useState<string[]>([]);
  const [newFeatureText, setNewFeatureText] = useState("");

  // Limits dictionary: key -> value (-1 is unlimited)
  const [limits, setLimits] = useState<Record<string, number>>({});
  // Enabled feature keys set
  const [enabledFeatures, setEnabledFeatures] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) return;

    if (plan) {
      setName(plan.name || "");
      setSlug(plan.slug || plan.id || "");
      setDescription(plan.description || "");
      setRank(plan.rank ?? 1);
      const mPrice = typeof plan.monthlyPrice === "number" ? plan.monthlyPrice : (typeof plan.priceMonthly === "number" ? plan.priceMonthly : parseFloat(String(plan.priceMonthly || 0)) || 0);
      const aPrice = typeof plan.annualPrice === "number" ? plan.annualPrice : (typeof plan.priceAnnually === "number" ? plan.priceAnnually : parseFloat(String(plan.priceAnnually || 0)) || 0);
      setMonthlyPrice(mPrice);
      setAnnualPrice(aPrice);
      setIsHighlighted(Boolean(plan.highlighted));
      setRequiresCheckout(plan.requiresCheckout !== undefined ? Boolean(plan.requiresCheckout) : true);
      setMarketingFeatures(Array.isArray(plan.features) ? [...plan.features] : []);

      // Quantitative limits
      const initialLimits: Record<string, number> = {};
      QUANTITATIVE_LIMITS.forEach(l => {
        if (plan.limits && l.key in plan.limits) {
          initialLimits[l.key] = plan.limits[l.key];
        } else {
          initialLimits[l.key] = l.defaultVal;
        }
      });
      setLimits(initialLimits);

      // Capability flags
      const initialFlags = Array.isArray(plan.enabledFeatures) ? [...plan.enabledFeatures] : [];
      setEnabledFeatures(initialFlags);
    } else {
      // Create mode
      setName("");
      setSlug("");
      setDescription("");
      setRank(1);
      setMonthlyPrice(0);
      setAnnualPrice(0);
      setIsHighlighted(false);
      setRequiresCheckout(true);
      setMarketingFeatures(["Primary Care Workflow", "PhilHealth Konsulta Transmittal"]);

      const defaultLimits: Record<string, number> = {};
      QUANTITATIVE_LIMITS.forEach(l => {
        defaultLimits[l.key] = l.defaultVal;
      });
      setLimits(defaultLimits);

      // Default active features for standard plan
      setEnabledFeatures([
        "feature.electronic_prescriptions",
        "feature.multi_terminal_sync",
        "feature.custom_letterhead"
      ]);
    }
    setActiveTab("details");
    setErrors({});
  }, [isOpen, plan]);

  const handleNameChange = (val: string) => {
    setName(val);
    if (!isEditing && (!slug || slug === name.toLowerCase().replace(/[^a-z0-9]/g, "-"))) {
      setSlug(val.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""));
    }
  };

  const handleLimitChange = (key: string, val: number) => {
    const sanitized = val < -1 ? 0 : val;
    setLimits(prev => ({ ...prev, [key]: sanitized }));
  };

  const toggleUnlimited = (key: string, defaultFallback: number) => {
    setLimits(prev => {
      const current = prev[key];
      if (current === -1) {
        return { ...prev, [key]: defaultFallback > 0 ? defaultFallback : 1 };
      } else {
        return { ...prev, [key]: -1 };
      }
    });
  };

  const toggleFeature = (key: string) => {
    setEnabledFeatures(prev => {
      if (prev.includes(key)) {
        return prev.filter(k => k !== key);
      } else {
        return [...prev, key];
      }
    });
  };

  const handleAddMarketingFeature = () => {
    const trimmed = newFeatureText.trim();
    if (!trimmed) return;
    setMarketingFeatures(prev => [...prev, trimmed]);
    setNewFeatureText("");
  };

  const handleRemoveMarketingFeature = (index: number) => {
    setMarketingFeatures(prev => prev.filter((_, i) => i !== index));
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = "Plan name is required";
    if (!slug.trim()) newErrors.slug = "Plan slug is required";
    else if (!/^[a-z0-9-]+$/.test(slug)) newErrors.slug = "Slug must contain only lowercase letters, numbers, and hyphens";

    if (rank < 1) newErrors.rank = "Rank must be at least 1";
    if (monthlyPrice < 0) newErrors.monthlyPrice = "Monthly price cannot be negative";
    if (annualPrice < 0) newErrors.annualPrice = "Annual price cannot be negative";

    for (const [key, val] of Object.entries(limits)) {
      if (typeof val === "number" && val < -1) {
        newErrors[key] = "Limit value cannot be negative below -1";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      toast.error("Please correct the errors in the form before saving.");
      return;
    }

    try {
      setSubmitting(true);
      const sanitizedLimits: Record<string, number> = {};
      Object.entries(limits).forEach(([k, v]) => {
        sanitizedLimits[k] = v < -1 ? 0 : v;
      });

      const payload = {
        name: name.trim(),
        slug: slug.trim(),
        description: description.trim(),
        rank: Number(rank),
        monthlyPrice: Number(monthlyPrice),
        annualPrice: Number(annualPrice),
        priceMonthly: Number(monthlyPrice),
        priceAnnually: Number(annualPrice),
        isHighlighted,
        requiresCheckout,
        features: marketingFeatures,
        limits: sanitizedLimits,
        enabledFeatures
      };

      if (isEditing && plan) {
        const planId = plan.planId || plan.id;
        await adminService.updatePlan(planId, payload);
        toast.success(`Plan "${name}" updated successfully. Licenses re-staged.`);
      } else {
        await adminService.createPlan(payload);
        toast.success(`Plan "${name}" created successfully.`);
      }

      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err.message || "Failed to save plan configuration.");
    } finally {
      setSubmitting(false);
    }
  };

  // Group limits by category
  const categories = Array.from(new Set(QUANTITATIVE_LIMITS.map(l => l.category)));

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-3xl border-border bg-background shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b border-border bg-muted/20">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <IconStack className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
                  {isEditing ? `Edit Plan: ${plan?.name}` : "Create New Subscription Plan"}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Configure plan pricing tier, 14 quantitative resource ceilings, and 10 capability flags.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Tab Selector */}
          <div className="flex items-center gap-2 mt-5 border-b border-border/60">
            <button
              type="button"
              onClick={() => setActiveTab("details")}
              className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 cursor-pointer ${
                activeTab === "details"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <IconStack className="h-4 w-4" />
              1. Basic Info & Pricing
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("limits")}
              className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 cursor-pointer ${
                activeTab === "limits"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <IconGauge className="h-4 w-4" />
              2. Quantitative Limits ({QUANTITATIVE_LIMITS.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("features")}
              className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 cursor-pointer ${
                activeTab === "features"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <IconSparkles className="h-4 w-4" />
              3. Capability Flags ({enabledFeatures.length}/{CAPABILITY_FLAGS.length})
            </button>
          </div>
        </div>

        {/* Form Body - Scrollable */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: BASIC DETAILS & PRICING */}
          {activeTab === "details" && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                    Plan Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="e.g. Starter, Professional, Enterprise"
                    className="w-full h-11 px-3.5 text-sm rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                  />
                  {errors.name && <p className="text-xs text-destructive font-medium">{errors.name}</p>}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                    Plan Slug * (unique identifier)
                  </label>
                  <input
                    type="text"
                    required
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    placeholder="e.g. starter, pro, enterprise"
                    className="w-full h-11 px-3.5 text-sm font-mono rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                  />
                  {errors.slug && <p className="text-xs text-destructive font-medium">{errors.slug}</p>}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief summary of who this plan is tailored for (e.g. Solo practitioners and emerging community clinics)"
                  rows={2}
                  className="w-full p-3 text-sm rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-2xl bg-muted/30 border border-border">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                    Ladder Rank * (Tier)
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={rank}
                    onChange={(e) => setRank(parseInt(e.target.value) || 1)}
                    className="w-full h-11 px-3.5 text-sm rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <p className="text-[11px] text-muted-foreground">Higher rank = higher tier upgrade</p>
                  {errors.rank && <p className="text-xs text-destructive font-medium">{errors.rank}</p>}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                    Monthly Price (₱ PHP) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">₱</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      value={monthlyPrice}
                      onChange={(e) => setMonthlyPrice(parseFloat(e.target.value) || 0)}
                      className="w-full h-11 pl-8 pr-3 text-sm rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary font-mono font-bold"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">0 for free tier or custom</p>
                  {errors.monthlyPrice && <p className="text-xs text-destructive font-medium">{errors.monthlyPrice}</p>}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                    Annual Price (₱ PHP) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">₱</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      value={annualPrice}
                      onChange={(e) => setAnnualPrice(parseFloat(e.target.value) || 0)}
                      className="w-full h-11 pl-8 pr-3 text-sm rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary font-mono font-bold"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">Discounted yearly subscription fee</p>
                  {errors.annualPrice && <p className="text-xs text-destructive font-medium">{errors.annualPrice}</p>}
                </div>
              </div>

              {/* Toggles */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="flex items-center gap-3 p-3.5 rounded-xl border border-border bg-card cursor-pointer hover:bg-muted/30 transition-colors">
                  <input
                    type="checkbox"
                    checked={isHighlighted}
                    onChange={(e) => setIsHighlighted(e.target.checked)}
                    className="h-4 w-4 rounded text-primary focus:ring-primary border-input"
                  />
                  <div>
                    <span className="text-xs font-bold text-foreground block">Highlight on Pricing Page</span>
                    <span className="text-[11px] text-muted-foreground block">Badged as &ldquo;Most Popular&rdquo; with prominent styling</span>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3.5 rounded-xl border border-border bg-card cursor-pointer hover:bg-muted/30 transition-colors">
                  <input
                    type="checkbox"
                    checked={requiresCheckout}
                    onChange={(e) => setRequiresCheckout(e.target.checked)}
                    className="h-4 w-4 rounded text-primary focus:ring-primary border-input"
                  />
                  <div>
                    <span className="text-xs font-bold text-foreground block">Requires Checkout Session</span>
                    <span className="text-[11px] text-muted-foreground block">Enforces payment collection upon registration</span>
                  </div>
                </label>
              </div>

              {/* Marketing Bullet Points */}
              <div className="space-y-2 pt-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                  Marketing Feature Bullets (Pricing Comparison Table)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newFeatureText}
                    onChange={(e) => setNewFeatureText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddMarketingFeature();
                      }
                    }}
                    placeholder="e.g. 24/7 Telephone & In-Clinic Support"
                    className="flex-1 h-10 px-3 text-sm rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <Button
                    type="button"
                    onClick={handleAddMarketingFeature}
                    variant="outline"
                    className="rounded-xl px-4 text-xs font-bold shrink-0"
                  >
                    <IconPlus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {marketingFeatures.map((feat, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-muted text-foreground text-xs font-medium border border-border"
                    >
                      {feat}
                      <button
                        type="button"
                        onClick={() => handleRemoveMarketingFeature(idx)}
                        className="text-muted-foreground hover:text-destructive cursor-pointer"
                      >
                        <IconX className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                  {marketingFeatures.length === 0 && (
                    <span className="text-xs text-muted-foreground italic">No marketing bullets added yet.</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: QUANTITATIVE LIMITS */}
          {activeTab === "limits" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="p-3.5 rounded-xl bg-primary/5 border border-primary/20 text-xs text-muted-foreground flex items-center justify-between">
                <span>
                  Configure the 14 quantitative resource allocations. Toggle <strong>Unlimited (-1)</strong> for unrestricted usage.
                </span>
                <Badge variant="outline" className="border-primary/40 text-primary font-bold">
                  {Object.values(limits).filter(v => v === -1).length} Unlimited Limits
                </Badge>
              </div>

              {categories.map((cat) => (
                <div key={cat} className="space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-muted-foreground border-b border-border pb-1">
                    {cat}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {QUANTITATIVE_LIMITS.filter(l => l.category === cat).map((limitDef) => {
                      const currentVal = limits[limitDef.key] ?? limitDef.defaultVal;
                      const isUnlim = currentVal === -1;

                      return (
                        <div
                          key={limitDef.key}
                          className={`p-3.5 rounded-2xl border transition-all ${
                            isUnlim
                              ? "bg-primary/5 border-primary/30"
                              : "bg-card border-border hover:border-input"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <div>
                              <span className="text-xs font-bold text-foreground block">{limitDef.label}</span>
                              <code className="text-[10px] font-mono text-muted-foreground block">{limitDef.key}</code>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant={isUnlim ? "default" : "outline"}
                              onClick={() => toggleUnlimited(limitDef.key, limitDef.defaultVal)}
                              className={`h-7 px-2.5 text-[11px] font-bold rounded-lg cursor-pointer ${
                                isUnlim ? "bg-primary text-primary-foreground" : "border-border text-muted-foreground"
                              }`}
                            >
                              <IconInfinity className="h-3.5 w-3.5 mr-1" />
                              {isUnlim ? "Unlimited" : "Set Cap"}
                            </Button>
                          </div>

                          <p className="text-[11px] text-muted-foreground mb-2 line-clamp-1">
                            {limitDef.description}
                          </p>

                          <div className="flex items-center gap-2">
                            {isUnlim ? (
                              <div className="flex-1 h-9 px-3 rounded-xl bg-primary/10 border border-primary/20 text-xs font-mono font-bold text-primary flex items-center gap-1.5">
                                <IconInfinity className="h-4 w-4" />
                                <span>Unlimited (-1)</span>
                              </div>
                            ) : (
                              <div className="relative flex-1">
                                <input
                                  type="number"
                                  min="0"
                                  value={currentVal}
                                  onChange={(e) => {
                                    const parsed = parseInt(e.target.value);
                                    const sanitized = isNaN(parsed) ? 0 : (parsed < -1 ? 0 : parsed);
                                    handleLimitChange(limitDef.key, sanitized);
                                  }}
                                  className="w-full h-9 px-3 text-xs font-mono font-bold rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                />
                                {limitDef.unit && (
                                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground uppercase">
                                    {limitDef.unit}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TAB 3: CAPABILITY FLAGS */}
          {activeTab === "features" && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="p-3.5 rounded-xl bg-primary/5 border border-primary/20 text-xs text-muted-foreground flex items-center justify-between">
                <span>
                  Enable or disable feature capabilities granted to workspaces subscribed to this tier.
                </span>
                <Badge variant="outline" className="border-primary/40 text-primary font-bold">
                  {enabledFeatures.length} of {CAPABILITY_FLAGS.length} Enabled
                </Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {CAPABILITY_FLAGS.map((feat) => {
                  const isEnabled = enabledFeatures.includes(feat.key);

                  return (
                    <div
                      key={feat.key}
                      onClick={() => toggleFeature(feat.key)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer select-none flex items-start gap-3.5 ${
                        isEnabled
                          ? "bg-primary/5 border-primary/30 shadow-xs"
                          : "bg-card border-border hover:border-input opacity-80"
                      }`}
                    >
                      <div
                        className={`h-5 w-5 rounded-lg flex items-center justify-center shrink-0 mt-0.5 transition-colors border ${
                          isEnabled
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted border-input text-transparent"
                        }`}
                      >
                        <IconCheck className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <span className={`text-xs font-bold block truncate ${isEnabled ? "text-primary" : "text-foreground"}`}>
                            {feat.label}
                          </span>
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${isEnabled ? "text-primary font-bold" : "text-muted-foreground"}`}>
                            {isEnabled ? "Enabled" : "Disabled"}
                          </span>
                        </div>
                        <code className="text-[10px] font-mono text-muted-foreground block mb-1">{feat.key}</code>
                        <p className="text-[11px] text-muted-foreground leading-snug">
                          {feat.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-muted/20 flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {activeTab === "details" && "Step 1: Basic plan metadata and pricing"}
            {activeTab === "limits" && "Step 2: 14 Quantitative limits configured"}
            {activeTab === "features" && "Step 3: 10 Capability feature flags configured"}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={submitting}
              className="rounded-xl text-xs font-bold cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={submitting}
              className="rounded-xl text-xs font-bold px-6 bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer shadow-md"
            >
              {submitting ? (
                <>
                  <IconLoader className="h-4 w-4 animate-spin mr-1.5" />
                  Saving Plan...
                </>
              ) : (
                <>
                  <IconCheck className="h-4 w-4 mr-1.5" />
                  {isEditing ? "Save & Cascade Updates" : "Create Plan"}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
