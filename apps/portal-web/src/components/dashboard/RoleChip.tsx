import { Badge } from "@/components/ui/badge";

const ROLE_TONE: Record<string, string> = {
  Owner: "border-violet-300 bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300",
  Admin: "border-blue-300 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300",
  Billing: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
  Member: "border-slate-300 bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-300",
};

const FALLBACK_TONE = ROLE_TONE.Member;

/** Workspace membership role as a chip. Roles that are facility job titles use the neutral tone. */
export function RoleChip({ role }: { role: string }) {
  return (
    <Badge variant="outline" className={`text-[10px] font-bold ${ROLE_TONE[role] ?? FALLBACK_TONE}`}>
      {role}
    </Badge>
  );
}
