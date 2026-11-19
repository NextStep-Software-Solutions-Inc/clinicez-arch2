"use client";

import { useState } from "react";
import { IconLoader } from "@tabler/icons-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { branchService, type BranchDto, type CreateBranchPayload } from "@/services/branch.service";
import { apiErrorMessage } from "@/lib/apiError";

interface CreateBranchDialogProps {
  tenantSlug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (branch: BranchDto) => void;
}

export function CreateBranchDialog({
  tenantSlug,
  open,
  onOpenChange,
  onCreated,
}: CreateBranchDialogProps) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [region, setRegion] = useState("NCR");
  const [streetAddress, setStreetAddress] = useState("");
  const [barangay, setBarangay] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setName("");
    setCode("");
    setRegion("NCR");
    setStreetAddress("");
    setBarangay("");
    setCity("");
    setProvince("");
    setZipCode("");
    setContactNumber("");
    setContactEmail("");
  };

  const handleClose = (nextOpen: boolean) => {
    if (saving) return;
    if (!nextOpen) {
      resetForm();
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!name.trim()) {
      toast.error("Branch name is required.");
      return;
    }

    setSaving(true);
    try {
      const payload: CreateBranchPayload = {
        tenantId: tenantSlug,
        name: name.trim(),
        code: code.trim() || undefined,
        streetAddress: streetAddress.trim() || undefined,
        barangay: barangay.trim() || undefined,
        city: city.trim() || undefined,
        province: province.trim() || undefined,
        region: region.trim() || undefined,
        zipCode: zipCode.trim() || undefined,
        contactNumber: contactNumber.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
      };
      const created = await branchService.createBranch(payload);
      toast.success(`Branch "${name.trim()}" created successfully.`);
      resetForm();
      onOpenChange(false);
      onCreated?.(created);
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err, "Failed to create branch"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Create New Physical Branch</DialogTitle>
          <DialogDescription className="text-xs">
            Configure branch name, internal code, and official Philippine standard address for regulatory compliance.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3.5 py-1 text-xs">
            <div className="col-span-2 space-y-1">
              <Label className="text-xs font-semibold">Branch Name *</Label>
              <Input
                placeholder="e.g. Quezon City Medical Hub"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-9 rounded-xl text-xs"
                required
              />
            </div>

            <div className="col-span-1 space-y-1">
              <Label className="text-xs font-semibold">Branch Code</Label>
              <Input
                placeholder="e.g. QC-01"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="h-9 rounded-xl text-xs"
              />
            </div>

            <div className="col-span-1 space-y-1">
              <Label className="text-xs font-semibold">Region</Label>
              <Input
                placeholder="e.g. NCR / Region IV-A"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="h-9 rounded-xl text-xs"
              />
            </div>

            <div className="col-span-2 space-y-1">
              <Label className="text-xs font-semibold">Street Address</Label>
              <Input
                placeholder="e.g. Unit 402, Medical Arts Tower, EDSA"
                value={streetAddress}
                onChange={(e) => setStreetAddress(e.target.value)}
                className="h-9 rounded-xl text-xs"
              />
            </div>

            <div className="col-span-1 space-y-1">
              <Label className="text-xs font-semibold">Barangay</Label>
              <Input
                placeholder="e.g. Brgy. Socorro"
                value={barangay}
                onChange={(e) => setBarangay(e.target.value)}
                className="h-9 rounded-xl text-xs"
              />
            </div>

            <div className="col-span-1 space-y-1">
              <Label className="text-xs font-semibold">City / Municipality</Label>
              <Input
                placeholder="e.g. Quezon City"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="h-9 rounded-xl text-xs"
              />
            </div>

            <div className="col-span-1 space-y-1">
              <Label className="text-xs font-semibold">Province</Label>
              <Input
                placeholder="e.g. Metro Manila / Cavite"
                value={province}
                onChange={(e) => setProvince(e.target.value)}
                className="h-9 rounded-xl text-xs"
              />
            </div>

            <div className="col-span-1 space-y-1">
              <Label className="text-xs font-semibold">Zip Code</Label>
              <Input
                placeholder="e.g. 1109"
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value)}
                className="h-9 rounded-xl text-xs"
              />
            </div>

            <div className="col-span-1 space-y-1">
              <Label className="text-xs font-semibold">Contact Phone</Label>
              <Input
                placeholder="e.g. +63 917 123 4567"
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
                className="h-9 rounded-xl text-xs"
              />
            </div>

            <div className="col-span-1 space-y-1">
              <Label className="text-xs font-semibold">Contact Email</Label>
              <Input
                placeholder="e.g. qc.branch@example.com"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="h-9 rounded-xl text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => handleClose(false)}
              className="rounded-xl text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={saving}
              className="rounded-xl text-xs font-bold gap-1.5"
            >
              {saving && <IconLoader className="h-3.5 w-3.5 animate-spin" />}
              Create Branch
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
