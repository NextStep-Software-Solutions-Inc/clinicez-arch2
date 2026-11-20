"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconArrowLeft,
  IconBolt,
  IconBuilding,
  IconCheck,
  IconCloud,
  IconDotsVertical,
  IconExternalLink,
  IconFileCertificate,
  IconHospital,
  IconKey,
  IconLink,
  IconLinkOff,
  IconLoader,
  IconMail,
  IconMapPin,
  IconPhone,
  IconPlus,
  IconRefresh,
  IconServer,
  IconSettings,
  IconShieldCheck,
  IconWorld,
} from "@tabler/icons-react";
import { toast } from "sonner";
import FacilityOnboardingWizard from "@/components/dashboard/FacilityOnboardingWizard";
import FacilitySettingsHub, {
  type FacilityData,
  type FacilitySettingsTab,
} from "@/components/dashboard/FacilitySettingsHub";
import {
  buildBranchFacilities,
  buildPhilHealthConfigurePayload,
  buildPhilHealthTestPayload,
  FACILITY_SLOTS,
  formatBranchFullAddress,
  getAvailableSlots,
  getFacilitySlot,
  getLinkableUnassignedFacilities,
  resolveConsoleUrl,
  resolvePhilHealthPlaceholders,
  sanitizeBranchContact,
} from "@/components/dashboard/branches/branchHelpers";
import { resolveDashboardNavHref } from "@/components/dashboard/nav-main";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiErrorMessage } from "@/lib/apiError";
import { cn } from "@/lib/utils";
import { getPlatformVerificationDisplay } from "@/lib/verificationStatus";
import {
  branchService,
  type BranchDto,
  type TestPhilHealthConnectionResult,
  type UpdateBranchPayload,
} from "@/services/branch.service";
import { facilityService, type WorkspaceFacility } from "@/services/facility.service";

export type BranchDetailTab = "facilities" | "profile" | "philhealth" | "danger";

export function resolveBranchDetailTab(raw: string | null | undefined): BranchDetailTab {
  if (raw === "profile" || raw === "philhealth" || raw === "danger") {
    return raw;
  }
  return "facilities";
}

function BranchProfileCard({
  branch,
  onSaved,
}: {
  branch: BranchDto;
  onSaved: () => Promise<void>;
}) {
  const [formName, setFormName] = useState(branch.name);
  const [formCode, setFormCode] = useState(branch.code || "");
  const [formRegion, setFormRegion] = useState(branch.region || "NCR");
  const [formStreet, setFormStreet] = useState(branch.streetAddress || "");
  const [formBarangay, setFormBarangay] = useState(branch.barangay || "");
  const [formCity, setFormCity] = useState(branch.city || "");
  const [formProvince, setFormProvince] = useState(branch.province || "");
  const [formZip, setFormZip] = useState(branch.zipCode || "");
  const [formContact, setFormContact] = useState(branch.contactNumber || "");
  const [formEmail, setFormEmail] = useState(branch.contactEmail || "");
  const [formActive, setFormActive] = useState(branch.isActive);
  const [saving, setSaving] = useState(false);

  const handleReset = () => {
    setFormName(branch.name);
    setFormCode(branch.code || "");
    setFormRegion(branch.region || "NCR");
    setFormStreet(branch.streetAddress || "");
    setFormBarangay(branch.barangay || "");
    setFormCity(branch.city || "");
    setFormProvince(branch.province || "");
    setFormZip(branch.zipCode || "");
    setFormContact(branch.contactNumber || "");
    setFormEmail(branch.contactEmail || "");
    setFormActive(branch.isActive);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!formName.trim()) {
      toast.error("Branch name is required.");
      return;
    }

    setSaving(true);
    try {
      const payload: UpdateBranchPayload = {
        name: formName.trim(),
        code: formCode.trim() || undefined,
        streetAddress: formStreet.trim() || undefined,
        barangay: formBarangay.trim() || undefined,
        city: formCity.trim() || undefined,
        province: formProvince.trim() || undefined,
        region: formRegion.trim() || undefined,
        zipCode: formZip.trim() || undefined,
        contactNumber: formContact.trim() || undefined,
        contactEmail: formEmail.trim() || undefined,
        isActive: formActive,
      };
      await branchService.updateBranch(branch.id, payload);
      toast.success(`Branch "${formName.trim()}" updated successfully.`);
      await onSaved();
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err, "Failed to update branch profile."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card className="rounded-3xl border shadow-sm bg-card">
        <CardHeader className="p-6 pb-4 border-b">
          <CardTitle className="text-lg font-bold">Branch Profile &amp; Physical Location</CardTitle>
          <CardDescription className="text-xs">
            Maintain the branch identity, Philippine standard physical address, and public contact lines. Changes here do not alter encrypted PhilHealth credentials.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-6 space-y-5 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Branch Name *
              </Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Quezon City Medical Hub"
                className="h-10 rounded-xl text-sm font-medium"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Branch Code
              </Label>
              <Input
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
                placeholder="e.g. QC-01"
                className="h-10 rounded-xl font-mono text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Region
              </Label>
              <Input
                value={formRegion}
                onChange={(e) => setFormRegion(e.target.value)}
                placeholder="e.g. NCR / Region X"
                className="h-9 rounded-xl text-xs"
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2.5 p-2.5 rounded-xl border bg-muted/20 cursor-pointer select-none w-full">
                <Checkbox
                  checked={formActive}
                  onCheckedChange={(checked) => setFormActive(checked === true)}
                />
                <div>
                  <div className="text-xs font-bold text-foreground">Branch Operational (Active)</div>
                  <div className="text-[11px] text-muted-foreground">
                    Inactive branches remain archived without removing facility data.
                  </div>
                </div>
              </label>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Street Address
            </Label>
            <Input
              value={formStreet}
              onChange={(e) => setFormStreet(e.target.value)}
              placeholder="e.g. Unit 402, Medical Arts Tower, EDSA"
              className="h-9 rounded-xl text-xs"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Barangay</Label>
              <Input
                value={formBarangay}
                onChange={(e) => setFormBarangay(e.target.value)}
                placeholder="e.g. Brgy. Socorro"
                className="h-9 rounded-xl text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">City / Municipality</Label>
              <Input
                value={formCity}
                onChange={(e) => setFormCity(e.target.value)}
                placeholder="e.g. Quezon City"
                className="h-9 rounded-xl text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Province</Label>
              <Input
                value={formProvince}
                onChange={(e) => setFormProvince(e.target.value)}
                placeholder="e.g. Metro Manila"
                className="h-9 rounded-xl text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Zip Code</Label>
              <Input
                value={formZip}
                onChange={(e) => setFormZip(e.target.value)}
                placeholder="e.g. 1109"
                className="h-9 rounded-xl text-xs font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Contact Phone
              </Label>
              <Input
                value={formContact}
                onChange={(e) => setFormContact(e.target.value)}
                placeholder="e.g. +63 917 123 4567"
                className="h-9 rounded-xl text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Contact Email
              </Label>
              <Input
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="e.g. qc.branch@example.com"
                type="email"
                className="h-9 rounded-xl text-xs"
              />
            </div>
          </div>
        </CardContent>

        <CardFooter className="p-6 pt-4 border-t bg-muted/15 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={handleReset}
            className="rounded-xl text-xs font-semibold"
          >
            Reset
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={saving}
            className="rounded-xl text-xs font-bold gap-1.5"
          >
            {saving && <IconLoader className="h-3.5 w-3.5 animate-spin" />}
            <span>Save Branch Profile</span>
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

function BranchPhilHealthCard({
  branch,
  onSaved,
}: {
  branch: BranchDto;
  onSaved: () => Promise<void>;
}) {
  const [phAccreditation, setPhAccreditation] = useState(
    branch.philHealthAccreditationNumber || "",
  );
  const [phPmcc, setPhPmcc] = useState(branch.philHealthPmccNumber || "");
  const [phCertId, setPhCertId] = useState(branch.philHealthSoftwareCertificateId || "");
  const [phSecretKey, setPhSecretKey] = useState("");
  const [phCipherKey, setPhCipherKey] = useState("");
  const [phBaseUrl, setPhBaseUrl] = useState(
    branch.philHealthBaseUrl || "https://pcapi.philhealth.gov.ph",
  );
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestPhilHealthConnectionResult | null>(null);

  const placeholders = resolvePhilHealthPlaceholders(branch);

  const handleTest = async () => {
    if (!phAccreditation.trim()) {
      toast.error("PhilHealth Accreditation Number is required to test gateway connection.");
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      const payload = buildPhilHealthTestPayload({
        accreditationNumber: phAccreditation,
        pmccNumber: phPmcc,
        softwareCertificateId: phCertId,
        secretKey: phSecretKey,
        cipherKey: phCipherKey,
        baseUrl: phBaseUrl,
      });
      const result = await branchService.testPhilHealthConnection(branch.id, payload);
      setTestResult(result);
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (err: unknown) {
      const failureResult: TestPhilHealthConnectionResult = {
        success: false,
        message: apiErrorMessage(err, "Failed to connect to PhilHealth gateway."),
      };
      setTestResult(failureResult);
      toast.error(failureResult.message);
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!phAccreditation.trim()) {
      toast.error("PhilHealth Accreditation Number is required.");
      return;
    }

    setSaving(true);
    try {
      const payload = buildPhilHealthConfigurePayload({
        accreditationNumber: phAccreditation,
        pmccNumber: phPmcc,
        softwareCertificateId: phCertId,
        secretKey: phSecretKey,
        cipherKey: phCipherKey,
        baseUrl: phBaseUrl,
      });
      await branchService.configurePhilHealth(branch.id, payload);
      setPhSecretKey("");
      setPhCipherKey("");
      toast.success(`PhilHealth credentials saved for "${branch.name}".`);
      await onSaved();
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err, "Failed to configure PhilHealth credentials."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card className="rounded-3xl border shadow-sm bg-card">
        <CardHeader className="p-6 pb-4 border-b">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <IconShieldCheck className="h-5 w-5 text-primary" />
                <span>PhilHealth YAKAP Accreditation</span>
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Configure encrypted PhilHealth credentials for {branch.name}. Credentials are encrypted at rest and never sent back in responses.
              </CardDescription>
            </div>
            {branch.isPhilHealthAccredited ? (
              <Badge
                variant="outline"
                className="text-xs font-bold bg-success/10 text-success border-success/25 w-fit shrink-0"
              >
                Accredited
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="text-xs font-semibold bg-muted text-muted-foreground border-border w-fit shrink-0"
              >
                Not Configured
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Accreditation No. *</Label>
              <Input
                placeholder="e.g. ACC-2026-881"
                value={phAccreditation}
                onChange={(e) => setPhAccreditation(e.target.value)}
                className="h-9 rounded-xl text-xs font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">PhilHealth Facility Code</Label>
              <Input
                placeholder="e.g. Z15445"
                value={phPmcc}
                onChange={(e) => setPhPmcc(e.target.value)}
                className="h-9 rounded-xl text-xs font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Software Certificate ID</Label>
              <Input
                placeholder="e.g. CERT-YAKAP-2026"
                value={phCertId}
                onChange={(e) => setPhCertId(e.target.value)}
                className="h-9 rounded-xl text-xs font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">PhilHealth Connection URL</Label>
              <Input
                placeholder="https://pcapi.philhealth.gov.ph"
                value={phBaseUrl}
                onChange={(e) => setPhBaseUrl(e.target.value)}
                className="h-9 rounded-xl text-xs font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-semibold">PhilHealth Access Secret</Label>
                {branch.hasSecretKey ? (
                  <Badge
                    variant="outline"
                    className="text-primary bg-primary/10 border-primary/20 text-[10px] py-0 px-1.5 font-normal"
                  >
                    Configured (Encrypted at Rest)
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground text-[10px] py-0 px-1.5 font-normal">
                    Not Set
                  </Badge>
                )}
              </div>
              <Input
                type="password"
                placeholder={placeholders.secretKey}
                value={phSecretKey}
                onChange={(e) => setPhSecretKey(e.target.value)}
                className="h-9 rounded-xl text-xs font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-semibold">Record Encryption Key</Label>
                {branch.hasCipherKey ? (
                  <Badge
                    variant="outline"
                    className="text-primary bg-primary/10 border-primary/20 text-[10px] py-0 px-1.5 font-normal"
                  >
                    Configured (Encrypted at Rest)
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground text-[10px] py-0 px-1.5 font-normal">
                    Not Set
                  </Badge>
                )}
              </div>
              <Input
                type="password"
                placeholder={placeholders.cipherKey}
                value={phCipherKey}
                onChange={(e) => setPhCipherKey(e.target.value)}
                className="h-9 rounded-xl text-xs font-mono"
              />
            </div>
          </div>

          {/* Diagnostic Gateway Connectivity Test */}
          <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <IconBolt className="h-3.5 w-3.5 text-warning shrink-0" />
                  <span>Connection Test</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Verifies credentials against PhilHealth before saving.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleTest()}
                disabled={testing || !phAccreditation.trim()}
                className="h-8 rounded-xl text-xs font-bold gap-1.5 shrink-0"
              >
                {testing ? (
                  <>
                    <IconLoader className="h-3.5 w-3.5 animate-spin text-primary" />
                    <span>Testing...</span>
                  </>
                ) : (
                  <>
                    <IconBolt className="h-3.5 w-3.5 text-warning" />
                    <span>Test Connection</span>
                  </>
                )}
              </Button>
            </div>

            {testResult && (
              <div
                className={cn(
                  "p-3 rounded-xl border text-xs flex items-start gap-2",
                  testResult.success
                    ? "bg-success/10 border-success/30 text-success"
                    : "bg-destructive/10 border-destructive/30 text-destructive",
                )}
              >
                {testResult.success ? (
                  <IconCheck className="h-4 w-4 shrink-0 mt-0.5" />
                ) : (
                  <IconAlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">
                    {testResult.success ? "Gateway Connection Verified" : "Connection Failed"}
                  </div>
                  <div className="text-[11px] opacity-90 break-words mt-0.5">
                    {testResult.message}
                  </div>
                  {testResult.token && (
                    <div className="mt-1 text-[10px] font-mono opacity-80 truncate">
                      Session Token: {testResult.token}
                    </div>
                  )}
                  {typeof testResult.latencyMs === "number" && (
                    <div className="mt-0.5 text-[10px] opacity-80">
                      Response Latency: {testResult.latencyMs} ms
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </CardContent>

        <CardFooter className="p-6 pt-4 border-t bg-muted/15 flex items-center justify-between gap-3">
          <span className="text-[11px] text-muted-foreground hidden sm:inline">
            Leave password inputs blank to retain stored encrypted secrets.
          </span>
          <Button
            type="submit"
            size="sm"
            disabled={saving || testing}
            className="rounded-xl text-xs font-bold gap-1.5 ml-auto"
          >
            {saving && <IconLoader className="h-3.5 w-3.5 animate-spin" />}
            <span>Save Credentials</span>
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

export default function BranchDetailClient() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenantSlug = (params?.tenant as string) || "demo-tenant";
  const branchId = typeof params?.branchId === "string" ? params.branchId : "";

  const requestedTabParam = searchParams?.get("tab") ?? null;
  const [tabOverride, setTabOverride] = useState<{
    param: string | null;
    tab: BranchDetailTab;
  } | null>(null);
  const activeTab: BranchDetailTab =
    tabOverride && tabOverride.param === requestedTabParam
      ? tabOverride.tab
      : resolveBranchDetailTab(requestedTabParam);
  const setActiveTab = useCallback(
    (tab: BranchDetailTab) => {
      setTabOverride({ param: requestedTabParam, tab });
    },
    [requestedTabParam, setTabOverride],
  );

  // Danger Zone delete state
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deleteAcknowledged, setDeleteAcknowledged] = useState(false);
  const [deletingBranch, setDeletingBranch] = useState(false);

  // Facility Hub & Onboarding Wizard state
  const [settingsTarget, setSettingsTarget] = useState<{
    facility: FacilityData;
    initialTab: FacilitySettingsTab;
  } | null>(null);
  const [wizardType, setWizardType] = useState<"clinic" | "laboratory" | "pharmacy" | "organization">("clinic");
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  // Unlink facility confirmation & attach unassigned facility state
  const [unlinkingFacility, setUnlinkingFacility] = useState<WorkspaceFacility | null>(null);
  const [isUnlinking, setIsUnlinking] = useState(false);
  const [selectedUnassignedId, setSelectedUnassignedId] = useState("");
  const [attachingExisting, setAttachingExisting] = useState(false);

  const {
    data,
    error: swrError,
    isLoading,
    isValidating,
    mutate,
  } = useSWR(
    branchId ? `branch-detail/${tenantSlug}/${branchId}` : null,
    async () => {
      const [branchDetail, facList] = await Promise.all([
        branchService.getBranchById(branchId),
        facilityService.getFacilities(tenantSlug),
      ]);
      return {
        branch: branchDetail,
        allFacilities: facList || [],
      };
    },
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  const branch = data?.branch ?? null;
  const allFacilities = useMemo(() => data?.allFacilities ?? [], [data?.allFacilities]);
  const loading = isLoading && !data;
  const loadError = !branchId
    ? "No branch ID was provided."
    : swrError
      ? apiErrorMessage(swrError, "Could not load branch details.")
      : null;

  const refreshData = useCallback(async () => {
    await mutate();
  }, [mutate]);

  useEffect(() => {
    const handleFacilityCreated = () => {
      void mutate();
    };
    window.addEventListener("clinicez:facility-created", handleFacilityCreated);
    return () => {
      window.removeEventListener("clinicez:facility-created", handleFacilityCreated);
    };
  }, [mutate]);

  const branchFacilities = useMemo(() => {
    if (!branch) return [];
    return buildBranchFacilities(branch, allFacilities);
  }, [branch, allFacilities]);

  const availableSlots = useMemo(
    () => getAvailableSlots(branchFacilities),
    [branchFacilities],
  );

  const unassignedFacilities = useMemo(
    () => allFacilities.filter((f) => !f.branchId),
    [allFacilities],
  );

  const linkableUnassigned = useMemo(
    () => getLinkableUnassignedFacilities(unassignedFacilities, branchFacilities),
    [unassignedFacilities, branchFacilities],
  );

  const branchesListHref = resolveDashboardNavHref(tenantSlug, "/dashboard/branches");

  const handleOpenAddFacility = (
    type?: "clinic" | "laboratory" | "pharmacy" | "organization",
  ) => {
    if (type) {
      setWizardType(type);
    } else {
      const firstFree = availableSlots[0];
      setWizardType(firstFree ? firstFree.key : "clinic");
    }
    setIsWizardOpen(true);
  };

  const handleUnlinkFacility = async () => {
    if (!branch || !unlinkingFacility) return;
    setIsUnlinking(true);
    try {
      await branchService.unlinkFacility(branch.id, unlinkingFacility.id);
      toast.success(`"${unlinkingFacility.name}" unlinked from "${branch.name}".`);
      setUnlinkingFacility(null);
      await refreshData();
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err, "Failed to unlink facility from branch."));
    } finally {
      setIsUnlinking(false);
    }
  };

  const handleAttachExisting = async () => {
    if (!branch) return;
    const candidateId = selectedUnassignedId || linkableUnassigned[0]?.id;
    if (!candidateId) return;

    setAttachingExisting(true);
    try {
      await branchService.assignFacilities(branch.id, [candidateId]);
      const fac = linkableUnassigned.find((f) => f.id === candidateId);
      toast.success(`${fac?.name ?? "Facility"} attached to "${branch.name}".`);
      setSelectedUnassignedId("");
      await refreshData();
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err, "Failed to attach existing facility."));
    } finally {
      setAttachingExisting(false);
    }
  };

  const handleDeleteBranch = async () => {
    if (!branch) return;
    if (deleteConfirmName.trim() !== branch.name.trim() || !deleteAcknowledged) {
      toast.error("Please type the exact branch name and acknowledge the deletion impact.");
      return;
    }
    setDeletingBranch(true);
    try {
      await branchService.deleteBranch(branch.id);
      toast.success(`Branch "${branch.name}" removed.`);
      router.push(branchesListHref);
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err, "Failed to delete branch."));
      setDeletingBranch(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full flex-1 flex flex-col gap-6 p-4 sm:p-6 md:p-8 max-w-7xl mx-auto">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-10 w-96 rounded-xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (loadError || !branch) {
    return (
      <div className="w-full flex-1 flex flex-col gap-6 p-4 sm:p-6 md:p-8 max-w-5xl mx-auto">
        <Link
          href={branchesListHref}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground w-fit"
        >
          <IconArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Branches &amp; Locations</span>
        </Link>

        <Card className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center flex flex-col items-center gap-4">
          <div className="p-3 rounded-full bg-destructive/10 text-destructive">
            <IconAlertCircle className="h-7 w-7" />
          </div>
          <div className="space-y-1 max-w-md">
            <h2 className="text-base font-bold text-foreground">Branch could not be loaded</h2>
            <p className="text-xs text-muted-foreground">
              {loadError || "This branch may have been deleted or you no longer have access to it."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm" className="rounded-xl text-xs font-semibold">
              <Link href={branchesListHref}>Return to Branches</Link>
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void refreshData()}
              className="rounded-xl text-xs font-semibold gap-1.5"
            >
              <IconRefresh className="h-3.5 w-3.5" />
              Retry
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const fullAddress = formatBranchFullAddress(branch);
  const { phone: cleanPhone, email: cleanEmail } = sanitizeBranchContact(branch);
  const effectiveUnassignedId = selectedUnassignedId || linkableUnassigned[0]?.id || "";
  const branchFormResetKey = `${branch.id}:${branch.name}:${branch.code ?? ""}:${branch.isActive}:${branch.streetAddress ?? ""}:${branch.barangay ?? ""}:${branch.city ?? ""}:${branch.province ?? ""}:${branch.region ?? ""}:${branch.zipCode ?? ""}:${branch.contactNumber ?? ""}:${branch.contactEmail ?? ""}`;
  const philHealthResetKey = `${branch.id}:${branch.isPhilHealthAccredited}:${branch.philHealthAccreditationNumber ?? ""}:${branch.philHealthPmccNumber ?? ""}:${branch.philHealthSoftwareCertificateId ?? ""}:${branch.philHealthBaseUrl ?? ""}:${Boolean(branch.hasSecretKey)}:${Boolean(branch.hasCipherKey)}`;

  return (
    <div className="w-full flex-1 flex flex-col gap-6 p-4 sm:p-6 md:p-8 max-w-7xl mx-auto animate-in fade-in-50 duration-300">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Link
          href={branchesListHref}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <IconArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Branches &amp; Locations</span>
        </Link>
      </div>

      {/* Branch Summary Header */}
      <Card className="rounded-2xl border bg-card shadow-xs p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-2 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
                <IconBuilding className="h-5 w-5" />
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                {branch.name}
              </h1>
              {branch.code && (
                <Badge variant="secondary" className="text-[11px] font-mono px-2 py-0.5">
                  {branch.code}
                </Badge>
              )}
              <Badge
                variant="outline"
                className={cn(
                  "text-[11px] font-semibold px-2 py-0.5",
                  branch.isActive
                    ? "bg-success/10 text-success border-success/25"
                    : "bg-muted text-muted-foreground border-border",
                )}
              >
                {branch.isActive ? "Active" : "Inactive"}
              </Badge>
              <button
                type="button"
                onClick={() => setActiveTab("philhealth")}
                className="inline-flex items-center focus:outline-none"
                title="View PhilHealth YAKAP credentials"
              >
                {branch.isPhilHealthAccredited ? (
                  <Badge
                    variant="outline"
                    className="text-[11px] font-bold bg-success/10 text-success border-success/25 hover:bg-success/15 cursor-pointer"
                  >
                    YAKAP Accredited
                    {branch.philHealthPmccNumber ? ` • ${branch.philHealthPmccNumber}` : ""}
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="text-[11px] font-semibold bg-warning/10 text-warning border-warning/25 hover:bg-warning/15 cursor-pointer"
                  >
                    PhilHealth Unconfigured
                  </Badge>
                )}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground pl-0.5">
              <span className="inline-flex items-center gap-1.5">
                <IconMapPin className="h-3.5 w-3.5 shrink-0" />
                <span>{fullAddress}</span>
              </span>
              {cleanPhone && (
                <span className="inline-flex items-center gap-1.5">
                  <IconPhone className="h-3.5 w-3.5 shrink-0" />
                  <span>{cleanPhone}</span>
                </span>
              )}
              {cleanEmail && (
                <span className="inline-flex items-center gap-1.5">
                  <IconMail className="h-3.5 w-3.5 shrink-0" />
                  <span>{cleanEmail}</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refreshData()}
              disabled={loading || isValidating}
              className="rounded-xl h-9 text-xs font-semibold gap-1.5"
            >
              <IconRefresh className={`h-4 w-4 ${loading || isValidating ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </Button>

            {availableSlots.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-xl h-9 text-xs font-bold gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    <IconPlus className="h-4 w-4" />
                    <span>Add Facility</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 rounded-xl shadow-lg border">
                  <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Available Service Slots
                  </div>
                  {FACILITY_SLOTS.map((slot) => {
                    const Icon = slot.icon;
                    const isOccupied = !availableSlots.some((s) => s.key === slot.key);
                    return (
                      <DropdownMenuItem
                        key={slot.key}
                        disabled={isOccupied}
                        onClick={() => handleOpenAddFacility(slot.key)}
                        className="cursor-pointer text-xs font-medium gap-2 py-2 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <div className={cn("p-1 rounded-md", slot.bg, slot.color)}>
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <span>+ Add {slot.label}</span>
                        </div>
                        {isOccupied && (
                          <Badge variant="secondary" className="text-[9px] px-1 py-0 font-medium">
                            Added
                          </Badge>
                        )}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Badge variant="secondary" className="h-9 px-3 rounded-xl text-xs font-mono">
                4 / 4 Slots Full
              </Badge>
            )}
          </div>
        </div>
      </Card>

      {/* Detail Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as BranchDetailTab)}
        className="w-full space-y-6"
      >
        <div className="w-full overflow-x-auto pb-1 no-scrollbar -mx-1 px-1">
          <TabsList className="inline-flex w-auto min-w-full sm:min-w-0 justify-start h-auto p-1 bg-muted/65 rounded-xl border flex-nowrap gap-1">
            <TabsTrigger
              value="facilities"
              className="px-4 py-2 text-xs font-semibold flex items-center gap-1.5 shrink-0 whitespace-nowrap"
            >
              <IconHospital className="h-3.5 w-3.5 shrink-0" />
              <span>Facilities Roster ({branchFacilities.length}/4)</span>
            </TabsTrigger>
            <TabsTrigger
              value="profile"
              className="px-4 py-2 text-xs font-semibold flex items-center gap-1.5 shrink-0 whitespace-nowrap"
            >
              <IconMapPin className="h-3.5 w-3.5 shrink-0" />
              <span>Profile &amp; Location</span>
            </TabsTrigger>
            <TabsTrigger
              value="philhealth"
              className="px-4 py-2 text-xs font-semibold flex items-center gap-1.5 shrink-0 whitespace-nowrap"
            >
              <IconShieldCheck className="h-3.5 w-3.5 shrink-0" />
              <span>PhilHealth YAKAP</span>
            </TabsTrigger>
            <TabsTrigger
              value="danger"
              className="px-4 py-2 text-xs font-semibold flex items-center gap-1.5 shrink-0 whitespace-nowrap text-destructive"
            >
              <IconAlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>Danger Zone</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── TAB 1: FACILITIES ROSTER ── */}
        <TabsContent value="facilities" className="outline-none space-y-6 m-0">
          <Card className="rounded-3xl border shadow-sm bg-card overflow-hidden">
            <CardHeader className="p-6 pb-4 border-b">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-lg font-bold">Attached Facilities Roster</CardTitle>
                  <CardDescription className="text-xs">
                    Each physical branch can anchor up to one Clinic, Laboratory, Pharmacy, and Organization. Configure statutory LTO proofs, hosting, network visibility, and directory discovery per facility.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="font-mono text-xs w-fit shrink-0">
                  {branchFacilities.length} / 4 Occupied
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="p-6 space-y-4">
              {branchFacilities.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed p-8 text-center flex flex-col items-center gap-3 bg-muted/20">
                  <div className="p-3 rounded-full bg-primary/10 text-primary">
                    <IconHospital className="h-6 w-6" />
                  </div>
                  <div className="space-y-1 max-w-md">
                    <h3 className="text-sm font-bold text-foreground">
                      No facilities attached to this branch yet
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Provision a Clinic, Laboratory, Pharmacy, or Organization directly under {branch.name} using one of the open service slots below.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-border rounded-2xl border bg-background overflow-hidden">
                  {branchFacilities.map((fac) => {
                    const slot = getFacilitySlot(fac.facilityType);
                    const Icon = slot.icon;
                    const resolvedUrl = resolveConsoleUrl(fac, tenantSlug);
                    const verificationBadge = getPlatformVerificationDisplay(
                      fac.platformVerificationStatus,
                    );

                    return (
                      <div
                        key={fac.id}
                        className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-muted/20 transition-colors"
                      >
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <div className={cn("p-2.5 rounded-xl shrink-0", slot.bg, slot.color)}>
                            <Icon className="h-5 w-5" />
                          </div>

                          <div className="space-y-1.5 min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-bold text-foreground">
                                {fac.name}
                              </span>
                              <Badge variant="outline" className="text-[10px] font-semibold">
                                {slot.label}
                              </Badge>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px] font-semibold",
                                  fac.status === "Active"
                                    ? "bg-success/10 text-success border-success/25"
                                    : fac.status === "Provisioning"
                                      ? "bg-warning/10 text-warning border-warning/25"
                                      : "bg-muted text-muted-foreground border-border",
                                )}
                              >
                                {fac.status}
                              </Badge>
                              <Badge
                                variant="outline"
                                className={cn("text-[10px] font-bold", verificationBadge.badgeClassName)}
                              >
                                {verificationBadge.label}
                              </Badge>
                              {fac.isPatientDiscoveryEligible ? (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] font-bold bg-primary/10 text-primary border-primary/20"
                                >
                                  Directory Eligible
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] font-semibold bg-muted text-muted-foreground border-border"
                                >
                                  Draft / Private
                                </Badge>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                              <span className="font-mono">
                                {fac.slug}.{slot.key}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setSettingsTarget({
                                    facility: fac as FacilityData,
                                    initialTab: "deployment",
                                  })
                                }
                                className="inline-flex items-center gap-1 hover:text-primary transition-colors cursor-pointer"
                              >
                                {fac.deploymentMode === "OnPremise" ? (
                                  <IconServer className="h-3 w-3 shrink-0" />
                                ) : (
                                  <IconCloud className="h-3 w-3 shrink-0" />
                                )}
                                <span>
                                  {fac.deploymentMode === "OnPremise" ? "On-premise" : "Shared cloud"}
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setSettingsTarget({
                                    facility: fac as FacilityData,
                                    initialTab: "deployment",
                                  })
                                }
                                className="inline-flex items-center gap-1 hover:text-primary transition-colors cursor-pointer"
                              >
                                <IconWorld className="h-3 w-3 shrink-0" />
                                <span>Visibility: {fac.visibility}</span>
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                          {resolvedUrl ? (
                            <Button
                              asChild
                              variant="outline"
                              size="sm"
                              className="h-8 rounded-xl text-xs font-semibold gap-1.5 text-primary border-primary/25 hover:bg-primary/5"
                            >
                              <a href={resolvedUrl} target="_blank" rel="noopener noreferrer">
                                <span>Launch Console</span>
                                <IconExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                          ) : (
                            <span className="text-[11px] text-muted-foreground italic px-2">
                              {fac.status === "Provisioning" ? "Provisioning..." : "Console inactive"}
                            </span>
                          )}

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setSettingsTarget({
                                facility: fac as FacilityData,
                                initialTab: "profile",
                              })
                            }
                            className="h-8 rounded-xl text-xs font-semibold gap-1.5"
                          >
                            <IconSettings className="h-3.5 w-3.5" />
                            <span>Configure</span>
                          </Button>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-xl"
                                aria-label={`More actions for ${fac.name}`}
                              >
                                <IconDotsVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 rounded-xl">
                              <DropdownMenuItem
                                onClick={() =>
                                  setSettingsTarget({
                                    facility: fac as FacilityData,
                                    initialTab: "profile",
                                  })
                                }
                                className="cursor-pointer text-xs gap-2"
                              >
                                <IconFileCertificate className="h-3.5 w-3.5 text-muted-foreground" />
                                <span>Regulatory &amp; LTO Proof</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  setSettingsTarget({
                                    facility: fac as FacilityData,
                                    initialTab: "deployment",
                                  })
                                }
                                className="cursor-pointer text-xs gap-2"
                              >
                                <IconServer className="h-3.5 w-3.5 text-muted-foreground" />
                                <span>Deployment &amp; Network</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  setSettingsTarget({
                                    facility: fac as FacilityData,
                                    initialTab: "license",
                                  })
                                }
                                className="cursor-pointer text-xs gap-2"
                              >
                                <IconKey className="h-3.5 w-3.5 text-muted-foreground" />
                                <span>License &amp; Hard Limits</span>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setUnlinkingFacility(fac)}
                                className="cursor-pointer text-xs gap-2 text-destructive focus:text-destructive focus:bg-destructive/10"
                              >
                                <IconLinkOff className="h-3.5 w-3.5" />
                                <span>Unlink from Branch</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Available Slots */}
              {availableSlots.length > 0 && (
                <div className="space-y-2.5 pt-2">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Available Service Slots
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {availableSlots.map((slot) => {
                      const Icon = slot.icon;
                      return (
                        <button
                          key={slot.key}
                          type="button"
                          onClick={() => handleOpenAddFacility(slot.key)}
                          className="group text-left border-2 border-dashed border-border/80 hover:border-primary/70 hover:bg-primary/5 p-3 rounded-xl flex items-center gap-2.5 cursor-pointer transition-all"
                        >
                          <div className="p-2 rounded-lg bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors shrink-0">
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                              + Add {slot.label}
                            </div>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {slot.description}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Attach Existing Unassigned Facility */}
              {linkableUnassigned.length > 0 && (
                <div className="p-4 rounded-2xl border border-border bg-muted/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <IconLink className="h-3.5 w-3.5 text-primary" />
                      <span>Attach Existing Unassigned Facility</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Link a standalone facility in your workspace directly into an open slot on {branch.name}.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <SelectField
                      ariaLabel="Select unassigned facility to attach"
                      value={effectiveUnassignedId}
                      onValueChange={setSelectedUnassignedId}
                      className="w-fit min-w-48"
                      options={linkableUnassigned.map((uf) => ({
                        value: uf.id,
                        label: `${uf.name} (${uf.facilityType})`,
                      }))}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!effectiveUnassignedId || attachingExisting}
                      onClick={() => void handleAttachExisting()}
                      className="h-9 rounded-xl text-xs font-bold gap-1.5"
                    >
                      {attachingExisting && <IconLoader className="h-3.5 w-3.5 animate-spin" />}
                      <span>Attach</span>
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB 2: BRANCH PROFILE & LOCATION ── */}
        <TabsContent value="profile" className="outline-none m-0">
          <BranchProfileCard
            key={branchFormResetKey}
            branch={branch}
            onSaved={refreshData}
          />
        </TabsContent>

        {/* ── TAB 3: PHILHEALTH YAKAP CREDENTIALS ── */}
        <TabsContent value="philhealth" className="outline-none m-0">
          <BranchPhilHealthCard
            key={philHealthResetKey}
            branch={branch}
            onSaved={refreshData}
          />
        </TabsContent>

        {/* ── TAB 4: DANGER ZONE ── */}
        <TabsContent value="danger" className="outline-none m-0">
          <Card className="rounded-3xl border-destructive/30 shadow-sm bg-card">
            <CardHeader className="p-6 pb-4 border-b border-destructive/15">
              <CardTitle className="text-lg font-bold text-destructive flex items-center gap-2">
                <IconAlertTriangle className="h-5 w-5" />
                <span>Delete Physical Branch</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Permanently remove this physical branch record and its stored PhilHealth credentials.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-6 space-y-4 text-xs">
              <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive flex items-start gap-2.5 leading-relaxed">
                <IconAlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Permanent Impact:</span>{" "}
                  {branchFacilities.length > 0
                    ? `The ${branchFacilities.length} facility(s) currently attached to ${branch.name} will remain active, but will become unassigned floating facilities until linked to another branch.`
                    : `All location settings and statutory PhilHealth credentials for ${branch.name} will be permanently removed.`}
                </div>
              </div>

              <div className="space-y-1.5 max-w-md">
                <Label className="text-xs font-medium text-foreground">
                  To confirm, type{" "}
                  <span className="font-mono font-bold select-all bg-muted px-1.5 py-0.5 rounded border text-foreground">
                    {branch.name}
                  </span>{" "}
                  below:
                </Label>
                <Input
                  value={deleteConfirmName}
                  onChange={(e) => setDeleteConfirmName(e.target.value)}
                  placeholder={branch.name}
                  className="rounded-xl text-xs h-9 border-destructive/30 focus-visible:ring-destructive"
                />
              </div>

              <div className="flex items-start gap-2.5">
                <Checkbox
                  id="ack-delete-branch-detail"
                  checked={deleteAcknowledged}
                  onCheckedChange={(checked) => setDeleteAcknowledged(checked === true)}
                  className="mt-0.5 data-[state=checked]:bg-destructive data-[state=checked]:border-destructive"
                />
                <label
                  htmlFor="ack-delete-branch-detail"
                  className="text-xs text-muted-foreground leading-tight cursor-pointer select-none"
                >
                  I understand that deleting this branch permanently removes its credentials and leaves associated facilities unassigned.
                </label>
              </div>
            </CardContent>

            <CardFooter className="p-6 pt-4 border-t bg-muted/10 flex justify-end">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => void handleDeleteBranch()}
                disabled={
                  deleteConfirmName.trim() !== branch.name.trim() ||
                  !deleteAcknowledged ||
                  deletingBranch
                }
                className="rounded-xl text-xs font-bold gap-1.5"
              >
                {deletingBranch && <IconLoader className="h-3.5 w-3.5 animate-spin" />}
                <span>Permanently Delete Branch</span>
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Unlink Facility Confirmation Modal */}
      <Dialog
        open={Boolean(unlinkingFacility)}
        onOpenChange={(open) => !open && !isUnlinking && setUnlinkingFacility(null)}
      >
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <IconLinkOff className="h-4 w-4 text-destructive" />
              <span>Unlink Facility from Branch</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              <strong>{unlinkingFacility?.name}</strong> will be detached from{" "}
              <strong>{branch.name}</strong> and moved to Unassigned Facilities. All clinical data, consoles, and settings are preserved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isUnlinking}
              onClick={() => setUnlinkingFacility(null)}
              className="rounded-xl text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={isUnlinking}
              onClick={() => void handleUnlinkFacility()}
              className="rounded-xl text-xs font-bold gap-1.5"
            >
              {isUnlinking && <IconLoader className="h-3.5 w-3.5 animate-spin" />}
              <span>Unlink Facility</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Contextual Facility Onboarding Wizard */}
      {isWizardOpen && (
        <FacilityOnboardingWizard
          open={isWizardOpen}
          onOpenChange={setIsWizardOpen}
          initialType={wizardType}
          targetBranch={branch}
          onFacilityCreated={() => void refreshData()}
        />
      )}

      {/* Facility Settings Hub */}
      {settingsTarget && (
        <FacilitySettingsHub
          key={`${settingsTarget.facility.id}:${settingsTarget.initialTab}`}
          facility={settingsTarget.facility}
          open={Boolean(settingsTarget)}
          initialTab={settingsTarget.initialTab}
          onOpenChange={(open) => !open && setSettingsTarget(null)}
          onSaved={() => void refreshData()}
        />
      )}
    </div>
  );
}
