import React from "react";
import StudentIntakeClient from "./StudentIntakeClient";
import { tenantService } from "@/services/tenant.service";

interface PageProps {
  params: Promise<{ tenantSlug: string }>;
}

/** Prefers the workspace display name from its profile; falls back to a readable form of the slug. */
async function resolveTenantName(tenantSlug: string): Promise<string> {
  const profile = await tenantService.getWorkspaceProfile(tenantSlug);
  return profile?.displayName || tenantSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function generateMetadata({ params }: PageProps) {
  const { tenantSlug } = await params;
  const readableTenant = await resolveTenantName(tenantSlug);
  return {
    title: `Student Medical Pre-Registration - ${readableTenant}`,
    description: `Official digital health intake and outside diagnostic document upload portal for ${readableTenant} students.`,
  };
}

export default async function StudentIntakePage({ params }: PageProps) {
  const { tenantSlug } = await params;
  const readableTenant = await resolveTenantName(tenantSlug);

  return (
    <main className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <StudentIntakeClient tenantSlug={tenantSlug} tenantName={readableTenant} />
      </div>
    </main>
  );
}
