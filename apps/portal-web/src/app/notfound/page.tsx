import Link from "next/link";
import { Button } from "@/components/ui/button";
import { IconBuildingHospital, IconArrowLeft, IconPlus, IconSearch } from "@tabler/icons-react";

export const metadata = {
  title: "Workspace Not Found | Clinic EZ",
  description: "The requested clinic workspace does not exist on Clinic EZ.",
};

export default async function NotFoundWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string }>;
}) {
  const resolvedParams = await searchParams;
  const slug = resolvedParams.slug;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 text-center animate-in fade-in-50 zoom-in-95 duration-300">
        {/* Hospital Icon Pill */}
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center mb-5 shadow-sm">
          <IconBuildingHospital className="w-8 h-8" />
        </div>

        {/* Status Pill */}
        <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 mb-3">
          404 — Workspace Not Found
        </span>

        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
          Clinic Workspace Missing
        </h1>

        <p className="text-sm text-slate-600 dark:text-slate-400 mt-2.5 leading-relaxed">
          {slug ? (
            <>
              No registered clinic workspace found for{" "}
              <span className="font-mono font-bold text-slate-900 dark:text-slate-100 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800">
                {slug}
              </span>
              .
            </>
          ) : (
            "The workspace you are looking for does not exist, has been renamed, or has been removed."
          )}
        </p>

        {slug && (
          <div className="mt-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 font-mono">
            Host: {slug}.dev.clinicez.net
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-6 flex flex-col gap-2.5">
          <Link href="/tenants/register">
            <Button className="w-full h-11 rounded-xl font-bold text-sm bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-2 shadow-sm">
              <IconPlus className="w-4 h-4" />
              Register This Workspace
            </Button>
          </Link>

          <Link href="/">
            <Button variant="outline" className="w-full h-11 rounded-xl font-semibold text-sm flex items-center justify-center gap-2">
              <IconArrowLeft className="w-4 h-4" />
              Return to ClinicEz Home
            </Button>
          </Link>
        </div>
      </div>

      <div className="mt-8 text-center text-xs text-slate-400 dark:text-slate-500">
        © 2026 ClinicEz Healthcare Network • Unified Multi-Tenant Cloud
      </div>
    </div>
  );
}
