import React, { useState, useEffect } from 'react';
import { adminService, BillingPlan } from '@/services/admin.service';
import { toast } from 'sonner';
import {
  IconLoader,
  IconCheck,
  IconX,
  IconStack,
  IconInfinity,
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
  IconCash,
  IconCreditCard,
  IconArrowLeft,
  IconArrowRight,
  IconAlertCircle,
  IconSparkles,
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
    defaultVal: 1,
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
    defaultVal: 1,
    icon: IconBuilding,
  },
  {
    key: 'limit.branches',
    label: 'Branch Locations',
    category: 'Facilities & Hierarchy',
    description: 'Maximum satellite branches or clinic extensions',
    defaultVal: 1,
    icon: IconBuildingHospital,
  },
  {
    key: 'limit.members',
    label: 'Workspace Member Seats',
    category: 'Staff & Infrastructure',
    description: 'Total user accounts permitted within the organization',
    defaultVal: 5,
    icon: IconUsers,
  },
  {
    key: 'limit.staff',
    label: 'Clinical Staff Accounts',
    category: 'Staff & Infrastructure',
    description: 'Doctor, nurse, and medical allied practitioner logins',
    defaultVal: 5,
    icon: IconAddressBook,
  },
  {
    key: 'limit.storage_gb',
    label: 'Cloud Document Storage (GB)',
    category: 'Staff & Infrastructure',
    description: 'Encrypted storage for lab results, scanned films, and notes',
    defaultVal: 10,
    unit: 'GB',
    icon: IconServer,
  },
  {
    key: 'limit.terminals',
    label: 'Active POS / Cashier Terminals',
    category: 'Staff & Infrastructure',
    description: 'Concurrent billing and cash register client terminals',
    defaultVal: 2,
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
    defaultVal: 500,
    icon: IconStethoscope,
  },
  {
    key: 'limit.api_requests_monthly',
    label: 'Monthly API Quota',
    category: 'Clinical Encounters & API',
    description: 'Outbound REST and HL7 FHIR transactional requests',
    defaultVal: 10000,
    icon: IconWebhook,
  },
  {
    key: 'limit.patients',
    label: 'Active Patient Records',
    category: 'Clinical Encounters & API',
    description: 'Total patient longitudinal medical charts in registry',
    defaultVal: 1000,
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
    defaultVal: true,
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
  const [isHighlighted, setIsHighlighted] = useState(false);
  const [slugChecking, setSlugChecking] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);

  // Step 2: Commercials & Pricing
  const [monthlyPrice, setMonthlyPrice] = useState(0);
  const [annualPrice, setAnnualPrice] = useState(0);
  const [requiresCheckout, setRequiresCheckout] = useState(true);
  const [isVatInclusive, setIsVatInclusive] = useState(true);

  // Step 3: Quantitative Limits
  const [limits, setLimits] = useState<Record<string, number>>({});

  // Step 4: Capability Flags
  const [flags, setFlags] = useState<Record<string, boolean>>({});

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    setStep(1);
    if (plan) {
      setName(plan.name || '');
      setSlug(plan.slug || '');
      setRank(plan.rank ?? 1);
      setDescription(plan.description || '');
      setIsHighlighted(Boolean(plan.isHighlighted));
      setMonthlyPrice(plan.monthlyPrice ?? 0);
      setAnnualPrice(plan.annualPrice ?? 0);
      setRequiresCheckout(plan.requiresCheckout !== false);
      setIsVatInclusive(plan.isVatInclusive !== false);

      // Populate limits
      const initialLimits: Record<string, number> = {};
      QUANTITATIVE_LIMITS.forEach((l) => {
        initialLimits[l.key] =
          plan.limits && l.key in plan.limits ? plan.limits[l.key] : l.defaultVal;
      });
      setLimits(initialLimits);

      // Populate flags
      const initialFlags: Record<string, boolean> = {};
      CAPABILITY_FLAGS.forEach((f) => {
        initialFlags[f.key] =
          plan.featuresConfig && f.key in plan.featuresConfig
            ? Boolean(plan.featuresConfig[f.key])
            : f.defaultVal;
      });
      setFlags(initialFlags);
      setSlugAvailable(true);
    } else {
      // New plan defaults
      const nextRank = existingPlans.length > 0 ? Math.max(...existingPlans.map((p) => p.rank ?? 1)) + 1 : 1;
      setName('');
      setSlug('');
      setRank(nextRank);
      setDescription('');
      setIsHighlighted(false);
      setMonthlyPrice(2999);
      setAnnualPrice(29990);
      setRequiresCheckout(true);
      setIsVatInclusive(true);

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

  const handleSlugBlur = async () => {
    const cleanSlug = slug.trim().toLowerCase();
    if (!cleanSlug || (isEditing && plan?.slug === cleanSlug)) {
      setSlugAvailable(true);
      return;
    }
    setSlugChecking(true);
    try {
      const res = await adminService.checkPlanSlug(cleanSlug);
      setSlugAvailable(res.available);
    } catch {
      setSlugAvailable(true);
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

      const payload: Partial<BillingPlan> = {
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
        rank,
        description: description.trim(),
        isHighlighted,
        monthlyPrice,
        annualPrice,
        requiresCheckout,
        isVatInclusive,
        limits: sanitizedLimits,
        featuresConfig: flags,
        features: Object.keys(flags).filter((k) => flags[k]),
      };

      if (isEditing && plan) {
        await adminService.updatePlan(plan.id, payload);
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
                {step === 2 && 'Pricing & BIR VAT'}
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
            </div>
          )}

          {/* STEP 2: Pricing & Commercials */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-semibold text-text">Monthly Price (PHP ₱)</label>
                  <input
                    type="number"
                    value={monthlyPrice}
                    onChange={(e) => setMonthlyPrice(Number(e.target.value))}
                    min={0}
                    step={100}
                    className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-text">Annual Price (PHP ₱)</label>
                  <input
                    type="number"
                    value={annualPrice}
                    onChange={(e) => setAnnualPrice(Number(e.target.value))}
                    min={0}
                    step={500}
                    className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <label className="flex items-center justify-between p-3 rounded-xl bg-surface-muted border border-border cursor-pointer">
                  <div>
                    <div className="font-semibold text-text">12% BIR Value Added Tax (VAT) Inclusive</div>
                    <div className="text-[11px] text-text-muted mt-0.5">
                      Prices configured above already include statutory Philippine VAT breakdown.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={isVatInclusive}
                    onChange={(e) => setIsVatInclusive(e.target.checked)}
                    className="rounded text-primary focus:ring-primary h-4 w-4"
                  />
                </label>

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
