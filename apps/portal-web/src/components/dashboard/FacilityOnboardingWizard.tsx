"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/transport/apiClient";
import { useBillingInfo } from "@/hooks/useBilling";
import { toast } from "sonner";
import {
  PHILIPPINE_REGIONS,
  FACILITY_CLASSIFICATIONS,
  PhilippineRegion,
  PhilippineProvince,
  PhilippineCity,
} from "@/constants/philippine-addresses";
import {
  IconBuildingHospital,
  IconCheck,
  IconArrowRight,
  IconArrowLeft,
  IconLoader,
  IconFileCertificate,
  IconMapPin,
  IconShieldCheck,
  IconAlertTriangle,
  IconClock,
  IconPhone,
  IconMail,
  IconInfoCircle,
} from "@tabler/icons-react";

interface FacilityOnboardingWizardProps {
  initialType?: "clinic" | "laboratory" | "pharmacy" | "organization" | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFacilityCreated?: () => void;
}

export default function FacilityOnboardingWizard({
  initialType,
  open,
  onOpenChange,
  onFacilityCreated,
}: FacilityOnboardingWizardProps) {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenantSlug = params?.tenant as string;
  const { billingInfo } = useBillingInfo(tenantSlug);

  const resolvedType = (initialType || searchParams.get("create") || "clinic") as "clinic" | "laboratory" | "pharmacy" | "organization";
  const normalizedFacilityType = resolvedType.charAt(0).toUpperCase() + resolvedType.slice(1);

  // Step Tracker: 1 to 4
  const [currentStep, setCurrentStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Step 1: Classification & Facility Identity
  const [name, setName] = useState("");
  const [classification, setClassification] = useState("");

  // Step 2: Regulatory & Statutory Profile
  const [licenseToOperate, setLicenseToOperate] = useState("");
  const [philHealthAccreditationNumber, setPhilHealthAccreditationNumber] = useState("");
  const [taxIdentificationNumber, setTaxIdentificationNumber] = useState("");
  const [operatingHours, setOperatingHours] = useState("Mon-Sat 8:00 AM - 5:00 PM");

  // Step 3: Geolocation & Address
  const [selectedRegionCode, setSelectedRegionCode] = useState("NCR");
  const [selectedProvinceName, setSelectedProvinceName] = useState("Metro Manila");
  const [selectedCityName, setSelectedCityName] = useState("Makati City");
  const [selectedBarangay, setSelectedBarangay] = useState("Bel-Air");
  const [zipCode, setZipCode] = useState("1200");
  const [streetAddress, setStreetAddress] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  // Address Cascading Lookups
  const activeRegion: PhilippineRegion | undefined = PHILIPPINE_REGIONS.find((r) => r.code === selectedRegionCode) || PHILIPPINE_REGIONS[0];
  const provinceOptions: PhilippineProvince[] = activeRegion?.provinces || [];
  const activeProvince: PhilippineProvince | undefined = provinceOptions.find((p) => p.name === selectedProvinceName) || provinceOptions[0];
  const cityOptions: PhilippineCity[] = activeProvince?.cities || [];
  const activeCity: PhilippineCity | undefined = cityOptions.find((c) => c.name === selectedCityName) || cityOptions[0];
  const barangayOptions: string[] = activeCity?.barangays || [];

  // Existing facilities for unique name validation
  const [existingFacilities, setExistingFacilities] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (open && tenantSlug) {
      apiClient.get<Array<{ id: string; name: string }>>(`/facilities?tenantSlug=${tenantSlug}`)
        .then((res) => {
          setExistingFacilities(res.data || []);
        })
        .catch((err) => {
          console.error("Failed to load existing facilities for uniqueness check", err);
        });
    }
  }, [open, tenantSlug]);

  const isDuplicateName = existingFacilities.some(
    (f) => f.name.trim().toLowerCase() === name.trim().toLowerCase()
  );

  // Reset or initialize default classification when type changes
  useEffect(() => {
    const list = FACILITY_CLASSIFICATIONS[normalizedFacilityType] || FACILITY_CLASSIFICATIONS.Clinic;
    if (list.length > 0 && !classification) {
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
    const reg = PHILIPPINE_REGIONS.find((r) => r.code === newCode);
    if (reg && reg.provinces.length > 0) {
      const firstProv = reg.provinces[0];
      setSelectedProvinceName(firstProv.name);
      if (firstProv.cities.length > 0) {
        const firstCity = firstProv.cities[0];
        setSelectedCityName(firstCity.name);
        setZipCode(firstCity.zipCode);
        setSelectedBarangay(firstCity.barangays[0] || "");
      }
    }
  };

  const handleProvinceChange = (newProv: string) => {
    setSelectedProvinceName(newProv);
    const prov = provinceOptions.find((p) => p.name === newProv);
    if (prov && prov.cities.length > 0) {
      const firstCity = prov.cities[0];
      setSelectedCityName(firstCity.name);
      setZipCode(firstCity.zipCode);
      setSelectedBarangay(firstCity.barangays[0] || "");
    }
  };

  const handleCityChange = (newCity: string) => {
    setSelectedCityName(newCity);
    const city = cityOptions.find((c) => c.name === newCity);
    if (city) {
      setZipCode(city.zipCode);
      setSelectedBarangay(city.barangays[0] || "");
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

  const isClinic = resolvedType === "clinic";
  const isAtClinicLimit =
    isClinic &&
    hasAllocations &&
    billingInfo?.usage &&
    billingInfo?.planLimits &&
    billingInfo.planLimits.maxClinics < 9999 &&
    billingInfo.usage.facilitiesCount >= billingInfo.planLimits.maxClinics;

  const handleClose = () => {
    onOpenChange(false);
    // Remove query param if present
    const sp = new URLSearchParams(window.location.search);
    if (sp.has("create")) {
      sp.delete("create");
      window.history.replaceState({}, "", `${window.location.pathname}?${sp.toString()}`);
    }
    setCurrentStep(1);
    setName("");
  };

  const handleNext = () => {
    if (currentStep === 1) {
      if (!name.trim()) {
        toast.error("Please provide the legal or official operating name of the facility.");
        return;
      }
      if (isDuplicateName) {
        toast.error(`A facility named "${name.trim()}" already exists in this workspace.`);
        return;
      }
    }
    if (currentStep === 3) {
      if (!streetAddress.trim()) {
        toast.error("Please enter the street address / unit number.");
        return;
      }
    }
    setCurrentStep((prev) => Math.min(prev + 1, 4));
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
    setSubmitting(true);
    try {
      const payload = {
        tenantId: tenantSlug,
        facilityType: normalizedFacilityType,
        name: name.trim(),
        classification: classification || undefined,
        licenseToOperate: licenseToOperate.trim() || undefined,
        philHealthAccreditationNumber: philHealthAccreditationNumber.trim() || undefined,
        taxIdentificationNumber: taxIdentificationNumber.trim() || undefined,
        operatingHours: operatingHours.trim() || undefined,
        region: activeRegion?.name || selectedRegionCode,
        province: selectedProvinceName,
        city: selectedCityName,
        barangay: selectedBarangay,
        zipCode: zipCode.trim() || undefined,
        streetAddress: streetAddress.trim() || undefined,
        contactNumber: contactNumber.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
      };

      await apiClient.post("/facilities", payload);
      toast.success(`${normalizedFacilityType} "${name}" registered and provisioning event broadcasted!`);
      handleClose();
      if (onFacilityCreated) {
        onFacilityCreated();
      } else {
        router.refresh();
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || `Failed to register ${resolvedType}`;
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const classifications = FACILITY_CLASSIFICATIONS[normalizedFacilityType] || FACILITY_CLASSIFICATIONS.Clinic;

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
                  Philippine regulatory registration &amp; branch provisioning wizard
                </DialogDescription>
              </div>
            </div>
            <Badge variant="outline" className="text-xs font-semibold px-2.5 py-0.5 border-primary/20 bg-primary/5 text-primary">
              Step {currentStep} of 4
            </Badge>
          </div>

          {/* Stepper Progress Bar */}
          <div className="grid grid-cols-4 gap-2 pt-2">
            {[
              { step: 1, title: "Classification" },
              { step: 2, title: "Statutory" },
              { step: 3, title: "Location" },
              { step: 4, title: "Review" },
            ].map((s) => {
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

        {/* Wizard Step Content (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* STEP 1: Classification & Facility Identity */}
          {currentStep === 1 && (
            <div className="space-y-4 animate-in fade-in-50 duration-200">
              <div className="p-3.5 rounded-2xl bg-primary/5 border border-primary/10 flex items-start gap-3">
                <IconInfoCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Enter the registered trade or clinical brand name for this location and choose the corresponding health facility category.
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="facility-name" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Facility Operating Name <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="facility-name"
                  placeholder={`e.g. St. Jude Medical Clinic - BGC Branch`}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
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
            </div>
          )}

          {/* STEP 2: Regulatory & Statutory Profile */}
          {currentStep === 2 && (
            <div className="space-y-4 animate-in fade-in-50 duration-200">
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
                <IconFileCertificate className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-900 dark:text-amber-300 leading-relaxed">
                  Philippine Department of Health (DOH) &amp; PhilHealth statutory compliance details. These credentials authenticate issued e-prescriptions and external diagnostic orders.
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
                  <p className="text-[10px] text-slate-400">Issued by DOH Health Facilities and Services Regulatory Bureau (HFSRB)</p>
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
                  <p className="text-[10px] text-slate-400">Required for PhilHealth Konsulta electronic claims</p>
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
                  <p className="text-[10px] text-slate-400">Format: 9 or 12 digits for official BIR billing receipting</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="operating-hours" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Official Operating Hours
                  </Label>
                  <Input
                    id="operating-hours"
                    placeholder="e.g. Mon-Sat 8:00 AM - 5:00 PM"
                    value={operatingHours}
                    onChange={(e) => setOperatingHours(e.target.value)}
                    className="h-9 text-xs rounded-xl"
                  />
                  <p className="text-[10px] text-slate-400">Displayed to patients on appointment booking portals</p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Geolocation & Address */}
          {currentStep === 3 && (
            <div className="space-y-4 animate-in fade-in-50 duration-200">
              <div className="p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-start gap-3">
                <IconMapPin className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <div className="text-xs text-blue-900 dark:text-blue-300 leading-relaxed">
                  Philippine Standard Geographic Code (PSGC) compliant location mapping for routing specimen pick-ups and prescription fulfillment.
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
                    className="w-full h-9 px-3 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
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
                    className="w-full h-9 px-3 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
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
                    className="w-full h-9 px-3 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
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
                  placeholder="e.g. Unit 402, High Street South Corporate Plaza, 26th St."
                  value={streetAddress}
                  onChange={(e) => setStreetAddress(e.target.value)}
                  className="h-9 text-xs rounded-xl"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                <div className="space-y-1.5">
                  <Label htmlFor="contact-num" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Facility Contact Hotline
                  </Label>
                  <Input
                    id="contact-num"
                    placeholder="e.g. +63 (2) 8876-5432 / +63 917 123 4567"
                    value={contactNumber}
                    onChange={(e) => setContactNumber(e.target.value)}
                    className="h-9 text-xs rounded-xl font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="contact-mail" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Facility Official Email
                  </Label>
                  <Input
                    id="contact-mail"
                    type="email"
                    placeholder="e.g. clinic.bgc@clinicez.ph"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    className="h-9 text-xs rounded-xl"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Plan Review & Confirmation */}
          {currentStep === 4 && (
            <div className="space-y-4 animate-in fade-in-50 duration-200">
              {/* Quota Check Alert */}
              {!hasAllocations ? (
                <div className="p-4 rounded-2xl border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20 flex items-start gap-3">
                  <IconAlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <h4 className="font-bold text-amber-900 dark:text-amber-200">Active Subscription Required</h4>
                    <p className="text-amber-800 dark:text-amber-300">
                      Your workspace is currently in setup mode. You can provision this facility now, but ensure you select a plan to unlock live clinical orders.
                    </p>
                  </div>
                </div>
              ) : isAtClinicLimit ? (
                <div className="p-4 rounded-2xl border border-rose-200 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/20 flex items-start gap-3">
                  <IconAlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <h4 className="font-bold text-rose-900 dark:text-rose-200">Clinic Allocation Reached</h4>
                    <p className="text-rose-800 dark:text-rose-300">
                      You have reached your limit of {billingInfo?.planLimits?.maxClinics} clinic location(s) on your current plan. Please upgrade before provisioning.
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
                      DOH LTO
                    </span>
                    <div className="font-mono text-slate-800 dark:text-slate-200 font-medium">
                      {licenseToOperate || "Not Specified"}
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      PhilHealth Accreditation
                    </span>
                    <div className="font-mono text-slate-800 dark:text-slate-200 font-medium">
                      {philHealthAccreditationNumber || "Not Specified"}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200/60 dark:border-slate-800">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      BIR TIN
                    </span>
                    <div className="font-mono text-slate-800 dark:text-slate-200 font-medium">
                      {taxIdentificationNumber || "Not Specified"}
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Operating Hours
                    </span>
                    <div className="text-slate-800 dark:text-slate-200 font-medium">
                      {operatingHours}
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Registered Address
                  </span>
                  <div className="text-slate-800 dark:text-slate-200 font-medium mt-0.5">
                    {[streetAddress, selectedBarangay, selectedCityName, selectedProvinceName, zipCode].filter(Boolean).join(", ")}
                  </div>
                  {(contactNumber || contactEmail) && (
                    <div className="text-slate-500 text-[11px] mt-1 flex items-center gap-3">
                      {contactNumber && <span>Tel: {contactNumber}</span>}
                      {contactEmail && <span>Email: {contactEmail}</span>}
                    </div>
                  )}
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
            {currentStep < 4 ? (
              <Button
                type="button"
                onClick={handleNext}
                disabled={currentStep === 1 && (!name.trim() || isDuplicateName)}
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
