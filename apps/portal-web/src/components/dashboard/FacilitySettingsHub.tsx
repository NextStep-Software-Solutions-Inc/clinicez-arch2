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
  IconMapPin,
  IconPhone,
  IconMail,
  IconSparkles,
  IconUpload,
  IconAlertCircle,
  IconExternalLink,
  IconKey,
  IconCopy,
  IconShieldCheck,
  IconServer
} from "@tabler/icons-react";
import { Stethoscope, Stamp as IconStamp } from "lucide-react";

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
  logoUrl?: string | null;
  letterheadHeader?: string | null;
  letterheadSubHeader?: string | null;
  letterheadAddress?: string | null;
  letterheadContact?: string | null;
  letterheadFooter?: string | null;
  stampPhysicianName?: string | null;
  stampPrcLicense?: string | null;
  stampPtrNumber?: string | null;
  stampS2License?: string | null;
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
  const [activeTab, setActiveTab] = useState("letterhead");

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

  // Profile & Statutory State
  const [name, setName] = useState(facility?.name || "");
  const [status, setStatus] = useState<FacilityData["status"]>(facility?.status || "Active");
  const [classification, setClassification] = useState(facility?.classification || "");
  const [licenseToOperate, setLicenseToOperate] = useState(facility?.licenseToOperate || "");
  const [philHealthAccreditationNumber, setPhilHealthAccreditationNumber] = useState(facility?.philHealthAccreditationNumber || "");
  const [taxIdentificationNumber, setTaxIdentificationNumber] = useState(facility?.taxIdentificationNumber || "");
  const [operatingHours, setOperatingHours] = useState(facility?.operatingHours || "Mon-Sat 8:00 AM - 5:00 PM");
  const [streetAddress, setStreetAddress] = useState(facility?.streetAddress || "");
  const [city, setCity] = useState(facility?.city || "");
  const [province, setProvince] = useState(facility?.province || "");
  const [zipCode, setZipCode] = useState(facility?.zipCode || "");
  const [contactNumber, setContactNumber] = useState(facility?.contactNumber || "");
  const [contactEmail, setContactEmail] = useState(facility?.contactEmail || "");

  // Letterhead Branding State
  const [logoUrl, setLogoUrl] = useState(facility?.logoUrl || "");
  const [letterheadHeader, setLetterheadHeader] = useState(facility?.letterheadHeader || facility?.name?.toUpperCase() || "METRO HEALTH INTEGRATED CLINIC");
  const [letterheadSubHeader, setLetterheadSubHeader] = useState(facility?.letterheadSubHeader || "Center for Ambulatory Medicine & Diagnostic Excellence");
  const [letterheadAddress, setLetterheadAddress] = useState(facility?.letterheadAddress || "Unit 402, High Street South Corporate Plaza, BGC, Taguig City");
  const [letterheadContact, setLetterheadContact] = useState(facility?.letterheadContact || "Tel: +63 (2) 8876-5432 | Email: clinic.bgc@clinicez.ph");
  const [letterheadFooter, setLetterheadFooter] = useState(
    facility?.letterheadFooter || "This medical document and electronic prescription is digitally generated in compliance with Philippine FDA Circular 2020-004 and RA 10173 (Data Privacy Act of 2012)."
  );

  // Medical Stamp State
  const [stampPhysicianName, setStampPhysicianName] = useState(facility?.stampPhysicianName || "DR. MARIA KRISTINA SANTOS, MD, FPCP");
  const [stampPrcLicense, setStampPrcLicense] = useState(facility?.stampPrcLicense || "PRC No. 0108924");
  const [stampPtrNumber, setStampPtrNumber] = useState(facility?.stampPtrNumber || "PTR No. 8941203 / Taguig City");
  const [stampS2License, setStampS2License] = useState(facility?.stampS2License || "S2 No. 0918-99214-A1");

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
      setOperatingHours(facility.operatingHours || "Mon-Sat 8:00 AM - 5:00 PM");
      setStreetAddress(facility.streetAddress || "");
      setCity(facility.city || "");
      setProvince(facility.province || "");
      setZipCode(facility.zipCode || "");
      setContactNumber(facility.contactNumber || "");
      setContactEmail(facility.contactEmail || "");

      setLogoUrl(facility.logoUrl || "");
      setLetterheadHeader(facility.letterheadHeader || facility.name?.toUpperCase() || "METRO HEALTH INTEGRATED CLINIC");
      setLetterheadSubHeader(facility.letterheadSubHeader || "Center for Ambulatory Medicine & Diagnostic Excellence");
      setLetterheadAddress(
        facility.letterheadAddress ||
        [facility.streetAddress, facility.city, facility.province].filter(Boolean).join(", ") ||
        "Unit 402, High Street South Corporate Plaza, BGC, Taguig City"
      );
      setLetterheadContact(facility.letterheadContact || facility.contactNumber || "Tel: +63 (2) 8876-5432 | Email: clinic.bgc@clinicez.ph");
      setLetterheadFooter(
        facility.letterheadFooter ||
        "This medical document and electronic prescription is digitally generated in compliance with Philippine FDA Circular 2020-004 and RA 10173 (Data Privacy Act of 2012)."
      );

      setStampPhysicianName(facility.stampPhysicianName || "DR. MARIA KRISTINA SANTOS, MD, FPCP");
      setStampPrcLicense(facility.stampPrcLicense || "PRC No. 0108924");
      setStampPtrNumber(facility.stampPtrNumber || "PTR No. 8941203 / Taguig City");
      setStampS2License(facility.stampS2License || "S2 No. 0918-99214-A1");

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
        logoUrl: logoUrl.trim() || undefined,
        letterheadHeader: letterheadHeader.trim() || undefined,
        letterheadSubHeader: letterheadSubHeader.trim() || undefined,
        letterheadAddress: letterheadAddress.trim() || undefined,
        letterheadContact: letterheadContact.trim() || undefined,
        letterheadFooter: letterheadFooter.trim() || undefined,
        stampPhysicianName: stampPhysicianName.trim() || undefined,
        stampPrcLicense: stampPrcLicense.trim() || undefined,
        stampPtrNumber: stampPtrNumber.trim() || undefined,
        stampS2License: stampS2License.trim() || undefined,
        notificationPreferencesJson: JSON.stringify(notifications),
      };

      await apiClient.put(`/facilities/${facility.id}/settings`, payload);
      toast.success("Facility settings, digital letterhead, and stamp updated successfully!");
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
      <DialogContent className="sm:max-w-4xl max-h-[92vh] flex flex-col rounded-3xl p-0 overflow-hidden border border-slate-200 dark:border-slate-800 shadow-2xl bg-white dark:bg-slate-950">
        {/* Header */}
        <div className="p-6 pb-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/30 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-primary/10 text-primary">
              <IconBuildingHospital className="h-6 w-6" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>{facility.name}</span>
                <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider">
                  {facility.facilityType}
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Configure official letterhead, regulatory stamp, contact details, and notification alerts
              </DialogDescription>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2">
            <Badge variant="outline" className="text-xs font-semibold px-2.5 py-1 bg-background border-slate-200 dark:border-slate-800">
              Status: <span className="font-bold text-emerald-600 dark:text-emerald-400 ml-1">{status}</span>
            </Badge>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <div className="px-6 pt-3 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/20 dark:bg-slate-900/10">
            <TabsList className="bg-transparent p-0 h-10 gap-2 border-b-0">
              <TabsTrigger
                value="letterhead"
                className="rounded-t-xl rounded-b-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs font-bold gap-1.5 px-3.5"
              >
                <IconPalette className="h-4 w-4" />
                <span>Digital Letterhead</span>
              </TabsTrigger>
              <TabsTrigger
                value="stamp"
                className="rounded-t-xl rounded-b-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs font-bold gap-1.5 px-3.5"
              >
                <IconStamp className="h-4 w-4" />
                <span>Medical Stamp Preview</span>
              </TabsTrigger>
              <TabsTrigger
                value="profile"
                className="rounded-t-xl rounded-b-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs font-bold gap-1.5 px-3.5"
              >
                <IconFileCertificate className="h-4 w-4" />
                <span>Regulatory &amp; Statutory</span>
              </TabsTrigger>
              <TabsTrigger
                value="notifications"
                className="rounded-t-xl rounded-b-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs font-bold gap-1.5 px-3.5"
              >
                <IconBell className="h-4 w-4" />
                <span>Notifications</span>
              </TabsTrigger>
              <TabsTrigger
                value="license"
                className="rounded-t-xl rounded-b-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs font-bold gap-1.5 px-3.5"
              >
                <IconKey className="h-4 w-4" />
                <span>License &amp; Hard Limits</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {/* TAB 1: DIGITAL LETTERHEAD CUSTOMIZER */}
            <TabsContent value="letterhead" className="m-0 space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Form Controls (Left Col) */}
                <div className="lg:col-span-6 space-y-4">
                  <div className="p-3.5 rounded-2xl bg-primary/5 border border-primary/10 flex items-start gap-2.5">
                    <IconSparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Custom letterhead printed automatically atop e-prescriptions, diagnostic orders, and clinical receipts. Changes reflect live on the right.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Clinic Logo URL or Image Asset
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        value={logoUrl}
                        onChange={(e) => setLogoUrl(e.target.value)}
                        placeholder="https://example.com/logo.png"
                        className="h-9 text-xs rounded-xl"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setLogoUrl("https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=120&q=80")}
                        className="rounded-xl text-xs shrink-0"
                      >
                        Sample Logo
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Primary Institutional Header
                    </Label>
                    <Input
                      value={letterheadHeader}
                      onChange={(e) => setLetterheadHeader(e.target.value)}
                      placeholder="e.g. METRO HEALTH INTEGRATED CLINIC"
                      className="h-9 text-xs font-bold rounded-xl"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Department / Clinical Specialty Subheader
                    </Label>
                    <Input
                      value={letterheadSubHeader}
                      onChange={(e) => setLetterheadSubHeader(e.target.value)}
                      placeholder="e.g. Center for Outpatient Medicine &amp; Diagnostic Excellence"
                      className="h-9 text-xs rounded-xl"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Printed Address Line
                    </Label>
                    <Input
                      value={letterheadAddress}
                      onChange={(e) => setLetterheadAddress(e.target.value)}
                      placeholder="e.g. Unit 402, High Street South Corporate Plaza, BGC, Taguig City"
                      className="h-9 text-xs rounded-xl"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Printed Contact Line (Phone, Mobile, Email)
                    </Label>
                    <Input
                      value={letterheadContact}
                      onChange={(e) => setLetterheadContact(e.target.value)}
                      placeholder="e.g. Tel: +63 (2) 8876-5432 | Mobile: 0917-123-4567 | info@clinicez.ph"
                      className="h-9 text-xs rounded-xl"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Compliance Legal Footer Notice
                    </Label>
                    <textarea
                      value={letterheadFooter}
                      onChange={(e) => setLetterheadFooter(e.target.value)}
                      rows={3}
                      className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-background p-2.5 font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>

                {/* WYSIWYG Preview (Right Col) */}
                <div className="lg:col-span-6 space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Live Prescription Pad &amp; Order Slip Preview
                  </span>

                  <div className="rounded-2xl border-2 border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-900 p-6 shadow-md min-h-[460px] flex flex-col justify-between text-slate-800 dark:text-slate-200 font-sans">
                    {/* Letterhead Top */}
                    <div>
                      <div className="flex items-start justify-between gap-4 pb-4 border-b-2 border-primary/20">
                        <div className="space-y-1 min-w-0">
                          <h2 className="text-base sm:text-lg font-black tracking-tight text-primary uppercase">
                            {letterheadHeader || "CLINIC LETTERHEAD"}
                          </h2>
                          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            {letterheadSubHeader}
                          </div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">
                            {letterheadAddress}
                          </div>
                          <div className="text-[10px] font-semibold text-primary/80">
                            {letterheadContact}
                          </div>
                        </div>

                        {/* Logo box */}
                        <div className="size-14 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-800 flex items-center justify-center shrink-0">
                          {logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={logoUrl} alt="Clinic Logo" className="size-full object-cover" />
                          ) : (
                            <Stethoscope className="h-6 w-6 text-primary/60" />
                          )}
                        </div>
                      </div>

                      {/* Mock Requisition / Rx Content */}
                      <div className="py-6 space-y-4">
                        <div className="flex justify-between items-center text-[11px] border-b pb-2 text-slate-400">
                          <span>Patient: <strong>J*** D***</strong> (34 / M)</span>
                          <span>Date: <strong>{new Date().toLocaleDateString("en-PH")}</strong></span>
                        </div>

                        <div className="space-y-2 py-2">
                          <div className="text-xl font-serif italic text-primary/70">Rx</div>
                          <div className="text-xs space-y-1 font-mono pl-3 border-l-2 border-primary/30">
                            <div className="font-bold text-slate-900 dark:text-slate-100">Amoxicillin + Clavulanic Acid 625mg Tablet</div>
                            <div className="text-[11px] text-slate-500">Sig: Take 1 tablet every 12 hours after meals for 7 days. #14 tabs</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Signature & Stamp */}
                    <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-end justify-between gap-4">
                      <div className="text-[9px] text-slate-400 max-w-xs leading-tight">
                        {letterheadFooter}
                      </div>

                      <div className="text-right shrink-0">
                        <div className="h-8 border-b border-slate-400 border-dashed w-36 mb-1" />
                        <div className="text-[10px] font-bold text-slate-800 dark:text-slate-200 truncate">
                          {stampPhysicianName}
                        </div>
                        <div className="text-[9px] font-mono text-slate-500">
                          {stampPrcLicense}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* TAB 2: MEDICAL STAMP PREVIEW */}
            <TabsContent value="stamp" className="m-0 space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Stamp Inputs */}
                <div className="lg:col-span-6 space-y-4">
                  <div className="p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-start gap-2.5">
                    <IconStamp className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-900 dark:text-blue-300 leading-relaxed">
                      Philippine Professional Regulation Commission (PRC) &amp; PDEA statutory stamp. Validates official prescriptions, lab test orders, and medical clearances.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Practitioner / Medical Director Name
                    </Label>
                    <Input
                      value={stampPhysicianName}
                      onChange={(e) => setStampPhysicianName(e.target.value)}
                      placeholder="e.g. DR. MARIA KRISTINA SANTOS, MD, FPCP"
                      className="h-9 text-xs font-bold rounded-xl"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      PRC License Number
                    </Label>
                    <Input
                      value={stampPrcLicense}
                      onChange={(e) => setStampPrcLicense(e.target.value)}
                      placeholder="e.g. PRC No. 0108924"
                      className="h-9 text-xs font-mono rounded-xl"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Professional Tax Receipt (PTR) Number &amp; Place
                    </Label>
                    <Input
                      value={stampPtrNumber}
                      onChange={(e) => setStampPtrNumber(e.target.value)}
                      placeholder="e.g. PTR No. 8941203 / Taguig City"
                      className="h-9 text-xs font-mono rounded-xl"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      PDEA S2 Dangerous Drug License (Optional)
                    </Label>
                    <Input
                      value={stampS2License}
                      onChange={(e) => setStampS2License(e.target.value)}
                      placeholder="e.g. S2 No. 0918-99214-A1"
                      className="h-9 text-xs font-mono rounded-xl"
                    />
                    <p className="text-[10px] text-slate-400">Required for prescribing Yellow-pad or Schedule II controlled analgesics.</p>
                  </div>
                </div>

                {/* Stamp Visual Renderings */}
                <div className="lg:col-span-6 space-y-4">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Live Rubber Stamp Renderings (Philippine Standards)
                  </span>

                  {/* Stamp 1: Rectangular Professional Doctor Stamp */}
                  <div className="p-6 rounded-2xl border-2 border-dashed border-blue-500/40 bg-blue-50/20 dark:bg-blue-950/10 flex flex-col items-center justify-center text-center">
                    <div className="border-2 border-blue-700 dark:border-blue-400 rounded-lg p-3.5 max-w-xs w-full bg-white dark:bg-slate-900 shadow-sm transform -rotate-1">
                      <div className="text-xs font-black text-blue-800 dark:text-blue-300 uppercase tracking-tight">
                        {stampPhysicianName}
                      </div>
                      <div className="text-[10px] font-bold text-blue-700 dark:text-blue-400 mt-0.5">
                        Internal Medicine &amp; Outpatient Care
                      </div>
                      <div className="border-t border-blue-300 dark:border-blue-800 my-1.5" />
                      <div className="text-[10px] font-mono text-blue-900 dark:text-blue-200">
                        {stampPrcLicense}
                      </div>
                      <div className="text-[9px] font-mono text-blue-800 dark:text-blue-300">
                        {stampPtrNumber}
                      </div>
                      {stampS2License && (
                        <div className="text-[9px] font-mono text-rose-700 dark:text-rose-400 font-bold mt-0.5">
                          {stampS2License}
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] font-semibold text-slate-400 mt-2">
                      Rectangular Official Practitioner Stamp
                    </span>
                  </div>

                  {/* Stamp 2: Circular Institution / Laboratory Seal */}
                  <div className="p-6 rounded-2xl border-2 border-dashed border-emerald-500/40 bg-emerald-50/20 dark:bg-emerald-950/10 flex flex-col items-center justify-center text-center">
                    <div className="size-36 rounded-full border-2 border-double border-emerald-700 dark:border-emerald-400 p-2 flex flex-col items-center justify-center bg-white dark:bg-slate-900 shadow-sm transform rotate-2">
                      <div className="text-[8px] font-black uppercase text-emerald-800 dark:text-emerald-300 tracking-wider">
                        {facility.name}
                      </div>
                      <div className="text-[7px] text-emerald-600 dark:text-emerald-400">
                        ★ ACCREDITED FACILITY ★
                      </div>
                      <div className="text-[9px] font-bold text-emerald-700 dark:text-emerald-300 uppercase mt-1">
                        VERIFIED
                      </div>
                      <div className="text-[7px] font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
                        {licenseToOperate || "DOH-LTO VALID"}
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold text-slate-400 mt-2">
                      Circular Institutional Certification Seal
                    </span>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* TAB 3: REGULATORY & STATUTORY */}
            <TabsContent value="profile" className="m-0 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Facility Operating Name
                  </Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
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

              <div className="space-y-1.5 pt-1">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Official Operating Hours Schedule
                </Label>
                <Input
                  value={operatingHours}
                  onChange={(e) => setOperatingHours(e.target.value)}
                  placeholder="e.g. Mon-Sat 8:00 AM - 5:00 PM"
                  className="h-9 text-xs rounded-xl"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Facility Contact Hotline
                  </Label>
                  <Input
                    value={contactNumber}
                    onChange={(e) => setContactNumber(e.target.value)}
                    placeholder="e.g. +63 (2) 8876-5432"
                    className="h-9 text-xs font-mono rounded-xl"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Official Facility Email
                  </Label>
                  <Input
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    type="email"
                    placeholder="e.g. clinic@clinicez.ph"
                    className="h-9 text-xs rounded-xl"
                  />
                </div>
              </div>
            </TabsContent>

            {/* TAB 4: NOTIFICATION PREFERENCES */}
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

            {/* TAB 5: CRYPTOGRAPHIC LICENSE & HARD LIMITS */}
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
                      Direct modifications to local databases (<code className="px-1 py-0.5 rounded bg-emerald-500/20 text-[11px]">psql / pgAdmin</code>) will invalidate the signature and prevent unmetered staff creation.
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

                      <div className="p-3.5 rounded-2xl bg-slate-900 text-slate-100 font-mono text-[11px] break-all border border-slate-800 shadow-inner flex items-center justify-between gap-3">
                        <span className="truncate max-w-[550px]">{licenseData.licenseToken}</span>
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
                          <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
                            {licenseData.limits.maxStaff} <span className="text-xs font-normal text-slate-400">members</span>
                          </div>
                        </div>

                        <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-card space-y-1">
                          <div className="text-[11px] font-semibold text-slate-500">Max Beds</div>
                          <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
                            {licenseData.limits.maxBeds} <span className="text-xs font-normal text-slate-400">beds</span>
                          </div>
                        </div>

                        <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-card space-y-1">
                          <div className="text-[11px] font-semibold text-slate-500">Max Analyzers</div>
                          <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
                            {licenseData.limits.maxAnalyzers} <span className="text-xs font-normal text-slate-400">LIS units</span>
                          </div>
                        </div>

                        <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-card space-y-1">
                          <div className="text-[11px] font-semibold text-slate-500">Monthly Consultations</div>
                          <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
                            {licenseData.limits.maxMonthlyConsultations.toLocaleString()} <span className="text-xs font-normal text-slate-400">/ mo</span>
                          </div>
                        </div>

                        <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-card space-y-1">
                          <div className="text-[11px] font-semibold text-slate-500">Encrypted Storage</div>
                          <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
                            {(licenseData.limits.maxStorageMb / 1024).toFixed(0)} <span className="text-xs font-normal text-slate-400">GB</span>
                          </div>
                        </div>

                        <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-card space-y-1">
                          <div className="text-[11px] font-semibold text-slate-500">Terminals</div>
                          <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
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
                      <pre className="p-3 rounded-xl bg-slate-950 text-slate-200 font-mono text-[11px] overflow-x-auto border border-slate-800">
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

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/30">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="rounded-xl text-xs font-semibold"
          >
            Cancel
          </Button>

          <Button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-xl text-xs font-bold px-6 h-9 bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 shadow-md"
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
