import React from "react";
import Link from "next/link";
import { Building2, MapPin, Clock, ArrowRight, ShieldAlert, Sparkles } from "lucide-react";
import { tenantService } from "@/services/tenant.service";
import { facilityService, type WorkspaceFacility } from "@/services/facility.service";

interface BranchSelectorPageProps {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ code?: string }>;
}

export default async function BranchSelectorPage({
  params,
  searchParams,
}: BranchSelectorPageProps) {
  const { tenantSlug } = await params;
  const { code } = await searchParams;

  let profile = null;
  let clinicFacilities: WorkspaceFacility[] = [];
  let error: string | null = null;

  try {
    profile = await tenantService.getWorkspaceProfile(tenantSlug);
  } catch (_e) {
    // Graceful fallback: profile stays null
  }

  try {
    const allFacilities = await facilityService.getFacilities(tenantSlug);
    clinicFacilities = (allFacilities || []).filter(
      (f) => f.facilityType === "Clinic" && f.status === "Active"
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    error = `Unable to load clinic branches: ${msg}`;
  }

  const orgName = profile?.displayName || tenantSlug.toUpperCase();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl w-full mx-auto space-y-8 pt-6 sm:pt-10">
        {/* Header Section */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            Patient Self-Registration Portal
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground">
            {orgName}
          </h1>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto">
            Please select your destination clinic branch to begin the pre-registration and intake process.
          </p>
        </div>

        {/* Error State */}
        {error && (
          <div className="p-4 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-start gap-3 max-w-xl mx-auto">
            <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Error Loading Branches</p>
              <p className="text-xs mt-1 text-destructive/80">{error}</p>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!error && clinicFacilities.length === 0 && (
          <div className="bg-card border border-border rounded-3xl p-8 sm:p-12 text-center max-w-lg mx-auto shadow-sm space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto text-muted-foreground">
              <Building2 className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-lg text-foreground">No Active Clinic Branches</h3>
              <p className="text-xs text-muted-foreground">
                There are currently no active clinic facilities open for self-intake at {orgName}. Please contact clinic reception.
              </p>
            </div>
          </div>
        )}

        {/* Active Facilities Grid */}
        {!error && clinicFacilities.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            {clinicFacilities.map((facility) => {
              const fullAddress = [
                facility.streetAddress,
                facility.barangay,
                facility.city,
                facility.province,
              ]
                .filter(Boolean)
                .join(", ");

              const joinHref = `/join/${tenantSlug}/${facility.slug}${
                code ? `?code=${encodeURIComponent(code)}` : ""
              }`;

              return (
                <div
                  key={facility.id}
                  className="bg-card border border-border hover:border-primary/40 rounded-2xl p-6 flex flex-col justify-between gap-5 shadow-sm hover:shadow-md transition-all group"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-primary block">
                          Clinic Branch
                        </span>
                        <h2 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">
                          {facility.name}
                        </h2>
                      </div>
                      <span className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
                        <Building2 className="w-5 h-5" />
                      </span>
                    </div>

                    {fullAddress && (
                      <div className="flex items-start gap-2 text-xs text-muted-foreground">
                        <MapPin className="w-4 h-4 shrink-0 text-muted-foreground mt-0.5" />
                        <span className="line-clamp-2">{fullAddress}</span>
                      </div>
                    )}

                    {facility.operatingHours && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="w-4 h-4 shrink-0 text-muted-foreground" />
                        <span>{facility.operatingHours}</span>
                      </div>
                    )}
                  </div>

                  <Link
                    href={joinHref}
                    className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-primary hover:bg-primary/90 text-white font-semibold text-sm transition-all shadow-sm"
                  >
                    <span>Proceed to Registration</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="text-center text-xs text-muted-foreground py-6 border-t border-border mt-12">
        <p>&copy; {new Date().getFullYear()} ClinicEZ Enterprise &bull; Secured Self-Registration Gateway</p>
      </footer>
    </div>
  );
}
