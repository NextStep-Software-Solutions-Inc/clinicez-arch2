"use client";

import React, { useEffect, useState } from "react";
import { useAdmin } from "./AdminLayoutClient";
import { adminService, AdminAnalyticsDto } from "@/services/admin.service";
import { ADMIN_PERMISSIONS } from "@/constants/permissions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  IconHospital,
  IconUsers,
  IconArrowUpRight,
  IconUserCheck,
  IconTarget,
  IconCashBanknote,
  IconChartBar,
  IconAlertCircle
} from "@tabler/icons-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function AdminDashboardPage() {
  const { hasPermission } = useAdmin();
  const [data, setData] = useState<AdminAnalyticsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasPermission(ADMIN_PERMISSIONS.VIEW_ANALYTICS)) {
      setError("Unauthorized access");
      setLoading(false);
      return;
    }

    const loadAnalytics = async () => {
      try {
        const stats = await adminService.getAnalytics();
        setData(stats);
      } catch (err: any) {
        setError(err.message || "Failed to load analytics");
      } finally {
        setLoading(false);
      }
    };

    loadAnalytics();
  }, [hasPermission]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="h-4 w-24 bg-slate-200 dark:bg-slate-800 rounded" />
                <div className="h-8 w-8 rounded-full bg-slate-200 dark:bg-slate-800" />
              </CardHeader>
              <CardContent>
                <div className="h-8 w-16 bg-slate-200 dark:bg-slate-800 rounded mb-2" />
                <div className="h-3 w-32 bg-slate-200 dark:bg-slate-800 rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="h-96 animate-pulse bg-slate-50 dark:bg-slate-900/50" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="border-destructive/20 bg-destructive/5 text-destructive p-8 text-center max-w-xl mx-auto rounded-3xl">
        <IconAlertCircle className="h-12 w-12 mx-auto mb-4" />
        <CardTitle className="text-lg font-bold">Failed to Load Dashboard</CardTitle>
        <p className="text-sm mt-2 opacity-90 leading-relaxed">
          {error || "Could not retrieve administrative portal metrics."}
        </p>
      </Card>
    );
  }

  // Format currency
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 0
    }).format(val);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">

      {/* KPI Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {/* Total Tenants */}
        <Card className="rounded-3xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm relative overflow-hidden group hover:shadow-md transition-all duration-300">
          <div className="absolute top-0 right-0 h-24 w-24 bg-blue-500/5 rounded-full blur-2xl -mr-6 -mt-6 group-hover:bg-blue-500/10 transition-colors" />
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Clinics</CardDescription>
            <div className="p-2 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <IconHospital className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black tracking-tight">{data.totalTenants}</div>
            <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
              Registered workspace tenants
            </p>
          </CardContent>
        </Card>

        {/* Active Subscribers */}
        <Card className="rounded-3xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm relative overflow-hidden group hover:shadow-md transition-all duration-300">
          <div className="absolute top-0 right-0 h-24 w-24 bg-emerald-500/5 rounded-full blur-2xl -mr-6 -mt-6 group-hover:bg-emerald-500/10 transition-colors" />
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription className="text-xs font-bold uppercase tracking-wider text-slate-500">Subscribers</CardDescription>
            <div className="p-2 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <IconUserCheck className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black tracking-tight">{data.activeSubscribers}</div>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1.5 font-semibold flex items-center gap-1">
              <IconArrowUpRight className="h-3.5 w-3.5" />
              Active recurring plans
            </p>
          </CardContent>
        </Card>

        {/* Leads Count */}
        <Card className="rounded-3xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm relative overflow-hidden group hover:shadow-md transition-all duration-300">
          <div className="absolute top-0 right-0 h-24 w-24 bg-amber-500/5 rounded-full blur-2xl -mr-6 -mt-6 group-hover:bg-amber-500/10 transition-colors" />
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription className="text-xs font-bold uppercase tracking-wider text-slate-500">Active Leads</CardDescription>
            <div className="p-2 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <IconTarget className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black tracking-tight">{data.leadsCount}</div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Signed up, not subscribed yet
            </p>
          </CardContent>
        </Card>

        {/* Total MRR */}
        <Card className="rounded-3xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm relative overflow-hidden group hover:shadow-md transition-all duration-300">
          <div className="absolute top-0 right-0 h-24 w-24 bg-violet-500/5 rounded-full blur-2xl -mr-6 -mt-6 group-hover:bg-violet-500/10 transition-colors" />
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription className="text-xs font-bold uppercase tracking-wider text-slate-500">Estimated MRR</CardDescription>
            <div className="p-2 rounded-2xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
              <IconCashBanknote className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black tracking-tight text-violet-600 dark:text-violet-400">
              {formatCurrency(data.totalMRR)}
            </div>
            <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1.5">
              <span className="inline-flex h-2 w-2 rounded-full bg-violet-500" />
              Plan conversion rate: {data.conversionRate}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Analytics Chart */}
      <Card className="rounded-3xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6">
        <CardHeader className="px-2 pb-6">
          <div className="flex items-center gap-2">
            <IconChartBar className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg font-bold">Clinic Registrations Trend</CardTitle>
          </div>
          <CardDescription className="text-xs text-muted-foreground mt-1">
            Visualizing sign-ups and leads acquisition velocity over the past 30 days.
          </CardDescription>
        </CardHeader>
        <CardContent className="h-80 w-full pl-0">
          {data.registrationTrends.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.registrationTrends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRegistrations" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-primary, #6366f1)" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="var(--color-primary, #6366f1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(226, 232, 240, 0.2)" />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  style={{ fontSize: "10px", fill: "var(--muted-foreground, #64748b)" }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  style={{ fontSize: "10px", fill: "var(--muted-foreground, #64748b)" }}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "16px",
                    border: "1px solid rgba(226, 232, 240, 0.8)",
                    backgroundColor: "white",
                    fontSize: "12px",
                    boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.05)"
                  }}
                  itemStyle={{ fontWeight: "bold", color: "#6366f1" }}
                  labelStyle={{ color: "#64748b", fontWeight: "semibold" }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  name="New Clinics"
                  stroke="var(--color-primary, #6366f1)"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#colorRegistrations)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground text-xs">
              No registration data logged in the last 30 days.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
