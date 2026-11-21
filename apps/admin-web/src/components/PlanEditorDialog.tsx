import React, { useState, useEffect } from 'react';
import {
  adminService,
  BillingPlan,
  CreateBillingPlanPayload,
  UpdateBillingPlanPayload,
} from '@/services/admin.service';
import { toast } from 'sonner';
import {
  IconLoader,
  IconX,
  IconStack,
  IconBuildingHospital,
  IconFlask,
  IconPill,
  IconBuilding,
  IconUsers,
  IconDeviceDesktop,
  IconHospital,
  IconTestPipe,
  IconAddressBook,
  IconStethoscope,
  IconWebhook,
  IconVideo,
  IconShieldCheck,
  IconArrowsExchange,
  IconServer,
  IconChartBar,
  IconFileText,
  IconArrowLeft,
  IconArrowRight,
  IconPercentage,
} from '@tabler/icons-react';

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
  category: 'Facilities & Hierarchy' | 'Staff & Infrastructure' | 'Clinical Encounters & API';
  description: string;
  defaultVal: number;
  unit?: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const QUANTITATIVE_LIMITS: LimitMetadata[] = [
  {
    key: 'limit.clinics',
    label: 'Clinics / Outpatient Centers',
    category: 'Facilities & Hierarchy',
    description: 'Primary care clinic facilities permitted under this plan',
    defaultVal: 0,
    icon: IconBuildingHospital,
  },
  {
    key: 'limit.laboratories',
    label: 'Diagnostic Laboratories',
    category: 'Facilities & Hierarchy',
    description: 'Clinical diagnostic laboratory units per workspace',
    defaultVal: 0,
    icon: IconFlask,
  },
  {
    key: 'limit.pharmacies',
    label: 'Dispensary Pharmacies',
    category: 'Facilities & Hierarchy',
    description: 'Retail or in-clinic dispensary pharmacy locations',
    defaultVal: 0,
    icon: IconPill,
  },
  {
    key: 'limit.organizations',
    label: 'Health Organizations',
    category: 'Facilities & Hierarchy',
    description: 'Parent corporate networks or hospital health systems',
    defaultVal: 0,
    icon: IconBuilding,
  },
  {
    key: 'limit.branches',
    label: 'Branch Locations',
    category: 'Facilities & Hierarchy',
    description: 'Maximum satellite branches or clinic extensions',
    defaultVal: 0,
    icon: IconBuildingHospital,
  },
  {
    key: 'limit.members',
    label: 'Workspace Member Seats',
    category: 'Staff & Infrastructure',
    description: 'Total user accounts permitted within the organization',
    defaultVal: 0,
    icon: IconUsers,
  },
  {
    key: 'limit.staff',
    label: 'Clinical Staff Accounts',
    category: 'Staff & Infrastructure',
    description: 'Doctor, nurse, and medical allied practitioner logins',
    defaultVal: 0,
    icon: IconAddressBook,
  },
  {
    key: 'limit.storage_gb',
    label: 'Cloud Document Storage (GB)',
    category: 'Staff & Infrastructure',
    description: 'Encrypted storage for lab results, scanned films, and notes',
    defaultVal: 0,
    unit: 'GB',
    icon: IconServer,
  },
  {
    key: 'limit.terminals',
    label: 'Active POS / Cashier Terminals',
    category: 'Staff & Infrastructure',
    description: 'Concurrent billing and cash register client terminals',
    defaultVal: 0,
    icon: IconDeviceDesktop,
  },
  {
    key: 'limit.beds',
    label: 'Inpatient Bed Capacity',
    category: 'Staff & Infrastructure',
    description: 'Active bed monitoring allocation for observation wards',
    defaultVal: 0,
    icon: IconHospital,
  },
  {
    key: 'limit.analyzers',
    label: 'LIS Laboratory Analyzers',
    category: 'Staff & Infrastructure',
    description: 'Automated hematology and chemistry machine interfaces',
    defaultVal: 0,
    icon: IconTestPipe,
  },
  {
    key: 'limit.monthly_consultations',
    label: 'Monthly Consultations',
    category: 'Clinical Encounters & API',
    description: 'Clinical encounters and doctor appointments per month',
    defaultVal: 0,
    icon: IconStethoscope,
  },
  {
    key: 'limit.api_requests_monthly',
    label: 'Monthly API Quota',
    category: 'Clinical Encounters & API',
    description: 'Outbound REST and HL7 FHIR transactional requests',
    defaultVal: 0,
    icon: IconWebhook,
  },
  {
    key: 'limit.patients',
    label: 'Active Patient Records',
    category: 'Clinical Encounters & API',
    description: 'Total patient longitudinal medical charts in registry',
    defaultVal: 0,
    icon: IconAddressBook,
  },
];

export interface CapabilityFlagMetadata {
  key: string;
  label: string;
  description: string;
  defaultVal: boolean;
  icon: React.ComponentType<{ className?: string }>;
}

export const CAPABILITY_FLAGS: CapabilityFlagMetadata[] = [
  {
    key: 'feature.cross_tenant_interop',
    label: 'Cross-Tenant Interoperability & LIS Hub',
    description: 'Send and receive lab orders and claims with external facilities via Interop Hub',
    defaultVal: false,
    icon: IconArrowsExchange,
  },
  {
    key: 'feature.teleconsultation',
    label: 'Native Teleconsultation & Video Encounters',
    description: 'Integrated secure WebRTC video room encounters for patients',
    defaultVal: false,
    icon: IconVideo,
  },
  {
    key: 'feature.electronic_prescriptions',
    label: 'FDA/PRC-Signed Electronic Prescriptions',
    description: 'Digitally signed prescriptions with QR verification tokens',
    defaultVal: false,
    icon: IconFileText,
  },
  {
    key: 'feature.lis_integration',
    label: 'Direct HL7 / FHIR Laboratory Integration',
    description: 'Bidirectional sync with automated lab analyzers and diagnostic systems',
    defaultVal: false,
    icon: IconFlask,
  },
  {
    key: 'feature.inventory_management',
    label: 'Real-Time Pharmaceutical Inventory',
    description: 'Stock batch tracking, expiration alerts, and stockout prevention',
    defaultVal: false,
    icon: IconPill,
  },
  {
    key: 'feature.philhealth_konsulta',
    label: 'PhilHealth Konsulta (Yakap) Transmittal',
    description: 'Direct statutory claims generation, XML schema validation, and e-claims dispatch',
    defaultVal: false,
    icon: IconShieldCheck,
  },
  {
    key: 'feature.multi_terminal_sync',
    label: 'Multi-Terminal Edge LAN Synchronization',
    description: 'Zero-latency offline-first local synchronization across clinic front desks',
    defaultVal: false,
    icon: IconDeviceDesktop,
  },
  {
    key: 'feature.advanced_analytics',
    label: 'Advanced Clinical & Financial Analytics',
    description: 'Cohort health indicators, revenue projection, and provider performance metrics',
    defaultVal: false,
    icon: IconChartBar,
  },
  {
    key: 'feature.custom_letterhead',
    label: 'Custom Clinical Letterheads & Branding',
    description: 'White-label header templates, clinic logos, and custom watermark PDFs',
    defaultVal: false,
    icon: IconFileText,
  },
  {
    key: 'feature.on_prem',
    label: 'Local Edge Server Deployments (On-Premises)',
    description: 'Deploy Clinic EZ local appliance server within internal clinic hospital LAN',
    defaultVal: false,
    icon: IconServer,
  },
];

export interface AnnualPricingSummary {
  annualBaseline: number;
  annualSavings: number;
  discountPercent: number;
  effectiveMonthlyOnAnnual: number;
  isMarkup: boolean;
  isCustomOrFree: boolean;
}

export interface AnnualDiscountPreset {
  label: string;
  percent: number;
  exactMonthsBilled?: number;
}

export const ANNUAL_DISCOUNT_PRESETS: ReadonlyArray<AnnualDiscountPreset> = [
  { label: '0%', percent: 0, exactMonthsBilled: 12 },
  { label: '1 Mo Free (8.33%)', percent: 8.33, exactMonthsBilled: 11 },
  { label: '10%', percent: 10 },
  { label: '15%', percent: 15 },
  { label: '2 Mos Free (16.67%)', percent: 16.67, exactMonthsBilled: 10 },
  { label: '20%', percent: 20 },
  { label: '25%', percent: 25 },
];

export function calculateAnnualDiscountPercent(
  monthlyPrice: number,
  annualPrice: number
): number {
  if (
    !Number.isFinite(monthlyPrice) ||
    !Number.isFinite(annualPrice) ||
    monthlyPrice <= 0
  ) {
    return 0;
  }
  const baseline = monthlyPrice * 12;
  const safeAnnual = Math.max(0, annualPrice);
  const raw = ((baseline - safeAnnual) / baseline) * 100;
  return Math.round(raw * 100) / 100;
}

export function calculateAnnualPriceFromDiscount(
  monthlyPrice: number,
  discountPercent: number,
  exactMonthsBilled?: number
): number {
  if (!Number.isFinite(monthlyPrice) || monthlyPrice <= 0) {
    return 0;
  }
  if (
    typeof exactMonthsBilled === 'number' &&
    Number.isFinite(exactMonthsBilled) &&
    exactMonthsBilled >= 0 &&
    exactMonthsBilled <= 12
  ) {
    return Math.round(monthlyPrice * exactMonthsBilled * 100) / 100;
  }
  const safeDiscount = Number.isFinite(discountPercent)
    ? Math.min(100, Math.max(0, discountPercent))
    : 0;
  const baseline = monthlyPrice * 12;
  const computed = baseline * (1 - safeDiscount / 100);
  return Math.round(computed * 100) / 100;
}

export function calculateAnnualPricingSummary(
  monthlyPrice: number,
  annualPrice: number
): AnnualPricingSummary {
  const safeMonthly = Number.isFinite(monthlyPrice) ? Math.max(0, monthlyPrice) : 0;
  const safeAnnual = Number.isFinite(annualPrice) ? Math.max(0, annualPrice) : 0;
  const annualBaseline = Math.round(safeMonthly * 12 * 100) / 100;
  const annualSavings = Math.round((annualBaseline - safeAnnual) * 100) / 100;
  const discountPercent = calculateAnnualDiscountPercent(safeMonthly, safeAnnual);
  const effectiveMonthlyOnAnnual =
    safeAnnual > 0 ? Math.round((safeAnnual / 12) * 100) / 100 : 0;

  return {
    annualBaseline,
    annualSavings,
    discountPercent,
    effectiveMonthlyOnAnnual,
    isMarkup: safeMonthly > 0 && safeAnnual > annualBaseline,
    isCustomOrFree: safeMonthly === 0 && safeAnnual === 0,
  };
}

export function PlanEditorDialog({
  isOpen,
  onClose,
  onSaved,
  plan,
  existingPlans = [],
}: PlanEditorDialogProps) {
  const isEditing = Boolean(plan);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1: Basic Identity
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [rank, setRank] = useState(1);
  const [description, setDescription] = useState('');
  const [marketingFeaturesText, setMarketingFeaturesText] = useState('');
  const [isHighlighted, setIsHighlighted] = useState(false);
  const [slugChecking, setSlugChecking] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);

  // Step 2: Commercials & Pricing
  const [monthlyPrice, setMonthlyPrice] = useState(0);
  const [annualPrice, setAnnualPrice] = useState(0);
  const [discountInput, setDiscountInput] = useState('0');
  const [autoSyncAnnual, setAutoSyncAnnual] = useState(true);
  const [exactMonthsPreset, setExactMonthsPreset] = useState<number | undefined>(12);
  const [requiresCheckout, setRequiresCheckout] = useState(false);

  // Step 3: Quantitative Limits
  const [limits, setLimits] = useState<Record<string, number>>({});

  // Step 4: Capability Flags
  const [flags, setFlags] = useState<Record<string, boolean>>({});

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    setStep(1);
    if (plan) {
      const initMonthly = plan.monthlyPrice ?? 0;
      const initAnnual = plan.annualPrice ?? 0;
      const initDiscount = calculateAnnualDiscountPercent(initMonthly, initAnnual);

      setName(plan.name || '');
      setSlug(plan.slug || '');
      setRank(plan.rank ?? 1);
      setDescription(plan.description || '');
      setMarketingFeaturesText((plan.features || []).join('\n'));
      setIsHighlighted(Boolean(plan.highlighted));
      setMonthlyPrice(initMonthly);
      setAnnualPrice(initAnnual);
      setDiscountInput(String(Math.max(0, initDiscount)));
      setAutoSyncAnnual(false);
      setExactMonthsPreset(undefined);
      setRequiresCheckout(Boolean(plan.requiresCheckout));

      // Populate limits from persisted plan record
      const initialLimits: Record<string, number> = {};
      QUANTITATIVE_LIMITS.forEach((l) => {
        initialLimits[l.key] =
          plan.limits && l.key in plan.limits ? plan.limits[l.key] : l.defaultVal;
      });
      setLimits(initialLimits);

      // Populate capability flags from persisted enabledFeatures
      const enabledSet = new Set(plan.enabledFeatures || []);
      const initialFlags: Record<string, boolean> = {};
      CAPABILITY_FLAGS.forEach((f) => {
        initialFlags[f.key] = enabledSet.has(f.key);
      });
      setFlags(initialFlags);
      setSlugAvailable(true);
    } else {
      const nextRank =
        existingPlans.length > 0 ? Math.max(...existingPlans.map((p) => p.rank ?? 0)) + 1 : 1;
      setName('');
      setSlug('');
      setRank(nextRank);
      setDescription('');
      setMarketingFeaturesText('');
      setIsHighlighted(false);
      setMonthlyPrice(0);
      setAnnualPrice(0);
      setDiscountInput('0');
      setAutoSyncAnnual(true);
      setExactMonthsPreset(12);
      setRequiresCheckout(false);

      const initialLimits: Record<string, number> = {};
      QUANTITATIVE_LIMITS.forEach((l) => {
        initialLimits[l.key] = l.defaultVal;
      });
      setLimits(initialLimits);

      const initialFlags: Record<string, boolean> = {};
      CAPABILITY_FLAGS.forEach((f) => {
        initialFlags[f.key] = f.defaultVal;
      });
      setFlags(initialFlags);
      setSlugAvailable(null);
    }
  }, [isOpen, plan, existingPlans]);

  const pricingSummary = calculateAnnualPricingSummary(monthlyPrice, annualPrice);

  const handleMonthlyPriceChange = (rawValue: string) => {
    const parsed = rawValue === '' ? 0 : Number(rawValue);
    const nextMonthly = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    setMonthlyPrice(nextMonthly);

    if (autoSyncAnnual) {
      const pct = parseFloat(discountInput);
      const safePct = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
      setAnnualPrice(
        calculateAnnualPriceFromDiscount(nextMonthly, safePct, exactMonthsPreset)
      );
    } else {
      const liveDiscount = calculateAnnualDiscountPercent(nextMonthly, annualPrice);
      setDiscountInput(String(Math.max(0, liveDiscount)));
    }
  };

  const handleDiscountInputChange = (rawValue: string) => {
    setExactMonthsPreset(undefined);
    setAutoSyncAnnual(true);

    if (rawValue === '') {
      setDiscountInput('');
      setAnnualPrice(calculateAnnualPriceFromDiscount(monthlyPrice, 0));
      return;
    }

    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) return;

    const clamped = Math.min(100, Math.max(0, parsed));
    setDiscountInput(parsed !== clamped ? String(clamped) : rawValue);
    setAnnualPrice(calculateAnnualPriceFromDiscount(monthlyPrice, clamped));
  };

  const handleApplyDiscountPreset = (preset: AnnualDiscountPreset) => {
    setAutoSyncAnnual(true);
    setExactMonthsPreset(preset.exactMonthsBilled);
    setDiscountInput(String(preset.percent));
    setAnnualPrice(
      calculateAnnualPriceFromDiscount(
        monthlyPrice,
        preset.percent,
        preset.exactMonthsBilled
      )
    );
  };

  const handleAnnualPriceChange = (rawValue: string) => {
    const parsed = rawValue === '' ? 0 : Number(rawValue);
    const nextAnnual = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    setAnnualPrice(nextAnnual);
    setAutoSyncAnnual(false);
    setExactMonthsPreset(undefined);
    const liveDiscount = calculateAnnualDiscountPercent(monthlyPrice, nextAnnual);
    setDiscountInput(String(Math.max(0, liveDiscount)));
  };

  const handleToggleAutoSync = () => {
    const nextAuto = !autoSyncAnnual;
    setAutoSyncAnnual(nextAuto);
    if (nextAuto) {
      const pct = parseFloat(discountInput);
      const safePct = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
      setAnnualPrice(
        calculateAnnualPriceFromDiscount(monthlyPrice, safePct, exactMonthsPreset)
      );
    }
  };

  const handleSlugBlur = async () => {
    const cleanSlug = slug.trim().toLowerCase();
    if (!cleanSlug || (isEditing && plan?.slug === cleanSlug)) {
      setSlugAvailable(true);
      return;
    }
    setSlugChecking(true);
    try {
      const excludePlanId = isEditing ? plan?.planId || plan?.id : undefined;
      const res = await adminService.checkPlanSlug(cleanSlug, excludePlanId);
      setSlugAvailable(res.available);
    } catch {
      setSlugAvailable(null);
    } finally {
      setSlugChecking(false);
    }
  };

  const handleLimitChange = (key: string, val: number) => {
    const sanitized = val < -1 ? 0 : val;
    setLimits((prev) => ({ ...prev, [key]: sanitized }));
  };

  const handleFlagToggle = (key: string) => {
    setFlags((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('Plan name is required.');
      setStep(1);
      return;
    }
    if (!slug.trim()) {
      toast.error('Plan slug is required.');
      setStep(1);
      return;
    }
    if (slugAvailable === false) {
      toast.error('The specified plan slug is already in use.');
      setStep(1);
      return;
    }

    setSubmitting(true);
    try {
      const sanitizedLimits: Record<string, number> = {};
      Object.entries(limits).forEach(([k, v]) => {
        sanitizedLimits[k] = v < -1 ? 0 : v;
      });

      const enabledFeatures = Object.keys(flags).filter((k) => flags[k]);
      const marketingBullets = marketingFeaturesText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

      const payload: CreateBillingPlanPayload & UpdateBillingPlanPayload = {
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
        rank,
        description: description.trim(),
        isHighlighted,
        monthlyPrice,
        annualPrice,
        requiresCheckout,
        limits: sanitizedLimits,
        enabledFeatures,
        features: marketingBullets,
      };

      if (isEditing && plan) {
        await adminService.updatePlan(plan.planId || plan.id, payload);
        toast.success(`Commercial plan '${name}' updated successfully.`);
      } else {
        await adminService.createPlan(payload);
        toast.success(`Commercial plan '${name}' created successfully.`);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to save plan');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col text-text"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary-subtle text-primary">
              <IconStack className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-text">
                {isEditing ? `Edit Commercial Plan — ${plan?.name}` : 'Author Commercial Subscription Plan'}
              </h2>
              <p className="text-xs text-text-muted mt-0.5">
                Step {step} of 4: {step === 1 && 'Basic Identity'}
                {step === 2 && 'Commercial Pricing'}
                {step === 3 && '14 Quantitative Limits'}
                {step === 4 && '10 Capability Feature Flags'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-text-muted hover:text-text cursor-pointer"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="grid grid-cols-4 border-b border-border text-center text-xs font-semibold">
          {[
            { num: 1, label: 'Identity' },
            { num: 2, label: 'Pricing' },
            { num: 3, label: 'Limits (14)' },
            { num: 4, label: 'Features (10)' },
          ].map((s) => (
            <button
              key={s.num}
              type="button"
              onClick={() => setStep(s.num as any)}
              className={`py-2.5 border-b-2 transition-all cursor-pointer ${
                step === s.num
                  ? 'border-primary text-primary bg-primary-subtle/50'
                  : 'border-transparent text-text-muted hover:text-text'
              }`}
            >
              <span>
                {s.num}. {s.label}
              </span>
            </button>
          ))}
        </div>

        {/* Form Body */}
        <div className="p-6 max-h-[65vh] overflow-y-auto text-xs space-y-4">
          {/* STEP 1: Basic Identity */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-semibold text-text">Plan Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (!isEditing && !slug) {
                        setSlug(
                          e.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9]+/g, '-')
                            .replace(/(^-|-$)+/g, '')
                        );
                      }
                    }}
                    placeholder="e.g. Clinical Practice Pro"
                    className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-text flex items-center justify-between">
                    <span>URL Slug</span>
                    {slugChecking && (
                      <span className="text-[10px] text-text-muted flex items-center gap-1 font-normal">
                        <IconLoader className="h-3 w-3 animate-spin" /> Checking...
                      </span>
                    )}
                    {!slugChecking && slugAvailable === true && (
                      <span className="text-[10px] text-emerald-600 font-semibold">Available</span>
                    )}
                    {!slugChecking && slugAvailable === false && (
                      <span className="text-[10px] text-red-600 font-semibold">Unavailable</span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => {
                      setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, ''));
                      setSlugAvailable(null);
                    }}
                    onBlur={handleSlugBlur}
                    placeholder="e.g. pro-tier"
                    className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-semibold text-text">Ladder Rank (Ordering)</label>
                  <input
                    type="number"
                    value={rank}
                    onChange={(e) => setRank(Number(e.target.value))}
                    min={1}
                    className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1.5 flex flex-col justify-end">
                  <label className="flex items-center gap-3 p-2.5 rounded-xl bg-surface-muted border border-border cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isHighlighted}
                      onChange={(e) => setIsHighlighted(e.target.checked)}
                      className="rounded text-primary focus:ring-primary h-4 w-4"
                    />
                    <span className="font-medium text-text">Highlighted / Most Popular Badge</span>
                  </label>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-text">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Comprehensive clinical workstation suite for group practices and specialty clinics..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text focus:outline-hidden"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-text">Marketing Feature Highlights (One per line)</label>
                <textarea
                  value={marketingFeaturesText}
                  onChange={(e) => setMarketingFeaturesText(e.target.value)}
                  placeholder="Enter public-facing plan feature bullets, one per line..."
                  rows={4}
                  className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text focus:outline-hidden"
                />
              </div>
            </div>
          )}

          {/* STEP 2: Pricing & Commercials */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Monthly Price */}
                <div className="space-y-1.5">
                  <label htmlFor="plan-monthly-price" className="font-semibold text-text block">
                    Monthly Price (PHP)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted font-mono">
                      ₱
                    </span>
                    <input
                      id="plan-monthly-price"
                      type="number"
                      value={monthlyPrice}
                      onChange={(e) => handleMonthlyPriceChange(e.target.value)}
                      min={0}
                      step="any"
                      className="w-full pl-7 pr-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono focus:outline-hidden focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div className="text-[10px] text-text-muted font-mono">
                    12× baseline: ₱{pricingSummary.annualBaseline.toLocaleString()}/yr
                  </div>
                </div>

                {/* Annual Discount Percentage */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-1">
                    <label htmlFor="plan-annual-discount" className="font-semibold text-text">
                      Annual Discount
                    </label>
                    <button
                      type="button"
                      onClick={handleToggleAutoSync}
                      title="Toggle automatic annual price calculation from discount percentage"
                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                        autoSyncAnnual
                          ? 'bg-primary-subtle text-primary border border-primary/20'
                          : 'bg-surface-muted text-text-muted border border-border hover:text-text'
                      }`}
                    >
                      {autoSyncAnnual ? 'Auto-set ON' : 'Manual'}
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      id="plan-annual-discount"
                      type="number"
                      value={discountInput}
                      onChange={(e) => handleDiscountInputChange(e.target.value)}
                      onBlur={() => {
                        if (discountInput.trim() === '') {
                          setDiscountInput('0');
                        }
                      }}
                      min={0}
                      max={100}
                      step="any"
                      placeholder="0"
                      className="w-full pl-3 pr-8 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono focus:outline-hidden focus:ring-1 focus:ring-primary"
                    />
                    <IconPercentage className="h-3.5 w-3.5 text-text-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                  <div className="text-[10px] text-text-muted">
                    {autoSyncAnnual
                      ? 'Auto-updates Annual Price in real time'
                      : 'Reflects live discount vs 12× monthly'}
                  </div>
                </div>

                {/* Annual Price */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-1">
                    <label htmlFor="plan-annual-price" className="font-semibold text-text">
                      Annual Price (PHP)
                    </label>
                    {autoSyncAnnual && (
                      <span className="text-[10px] font-mono text-primary font-semibold">
                        Auto
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted font-mono">
                      ₱
                    </span>
                    <input
                      id="plan-annual-price"
                      type="number"
                      value={annualPrice}
                      onChange={(e) => handleAnnualPriceChange(e.target.value)}
                      min={0}
                      step="any"
                      className="w-full pl-7 pr-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono focus:outline-hidden focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div className="text-[10px] text-text-muted font-mono">
                    Effective: ₱{pricingSummary.effectiveMonthlyOnAnnual.toLocaleString()}/mo
                  </div>
                </div>
              </div>

              {/* Quick Discount Percentage Presets */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-text-secondary">
                  Quick Annual Discount Presets (click to auto-set Annual Price)
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ANNUAL_DISCOUNT_PRESETS.map((preset) => {
                    const isSelected =
                      !pricingSummary.isMarkup &&
                      monthlyPrice > 0 &&
                      Math.abs(pricingSummary.discountPercent - preset.percent) <= 0.02;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => handleApplyDiscountPreset(preset)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-primary text-white border-primary'
                            : 'bg-surface-muted text-text-secondary border-border hover:text-text hover:border-primary/40'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Real-Time Annual Discount & Savings Preview Card */}
              <div
                className={`p-3.5 rounded-xl border space-y-2.5 ${
                  pricingSummary.isMarkup
                    ? 'bg-amber-500/10 border-amber-500/30'
                    : pricingSummary.discountPercent > 0
                    ? 'bg-primary-subtle/60 border-primary/20'
                    : 'bg-surface-muted border-border'
                }`}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-semibold text-text">
                    Real-Time Annual Pricing Preview
                  </span>
                  {pricingSummary.isCustomOrFree ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-surface border border-border text-text-muted">
                      Custom / Zero-Cost Tier
                    </span>
                  ) : pricingSummary.isMarkup ? (
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-700 dark:text-amber-300">
                        +{Math.abs(pricingSummary.discountPercent)}% Above 12× Monthly
                      </span>
                      <button
                        type="button"
                        onClick={() => handleApplyDiscountPreset(ANNUAL_DISCOUNT_PRESETS[0])}
                        className="text-[10px] font-semibold text-primary underline cursor-pointer"
                      >
                        Match 12× Monthly
                      </button>
                    </div>
                  ) : pricingSummary.discountPercent > 0 ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
                      Save {pricingSummary.discountPercent}% Annually
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-surface border border-border text-text-muted">
                      0% Annual Discount
                    </span>
                  )}
                </div>

                {!pricingSummary.isCustomOrFree && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-border/70 text-[11px]">
                    <div>
                      <div className="text-text-muted">12× Monthly</div>
                      <div className="font-mono font-semibold text-text">
                        ₱{pricingSummary.annualBaseline.toLocaleString()}/yr
                      </div>
                    </div>
                    <div>
                      <div className="text-text-muted">Annual Billed</div>
                      <div className="font-mono font-semibold text-text">
                        ₱{annualPrice.toLocaleString()}/yr
                      </div>
                    </div>
                    <div>
                      <div className="text-text-muted">Effective Monthly</div>
                      <div className="font-mono font-semibold text-text">
                        ₱{pricingSummary.effectiveMonthlyOnAnnual.toLocaleString()}/mo
                      </div>
                    </div>
                    <div>
                      <div className="text-text-muted">
                        {pricingSummary.isMarkup ? 'Annual Markup' : 'Annual Savings'}
                      </div>
                      <div
                        className={`font-mono font-bold ${
                          pricingSummary.isMarkup
                            ? 'text-amber-600 dark:text-amber-400'
                            : pricingSummary.annualSavings > 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-text-secondary'
                        }`}
                      >
                        {pricingSummary.isMarkup
                          ? `+₱${Math.abs(pricingSummary.annualSavings).toLocaleString()}/yr`
                          : `₱${pricingSummary.annualSavings.toLocaleString()}/yr`}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2 pt-1">
                <label className="flex items-center justify-between p-3 rounded-xl bg-surface-muted border border-border cursor-pointer">
                  <div>
                    <div className="font-semibold text-text">Requires Commercial Checkout</div>
                    <div className="text-[11px] text-text-muted mt-0.5">
                      Enforces online payment or manual staff invoice settlement before issuance.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={requiresCheckout}
                    onChange={(e) => setRequiresCheckout(e.target.checked)}
                    className="rounded text-primary focus:ring-primary h-4 w-4"
                  />
                </label>
              </div>
            </div>
          )}

          {/* STEP 3: 14 Quantitative Limits */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-[11px] text-text-muted">
                Specify numeric quotas. Enter <span className="font-mono font-bold">-1</span> for unlimited capacity.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {QUANTITATIVE_LIMITS.map((lim) => {
                  const Icon = lim.icon;
                  const currentVal = limits[lim.key] ?? lim.defaultVal;
                  const isUnlimited = currentVal === -1;

                  return (
                    <div
                      key={lim.key}
                      className="p-3 rounded-xl bg-surface-muted border border-border space-y-2 flex flex-col justify-between"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-primary shrink-0" />
                          <span className="font-semibold text-text">{lim.label}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleLimitChange(lim.key, isUnlimited ? lim.defaultVal : -1)}
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition-colors cursor-pointer ${
                            isUnlimited
                              ? 'bg-primary text-white'
                              : 'bg-surface border border-border text-text-muted hover:text-text'
                          }`}
                        >
                          {isUnlimited ? 'Unlimited' : 'Set ∞'}
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={currentVal}
                          onChange={(e) => handleLimitChange(lim.key, Number(e.target.value))}
                          disabled={isUnlimited}
                          min={-1}
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

          {/* STEP 4: 10 Capability Feature Flags */}
          {step === 4 && (
            <div className="space-y-3">
              <p className="text-[11px] text-text-muted">
                Toggle clinical capabilities and administrative entitlements included in this tier.
              </p>

              <div className="space-y-2">
                {CAPABILITY_FLAGS.map((cap) => {
                  const Icon = cap.icon;
                  const isEnabled = Boolean(flags[cap.key]);

                  return (
                    <button
                      key={cap.key}
                      type="button"
                      onClick={() => handleFlagToggle(cap.key)}
                      className={`w-full p-3 rounded-xl border text-left flex items-start justify-between gap-3 transition-colors cursor-pointer ${
                        isEnabled
                          ? 'border-primary bg-primary-subtle text-text'
                          : 'border-border bg-surface hover:bg-surface-muted text-text-secondary'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${
                            isEnabled ? 'bg-primary text-white' : 'bg-surface-muted text-text-muted'
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <div className={`font-semibold ${isEnabled ? 'text-primary' : 'text-text'}`}>
                            {cap.label}
                          </div>
                          <div className="text-[11px] text-text-muted mt-0.5">{cap.description}</div>
                        </div>
                      </div>
                      <div
                        className={`h-5 w-9 rounded-full transition-colors flex items-center p-0.5 shrink-0 ${
                          isEnabled ? 'bg-primary justify-end' : 'bg-border justify-start'
                        }`}
                      >
                        <div className="h-4 w-4 rounded-full bg-white shadow-xs" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="p-4 bg-surface-muted border-t border-border flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              if (step > 1) setStep((s) => (s - 1) as any);
              else onClose();
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-text-secondary hover:text-text rounded-xl transition-colors cursor-pointer"
          >
            {step > 1 ? (
              <>
                <IconArrowLeft className="h-4 w-4" />
                <span>Back</span>
              </>
            ) : (
              <span>Cancel</span>
            )}
          </button>

          <div className="flex items-center gap-3">
            {step < 4 ? (
              <button
                type="button"
                onClick={() => setStep((s) => (s + 1) as any)}
                className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded-xl transition-colors cursor-pointer shadow-xs"
              >
                <span>Continue</span>
                <IconArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="inline-flex items-center gap-2 px-6 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded-xl transition-colors cursor-pointer shadow-xs disabled:opacity-50"
              >
                {submitting && <IconLoader className="h-4 w-4 animate-spin" />}
                <span>{isEditing ? 'Save Plan Changes' : 'Create Commercial Plan'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
