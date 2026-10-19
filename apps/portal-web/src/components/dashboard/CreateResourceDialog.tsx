"use client";

import { useRouter, useSearchParams } from "next/navigation";
import FacilityOnboardingWizard from "./FacilityOnboardingWizard";

export default function CreateResourceDialog() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const type = searchParams.get("create") as "clinic" | "organization" | "laboratory" | "pharmacy" | null;
  const branchId = searchParams.get("branchId");
  const open = !!type;

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      const sp = new URLSearchParams(window.location.search);
      sp.delete("create");
      sp.delete("branchId");
      const newUrl = `${window.location.pathname}${sp.toString() ? `?${sp.toString()}` : ""}`;
      window.history.replaceState({}, "", newUrl);
      router.replace(newUrl, { scroll: false });
    }
  };

  if (!open || !type) return null;

  return (
    <FacilityOnboardingWizard
      initialType={type}
      targetBranchId={branchId}
      open={open}
      onOpenChange={handleOpenChange}
      onFacilityCreated={() => {
        router.refresh();
      }}
    />
  );
}