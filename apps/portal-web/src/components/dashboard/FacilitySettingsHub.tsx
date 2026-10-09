"use client";

import React, { useState } from "react";
import { useParams } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/transport/apiClient";
import { toast } from "sonner";
import {
  IconBuildingHospital,
  IconCheck,
  IconLoader,
  IconFileCertificate,
  IconPalette,
  IconBell,
  IconSparkles,
  IconKey,
  IconCopy,
  IconShieldCheck,
  IconServer,
  IconMapPin,
  IconPhone,
  IconMail,
  IconExternalLink
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";

// Prevent legacy hardcoded dummy strings from being assumed as authentic user configurations
const sanitizeLegacyDefault = (val?: string | null): string => {
  if (!val) return "";
  const trimmed = val.trim();
  if (trimmed === "Mon-Sat 8:00 AM - 5:00 PM") return "";
  return trimmed;
};

export interface FacilityData {
  id: string;
  name: string;
  facilityType: "Clinic" | "Laboratory" | "Pharmacy" | "Organization";
  status: "Provisioning" | "Active" | "Suspended" | "Failed";
  createdAt: string;
  slug?: string;
  consoleUrl?: string;
  classification?: string | null;
  licenseToOperate?: string | null;
  philHealthAccreditationNumber?: string | null;
  taxIdentificationNumber?: string | null;
  operatingHours?: string | null;
  region?: string | null;
  province?: string | null;
  city?: string | null;
  barangay?: string | null;
  zipCode?: string | null;
  streetAddress?: string | null;
  contactNumber?: string | null;
  contactEmail?: string | null;
  notificationPreferencesJson?: string | null;
}

interface FacilitySettingsHubProps {
  facility: FacilityData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export default function FacilitySettingsHub({
  facility,
  open,
  onOpenChange,
  onSaved,
}: FacilitySettingsHubProps) {
  const params = useParams();
  const tenantSlug = params?.tenant as string;

  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("profile");

  // Cryptographic Facility License State
  const [licenseData, setLicenseData] = useState<{
    facilityId: string;
    facilityName: string;
    facilityType: string;
    planTier: string;
    licenseToken: string;
    limits: {
      maxStaff: number;
      maxBeds: number;
      maxAnalyzers: number;
      maxMonthlyConsultations: number;
      maxStorageMb: number;
      concurrentTerminals: number;
    };
    expiresAt?: string | null;
  } | null>(null);
  const [loadingLicense, setLoadingLicense] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  const fetchLicenseKey = async () => {
    if (!facility) return;
    setLoadingLicense(true);
    try {
      const res = await apiClient.get(`/facilities/${facility.id}/license-key?tenantSlug=${tenantSlug}`);
      setLicenseData(res.data);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to load facility license key");
    } finally {
      setLoadingLicense(false);
    }
  };

  React.useEffect(() => {
    if (activeTab === "license" && !licenseData && facility) {
      fetchLicenseKey();
    }
  }, [activeTab, facility]);

  const handleCopyLicenseKey = () => {
    if (!licenseData?.licenseToken) return;
    navigator.clipboard.writeText(licenseData.licenseToken);
    setCopiedKey(true);
    toast.success("Cryptographically signed facility license key copied to clipboard!");
    setTimeout(() => setCopiedKey(false), 2500);
  };

  // Profile & Statutory State (No falsey defaults)
  const [name, setName] = useState(facility?.name || "");
  const [status, setStatus] = useState<FacilityData["status"]>(facility?.status || "Active");
  const [classification, setClassification] = useState(facility?.classification || "");
  const [licenseToOperate, setLicenseToOperate] = useState(facility?.licenseToOperate || "");
  const [philHealthAccreditationNumber, setPhilHealthAccreditationNumber] = useState(facility?.philHealthAccreditationNumber || "");
  const [taxIdentificationNumber, setTaxIdentificationNumber] = useState(facility?.taxIdentificationNumber || "");
  const [operatingHours, setOperatingHours] = useState(sanitizeLegacyDefault(facility?.operatingHours));
  const [streetAddress, setStreetAddress] = useState(facility?.streetAddress || "");
  const [city, setCity] = useState(facility?.city || "");
  const [province, setProvince] = useState(facility?.province || "");
  const [zipCode, setZipCode] = useState(facility?.zipCode || "");
  const [contactNumber, setContactNumber] = useState(facility?.contactNumber || "");
  const [contactEmail, setContactEmail] = useState(facility?.contactEmail || "");

  // Notification Preferences State
  const initialPrefs = (() => {
    try {
      return facility?.notificationPreferencesJson
        ? JSON.parse(facility.notificationPreferencesJson)
        : {
            dropzoneLabUploadAlert: true,
            dropzoneRxDispenseAlert: true,
            criticalLabAbnormalAlert: true,
            eodSummaryDigest: true,
          };
    } catch {
      return {
        dropzoneLabUploadAlert: true,
        dropzoneRxDispenseAlert: true,
        criticalLabAbnormalAlert: true,
        eodSummaryDigest: true,
      };
    }
  })();

  const [notifications, setNotifications] = useState(initialPrefs);

  // Sync state when facility prop changes
  React.useEffect(() => {
    if (facility) {
      setName(facility.name || "");
      setStatus(facility.status || "Active");
      setClassification(facility.classification || "");
      setLicenseToOperate(facility.licenseToOperate || "");
      setPhilHealthAccreditationNumber(facility.philHealthAccreditationNumber || "");
      setTaxIdentificationNumber(facility.taxIdentificationNumber || "");
      setOperatingHours(sanitizeLegacyDefault(facility.operatingHours));
      setStreetAddress(facility.streetAddress || "");
      setCity(facility.city || "");
      setProvince(facility.province || "");
      setZipCode(facility.zipCode || "");
      setContactNumber(facility.contactNumber || "");
      setContactEmail(facility.contactEmail || "");

      try {
        if (facility.notificationPreferencesJson) {
          setNotifications(JSON.parse(facility.notificationPreferencesJson));
        }
      } catch {
        // keep defaults
      }
    }
  }, [facility]);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!facility || !tenantSlug) return;

    setSaving(true);
    try {
      const payload = {
        tenantSlug,
        name: name.trim() || facility.name,
        status,
        classification: classification.trim() || undefined,
        licenseToOperate: licenseToOperate.trim() || undefined,
        philHealthAccreditationNumber: philHealthAccreditationNumber.trim() || undefined,
        taxIdentificationNumber: taxIdentificationNumber.trim() || undefined,
        operatingHours: operatingHours.trim() || undefined,
        streetAddress: streetAddress.trim() || undefined,
        city: city.trim() || undefined,
        province: province.trim() || undefined,
        zipCode: zipCode.trim() || undefined,
        contactNumber: contactNumber.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        notificationPreferencesJson: JSON.stringify(notifications),
      };

      await apiClient.put(`/facilities/${facility.id}/settings`, payload);
      toast.success("Facility profile and regulatory settings updated successfully!");
      onOpenChange(false);
      if (onSaved) onSaved();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to save facility settings");
    } finally {
      setSaving(false);
    }
  };

  if (!facility) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-[96vw] sm:max-w-4xl h-[92dvh] sm:h-auto sm:max-h-[90vh] flex flex-col gap-0 rounded-2xl sm:rounded-3xl p-0 overflow-hidden border border-slate-200 dark:border-slate-800 shadow-2xl bg-white dark:bg-slate-950">
        {/* Header */}
        <div className="p-4 sm:p-6 pb-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 sm:p-2.5 rounded-2xl bg-primary/10 text-primary shrink-0">
              <IconBuildingHospital className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 flex-wrap">
                <span className="truncate max-w-[280px] sm:max-w-md">{name || facility.name}</span>
                <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider shrink-0">
                  {facility.facilityType}
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 truncate">
                Configure facility profile, regulatory IDs, and notifications
              </DialogDescription>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
            <Badge variant="outline" className="text-xs font-semibold px-2.5 py-1 bg-background border-slate-200 dark:border-slate-800">
              Status: <span className="font-bold text-emerald-600 dark:text-emerald-400 ml-1">{status}</span>
            </Badge>
          </div>
        </div>

        {/* Responsive Horizontal Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0 gap-0">
          <div className="shrink-0 z-20 px-3 sm:px-6 py-2.5 border-b border-slate-100 dark:border-slate-800/80 bg-white/95 dark:bg-slate-950/95 backdrop-blur-sm overflow-x-auto scrollbar-none">
            <TabsList className="bg-slate-100 dark:bg-slate-900 p-1 h-auto gap-1 rounded-xl inline-flex min-w-max flex-nowrap border border-slate-200/80 dark:border-slate-800">
              <TabsTrigger
                value="profile"
                className="rounded-lg px-3 py-1.5 text-xs font-semibold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-primary data-[state=active]:shadow-xs gap-1.5 shrink-0 whitespace-nowrap text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-all"
              >
                <IconFileCertificate className="h-3.5 w-3.5" />
                <span>Regulatory &amp; Statutory</span>
              </TabsTrigger>
              <TabsTrigger
                value="letterhead"
                className="rounded-lg px-3 py-1.5 text-xs font-semibold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-primary data-[state=active]:shadow-xs gap-1.5 shrink-0 whitespace-nowrap text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-all"
              >
                <IconPalette className="h-3.5 w-3.5" />
                <span>Letterhead</span>
              </TabsTrigger>
              <TabsTrigger
                value="notifications"
                className="rounded-lg px-3 py-1.5 text-xs font-semibold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-primary data-[state=active]:shadow-xs gap-1.5 shrink-0 whitespace-nowrap text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-all"
              >
                <IconBell className="h-3.5 w-3.5" />
                <span>Notifications</span>
              </TabsTrigger>
              <TabsTrigger
                value="license"
                className="rounded-lg px-3 py-1.5 text-xs font-semibold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-primary data-[state=active]:shadow-xs gap-1.5 shrink-0 whitespace-nowrap text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-all"
              >
                <IconKey className="h-3.5 w-3.5" />
                <span>License &amp; Hard Limits</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6 overscroll-contain">
            {/* TAB 1: REGULATORY & STATUTORY PROFILE */}
            <TabsContent value="profile" className="m-0 space-y-5">
              <div className="p-3.5 rounded-2xl bg-primary/5 border border-primary/10 flex items-start gap-2.5">
                <IconFileCertificate className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Official operating credentials, government statutory IDs, and facility operating schedule.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Facility Operating Name
                  </Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. St. Jude Family Medical Clinic"
                    className="h-9 text-xs rounded-xl font-semibold"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Operational Status
                  </Label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as FacilityData["status"])}
                    className="w-full h-9 px-3 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-background font-semibold"
                  >
                    <option value="Active">Active</option>
                    <option value="Provisioning">Provisioning</option>
                    <option value="Suspended">Suspended</option>
                    <option value="Failed">Failed</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    DOH License to Operate (LTO)
                  </Label>
                  <Input
                    value={licenseToOperate}
                    onChange={(e) => setLicenseToOperate(e.target.value)}
                    placeholder="e.g. DOH-LTO-01-2026"
                    className="h-9 text-xs font-mono uppercase rounded-xl"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    PhilHealth Accreditation ID
                  </Label>
                  <Input
                    value={philHealthAccreditationNumber}
                    onChange={(e) => setPhilHealthAccreditationNumber(e.target.value)}
                    placeholder="e.g. PHIC-ACC-982143"
                    className="h-9 text-xs font-mono uppercase rounded-xl"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    BIR TIN
                  </Label>
                  <Input
                    value={taxIdentificationNumber}
                    onChange={(e) => setTaxIdentificationNumber(e.target.value)}
                    placeholder="e.g. 123-456-789-000"
                    className="h-9 text-xs font-mono rounded-xl"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Official Operating Hours Schedule
                  </Label>
                  {!operatingHours && (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                      Not set yet — please enter schedule
                    </span>
                  )}
                </div>
                <Input
                  value={operatingHours}
                  onChange={(e) => setOperatingHours(e.target.value)}
                  placeholder="e.g. Mon-Fri 8:00 AM - 5:00 PM, Sat 8:00 AM - 12:00 PM"
                  className={cn("h-9 text-xs rounded-xl", !operatingHours && "border-amber-300 dark:border-amber-800/60")}
                />
                {!operatingHours && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-tight">
                    Schedule is empty. Specify the operating hours to display on official records and patient scheduling.
                  </p>
                )}
              </div>

              {/* Physical Location Address */}
              <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                    <IconMapPin className="h-4 w-4 text-primary" />
                    <span>Physical Facility Address</span>
                  </div>
                  {!streetAddress && (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                      Address not configured yet
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600 dark:text-slate-400">Street Address / Building</Label>
                  <Input
                    value={streetAddress}
                    onChange={(e) => setStreetAddress(e.target.value)}
                    placeholder="e.g. Unit 402, High Street South Corporate Plaza"
                    className="h-9 text-xs rounded-xl"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600 dark:text-slate-400">City / Municipality</Label>
                    <Input
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="e.g. Makati City"
                      className="h-9 text-xs rounded-xl"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600 dark:text-slate-400">Province / Region</Label>
                    <Input
                      value={province}
                      onChange={(e) => setProvince(e.target.value)}
                      placeholder="e.g. Metro Manila"
                      className="h-9 text-xs rounded-xl"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600 dark:text-slate-400">Zip Code</Label>
                    <Input
                      value={zipCode}
                      onChange={(e) => setZipCode(e.target.value)}
                      placeholder="e.g. 1634"
                      className="h-9 text-xs font-mono rounded-xl"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Facility Contact Hotline
                    </Label>
                    {!contactNumber && (
                      <span className="text-[10px] text-slate-400 font-normal">
                        Optional
                      </span>
                    )}
                  </div>
                  <Input
                    value={contactNumber}
                    onChange={(e) => setContactNumber(e.target.value)}
                    placeholder="e.g. +63 (2) 8876-5432"
                    className="h-9 text-xs font-mono rounded-xl"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Official Facility Email
                    </Label>
                    {!contactEmail && (
                      <span className="text-[10px] text-slate-400 font-normal">
                        Optional
                      </span>
                    )}
                  </div>
                  <Input
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    type="email"
                    placeholder="e.g. info@clinic.ph"
                    className="h-9 text-xs rounded-xl"
                  />
                </div>
              </div>
            </TabsContent>

            {/* TAB 2: LETTERHEAD LIVES IN THE FACILITY CONSOLE */}
            <TabsContent value="letterhead" className="m-0 space-y-4">
              <div className="p-3.5 rounded-2xl bg-primary/5 border border-primary/10 flex items-start gap-2.5">
                <IconSparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Letterhead, logo, paper size and physician stamps are printed by the facility itself, so they are edited
                  in the facility&apos;s own console. Workspace-wide brand identity (name, logo and accent color) is managed in
                  Workspace Settings.
                </p>
              </div>
              {facility.consoleUrl ? (
                <Button asChild variant="outline" className="rounded-xl text-xs font-semibold gap-1.5">
                  <a href={facility.consoleUrl} target="_blank" rel="noopener noreferrer">
                    <IconExternalLink className="h-3.5 w-3.5" />
                    Edit letterhead in facility console
                  </a>
                </Button>
              ) : (
                <p className="text-xs text-slate-500">
                  The facility console link becomes available once the facility has finished provisioning.
                </p>
              )}
            </TabsContent>

            {/* TAB 3: NOTIFICATION PREFERENCES */}
            <TabsContent value="notifications" className="m-0 space-y-4">
              <div className="p-3.5 rounded-2xl bg-primary/5 border border-primary/10 flex items-start gap-2.5">
                <IconBell className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Real-time webhook and event notification rules for dropzone uploads, dispensing transactions, and critical patient alerts.
                </p>
              </div>

              <div className="space-y-3 pt-2">
                {[
                  {
                    key: "dropzoneLabUploadAlert",
                    title: "External Lab Result Dropzone Uploads",
                    desc: "Send real-time alert and notify attending physician whenever an external lab uploads diagnostic PDF/results via the public dropzone.",
                  },
                  {
                    key: "dropzoneRxDispenseAlert",
                    title: "e-Prescription Dropzone Dispensation Alerts",
                    desc: "Notify clinic staff when a community or hospital pharmacy dispenses an e-prescription slip and logs dispensing details.",
                  },
                  {
                    key: "criticalLabAbnormalAlert",
                    title: "Panic / Critical Value Abnormal Results",
                    desc: "Immediate high-priority push notification when external diagnostic findings exceed critical clinical panic thresholds.",
                  },
                  {
                    key: "eodSummaryDigest",
                    title: "End-of-Day (EOD) Operational Digest",
                    desc: "Receive daily summary of all dropzone uploads, pending orders, and registered patient consultations at 7:00 PM PST.",
                  },
                ].map((item) => {
                  const isChecked = Boolean(notifications[item.key]);
                  return (
                    <div
                      key={item.key}
                      onClick={() =>
                        setNotifications((prev: any) => ({
                          ...prev,
                          [item.key]: !isChecked,
                        }))
                      }
                      className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-card hover:bg-slate-50/50 dark:hover:bg-slate-900/30 cursor-pointer flex items-center justify-between gap-4 transition-colors"
                    >
                      <div className="space-y-0.5">
                        <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          {item.title}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {item.desc}
                        </div>
                      </div>

                      <div
                        className={`size-6 rounded-lg flex items-center justify-center shrink-0 border transition-all ${
                          isChecked
                            ? "bg-primary border-primary text-primary-foreground shadow-xs"
                            : "border-slate-300 dark:border-slate-700 bg-background"
                        }`}
                      >
                        {isChecked && <IconCheck className="h-4 w-4" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </TabsContent>

            {/* TAB 4: CRYPTOGRAPHIC LICENSE & HARD LIMITS */}
            <TabsContent value="license" className="m-0 space-y-6">
              <div className="space-y-6">
                {/* Security Guarantee Banner */}
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-3">
                  <IconShieldCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                      Asymmetric Cryptographic Root of Trust (ECDSA P-256)
                    </div>
                    <p className="text-xs text-emerald-700 dark:text-emerald-300/90 leading-relaxed">
                      This facility operates with autonomous operational authority. Resource hard limits are sealed digitally into the license key. 
                      Direct modifications to local databases will invalidate the signature and prevent unmetered staff creation.
                    </p>
                  </div>
                </div>

                {loadingLicense ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-500">
                    <IconLoader className="h-6 w-6 animate-spin text-primary" />
                    <span className="text-xs">Fetching cryptographically signed license...</span>
                  </div>
                ) : licenseData ? (
                  <>
                    {/* Signed License Key Box */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                          <IconKey className="h-3.5 w-3.5 text-primary" />
                          <span>Facility License Key (Token)</span>
                        </Label>
                        <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border-primary/20">
                          Tier: {licenseData.planTier}
                        </Badge>
                      </div>

                      <div className="p-3 sm:p-3.5 rounded-2xl bg-slate-900 text-slate-100 font-mono text-[11px] break-all border border-slate-800 shadow-inner flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                        <span className="truncate max-w-full sm:max-w-[500px]">{licenseData.licenseToken}</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={handleCopyLicenseKey}
                          className="shrink-0 h-8 px-3 rounded-xl text-xs font-bold gap-1.5 bg-slate-800 hover:bg-slate-700 text-white"
                        >
                          {copiedKey ? <IconCheck className="h-3.5 w-3.5 text-emerald-400" /> : <IconCopy className="h-3.5 w-3.5" />}
                          <span>{copiedKey ? "Copied" : "Copy Key"}</span>
                        </Button>
                      </div>
                    </div>

                    {/* Hard Limit Badges & Capacities */}
                    <div className="space-y-3">
                      <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Rooted Operational Limits
                      </Label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-card space-y-1">
                          <div className="text-[11px] font-semibold text-slate-500">Max Active Staff</div>
                          <div className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">
                            {licenseData.limits.maxStaff} <span className="text-xs font-normal text-slate-400">members</span>
                          </div>
                        </div>

                        <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-card space-y-1">
                          <div className="text-[11px] font-semibold text-slate-500">Max Beds</div>
                          <div className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">
                            {licenseData.limits.maxBeds} <span className="text-xs font-normal text-slate-400">beds</span>
                          </div>
                        </div>

                        <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-card space-y-1">
                          <div className="text-[11px] font-semibold text-slate-500">Max Analyzers</div>
                          <div className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">
                            {licenseData.limits.maxAnalyzers} <span className="text-xs font-normal text-slate-400">LIS units</span>
                          </div>
                        </div>

                        <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-card space-y-1">
                          <div className="text-[11px] font-semibold text-slate-500">Monthly Consultations</div>
                          <div className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">
                            {licenseData.limits.maxMonthlyConsultations.toLocaleString()} <span className="text-xs font-normal text-slate-400">/ mo</span>
                          </div>
                        </div>

                        <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-card space-y-1">
                          <div className="text-[11px] font-semibold text-slate-500">Encrypted Storage</div>
                          <div className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">
                            {(licenseData.limits.maxStorageMb / 1024).toFixed(0)} <span className="text-xs font-normal text-slate-400">GB</span>
                          </div>
                        </div>

                        <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-card space-y-1">
                          <div className="text-[11px] font-semibold text-slate-500">Terminals</div>
                          <div className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">
                            {licenseData.limits.concurrentTerminals} <span className="text-xs font-normal text-slate-400">concurrent</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Air-Gapped / On-Premise Activation Instructions */}
                    <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 space-y-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                        <IconServer className="h-4 w-4 text-primary" />
                        <span>Air-Gapped / Offline Local Server Activation</span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        For facilities operating entirely offline or in low-connectivity rural health units, apply this license key directly to the local facility instance:
                      </p>
                      <pre className="p-3 rounded-xl bg-slate-950 text-slate-200 font-mono text-[10px] sm:text-[11px] overflow-x-auto border border-slate-800">
                        {`POST http://localhost:5000/api/v1/${facility.facilityType.toLowerCase()}/license/apply\nContent-Type: application/json\n\n{\n  "licenseToken": "${licenseData.licenseToken.slice(0, 32)}..."\n}`}
                      </pre>
                    </div>
                  </>
                ) : (
                  <div className="py-8 text-center space-y-2">
                    <p className="text-xs text-slate-500">No license token found for this facility.</p>
                    <Button type="button" size="sm" variant="outline" onClick={fetchLicenseKey}>
                      Retry Loading License
                    </Button>
                  </div>
                )}
              </div>
            </TabsContent>
          </div>
        </Tabs>

        {/* Responsive Footer */}
        <div className="p-3.5 sm:p-5 border-t border-slate-100 dark:border-slate-800 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 bg-slate-50/50 dark:bg-slate-900/30 shrink-0 z-20">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="w-full sm:w-auto rounded-xl text-xs font-semibold h-9"
          >
            Cancel
          </Button>

          <Button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full sm:w-auto rounded-xl text-xs font-bold px-6 h-9 bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 shadow-md"
          >
            {saving ? (
              <>
                <IconLoader className="h-4 w-4 animate-spin" />
                <span>Saving Settings...</span>
              </>
            ) : (
              <>
                <IconCheck className="h-4 w-4" />
                <span>Save Facility Settings</span>
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
