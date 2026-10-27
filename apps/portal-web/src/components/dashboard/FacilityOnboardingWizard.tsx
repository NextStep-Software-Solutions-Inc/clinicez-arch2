"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/transport/apiClient";
import { useBillingInfo } from "@/hooks/useBilling";
import { useEntitlements } from "@/hooks/useEntitlements";
import { useHubCredentials } from "@/components/dashboard/HubCredentialsDialog";
import { facilityService, type FacilityKind } from "@/services/facility.service";
import { branchService, type BranchDto } from "@/services/branch.service";
import { ENTITLEMENT_KEYS } from "@/services/entitlement.service";
import type { FacilityDeploymentMode } from "@/services/tenant.service";
import { toastApiError } from "@/lib/apiToast";
import Link from "next/link";
import { toast } from "sonner";
import {
  PHILIPPINE_REGIONS,
  FACILITY_CLASSIFICATIONS,
  PhilippineRegion,
  PhilippineProvince,
  PhilippineCity,
} from "@/constants/philippine-addresses";
import { cn } from "@/lib/utils";
import {
  IconBuildingHospital,
  IconBuilding,
  IconCheck,
  IconArrowRight,
  IconArrowLeft,
  IconLoader,
  IconFileCertificate,
  IconMapPin,
  IconShieldCheck,
  IconAlertTriangle,
  IconInfoCircle,
  IconChevronDown,
  IconChevronUp,
  IconHospital,
  IconTestPipe,
  IconPill,
} from "@tabler/icons-react";
import { getConsoleBaseDomain } from "@/utils/domain";
import { APP_SUBDOMAINS } from "@/config/site";

const FACILITY_TYPE_OPTIONS = [
  {
    type: "clinic" as const,
    label: "Clinic",
    desc: "Outpatient consultations, EHR & medical records",
    icon: IconHospital,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    activeBorder: "border-blue-600 bg-blue-500/5 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/20 shadow-xs",
  },
  {
    type: "laboratory" as const,
    label: "Laboratory",
    desc: "Diagnostic orders, specimen tracking & LIS",
    icon: IconTestPipe,
    color: "text-purple-500",
    bg: "bg-purple-500/10",
    activeBorder: "border-purple-600 bg-purple-500/5 text-purple-700 dark:text-purple-300 ring-2 ring-purple-500/20 shadow-xs",
  },
  {
    type: "pharmacy" as const,
    label: "Pharmacy",
    desc: "Drug dispensing, inventory & prescription fulfillment",
    icon: IconPill,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    activeBorder: "border-emerald-600 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/20 shadow-xs",
  },
  {
    type: "organization" as const,
    label: "Organization",
    desc: "Hospital networks, HMOs & provider administration",
    icon: IconBuilding,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    activeBorder: "border-amber-600 bg-amber-500/5 text-amber-700 dark:text-amber-300 ring-2 ring-amber-500/20 shadow-xs",
  },
];

interface FacilityOnboardingWizardProps {
  initialType?: "clinic" | "laboratory" | "pharmacy" | "organization" | null;
  targetBranch?: BranchDto | null;
  targetBranchId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFacilityCreated?: (facilityId?: string) => void;
}

export default function FacilityOnboardingWizard({
  initialType,
  targetBranch,
  targetBranchId,
  open,
  onOpenChange,
  onFacilityCreated,
}: FacilityOnboardingWizardProps) {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenantSlug = params?.tenant as string;
  const { billingInfo } = useBillingInfo(tenantSlug);

  const [facilityType, setFacilityType] = useState<"clinic" | "laboratory" | "pharmacy" | "organization">(
    (initialType || (searchParams.get("create") as any) || "clinic")
  );

  useEffect(() => {
    if (initialType) {
      setFacilityType(initialType);
    }
  }, [initialType]);

  const normalizedFacilityType = (facilityType.charAt(0).toUpperCase() + facilityType.slice(1)) as FacilityKind;

  // Branch foundation state
  const [selectedBranch, setSelectedBranch] = useState<BranchDto | null>(targetBranch || null);
  const [availableBranches, setAvailableBranches] = useState<BranchDto[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [customizeLocation, setCustomizeLocation] = useState(false);

  const occupiedFacilityTypes = (selectedBranch?.facilities || []).map((f) => f.facilityType.toLowerCase());

  // Stepper state
  const [currentStep, setCurrentStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Deployment
  const [deploymentMode, setDeploymentMode] = useState<FacilityDeploymentMode>("SharedCloud");
  const [consoleBaseUrl, setConsoleBaseUrl] = useState("");
  const { hasFeature } = useEntitlements(tenantSlug);
  const onPremAvailable = hasFeature(ENTITLEMENT_KEYS.onPrem);
  const isOnPremise = deploymentMode === "OnPremise";
  const isConsoleUrlValid = /^https:\/\/[^\s/]+\S*$/i.test(consoleBaseUrl.trim());
  const { showEdge } = useHubCredentials();

  // Step 1: Classification & Facility Identity
  const [name, setName] = useState("");
  const [classification, setClassification] = useState("");
  const [slug, setSlug] = useState("");
  const [isSlugCustomized, setIsSlugCustomized] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [isCheckingSlug, setIsCheckingSlug] = useState(false);
  const slugCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // If selected branch already has the current facility type, auto-switch to first free slot
  useEffect(() => {
    if (selectedBranch) {
      const occupied = (selectedBranch.facilities || []).map((f) => f.facilityType.toLowerCase());
      if (occupied.includes(facilityType)) {
        const firstFree = FACILITY_TYPE_OPTIONS.find((opt) => !occupied.includes(opt.type));
        if (firstFree) {
          setFacilityType(firstFree.type);
          setClassification("");
        }
      }
    }
  }, [selectedBranch, facilityType]);

  // Regulatory & Statutory
  const [licenseToOperate, setLicenseToOperate] = useState("");
  const [philHealthAccreditationNumber, setPhilHealthAccreditationNumber] = useState("");
  const [taxIdentificationNumber, setTaxIdentificationNumber] = useState("");
  const [operatingHours, setOperatingHours] = useState("");

  // Geolocation & Address
  const [selectedRegionCode, setSelectedRegionCode] = useState("");
  const [selectedProvinceName, setSelectedProvinceName] = useState("");
  const [selectedCityName, setSelectedCityName] = useState("");
  const [selectedBarangay, setSelectedBarangay] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  // Address Cascading Lookups
  const activeRegion: PhilippineRegion | undefined = PHILIPPINE_REGIONS.find((r) => r.code === selectedRegionCode);
  const provinceOptions: PhilippineProvince[] = activeRegion?.provinces || [];
  const activeProvince: PhilippineProvince | undefined = provinceOptions.find((p) => p.name === selectedProvinceName);
  const cityOptions: PhilippineCity[] = activeProvince?.cities || [];
  const activeCity: PhilippineCity | undefined = cityOptions.find((c) => c.name === selectedCityName);
  const barangayOptions: string[] = activeCity?.barangays || [];

  // Existing facilities for unique name and slug validation
  const [existingFacilities, setExistingFacilities] = useState<Array<{ id: string; name: string; slug?: string }>>([]);

  useEffect(() => {
    if (targetBranch) {
      setSelectedBranch(targetBranch);
    }
  }, [targetBranch]);

  // Fetch branches on open
  useEffect(() => {
    if (open && tenantSlug) {
      setLoadingBranches(true);
      branchService.getBranches(tenantSlug)
        .then((bList) => {
          setAvailableBranches(bList || []);
          if (targetBranch) {
            setSelectedBranch(targetBranch);
          } else if (targetBranchId) {
            const found = (bList || []).find((b) => b.id === targetBranchId);
            if (found) setSelectedBranch(found);
          } else if (bList && bList.length === 1) {
            setSelectedBranch(bList[0]);
          }
        })
        .catch((err) => {
          console.error("Failed to load branches for facility wizard", err);
        })
        .finally(() => {
          setLoadingBranches(false);
        });
    }
  }, [open, tenantSlug, targetBranch, targetBranchId]);

  // Inherit details from branch whenever selectedBranch changes
  useEffect(() => {
    if (selectedBranch) {
      setStreetAddress(selectedBranch.streetAddress || "");
      setSelectedBarangay(selectedBranch.barangay || "");
      setSelectedCityName(selectedBranch.city || "");
      setSelectedProvinceName(selectedBranch.province || "");
      setSelectedRegionCode(selectedBranch.region || "");
      setZipCode(selectedBranch.zipCode || "");
      setContactNumber(selectedBranch.contactNumber || "");
      setContactEmail(selectedBranch.contactEmail || "");
      setPhilHealthAccreditationNumber(selectedBranch.philHealthAccreditationNumber || "");
    }
  }, [selectedBranch]);

  // Load existing facilities for validation
  useEffect(() => {
    if (open && tenantSlug) {
      apiClient.get<Array<{ id: string; name: string; slug?: string }>>(`/facilities?tenantSlug=${tenantSlug}`)
        .then((res) => {
          setExistingFacilities(res.data || []);
        })
        .catch((err) => {
          console.error("Failed to load existing facilities for uniqueness check", err);
        });
    }
  }, [open, tenantSlug]);

  const slugify = (text: string) => {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  const baseDomain = getConsoleBaseDomain();
  const sub = APP_SUBDOMAINS[normalizedFacilityType] || "clinic";

  const isDuplicateName = existingFacilities.some(
    (f) => f.name.trim().toLowerCase() === name.trim().toLowerCase()
  );

  const validateSlug = useCallback(async (candidate: string) => {
    const clean = candidate.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (!clean) {
      setSlugError("Facility subdomain slug is required.");
      return;
    }
    if (clean.length < 2 || clean.length > 63) {
      setSlugError("Slug must be between 2 and 63 alphanumeric or hyphen characters.");
      return;
    }

    const localMatch = existingFacilities.some(
      (f) => f.slug?.toLowerCase() === clean.toLowerCase()
    );
    if (localMatch) {
      setSlugError(`Subdomain slug "${clean}" is already in use in this workspace.`);
      return;
    }

    setIsCheckingSlug(true);
    try {
      const res = await apiClient.get<{ available: boolean; message?: string }>(`/facilities/check-slug/${encodeURIComponent(clean)}`);
      if (res.data && !res.data.available) {
        setSlugError(res.data.message || `Subdomain slug "${clean}" is already taken.`);
      } else {
        setSlugError(null);
      }
    } catch {
      setSlugError(null);
    } finally {
      setIsCheckingSlug(false);
    }
  }, [existingFacilities]);

  const handleNameChange = (val: string) => {
    setName(val);
    if (!isSlugCustomized) {
      const generated = slugify(val);
      setSlug(generated);
      if (slugCheckTimeoutRef.current) clearTimeout(slugCheckTimeoutRef.current);
      if (generated.length >= 2) {
        slugCheckTimeoutRef.current = setTimeout(() => {
          validateSlug(generated);
        }, 350);
      } else {
        setSlugError(null);
      }
    }
  };

  const handleSlugInput = (val: string) => {
    const sanitized = val.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setSlug(sanitized);
    setIsSlugCustomized(true);

    if (slugCheckTimeoutRef.current) clearTimeout(slugCheckTimeoutRef.current);

    if (!sanitized) {
      setSlugError("Facility subdomain slug is required.");
      return;
    }
    if (sanitized.length < 2) {
      setSlugError("Slug must be at least 2 characters.");
      return;
    }

    slugCheckTimeoutRef.current = setTimeout(() => {
      validateSlug(sanitized);
    }, 350);
  };

  // Reset or initialize default classification when type changes
  useEffect(() => {
    const list = FACILITY_CLASSIFICATIONS[normalizedFacilityType] || FACILITY_CLASSIFICATIONS.Clinic;
    const isValid = list.some((item) => item.value === classification);
    if (!isValid && list.length > 0) {
      setClassification(list[0].value);
    }
  }, [normalizedFacilityType, classification]);

  // Sync city zip code
  useEffect(() => {
    if (activeCity?.zipCode && !zipCode) {
      setZipCode(activeCity.zipCode);
    }
  }, [activeCity, zipCode]);

  const handleRegionChange = (newCode: string) => {
    setSelectedRegionCode(newCode);
    setSelectedProvinceName("");
    setSelectedCityName("");
    setSelectedBarangay("");
    setZipCode("");
    const reg = PHILIPPINE_REGIONS.find((r) => r.code === newCode);
    if (reg && reg.provinces.length === 1) {
      setSelectedProvinceName(reg.provinces[0].name);
    }
  };

  const handleProvinceChange = (newProv: string) => {
    setSelectedProvinceName(newProv);
    setSelectedCityName("");
    setSelectedBarangay("");
    setZipCode("");
  };

  const handleCityChange = (newCity: string) => {
    setSelectedCityName(newCity);
    setSelectedBarangay("");
    const city = cityOptions.find((c) => c.name === newCity);
    if (city) {
      setZipCode(city.zipCode);
    } else {
      setZipCode("");
    }
  };

  // Quota & Plan Checks
  const isSubscribed =
    billingInfo?.subscriptionStatus === "ACTIVE" ||
    (billingInfo?.subscriptionStatus === "CANCELLED" &&
      !!billingInfo.subscriptionExpiresAt &&
      new Date(billingInfo.subscriptionExpiresAt) > new Date());
  const isTrialing = billingInfo?.subscriptionStatus === "TRIALING";
  const hasAllocations = (isSubscribed || isTrialing) && !!billingInfo?.planLimits;

  const isClinic = facilityType === "clinic";
  const isAtClinicLimit =
    isClinic &&
    hasAllocations &&
    billingInfo?.usage &&
    billingInfo?.planLimits &&
    billingInfo.planLimits.maxClinics < 9999 &&
    billingInfo.usage.facilitiesCount >= billingInfo.planLimits.maxClinics;

  // Streamlined 2-step flow when selectedBranch is active
  const totalSteps = selectedBranch ? 2 : 4;

  const handleClose = () => {
    onOpenChange(false);
    const sp = new URLSearchParams(window.location.search);
    let changed = false;
    if (sp.has("create")) {
      sp.delete("create");
      changed = true;
    }
    if (sp.has("branchId")) {
      sp.delete("branchId");
      changed = true;
    }
    if (changed) {
      window.history.replaceState({}, "", `${window.location.pathname}${sp.toString() ? `?${sp.toString()}` : ""}`);
    }
    setCurrentStep(1);
    setName("");
    setSlug("");
    setIsSlugCustomized(false);
    setSlugError(null);
    setCustomizeLocation(false);
    setStreetAddress("");
    setSelectedBarangay("");
    setSelectedCityName("");
    setSelectedProvinceName("");
    setSelectedRegionCode("");
    setZipCode("");
    setContactNumber("");
    setContactEmail("");
    setPhilHealthAccreditationNumber("");
    setLicenseToOperate("");
    setTaxIdentificationNumber("");
    setOperatingHours("");
  };

  const handleNext = () => {
    if (currentStep === 1) {
      if (!selectedBranch && availableBranches.length > 0) {
        toast.error("Please select a target physical branch for this facility.");
        return;
      }
      if (!name.trim()) {
        toast.error("Please provide the legal or official operating name of the facility.");
        return;
      }
      if (isDuplicateName) {
        toast.error(`A facility named "${name.trim()}" already exists in this workspace.`);
        return;
      }
      if (!slug.trim()) {
        toast.error("Please provide a facility subdomain slug.");
        return;
      }
      if (slugError) {
        toast.error(slugError);
        return;
      }
      if (isOnPremise && !isConsoleUrlValid) {
        toast.error("Please provide a valid https console base URL for on-premise deployment.");
        return;
      }

      // If branch is selected, jump directly to step 2 (Review)
      if (selectedBranch) {
        setCurrentStep(2);
        return;
      }
    }

    if (currentStep === 3) {
      if (!selectedRegionCode) {
        toast.error("Please select an Administrative Region.");
        return;
      }
      if (!selectedProvinceName) {
        toast.error("Please select a Province.");
        return;
      }
      if (!selectedCityName) {
        toast.error("Please select a City or Municipality.");
        return;
      }
      if (!selectedBarangay) {
        toast.error("Please select a Barangay.");
        return;
      }
      if (!streetAddress.trim()) {
        toast.error("Please enter the street address / unit number.");
        return;
      }
    }
    setCurrentStep((prev) => Math.min(prev + 1, totalSteps));
  };

  const handlePrev = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleFinalSubmit = async () => {
    if (!name.trim() || !tenantSlug) return;
    if (isDuplicateName) {
      toast.error(`A facility named "${name.trim()}" already exists in this workspace.`);
      return;
    }
    if (slugError) {
      toast.error(slugError);
      return;
    }
    setSubmitting(true);
    try {
      const result = await facilityService.createFacility({
        tenantId: tenantSlug,
        branchId: selectedBranch?.id,
        facilityType: normalizedFacilityType,
        name: name.trim(),
        slug: slug.trim() || undefined,
        classification: classification || undefined,
        licenseToOperate: licenseToOperate.trim() || undefined,
        philHealthAccreditationNumber: (philHealthAccreditationNumber || selectedBranch?.philHealthAccreditationNumber || "").trim() || undefined,
        taxIdentificationNumber: taxIdentificationNumber.trim() || undefined,
        operatingHours: operatingHours.trim() || undefined,
        region: selectedRegionCode || selectedBranch?.region || undefined,
        province: selectedProvinceName || selectedBranch?.province || undefined,
        city: selectedCityName || selectedBranch?.city || undefined,
        barangay: selectedBarangay || selectedBranch?.barangay || undefined,
        zipCode: zipCode.trim() || selectedBranch?.zipCode || undefined,
        streetAddress: streetAddress.trim() || selectedBranch?.streetAddress || undefined,
        contactNumber: contactNumber.trim() || selectedBranch?.contactNumber || undefined,
        contactEmail: contactEmail.trim() || selectedBranch?.contactEmail || undefined,
        deploymentMode,
        consoleBaseUrl: isOnPremise ? consoleBaseUrl.trim() : undefined,
      });

      toast.success(`${normalizedFacilityType} "${name}" registered and provisioned under ${selectedBranch?.name || "branch"}!`);
      const facilityName = name.trim();
      handleClose();

      if (result.hubCredentials) {
        showEdge(facilityName, result.hubCredentials);
      } else if (result.hubOnboardingPending) {
        toast.warning(
          "The hub could not be reached, so no credentials were issued yet. Open Settings → Facilities and use \"Rotate hub credentials\" for this facility.",
        );
      }

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("clinicez:facility-created", {
            detail: { 
              facilityId: result.facilityId,
              facilityName, 
              branchId: selectedBranch?.id 
            },
          })
        );
      }

      if (onFacilityCreated) {
        onFacilityCreated(result.facilityId ?? undefined);
      } else {
        router.refresh();
      }
    } catch (err: unknown) {
      toastApiError(err, `Failed to register ${facilityType}`, tenantSlug);
    } finally {
      setSubmitting(false);
    }
  };

  const classifications = FACILITY_CLASSIFICATIONS[normalizedFacilityType] || FACILITY_CLASSIFICATIONS.Clinic;

  const stepsList = selectedBranch
    ? [
        { step: 1, title: "Identity" },
        { step: 2, title: "Review" },
      ]
    : [
        { step: 1, title: "Classification" },
        { step: 2, title: "Statutory" },
        { step: 3, title: "Location" },
        { step: 4, title: "Review" },
      ];

  return (
    <Dialog open={open} onOpenChange={(val) => !submitting && onOpenChange(val)}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] flex flex-col rounded-3xl p-0 overflow-hidden border border-slate-200 dark:border-slate-800 shadow-2xl bg-white dark:bg-slate-950">
        {/* Header with Wizard Step Indicator */}
        <div className="p-6 pb-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/30">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <IconBuildingHospital className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  Onboard New {normalizedFacilityType}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  {selectedBranch
                    ? `Branch-first provisioning under "${selectedBranch.name}"`
                    : "Philippine regulatory registration & branch provisioning wizard"}
                </DialogDescription>
              </div>
            </div>
            <Badge variant="outline" className="text-xs font-semibold px-2.5 py-0.5 border-primary/20 bg-primary/5 text-primary">
              Step {currentStep} of {totalSteps}
            </Badge>
          </div>

          {/* Stepper Progress Bar */}
          <div
            className={cn(
              "grid gap-2 pt-2",
              stepsList.length === 2 ? "grid-cols-2" : "grid-cols-4"
            )}
            style={{ gridTemplateColumns: `repeat(${stepsList.length}, minmax(0, 1fr))` }}
          >
            {stepsList.map((s) => {
              const isPast = currentStep > s.step;
              const isCurrent = currentStep === s.step;
              return (
                <div key={s.step} className="flex flex-col gap-1">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      isPast
                        ? "bg-emerald-500"
                        : isCurrent
                        ? "bg-primary"
                        : "bg-slate-200 dark:bg-slate-800"
                    }`}
                  />
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider truncate ${
                      isCurrent
                        ? "text-primary"
                        : isPast
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-slate-400"
                    }`}
                  >
                    {s.title}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Wizard Step Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* STEP 1: Facility Identity & Classification */}
          {currentStep === 1 && (
            <div className="space-y-4 animate-in fade-in-50 duration-200">
              {/* Inherited Branch Foundation Card */}
              {selectedBranch ? (
                <div className="p-3.5 rounded-2xl bg-primary/5 border border-primary/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <IconBuilding className="h-4 w-4 text-primary shrink-0" />
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                        Target Branch: {selectedBranch.name}
                      </span>
                      {selectedBranch.code && (
                        <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 border-primary/30 text-primary">
                          {selectedBranch.code}
                        </Badge>
                      )}
                    </div>
                    {!targetBranch && availableBranches.length > 1 && (
                      <select
                        value={selectedBranch.id}
                        onChange={(e) => {
                          const b = availableBranches.find((item) => item.id === e.target.value);
                          if (b) setSelectedBranch(b);
                        }}
                        className="text-xs h-7 px-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 font-medium"
                      >
                        {availableBranches.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="text-[11px] text-slate-600 dark:text-slate-400 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="flex items-center gap-1">
                      <IconMapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      {[selectedBranch.streetAddress, selectedBranch.barangay, selectedBranch.city, selectedBranch.province]
                        .filter(Boolean)
                        .join(", ") || "Main Workspace Address"}
                    </span>
                    {selectedBranch.isPhilHealthAccredited ? (
                      <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                        <IconShieldCheck className="h-3.5 w-3.5 shrink-0" />
                        PhilHealth Accredited (PMCC: {selectedBranch.philHealthPmccNumber || selectedBranch.philHealthAccreditationNumber})
                      </span>
                    ) : (
                      <span className="text-slate-400">Standard Accreditation</span>
                    )}
                  </div>
                </div>
              ) : loadingBranches ? (
                <div className="flex items-center gap-2 p-3.5 rounded-2xl border text-muted-foreground text-xs">
                  <IconLoader className="h-4 w-4 animate-spin text-primary" />
                  <span>Loading branch details...</span>
                </div>
              ) : availableBranches.length > 0 ? (
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-900 dark:text-amber-200">
                    <IconBuilding className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <span>Select Target Physical Branch *</span>
                  </div>
                  <p className="text-[11px] text-amber-800 dark:text-amber-300">
                    Every facility belongs to a physical branch location. Address and statutory credentials will be inherited automatically.
                  </p>
                  <select
                    value=""
                    onChange={(e) => {
                      const b = availableBranches.find((item) => item.id === e.target.value);
                      if (b) setSelectedBranch(b);
                    }}
                    className="w-full text-xs h-9 px-3 rounded-xl border border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-950 font-medium text-slate-800 dark:text-slate-200"
                  >
                    <option value="">-- Choose Target Branch --</option>
                    {availableBranches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.city || "Main Location"})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-rose-900 dark:text-rose-200">
                    <IconAlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                    <span>Physical Branch Required</span>
                  </div>
                  <p className="text-xs text-rose-800 dark:text-rose-300">
                    No physical branches exist in this workspace. Under Clinic EZ&apos;s branch-first workflow, facilities must be anchored to a physical branch.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      handleClose();
                      router.push(`/${tenantSlug}/dashboard/branches?createBranch=true`);
                    }}
                    className="rounded-xl text-xs font-bold bg-primary text-primary-foreground"
                  >
                    Create Branch First
                  </Button>
                </div>
              )}

              {/* Facility Type Selector */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Facility Type <span className="text-rose-500">*</span>
                  </Label>
                  {selectedBranch && (
                    <span className="text-[10px] text-muted-foreground font-medium">
                      One facility of each type per branch
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {FACILITY_TYPE_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const isOccupied = occupiedFacilityTypes.includes(opt.type);
                    const isSelected = facilityType === opt.type;

                    return (
                      <button
                        key={opt.type}
                        type="button"
                        disabled={isOccupied}
                        onClick={() => {
                          setFacilityType(opt.type);
                          setClassification("");
                        }}
                        className={cn(
                          "p-2.5 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between gap-2 relative",
                          isSelected
                            ? opt.activeBorder
                            : isOccupied
                            ? "opacity-40 cursor-not-allowed bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800"
                            : "hover:border-slate-400 dark:hover:border-slate-700 bg-card border-slate-200 dark:border-slate-800 cursor-pointer"
                        )}
                      >
                        <div className="flex items-center justify-between w-full">
                          <div className={cn("p-1.5 rounded-xl", opt.bg, opt.color)}>
                            <Icon className="h-4 w-4" />
                          </div>
                          {isOccupied ? (
                            <Badge variant="secondary" className="text-[9px] px-1 py-0 font-medium">
                              Added
                            </Badge>
                          ) : isSelected ? (
                            <IconCheck className="h-4 w-4 text-primary shrink-0" />
                          ) : null}
                        </div>

                        <div>
                          <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                            {opt.label}
                          </div>
                          <div className="text-[10px] text-slate-500 line-clamp-1">
                            {opt.desc}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="facility-name" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Facility Operating Name <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="facility-name"
                  placeholder={`e.g. St. Jude ${normalizedFacilityType} - ${selectedBranch?.name || "Branch"}`}
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className={`h-10 rounded-xl text-sm font-semibold ${
                    isDuplicateName ? "border-rose-500 focus-visible:ring-rose-500 bg-rose-50/20" : ""
                  }`}
                  autoFocus
                  required
                />
                {isDuplicateName && (
                  <p className="text-xs text-rose-500 font-semibold flex items-center gap-1.5 mt-1 animate-in fade-in-50">
                    <IconAlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    A facility named &ldquo;{name.trim()}&rdquo; already exists in this workspace. Please choose a unique name.
                  </p>
                )}
                <p className="text-[11px] text-slate-400">
                  This name will appear on printed official prescription slips, lab results, and patient receipts.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="facility-slug" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Facility Subdomain / URL Slug <span className="text-rose-500">*</span>
                  </Label>
                  {isCheckingSlug ? (
                    <span className="text-[11px] text-slate-400 flex items-center gap-1 font-medium">
                      <IconLoader className="h-3 w-3 animate-spin text-primary" /> Checking availability...
                    </span>
                  ) : slug && !slugError && slug.length >= 2 ? (
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                      <IconCheck className="h-3.5 w-3.5" /> Subdomain available
                    </span>
                  ) : null}
                </div>
                <div className="relative flex items-center">
                  <Input
                    id="facility-slug"
                    placeholder="e.g. st-jude-clinic"
                    value={slug}
                    onChange={(e) => handleSlugInput(e.target.value)}
                    className={`h-10 rounded-xl text-sm font-mono lowercase ${
                      slugError ? "border-rose-500 focus-visible:ring-rose-500 bg-rose-50/20" : ""
                    }`}
                    required
                  />
                </div>
                {slugError && (
                  <p className="text-xs text-rose-500 font-semibold flex items-center gap-1.5 mt-1 animate-in fade-in-50">
                    <IconAlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {slugError}
                  </p>
                )}
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 flex items-center justify-between gap-2 overflow-hidden">
                  <span className="text-[11px] text-slate-400 font-medium shrink-0">Console URL:</span>
                  <span className="font-mono text-primary font-bold text-xs truncate">
                    https://{slug || "facility-slug"}.{sub}.{baseDomain}
                  </span>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Deployment</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {[
                    { value: "SharedCloud" as const, label: "Shared cloud", description: "Hosted by Clinic EZ. Nothing to install." },
                    { value: "OnPremise" as const, label: "On-premise", description: "Runs on your own server and syncs through the hub." },
                  ].map((option) => {
                    const isSelected = deploymentMode === option.value;
                    const isLocked = option.value === "OnPremise" && onPremAvailable === false;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        disabled={isLocked}
                        onClick={() => setDeploymentMode(option.value)}
                        className={`p-3.5 rounded-2xl border text-left transition-all ${
                          isSelected
                            ? "border-primary bg-primary/5 ring-1 ring-primary/20 shadow-xs"
                            : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-card"
                        } ${isLocked ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-100">{option.label}</span>
                          {isSelected && <IconCheck className="h-4 w-4 text-primary" />}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{option.description}</p>
                      </button>
                    );
                  })}
                </div>
                {isOnPremise && (
                  <div className="space-y-1.5 pt-1">
                    <Label htmlFor="facility-console-base-url" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Console base URL <span className="text-rose-500">*</span>
                    </Label>
                    <Input
                      id="facility-console-base-url"
                      type="url"
                      inputMode="url"
                      placeholder="https://clinic.example.org"
                      value={consoleBaseUrl}
                      onChange={(e) => setConsoleBaseUrl(e.target.value)}
                      className={`h-10 rounded-xl text-sm font-mono ${
                        consoleBaseUrl && !isConsoleUrlValid ? "border-rose-500 focus-visible:ring-rose-500" : ""
                      }`}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2 pt-2">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Facility Classification Level
                </Label>
                <div className="grid grid-cols-1 gap-2.5">
                  {classifications.map((item) => {
                    const isSelected = classification === item.value;
                    return (
                      <div
                        key={item.value}
                        onClick={() => setClassification(item.value)}
                        className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                          isSelected
                            ? "border-primary bg-primary/5 ring-1 ring-primary/20 shadow-xs"
                            : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-card"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                            {item.label}
                          </span>
                          {isSelected && <IconCheck className="h-4 w-4 text-primary" />}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                          {item.description}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Collapsible Location Override (when branch is selected) */}
              {selectedBranch && (
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setCustomizeLocation(!customizeLocation)}
                    className="text-xs font-semibold text-primary hover:underline flex items-center gap-1.5"
                  >
                    <IconMapPin className="h-3.5 w-3.5" />
                    <span>{customizeLocation ? "Hide location & contact overrides" : "Customize specific suite or contact hotline (optional)"}</span>
                    {customizeLocation ? <IconChevronUp className="h-3.5 w-3.5" /> : <IconChevronDown className="h-3.5 w-3.5" />}
                  </button>

                  {customizeLocation && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 animate-in fade-in-50">
                      <div className="col-span-2 space-y-1">
                        <Label className="text-xs font-medium">Specific Unit / Floor / Suite</Label>
                        <Input
                          value={streetAddress}
                          onChange={(e) => setStreetAddress(e.target.value)}
                          placeholder="e.g. Suite 402, 4th Floor"
                          className="h-9 text-xs rounded-xl"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-medium">Facility Contact Hotline</Label>
                        <Input
                          value={contactNumber}
                          onChange={(e) => setContactNumber(e.target.value)}
                          placeholder="e.g. +63 917 123 4567"
                          className="h-9 text-xs rounded-xl"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-medium">Facility Official Email</Label>
                        <Input
                          value={contactEmail}
                          onChange={(e) => setContactEmail(e.target.value)}
                          placeholder="e.g. lab@example.com"
                          className="h-9 text-xs rounded-xl"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* STEP 2: Regulatory (only in 4-step mode when selectedBranch is null) */}
          {!selectedBranch && currentStep === 2 && (
            <div className="space-y-4 animate-in fade-in-50 duration-200">
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
                <IconFileCertificate className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-900 dark:text-amber-300 leading-relaxed">
                  Philippine Department of Health (DOH) &amp; PhilHealth statutory compliance details.
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="doh-lto" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    DOH License to Operate (LTO)
                  </Label>
                  <Input
                    id="doh-lto"
                    placeholder="e.g. DOH-LTO-NCR-01-2026-9874"
                    value={licenseToOperate}
                    onChange={(e) => setLicenseToOperate(e.target.value)}
                    className="h-9 text-xs rounded-xl font-mono uppercase"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="philhealth-id" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    PhilHealth Accreditation Number
                  </Label>
                  <Input
                    id="philhealth-id"
                    placeholder="e.g. PHIC-ACC-982143-01"
                    value={philHealthAccreditationNumber}
                    onChange={(e) => setPhilHealthAccreditationNumber(e.target.value)}
                    className="h-9 text-xs rounded-xl font-mono uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div className="space-y-1.5">
                  <Label htmlFor="bir-tin" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    BIR Tax Identification Number (TIN)
                  </Label>
                  <Input
                    id="bir-tin"
                    placeholder="e.g. 123-456-789-000"
                    value={taxIdentificationNumber}
                    onChange={(e) => setTaxIdentificationNumber(e.target.value)}
                    className="h-9 text-xs rounded-xl font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="operating-hours" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Official Operating Hours
                  </Label>
                  <Input
                    id="operating-hours"
                    placeholder="e.g. Mon-Fri 8:00 AM - 5:00 PM"
                    value={operatingHours}
                    onChange={(e) => setOperatingHours(e.target.value)}
                    className="h-9 text-xs rounded-xl"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Location (only in 4-step mode when selectedBranch is null) */}
          {!selectedBranch && currentStep === 3 && (
            <div className="space-y-4 animate-in fade-in-50 duration-200">
              <div className="p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-start gap-3">
                <IconMapPin className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <div className="text-xs text-blue-900 dark:text-blue-300 leading-relaxed">
                  Philippine Standard Geographic Code (PSGC) compliant location mapping.
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1.5">
                  <Label htmlFor="reg-select" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Administrative Region <span className="text-rose-500">*</span>
                  </Label>
                  <select
                    id="reg-select"
                    value={selectedRegionCode}
                    onChange={(e) => handleRegionChange(e.target.value)}
                    className="w-full h-9 px-3 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="">-- Select Administrative Region --</option>
                    {PHILIPPINE_REGIONS.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="prov-select" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Province <span className="text-rose-500">*</span>
                  </Label>
                  <select
                    id="prov-select"
                    value={selectedProvinceName}
                    onChange={(e) => handleProvinceChange(e.target.value)}
                    disabled={!selectedRegionCode}
                    className="w-full h-9 px-3 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                  >
                    <option value="">{selectedRegionCode ? "-- Select Province --" : "-- Select Region First --"}</option>
                    {provinceOptions.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="space-y-1.5 sm:col-span-1">
                  <Label htmlFor="city-select" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    City / Municipality <span className="text-rose-500">*</span>
                  </Label>
                  <select
                    id="city-select"
                    value={selectedCityName}
                    onChange={(e) => handleCityChange(e.target.value)}
                    disabled={!selectedProvinceName}
                    className="w-full h-9 px-3 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                  >
                    <option value="">{selectedProvinceName ? "-- Select City / Municipality --" : "-- Select Province First --"}</option>
                    {cityOptions.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5 sm:col-span-1">
                  <Label htmlFor="brgy-select" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Barangay <span className="text-rose-500">*</span>
                  </Label>
                  <select
                    id="brgy-select"
                    value={selectedBarangay}
                    onChange={(e) => setSelectedBarangay(e.target.value)}
                    disabled={!selectedCityName}
                    className="w-full h-9 px-3 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                  >
                    <option value="">{selectedCityName ? "-- Select Barangay --" : "-- Select City First --"}</option>
                    {barangayOptions.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5 sm:col-span-1">
                  <Label htmlFor="zip-code" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    ZIP Code
                  </Label>
                  <Input
                    id="zip-code"
                    value={zipCode}
                    onChange={(e) => setZipCode(e.target.value)}
                    placeholder="e.g. 1200"
                    className="h-9 text-xs font-mono rounded-xl"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="street-addr" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Street Address &amp; Unit / Building <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="street-addr"
                  placeholder="e.g. Unit 402, High Street South Corporate Plaza"
                  value={streetAddress}
                  onChange={(e) => setStreetAddress(e.target.value)}
                  className="h-9 text-xs rounded-xl"
                  required
                />
              </div>
            </div>
          )}

          {/* FINAL REVIEW & CONFIRMATION (Step 2 when branch selected, Step 4 otherwise) */}
          {((selectedBranch && currentStep === 2) || (!selectedBranch && currentStep === 4)) && (
            <div className="space-y-4 animate-in fade-in-50 duration-200">
              {/* Quota Alert */}
              {!hasAllocations ? (
                <div className="p-4 rounded-2xl border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20 flex items-start gap-3">
                  <IconAlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <h4 className="font-bold text-amber-900 dark:text-amber-200">Active Subscription Required</h4>
                    <p className="text-amber-800 dark:text-amber-300">
                      Your workspace is in setup mode. You can provision this facility now, but ensure you select a plan to unlock live clinical orders.
                    </p>
                  </div>
                </div>
              ) : isAtClinicLimit ? (
                <div className="p-4 rounded-2xl border border-rose-200 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/20 flex items-start gap-3">
                  <IconAlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <h4 className="font-bold text-rose-900 dark:text-rose-200">Clinic Allocation Reached</h4>
                    <p className="text-rose-800 dark:text-rose-300">
                      You have reached your limit of {billingInfo?.planLimits?.maxClinics} clinic location(s). Please upgrade before provisioning.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/20 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-semibold">
                    <IconShieldCheck className="h-4 w-4" />
                    <span>Plan Quota Verified ({billingInfo?.planLimits?.planTitle || "Enterprise"})</span>
                  </div>
                  <Badge variant="outline" className="border-emerald-300 text-emerald-700 dark:text-emerald-300 text-[10px]">
                    Allocation Available
                  </Badge>
                </div>
              )}

              {/* Summary Card */}
              <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 space-y-3.5 text-xs">
                {selectedBranch && (
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Anchor Branch
                    </span>
                    <div className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5 flex items-center gap-2">
                      <IconBuilding className="h-4 w-4 text-primary" />
                      <span>{selectedBranch.name}</span>
                    </div>
                  </div>
                )}

                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Facility Name &amp; Classification
                  </span>
                  <div className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                    {name}
                  </div>
                  <div className="text-xs text-primary font-semibold mt-0.5">
                    {classification || normalizedFacilityType} ({normalizedFacilityType})
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200/60 dark:border-slate-800">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      PhilHealth Accreditation
                    </span>
                    <div className="font-mono text-slate-800 dark:text-slate-200 font-medium">
                      {philHealthAccreditationNumber || selectedBranch?.philHealthAccreditationNumber || "Inherited / Standard"}
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Deployment
                    </span>
                    <div className="text-slate-800 dark:text-slate-200 font-medium">
                      {isOnPremise ? "On-premise" : "Shared cloud"}
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Operating Address
                  </span>
                  <div className="text-slate-800 dark:text-slate-200 font-medium mt-0.5">
                    {[streetAddress, selectedBarangay, selectedCityName, selectedProvinceName, zipCode].filter(Boolean).join(", ") ||
                      [selectedBranch?.streetAddress, selectedBranch?.barangay, selectedBranch?.city, selectedBranch?.province].filter(Boolean).join(", ")}
                  </div>
                  {(contactNumber || contactEmail) && (
                    <div className="text-slate-500 text-[11px] mt-1 flex items-center gap-3">
                      {contactNumber && <span>Tel: {contactNumber}</span>}
                      {contactEmail && <span>Email: {contactEmail}</span>}
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Subdomain URL
                  </span>
                  <div className="font-mono text-primary font-bold text-xs mt-0.5">
                    https://{slug}.{sub}.{baseDomain}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/30">
          <Button
            type="button"
            variant="outline"
            onClick={currentStep === 1 ? handleClose : handlePrev}
            disabled={submitting}
            className="rounded-xl text-xs font-semibold gap-1.5"
          >
            {currentStep > 1 && <IconArrowLeft className="h-3.5 w-3.5" />}
            <span>{currentStep === 1 ? "Cancel" : "Back"}</span>
          </Button>

          <div className="flex items-center gap-2">
            {currentStep < totalSteps ? (
              <Button
                type="button"
                onClick={handleNext}
                disabled={currentStep === 1 && (!name.trim() || isDuplicateName || !slug.trim() || !!slugError || isCheckingSlug || (isOnPremise && !isConsoleUrlValid) || (!selectedBranch && availableBranches.length === 0))}
                className="rounded-xl text-xs font-bold px-5 h-9 bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 shadow-sm"
              >
                <span>Continue</span>
                <IconArrowRight className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleFinalSubmit}
                disabled={submitting || isAtClinicLimit}
                className="rounded-xl text-xs font-bold px-6 h-9 bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 shadow-md"
              >
                {submitting ? (
                  <>
                    <IconLoader className="h-4 w-4 animate-spin" />
                    <span>Provisioning Facility...</span>
                  </>
                ) : (
                  <>
                    <IconCheck className="h-4 w-4" />
                    <span>Complete Onboarding &amp; Provision</span>
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
