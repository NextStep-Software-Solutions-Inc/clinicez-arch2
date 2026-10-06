import Link from "next/link";
import { Button } from "@/components/ui/button";
import { IconAlertTriangle, IconArrowLeft, IconHome } from "@tabler/icons-react";

export const metadata = {
  title: "404 - Page Not Found | Clinic EZ",
};

export default function GlobalNotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 text-center animate-in fade-in-50 zoom-in-95 duration-300">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400 mx-auto flex items-center justify-center mb-5 shadow-sm">
          <IconAlertTriangle className="w-8 h-8" />
        </div>

        <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 mb-3">
          Error 404
        </span>

        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
          Page Not Found
        </h1>

        <p className="text-sm text-slate-600 dark:text-slate-400 mt-2.5 leading-relaxed">
          The page or clinic workspace you are trying to reach does not exist or has been moved.
        </p>

        <div className="mt-6 flex flex-col gap-2.5">
          <Link href="/">
            <Button className="w-full h-11 rounded-xl font-bold text-sm bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-2 shadow-sm">
              <IconHome className="w-4 h-4" />
              Go to Homepage
            </Button>
          </Link>
          <Link href="/tenants/register">
            <Button variant="outline" className="w-full h-11 rounded-xl font-semibold text-sm flex items-center justify-center gap-2">
              <IconArrowLeft className="w-4 h-4" />
              Register New Workspace
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
