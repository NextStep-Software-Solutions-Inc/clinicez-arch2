"use client";

import React, { useEffect, useState } from "react";
import { useAdmin } from "../AdminLayoutClient";
import { adminService, AdminTenantDto } from "@/services/admin.service";
import { ADMIN_PERMISSIONS } from "@/constants/permissions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import Link from "next/link";
import { 
  IconHospital, 
  IconSearch, 
  IconLoader,
  IconCopy, 
  IconToggleLeft,
  IconCircleCheck, 
  IconAlertCircle, 
  IconCircleX,
  IconWorld,
  IconArrowUpRight,
  IconSettings,
  IconActivity,
  IconFolder,
  IconArchive,
  IconTrash,
  IconAlertTriangle
} from "@tabler/icons-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TenantCleanupDialog } from "@/components/admin/TenantCleanupDialog";

export default function AdminTenantsPage() {
  const { hasPermission } = useAdmin();
  const [tenants, setTenants] = useState<AdminTenantDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [toggleLoading, setToggleLoading] = useState<string | null>(null);
  const [filterPlan, setFilterPlan] = useState<string>("ALL");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [cleanupTenant, setCleanupTenant] = useState<AdminTenantDto | null>(null);

  const canToggle = hasPermission(ADMIN_PERMISSIONS.TOGGLE_SUBSCRIPTION);
  const canManage = hasPermission(ADMIN_PERMISSIONS.MANAGE_TENANTS);

  const loadTenants = async () => {
    try {
      setLoading(true);
      const data = await adminService.getTenants();
      setTenants(data);
    } catch (err: any) {
      setError(err.message || "Failed to load tenants");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!hasPermission(ADMIN_PERMISSIONS.VIEW_TENANTS)) {
      setError("Unauthorized access");
      setLoading(false);
      return;
    }
    loadTenants();
  }, [hasPermission]);

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    toast.success("Tenant ID copied to clipboard!");
  };

  const handleToggleSubscription = async (id: string) => {
    if (!canToggle) {
      toast.error("You do not have permission to modify subscriptions.");
      return;
    }

    try {
      setToggleLoading(id);
      const updated = await adminService.toggleSubscription(id);
      toast.success("Subscription status toggled successfully!");
      // Update local state
      setTenants(prev => prev.map(t => t.id === id ? { ...t, subscriptionStatus: updated.subscriptionStatus, subscriptionPlanId: updated.subscriptionPlanId } : t));
    } catch (err: any) {
      toast.error(err.message || "Failed to toggle subscription");
    } finally {
      setToggleLoading(null);
    }
  };

  // Filter tenants by search query, plan level, and status
  const filteredTenants = tenants.filter(t => {
    const matchesSearch = t.clinicName.toLowerCase().includes(search.toLowerCase()) ||
      t.ownerName.toLowerCase().includes(search.toLowerCase()) ||
      t.email.toLowerCase().includes(search.toLowerCase()) ||
      t.tenantSlug.toLowerCase().includes(search.toLowerCase());
      
    const matchesPlan = filterPlan === "ALL" || t.subscriptionPlanId === filterPlan;

    let matchesStatus = true;
    if (filterStatus === "ORPHANED") {
      matchesStatus = Boolean(t.isOrphaned);
    } else if (filterStatus === "ARCHIVED") {
      matchesStatus = Boolean(t.archivedAt);
    } else if (filterStatus !== "ALL") {
      matchesStatus = t.subscriptionStatus === filterStatus && !t.archivedAt;
    }
    
    return matchesSearch && matchesPlan && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <IconLoader className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading workspace tenants...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/20 bg-destructive/5 text-destructive p-8 text-center max-w-xl mx-auto rounded-3xl">
        <IconCircleX className="h-12 w-12 mx-auto mb-4" />
        <CardTitle className="text-lg font-bold">Error Accessing Tenants</CardTitle>
        <p className="text-sm mt-2 opacity-90 leading-relaxed">{error}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Tenant Workspace Management</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor registered clinics, view subscription levels, and adjust access rights.
          </p>
        </div>
      </div>

      {/* Filter and table */}
      <Card className="rounded-3xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-50/30 dark:bg-slate-900">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
            <div className="relative flex-1 max-w-sm">
              <IconSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search clinic name, owner, email..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10 rounded-xl"
              />
            </div>
            
            <div className="flex items-center gap-3">
              {/* Filter by Plan */}
              <select
                value={filterPlan}
                onChange={e => setFilterPlan(e.target.value)}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-background px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-350 focus:outline-hidden focus:ring-2 focus:ring-ring"
              >
                <option value="ALL">All Plans</option>
                <option value="None">No Plan (None)</option>
                <option value="Starter">Starter Plan</option>
                <option value="Premium">Premium Plan</option>
                <option value="Ultimate">Ultimate Plan</option>
              </select>

              {/* Filter by Status */}
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-background px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-350 focus:outline-hidden focus:ring-2 focus:ring-ring"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="TRIALING">Trialing</option>
                <option value="ORPHANED">Orphaned / Inactive</option>
                <option value="ARCHIVED">Archived</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
          </div>
          <div className="text-xs text-muted-foreground font-semibold whitespace-nowrap">
            Showing {filteredTenants.length} of {tenants.length} tenants
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50/50 dark:bg-slate-900/50">
              <TableRow>
                <TableHead className="pl-6 py-4 font-bold text-xs uppercase tracking-wider">Clinic / Organization</TableHead>
                <TableHead className="py-4 font-bold text-xs uppercase tracking-wider">Tenant Slug</TableHead>
                <TableHead className="py-4 font-bold text-xs uppercase tracking-wider">Facility Type</TableHead>
                <TableHead className="py-4 font-bold text-xs uppercase tracking-wider">Owner Contact</TableHead>
                <TableHead className="py-4 font-bold text-xs uppercase tracking-wider">Plan Details</TableHead>
                <TableHead className="py-4 font-bold text-xs uppercase tracking-wider">Status</TableHead>
                <TableHead className="py-4 font-bold text-xs uppercase tracking-wider">Signed Up</TableHead>
                <TableHead className="pr-6 py-4 font-bold text-xs uppercase tracking-wider text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTenants.length > 0 ? (
                filteredTenants.map((t) => (
                  <TableRow key={t.id} className="hover:bg-slate-50/30 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="pl-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                          <IconHospital className="h-5 w-5" />
                        </div>
                        <div>
                          <span className="block font-bold text-sm text-slate-800 dark:text-slate-200">
                            {t.clinicName}
                          </span>
                          <span className="block text-[10px] font-mono text-muted-foreground uppercase">
                            ID: {t.id.slice(0, 8)}...
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-4">
                      <code className="text-xs font-semibold px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 font-mono text-primary">
                        {t.tenantSlug}
                      </code>
                    </td>
                    <td className="py-4 text-xs font-semibold text-muted-foreground capitalize">
                      {t.facilityType.replace(/_/g, " ")}
                    </td>
                    <td className="py-4">
                      <div className="text-xs">
                        <p className="font-bold text-slate-700 dark:text-slate-300">{t.ownerName}</p>
                        <p className="text-muted-foreground font-mono">{t.email}</p>
                      </div>
                    </td>
                    <td className="py-4">
                      <div className="flex flex-col gap-1 items-start">
                        <Badge className="capitalize rounded-full font-bold text-[10px] px-2 py-0.5">
                          {t.subscriptionPlanId}
                        </Badge>
                        {t.subscriptionPlanId !== "None" && (
                          <span className="text-[10px] text-muted-foreground font-semibold">
                            {t.isAnnual ? "Billed Annually" : "Billed Monthly"}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-4">
                      {t.archivedAt ? (
                        <Badge variant="outline" className="text-slate-600 border-slate-300 bg-slate-100 dark:bg-slate-800 dark:border-slate-700 rounded-full flex items-center gap-1 w-fit font-bold text-[10px]">
                          <IconArchive className="h-3.5 w-3.5 text-slate-500" />
                          Archived
                        </Badge>
                      ) : t.isOrphaned ? (
                        <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 rounded-full flex items-center gap-1 w-fit font-bold text-[10px]" title={t.orphanReason || "Orphaned ghost registration"}>
                          <IconAlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                          Orphaned
                        </Badge>
                      ) : t.subscriptionStatus === "ACTIVE" ? (
                        <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50/50 dark:bg-green-950/20 dark:border-green-900 rounded-full flex items-center gap-1 w-fit font-bold text-[10px]">
                          <IconCircleCheck className="h-3.5 w-3.5" />
                          Active
                        </Badge>
                      ) : t.subscriptionStatus === "TRIALING" ? (
                        <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900 rounded-full flex items-center gap-1 w-fit font-bold text-[10px]">
                          <IconAlertCircle className="h-3.5 w-3.5 animate-pulse" />
                          Trialing
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50/50 dark:bg-red-950/20 dark:border-red-900 rounded-full flex items-center gap-1 w-fit font-bold text-[10px]">
                          <IconCircleX className="h-3.5 w-3.5" />
                          Cancelled
                        </Badge>
                      )}
                    </td>
                    <td className="py-4 text-xs text-muted-foreground font-semibold">
                      {new Date(t.createdAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric"
                      })}
                    </td>
                    <td className="pr-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleCopyId(t.id)}
                          className="h-8 w-8 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                          title="Copy Tenant ID"
                        >
                          <IconCopy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          asChild
                          className="h-8 w-8 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                          title="Workspace Settings & Usage"
                        >
                          <Link href={`/admin/tenants/${t.tenantSlug}`}>
                            <IconSettings className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          asChild
                          className="h-8 w-8 rounded-xl text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                          title="Access Tenant Workspace"
                        >
                          <Link href={`/${t.tenantSlug}/dashboard`} target="_blank" rel="noreferrer">
                            <IconWorld className="h-4 w-4" />
                          </Link>
                        </Button>
                        {canToggle && (
                          <Button
                            variant="outline"
                            onClick={() => handleToggleSubscription(t.id)}
                            disabled={toggleLoading === t.id}
                            className="rounded-full text-[10px] font-bold px-3 py-1.5 h-8 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50"
                          >
                            {toggleLoading === t.id ? (
                              <IconLoader className="h-3.5 w-3.5 animate-spin mr-1" />
                            ) : (
                              <IconToggleLeft className="h-3.5 w-3.5 mr-1" />
                            )}
                            Toggle Active
                          </Button>
                        )}
                        {canManage && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setCleanupTenant(t)}
                            className="h-8 w-8 rounded-xl text-amber-600 hover:text-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/20"
                            title="Workspace Offboarding & Cleanup"
                          >
                            <IconTrash className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-muted-foreground text-sm">
                    No matching tenants found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {cleanupTenant && (
        <TenantCleanupDialog
          isOpen={Boolean(cleanupTenant)}
          onClose={() => setCleanupTenant(null)}
          onSuccess={loadTenants}
          tenantId={cleanupTenant.id}
          tenantSlug={cleanupTenant.tenantSlug}
          clinicName={cleanupTenant.clinicName}
          archivedAt={cleanupTenant.archivedAt}
        />
      )}
    </div>
  );
}
