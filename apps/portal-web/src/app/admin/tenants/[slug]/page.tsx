"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAdmin } from "../../AdminLayoutClient";
import { adminService, AdminTenantDto } from "@/services/admin.service";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  IconHospital,
  IconLoader,
  IconCopy,
  IconToggleLeft,
  IconCircleCheck,
  IconAlertCircle,
  IconCircleX,
  IconWorld,
  IconArrowLeft,
  IconActivity,
  IconSettings,
  IconFolder,
  IconReceipt,
  IconAdjustments
} from "@tabler/icons-react";
import { TenantEntitlementsCard } from "@/components/admin/TenantEntitlementsCard";
import { RecordPaymentDialog } from "@/components/admin/RecordPaymentDialog";

export default function TenantDetailPage() {
  const { hasPermission } = useAdmin();
  const params = useParams();
  const router = useRouter();
  const slug = params?.slug as string;

  const [tenant, setTenant] = useState<AdminTenantDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggleLoading, setToggleLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"subscription" | "usage" | "entitlements">("subscription");
  const [isRecordPaymentOpen, setIsRecordPaymentOpen] = useState(false);

  // Telemetry Overriding States
  const [isEditing, setIsEditing] = useState(false);
  const [branches, setBranches] = useState(1);
  const [staff, setStaff] = useState(3);
  const [patients, setPatients] = useState(25);
  const [apiUsed, setApiUsed] = useState(500);
  const [apiLimit, setApiLimit] = useState(10000);
  const [saveLoading, setSaveLoading] = useState(false);

  const canToggle = hasPermission("toggle:subscription");

  const loadTenantDetails = async () => {
    if (!slug) return;
    try {
      setLoading(true);
      const data = await adminService.getTenantBySlug(slug);
      if (!data) {
        setError("We couldn't find the tenant workspace details.");
      } else {
        setTenant(data);
        setBranches(data.clinicalBranchesCount);
        setStaff(data.staffAccountsCount);
        setPatients(data.activePatientRecordsCount);
        setApiUsed(data.monthlyApiQuotaUsed);
        setApiLimit(data.monthlyApiQuotaLimit);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load tenant details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!hasPermission("view:tenants")) {
      setError("Unauthorized access");
      setLoading(false);
      return;
    }
    loadTenantDetails();
  }, [slug, hasPermission]);

  const handleCopyId = (val: string) => {
    navigator.clipboard.writeText(val);
    toast.success("Copied to clipboard!");
  };

  const handleToggleSubscription = async () => {
    if (!tenant) return;
    try {
      setToggleLoading(true);
      const updated = await adminService.toggleSubscription(tenant.id);
      toast.success("Subscription status toggled successfully!");
      setTenant(prev => prev ? { ...prev, subscriptionStatus: updated.subscriptionStatus, subscriptionPlanId: updated.subscriptionPlanId } : null);
    } catch (err: any) {
      toast.error(err.message || "Failed to toggle subscription");
    } finally {
      setToggleLoading(false);
    }
  };

  const handleSaveUsage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) return;

    try {
      setSaveLoading(true);
      await adminService.updateTenantUsage(tenant.id, {
        clinicalBranchesCount: branches,
        staffAccountsCount: staff,
        activePatientRecordsCount: patients,
        monthlyApiQuotaUsed: apiUsed,
        monthlyApiQuotaLimit: apiLimit
      });
      toast.success("Workspace usage metrics overridden successfully!");
      setIsEditing(false);
      setTenant(prev => prev ? {
        ...prev,
        clinicalBranchesCount: branches,
        staffAccountsCount: staff,
        activePatientRecordsCount: patients,
        monthlyApiQuotaUsed: apiUsed,
        monthlyApiQuotaLimit: apiLimit
      } : null);
    } catch (err: any) {
      toast.error(err.message || "Failed to update usage metrics");
    } finally {
      setSaveLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-100 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <IconLoader className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground animate-pulse">Loading workspace details...</p>
        </div>
      </div>
    );
  }

  if (error || !tenant) {
    return (
      <div className="max-w-xl mx-auto py-10 space-y-4">
        <Button variant="ghost" asChild className="rounded-full mb-4">
          <Link href="/admin/tenants" className="flex items-center gap-2">
            <IconArrowLeft className="h-4 w-4" />
            Back to Tenants
          </Link>
        </Button>
        <Card className="border-destructive/20 bg-destructive/5 text-destructive p-8 text-center rounded-3xl shadow-md">
          <IconCircleX className="h-12 w-12 mx-auto mb-4" />
          <CardTitle className="text-lg font-bold">Error Accessing Tenant</CardTitle>
          <p className="text-sm mt-2 opacity-90 leading-relaxed">{error || "Tenant details not found."}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Back button */}
      <div>
        <Button variant="ghost" asChild className="rounded-full">
          <Link href="/admin/tenants" className="flex items-center gap-2 text-slate-500 hover:text-slate-800">
            <IconArrowLeft className="h-4 w-4" />
            Back to Tenants Directory
          </Link>
        </Button>
      </div>

      {/* Header Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
        <div className="flex items-center gap-3.5">
          <div className="h-12 w-12 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 shadow-xs border border-blue-500/5">
            <IconHospital className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
              {tenant.clinicName}
            </h2>
            <p className="text-xs font-mono text-muted-foreground mt-0.5">
              ID: {tenant.id}
            </p>
          </div>
        </div>
      </div>

      {/* Grid Layout splits settings and metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left Column - General Info */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="rounded-3xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <CardHeader className="pb-4 border-b border-slate-50 dark:border-slate-850">
              <CardTitle className="text-sm font-bold text-slate-800 dark:text-slate-200">
                Workspace Identity
              </CardTitle>
              <CardDescription className="text-xs">
                General registration details
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5 space-y-5">
              <div className="space-y-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Workspace Slug</span>
                <code className="text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800/40 p-2 rounded-xl text-primary block w-fit">
                  {tenant.tenantSlug}
                </code>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Facility Type</span>
                <span className="text-xs font-semibold capitalize bg-slate-50 dark:bg-slate-800/40 px-2.5 py-1 rounded-lg inline-block">
                  {tenant.facilityType.replace(/_/g, " ")}
                </span>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Owner Contact</span>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-350">{tenant.ownerName}</p>
                <button
                  onClick={() => handleCopyId(tenant.email)}
                  className="text-xs font-mono text-muted-foreground hover:text-slate-800 flex items-center gap-1.5 pt-0.5 group text-left w-full truncate"
                >
                  <span className="truncate">{tenant.email}</span>
                  <IconCopy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </button>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Signed Up On</span>
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  {new Date(tenant.createdAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric"
                  })}
                </p>
              </div>

              {/* Live Access Buttons */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-855 flex flex-col gap-2.5">
                <Button asChild className="w-full bg-gradient-to-r from-primary to-indigo-650 hover:from-primary/95 hover:to-indigo-700 hover:scale-[1.01] transition-all font-bold rounded-xl py-5 shadow-xs text-white">
                  <Link href={`/${tenant.tenantSlug}/dashboard`} target="_blank" rel="noreferrer">
                    <IconWorld className="h-4.5 w-4.5 mr-2" />
                    Access Dashboard
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/${tenant.tenantSlug}/dashboard`);
                    toast.success("Workspace URL copied!");
                  }}
                  className="w-full rounded-xl py-5 text-xs font-bold"
                >
                  <IconCopy className="h-4 w-4 mr-2" />
                  Copy Domain Link
                </Button>
                <Button
                  onClick={() => setIsRecordPaymentOpen(true)}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl py-5 shadow-xs cursor-pointer text-xs"
                >
                  <IconReceipt className="h-4 w-4 mr-2" />
                  Record Manual Payment
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Manage Subscription & Usage Metrics */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="rounded-3xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">

            {/* Custom Tab Switcher */}
            <div className="flex border-b border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900">
              <button
                onClick={() => setActiveTab("subscription")}
                className={`flex-1 py-4 text-xs font-bold transition-all border-b-2 ${activeTab === "subscription"
                  ? "border-primary text-slate-800 dark:text-white"
                  : "border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-slate-350"
                  }`}
              >
                <span className="flex items-center justify-center gap-1.5">
                  <IconSettings className="h-4 w-4" />
                  Subscription Settings
                </span>
              </button>
              <button
                onClick={() => setActiveTab("entitlements")}
                className={`flex-1 py-4 text-xs font-bold transition-all border-b-2 ${activeTab === "entitlements"
                  ? "border-primary text-slate-800 dark:text-white"
                  : "border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-slate-350"
                  }`}
              >
                <span className="flex items-center justify-center gap-1.5">
                  <IconAdjustments className="h-4 w-4" />
                  Entitlements &amp; Overrides
                </span>
              </button>
              <button
                onClick={() => setActiveTab("usage")}
                className={`flex-1 py-4 text-xs font-bold transition-all border-b-2 ${activeTab === "usage"
                  ? "border-primary text-slate-800 dark:text-white"
                  : "border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-slate-350"
                  }`}
              >
                <span className="flex items-center justify-center gap-1.5">
                  <IconActivity className="h-4 w-4" />
                  Usage &amp; Telemetry
                </span>
              </button>
            </div>

            <CardContent className="p-6">
              {activeTab === "subscription" && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-1.5 p-4 bg-slate-50/50 dark:bg-slate-800/20 rounded-2xl border border-slate-100 dark:border-slate-850">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Pricing Plan</span>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge className="capitalize font-bold text-xs px-2.5 py-0.5">{tenant.subscriptionPlanId}</Badge>
                        {tenant.subscriptionPlanId !== "None" && (
                          <span className="text-[10px] text-slate-500 font-semibold">{tenant.isAnnual ? "Billed Annually" : "Billed Monthly"}</span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1.5 p-4 bg-slate-50/50 dark:bg-slate-800/20 rounded-2xl border border-slate-100 dark:border-slate-850">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Billing Status</span>
                      <div className="mt-1">
                        {tenant.subscriptionStatus === "ACTIVE" ? (
                          <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50/50 dark:bg-green-950/20 dark:border-green-900 rounded-full flex items-center gap-1 w-fit font-bold text-xs">
                            <IconCircleCheck className="h-3.5 w-3.5" /> Active
                          </Badge>
                        ) : tenant.subscriptionStatus === "TRIALING" ? (
                          <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900 rounded-full flex items-center gap-1 w-fit font-bold text-xs">
                            <IconAlertCircle className="h-3.5 w-3.5 animate-pulse" /> Trialing
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50/50 dark:bg-red-950/20 dark:border-red-900 rounded-full flex items-center gap-1 w-fit font-bold text-xs">
                            <IconCircleX className="h-3.5 w-3.5" /> Cancelled
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Manual Payment Action */}
                  <div className="pt-6 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-emerald-500/5 dark:bg-emerald-950/10 p-5 rounded-2xl border border-emerald-500/10">
                    <div className="text-xs text-muted-foreground">
                      <p className="font-bold text-slate-800 dark:text-slate-200 mb-0.5">Offline / Manual Payment Recording</p>
                      Record manual bank deposits, GCash/Maya, checks, cash, or promo sponsorships to generate official invoices and receipts, activate subscriptions, and stage facility licenses.
                    </div>
                    <Button
                      type="button"
                      onClick={() => setIsRecordPaymentOpen(true)}
                      className="rounded-xl text-xs font-bold shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer py-5 px-5"
                    >
                      <IconReceipt className="h-4 w-4 mr-1.5" />
                      Record Manual Payment
                    </Button>
                  </div>

                  {canToggle && (
                    <div className="pt-6 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-slate-50/30 dark:bg-slate-900/10 p-5 rounded-2xl">
                      <div className="text-xs text-muted-foreground">
                        <p className="font-bold text-slate-800 dark:text-slate-200 mb-0.5">Toggle Administrative Access Rights</p>
                        Override this workspace's status immediately. Revoking access blocks logins for all clinic staff.
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleToggleSubscription}
                        disabled={toggleLoading}
                        className="rounded-xl text-xs font-bold shrink-0 shadow-xs border-slate-200"
                      >
                        {toggleLoading ? (
                          <IconLoader className="h-4 w-4 animate-spin mr-1.5" />
                        ) : (
                          <IconToggleLeft className="h-4 w-4 mr-1.5" />
                        )}
                        Override Subscription
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "usage" && (
                <div className="space-y-6">
                  {!isEditing ? (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="p-4 bg-slate-50/55 dark:bg-slate-900/30 rounded-2xl border border-slate-100/60 dark:border-slate-800/40">
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Clinical Branches</span>
                          <span className="text-2xl font-black text-slate-800 dark:text-white mt-1 block">
                            {tenant.clinicalBranchesCount} {tenant.clinicalBranchesCount === 1 ? 'Branch' : 'Branches'}
                          </span>
                          <span className="text-xs text-slate-500 font-semibold block mt-1">Multi-site synchronizations live</span>
                        </div>

                        <div className="p-4 bg-slate-50/55 dark:bg-slate-900/30 rounded-2xl border border-slate-100/60 dark:border-slate-800/40">
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Staff & Operator Accounts</span>
                          <span className="text-2xl font-black text-slate-800 dark:text-white mt-1 block">
                            {tenant.staffAccountsCount} Active
                          </span>
                          <span className="text-xs text-slate-500 font-semibold block mt-1">Doctors, nurses, and pharmacists</span>
                        </div>

                        <div className="p-4 bg-slate-50/55 dark:bg-slate-900/30 rounded-2xl border border-slate-100/60 dark:border-slate-800/40">
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Active Patient Records</span>
                          <span className="text-2xl font-black text-slate-800 dark:text-white mt-1 block">
                            {tenant.activePatientRecordsCount.toLocaleString()} Charts
                          </span>
                          <span className="text-xs text-slate-500 font-semibold block mt-1">Fully HIPAA & Data Privacy compliant</span>
                        </div>

                        <div className="p-4 bg-slate-50/55 dark:bg-slate-900/30 rounded-2xl border border-slate-100/60 dark:border-slate-800/40">
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Monthly API Quota Utilization</span>
                          <span className="text-2xl font-black text-slate-800 dark:text-white mt-1 block">
                            {tenant.monthlyApiQuotaUsed.toLocaleString()} / {tenant.monthlyApiQuotaLimit.toLocaleString()}
                          </span>
                          <span className="text-xs text-slate-500 font-semibold block mt-1">PhilHealth transmission proxy requests</span>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                        <Button
                          type="button"
                          onClick={() => {
                            setBranches(tenant.clinicalBranchesCount);
                            setStaff(tenant.staffAccountsCount);
                            setPatients(tenant.activePatientRecordsCount);
                            setApiUsed(tenant.monthlyApiQuotaUsed);
                            setApiLimit(tenant.monthlyApiQuotaLimit);
                            setIsEditing(true);
                          }}
                          className="rounded-xl text-xs font-bold px-5 py-2.5"
                        >
                          <IconSettings className="h-4 w-4 mr-2" />
                          Override Telemetry Metrics
                        </Button>
                      </div>
                    </>
                  ) : (
                    <form onSubmit={handleSaveUsage} className="space-y-5 animate-in fade-in duration-300">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Clinical Branches Count</label>
                          <input
                            type="number"
                            required
                            min="1"
                            value={branches}
                            onChange={(e) => setBranches(parseInt(e.target.value) || 1)}
                            className="w-full h-10 px-3 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-background focus:outline-hidden focus:ring-2 focus:ring-ring text-slate-800 dark:text-slate-100"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Staff Accounts Count</label>
                          <input
                            type="number"
                            required
                            min="0"
                            value={staff}
                            onChange={(e) => setStaff(parseInt(e.target.value) || 0)}
                            className="w-full h-10 px-3 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-background focus:outline-hidden focus:ring-2 focus:ring-ring text-slate-800 dark:text-slate-100"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Active Patients Count</label>
                          <input
                            type="number"
                            required
                            min="0"
                            value={patients}
                            onChange={(e) => setPatients(parseInt(e.target.value) || 0)}
                            className="w-full h-10 px-3 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-background focus:outline-hidden focus:ring-2 focus:ring-ring text-slate-800 dark:text-slate-100"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">API Quota Used</label>
                          <input
                            type="number"
                            required
                            min="0"
                            value={apiUsed}
                            onChange={(e) => setApiUsed(parseInt(e.target.value) || 0)}
                            className="w-full h-10 px-3 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-background focus:outline-hidden focus:ring-2 focus:ring-ring text-slate-800 dark:text-slate-100"
                          />
                        </div>

                        <div className="space-y-1.5 sm:col-span-2">
                          <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">API Quota Limit</label>
                          <input
                            type="number"
                            required
                            min="0"
                            value={apiLimit}
                            onChange={(e) => setApiLimit(parseInt(e.target.value) || 0)}
                            className="w-full h-10 px-3 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-background focus:outline-hidden focus:ring-2 focus:ring-ring text-slate-800 dark:text-slate-100"
                          />
                        </div>
                      </div>

                      <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setIsEditing(false)}
                          className="rounded-xl text-xs font-bold"
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          disabled={saveLoading}
                          className="rounded-xl text-xs font-bold px-6"
                        >
                          {saveLoading ? (
                            <IconLoader className="h-4 w-4 animate-spin mr-1.5" />
                          ) : (
                            <IconCircleCheck className="h-4 w-4 mr-1.5" />
                          )}
                          Save Override
                        </Button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {activeTab === "entitlements" && (
                <TenantEntitlementsCard
                  tenantId={tenant.id}
                  tenantSlug={tenant.tenantSlug}
                  onSaved={loadTenantDetails}
                  embedded={true}
                />
              )}
            </CardContent>
          </Card>
        </div>

      </div>

      {/* Manual Payment Recording Modal */}
      <RecordPaymentDialog
        isOpen={isRecordPaymentOpen}
        onClose={() => setIsRecordPaymentOpen(false)}
        onSuccess={() => {
          loadTenantDetails();
        }}
        tenantId={tenant.id}
        tenantSlug={tenant.tenantSlug}
        clinicName={tenant.clinicName}
        currentPlanSlug={tenant.subscriptionPlanId}
      />
    </div>
  );
}
