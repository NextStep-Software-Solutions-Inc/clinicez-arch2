import React from "react";
import StudentIntakeClient from "./StudentIntakeClient";

interface PageProps {
  params: Promise<{ tenantSlug: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { tenantSlug } = await params;
  const readableTenant = tenantSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    title: `Student Medical Pre-Registration - ${readableTenant}`,
    description: `Official digital health intake and outside diagnostic document upload portal for ${readableTenant} students.`,
  };
}

export default async function StudentIntakePage({ params }: PageProps) {
  const { tenantSlug } = await params;
  const readableTenant = tenantSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <main className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <StudentIntakeClient tenantSlug={tenantSlug} tenantName={readableTenant} />
      </div>
    </main>
  );
}
