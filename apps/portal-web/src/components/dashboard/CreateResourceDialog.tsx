"use client";

import { useSearchParams } from "next/navigation";
import FacilityOnboardingWizard from "./FacilityOnboardingWizard";

export default function CreateResourceDialog() {
  const searchParams = useSearchParams();
  const type = searchParams.get("create") as "clinic" | "organization" | "laboratory" | "pharmacy" | null;
  const open = !!type;

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      const sp = new URLSearchParams(window.location.search);
      sp.delete("create");
      window.history.replaceState({}, "", `${window.location.pathname}${sp.toString() ? `?${sp.toString()}` : ""}`);
    }
  };

  if (!open || !type) return null;

  return (
    <FacilityOnboardingWizard
      initialType={type}
      open={open}
      onOpenChange={handleOpenChange}
    />
  );
}