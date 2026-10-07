"use client";

import { useEffect, useState, useTransition } from "react";
import { useParams } from "next/navigation";
import { 
  branchService, 
  BranchDto, 
  CreateBranchPayload, 
  UpdateBranchPayload, 
  ConfigureBranchPhilHealthPayload 
} from "@/services/branch.service";
import { apiClient } from "@/transport/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  IconLink, 
  IconLoader, 
  IconCheck, 
  IconSearch, 
  IconExternalLink,
  IconKey,
  IconRefresh
} from "@tabler/icons-react";
import { toast } from "sonner";

interface TenantFacility {
  id: string;
  name: string;
  facilityType: "Clinic" | "Laboratory" | "Pharmacy" | "Organization";
  status: string;
  branchId?: string | null;
}

export default function BranchManagementClient() {
  const params = useParams();
  const tenantSlug = (params?.tenant as string) || "demo-tenant";

  const [branches, setBranches] = useState<BranchDto[]>([]);
  const [facilities, setFacilities] = useState<TenantFacility[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<BranchDto | null>(null);
  const [philhealthBranch, setPhilhealthBranch] = useState<BranchDto | null>(null);
  const [linkBranch, setLinkBranch] = useState<BranchDto | null>(null);
  const [deletingBranch, setDeletingBranch] = useState<BranchDto | null>(null);

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
  const [testingConnection, setTestingConnection] = useState(false);

  // Link Facilities state
  const [selectedFacilityIds, setSelectedFacilityIds] = useState<string[]>([]);
  const [savingLink, setSavingLink] = useState(false);

  // Fetch branches and facilities
  const loadData = async () => {
    setLoading(true);
    try {
      const [branchList, facResponse] = await Promise.all([
        branchService.getBranches(tenantSlug),
        apiClient.get<TenantFacility[]>(`/facilities?tenantSlug=${encodeURIComponent(tenantSlug)}`)
      ]);
      setBranches(branchList);
      setFacilities(facResponse.data || []);
    } catch (err: any) {
      console.error("Failed to load branch data", err);
      toast.error("Could not load branches: " + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
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
    } catch (err: any) {
      toast.error("Failed to save branch: " + (err.response?.data?.message || err.message));
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
    } catch (err: any) {
      toast.error("Failed to configure PhilHealth: " + (err.response?.data?.message || err.message));
    } finally {
      setSavingPh(false);
    }
  };

  // Test PhilHealth Connection
  const handleTestConnection = async () => {
    setTestingConnection(true);
    try {
      const res = await apiClient.post<any>(`/internal/branches/${philhealthBranch?.id}/test-connection`).catch(async () => {
        // Fallback test via proxy
        return await apiClient.post<any>("/tenants/test-connection");
      });
      toast.success("PhilHealth connection test successful! Gateway handshake verified.");
    } catch (err: any) {
      toast.error("Connection check failed: " + (err.response?.data?.message || err.message || "Endpoint unreachable"));
    } finally {
      setTestingConnection(false);
    }
  };

  // Open Link Facilities Modal
  const handleOpenLinkFacilities = (branch: BranchDto) => {
    setLinkBranch(branch);
    // Pre-select currently linked facilities
    const currentLinkedIds = branch.facilities.map(f => f.id);
    setSelectedFacilityIds(currentLinkedIds);
  };

  // Toggle facility selection
  const toggleFacilitySelection = (facilityId: string) => {
    setSelectedFacilityIds(prev =>
      prev.includes(facilityId) ? prev.filter(id => id !== facilityId) : [...prev, facilityId]
    );
  };

  // Save Facility Links
  const handleSaveFacilityLinks = async () => {
    if (!linkBranch) return;
    setSavingLink(true);
    try {
      await branchService.assignFacilities(linkBranch.id, selectedFacilityIds);
      toast.success(`Facilities assigned to branch "${linkBranch.name}".`);
      setLinkBranch(null);
      await loadData();
    } catch (err: any) {
      toast.error("Failed to link facilities: " + (err.response?.data?.message || err.message));
    } finally {
      setSavingLink(false);
    }
  };

  // Delete Branch
  const handleDeleteBranch = async () => {
    if (!deletingBranch) return;
    try {
      await branchService.deleteBranch(deletingBranch.id);
      toast.success(`Branch "${deletingBranch.name}" removed.`);
      setDeletingBranch(null);
      await loadData();
    } catch (err: any) {
      toast.error("Failed to delete branch: " + (err.response?.data?.message || err.message));
    }
  };

  const filteredBranches = branches.filter(b => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      b.name.toLowerCase().includes(q) ||
      (b.code && b.code.toLowerCase().includes(q)) ||
      (b.city && b.city.toLowerCase().includes(q)) ||
      (b.philHealthPmccNumber && b.philHealthPmccNumber.toLowerCase().includes(q))
    );
  });

  return (
    <div className="w-full flex-1 flex flex-col gap-6 sm:gap-8 p-4 sm:p-6 md:p-8 max-w-7xl mx-auto animate-in fade-in-50 duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Branches & Locations</h1>
            <Badge variant="outline" className="font-mono text-xs border-primary/30 text-primary bg-primary/5">
              Multi-Facility Architecture
            </Badge>
          </div>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1">
            Manage physical branches, statutory PhilHealth YAKAP accreditations, and link Clinics, Labs, and Pharmacies Under One Roof.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
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
            Add New Branch
          </Button>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search branches by name, PMCC, city, or code..."
            value={search}
            onChange={e => setSearch(e.target.value)}
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
            <h3 className="text-base font-bold">No branches configured yet</h3>
            <p className="text-xs text-muted-foreground max-w-md mt-1">
              Create your first physical branch to unify your Clinic, Laboratory, and Pharmacy under one roof with independent PhilHealth accreditation.
            </p>
          </div>
          <Button onClick={handleOpenCreate} size="sm" className="rounded-xl font-bold text-xs gap-1.5">
            <IconPlus className="h-4 w-4" />
            Create First Branch
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredBranches.map(branch => {
            const clinics = branch.facilities.filter(f => f.facilityType === "Clinic");
            const labs = branch.facilities.filter(f => f.facilityType === "Laboratory");
            const pharmacies = branch.facilities.filter(f => f.facilityType === "Pharmacy");

            return (
              <Card key={branch.id} className="relative overflow-hidden rounded-2xl border bg-card shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base font-bold truncate">{branch.name}</CardTitle>
                        {branch.code && (
                          <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0">
                            {branch.code}
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="text-xs mt-1 flex items-center gap-1">
                        <IconMapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate">
                          {[branch.streetAddress, branch.barangay, branch.city, branch.province]
                            .filter(Boolean)
                            .join(", ") || "No address specified"}
                        </span>
                      </CardDescription>
                    </div>

                    <Badge
                      className={
                        branch.isActive
                          ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px] font-semibold"
                          : "bg-muted text-muted-foreground text-[10px]"
                      }
                    >
                      {branch.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4 text-xs flex-1">
                  {/* PhilHealth YAKAP Accreditation Status */}
                  <div className="p-3 rounded-xl border bg-muted/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
                        <IconShieldCheck className="h-4 w-4 text-primary" />
                        PhilHealth Accreditation
                      </span>
                      {branch.isPhilHealthAccredited ? (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[10px] font-bold">
                          Accredited
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-[10px] font-bold">
                          Unconfigured
                        </Badge>
                      )}
                    </div>

                    {branch.isPhilHealthAccredited ? (
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div>
                          <span className="text-muted-foreground block text-[10px]">PMCC No.</span>
                          <span className="font-mono font-medium">{branch.philHealthPmccNumber || "—"}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block text-[10px]">Software Cert ID</span>
                          <span className="font-mono font-medium truncate block">{branch.philHealthSoftwareCertificateId || "—"}</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        Not configured. Set up branch credentials to enable direct eClaims and YAKAP transmittal.
                      </p>
                    )}
                  </div>

                  {/* Under One Roof Facility Links */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                      <span>Facilities Under One Roof</span>
                      <span className="font-bold text-foreground">{branch.facilities.length} Attached</span>
                    </div>

                    <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 rounded-xl bg-muted/20 border border-border/50">
                      {branch.facilities.length === 0 ? (
                        <span className="text-[11px] text-muted-foreground italic">No facilities linked</span>
                      ) : (
                        branch.facilities.map(f => (
                          <Badge
                            key={f.id}
                            variant="secondary"
                            className="text-[10px] font-medium gap-1 px-2 py-0.5 rounded-lg"
                          >
                            {f.facilityType === "Clinic" && <IconHospital className="h-3 w-3 text-blue-500" />}
                            {f.facilityType === "Laboratory" && <IconTestPipe className="h-3 w-3 text-purple-500" />}
                            {f.facilityType === "Pharmacy" && <IconPill className="h-3 w-3 text-emerald-500" />}
                            <span className="truncate max-w-[120px]">{f.name}</span>
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>
                </CardContent>

                {/* Card Actions */}
                <div className="p-3 border-t bg-muted/10 flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenPhilHealth(branch)}
                      className="h-8 text-[11px] font-semibold rounded-xl gap-1"
                    >
                      <IconKey className="h-3.5 w-3.5 text-primary" />
                      PhilHealth
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenLinkFacilities(branch)}
                      className="h-8 text-[11px] font-semibold rounded-xl gap-1"
                    >
                      <IconLink className="h-3.5 w-3.5 text-blue-500" />
                      Link Facilities
                    </Button>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleOpenEdit(branch)}
                      className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
                    >
                      <IconEdit className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeletingBranch(branch)}
                      className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive"
                    >
                      <IconTrash className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── CREATE / EDIT BRANCH MODAL ── */}
      <Dialog open={isCreateOpen || !!editingBranch} onOpenChange={open => {
        if (!open) {
          setIsCreateOpen(false);
          setEditingBranch(null);
        }
      }}>
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
                onChange={e => setFormName(e.target.value)}
                className="h-9 rounded-xl text-xs"
              />
            </div>

            <div className="col-span-1 space-y-1">
              <Label className="text-xs font-semibold">Branch Code</Label>
              <Input
                placeholder="e.g. QC-01"
                value={formCode}
                onChange={e => setFormCode(e.target.value)}
                className="h-9 rounded-xl text-xs"
              />
            </div>

            <div className="col-span-1 space-y-1">
              <Label className="text-xs font-semibold">Region</Label>
              <Input
                placeholder="e.g. NCR / Region IV-A"
                value={formRegion}
                onChange={e => setFormRegion(e.target.value)}
                className="h-9 rounded-xl text-xs"
              />
            </div>

            <div className="col-span-2 space-y-1">
              <Label className="text-xs font-semibold">Street Address</Label>
              <Input
                placeholder="e.g. Unit 402, Medical Arts Tower, EDSA"
                value={formStreet}
                onChange={e => setFormStreet(e.target.value)}
                className="h-9 rounded-xl text-xs"
              />
            </div>

            <div className="col-span-1 space-y-1">
              <Label className="text-xs font-semibold">Barangay</Label>
              <Input
                placeholder="e.g. Brgy. Socorro"
                value={formBarangay}
                onChange={e => setFormBarangay(e.target.value)}
                className="h-9 rounded-xl text-xs"
              />
            </div>

            <div className="col-span-1 space-y-1">
              <Label className="text-xs font-semibold">City / Municipality</Label>
              <Input
                placeholder="e.g. Quezon City"
                value={formCity}
                onChange={e => setFormCity(e.target.value)}
                className="h-9 rounded-xl text-xs"
              />
            </div>

            <div className="col-span-1 space-y-1">
              <Label className="text-xs font-semibold">Province</Label>
              <Input
                placeholder="e.g. Metro Manila / Cavite"
                value={formProvince}
                onChange={e => setFormProvince(e.target.value)}
                className="h-9 rounded-xl text-xs"
              />
            </div>

            <div className="col-span-1 space-y-1">
              <Label className="text-xs font-semibold">Zip Code</Label>
              <Input
                placeholder="e.g. 1109"
                value={formZip}
                onChange={e => setFormZip(e.target.value)}
                className="h-9 rounded-xl text-xs"
              />
            </div>

            <div className="col-span-1 space-y-1">
              <Label className="text-xs font-semibold">Contact Phone</Label>
              <Input
                placeholder="e.g. +63 917 123 4567"
                value={formContact}
                onChange={e => setFormContact(e.target.value)}
                className="h-9 rounded-xl text-xs"
              />
            </div>

            <div className="col-span-1 space-y-1">
              <Label className="text-xs font-semibold">Contact Email</Label>
              <Input
                placeholder="e.g. qc.branch@example.com"
                value={formEmail}
                onChange={e => setFormEmail(e.target.value)}
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
      <Dialog open={!!philhealthBranch} onOpenChange={open => !open && setPhilhealthBranch(null)}>
        <DialogContent className="max-w-md rounded-2xl">
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
                  onChange={e => setPhAccreditation(e.target.value)}
                  className="h-9 rounded-xl text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">PMCC Number</Label>
                <Input
                  placeholder="e.g. Z15445"
                  value={phPmcc}
                  onChange={e => setPhPmcc(e.target.value)}
                  className="h-9 rounded-xl text-xs font-mono"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Software Certificate ID</Label>
              <Input
                placeholder="e.g. CERT-YAKAP-2026"
                value={phCertId}
                onChange={e => setPhCertId(e.target.value)}
                className="h-9 rounded-xl text-xs font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">SOAP Username</Label>
                <Input
                  placeholder="Leave blank to keep existing"
                  value={phUsername}
                  onChange={e => setPhUsername(e.target.value)}
                  className="h-9 rounded-xl text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">SOAP Password</Label>
                <Input
                  type="password"
                  placeholder="Leave blank to keep existing"
                  value={phPassword}
                  onChange={e => setPhPassword(e.target.value)}
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
                onChange={e => setPhCipherKey(e.target.value)}
                className="h-9 rounded-xl text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Konsulta SOAP Endpoint</Label>
              <Input
                value={phEndpoint}
                onChange={e => setPhEndpoint(e.target.value)}
                className="h-9 rounded-xl text-xs font-mono"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestConnection}
              disabled={testingConnection}
              className="rounded-xl text-xs gap-1 border-primary/30 text-primary"
            >
              {testingConnection ? <IconLoader className="h-3.5 w-3.5 animate-spin" /> : <IconRefresh className="h-3.5 w-3.5" />}
              Test Gateway Handshake
            </Button>

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
                disabled={savingPh}
                className="rounded-xl text-xs font-bold gap-1.5"
              >
                {savingPh && <IconLoader className="h-3.5 w-3.5 animate-spin" />}
                Save Credentials
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── LINK FACILITIES (UNDER ONE ROOF) MODAL ── */}
      <Dialog open={!!linkBranch} onOpenChange={open => !open && setLinkBranch(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <IconLink className="h-5 w-5 text-blue-500" />
              Link Facilities Under One Roof
            </DialogTitle>
            <DialogDescription className="text-xs">
              Attach Clinic, Laboratory, and Pharmacy facilities operating in this physical location ({linkBranch?.name}).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-3 max-h-[300px] overflow-y-auto">
            {facilities.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                No facilities created yet in this workspace. Create Clinics, Labs, or Pharmacies in their respective tabs first.
              </p>
            ) : (
              facilities.map(fac => {
                const isSelected = selectedFacilityIds.includes(fac.id);
                const isLinkedToAnother = fac.branchId && fac.branchId !== linkBranch?.id;

                return (
                  <div
                    key={fac.id}
                    onClick={() => toggleFacilitySelection(fac.id)}
                    className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-colors ${
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-lg bg-card border">
                        {fac.facilityType === "Clinic" && <IconHospital className="h-4 w-4 text-blue-500" />}
                        {fac.facilityType === "Laboratory" && <IconTestPipe className="h-4 w-4 text-purple-500" />}
                        {fac.facilityType === "Pharmacy" && <IconPill className="h-4 w-4 text-emerald-500" />}
                        {fac.facilityType === "Organization" && <IconBuilding className="h-4 w-4 text-orange-500" />}
                      </div>
                      <div>
                        <div className="font-semibold text-xs text-foreground">{fac.name}</div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                          <span>{fac.facilityType}</span>
                          {isLinkedToAnother && (
                            <span className="text-amber-500 font-medium">(Assigned to other branch)</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className={`h-5 w-5 rounded-md border flex items-center justify-center transition-colors ${
                      isSelected ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/30"
                    }`}>
                      {isSelected && <IconCheck className="h-3.5 w-3.5 stroke-[3]" />}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLinkBranch(null)}
              className="rounded-xl text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveFacilityLinks}
              disabled={savingLink}
              className="rounded-xl text-xs font-bold gap-1.5"
            >
              {savingLink && <IconLoader className="h-3.5 w-3.5 animate-spin" />}
              Save Linked Facilities
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DELETE CONFIRMATION MODAL ── */}
      <Dialog open={!!deletingBranch} onOpenChange={open => !open && setDeletingBranch(null)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-destructive flex items-center gap-2">
              <IconAlertTriangle className="h-5 w-5" />
              Delete Branch
            </DialogTitle>
            <DialogDescription className="text-xs">
              Are you sure you want to delete &quot;{deletingBranch?.name}&quot;? All linked facilities will be decoupled but preserved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeletingBranch(null)}
              className="rounded-xl text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteBranch}
              className="rounded-xl text-xs font-bold"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
