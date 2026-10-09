"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import { IconCash } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { describeApiError } from "@/lib/apiError";
import { facilityService } from "@/services/facility.service";
import { financeService, type FinanceTotals } from "@/services/finance.service";

const MAX_RANGE_DAYS = 366;
const DAY_MS = 86_400_000;

const chartConfig = {
  paid: { label: "Paid", color: "var(--primary)" },
  reversed: { label: "Reversed", color: "var(--destructive)" },
} satisfies ChartConfig;

function toDateInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 29 * DAY_MS);
  return { from: toDateInput(from), to: toDateInput(to) };
}

function rangeError(from: string, to: string): string | null {
  if (!from || !to) return "Choose both dates.";
  const start = new Date(`${from}T00:00:00`).getTime();
  const end = new Date(`${to}T00:00:00`).getTime();
  if (end < start) return "The end date is before the start date.";
  if ((end - start) / DAY_MS + 1 > MAX_RANGE_DAYS) return `The range may not exceed ${MAX_RANGE_DAYS} days.`;
  return null;
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

function shortDay(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function TotalsCells({ totals }: { totals: FinanceTotals }) {
  return (
    <>
      <TableCell className="text-right tabular-nums">{money(totals.paid, totals.currency)}</TableCell>
      <TableCell className="text-right tabular-nums">{money(totals.reversed, totals.currency)}</TableCell>
      <TableCell className="text-right tabular-nums font-semibold">{money(totals.net, totals.currency)}</TableCell>
      <TableCell className="text-right tabular-nums">{totals.paidInvoices.toLocaleString()}</TableCell>
    </>
  );
}

function TotalsHead({ first }: { first: string }) {
  return (
    <TableRow>
      <TableHead>{first}</TableHead>
      <TableHead className="text-right">Paid</TableHead>
      <TableHead className="text-right">Reversed</TableHead>
      <TableHead className="text-right">Net</TableHead>
      <TableHead className="text-right">Paid invoices</TableHead>
    </TableRow>
  );
}

const selectClass =
  "h-9 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 text-xs focus:outline-none focus:ring-2 focus:ring-primary";

interface FinanceClientProps {
  tenantSlug: string;
}

export default function FinanceClient({ tenantSlug }: FinanceClientProps) {
  const initial = useMemo(() => defaultRange(), []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [facilityId, setFacilityId] = useState("");
  const [applied, setApplied] = useState({ from: initial.from, to: initial.to, facilityId: "" });
  const [currency, setCurrency] = useState("");

  const validation = rangeError(from, to);

  const { data: facilities } = useSWR(`finance-facilities/${tenantSlug}`, () => facilityService.getFacilities(tenantSlug), {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  const { data, error, isLoading } = useSWR(
    ["finance-summary", tenantSlug, applied.from, applied.to, applied.facilityId],
    () => financeService.getSummary(tenantSlug, { from: applied.from, to: applied.to, facilityId: applied.facilityId || undefined }),
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  const forbidden = (error as { response?: { status?: number } } | undefined)?.response?.status === 403;

  const currencies = data?.totals.map((t) => t.currency) ?? [];
  const activeCurrency = currencies.includes(currency) ? currency : (currencies[0] ?? "");
  const totals = data?.totals.find((t) => t.currency === activeCurrency);
  const facilityRows = data?.byFacility.filter((r) => r.totals.currency === activeCurrency) ?? [];
  const branchRows = data?.byBranch.filter((r) => r.totals.currency === activeCurrency) ?? [];
  const sourceRows = data?.bySource.filter((r) => r.totals.currency === activeCurrency) ?? [];
  const chartData = (data?.daily ?? [])
    .filter((d) => d.totals.currency === activeCurrency)
    .map((d) => ({ day: d.day, paid: d.totals.paid, reversed: d.totals.reversed }));

  return (
    <div className="w-full flex-1 flex flex-col gap-6 sm:gap-8 p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto animate-in fade-in-50 duration-300">
      <div className="border-b pb-6">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Finance</h1>
        <p className="text-muted-foreground text-xs sm:text-sm mt-1">
          What your facilities collected and reversed, as totals. Patient and invoice details stay in each facility&apos;s console.
        </p>
      </div>

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!validation) setApplied({ from, to, facilityId });
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="finance-from" className="text-xs font-bold">From</Label>
          <Input id="finance-from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-xl text-xs" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="finance-to" className="text-xs font-bold">To</Label>
          <Input id="finance-to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-xl text-xs" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="finance-facility" className="text-xs font-bold">Facility</Label>
          <select id="finance-facility" value={facilityId} onChange={(e) => setFacilityId(e.target.value)} className={selectClass}>
            <option value="">All facilities</option>
            {(facilities ?? []).map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
        {currencies.length > 1 && (
          <div className="space-y-1.5">
            <Label htmlFor="finance-currency" className="text-xs font-bold">Currency</Label>
            <select id="finance-currency" value={activeCurrency} onChange={(e) => setCurrency(e.target.value)} className={selectClass}>
              {currencies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        )}
        <Button type="submit" size="sm" disabled={validation !== null || isLoading} className="rounded-xl text-xs font-bold">
          {isLoading ? "Loading..." : "Apply"}
        </Button>
        {validation && <p className="w-full text-xs font-semibold text-rose-600">{validation}</p>}
      </form>

      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-28 w-full rounded-3xl" />
          <Skeleton className="h-64 w-full rounded-3xl" />
        </div>
      )}

      {forbidden && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 p-6 text-sm text-amber-800 dark:text-amber-300">
          Only the workspace Owner, an Admin or a member with the Billing role can view finance totals.
        </div>
      )}

      {!isLoading && !forbidden && error && (
        <div className="rounded-2xl border border-red-200 bg-red-50/50 dark:bg-red-950/20 p-6 text-sm text-red-700 dark:text-red-300">
          {describeApiError(error, "Finance totals could not be loaded. Please try again.").message}
        </div>
      )}

      {data && !totals && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-6 text-sm text-slate-600 dark:text-slate-300">
          No paid or reversed invoices between {shortDay(data.from.slice(0, 10))} and {shortDay(data.to.slice(0, 10))}.
        </div>
      )}

      {data && totals && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Paid", value: money(totals.paid, totals.currency), note: `${totals.paidInvoices.toLocaleString()} invoices` },
              { label: "Reversed", value: money(totals.reversed, totals.currency), note: `${totals.reversedInvoices.toLocaleString()} invoices` },
              { label: "Net", value: money(totals.net, totals.currency), note: "Paid minus reversed" },
              { label: "Currency", value: totals.currency, note: `${shortDay(data.from.slice(0, 10))} to ${shortDay(data.to.slice(0, 10))}` },
            ].map((card) => (
              <Card key={card.label} className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950">
                <CardHeader className="p-5 pb-1">
                  <CardDescription className="text-[10px] font-bold uppercase tracking-wider">{card.label}</CardDescription>
                  <CardTitle className="text-xl font-extrabold tabular-nums flex items-center gap-1.5">
                    {card.label === "Net" && <IconCash className="h-5 w-5 text-primary" />}
                    {card.value}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-5 pt-0 text-[11px] text-slate-500">{card.note}</CardContent>
              </Card>
            ))}
          </div>

          <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950">
            <CardHeader className="p-6 pb-3">
              <CardTitle className="text-lg font-bold">Daily</CardTitle>
              <CardDescription className="text-xs font-medium text-slate-500">Collected and reversed per day.</CardDescription>
            </CardHeader>
            <CardContent className="px-2 pt-2 sm:px-6">
              {chartData.length === 0 ? (
                <p className="p-4 text-sm text-slate-500">No daily activity in this range.</p>
              ) : (
                <ChartContainer config={chartConfig} className="aspect-auto h-[250px] w-full">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="fillPaid" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-paid)" stopOpacity={1.0} />
                        <stop offset="95%" stopColor="var(--color-paid)" stopOpacity={0.1} />
                      </linearGradient>
                      <linearGradient id="fillReversed" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-reversed)" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="var(--color-reversed)" stopOpacity={0.1} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} tickFormatter={shortDay} />
                    <ChartTooltip cursor={false} content={<ChartTooltipContent labelFormatter={(value) => shortDay(String(value))} indicator="dot" />} />
                    <Area dataKey="reversed" type="natural" fill="url(#fillReversed)" stroke="var(--color-reversed)" />
                    <Area dataKey="paid" type="natural" fill="url(#fillPaid)" stroke="var(--color-paid)" />
                  </AreaChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950">
            <CardHeader className="p-6 pb-3">
              <CardTitle className="text-lg font-bold">By facility</CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TotalsHead first="Facility" />
                </TableHeader>
                <TableBody>
                  {facilityRows.map((r) => (
                    <TableRow key={r.facilityId}>
                      <TableCell>
                        <span className="font-medium">{r.facilityName}</span>{" "}
                        <span className="text-[11px] text-slate-400">{r.facilityType}</span>
                      </TableCell>
                      <TotalsCells totals={r.totals} />
                    </TableRow>
                  ))}
                  {facilityRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-slate-500">No facility activity.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950">
              <CardHeader className="p-6 pb-3">
                <CardTitle className="text-lg font-bold">By branch</CardTitle>
              </CardHeader>
              <CardContent className="p-6 pt-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TotalsHead first="Branch" />
                  </TableHeader>
                  <TableBody>
                    {branchRows.map((r) => (
                      <TableRow key={r.branchId ?? "none"}>
                        <TableCell className="font-medium">{r.branchName}</TableCell>
                        <TotalsCells totals={r.totals} />
                      </TableRow>
                    ))}
                    {branchRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-slate-500">No branch activity.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950">
              <CardHeader className="p-6 pb-3">
                <CardTitle className="text-lg font-bold">By source</CardTitle>
                <CardDescription className="text-xs font-medium text-slate-500">Where the money came from, such as consultations or lab orders.</CardDescription>
              </CardHeader>
              <CardContent className="p-6 pt-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TotalsHead first="Source" />
                  </TableHeader>
                  <TableBody>
                    {sourceRows.map((r) => (
                      <TableRow key={r.sourceType}>
                        <TableCell className="font-medium">{r.sourceType}</TableCell>
                        <TotalsCells totals={r.totals} />
                      </TableRow>
                    ))}
                    {sourceRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-slate-500">No source activity.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
