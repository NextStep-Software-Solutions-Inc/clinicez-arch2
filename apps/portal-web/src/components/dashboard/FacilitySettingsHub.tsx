"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { apiClient } from "@/transport/apiClient";
import { toast } from "sonner";
import {
  IconBuildingHospital,
  IconCheck,
  IconCloud,
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
  IconExternalLink,
  IconAlertTriangle,
  IconTrash,
  IconAlertCircle,
  IconPower,
  IconWorld
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import {
  facilityService,
  hubServiceFor,
  HUB_ROTATABLE_SERVICES,
  type HubRotatableService,
} from "@/services/facility.service";
import { linkService } from "@/services/link.service";
import { tenantService } from "@/services/tenant.service";
import { ENTITLEMENT_KEYS } from "@/services/entitlement.service";
import { useEntitlements } from "@/hooks/useEntitlements";
import { useOptionalHubCredentials } from "@/components/dashboard/HubCredentialsDialog";
import {
  verificationService,
  type FacilityVerificationStatusDto,
} from "@/services/verification.service";
import type {
  FacilityDeploymentMode,
  FacilityVisibility,
  PlatformVerificationStatus,
} from "@/lib/wire";
import {
  formatVerificationTimestamp,
  getPlatformVerificationDisplay,
  getQueueStatusDisplay,
  validateLtoProofFile,
} from "@/lib/verificationStatus";
import { InlineEvidenceViewer } from "@/components/dashboard/InlineEvidenceViewer";
import { apiErrorMessage } from "@/lib/apiError";
import { toastApiError } from "@/lib/apiToast";

// Prevent legacy hardcoded dummy strings from being assumed as authentic user configurations
const sanitizeLegacyDefault = (val?: string | null): string => {
  if (!val) return "";
  const trimmed = val.trim();
  if (trimmed === "Mon-Sat 8:00 AM - 5:00 PM") return "";
  return trimmed;
};

export type FacilitySettingsTab =
  | "profile"
  | "deployment"
  | "letterhead"
  | "notifications"
  | "license"
  | "danger";

const VISIBILITY_HELP: Record<FacilityVisibility, string> = {
  Private: "Only your workspace can see this facility.",
  Network: "Facilities you link with can see it.",
  Public: "Listed in the directory so other workspaces can find it.",
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
  deploymentMode?: FacilityDeploymentMode;
  consoleBaseUrl?: string | null;
  visibility?: FacilityVisibility;
  acceptsExternalRequests?: boolean;
  branchId?: string | null;
  isPatientDiscoveryEligible?: boolean | null;
  platformVerificationStatus?: PlatformVerificationStatus | null;
  rejectionReason?: string | null;
  ltoEvidenceObjectKey?: string | null;
  verifiedAtUtc?: string | null;
}

interface FacilitySettingsHubProps {
  facility: FacilityData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
  initialTab?: FacilitySettingsTab;
}

export default function FacilitySettingsHub({
  facility,
  open,
  onOpenChange,
  onSaved,
  initialTab = "profile",
}: FacilitySettingsHubProps) {
  const params = useParams();
  const tenantSlug = params?.tenant as string;
  const hubCredentials = useOptionalHubCredentials();
  const { hasFeature } = useEntitlements(tenantSlug || "");
  const interopAvailable = hasFeature(ENTITLEMENT_KEYS.crossTenantInterop);
  const interopLocked = interopAvailable === false;

  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<string>(initialTab);

  // Deployment, Network Visibility & On-Premise Hub Rotation State (migrated from Workspace Settings)
  const [deploymentMode, setDeploymentMode] = useState<FacilityDeploymentMode>(
    facility?.deploymentMode ?? "SharedCloud"
  );
  const [savedDeploymentMode, setSavedDeploymentMode] = useState<FacilityDeploymentMode>(
    facility?.deploymentMode ?? "SharedCloud"
  );
  const [consoleBaseUrl, setConsoleBaseUrl] = useState(facility?.consoleBaseUrl ?? "");
  const [savingDeployment, setSavingDeployment] = useState(false);

  const [visibility, setVisibility] = useState<FacilityVisibility>(facility?.visibility ?? "Private");
  const [acceptsExternalRequests, setAcceptsExternalRequests] = useState<boolean>(
    Boolean(facility?.acceptsExternalRequests)
  );
  const [savingVisibility, setSavingVisibility] = useState(false);

  const [rotateService, setRotateService] = useState<HubRotatableService>(
    facility ? hubServiceFor(facility.facilityType) : "clinic"
  );
  const [confirmingRotate, setConfirmingRotate] = useState(false);
  const [rotatingHub, setRotatingHub] = useState(false);

  // Milestone 2 Discovery Eligibility State
  const [isPatientDiscoveryEligible, setIsPatientDiscoveryEligible] = useState<boolean>(
    Boolean(facility?.isPatientDiscoveryEligible)
  );
  const [updatingDiscovery, setUpdatingDiscovery] = useState(false);

  // Directory Verification Status & LTO Proof Upload State
  const [verificationStatus, setVerificationStatus] =
    useState<FacilityVerificationStatusDto | null>(null);
  const [loadingVerification, setLoadingVerification] = useState(false);
  const [uploadingLtoProof, setUploadingLtoProof] = useState(false);
  const [ltoUploadError, setLtoUploadError] = useState<string | null>(null);
  const [uploadedLtoLocalFile, setUploadedLtoLocalFile] = useState<File | null>(null);
  const ltoFileInputRef = React.useRef<HTMLInputElement | null>(null);

  const facilityId = facility?.id;
  const loadVerificationStatus = React.useCallback(async () => {
    if (!facilityId || !tenantSlug) return;
    setLoadingVerification(true);
    try {
      const statusDto = await verificationService.getFacilityVerificationStatus(
        facilityId,
        tenantSlug,
      );
      setVerificationStatus(statusDto);
    } catch {
      // Keep fallback status from facility prop if detail query fails
    } finally {
      setLoadingVerification(false);
    }
  }, [facilityId, tenantSlug]);

  React.useEffect(() => {
    if (open && facilityId) {
      setLtoUploadError(null);
      setUploadedLtoLocalFile(null);
      void loadVerificationStatus();
    } else if (!open) {
      setVerificationStatus(null);
      setUploadedLtoLocalFile(null);
    }
  }, [open, facilityId, loadVerificationStatus]);

  const handleLtoProofUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !facility) return;

    const validation = validateLtoProofFile(file);
    if (!validation.valid) {
      setLtoUploadError(validation.message);
      toast.error(validation.message);
      e.target.value = "";
      return;
    }

    setLtoUploadError(null);
    setUploadingLtoProof(true);
    try {
      const result = await verificationService.uploadFacilityLtoProof(
        facility.id,
        file,
        tenantSlug,
      );
      setVerificationStatus((prev) =>
        prev
          ? { ...prev, ltoEvidenceObjectKey: result.ltoEvidenceObjectKey }
          : prev,
      );
      setUploadedLtoLocalFile(file);
      toast.success("DOH LTO proof uploaded.");
      await loadVerificationStatus();
      if (onSaved) onSaved();
    } catch (err: unknown) {
      toastApiError(err, "Failed to upload DOH LTO proof", tenantSlug);
    } finally {
      setUploadingLtoProof(false);
      e.target.value = "";
    }
  };

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
      setIsPatientDiscoveryEligible(Boolean(facility.isPatientDiscoveryEligible));
      setDeploymentMode(facility.deploymentMode ?? "SharedCloud");
      setSavedDeploymentMode(facility.deploymentMode ?? "SharedCloud");
      setConsoleBaseUrl(facility.consoleBaseUrl ?? "");
      setVisibility(facility.visibility ?? "Private");
      setAcceptsExternalRequests(Boolean(facility.acceptsExternalRequests));
      setRotateService(hubServiceFor(facility.facilityType));
      setConfirmingRotate(false);

      try {
        if (facility.notificationPreferencesJson) {
          setNotifications(JSON.parse(facility.notificationPreferencesJson));
        }
      } catch {
        // keep defaults
      }
    }
  }, [facility]);

  const deploymentDirty = Boolean(
    facility &&
      (deploymentMode !== savedDeploymentMode ||
        (deploymentMode === "OnPremise" && consoleBaseUrl.trim() !== (facility.consoleBaseUrl ?? "")))
  );

  const visibilityDirty = Boolean(
    facility &&
      (visibility !== (facility.visibility ?? "Private") ||
        acceptsExternalRequests !== Boolean(facility.acceptsExternalRequests))
  );

  const handleSaveDeployment = async () => {
    if (!facility || !tenantSlug) return;
    setSavingDeployment(true);
    try {
      await tenantService.updateFacilityDeployment(tenantSlug, facility.id, {
        deploymentMode,
        consoleBaseUrl: deploymentMode === "OnPremise" ? consoleBaseUrl.trim() : null,
      });
      setSavedDeploymentMode(deploymentMode);
      toast.success(`${facility.name} deployment saved`);
      onSaved?.();
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err, "Failed to save deployment"));
    } finally {
      setSavingDeployment(false);
    }
  };

  const handleChangeVisibility = (next: FacilityVisibility) => {
    setVisibility(next);
    if (next !== "Public") {
      setAcceptsExternalRequests(false);
    }
  };

  const handleSaveVisibility = async () => {
    if (!facility || !tenantSlug) return;
    setSavingVisibility(true);
    try {
      await linkService.setVisibility(tenantSlug, facility.id, {
        visibility,
        acceptsExternalRequests: visibility === "Public" && acceptsExternalRequests,
      });
      toast.success(`${facility.name} visibility saved`);
      onSaved?.();
    } catch (err: unknown) {
      toastApiError(err, "Failed to save visibility", tenantSlug);
    } finally {
      setSavingVisibility(false);
    }
  };

  const handleRotateHubCredentials = async () => {
    if (!facility || !tenantSlug) return;
    setRotatingHub(true);
    try {
      const rotated = await facilityService.rotateHubCredentials(tenantSlug, facility.id, rotateService);
      setConfirmingRotate(false);
      if (hubCredentials) {
        hubCredentials.showRotated(facility.name, rotated);
      } else {
        toast.success(`New ${rotateService} hub credentials generated.`);
      }
    } catch (err: unknown) {
      toastApiError(err, "Failed to rotate hub credentials", tenantSlug);
    } finally {
      setRotatingHub(false);
    }
  };

  const handleToggleDiscoveryEligibility = async () => {
    if (!facility || !tenantSlug || updatingDiscovery) return;

    const previousValue = isPatientDiscoveryEligible;
    const nextValue = !previousValue;

    // Optimistic UI Update
    setIsPatientDiscoveryEligible(nextValue);
    setUpdatingDiscovery(true);

    try {
      await facilityService.setDiscoveryEligibility(tenantSlug, facility.id, nextValue);
      toast.success(
        nextValue
          ? `Patient App Discovery enabled for "${facility.name}". Facility is now Directory Eligible.`
          : `Patient App Discovery disabled for "${facility.name}". Facility returned to Draft / Private.`
      );
      if (onSaved) onSaved();
    } catch (err: unknown) {
      setIsPatientDiscoveryEligible(previousValue);
      toastApiError(err, "Failed to update directory discovery eligibility", tenantSlug);
    } finally {
      setUpdatingDiscovery(false);
    }
  };

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

  // Danger Zone: Status & Deletion State
  const [savingStatus, setSavingStatus] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");
  const [deleteAcknowledged, setDeleteAcknowledged] = useState(false);

  const handleToggleStatus = async (newStatus: "Active" | "Suspended") => {
    if (!facility || !tenantSlug) return;
    setSavingStatus(true);
    try {
      if (newStatus === "Active") {
        await apiClient.post(`/facilities/${facility.id}/activate?tenantSlug=${tenantSlug}`);
      } else {
        await apiClient.put(`/facilities/${facility.id}`, {
          tenantSlug,
          name: facility.name,
          status: newStatus,
        });
      }
      setStatus(newStatus);
      toast.success(`Facility status updated to ${newStatus}.`);
      if (onSaved) onSaved();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update facility status";
      toast.error(msg);
    } finally {
      setSavingStatus(false);
    }
  };

  const handleDeleteFacility = async () => {
    if (!facility || !tenantSlug) return;
    if (deleteConfirmationText.trim() !== facility.name.trim() || !deleteAcknowledged) {
      toast.error("Please type the exact facility name and acknowledge operational impact.");
      return;
    }
    setDeleting(true);
    try {
      await apiClient.delete(`/facilities/${facility.id}?tenantSlug=${tenantSlug}`);
      toast.success(`"${facility.name}" permanently archived.`);
      onOpenChange(false);
      setDeleteConfirmationText("");
      setDeleteAcknowledged(false);
      if (onSaved) onSaved();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete facility";
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  };

  const effectiveLtoEvidenceKey =
    verificationStatus?.ltoEvidenceObjectKey ?? facility?.ltoEvidenceObjectKey ?? null;
  const fetchFacilityLtoProof = React.useMemo(
    () =>
      facilityId && effectiveLtoEvidenceKey
        ? () => verificationService.fetchFacilityLtoProof(facilityId, tenantSlug)
        : undefined,
    [facilityId, tenantSlug, effectiveLtoEvidenceKey],
  );

  if (!facility) return null;

  const effectiveVerificationStatus =
    verificationStatus?.platformVerificationStatus ??
    facility.platformVerificationStatus ??
    "Unverified";
  const verificationBadge = getPlatformVerificationDisplay(effectiveVerificationStatus);
  const effectiveRejectionReason =
    verificationStatus?.rejectionReason ?? facility.rejectionReason ?? null;
  const latestSubmission = verificationStatus?.latestRequest ?? null;
  const latestSubmissionBadge = latestSubmission
    ? getQueueStatusDisplay(latestSubmission.status)
    : null;

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

          <div className="flex items-center gap-2 self-start sm:self-center shrink-0 flex-wrap">
            <Badge variant="outline" className="text-xs font-semibold px-2.5 py-1 bg-background border-slate-200 dark:border-slate-800">
              Status: <span className="font-bold text-emerald-600 dark:text-emerald-400 ml-1">{status}</span>
            </Badge>

            <Badge
              variant="outline"
              className={cn("text-xs font-bold px-2.5 py-1", verificationBadge.badgeClassName)}
            >
              {verificationBadge.label}
            </Badge>

            {isPatientDiscoveryEligible ? (
              <Badge 
                variant="outline" 
                className="text-xs font-bold px-2.5 py-1 bg-primary/10 text-primary border-primary/20 flex items-center gap-1.5"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                <span>Directory Eligible</span>
              </Badge>
            ) : (
              <Badge 
                variant="outline" 
                className="text-xs font-semibold px-2.5 py-1 bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800"
              >
                <span>Draft / Private</span>
              </Badge>
            )}
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
                value="deployment"
                className="rounded-lg px-3 py-1.5 text-xs font-semibold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-primary data-[state=active]:shadow-xs gap-1.5 shrink-0 whitespace-nowrap text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-all"
              >
                <IconServer className="h-3.5 w-3.5" />
                <span>Deployment &amp; Network</span>
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
              <TabsTrigger
                value="danger"
                className="rounded-lg px-3 py-1.5 text-xs font-semibold data-[state=active]:bg-rose-50 dark:data-[state=active]:bg-rose-950/40 data-[state=active]:text-rose-600 dark:data-[state=active]:text-rose-400 data-[state=active]:shadow-xs gap-1.5 shrink-0 whitespace-nowrap text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-all"
              >
                <IconAlertTriangle className="h-3.5 w-3.5 text-rose-500" />
                <span>Danger Zone</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6 overscroll-contain">
            {/* TAB 1: REGULATORY & STATUTORY PROFILE */}
            <TabsContent value="profile" className="m-0 space-y-5">
              {/* ── MILESTONE 2: PATIENT DIRECTORY DISCOVERY CARD ── */}
              <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-xs space-y-3.5 transition-all">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <IconWorld className="h-4 w-4 text-primary shrink-0" />
                      <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                        Patient App Directory Discovery
                      </span>
                      <Badge
                        variant="outline"
                        className={cn("text-[10px] font-bold", verificationBadge.badgeClassName)}
                      >
                        {verificationBadge.label}
                      </Badge>
                      {isPatientDiscoveryEligible ? (
                        <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] font-bold">
                          Directory Eligible
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[10px] font-semibold border-slate-200 dark:border-slate-700">
                          Draft / Private
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      Allow patients to find this facility on the ClinicEZ Patient mobile app directory.
                      When disabled, the facility is strictly internal to your workspace and invisible to consumer search.
                    </p>
                  </div>

                  {/* Accessible Interactive Toggle Switch */}
                  <div className="flex items-center gap-2 shrink-0 pt-0.5">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isPatientDiscoveryEligible}
                      aria-label="Toggle Patient App Directory Discovery"
                      disabled={updatingDiscovery}
                      onClick={handleToggleDiscoveryEligibility}
                      className={cn(
                        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed",
                        isPatientDiscoveryEligible ? "bg-primary" : "bg-slate-200 dark:bg-slate-800"
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out flex items-center justify-center",
                          isPatientDiscoveryEligible ? "translate-x-5" : "translate-x-0"
                        )}
                      >
                        {updatingDiscovery && (
                          <IconLoader className="h-3 w-3 animate-spin text-primary" />
                        )}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Informative Two-Tier Guidance Box */}
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800/80 flex items-start gap-2.5 text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                  <IconSparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-slate-800 dark:text-slate-200">Two-Tier Publishing Governance: </strong>
                    Enabling directory discovery marks this facility eligible. Before the clinic goes live to patients, the clinic team must complete the pre-flight readiness checklist and submit DOH LTO credentials for platform verification.
                  </div>
                </div>

                {/* Rejection Reason Notice */}
                {effectiveRejectionReason ? (
                  <div
                    role="alert"
                    className="p-3 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-2.5 text-xs"
                  >
                    <IconAlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <div className="font-bold">Action Required — Verification Rejected</div>
                      <p className="text-[11px] leading-relaxed">{effectiveRejectionReason}</p>
                    </div>
                  </div>
                ) : null}

                {/* DOH LTO Proof Upload & Submission History */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  <div className="p-3 rounded-xl border border-border bg-muted/30 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-foreground">DOH LTO Proof Document</span>
                      {effectiveLtoEvidenceKey ? (
                        <Badge variant="outline" className="text-[10px] font-semibold bg-success/10 text-success border-success/25">
                          On File
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] font-semibold bg-muted text-muted-foreground border-border">
                          Not Uploaded
                        </Badge>
                      )}
                    </div>
                    {effectiveLtoEvidenceKey || uploadedLtoLocalFile ? (
                      <InlineEvidenceViewer
                        label="DOH License to Operate (LTO) Proof"
                        objectKey={effectiveLtoEvidenceKey}
                        localFile={uploadedLtoLocalFile}
                        fetchEvidence={fetchFacilityLtoProof}
                      />
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        Upload PDF, JPEG, or PNG (max 5 MiB) for platform verification.
                      </p>
                    )}
                    {ltoUploadError ? (
                      <p className="text-[11px] text-destructive font-medium">{ltoUploadError}</p>
                    ) : null}
                    <div className="flex items-center gap-2">
                      <input
                        ref={ltoFileInputRef}
                        type="file"
                        accept="application/pdf,image/jpeg,image/png"
                        onChange={handleLtoProofUpload}
                        className="sr-only"
                        aria-label="Upload DOH LTO proof file"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={uploadingLtoProof}
                        onClick={() => ltoFileInputRef.current?.click()}
                        className="h-8 rounded-xl text-xs font-semibold gap-1.5"
                      >
                        {uploadingLtoProof ? (
                          <>
                            <IconLoader className="h-3.5 w-3.5 animate-spin" />
                            <span>Uploading...</span>
                          </>
                        ) : (
                          <span>{effectiveLtoEvidenceKey ? "Replace LTO Proof" : "Upload DOH LTO Proof"}</span>
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl border border-border bg-muted/30 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-foreground">Submission History Summary</span>
                      {latestSubmissionBadge ? (
                        <Badge variant="outline" className={cn("text-[10px] font-bold", latestSubmissionBadge.badgeClassName)}>
                          {latestSubmissionBadge.label}
                        </Badge>
                      ) : null}
                    </div>
                    {loadingVerification ? (
                      <p className="text-[11px] text-muted-foreground">Loading submission history...</p>
                    ) : latestSubmission ? (
                      <div className="space-y-1 text-[11px] text-muted-foreground">
                        <div className="font-semibold text-foreground">
                          Submission #{latestSubmission.submissionNumber} • {latestSubmission.requestKind}
                        </div>
                        <div>Submitted: {formatVerificationTimestamp(latestSubmission.submittedAtUtc)}</div>
                        {latestSubmission.reviewedAtUtc ? (
                          <div>Reviewed: {formatVerificationTimestamp(latestSubmission.reviewedAtUtc)}</div>
                        ) : null}
                        {latestSubmission.reviewerNotes ? (
                          <div className="text-foreground">Reviewer notes: {latestSubmission.reviewerNotes}</div>
                        ) : null}
                        {latestSubmission.withdrawnAtUtc ? (
                          <div>
                            Withdrawn: {formatVerificationTimestamp(latestSubmission.withdrawnAtUtc)}
                            {latestSubmission.withdrawalReason ? ` (${latestSubmission.withdrawalReason})` : ""}
                          </div>
                        ) : null}
                        {verificationStatus && verificationStatus.practitioners.length > 0 ? (
                          <div>
                            Bundled clinicians: {verificationStatus.practitioners.length}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        No verification submission recorded yet. Submit directory verification from the clinic workstation once readiness checks pass.
                      </p>
                    )}
                  </div>
                </div>
              </div>

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
                  <SelectField
                    ariaLabel="Operational Status"
                    value={status}
                    onValueChange={(v) => setStatus(v as FacilityData["status"])}
                    className="font-semibold"
                    options={[
                      { value: "Active", label: "Active" },
                      { value: "Provisioning", label: "Provisioning" },
                      { value: "Suspended", label: "Suspended" },
                      { value: "Failed", label: "Failed" },
                    ]}
                  />
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

            {/* TAB 2: DEPLOYMENT, NETWORK VISIBILITY & HUB CREDENTIALS */}
            <TabsContent value="deployment" className="m-0 space-y-5">
              {/* Deployment Mode Card */}
              <div className="p-4 sm:p-5 rounded-2xl border border-border bg-card shadow-xs space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-foreground">
                    <IconServer className="h-4 w-4 text-primary shrink-0" />
                    <span>Facility Hosting &amp; Console Address</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Every facility runs as its own service. Choose whether it runs in the Clinic EZ shared cloud or on your own on-premise server.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <SelectField
                    ariaLabel={`${facility.name} deployment`}
                    value={deploymentMode}
                    onValueChange={(v) => setDeploymentMode(v as FacilityDeploymentMode)}
                    className="w-fit min-w-40"
                    options={[
                      { value: "SharedCloud", label: "Shared cloud" },
                      { value: "OnPremise", label: "On-premise" },
                    ]}
                  />

                  {deploymentMode === "OnPremise" ? (
                    <Input
                      aria-label={`${facility.name} console address`}
                      value={consoleBaseUrl}
                      onChange={(e) => setConsoleBaseUrl(e.target.value)}
                      placeholder="https://clinic.hospital.local"
                      maxLength={2048}
                      className="h-9 rounded-xl text-xs flex-1 min-w-56"
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5 flex-1 min-w-48">
                      <IconCloud className="h-3.5 w-3.5 shrink-0" />
                      <span>Console address is generated by Clinic EZ</span>
                    </span>
                  )}

                  <Button
                    type="button"
                    size="sm"
                    disabled={!deploymentDirty || savingDeployment}
                    onClick={handleSaveDeployment}
                    className="rounded-xl text-xs font-bold h-9"
                  >
                    {savingDeployment ? "Saving..." : "Save Deployment"}
                  </Button>
                </div>
              </div>

              {/* Network Visibility Card */}
              <div className="p-4 sm:p-5 rounded-2xl border border-border bg-card shadow-xs space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-foreground">
                    <IconWorld className="h-4 w-4 text-primary shrink-0" />
                    <span>Network Visibility (Workspace Links)</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {VISIBILITY_HELP[visibility]}
                    {visibility === "Public" && " Automatic acceptance activates incoming links without an admin review."}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <SelectField
                    ariaLabel={`${facility.name} visibility`}
                    value={visibility}
                    disabled={interopLocked}
                    onValueChange={(v) => handleChangeVisibility(v as FacilityVisibility)}
                    className="w-fit min-w-36"
                    options={[
                      { value: "Private", label: "Private" },
                      { value: "Network", label: "Network" },
                      { value: "Public", label: "Public" },
                    ]}
                  />

                  <label
                    className={cn(
                      "flex items-center gap-2 text-xs select-none",
                      interopLocked || visibility !== "Public" ? "text-muted-foreground" : "text-foreground cursor-pointer"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={acceptsExternalRequests}
                      disabled={interopLocked || visibility !== "Public"}
                      onChange={(e) => setAcceptsExternalRequests(e.target.checked)}
                    />
                    <span>Accept link requests automatically</span>
                  </label>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!visibilityDirty || savingVisibility || interopLocked}
                    onClick={handleSaveVisibility}
                    className="rounded-xl text-xs font-bold h-9 ml-auto"
                  >
                    {savingVisibility ? "Saving..." : "Save Visibility"}
                  </Button>
                </div>

                {interopLocked && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">
                    Cross-workspace links are not part of your current plan.{" "}
                    <Link href={`/${tenantSlug}/dashboard/plan`} className="font-semibold underline">
                      View plans
                    </Link>
                  </p>
                )}
              </div>

              {/* On-Premise Hub Credentials Rotation Card */}
              {savedDeploymentMode === "OnPremise" && (
                <div className="p-4 sm:p-5 rounded-2xl border border-border bg-muted/30 space-y-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-foreground">
                      <IconKey className="h-4 w-4 text-primary shrink-0" />
                      <span>On-Premise Hub Credentials</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Rotate a hub client&apos;s secret and signing key if credentials were lost or compromised.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <SelectField
                      ariaLabel={`${facility.name} hub client`}
                      value={rotateService}
                      onValueChange={(v) => {
                        setRotateService(v as HubRotatableService);
                        setConfirmingRotate(false);
                      }}
                      className="w-fit min-w-44"
                      options={HUB_ROTATABLE_SERVICES.map((s) => ({
                        value: s,
                        label: s === "cell" ? "cell (upstream)" : s,
                      }))}
                    />

                    {confirmingRotate ? (
                      <>
                        <span className="text-xs text-amber-700 dark:text-amber-400 flex-1 min-w-48">
                          The current {rotateService} secret and signing key stop working immediately.
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={rotatingHub}
                          onClick={handleRotateHubCredentials}
                          className="rounded-xl text-xs font-bold h-9"
                        >
                          {rotatingHub ? "Rotating..." : "Rotate now"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={rotatingHub}
                          onClick={() => setConfirmingRotate(false)}
                          className="rounded-xl text-xs h-9"
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmingRotate(true)}
                        className="rounded-xl text-xs font-bold h-9"
                      >
                        Rotate hub credentials
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* TAB 3: LETTERHEAD LIVES IN THE FACILITY CONSOLE */}
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

            {/* TAB 5: DANGER ZONE & LIFECYCLE */}
            <TabsContent value="danger" className="m-0 space-y-6">
              {/* Status Toggle Card */}
              <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
                    <IconPower className="h-4 w-4 text-amber-500" />
                    <span>Operational Status</span>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs font-semibold px-2.5 py-0.5",
                      status === "Active"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                        : "border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
                    )}
                  >
                    Current: {status}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Suspending this facility temporarily stops patient encounters, queue check-ins, and PhilHealth claim submissions from connected terminals, while preserving all historical clinical records.
                </p>
                <div className="pt-1 flex items-center justify-end">
                  {status === "Active" ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleStatus("Suspended")}
                      disabled={savingStatus}
                      className="rounded-xl border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/50 text-xs font-semibold"
                    >
                      {savingStatus ? (
                        <>
                          <IconLoader className="h-3.5 w-3.5 animate-spin mr-1.5" />
                          <span>Updating Status...</span>
                        </>
                      ) : (
                        <>
                          <IconPower className="h-3.5 w-3.5 mr-1.5 text-amber-500" />
                          <span>Suspend Facility Operations</span>
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleStatus("Active")}
                      disabled={savingStatus}
                      className="rounded-xl border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/50 text-xs font-semibold"
                    >
                      {savingStatus ? (
                        <>
                          <IconLoader className="h-3.5 w-3.5 animate-spin mr-1.5" />
                          <span>Activating...</span>
                        </>
                      ) : (
                        <>
                          <IconPower className="h-3.5 w-3.5 mr-1.5 text-emerald-600" />
                          <span>Activate Facility Operations</span>
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>

              {/* Permanent Deletion / Archive Card */}
              <div className="p-4 sm:p-5 rounded-2xl border border-rose-200 dark:border-rose-950/60 bg-rose-50/30 dark:bg-rose-950/10 space-y-4">
                <div className="flex items-center gap-2 text-sm font-bold text-rose-700 dark:text-rose-400">
                  <IconTrash className="h-4 w-4" />
                  <span>Permanent Deletion &amp; Archival</span>
                </div>

                <div className="p-3 rounded-xl bg-rose-100/60 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 flex items-start gap-2.5 text-xs text-rose-800 dark:text-rose-300 leading-relaxed">
                  <IconAlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                  <div>
                    <span className="font-bold">Caution:</span> Archiving or permanently deleting this facility will sever its connection from connected client terminals, workstations, and local edge synchronizers. This action requires intentional confirmation.
                  </div>
                </div>

                <div className="space-y-3 pt-1">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      To confirm, type the facility name <span className="font-mono font-bold select-all bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100">{facility.name}</span> below:
                    </Label>
                    <Input
                      value={deleteConfirmationText}
                      onChange={(e) => setDeleteConfirmationText(e.target.value)}
                      placeholder={facility.name}
                      className="rounded-xl text-xs h-9 bg-white dark:bg-slate-900 border-rose-200 dark:border-rose-900 focus-visible:ring-rose-500"
                    />
                  </div>

                  <div className="flex items-start gap-2.5 pt-1">
                    <Checkbox
                      id="ack-delete-facility"
                      checked={deleteAcknowledged}
                      onCheckedChange={(checked) => setDeleteAcknowledged(checked === true)}
                      className="mt-0.5 data-[state=checked]:bg-rose-600 data-[state=checked]:border-rose-600"
                    />
                    <label
                      htmlFor="ack-delete-facility"
                      className="text-xs text-slate-600 dark:text-slate-400 leading-tight cursor-pointer select-none"
                    >
                      I understand that archiving this facility will disable its terminals, workstations, and local synchronizers.
                    </label>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-end">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={handleDeleteFacility}
                    disabled={deleteConfirmationText.trim() !== facility.name.trim() || !deleteAcknowledged || deleting}
                    className="rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50"
                  >
                    {deleting ? (
                      <>
                        <IconLoader className="h-3.5 w-3.5 animate-spin mr-1.5" />
                        <span>Archiving Facility...</span>
                      </>
                    ) : (
                      <>
                        <IconTrash className="h-3.5 w-3.5 mr-1.5" />
                        <span>Permanently Archive Facility</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        {/* Responsive Footer */}
        <div className="p-3.5 sm:p-5 border-t border-slate-100 dark:border-slate-800 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 bg-slate-50/50 dark:bg-slate-900/30 shrink-0 z-20">
          {activeTab === "profile" || activeTab === "notifications" ? (
            <>
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
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="w-full sm:w-auto sm:ml-auto rounded-xl text-xs font-semibold h-9"
            >
              Close
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
