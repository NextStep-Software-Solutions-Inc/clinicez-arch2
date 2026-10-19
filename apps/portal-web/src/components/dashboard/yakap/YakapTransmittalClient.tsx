"use client";

import { useEffect, useState, useTransition } from "react";
import { useParams } from "next/navigation";
import Link from "next/navigation";
import { branchService, BranchDto } from "@/services/branch.service";
import {
  yakapService,
  PortalEligibleYakapEncounter,
  PortalYakapTransmittal,
  PortalValidationResult,
  PortalSubmissionResult,
} from "@/services/yakap.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  IconFileCertificate,
  IconBuilding,
  IconMapPin,
  IconShieldCheck,
  IconAlertTriangle,
  IconCheck,
  IconLoader,
  IconRefresh,
  IconSend,
  IconCode,
  IconCopy,
  IconDownload,
  IconSearch,
  IconCalendar,
  IconChecklist,
  IconStethoscope,
  IconPill,
  IconTestPipe,
  IconCircleCheck,
  IconCircleX,
} from "@tabler/icons-react";
import { toast } from "sonner";

export default function YakapTransmittalClient() {
  const params = useParams();
  const tenantSlug = (params?.tenant as string) || "demo-tenant";

  // Branch state
  const [branches, setBranches] = useState<BranchDto[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [loadingBranches, setLoadingBranches] = useState(true);

  // Tab state
  const [activeTab, setActiveTab] = useState<"worklist" | "wizard">("worklist");

  // Transmittals Worklist state
  const [transmittals, setTransmittals] = useState<PortalYakapTransmittal[]>([]);
  const [loadingTransmittals, setLoadingTransmittals] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterTagging, setFilterTagging] = useState<string>("all");

  // Batch compilation wizard state
  const [wizardTagging, setWizardTagging] = useState<"1" | "2">("2");
  const [wizardYear, setWizardYear] = useState<string>(new Date().getFullYear().toString());
  const [startDate, setStartDate] = useState<string>(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0]
  );
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [eligibleEncounters, setEligibleEncounters] = useState<PortalEligibleYakapEncounter[]>([]);
  const [selectedEncounterIds, setSelectedEncounterIds] = useState<string[]>([]);
  const [loadingEncounters, setLoadingEncounters] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);

  // XML Inspector Modal state
  const [isXmlModalOpen, setIsXmlModalOpen] = useState(false);
  const [selectedXml, setSelectedXml] = useState<string>("");
  const [selectedTransmittalNo, setSelectedTransmittalNo] = useState<string>("");
  const [loadingXml, setLoadingXml] = useState(false);

  // Submission / Action state
  const [isSubmittingId, setIsSubmittingId] = useState<string | null>(null);
  const [isValidatingId, setIsValidatingId] = useState<string | null>(null);

  // Selected branch
  const activeBranch = branches.find((b) => b.id === selectedBranchId);
  const isBranchAccredited =
    activeBranch?.isPhilHealthAccredited && Boolean(activeBranch?.philHealthPmccNumber);

  // Load branches
  useEffect(() => {
    async function loadBranches() {
      setLoadingBranches(true);
      try {
        const list = await branchService.getBranches(tenantSlug);
        setBranches(list);
        if (list.length > 0) {
          // Default to accredited branch or first branch
          const accredited = list.find((b) => b.isPhilHealthAccredited) || list[0];
          setSelectedBranchId(accredited.id);
        }
      } catch (err: any) {
        toast.error("Failed to load branches", { description: err.message });
      } finally {
        setLoadingBranches(false);
      }
    }
    loadBranches();
  }, [tenantSlug]);

  // Load transmittals when active branch changes
  useEffect(() => {
    if (!selectedBranchId) return;
    loadTransmittals();
  }, [selectedBranchId, filterStatus, filterTagging]);

  async function loadTransmittals() {
    if (!selectedBranchId) return;
    setLoadingTransmittals(true);
    try {
      const list = await yakapService.getTransmittals(
        selectedBranchId,
        filterStatus,
        filterTagging
      );
      setTransmittals(list);
    } catch (err: any) {
      toast.error("Failed to load transmittals", { description: err.message });
    } finally {
      setLoadingTransmittals(false);
    }
  }

  // Load eligible encounters
  async function handleFetchEncounters() {
    if (!selectedBranchId) {
      toast.error("Please select a branch first");
      return;
    }
    setLoadingEncounters(true);
    setSelectedEncounterIds([]);
    try {
      const list = await yakapService.getEligibleEncounters(
        selectedBranchId,
        wizardTagging,
        startDate,
        endDate
      );
      setEligibleEncounters(list);
      // Auto-select all by default
      setSelectedEncounterIds(list.map((e) => e.encounterId));
      if (list.length === 0) {
        toast.info("No un-transmitted encounters found for this date range.");
      } else {
        toast.success(`Found ${list.length} eligible encounters`);
      }
    } catch (err: any) {
      toast.error("Failed to fetch encounters", { description: err.message });
    } finally {
      setLoadingEncounters(false);
    }
  }

  // Toggle selection
  function toggleEncounterSelection(id: string) {
    setSelectedEncounterIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function toggleSelectAll() {
    if (selectedEncounterIds.length === eligibleEncounters.length) {
      setSelectedEncounterIds([]);
    } else {
      setSelectedEncounterIds(eligibleEncounters.map((e) => e.encounterId));
    }
  }

  // Compile batch
  async function handleCompileBatch() {
    if (!selectedBranchId) return;
    if (selectedEncounterIds.length === 0) {
      toast.error("Please select at least one encounter to include in this batch.");
      return;
    }

    setIsCompiling(true);
    try {
      const result = await yakapService.createTransmittal(selectedBranchId, {
        consultationEncounterIds: selectedEncounterIds,
        reportTagging: wizardTagging,
        effectiveYear: wizardYear,
      });

      toast.success("Batch Transmittal Compiled Successfully!", {
        description: `Transmittal No: ${result.transmittalNumber} with ${result.totalItemsCount} line items.`,
      });

      // Reset and switch to worklist
      setSelectedEncounterIds([]);
      setEligibleEncounters([]);
      setActiveTab("worklist");
      loadTransmittals();
    } catch (err: any) {
      toast.error("Failed to compile batch transmittal", { description: err.message });
    } finally {
      setIsCompiling(false);
    }
  }

  // Inspect XML
  async function handleInspectXml(transmittal: PortalYakapTransmittal) {
    setSelectedTransmittalNo(transmittal.transmittalNumber);
    setIsXmlModalOpen(true);
    setLoadingXml(true);
    try {
      const xml = await yakapService.getTransmittalXml(transmittal.id);
      setSelectedXml(xml || "<error>No raw XML payload found for this transmittal</error>");
    } catch (err: any) {
      toast.error("Failed to fetch XML payload", { description: err.message });
      setSelectedXml(`<error>${err.message}</error>`);
    } finally {
      setLoadingXml(false);
    }
  }

  // Validate transmittal
  async function handleValidateTransmittal(transmittalId: string) {
    setIsValidatingId(transmittalId);
    try {
      const result = await yakapService.validateTransmittal(transmittalId);
      if (result.isValid) {
        toast.success("Transmittal XML Passed PhilHealth DTD Schema Validation!");
      } else {
        toast.warning("Validation Warnings Found", {
          description: result.validationErrors?.join("; ") || "Schema deviations detected.",
        });
      }
      loadTransmittals();
    } catch (err: any) {
      toast.error("Validation failed", { description: err.message });
    } finally {
      setIsValidatingId(null);
    }
  }

  // Submit transmittal live
  async function handleSubmitTransmittal(transmittal: PortalYakapTransmittal) {
    if (!selectedBranchId) return;
    setIsSubmittingId(transmittal.id);
    try {
      const result = await yakapService.submitTransmittal(selectedBranchId, transmittal.id);
      if (result.isSuccess) {
        toast.success("Batch Transmitted Successfully to PhilHealth!", {
          description: `Transaction Receipt: ${result.transactionNumber || "Confirmed"}`,
        });
      } else {
        toast.error("PhilHealth Proxy Rejected Transmittal", {
          description: result.validationErrors?.join(", ") || "Statutory submission error.",
        });
      }
      loadTransmittals();
    } catch (err: any) {
      toast.error("Submission failed", { description: err.message });
    } finally {
      setIsSubmittingId(null);
    }
  }

  // Copy XML to clipboard
  function handleCopyXml() {
    navigator.clipboard.writeText(selectedXml);
    toast.success("XML payload copied to clipboard");
  }

  // Download XML file
  function handleDownloadXml() {
    const blob = new Blob([selectedXml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedTransmittalNo || "yakap_transmittal"}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("XML file downloaded");
  }

  // Metrics
  const totalTransmittals = transmittals.length;
  const submittedTransmittals = transmittals.filter(
    (t) => t.status === "Submitted" || t.status === "Approved"
  ).length;
  const draftTransmittals = transmittals.filter((t) => t.status === "Draft").length;
  const totalBilledItems = transmittals.reduce((acc, t) => acc + (t.totalItemsCount || 0), 0);

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">PhilHealth YAKAP Transmittals</h1>
            <Badge variant="outline" className="text-primary border-primary">
              Multi-Branch Console
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Aggregate clinical encounters into statutory Tranche 1 & Tranche 2 PhilHealth XML batches,
            validate against Konsulta schemas, and submit via branch PMCC accreditation.
          </p>
        </div>

        {/* Branch Selector Header */}
        <div className="flex items-center gap-3 bg-card border rounded-lg p-2 shadow-sm">
          <IconBuilding className="size-5 text-muted-foreground ml-1" />
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground font-medium">Active Branch Location:</span>
            {loadingBranches ? (
              <span className="text-sm">Loading branches...</span>
            ) : branches.length === 0 ? (
              <span className="text-sm text-destructive font-medium">No branches configured</span>
            ) : (
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="bg-transparent text-sm font-semibold focus:outline-none cursor-pointer pr-4"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} {b.isPhilHealthAccredited ? "✓ (PMCC)" : "⚠️"}
                  </option>
                ))}
              </select>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={loadTransmittals}
            disabled={loadingTransmittals}
            title="Refresh Batches"
          >
            <IconRefresh className={`size-4 ${loadingTransmittals ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Branch Accreditation Status Banner */}
      {activeBranch && (
        <Card className={`border ${isBranchAccredited ? "bg-card" : "bg-destructive/10 border-destructive/30"}`}>
          <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              {isBranchAccredited ? (
                <div className="p-2 bg-primary/10 text-primary rounded-full shrink-0">
                  <IconShieldCheck className="size-5" />
                </div>
              ) : (
                <div className="p-2 bg-destructive/20 text-destructive rounded-full shrink-0">
                  <IconAlertTriangle className="size-5" />
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{activeBranch.name}</span>
                  {isBranchAccredited ? (
                    <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700 text-xs">
                      PMCC Accredited
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="text-xs">
                      Missing PhilHealth Accreditation
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  <span>
                    <strong>PMCC No:</strong> {activeBranch.philHealthPmccNumber || "Not configured"}
                  </span>
                  <span>
                    <strong>Accreditation No:</strong>{" "}
                    {activeBranch.philHealthAccreditationNumber || "Not configured"}
                  </span>
                  <span>
                    <strong>Endpoint:</strong>{" "}
                    {activeBranch.philHealthKonsultaEndpoint || "https://staging.philhealth.gov.ph/KONSULTA/SOAP"}
                  </span>
                </div>
              </div>
            </div>

            {!isBranchAccredited && (
              <a
                href={`/${tenantSlug}/dashboard/branches`}
                className="text-xs font-semibold text-primary underline underline-offset-4 shrink-0 hover:text-primary/80"
              >
                Configure PMCC in Branches & Locations &rarr;
              </a>
            )}
          </CardContent>
        </Card>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex flex-col">
            <span className="text-xs text-muted-foreground">Total Transmittals</span>
            <span className="text-2xl font-bold mt-1">{totalTransmittals}</span>
            <span className="text-xs text-muted-foreground mt-1">Batches compiled</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col">
            <span className="text-xs text-muted-foreground">Billed Line Items</span>
            <span className="text-2xl font-bold text-primary mt-1">{totalBilledItems}</span>
            <span className="text-xs text-muted-foreground mt-1">Encounters, Labs, Prescriptions</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col">
            <span className="text-xs text-muted-foreground">Transmitted / Approved</span>
            <span className="text-2xl font-bold text-emerald-600 mt-1">{submittedTransmittals}</span>
            <span className="text-xs text-muted-foreground mt-1">Successfully sent to PhilHealth</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col">
            <span className="text-xs text-muted-foreground">Drafts Pending Review</span>
            <span className="text-2xl font-bold text-amber-500 mt-1">{draftTransmittals}</span>
            <span className="text-xs text-muted-foreground mt-1">Ready for schema pre-check</span>
          </CardContent>
        </Card>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b gap-4">
        <button
          onClick={() => setActiveTab("worklist")}
          className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === "worklist"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <IconFileCertificate className="size-4" />
          Transmittal Worklist ({transmittals.length})
        </button>
        <button
          onClick={() => setActiveTab("wizard")}
          className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === "wizard"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <IconChecklist className="size-4" />
          Compile New Batch Transmittal
        </button>
      </div>

      {/* Tab 1: Worklist */}
      {activeTab === "worklist" && (
        <div className="flex flex-col gap-4">
          {/* Filters Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/30 p-3 rounded-lg border">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Filter Tranche:</span>
              <select
                value={filterTagging}
                onChange={(e) => setFilterTagging(e.target.value)}
                className="text-xs bg-card border rounded p-1.5 focus:outline-none"
              >
                <option value="all">All Tranches</option>
                <option value="1">Tranche 1 (Enlistment & Profiling)</option>
                <option value="2">Tranche 2 (Consultations & GAMOT)</option>
              </select>

              <span className="text-xs font-medium text-muted-foreground ml-3">Filter Status:</span>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="text-xs bg-card border rounded p-1.5 focus:outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="Draft">Draft</option>
                <option value="Validated">Validated</option>
                <option value="Submitted">Submitted</option>
                <option value="Failed">Failed</option>
              </select>
            </div>

            <Button size="sm" onClick={() => setActiveTab("wizard")} className="gap-1.5">
              <IconChecklist className="size-4" />
              New Transmittal Batch
            </Button>
          </div>

          {/* Table */}
          {loadingTransmittals ? (
            <div className="flex items-center justify-center p-12 text-muted-foreground gap-2">
              <IconLoader className="size-5 animate-spin" />
              <span>Loading transmittals for branch...</span>
            </div>
          ) : transmittals.length === 0 ? (
            <Card className="p-8 text-center border-dashed">
              <IconFileCertificate className="size-10 text-muted-foreground mx-auto mb-2 opacity-50" />
              <h3 className="font-semibold text-base">No Transmittals Found</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                No transmittal batches have been compiled for this branch yet. Click "Compile New Batch
                Transmittal" to batch signed clinical encounters.
              </p>
              <Button size="sm" onClick={() => setActiveTab("wizard")} className="mt-4 gap-1.5">
                <IconChecklist className="size-4" />
                Compile First Batch
              </Button>
            </Card>
          ) : (
            <div className="border rounded-lg overflow-x-auto bg-card shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-muted-foreground text-xs text-left">
                    <th className="p-3">Transmittal No.</th>
                    <th className="p-3">Tranche</th>
                    <th className="p-3">Year</th>
                    <th className="p-3">Line Items</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">PhilHealth Tx No.</th>
                    <th className="p-3">Created</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {transmittals.map((t) => (
                    <tr key={t.id} className="hover:bg-muted/20 transition-colors">
                      <td className="p-3 font-semibold text-primary">{t.transmittalNumber}</td>
                      <td className="p-3">
                        {t.reportTagging === "1" ? (
                          <Badge variant="outline" className="text-xs">
                            Tranche 1 (Profile)
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            Tranche 2 (SOAP/Med)
                          </Badge>
                        )}
                      </td>
                      <td className="p-3">{t.effectiveYear}</td>
                      <td className="p-3 font-medium">{t.totalItemsCount || t.items?.length || 0}</td>
                      <td className="p-3">
                        <Badge
                          variant={
                            t.status === "Submitted"
                              ? "default"
                              : t.status === "Validated"
                              ? "secondary"
                              : t.status === "Failed"
                              ? "destructive"
                              : "outline"
                          }
                          className="text-xs"
                        >
                          {t.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-xs font-mono text-muted-foreground">
                        {t.philHealthTransactionNumber || "—"}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {new Date(t.createdAt).toLocaleDateString()}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1 text-xs"
                            onClick={() => handleInspectXml(t)}
                          >
                            <IconCode className="size-3.5" />
                            XML
                          </Button>

                          {t.status === "Draft" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1 text-xs"
                              disabled={isValidatingId === t.id}
                              onClick={() => handleValidateTransmittal(t.id)}
                            >
                              {isValidatingId === t.id ? (
                                <IconLoader className="size-3.5 animate-spin" />
                              ) : (
                                <IconCheck className="size-3.5" />
                              )}
                              Validate
                            </Button>
                          )}

                          {t.status !== "Submitted" && (
                            <Button
                              size="sm"
                              className="h-8 gap-1 text-xs"
                              disabled={isSubmittingId === t.id || !isBranchAccredited}
                              onClick={() => handleSubmitTransmittal(t)}
                            >
                              {isSubmittingId === t.id ? (
                                <IconLoader className="size-3.5 animate-spin" />
                              ) : (
                                <IconSend className="size-3.5" />
                              )}
                              Transmit
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Batch Compilation Wizard */}
      {activeTab === "wizard" && (
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Batch Scope & Filter</CardTitle>
              <CardDescription>
                Select the PhilHealth YAKAP Tranche and clinical encounter date range for this branch.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <Label className="text-xs">Report Tranche</Label>
                  <select
                    value={wizardTagging}
                    onChange={(e) => setWizardTagging(e.target.value as "1" | "2")}
                    className="w-full mt-1.5 text-sm bg-background border rounded-md p-2 focus:outline-none"
                  >
                    <option value="1">Tranche 1: Enlistment & Profiling</option>
                    <option value="2">Tranche 2: Consultations, Labs & GAMOT</option>
                  </select>
                </div>

                <div>
                  <Label className="text-xs">Benefit Year</Label>
                  <Input
                    type="text"
                    value={wizardYear}
                    onChange={(e) => setWizardYear(e.target.value)}
                    className="mt-1.5 text-sm"
                  />
                </div>

                <div>
                  <Label className="text-xs">Start Date</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="mt-1.5 text-sm"
                  />
                </div>

                <div>
                  <Label className="text-xs">End Date</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="mt-1.5 text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  onClick={handleFetchEncounters}
                  disabled={loadingEncounters || !selectedBranchId}
                  className="gap-2"
                >
                  {loadingEncounters ? (
                    <IconLoader className="size-4 animate-spin" />
                  ) : (
                    <IconSearch className="size-4" />
                  )}
                  Fetch Eligible Encounters
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Encounters List */}
          {eligibleEncounters.length > 0 && (
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Eligible Encounters for Transmittal</CardTitle>
                  <CardDescription>
                    Signed encounters ready to be compiled into the Konsulta batch payload.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={toggleSelectAll} className="text-xs">
                    {selectedEncounterIds.length === eligibleEncounters.length
                      ? "Deselect All"
                      : "Select All"}
                  </Button>
                  <Badge variant="secondary">
                    {selectedEncounterIds.length} of {eligibleEncounters.length} Selected
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0 border-t">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-muted-foreground text-xs text-left">
                        <th className="p-3 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={
                              eligibleEncounters.length > 0 &&
                              selectedEncounterIds.length === eligibleEncounters.length
                            }
                            onChange={toggleSelectAll}
                            className="rounded cursor-pointer"
                          />
                        </th>
                        <th className="p-3">Patient Name</th>
                        <th className="p-3">PIN Status</th>
                        <th className="p-3">Date</th>
                        <th className="p-3">Attending Doctor</th>
                        <th className="p-3">Primary Diagnosis</th>
                        <th className="p-3 text-center">Rx</th>
                        <th className="p-3 text-center">Labs</th>
                        <th className="p-3 text-right">Est. Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {eligibleEncounters.map((enc) => {
                        const isSelected = selectedEncounterIds.includes(enc.encounterId);
                        return (
                          <tr
                            key={enc.encounterId}
                            onClick={() => toggleEncounterSelection(enc.encounterId)}
                            className={`cursor-pointer transition-colors ${
                              isSelected ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/20"
                            }`}
                          >
                            <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleEncounterSelection(enc.encounterId)}
                                className="rounded cursor-pointer"
                              />
                            </td>
                            <td className="p-3 font-medium">{enc.patientName}</td>
                            <td className="p-3">
                              {enc.hasPhilHealthPin ? (
                                <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-300">
                                  {enc.philHealthIdentificationNumber || "Verified"}
                                </Badge>
                              ) : (
                                <Badge variant="destructive" className="text-xs">
                                  Missing PIN
                                </Badge>
                              )}
                            </td>
                            <td className="p-3 text-xs text-muted-foreground">
                              {new Date(enc.encounterDate).toLocaleDateString()}
                            </td>
                            <td className="p-3 text-xs">{enc.doctorName}</td>
                            <td className="p-3 text-xs max-w-xs truncate" title={enc.primaryDiagnosis || ""}>
                              {enc.primaryDiagnosis || "—"}
                            </td>
                            <td className="p-3 text-center font-semibold">{enc.prescriptionsCount}</td>
                            <td className="p-3 text-center font-semibold">{enc.diagnosticsCount}</td>
                            <td className="p-3 text-right font-medium text-xs">
                              ₱{enc.totalMedicationAmount?.toFixed(2) || "0.00"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="p-4 bg-muted/20 border-t flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="text-xs text-muted-foreground">
                    Selected: <strong>{selectedEncounterIds.length}</strong> encounters under Branch{" "}
                    <strong>{activeBranch?.name}</strong>.
                  </div>
                  <Button
                    onClick={handleCompileBatch}
                    disabled={isCompiling || selectedEncounterIds.length === 0}
                    className="gap-2"
                  >
                    {isCompiling ? (
                      <IconLoader className="size-4 animate-spin" />
                    ) : (
                      <IconFileCertificate className="size-4" />
                    )}
                    Compile Batch Transmittal ({selectedEncounterIds.length})
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Raw XML Inspector Modal */}
      <Dialog open={isXmlModalOpen} onOpenChange={setIsXmlModalOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <IconCode className="size-5 text-primary" />
              Konsulta PCB XML Payload: {selectedTransmittalNo}
            </DialogTitle>
            <DialogDescription>
              PhilHealth compliant statutory XML envelope generated according to Annex D specifications.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto bg-muted p-4 rounded-lg font-mono text-xs border">
            {loadingXml ? (
              <div className="flex items-center justify-center p-12 text-muted-foreground gap-2">
                <IconLoader className="size-5 animate-spin" />
                <span>Loading XML payload...</span>
              </div>
            ) : (
              <pre className="whitespace-pre-wrap select-all">{selectedXml}</pre>
            )}
          </div>

          <DialogFooter className="flex flex-row justify-between items-center sm:justify-between">
            <span className="text-xs text-muted-foreground">
              Character length: {selectedXml.length} bytes
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleCopyXml} className="gap-1 text-xs">
                <IconCopy className="size-3.5" />
                Copy
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownloadXml} className="gap-1 text-xs">
                <IconDownload className="size-3.5" />
                Download .xml
              </Button>
              <Button size="sm" onClick={() => setIsXmlModalOpen(false)} className="text-xs">
                Close
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
