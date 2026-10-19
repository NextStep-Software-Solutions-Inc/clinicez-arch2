"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  IconBuilding,
  IconHospital,
  IconTestPipe,
  IconPill,
  IconMapPin,
  IconArrowLeft,
  IconArrowRight,
  IconLoader,
  IconAlertTriangle,
  IconCheck,
} from "@tabler/icons-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { branchService, type BranchDto } from "@/services/branch.service";

interface QuickCreateDialogProps {
  trigger: React.ReactNode;
}

const FACILITY_OPTIONS = [
  { value: "clinic" as const, label: "Clinic", icon: IconHospital, desc: "Outpatient consultations & EHR", color: "text-blue-500", border: "hover:border-blue-500" },
  { value: "laboratory" as const, label: "Laboratory", icon: IconTestPipe, desc: "Diagnostic orders & LIS", color: "text-purple-500", border: "hover:border-purple-500" },
  { value: "pharmacy" as const, label: "Pharmacy", icon: IconPill, desc: "Drug dispensing & prescriptions", color: "text-emerald-500", border: "hover:border-emerald-500" },
  { value: "organization" as const, label: "Organization", icon: IconBuilding, desc: "Hospital networks & partners", color: "text-amber-500", border: "hover:border-amber-500" },
];

export default function QuickCreateDialog({ trigger }: QuickCreateDialogProps) {
  const params = useParams();
  const router = useRouter();
  const tenantSlug = (params?.tenant as string) || "demo-tenant";

  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"root" | "facility">("root");
  const [selectedType, setSelectedType] = useState<"clinic" | "organization" | "laboratory" | "pharmacy">("clinic");
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [branches, setBranches] = useState<BranchDto[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);

  // Reset when dialog closes
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setTimeout(() => {
        setMode("root");
      }, 200);
    }
  };

  // Load branches when switching to facility mode
  useEffect(() => {
    if (mode === "facility" && tenantSlug) {
      setLoadingBranches(true);
      branchService.getBranches(tenantSlug)
        .then((data) => {
          setBranches(data || []);
          if (data && data.length > 0) {
            setSelectedBranchId(data[0].id);
          }
        })
        .catch((err) => {
          console.error("Failed to load branches in QuickCreateDialog", err);
        })
        .finally(() => {
          setLoadingBranches(false);
        });
    }
  }, [mode, tenantSlug]);

  const handleCreateBranch = () => {
    setIsOpen(false);
    router.push(`/${tenantSlug}/dashboard/branches?createBranch=true`);
  };

  const selectedBranch = branches.find((b) => b.id === selectedBranchId);
  const isTypeTakenInSelectedBranch = selectedBranch?.facilities?.some(
    (f) => f.facilityType.toLowerCase() === selectedType.toLowerCase()
  );

  const handleProceedFacility = () => {
    if (!selectedBranchId || isTypeTakenInSelectedBranch) return;
    setIsOpen(false);
    router.push(`/${tenantSlug}/dashboard/branches?create=${selectedType}&branchId=${selectedBranchId}`);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md rounded-2xl">
        {mode === "root" ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-lg font-bold">Quick Create</DialogTitle>
              <DialogDescription className="text-xs">
                Create a new physical branch foundation or provision an operational facility.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-2">
              {/* Option 1: New Branch */}
              <div
                onClick={handleCreateBranch}
                className="group cursor-pointer border-2 border-border/80 hover:border-primary/60 hover:bg-primary/5 p-4 rounded-2xl transition-all duration-200 flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
                      <IconMapPin className="h-5 w-5" />
                    </div>
                    <Badge variant="outline" className="text-[10px] font-mono border-primary/20 text-primary">
                      Foundation
                    </Badge>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                      New Branch
                    </h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                      Establish a physical branch location with Philippine address &amp; PhilHealth accreditation.
                    </p>
                  </div>
                </div>
                <div className="mt-4 pt-2 border-t border-border/50 text-[11px] font-semibold text-primary flex items-center gap-1">
                  <span>Create branch</span>
                  <IconArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>

              {/* Option 2: Add Facility to Branch */}
              <div
                onClick={() => setMode("facility")}
                className="group cursor-pointer border-2 border-border/80 hover:border-primary/60 hover:bg-primary/5 p-4 rounded-2xl transition-all duration-200 flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
                      <IconHospital className="h-5 w-5" />
                    </div>
                    <Badge variant="outline" className="text-[10px] font-mono border-border">
                      Facility
                    </Badge>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                      Add Facility
                    </h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                      Provision a Clinic, Laboratory, Pharmacy, or Organization under an existing branch.
                    </p>
                  </div>
                </div>
                <div className="mt-4 pt-2 border-t border-border/50 text-[11px] font-semibold text-primary flex items-center gap-1">
                  <span>Select branch</span>
                  <IconArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-lg -ml-1 text-muted-foreground hover:text-foreground"
                  onClick={() => setMode("root")}
                >
                  <IconArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                  <DialogTitle className="text-base font-bold">Add Facility to Branch</DialogTitle>
                  <DialogDescription className="text-xs">
                    Select facility type and target branch location.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-4 py-2 text-xs">
              {/* Facility Type Selection */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">1. Select Facility Type</Label>
                <div className="grid grid-cols-2 gap-2">
                  {FACILITY_OPTIONS.map((opt) => {
                    const isSelected = selectedType === opt.value;
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setSelectedType(opt.value)}
                        className={`p-2.5 rounded-xl border text-left transition-all flex items-center gap-2.5 ${
                          isSelected
                            ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                            : "border-border/80 hover:bg-muted/40"
                        }`}
                      >
                        <div className={`p-1.5 rounded-lg bg-card border ${opt.color}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="truncate">
                          <div className="font-bold text-xs truncate">{opt.label}</div>
                          <div className="text-[10px] text-muted-foreground truncate">{opt.desc}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Target Branch Selection */}
              <div className="space-y-1.5 pt-1">
                <Label className="text-xs font-bold">2. Select Target Branch</Label>
                {loadingBranches ? (
                  <div className="flex items-center gap-2 p-3 rounded-xl border text-muted-foreground text-xs">
                    <IconLoader className="h-4 w-4 animate-spin text-primary" />
                    <span>Loading available branches...</span>
                  </div>
                ) : branches.length === 0 ? (
                  <div className="p-3.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 space-y-2">
                    <p className="text-xs text-amber-800 dark:text-amber-300 font-medium flex items-center gap-1.5">
                      <IconAlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                      No physical branches exist yet in this workspace.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleCreateBranch}
                      className="w-full rounded-xl text-xs font-bold"
                    >
                      Create First Branch
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <select
                      value={selectedBranchId}
                      onChange={(e) => setSelectedBranchId(e.target.value)}
                      className="w-full h-9 px-3 text-xs rounded-xl border border-border bg-background font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} ({b.city || "Main Location"})
                        </option>
                      ))}
                    </select>

                    {isTypeTakenInSelectedBranch && (
                      <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
                        <IconAlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                        <span>This branch already has an active {selectedType}. A branch can host at most one {selectedType}.</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMode("root")}
                className="rounded-xl text-xs"
              >
                Back
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleProceedFacility}
                disabled={!selectedBranchId || !!isTypeTakenInSelectedBranch}
                className="rounded-xl text-xs font-bold gap-1.5"
              >
                <span>Continue to Provision</span>
                <IconCheck className="h-3.5 w-3.5" />
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
