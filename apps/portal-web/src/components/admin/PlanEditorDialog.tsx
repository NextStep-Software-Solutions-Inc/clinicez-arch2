"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { adminService, BillingPlan } from "@/services/admin.service";
import { cn } from "@/lib/utils";
import {
  IconLoader,
  IconCheck,
  IconX,
  IconPlus,
  IconTrash,
  IconStack,
  IconGauge,
  IconSparkles,
  IconInfinity,
  IconBuildingHospital,
  IconFlask,
  IconPill,
  IconBuilding,
  IconWorld,
  IconUsers,
  IconUserCheck,
  IconCloud,
  IconDeviceDesktop,
  IconHospital,
  IconTestPipe,
  IconAddressBook,
  IconStethoscope,
  IconWebhook,
  IconFileCertificate,
  IconVideo,
  IconShieldCheck,
  IconArrowsExchange,
  IconServer,
  IconChartBar,
  IconFileText,
  IconCash,
  IconCreditCard,
  IconArrowLeft,
  IconArrowRight,
  IconAlertCircle
} from "@tabler/icons-react";

export interface PlanEditorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  plan?: BillingPlan | null;
  existingPlans?: BillingPlan[];
}

export interface LimitMetadata {
  key: string;
  label: string;
  category: "Facilities & Hierarchy" | "Staff & Infrastructure" | "Clinical Encounters & API";
  description: string;
  defaultVal: number;
  unit?: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const QUANTITATIVE_LIMITS: LimitMetadata[] = [
  // Facilities & Multi-tenant Hierarchy
  {
    key: "limit.clinics",
    label: "Clinics / Outpatient Centers",
    category: "Facilities & Hierarchy",
    description: "Primary care clinic facilities permitted under this plan",
    defaultVal: 1,
    icon: IconBuildingHospital
  },
  {
    key: "limit.laboratories",
    label: "Diagnostic Laboratories",
    category: "Facilities & Hierarchy",
    description: "Clinical diagnostic laboratory units per workspace",
    defaultVal: 0,
    icon: IconFlask
  },
  {
    key: "limit.pharmacies",
    label: "Dispensary Pharmacies",
    category: "Facilities & Hierarchy",
    description: "Retail or in-clinic dispensary pharmacy locations",
    defaultVal: 0,
    icon: IconPill
  },
  {
    key: "limit.organizations",
    label: "Health Organizations",
    category: "Facilities & Hierarchy",
    description: "Top-level enterprise tenant organizations permitted",
    defaultVal: 1,
    icon: IconBuilding
  },
  {
    key: "limit.branches",
    label: "Clinical Branches",
    category: "Facilities & Hierarchy",
    description: "Operating clinical branches or satellite sites",
    defaultVal: 1,
    icon: IconWorld
  },
  {
    key: "limit.members",
    label: "Enrolled Members",
    category: "Facilities & Hierarchy",
    description: "Corporate or insurance enrolled member roster ceiling",
    defaultVal: 0,
    icon: IconUsers
  },

  // Users, Hardware & Resources
  {
    key: "limit.staff",
    label: "Staff Accounts Pool",
    category: "Staff & Infrastructure",
    description: "Total doctors, nurses, cashiers, and admin accounts allowed",
    defaultVal: 5,
    unit: "accounts",
    icon: IconUserCheck
  },
  {
    key: "limit.storage_gb",
    label: "Storage Capacity",
    category: "Staff & Infrastructure",
    description: "Encrypted medical chart vault & attachment storage",
    defaultVal: 10,
    unit: "GB",
    icon: IconCloud
  },
  {
    key: "limit.terminals",
    label: "Concurrent Workstations",
    category: "Staff & Infrastructure",
    description: "Simultaneous live connected terminals per facility",
    defaultVal: 3,
    unit: "workstations",
    icon: IconDeviceDesktop
  },
  {
    key: "limit.beds",
    label: "Inpatient Beds",
    category: "Staff & Infrastructure",
    description: "Licensed inpatient beds for admission and monitoring",
    defaultVal: 0,
    unit: "beds",
    icon: IconHospital
  },
  {
    key: "limit.analyzers",
    label: "Laboratory Analyzers",
    category: "Staff & Infrastructure",
    description: "Direct RS-232 / TCP machine instrument interfaces",
    defaultVal: 0,
    unit: "analyzers",
    icon: IconTestPipe
  },

  // Clinical Encounters & API Quotas
  {
    key: "limit.patients",
    label: "Active Patient Records",
    category: "Clinical Encounters & API",
    description: "Total unique patient electronic medical records allowed",
    defaultVal: 1000,
    unit: "records",
    icon: IconAddressBook
  },
  {
    key: "limit.monthly_consultations",
    label: "Monthly Consultations",
    category: "Clinical Encounters & API",
    description: "SOAP consultations allowed per calendar month",
    defaultVal: 500,
    unit: "consults/mo",
    icon: IconStethoscope
  },
  {
    key: "limit.api_requests_monthly",
    label: "Monthly API Quota",
    category: "Clinical Encounters & API",
    description: "PhilHealth proxy transmittal and external API requests",
    defaultVal: 10000,
    unit: "requests/mo",
    icon: IconWebhook
  }
];

export interface FeatureMetadata {
  key: string;
  label: string;
  category: "Clinical Care & Telehealth" | "Interoperability & Diagnostics" | "Operations & Enterprise";
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const CAPABILITY_FLAGS: FeatureMetadata[] = [
  {
    key: "feature.electronic_prescriptions",
    label: "Electronic Prescriptions (e-Rx)",
    category: "Clinical Care & Telehealth",
    description: "Digitally signed FDA/DOH-compliant prescriptions with QR verification",
    icon: IconFileCertificate
  },
  {
    key: "feature.teleconsultation",
    label: "Teleconsultation Suite",
    category: "Clinical Care & Telehealth",
    description: "Integrated WebRTC encrypted video consults and virtual waiting room",
    icon: IconVideo
  },
  {
    key: "feature.philhealth_konsulta",
    label: "PhilHealth Konsulta / Yakap",
    category: "Clinical Care & Telehealth",
    description: "Statutory XML generation, eKAS, eSER, and accreditation claims pipeline",
    icon: IconShieldCheck
  },
  {
    key: "feature.cross_tenant_interop",
    label: "Cross-Tenant Interoperability",
    category: "Interoperability & Diagnostics",
    description: "Direct referral routing and cryptographic record sharing via Interop Hub",
    icon: IconArrowsExchange
  },
  {
    key: "feature.lis_integration",
    label: "LIS Machine Integration",
    category: "Interoperability & Diagnostics",
    description: "Bidirectional interface for automated laboratory analyzer test runs",
    icon: IconTestPipe
  },
  {
    key: "feature.on_prem",
    label: "On-Premises / Edge Deployment",
    category: "Interoperability & Diagnostics",
    description: "Local LAN edge cell server operation with offline-first synchronization",
    icon: IconServer
  },
  {
    key: "feature.inventory_management",
    label: "Pharmacy & Inventory POS",
    category: "Operations & Enterprise",
    description: "Real-time stock ledger, batch/expiry alerts, and point-of-sale dispensing",
    icon: IconPill
  },
  {
    key: "feature.multi_terminal_sync",
    label: "Multi-Terminal Real-Time Sync",
    category: "Operations & Enterprise",
    description: "Sub-second queue, triage, and consultation status synchronization",
    icon: IconDeviceDesktop
  },
  {
    key: "feature.advanced_analytics",
    label: "Advanced Executive Analytics",
    category: "Operations & Enterprise",
    description: "Revenue forecasting, patient retention, and clinical epidemiology reports",
    icon: IconChartBar
  },
  {
    key: "feature.custom_letterhead",
    label: "Custom Letterhead & Stationery",
    category: "Operations & Enterprise",
    description: "Clinic watermark, custom logo, and personalized medical certificate branding",
    icon: IconFileText
  }
];

export function PlanEditorDialog({
  isOpen,
  onClose,
  onSaved,
  plan,
  existingPlans = []
}: PlanEditorDialogProps) {
  const isEditing = Boolean(plan);

  const [activeTab, setActiveTab] = useState<"details" | "limits" | "features">("details");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "unavailable">("idle");
  const [slugMessage, setSlugMessage] = useState<string>("");
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

  // Rank collision detection against loaded existing plans
  const collidingPlan = existingPlans.find(
    (p) =>
      Number(p.rank) === Number(rank) &&
      (p.planId || p.id) !== (plan?.planId || plan?.id)
  );

  useEffect(() => {
    if (!isOpen) return;

    if (plan) {
      setName(plan.name || "");
      setSlug(plan.slug || plan.id || "");
      setDescription(plan.description || "");
      setRank(plan.rank ?? 1);
      const mPrice =
        typeof plan.monthlyPrice === "number"
          ? plan.monthlyPrice
          : typeof plan.priceMonthly === "number"
          ? plan.priceMonthly
          : parseFloat(String(plan.priceMonthly || 0)) || 0;
      const aPrice =
        typeof plan.annualPrice === "number"
          ? plan.annualPrice
          : typeof plan.priceAnnually === "number"
          ? plan.priceAnnually
          : parseFloat(String(plan.priceAnnually || 0)) || 0;
      setMonthlyPrice(mPrice);
      setAnnualPrice(aPrice);
      setIsHighlighted(Boolean(plan.highlighted));
      setRequiresCheckout(plan.requiresCheckout !== undefined ? Boolean(plan.requiresCheckout) : true);
      setMarketingFeatures(Array.isArray(plan.features) ? [...plan.features] : []);

      // Quantitative limits
      const initialLimits: Record<string, number> = {};
      QUANTITATIVE_LIMITS.forEach((l) => {
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
      setMarketingFeatures([
        "Primary Care Outpatient Workflow",
        "PhilHealth Konsulta & Yakap Transmittal",
        "Encrypted Medical Chart Vault"
      ]);

      const defaultLimits: Record<string, number> = {};
      QUANTITATIVE_LIMITS.forEach((l) => {
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
    setSlugStatus("idle");
    setSlugMessage("");
    setErrors({});
  }, [isOpen, plan]);

  // Real-time slug validation (instant local check + debounced server check)
  useEffect(() => {
    if (!isOpen || !slug.trim()) {
      setSlugStatus("idle");
      setSlugMessage("");
      return;
    }

    const currentPlanId = plan ? plan.planId || plan.id : undefined;

    // 1. Instant regex validation
    if (!/^[a-z0-9-]+$/.test(slug)) {
      setSlugStatus("unavailable");
      setSlugMessage("Slug must contain only lowercase letters, numbers, and hyphens");
      return;
    }

    // 2. Instant client-side check against in-memory plans
    const clientDuplicate = existingPlans.find(
      (p) =>
        (p.slug || p.id || "").toLowerCase() === slug.toLowerCase() &&
        (p.planId || p.id) !== currentPlanId
    );
    if (clientDuplicate) {
      setSlugStatus("unavailable");
      setSlugMessage(`Slug is already used by "${clientDuplicate.name}"`);
      return;
    }

    // If unchanged from current plan, mark as available
    if (isEditing && (plan?.slug === slug || plan?.id === slug)) {
      setSlugStatus("available");
      setSlugMessage("Current plan slug");
      return;
    }

    // 3. Debounced server check
    setSlugStatus("checking");
    setSlugMessage("Verifying slug uniqueness...");

    let isMounted = true;
    const timer = setTimeout(async () => {
      try {
        const res = await adminService.checkPlanSlug(slug, currentPlanId);
        if (isMounted) {
          if (res.available) {
            setSlugStatus("available");
            setSlugMessage(res.message || "Unique & available");
          } else {
            setSlugStatus("unavailable");
            setSlugMessage(res.message || "Slug is already registered in database");
          }
        }
      } catch (err) {
        if (isMounted) {
          console.error("Slug check error:", err);
        }
      }
    }, 350);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [slug, isOpen, isEditing, plan, existingPlans]);

  const handleNameChange = (val: string) => {
    setName(val);
    if (!isEditing && (!slug || slug === name.toLowerCase().replace(/[^a-z0-9]/g, "-"))) {
      setSlug(
        val
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
      );
    }
  };

  const handleLimitChange = (key: string, val: number) => {
    const sanitized = val < -1 ? 0 : val;
    setLimits((prev) => ({ ...prev, [key]: sanitized }));
  };

  const toggleUnlimited = (key: string, defaultFallback: number) => {
    setLimits((prev) => {
      const current = prev[key];
      if (current === -1) {
        return { ...prev, [key]: defaultFallback > 0 ? defaultFallback : 1 };
      } else {
        return { ...prev, [key]: -1 };
      }
    });
  };

  const setAllLimitsUnlimited = () => {
    const unlim: Record<string, number> = {};
    QUANTITATIVE_LIMITS.forEach((l) => {
      unlim[l.key] = -1;
    });
    setLimits(unlim);
    toast.info("All 14 quantitative resource ceilings set to Unlimited (-1).");
  };

  const resetLimitsToDefaults = () => {
    const defs: Record<string, number> = {};
    QUANTITATIVE_LIMITS.forEach((l) => {
      defs[l.key] = l.defaultVal;
    });
    setLimits(defs);
    toast.info("Quantitative limits reset to standard tier defaults.");
  };

  const toggleFeature = (key: string) => {
    setEnabledFeatures((prev) => {
      if (prev.includes(key)) {
        return prev.filter((k) => k !== key);
      } else {
        return [...prev, key];
      }
    });
  };

  const toggleAllFeatures = (enable: boolean) => {
    if (enable) {
      setEnabledFeatures(CAPABILITY_FLAGS.map((f) => f.key));
      toast.info("All 10 capability flags enabled.");
    } else {
      setEnabledFeatures([]);
      toast.info("All capability flags disabled.");
    }
  };

  const handleAddMarketingFeature = (text?: string) => {
    const valueToAdd = (text || newFeatureText).trim();
    if (!valueToAdd) return;
    if (marketingFeatures.includes(valueToAdd)) {
      toast.error("This marketing bullet already exists.");
      return;
    }
    setMarketingFeatures((prev) => [...prev, valueToAdd]);
    if (!text) setNewFeatureText("");
  };

  const handleRemoveMarketingFeature = (index: number) => {
    setMarketingFeatures((prev) => prev.filter((_, i) => i !== index));
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = "Plan name is required";
    if (!slug.trim()) newErrors.slug = "Plan slug is required";
    else if (!/^[a-z0-9-]+$/.test(slug)) {
      newErrors.slug = "Slug must contain only lowercase letters, numbers, and hyphens";
    } else if (slugStatus === "unavailable") {
      newErrors.slug = slugMessage || "Plan slug is already in use by another plan";
    }

    if (rank < 1) newErrors.rank = "Ladder rank must be at least 1";
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

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!validate() || slugStatus === "unavailable") {
      toast.error("Please resolve highlighted form validation errors before saving.");
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
        toast.success(`Plan "${name}" updated successfully. Ceilings cascade to active subscribers.`);
      } else {
        await adminService.createPlan(payload);
        toast.success(`Plan "${name}" successfully registered in billing catalog.`);
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
  const limitCategories: Array<"Facilities & Hierarchy" | "Staff & Infrastructure" | "Clinical Encounters & API"> = [
    "Facilities & Hierarchy",
    "Staff & Infrastructure",
    "Clinical Encounters & API"
  ];

  // Group capability flags by category
  const featureCategories: Array<"Clinical Care & Telehealth" | "Interoperability & Diagnostics" | "Operations & Enterprise"> = [
    "Clinical Care & Telehealth",
    "Interoperability & Diagnostics",
    "Operations & Enterprise"
  ];

  const unlimitedCount = Object.values(limits).filter((v) => v === -1).length;

  // Annual savings calculation
  const annualizedMonthly = monthlyPrice * 12;
  const annualSavings = annualizedMonthly > 0 ? annualizedMonthly - annualPrice : 0;
  const annualSavingsPercent =
    annualizedMonthly > 0 && annualSavings > 0
      ? Math.round((annualSavings / annualizedMonthly) * 100)
      : 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="w-[96vw] max-w-[96vw] sm:max-w-5xl lg:max-w-6xl xl:max-w-7xl h-[92vh] max-h-[920px] flex flex-col p-0 overflow-hidden rounded-3xl border-border bg-background shadow-2xl"
        showCloseButton={true}
      >
        {/* ========================================================= */}
        {/* CLINICAL WORKSTATION MODAL HEADER                          */}
        {/* ========================================================= */}
        <div className="px-6 sm:px-8 pt-6 pb-4 border-b border-border bg-muted/20 shrink-0">
          <DialogHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0 shadow-xs">
                  <IconStack className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <DialogTitle className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                      {isEditing ? `Edit Plan: ${plan?.name || name}` : "Create New Subscription Plan"}
                    </DialogTitle>
                    {isHighlighted && (
                      <Badge className="bg-primary/10 text-primary border-primary/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        Featured Tier
                      </Badge>
                    )}
                  </div>
                  <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                    Configure multi-tenant tier hierarchy, 14 quantitative resource ceilings, and 10 capability flags.
                  </DialogDescription>
                </div>
              </div>

              {/* Status Chips Summary */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <div className="px-2.5 py-1 rounded-xl bg-card border border-border flex items-center gap-1.5 shadow-2xs font-medium text-foreground">
                  <span className="text-muted-foreground">Tier:</span>
                  <span className="font-bold text-primary">Rank #{rank}</span>
                </div>
                <div className="px-2.5 py-1 rounded-xl bg-card border border-border flex items-center gap-1.5 shadow-2xs font-medium text-foreground">
                  <span className="text-muted-foreground">Price:</span>
                  <span className="font-bold text-foreground font-mono">
                    {monthlyPrice > 0 ? `₱${monthlyPrice.toLocaleString()}/mo` : "Free"}
                  </span>
                </div>
                <div className="px-2.5 py-1 rounded-xl bg-card border border-border flex items-center gap-1.5 shadow-2xs font-medium text-foreground">
                  <IconGauge className="h-3.5 w-3.5 text-primary" />
                  <span className="font-bold text-foreground">{unlimitedCount}</span>
                  <span className="text-muted-foreground">Unlimited Limits</span>
                </div>
                <div className="px-2.5 py-1 rounded-xl bg-card border border-border flex items-center gap-1.5 shadow-2xs font-medium text-foreground">
                  <IconSparkles className="h-3.5 w-3.5 text-primary" />
                  <span className="font-bold text-foreground">{enabledFeatures.length}/10</span>
                  <span className="text-muted-foreground">Modules</span>
                </div>
              </div>
            </div>
          </DialogHeader>

          {/* Clinical Workstation Segmented Stepper */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-5">
            <button
              type="button"
              onClick={() => setActiveTab("details")}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
                activeTab === "details"
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-card border-border/70 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              }`}
            >
              <div
                className={`h-8 w-8 rounded-xl flex items-center justify-center shrink-0 ${
                  activeTab === "details"
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <IconStack className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-bold block truncate">1. Plan Identity & Pricing</span>
                <span
                  className={`text-[11px] block truncate ${
                    activeTab === "details" ? "text-primary-foreground/80" : "text-muted-foreground"
                  }`}
                >
                  Tier rank, monthly/annual rates
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("limits")}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
                activeTab === "limits"
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-card border-border/70 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              }`}
            >
              <div
                className={`h-8 w-8 rounded-xl flex items-center justify-center shrink-0 ${
                  activeTab === "limits"
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <IconGauge className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-bold block truncate">2. Resource Limits</span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 h-4 font-mono font-bold ${
                      activeTab === "limits"
                        ? "border-primary-foreground/30 text-primary-foreground"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    14 Caps
                  </Badge>
                </div>
                <span
                  className={`text-[11px] block truncate ${
                    activeTab === "limits" ? "text-primary-foreground/80" : "text-muted-foreground"
                  }`}
                >
                  Facilities, staff, bed, storage ceilings
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("features")}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
                activeTab === "features"
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-card border-border/70 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              }`}
            >
              <div
                className={`h-8 w-8 rounded-xl flex items-center justify-center shrink-0 ${
                  activeTab === "features"
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <IconSparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-bold block truncate">3. Capability Flags</span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 h-4 font-mono font-bold ${
                      activeTab === "features"
                        ? "border-primary-foreground/30 text-primary-foreground"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    {enabledFeatures.length}/10 Active
                  </Badge>
                </div>
                <span
                  className={`text-[11px] block truncate ${
                    activeTab === "features" ? "text-primary-foreground/80" : "text-muted-foreground"
                  }`}
                >
                  e-Rx, Telehealth, LIS, Yakap modules
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* ========================================================= */}
        {/* SCROLLABLE FORM BODY                                      */}
        {/* ========================================================= */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-8">
          {/* TAB 1: BASIC DETAILS & PRICING */}
          {activeTab === "details" && (
            <div className="space-y-8 animate-in fade-in duration-200">
              {/* Card 1: Plan Identity */}
              <div className="p-6 rounded-3xl border border-border bg-card/60 shadow-xs space-y-5">
                <div className="flex items-center gap-2.5 pb-2 border-b border-border/60">
                  <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    <IconBuilding className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">Plan Identity & Taxonomy</h3>
                    <p className="text-[11px] text-muted-foreground">
                      Public display branding and technical identifier for license enforcement.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                      Plan Display Name <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => handleNameChange(e.target.value)}
                      placeholder="e.g. Community Practice, Diagnostic Laboratory, Hospital Network"
                      className="w-full h-12 px-4 text-sm font-medium rounded-2xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all placeholder:text-muted-foreground/60 shadow-2xs"
                    />
                    {errors.name && <p className="text-xs text-destructive font-medium">{errors.name}</p>}
                    <p className="text-[11px] text-muted-foreground">
                      Shown across patient portal, invoice headers, and billing subscription matrices.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                        System Slug / Unique Key <span className="text-destructive">*</span>
                      </label>
                      {slug && slugStatus !== "idle" && (
                        <div className="flex items-center gap-1.5 text-xs">
                          {slugStatus === "checking" && (
                            <span className="inline-flex items-center gap-1 text-muted-foreground text-[11px] font-medium animate-pulse">
                              <IconLoader className="h-3 w-3 animate-spin text-primary" />
                              Checking...
                            </span>
                          )}
                          {slugStatus === "available" && (
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-[11px] font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                              <IconCheck className="h-3 w-3" />
                              Unique & Available
                            </span>
                          )}
                          {slugStatus === "unavailable" && (
                            <span className="inline-flex items-center gap-1 text-destructive text-[11px] font-semibold bg-destructive/10 px-2 py-0.5 rounded-full border border-destructive/20">
                              <IconX className="h-3 w-3" />
                              Already Taken
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        value={slug}
                        onChange={(e) =>
                          setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                        }
                        placeholder="e.g. community-practice, pro-tier, enterprise-network"
                        className={cn(
                          "w-full h-12 px-4 text-sm font-mono font-semibold rounded-2xl border bg-background text-foreground focus:outline-none focus:ring-2 transition-all placeholder:text-muted-foreground/60 shadow-2xs",
                          slugStatus === "unavailable"
                            ? "border-destructive focus:ring-destructive focus:border-destructive text-destructive"
                            : slugStatus === "available"
                            ? "border-emerald-500/50 focus:ring-emerald-500 focus:border-emerald-500"
                            : "border-input focus:ring-primary focus:border-primary"
                        )}
                      />
                    </div>
                    {errors.slug && <p className="text-xs text-destructive font-medium">{errors.slug}</p>}
                    {slugMessage && slugStatus === "unavailable" && !errors.slug && (
                      <p className="text-xs text-destructive font-medium flex items-center gap-1">
                        <IconAlertCircle className="h-3.5 w-3.5 shrink-0" />
                        {slugMessage}
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      Immutable identifier referenced in database migrations and tenant license tables.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                    Clinical Scope & Target Audience Description
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. Comprehensive primary care workstation suite designed for standalone polyclinics, ambulatory care centers, and multi-physician practices requiring PhilHealth Konsulta accreditation."
                    rows={3}
                    className="w-full p-4 text-sm rounded-2xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all resize-none shadow-2xs placeholder:text-muted-foreground/60"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Brief synopsis displayed to clinic administrators during plan selection or tier upgrade.
                  </p>
                </div>
              </div>

              {/* Card 2: Pricing Matrix & Tier Ranking */}
              <div className="p-6 rounded-3xl border border-border bg-card/60 shadow-xs space-y-5">
                <div className="flex items-center justify-between pb-2 border-b border-border/60">
                  <div className="flex items-center gap-2.5">
                    <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                      <IconCash className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-foreground">Subscription Pricing & Upgrade Ladder</h3>
                      <p className="text-[11px] text-muted-foreground">
                        Structured pricing schedules in Philippine Pesos (₱ PHP) with automated annual discount calculation.
                      </p>
                    </div>
                  </div>
                  {annualSavingsPercent > 0 && (
                    <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-xs font-bold px-3 py-1 rounded-full">
                      Annual Discount: {annualSavingsPercent}% Off
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {/* Ladder Rank */}
                  <div className="p-5 rounded-2xl border border-border bg-background space-y-3 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                        Ladder Rank <span className="text-destructive">*</span>
                      </label>
                      <Badge variant="outline" className="border-primary/40 text-primary font-mono font-bold">
                        Tier Level {rank}
                      </Badge>
                    </div>
                    <input
                      type="number"
                      min="1"
                      required
                      value={rank}
                      onChange={(e) => setRank(parseInt(e.target.value) || 1)}
                      className="w-full h-12 px-4 text-base font-bold font-mono rounded-xl border border-input bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    {collidingPlan && (
                      <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-700 dark:text-amber-300 text-[11px] leading-tight space-y-1">
                        <div className="flex items-center gap-1.5 font-bold">
                          <IconArrowsExchange className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                          <span>Auto-Bump Side Effect</span>
                        </div>
                        <p>
                          Tier {rank} is currently held by <strong>{collidingPlan.name}</strong>. Saving will automatically bump <strong>{collidingPlan.name}</strong> (and higher tiers) up by +1 to guarantee unique ranks.
                        </p>
                      </div>
                    )}
                    {errors.rank && <p className="text-xs text-destructive font-medium">{errors.rank}</p>}
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      Hierarchy rank order (1, 2, 3...). Workspaces can only upgrade to plans with a strictly higher ladder rank.
                    </p>
                  </div>

                  {/* Monthly Price */}
                  <div className="p-5 rounded-2xl border border-border bg-background space-y-3 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                        Monthly Fee (₱ PHP) <span className="text-destructive">*</span>
                      </label>
                      <span className="text-[10px] font-mono text-muted-foreground">Billed Every 30 Days</span>
                    </div>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-base font-bold text-muted-foreground">
                        ₱
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        value={monthlyPrice}
                        onChange={(e) => setMonthlyPrice(parseFloat(e.target.value) || 0)}
                        className="w-full h-12 pl-9 pr-4 text-base font-mono font-bold rounded-xl border border-input bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    {errors.monthlyPrice && (
                      <p className="text-xs text-destructive font-medium">{errors.monthlyPrice}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      Standard recurring monthly billing schedule. Set to ₱0 for free trial or community tiers.
                    </p>
                  </div>

                  {/* Annual Price */}
                  <div className="p-5 rounded-2xl border border-border bg-background space-y-3 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                        Annual Fee (₱ PHP) <span className="text-destructive">*</span>
                      </label>
                      <span className="text-[10px] font-mono text-muted-foreground">Billed Annually</span>
                    </div>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-base font-bold text-muted-foreground">
                        ₱
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        value={annualPrice}
                        onChange={(e) => setAnnualPrice(parseFloat(e.target.value) || 0)}
                        className="w-full h-12 pl-9 pr-4 text-base font-mono font-bold rounded-xl border border-input bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    {errors.annualPrice && (
                      <p className="text-xs text-destructive font-medium">{errors.annualPrice}</p>
                    )}
                    <div className="text-[11px] leading-snug">
                      {annualSavings > 0 ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                          Saves ₱{annualSavings.toLocaleString()} annually vs monthly billing schedule.
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          Discounted yearly rate billed in a single annual payment.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 3: Market Presentation & Checkout Enforcements */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <label className="p-5 rounded-3xl border border-border bg-card/60 cursor-pointer hover:bg-card hover:border-primary/40 transition-all shadow-xs flex items-start gap-4">
                  <input
                    type="checkbox"
                    checked={isHighlighted}
                    onChange={(e) => setIsHighlighted(e.target.checked)}
                    className="h-5 w-5 rounded-lg text-primary focus:ring-primary border-input mt-0.5 cursor-pointer"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <IconSparkles className="h-4 w-4 text-primary" />
                      <span className="text-sm font-bold text-foreground">Featured / Recommended Tier</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Highlights this plan with a distinctive Teal accent border and &ldquo;Most Popular&rdquo; recommendation ribbon in the public marketing comparison matrix.
                    </p>
                  </div>
                </label>

                <label className="p-5 rounded-3xl border border-border bg-card/60 cursor-pointer hover:bg-card hover:border-primary/40 transition-all shadow-xs flex items-start gap-4">
                  <input
                    type="checkbox"
                    checked={requiresCheckout}
                    onChange={(e) => setRequiresCheckout(e.target.checked)}
                    className="h-5 w-5 rounded-lg text-primary focus:ring-primary border-input mt-0.5 cursor-pointer"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <IconCreditCard className="h-4 w-4 text-primary" />
                      <span className="text-sm font-bold text-foreground">Requires Checkout Session</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Enforces online card or e-wallet payment checkout before tenant provisioning. Uncheck for enterprise invoiced contracts or free entry tiers.
                    </p>
                  </div>
                </label>
              </div>

              {/* Card 4: Marketing Feature Bullets */}
              <div className="p-6 rounded-3xl border border-border bg-card/60 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-border/60">
                  <div className="flex items-center gap-2.5">
                    <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                      <IconCheck className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-foreground">Marketing Comparison Bullets</h3>
                      <p className="text-[11px] text-muted-foreground">
                        Customer-facing benefit highlights displayed on pricing cards.
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="border-border text-muted-foreground font-mono text-xs">
                    {marketingFeatures.length} Bullets
                  </Badge>
                </div>

                <div className="flex gap-3">
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
                    placeholder="e.g. 24/7 Telephone Support, Free Data Migration, Dedicated Account Manager"
                    className="flex-1 h-12 px-4 text-sm rounded-2xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary shadow-2xs"
                  />
                  <Button
                    type="button"
                    onClick={() => handleAddMarketingFeature()}
                    className="h-12 px-6 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs shrink-0 cursor-pointer shadow-xs"
                  >
                    <IconPlus className="h-4 w-4 mr-1.5" />
                    Add Bullet
                  </Button>
                </div>

                {/* Quick Preset Buttons */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[11px] font-bold text-muted-foreground mr-1">Quick Add:</span>
                  {[
                    "PhilHealth Konsulta & Yakap Ready",
                    "Unlimited SOAP Encounters",
                    "Custom Letterhead & Watermark",
                    "Direct LIS Machine Integration",
                    "Dedicated SLA & Account Manager"
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => handleAddMarketingFeature(preset)}
                      className="px-2.5 py-1 rounded-lg bg-muted hover:bg-muted/80 text-[11px] font-medium text-muted-foreground hover:text-foreground border border-border/60 transition-colors cursor-pointer"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>

                {/* Bullet List Chips */}
                <div className="flex flex-wrap gap-2 pt-2">
                  {marketingFeatures.map((feat, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-background border border-border text-foreground text-xs font-medium shadow-2xs"
                    >
                      <IconCheck className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span>{feat}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveMarketingFeature(idx)}
                        className="text-muted-foreground hover:text-destructive transition-colors ml-1 cursor-pointer"
                      >
                        <IconX className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                  {marketingFeatures.length === 0 && (
                    <div className="w-full py-4 text-center rounded-2xl border border-dashed border-border text-xs text-muted-foreground italic">
                      No marketing comparison bullets added yet. Use the field above to add plan benefits.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: QUANTITATIVE LIMITS */}
          {activeTab === "limits" && (
            <div className="space-y-8 animate-in fade-in duration-200">
              {/* Category Navigation & Control Header */}
              <div className="p-5 rounded-3xl bg-muted/30 border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <IconGauge className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">
                      14 Quantitative Resource Quotas & Ceilings
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Define strict volumetric caps per tenant workspace. Set to{" "}
                      <strong className="text-foreground">Unlimited (-1)</strong> for unrestricted enterprise allocations.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={setAllLimitsUnlimited}
                    className="rounded-xl text-xs font-bold border-primary/30 text-primary hover:bg-primary/5 cursor-pointer"
                  >
                    <IconInfinity className="h-3.5 w-3.5 mr-1.5" />
                    Set All Unlimited (-1)
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={resetLimitsToDefaults}
                    className="rounded-xl text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    Reset Defaults
                  </Button>
                </div>
              </div>

              {/* Categorized Resource Limits Sections */}
              {limitCategories.map((category) => {
                const categoryLimits = QUANTITATIVE_LIMITS.filter((l) => l.category === category);

                return (
                  <div key={category} className="space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-border/80">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-primary" />
                        <h4 className="text-xs font-black uppercase tracking-wider text-foreground">
                          {category}
                        </h4>
                      </div>
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {categoryLimits.length} resource metrics
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {categoryLimits.map((limitDef) => {
                        const currentVal = limits[limitDef.key] ?? limitDef.defaultVal;
                        const isUnlim = currentVal === -1;
                        const IconComponent = limitDef.icon;

                        return (
                          <div
                            key={limitDef.key}
                            className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                              isUnlim
                                ? "bg-primary/5 border-primary/40 shadow-xs"
                                : "bg-card border-border hover:border-border/80 shadow-2xs"
                            }`}
                          >
                            <div>
                              {/* Top Bar with Icon and Unlimited Switch */}
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div
                                    className={`h-8 w-8 rounded-xl flex items-center justify-center shrink-0 ${
                                      isUnlim
                                        ? "bg-primary text-primary-foreground"
                                        : "bg-muted text-muted-foreground"
                                    }`}
                                  >
                                    <IconComponent className="h-4 w-4" />
                                  </div>
                                  <div className="min-w-0">
                                    <span className="text-xs font-bold text-foreground block truncate">
                                      {limitDef.label}
                                    </span>
                                    <code className="text-[10px] font-mono text-muted-foreground block truncate">
                                      {limitDef.key}
                                    </code>
                                  </div>
                                </div>

                                <Button
                                  type="button"
                                  size="sm"
                                  variant={isUnlim ? "default" : "outline"}
                                  onClick={() => toggleUnlimited(limitDef.key, limitDef.defaultVal)}
                                  className={`h-7 px-2.5 text-[10px] font-bold rounded-xl cursor-pointer shrink-0 ${
                                    isUnlim
                                      ? "bg-primary hover:bg-primary/90 text-primary-foreground shadow-2xs"
                                      : "border-border text-muted-foreground hover:text-foreground"
                                  }`}
                                >
                                  <IconInfinity className="h-3.5 w-3.5 mr-1" />
                                  {isUnlim ? "Unlimited" : "Cap"}
                                </Button>
                              </div>

                              <p className="text-[11px] text-muted-foreground mb-3 line-clamp-2 min-h-[32px]">
                                {limitDef.description}
                              </p>
                            </div>

                            {/* Value Controller */}
                            <div className="pt-2 border-t border-border/50">
                              {isUnlim ? (
                                <div className="h-10 px-3 rounded-xl bg-primary/10 border border-primary/25 text-xs font-mono font-bold text-primary flex items-center justify-between">
                                  <div className="flex items-center gap-1.5">
                                    <IconInfinity className="h-4 w-4" />
                                    <span>Uncapped / Unlimited</span>
                                  </div>
                                  <span className="text-[10px] uppercase font-bold tracking-wider opacity-80">
                                    (-1)
                                  </span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleLimitChange(limitDef.key, Math.max(0, currentVal - 1))}
                                    className="h-10 w-9 rounded-xl border border-input bg-background hover:bg-muted text-foreground flex items-center justify-center font-bold text-sm cursor-pointer transition-colors shrink-0"
                                  >
                                    -
                                  </button>

                                  <div className="relative flex-1">
                                    <input
                                      type="number"
                                      min="0"
                                      value={currentVal}
                                      onChange={(e) => {
                                        const parsed = parseInt(e.target.value);
                                        const sanitized = isNaN(parsed) ? 0 : parsed < -1 ? 0 : parsed;
                                        handleLimitChange(limitDef.key, sanitized);
                                      }}
                                      className="w-full h-10 px-3 text-xs font-mono font-bold rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-center"
                                    />
                                    {limitDef.unit && (
                                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] font-bold text-muted-foreground uppercase pointer-events-none">
                                        {limitDef.unit}
                                      </span>
                                    )}
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => handleLimitChange(limitDef.key, currentVal + 1)}
                                    className="h-10 w-9 rounded-xl border border-input bg-background hover:bg-muted text-foreground flex items-center justify-center font-bold text-sm cursor-pointer transition-colors shrink-0"
                                  >
                                    +
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 3: CAPABILITY FLAGS */}
          {activeTab === "features" && (
            <div className="space-y-8 animate-in fade-in duration-200">
              {/* Category Navigation & Control Header */}
              <div className="p-5 rounded-3xl bg-muted/30 border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <IconSparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">
                      10 Enterprise Platform Capability Modules
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Toggle clinical subsystems, statutory compliance integrations, and enterprise security modules.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => toggleAllFeatures(true)}
                    className="rounded-xl text-xs font-bold border-primary/30 text-primary hover:bg-primary/5 cursor-pointer"
                  >
                    <IconCheck className="h-3.5 w-3.5 mr-1.5" />
                    Enable All (10)
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleAllFeatures(false)}
                    className="rounded-xl text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    Disable All
                  </Button>
                </div>
              </div>

              {/* Categorized Capability Sections */}
              {featureCategories.map((category) => {
                const categoryFeatures = CAPABILITY_FLAGS.filter((f) => f.category === category);

                return (
                  <div key={category} className="space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-border/80">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-primary" />
                        <h4 className="text-xs font-black uppercase tracking-wider text-foreground">
                          {category}
                        </h4>
                      </div>
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {categoryFeatures.filter((f) => enabledFeatures.includes(f.key)).length} of{" "}
                        {categoryFeatures.length} Active
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {categoryFeatures.map((feat) => {
                        const isEnabled = enabledFeatures.includes(feat.key);
                        const IconComponent = feat.icon;

                        return (
                          <div
                            key={feat.key}
                            onClick={() => toggleFeature(feat.key)}
                            className={`p-5 rounded-2xl border transition-all cursor-pointer select-none flex flex-col justify-between ${
                              isEnabled
                                ? "bg-primary/5 border-primary/40 shadow-xs ring-1 ring-primary/20"
                                : "bg-card border-border hover:border-border/80 opacity-75 hover:opacity-100 shadow-2xs"
                            }`}
                          >
                            <div>
                              <div className="flex items-start justify-between gap-3 mb-2.5">
                                <div
                                  className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                                    isEnabled
                                      ? "bg-primary text-primary-foreground shadow-2xs"
                                      : "bg-muted text-muted-foreground"
                                  }`}
                                >
                                  <IconComponent className="h-4 w-4" />
                                </div>

                                <div className="flex items-center gap-2">
                                  <span
                                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                                      isEnabled
                                        ? "bg-primary/15 text-primary"
                                        : "bg-muted text-muted-foreground"
                                    }`}
                                  >
                                    {isEnabled ? "Enabled" : "Disabled"}
                                  </span>
                                  <div
                                    className={`h-5 w-9 rounded-full transition-colors relative flex items-center p-0.5 ${
                                      isEnabled ? "bg-primary" : "bg-muted border border-input"
                                    }`}
                                  >
                                    <div
                                      className={`h-4 w-4 rounded-full bg-background shadow-xs transition-transform transform ${
                                        isEnabled ? "translate-x-4" : "translate-x-0"
                                      }`}
                                    />
                                  </div>
                                </div>
                              </div>

                              <span
                                className={`text-xs font-bold block mb-0.5 ${
                                  isEnabled ? "text-primary" : "text-foreground"
                                }`}
                              >
                                {feat.label}
                              </span>
                              <code className="text-[10px] font-mono text-muted-foreground block mb-2">
                                {feat.key}
                              </code>

                              <p className="text-[11px] text-muted-foreground leading-relaxed">
                                {feat.description}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </form>

        {/* ========================================================= */}
        {/* STICKY CLINICAL FOOTER                                    */}
        {/* ========================================================= */}
        <div className="px-6 sm:px-8 py-4 border-t border-border bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {activeTab === "details" && (
              <span>Step 1 of 3: Plan identity, pricing schedules, and marketing bullets</span>
            )}
            {activeTab === "limits" && (
              <span>
                Step 2 of 3: 14 Quantitative ceilings ({unlimitedCount} Unlimited, {14 - unlimitedCount} Capped)
              </span>
            )}
            {activeTab === "features" && (
              <span>
                Step 3 of 3: {enabledFeatures.length} of {CAPABILITY_FLAGS.length} Capability modules enabled
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            {/* Step Jump Navigation */}
            {activeTab === "limits" && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setActiveTab("details")}
                className="rounded-xl text-xs font-bold cursor-pointer"
              >
                <IconArrowLeft className="h-3.5 w-3.5 mr-1" />
                Previous: Pricing
              </Button>
            )}
            {activeTab === "features" && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setActiveTab("limits")}
                className="rounded-xl text-xs font-bold cursor-pointer"
              >
                <IconArrowLeft className="h-3.5 w-3.5 mr-1" />
                Previous: Ceilings
              </Button>
            )}

            {activeTab === "details" && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setActiveTab("limits")}
                className="rounded-xl text-xs font-bold cursor-pointer"
              >
                Next: Ceilings
                <IconArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            )}
            {activeTab === "limits" && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setActiveTab("features")}
                className="rounded-xl text-xs font-bold cursor-pointer"
              >
                Next: Modules
                <IconArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            )}

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
              onClick={() => handleSave()}
              disabled={submitting}
              className="rounded-xl text-xs font-bold px-6 bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer shadow-md transition-all"
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
