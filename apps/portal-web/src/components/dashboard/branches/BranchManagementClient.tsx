"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { 
  branchService, 
  BranchDto, 
  CreateBranchPayload, 
  UpdateBranchPayload, 
  ConfigureBranchPhilHealthPayload,
  TestBranchPhilHealthPayload,
  TestPhilHealthConnectionResult
} from "@/services/branch.service";
import { facilityService, WorkspaceFacility } from "@/services/facility.service";
import FacilityOnboardingWizard from "@/components/dashboard/FacilityOnboardingWizard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  IconBuilding, 
  IconHospital, 
  IconTestPipe, 
  IconPill, 
  IconMapPin, 
  IconShieldCheck, 
  IconAlertTriangle, 
  IconPlus, 
  IconEdit, 
  IconTrash, 
  IconLoader, 
  IconCheck, 
  IconSearch, 
  IconExternalLink,
  IconKey,
  IconRefresh,
  IconSettings,
  IconPhone,
  IconMail,
  IconDotsVertical,
  IconBolt,
  IconAlertCircle
} from "@tabler/icons-react";
import FacilitySettingsHub, { FacilityData } from "@/components/dashboard/FacilitySettingsHub";
import { getConsoleBaseDomain } from "@/utils/domain";
import { APP_SUBDOMAINS } from "@/config/site";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const DASHBOARD_PORTS: Record<string, number> = {
  Clinic: 8081,
  Laboratory: 8082,
  Pharmacy: 8083,
  Organization: 8084,
};

function resolveConsoleUrl(fac: WorkspaceFacility, tenantSlug: string): string | null {
  if (fac.consoleUrl) return fac.consoleUrl;
  const baseDomain = getConsoleBaseDomain();
  if (baseDomain) {
    const sub = APP_SUBDOMAINS[fac.facilityType] || "clinic";
    const targetSlug = fac.slug || tenantSlug;
    return `https://${targetSlug}.${sub}.${baseDomain}`;
  }
  const isLocal = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
  if (isLocal) {
    const port = DASHBOARD_PORTS[fac.facilityType] || 8081;
    return `http://localhost:${port}`;
  }
  return null;
}

const FACILITY_SLOTS = [
  {
    type: "Clinic" as const,
    key: "clinic" as const,
    label: "Clinic",
    description: "Outpatient consultations, EHR & medical records",
    icon: IconHospital,
    color: "text-blue-500 dark:text-blue-400",
    bg: "bg-blue-500/10 dark:bg-blue-500/20",
    border: "border-blue-200 dark:border-blue-800",
  },
  {
    type: "Laboratory" as const,
    key: "laboratory" as const,
    label: "Laboratory",
    description: "Diagnostic orders, specimen tracking & LIS",
    icon: IconTestPipe,
    color: "text-purple-500 dark:text-purple-400",
    bg: "bg-purple-500/10 dark:bg-purple-500/20",
    border: "border-purple-200 dark:border-purple-800",
  },
  {
    type: "Pharmacy" as const,
    key: "pharmacy" as const,
    label: "Pharmacy",
    description: "Drug dispensing, inventory & prescription fulfillment",
    icon: IconPill,
    color: "text-emerald-500 dark:text-emerald-400",
    bg: "bg-emerald-500/10 dark:bg-emerald-500/20",
    border: "border-emerald-200 dark:border-emerald-800",
  },
  {
    type: "Organization" as const,
    key: "organization" as const,
    label: "Organization",
    description: "Hospital networks, HMOs & provider administration",
    icon: IconBuilding,
    color: "text-amber-500 dark:text-amber-400",
    bg: "bg-amber-500/10 dark:bg-amber-500/20",
    border: "border-amber-200 dark:border-amber-800",
  },
];

export default function BranchManagementClient() {
  const params = useParams();
  const searchParams = useSearchParams();
  const tenantSlug = (params?.tenant as string) || "demo-tenant";

  const [branches, setBranches] = useState<BranchDto[]>([]);
  const [facilities, setFacilities] = useState<WorkspaceFacility[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<BranchDto | null>(null);
  const [philhealthBranch, setPhilhealthBranch] = useState<BranchDto | null>(null);
  const [deletingBranch, setDeletingBranch] = useState<BranchDto | null>(null);
  const [deleteBranchConfirmName, setDeleteBranchConfirmName] = useState("");
  const [deleteBranchAcknowledged, setDeleteBranchAcknowledged] = useState(false);
  const [isDeletingBranch, setIsDeletingBranch] = useState(false);

  // Contextual facility onboarding wizard
  const [wizardBranch, setWizardBranch] = useState<BranchDto | null>(null);
  const [wizardType, setWizardType] = useState<"clinic" | "laboratory" | "pharmacy" | "organization">("clinic");
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  // Facility settings hub state
  const [settingsFacility, setSettingsFacility] = useState<FacilityData | null>(null);

  // Form states
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formStreet, setFormStreet] = useState("");
  const [formBarangay, setFormBarangay] = useState("");
  const [formCity, setFormCity] = useState("");
  const [formProvince, setFormProvince] = useState("");
  const [formRegion, setFormRegion] = useState("NCR");
  const [formZip, setFormZip] = useState("");
  const [formContact, setFormContact] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [savingForm, setSavingForm] = useState(false);

  // PhilHealth Form state
  const [phAccreditation, setPhAccreditation] = useState("");
  const [phPmcc, setPhPmcc] = useState("");
  const [phCertId, setPhCertId] = useState("");
  const [phUsername, setPhUsername] = useState("");
  const [phPassword, setPhPassword] = useState("");
  const [phCipherKey, setPhCipherKey] = useState("");
  const [phEndpoint, setPhEndpoint] = useState("https://staging.philhealth.gov.ph/KONSULTA/SOAP");
  const [savingPh, setSavingPh] = useState(false);
  const [isTestingPh, setIsTestingPh] = useState(false);
  const [testPhResult, setTestPhResult] = useState<TestPhilHealthConnectionResult | null>(null);

  // Fetch branches and facilities (optionally opening settings for a newly created facility)
  const loadData = async (focusFacilityId?: string, focusFacilityName?: string) => {
    setLoading(true);
    try {
      const [branchList, facList] = await Promise.all([
        branchService.getBranches(tenantSlug),
        facilityService.getFacilities(tenantSlug),
      ]);
      setBranches(branchList || []);
      setFacilities(facList || []);

      if (focusFacilityId || focusFacilityName) {
        const found = (facList || []).find((f) => 
          (focusFacilityId && f.id === focusFacilityId) ||
          (focusFacilityName && f.name.toLowerCase() === focusFacilityName.toLowerCase())
        );
        if (found) {
          setSettingsFacility(found as FacilityData);
        }
      }
    } catch (err: unknown) {
      console.error("Failed to load branch data", err);
      toast.error("Could not load branches. Please refresh the page.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const handleFacilityCreated = (e: Event) => {
      const customEvent = e as CustomEvent<{ facilityId?: string; facilityName?: string }>;
      loadData(customEvent.detail?.facilityId, customEvent.detail?.facilityName);
    };
    window.addEventListener("clinicez:facility-created", handleFacilityCreated);
    return () => {
      window.removeEventListener("clinicez:facility-created", handleFacilityCreated);
    };
  }, [tenantSlug]);

  // Open Create Modal
  const handleOpenCreate = () => {
    setFormName("");
    setFormCode("");
    setFormStreet("");
    setFormBarangay("");
    setFormCity("");
    setFormProvince("");
    setFormRegion("NCR");
    setFormZip("");
    setFormContact("");
    setFormEmail("");
    setIsCreateOpen(true);
  };

  // Open create branch modal or contextual wizard if trigger params are present in URL
  useEffect(() => {
    if (searchParams.get("createBranch") === "true") {
      handleOpenCreate();
      const sp = new URLSearchParams(window.location.search);
      sp.delete("createBranch");
      window.history.replaceState({}, "", `${window.location.pathname}${sp.toString() ? `?${sp.toString()}` : ""}`);
    }

    const createType = searchParams.get("create");
    const targetBranchId = searchParams.get("branchId");
    if (createType && ["clinic", "laboratory", "pharmacy", "organization"].includes(createType)) {
      const branch = branches.find((b) => b.id === targetBranchId) || null;
      if (branch) {
        setWizardBranch(branch);
        setWizardType(createType as "clinic" | "laboratory" | "pharmacy" | "organization");
        setIsWizardOpen(true);
        const sp = new URLSearchParams(window.location.search);
        sp.delete("create");
        sp.delete("branchId");
      }
    }
  }, [searchParams, branches]);

  // Open Edit Modal
  const handleOpenEdit = (branch: BranchDto) => {
    setEditingBranch(branch);
    setFormName(branch.name);
    setFormCode(branch.code || "");
    setFormStreet(branch.streetAddress || "");
    setFormBarangay(branch.barangay || "");
    setFormCity(branch.city || "");
    setFormProvince(branch.province || "");
    setFormRegion(branch.region || "NCR");
    setFormZip(branch.zipCode || "");
    setFormContact(branch.contactNumber || "");
    setFormEmail(branch.contactEmail || "");
  };

  // Submit Create or Edit
  const handleSaveBranch = async () => {
    if (!formName.trim()) {
      toast.error("Branch name is required.");
      return;
    }

    setSavingForm(true);
    try {
      if (editingBranch) {
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
          isActive: true
        };
        await branchService.updateBranch(editingBranch.id, payload);
        toast.success(`Branch "${formName}" updated successfully.`);
        setEditingBranch(null);
      } else {
        const payload: CreateBranchPayload = {
          tenantId: tenantSlug,
          name: formName.trim(),
          code: formCode.trim() || undefined,
          streetAddress: formStreet.trim() || undefined,
          barangay: formBarangay.trim() || undefined,
          city: formCity.trim() || undefined,
          province: formProvince.trim() || undefined,
          region: formRegion.trim() || undefined,
          zipCode: formZip.trim() || undefined,
          contactNumber: formContact.trim() || undefined,
          contactEmail: formEmail.trim() || undefined
        };
        await branchService.createBranch(payload);
        toast.success(`Branch "${formName}" created successfully.`);
        setIsCreateOpen(false);
      }
      await loadData();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      toast.error("Failed to save branch: " + errorMsg);
    } finally {
      setSavingForm(false);
    }
  };

  // Open PhilHealth Modal
  const handleOpenPhilHealth = (branch: BranchDto) => {
    setPhilhealthBranch(branch);
    setPhAccreditation(branch.philHealthAccreditationNumber || "");
    setPhPmcc(branch.philHealthPmccNumber || "");
    setPhCertId(branch.philHealthSoftwareCertificateId || "");
    setPhUsername("");
    setPhPassword("");
    setPhCipherKey("");
    setPhEndpoint(branch.philHealthKonsultaEndpoint || "https://staging.philhealth.gov.ph/KONSULTA/SOAP");
    setTestPhResult(null);
    setIsTestingPh(false);
  };

  // Test PhilHealth Gateway Connection (before saving)
  const handleTestPhilHealth = async () => {
    if (!philhealthBranch) return;
    if (!phAccreditation.trim()) {
      toast.error("PhilHealth Accreditation Number is required to test gateway connection.");
      return;
    }

    setIsTestingPh(true);
    setTestPhResult(null);
    try {
      const payload: TestBranchPhilHealthPayload = {
        accreditationNumber: phAccreditation.trim(),
        pmccNumber: phPmcc.trim() || undefined,
        softwareCertificateId: phCertId.trim() || undefined,
        username: phUsername.trim() || undefined,
        password: phPassword || undefined,
        cipherKey: phCipherKey.trim() || undefined,
        konsultaEndpoint: phEndpoint.trim() || undefined,
      };

      const result = await branchService.testPhilHealthConnection(philhealthBranch.id, payload);
      setTestPhResult(result);
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      const failureResult: TestPhilHealthConnectionResult = {
        success: false,
        message: "Failed to connect to gateway: " + errorMsg,
      };
      setTestPhResult(failureResult);
      toast.error(failureResult.message);
    } finally {
      setIsTestingPh(false);
    }
  };

  // Save PhilHealth Credentials
  const handleSavePhilHealth = async () => {
    if (!philhealthBranch) return;
    if (!phAccreditation.trim()) {
      toast.error("PhilHealth Accreditation Number is required.");
      return;
    }

    setSavingPh(true);
    try {
      const payload: ConfigureBranchPhilHealthPayload = {
        accreditationNumber: phAccreditation.trim(),
        pmccNumber: phPmcc.trim() || undefined,
        softwareCertificateId: phCertId.trim() || undefined,
        username: phUsername.trim() || undefined,
        password: phPassword || undefined,
        cipherKey: phCipherKey.trim() || undefined,
        konsultaEndpoint: phEndpoint.trim() || undefined,
        isPhilHealthAccredited: true
      };
      await branchService.configurePhilHealth(philhealthBranch.id, payload);
      toast.success(`PhilHealth credentials configured for branch "${philhealthBranch.name}".`);
      setPhilhealthBranch(null);
      await loadData();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      toast.error("Failed to configure PhilHealth: " + errorMsg);
    } finally {
      setSavingPh(false);
    }
  };

  // Delete Branch (Intentional confirmation required)
  const handleDeleteBranch = async () => {
    if (!deletingBranch) return;
    if (deleteBranchConfirmName.trim() !== deletingBranch.name.trim() || !deleteBranchAcknowledged) {
      toast.error("Please type the exact branch name and acknowledge the deletion impact.");
      return;
    }
    setIsDeletingBranch(true);
    try {
      await branchService.deleteBranch(deletingBranch.id);
      toast.success(`Branch "${deletingBranch.name}" removed.`);
      setDeletingBranch(null);
      setDeleteBranchConfirmName("");
      setDeleteBranchAcknowledged(false);
      await loadData();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      toast.error("Failed to delete branch: " + errorMsg);
    } finally {
      setIsDeletingBranch(false);
    }
  };

  // Contextual Add Facility trigger
  const handleOpenAddFacility = (branch: BranchDto, facilityType?: "clinic" | "laboratory" | "pharmacy" | "organization") => {
    setWizardBranch(branch);
    if (facilityType) {
      setWizardType(facilityType);
    } else {
      // Find the first unfilled slot
      const occupied = branch.facilities.map((f) => f.facilityType.toLowerCase());
      const firstFree = FACILITY_SLOTS.find((s) => !occupied.includes(s.key));
      setWizardType(firstFree ? firstFree.key : "clinic");
    }
    setIsWizardOpen(true);
  };

  const filteredBranches = branches.filter((b) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const facilityMatch = b.facilities.some((f) => f.name.toLowerCase().includes(q));
    return (
      b.name.toLowerCase().includes(q) ||
      (b.code && b.code.toLowerCase().includes(q)) ||
      (b.city && b.city.toLowerCase().includes(q)) ||
      (b.philHealthPmccNumber && b.philHealthPmccNumber.toLowerCase().includes(q)) ||
      facilityMatch
    );
  });

  const totalFacilitiesAttached = branches.reduce((sum, b) => sum + (b.facilities?.length || 0), 0);
  const totalAccreditedBranches = branches.filter((b) => b.isPhilHealthAccredited).length;
  const unassignedFacilities = facilities.filter(
    (f) => !f.branchId || !branches.some((b) => b.id === f.branchId)
  );

  return (
    <div className="w-full flex-1 flex flex-col gap-6 sm:gap-8 p-4 sm:p-6 md:p-8 max-w-7xl mx-auto animate-in fade-in-50 duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Branches &amp; Locations</h1>
            <Badge variant="outline" className="font-mono text-xs border-primary/30 text-primary bg-primary/5">
              Branch-First Architecture
            </Badge>
          </div>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1">
            Physical branches serve as the regulatory foundation for provisioning Clinics, Laboratories, Pharmacies, and Organizations.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadData()}
            disabled={loading}
            className="rounded-xl h-9 text-xs font-semibold gap-1.5"
          >
            <IconRefresh className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            onClick={handleOpenCreate}
            className="rounded-xl font-bold text-xs px-5 h-9 bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm flex items-center justify-center gap-1.5"
          >
            <IconPlus className="h-4 w-4" />
            New Branch
          </Button>
        </div>
      </div>

      {/* Stats Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="p-4 rounded-2xl border bg-card/60 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Total Branches</span>
            <div className="text-2xl font-black text-foreground mt-0.5">{branches.length}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <IconBuilding className="h-5 w-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl border bg-card/60 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Facilities Attached</span>
            <div className="text-2xl font-black text-foreground mt-0.5">{totalFacilitiesAttached}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <IconHospital className="h-5 w-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl border bg-card/60 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">YAKAP Accredited</span>
            <div className="text-2xl font-black text-foreground mt-0.5">{totalAccreditedBranches}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <IconShieldCheck className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search branches by name, code, PMCC, city, or facility..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10 rounded-xl bg-card text-xs sm:text-sm"
          />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-16 gap-3 text-muted-foreground">
          <IconLoader className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium">Loading branches and locations...</p>
        </div>
      ) : filteredBranches.length === 0 ? (
        <Card className="border-dashed border-2 p-12 text-center flex flex-col items-center justify-center gap-4 bg-muted/20 rounded-2xl">
          <div className="p-4 rounded-full bg-primary/10 text-primary">
            <IconMapPin className="h-8 w-8" />
          </div>
          <div>
            <h3 className="text-base font-bold">No physical branches found</h3>
            <p className="text-xs text-muted-foreground max-w-md mt-1">
              Create your first physical branch to anchor Clinics, Laboratories, and Pharmacies with independent Philippine regulatory credentials.
            </p>
          </div>
          <Button onClick={handleOpenCreate} size="sm" className="rounded-xl font-bold text-xs gap-1.5">
            <IconPlus className="h-4 w-4" />
            Create First Branch
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredBranches.map((branch) => {
            // Find facilities belonging to this branch
            const branchFacilities = branch.facilities.map((bf): WorkspaceFacility => {
              const full = facilities.find((f) => f.id === bf.id);
              if (full) return full;
              return {
                id: bf.id,
                name: bf.name,
                facilityType: bf.facilityType,
                status: bf.status,
                slug: bf.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
                consoleUrl: null,
                createdAt: "",
                classification: null,
                licenseToOperate: null,
                philHealthAccreditationNumber: null,
                taxIdentificationNumber: null,
                operatingHours: null,
                region: null,
                province: null,
                city: branch.city || null,
                barangay: null,
                zipCode: null,
                streetAddress: null,
                contactNumber: null,
                contactEmail: null,
                deploymentMode: "SharedCloud",
                consoleBaseUrl: null,
                visibility: "Private",
                acceptsExternalRequests: false,
                branchId: branch.id,
                isPatientDiscoveryEligible: false,
              };
            });

            const occupiedCount = branchFacilities.length;
            const hasAvailableSlots = occupiedCount < 4;
            const contactPhone = branch.contactNumber?.trim();
            const contactEmail = branch.contactEmail?.trim();
            const cleanPhone = contactPhone ? contactPhone.replace(/^tel:\s*/i, "") : null;
            const cleanEmail = contactEmail ? contactEmail.replace(/^email:\s*/i, "") : null;

            return (
              <Card
                key={branch.id}
                className="relative overflow-hidden rounded-2xl border bg-card shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
              >
                <div>
                  {/* Branch Card Header */}
                  <CardHeader className="pb-3 border-b bg-muted/10 flex flex-col w-full min-w-0 max-w-full overflow-hidden">
                    <div className="flex items-start justify-between gap-3 w-full min-w-0">
                      <div className="space-y-1.5 min-w-0 flex-1 overflow-hidden">
                        <div className="flex items-start sm:items-center gap-2 min-w-0 flex-wrap">
                          <CardTitle
                            className="text-base font-bold text-foreground min-w-0 max-w-full break-words [overflow-wrap:anywhere] line-clamp-2 leading-snug"
                            title={branch.name}
                          >
                            {branch.name}
                          </CardTitle>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {branch.code && (
                              <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0 shrink-0">
                                {branch.code}
                              </Badge>
                            )}
                            <Badge
                              className={`text-[10px] font-semibold shrink-0 ${
                                branch.isActive
                                  ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {branch.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                        </div>
                        <CardDescription className="text-xs flex items-center gap-1.5 min-w-0">
                          <IconMapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span
                            className="truncate block min-w-0"
                            title={
                              [branch.streetAddress, branch.barangay, branch.city, branch.province]
                                .filter(Boolean)
                                .join(", ") || undefined
                            }
                          >
                            {[branch.streetAddress, branch.barangay, branch.city, branch.province]
                              .filter(Boolean)
                              .join(", ") || "No street address configured"}
                          </span>
                        </CardDescription>
                      </div>

                      <div className="shrink-0 flex items-center self-start">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground shrink-0 focus-visible:ring-1"
                              title="Branch actions"
                            >
                              <IconDotsVertical className="h-4 w-4" />
                              <span className="sr-only">Branch options</span>
                            </Button>
                          </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 rounded-xl shadow-lg border">
                          <DropdownMenuItem
                            onClick={() => handleOpenEdit(branch)}
                            className="cursor-pointer text-xs font-medium gap-2 py-2"
                          >
                            <IconEdit className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>Edit Branch</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleOpenPhilHealth(branch)}
                            className="cursor-pointer text-xs font-medium gap-2 py-2"
                          >
                            <IconShieldCheck className="h-3.5 w-3.5 text-primary" />
                            <span>Configure PhilHealth</span>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => {
                              setDeletingBranch(branch);
                              setDeleteBranchConfirmName("");
                              setDeleteBranchAcknowledged(false);
                            }}
                            className="cursor-pointer text-xs font-medium gap-2 py-2 text-destructive focus:text-destructive focus:bg-destructive/10"
                          >
                            <IconTrash className="h-3.5 w-3.5" />
                            <span>Delete Branch</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4 pt-4 text-xs">
                    {/* PhilHealth YAKAP Accreditation Status Bar */}
                    <div className="p-3 rounded-xl border bg-muted/20 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="p-1.5 rounded-lg bg-card border text-primary shrink-0">
                          <IconShieldCheck className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-xs text-foreground truncate">
                            {branch.isPhilHealthAccredited ? "PhilHealth Accredited" : "PhilHealth Unconfigured"}
                          </div>
                          <div
                            className="text-[11px] text-muted-foreground font-mono truncate"
                            title={
                              branch.isPhilHealthAccredited
                                ? `PMCC: ${branch.philHealthPmccNumber || "Configured"} | ACC: ${branch.philHealthAccreditationNumber || "—"}`
                                : undefined
                            }
                          >
                            {branch.isPhilHealthAccredited
                              ? `PMCC: ${branch.philHealthPmccNumber || "Configured"} | ACC: ${branch.philHealthAccreditationNumber || "—"}`
                              : "No credentials bound yet"}
                          </div>
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenPhilHealth(branch)}
                        className="h-7 text-[11px] font-semibold rounded-lg gap-1 px-2.5 shrink-0"
                      >
                        <IconKey className="h-3 w-3 text-primary" />
                        <span>{branch.isPhilHealthAccredited ? "Configure" : "Setup"}</span>
                      </Button>
                    </div>

                    {/* Contained Facilities Grid & Empty Slots */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
                        <span className="uppercase tracking-wider">Facilities Under One Roof</span>
                        <span className="font-mono">{occupiedCount} / 4 Slots Occupied</span>
                      </div>

                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-2.5">
                        {FACILITY_SLOTS.map((slot) => {
                          const slotFacilities = branchFacilities.filter(
                            (f) => f.facilityType.toLowerCase() === slot.key
                          );
                          const Icon = slot.icon;

                          if (slotFacilities.length > 0) {
                            return slotFacilities.map((activeFacility) => {
                              const isProvisioning = activeFacility.status === "Provisioning";
                              const resolvedUrl = resolveConsoleUrl(activeFacility, tenantSlug);

                              return (
                                <div
                                  key={activeFacility.id}
                                  className="p-2.5 sm:p-3 rounded-xl border bg-card flex flex-col justify-between gap-2 sm:gap-2.5 transition-all shadow-2xs hover:border-slate-300 dark:hover:border-slate-700 min-w-0"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
                                      <div className={`p-1.5 sm:p-2 rounded-lg shrink-0 ${slot.bg} ${slot.color}`}>
                                        <Icon className="h-4 w-4" />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="font-bold text-xs truncate text-foreground" title={activeFacility.name}>
                                          {activeFacility.name}
                                        </div>
                                        <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                                          <span className="text-[11px] font-medium text-muted-foreground truncate min-w-0">{slot.label}</span>
                                          <Badge
                                            variant="secondary"
                                            className={`text-[10px] font-semibold px-1.5 py-0 shrink-0 ${
                                              isProvisioning
                                                ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                                                : "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                                            }`}
                                          >
                                            {activeFacility.status}
                                          </Badge>
                                          {activeFacility.isPatientDiscoveryEligible ? (
                                            <Badge variant="outline" className="text-[9px] font-bold bg-primary/10 text-primary border-primary/20 px-1.5 py-0 shrink-0">
                                              Directory Eligible
                                            </Badge>
                                          ) : (
                                            <Badge variant="outline" className="text-[9px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 px-1.5 py-0 shrink-0">
                                              Draft / Private
                                            </Badge>
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => setSettingsFacility(activeFacility as FacilityData)}
                                      className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground shrink-0"
                                      title={`Settings & Hub for ${activeFacility.name}`}
                                    >
                                      <IconSettings className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>

                                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/40 min-w-0">
                                    <span className="font-mono text-[10px] text-muted-foreground truncate min-w-0" title={`${activeFacility.slug}.${slot.key}`}>
                                      {activeFacility.slug}.{slot.key}
                                    </span>

                                    {resolvedUrl ? (
                                      <a
                                        href={resolvedUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline shrink-0"
                                      >
                                        <span>Launch Console</span>
                                        <IconExternalLink className="h-3 w-3" />
                                      </a>
                                    ) : (
                                      <span className="text-[10px] text-muted-foreground italic shrink-0">
                                        {isProvisioning ? "Provisioning..." : "Console inactive"}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            });
                          }

                          // Render Dashed Empty Slot Card
                          return (
                            <div
                              key={slot.key}
                              onClick={() => handleOpenAddFacility(branch, slot.key)}
                              className="group border-2 border-dashed border-border/70 hover:border-primary/70 hover:bg-primary/5 p-2.5 sm:p-3 rounded-xl flex items-center gap-2.5 sm:gap-3 cursor-pointer transition-all duration-200 min-w-0"
                            >
                              <div className="p-1.5 sm:p-2 rounded-lg bg-muted/80 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors shrink-0">
                                <Icon className="h-4 w-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-bold text-muted-foreground group-hover:text-primary transition-colors tracking-tight whitespace-nowrap">
                                  + Add {slot.label}
                                </div>
                                <p className="text-[10px] text-muted-foreground/70 truncate" title={slot.description}>
                                  {slot.description || "Available service slot"}
                                </p>
                              </div>
                              <IconPlus className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary shrink-0 transition-colors" />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </CardContent>
                </div>

                {/* Card Actions Footer */}
                <div className="p-3 border-t bg-muted/10 flex items-center justify-between gap-2 mt-2">
                  <div
                    className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium min-w-0 overflow-hidden"
                    title={[
                      cleanPhone ? `Tel: ${cleanPhone}` : null,
                      cleanEmail ? `Email: ${cleanEmail}` : null,
                    ].filter(Boolean).join(" | ")}
                  >
                    {cleanPhone ? (
                      <>
                        <IconPhone className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
                        <span className="truncate">Tel: {cleanPhone}</span>
                      </>
                    ) : cleanEmail ? (
                      <>
                        <IconMail className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
                        <span className="truncate">Email: {cleanEmail}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground/50 italic">No contact info</span>
                    )}
                  </div>

                  {hasAvailableSlots && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-[11px] font-bold rounded-xl gap-1 text-primary border-primary/30 hover:bg-primary/5 shrink-0"
                        >
                          <IconPlus className="h-3.5 w-3.5" />
                          <span>Add Facility</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56 rounded-xl shadow-lg border">
                        <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Choose Facility Type
                        </div>
                        {FACILITY_SLOTS.map((slot) => {
                          const Icon = slot.icon;
                          const isOccupied = branchFacilities.some(
                            (f) => f.facilityType.toLowerCase() === slot.key
                          );

                          return (
                            <DropdownMenuItem
                              key={slot.key}
                              disabled={isOccupied}
                              onClick={() => handleOpenAddFacility(branch, slot.key)}
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
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── UNASSIGNED FACILITIES (LEGACY / ORPHANED) ── */}
      {unassignedFacilities.length > 0 && (
        <Card className="rounded-2xl border-amber-200 dark:border-amber-900 bg-amber-50/30 dark:bg-amber-950/10 p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <IconAlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                <h3 className="text-sm font-bold text-foreground">Unassigned Facilities</h3>
                <Badge variant="outline" className="text-[10px] font-mono border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-400">
                  {unassignedFacilities.length} Not Linked
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                These facilities were created before the branch-first workflow or have not been linked to a physical branch location yet.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {unassignedFacilities.map((uf) => {
              const slot = FACILITY_SLOTS.find((s) => s.key === uf.facilityType.toLowerCase()) || FACILITY_SLOTS[0];
              const Icon = slot.icon;
              const resolvedUrl = resolveConsoleUrl(uf, tenantSlug);

              return (
                <div
                  key={uf.id}
                  className="p-3 rounded-xl border bg-card shadow-2xs flex flex-col justify-between gap-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 truncate">
                      <div className={`p-1.5 rounded-lg shrink-0 ${slot.bg} ${slot.color}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="truncate">
                        <div className="font-bold text-xs truncate" title={uf.name}>
                          {uf.name}
                        </div>
                        <span className="text-[10px] text-muted-foreground">{slot.label}</span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSettingsFacility(uf as FacilityData)}
                      className="h-6 w-6 rounded-md text-muted-foreground hover:text-foreground shrink-0"
                      title={`Settings for ${uf.name}`}
                    >
                      <IconSettings className="h-3 w-3" />
                    </Button>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-border/40 text-[10px]">
                    <span className="font-mono text-muted-foreground truncate">{uf.slug}</span>
                    {resolvedUrl && (
                      <a
                        href={resolvedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-bold text-primary hover:underline"
                      >
                        <span>Launch</span>
                        <IconExternalLink className="h-2.5 w-2.5" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── CONTEXTUAL FACILITY ONBOARDING WIZARD ── */}
      {isWizardOpen && (
        <FacilityOnboardingWizard
          open={isWizardOpen}
          onOpenChange={setIsWizardOpen}
          initialType={wizardType}
          targetBranch={wizardBranch}
          onFacilityCreated={loadData}
        />
      )}

      {/* ── FACILITY SETTINGS HUB MODAL ── */}
      {settingsFacility && (
        <FacilitySettingsHub
          facility={settingsFacility}
          open={!!settingsFacility}
          onOpenChange={(open) => !open && setSettingsFacility(null)}
          onSaved={() => loadData()}
        />
      )}

      {/* ── CREATE / EDIT BRANCH MODAL ── */}
      <Dialog
        open={isCreateOpen || !!editingBranch}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateOpen(false);
            setEditingBranch(null);
          }
        }}
      >
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">
              {editingBranch ? `Edit Branch: ${editingBranch.name}` : "Create New Physical Branch"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Configure branch name, internal code, and official Philippine standard address for regulatory compliance.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3.5 py-3 text-xs">
            <div className="col-span-2 space-y-1">
              <Label className="text-xs font-semibold">Branch Name *</Label>
              <Input
                placeholder="e.g. Quezon City Medical Hub"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="h-9 rounded-xl text-xs"
              />
            </div>

            <div className="col-span-1 space-y-1">
              <Label className="text-xs font-semibold">Branch Code</Label>
              <Input
                placeholder="e.g. QC-01"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
                className="h-9 rounded-xl text-xs"
              />
            </div>

            <div className="col-span-1 space-y-1">
              <Label className="text-xs font-semibold">Region</Label>
              <Input
                placeholder="e.g. NCR / Region IV-A"
                value={formRegion}
                onChange={(e) => setFormRegion(e.target.value)}
                className="h-9 rounded-xl text-xs"
              />
            </div>

            <div className="col-span-2 space-y-1">
              <Label className="text-xs font-semibold">Street Address</Label>
              <Input
                placeholder="e.g. Unit 402, Medical Arts Tower, EDSA"
                value={formStreet}
                onChange={(e) => setFormStreet(e.target.value)}
                className="h-9 rounded-xl text-xs"
              />
            </div>

            <div className="col-span-1 space-y-1">
              <Label className="text-xs font-semibold">Barangay</Label>
              <Input
                placeholder="e.g. Brgy. Socorro"
                value={formBarangay}
                onChange={(e) => setFormBarangay(e.target.value)}
                className="h-9 rounded-xl text-xs"
              />
            </div>

            <div className="col-span-1 space-y-1">
              <Label className="text-xs font-semibold">City / Municipality</Label>
              <Input
                placeholder="e.g. Quezon City"
                value={formCity}
                onChange={(e) => setFormCity(e.target.value)}
                className="h-9 rounded-xl text-xs"
              />
            </div>

            <div className="col-span-1 space-y-1">
              <Label className="text-xs font-semibold">Province</Label>
              <Input
                placeholder="e.g. Metro Manila / Cavite"
                value={formProvince}
                onChange={(e) => setFormProvince(e.target.value)}
                className="h-9 rounded-xl text-xs"
              />
            </div>

            <div className="col-span-1 space-y-1">
              <Label className="text-xs font-semibold">Zip Code</Label>
              <Input
                placeholder="e.g. 1109"
                value={formZip}
                onChange={(e) => setFormZip(e.target.value)}
                className="h-9 rounded-xl text-xs"
              />
            </div>

            <div className="col-span-1 space-y-1">
              <Label className="text-xs font-semibold">Contact Phone</Label>
              <Input
                placeholder="e.g. +63 917 123 4567"
                value={formContact}
                onChange={(e) => setFormContact(e.target.value)}
                className="h-9 rounded-xl text-xs"
              />
            </div>

            <div className="col-span-1 space-y-1">
              <Label className="text-xs font-semibold">Contact Email</Label>
              <Input
                placeholder="e.g. qc.branch@example.com"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                className="h-9 rounded-xl text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsCreateOpen(false);
                setEditingBranch(null);
              }}
              className="rounded-xl text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveBranch}
              disabled={savingForm}
              className="rounded-xl text-xs font-bold gap-1.5"
            >
              {savingForm && <IconLoader className="h-3.5 w-3.5 animate-spin" />}
              {editingBranch ? "Save Changes" : "Create Branch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── PHILHEALTH YAKAP CREDENTIALS MODAL ── */}
      <Dialog open={!!philhealthBranch} onOpenChange={(open) => !open && setPhilhealthBranch(null)}>
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <IconShieldCheck className="h-5 w-5 text-primary" />
              PhilHealth YAKAP Accreditation
            </DialogTitle>
            <DialogDescription className="text-xs">
              Configure encrypted credentials for {philhealthBranch?.name}. These statutory parameters are securely decrypted at runtime by the PhilHealth Proxy.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Accreditation No. *</Label>
                <Input
                  placeholder="e.g. ACC-2026-881"
                  value={phAccreditation}
                  onChange={(e) => setPhAccreditation(e.target.value)}
                  className="h-9 rounded-xl text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">PMCC Number</Label>
                <Input
                  placeholder="e.g. Z15445"
                  value={phPmcc}
                  onChange={(e) => setPhPmcc(e.target.value)}
                  className="h-9 rounded-xl text-xs font-mono"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Software Certificate ID</Label>
              <Input
                placeholder="e.g. CERT-YAKAP-2026"
                value={phCertId}
                onChange={(e) => setPhCertId(e.target.value)}
                className="h-9 rounded-xl text-xs font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">SOAP Username</Label>
                <Input
                  placeholder="Leave blank to keep existing"
                  value={phUsername}
                  onChange={(e) => setPhUsername(e.target.value)}
                  className="h-9 rounded-xl text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">SOAP Password</Label>
                <Input
                  type="password"
                  placeholder="Leave blank to keep existing"
                  value={phPassword}
                  onChange={(e) => setPhPassword(e.target.value)}
                  className="h-9 rounded-xl text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">AES Cipher Key (Data Protection)</Label>
              <Input
                type="password"
                placeholder="Leave blank to keep existing"
                value={phCipherKey}
                onChange={(e) => setPhCipherKey(e.target.value)}
                className="h-9 rounded-xl text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Konsulta SOAP Endpoint</Label>
              <Input
                value={phEndpoint}
                onChange={(e) => setPhEndpoint(e.target.value)}
                className="h-9 rounded-xl text-xs font-mono"
              />
            </div>

            {/* Diagnostic Gateway Connectivity Test */}
            <div className="rounded-xl border border-border/80 bg-muted/30 p-3 space-y-2 mt-2">
              <div className="flex items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <IconBolt className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    Gateway Connectivity Test
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Verifies credentials &amp; tests <code className="font-mono text-[10px]">getToken</code> against the SOAP gateway before saving.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTestPhilHealth}
                  disabled={isTestingPh || !phAccreditation.trim()}
                  className="h-8 rounded-xl text-xs font-bold gap-1.5 shrink-0 bg-background hover:bg-muted"
                >
                  {isTestingPh ? (
                    <>
                      <IconLoader className="h-3.5 w-3.5 animate-spin text-primary" />
                      <span>Testing...</span>
                    </>
                  ) : (
                    <>
                      <IconBolt className="h-3.5 w-3.5 text-amber-500" />
                      <span>Test Connection</span>
                    </>
                  )}
                </Button>
              </div>

              {testPhResult && (
                <div
                  className={cn(
                    "p-2.5 rounded-lg border text-xs flex items-start gap-2 animate-in fade-in-50 duration-200",
                    testPhResult.success
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
                      : "bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-300"
                  )}
                >
                  {testPhResult.success ? (
                    <IconCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <IconAlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">
                      {testPhResult.success ? "Gateway Connection Verified" : "Connection Failed"}
                    </div>
                    <div className="text-[11px] opacity-90 break-words mt-0.5">
                      {testPhResult.message}
                    </div>
                    {testPhResult.token && (
                      <div className="mt-1 text-[10px] font-mono opacity-80 truncate">
                        Session Token: {testPhResult.token}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between items-center">
            <div className="text-[11px] text-muted-foreground hidden sm:block">
              {testPhResult?.success ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                  <IconCheck className="h-3.5 w-3.5" /> Credentials tested &amp; verified
                </span>
              ) : (
                <span>Test connection before saving is recommended</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPhilhealthBranch(null)}
                className="rounded-xl text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSavePhilHealth}
                disabled={savingPh || isTestingPh}
                className="rounded-xl text-xs font-bold gap-1.5"
              >
                {savingPh && <IconLoader className="h-3.5 w-3.5 animate-spin" />}
                Save Credentials
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── INTENTIONAL DELETE CONFIRMATION MODAL ── */}
      <Dialog
        open={!!deletingBranch}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingBranch(null);
            setDeleteBranchConfirmName("");
            setDeleteBranchAcknowledged(false);
          }
        }}
      >
        <DialogContent className="max-w-md rounded-2xl border-destructive/20 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-destructive flex items-center gap-2">
              <IconAlertTriangle className="h-5 w-5" />
              Delete Branch: {deletingBranch?.name}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Deleting a physical branch is a destructive operation. Its physical location and statutory PhilHealth credentials will be permanently erased.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs leading-relaxed flex items-start gap-2">
              <IconAlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Permanent Impact:</span> All facilities associated with this branch will remain intact, but will become unassigned floating facilities without an accredited physical location.
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground">
                To confirm, type the branch name <span className="font-mono font-bold select-all bg-muted px-1.5 py-0.5 rounded border text-foreground">{deletingBranch?.name}</span> below:
              </Label>
              <Input
                value={deleteBranchConfirmName}
                onChange={(e) => setDeleteBranchConfirmName(e.target.value)}
                placeholder={deletingBranch?.name}
                className="rounded-xl text-xs h-9 border-destructive/30 focus-visible:ring-destructive"
              />
            </div>

            <div className="flex items-start gap-2.5 pt-1">
              <Checkbox
                id="ack-delete-branch"
                checked={deleteBranchAcknowledged}
                onCheckedChange={(checked) => setDeleteBranchAcknowledged(checked === true)}
                className="mt-0.5 data-[state=checked]:bg-destructive data-[state=checked]:border-destructive"
              />
              <label
                htmlFor="ack-delete-branch"
                className="text-xs text-muted-foreground leading-tight cursor-pointer select-none"
              >
                I understand that deleting this branch permanently removes its credentials and leaves associated facilities unassigned.
              </label>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDeletingBranch(null);
                setDeleteBranchConfirmName("");
                setDeleteBranchAcknowledged(false);
              }}
              className="rounded-xl text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteBranch}
              disabled={
                deleteBranchConfirmName.trim() !== deletingBranch?.name.trim() ||
                !deleteBranchAcknowledged ||
                isDeletingBranch
              }
              className="rounded-xl text-xs font-bold gap-1.5 disabled:opacity-50"
            >
              {isDeletingBranch && <IconLoader className="h-3.5 w-3.5 animate-spin" />}
              Permanently Delete Branch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
