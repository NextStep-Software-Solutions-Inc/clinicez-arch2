"use client";

import React, { useState, useEffect } from "react";
import { useAdmin } from "../AdminLayoutClient";
import { adminService, BillingPlan } from "@/services/admin.service";
import { PlanEditorDialog } from "@/components/admin/PlanEditorDialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  IconStack,
  IconPlus,
  IconEdit,
  IconTrash,
  IconLoader,
  IconAlertCircle,
  IconSearch,
  IconCheck,
  IconX,
  IconInfinity,
  IconSparkles,
  IconUsers,
  IconBuildingHospital,
  IconCash,
  IconRefresh
} from "@tabler/icons-react";

export default function AdminPlansPage() {
  const { hasPermission } = useAdmin();
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog states
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<BillingPlan | null>(null);

  // Delete confirmation
  const [planToDelete, setPlanToDelete] = useState<BillingPlan | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Search filter
  const [searchQuery, setSearchQuery] = useState("");

  const canManage = hasPermission("manage:plans");
  const canView = hasPermission("manage:plans") || hasPermission("manage:tenants") || hasPermission("view:tenants");

  const loadPlans = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await adminService.getPlans();
      // Sort by rank ascending
      const sorted = [...data].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
      setPlans(sorted);
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || "Failed to load subscription plans");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canView) {
      loadPlans();
    } else {
      setLoading(false);
      setError("You do not have administrative permission to view or manage subscription plans.");
    }
  }, [canView]);

  const handleCreate = () => {
    setSelectedPlan(null);
    setIsEditorOpen(true);
  };

  const handleEdit = (plan: BillingPlan) => {
    setSelectedPlan(plan);
    setIsEditorOpen(true);
  };

  const handleDeletePrompt = (plan: BillingPlan) => {
    setPlanToDelete(plan);
  };

  const confirmDelete = async () => {
    if (!planToDelete) return;
    try {
      setDeleteLoading(true);
      const planId = planToDelete.planId || planToDelete.id;
      await adminService.deletePlan(planId);
      toast.success(`Plan "${planToDelete.name}" was successfully removed.`);
      setPlanToDelete(null);
      loadPlans();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err.message || "Failed to delete plan. Workspaces may be subscribed to it.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const filteredPlans = plans.filter((p) => {
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.slug.toLowerCase().includes(q) ||
      (p.description && p.description.toLowerCase().includes(q))
    );
  });

  const totalSubscribers = plans.reduce((acc, p) => acc + (p.activeSubscribersCount ?? 0), 0);
  const highestRank = plans.length > 0 ? Math.max(...plans.map(p => p.rank ?? 1)) : 1;

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-20 bg-muted/40 rounded-3xl" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="h-24 bg-muted/40 rounded-2xl" />
          <div className="h-24 bg-muted/40 rounded-2xl" />
          <div className="h-24 bg-muted/40 rounded-2xl" />
          <div className="h-24 bg-muted/40 rounded-2xl" />
        </div>
        <div className="h-96 bg-muted/40 rounded-3xl" />
      </div>
    );
  }

  if (error && plans.length === 0) {
    return (
      <div className="max-w-xl mx-auto py-12 space-y-4">
        <Card className="border-destructive/20 bg-destructive/5 text-destructive p-8 text-center rounded-3xl shadow-sm">
          <IconAlertCircle className="h-12 w-12 mx-auto mb-3" />
          <CardTitle className="text-lg font-bold">Access or Connection Error</CardTitle>
          <p className="text-xs mt-2 opacity-90 leading-relaxed">{error}</p>
          <div className="pt-4">
            <Button onClick={loadPlans} variant="outline" className="rounded-xl text-xs font-bold">
              <IconRefresh className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <IconStack className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                Plans &amp; Pricing Management
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Configure commercial subscription tiers, 14 quantitative ceilings, and 10 feature capability flags.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={loadPlans}
            variant="outline"
            className="rounded-xl text-xs font-bold border-border cursor-pointer hover:bg-muted/50"
          >
            <IconRefresh className="h-4 w-4 mr-1.5" />
            Refresh
          </Button>
          {canManage && (
            <Button
              onClick={handleCreate}
              className="rounded-xl text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-md cursor-pointer"
            >
              <IconPlus className="h-4 w-4 mr-1.5" />
              Create Plan
            </Button>
          )}
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="rounded-2xl border-border bg-card p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
            Total Plans Cataloged
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-black text-foreground">{plans.length}</span>
            <Badge variant="outline" className="border-border text-xs font-mono font-bold">
              Rank 1..{highestRank}
            </Badge>
          </div>
          <span className="text-[11px] text-muted-foreground mt-1 block">Active ladder pricing tiers</span>
        </Card>

        <Card className="rounded-2xl border-border bg-card p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
            Subscribed Workspaces
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-black text-foreground">{totalSubscribers}</span>
            <IconUsers className="h-4 w-4 text-primary" />
          </div>
          <span className="text-[11px] text-muted-foreground mt-1 block">Active tenant subscriptions</span>
        </Card>

        <Card className="rounded-2xl border-border bg-card p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
            Standard Currency
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-black text-foreground">PHP (₱)</span>
            <IconCash className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <span className="text-[11px] text-muted-foreground mt-1 block">Philippine Peso billing engine</span>
        </Card>

        <Card className="rounded-2xl border-border bg-card p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
            Entitlement Architecture
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-black text-foreground">14 / 10</span>
            <IconSparkles className="h-4 w-4 text-amber-500" />
          </div>
          <span className="text-[11px] text-muted-foreground mt-1 block">14 limits &amp; 10 capability flags</span>
        </Card>
      </div>

      {/* Plans List Table Card */}
      <Card className="rounded-3xl border-border bg-card shadow-xs overflow-hidden">
        <CardHeader className="p-6 border-b border-border bg-muted/10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base font-bold text-foreground">
                Plan Tiers &amp; Entitlements Ladder
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Ordered by hierarchy rank. Updating a plan cascades fresh cryptographic licenses to subscribed workspaces.
              </CardDescription>
            </div>

            <div className="relative w-full sm:w-64">
              <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search plan name or slug..."
                className="w-full h-9 pl-9 pr-3 text-xs rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {filteredPlans.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="h-12 w-12 rounded-2xl bg-muted text-muted-foreground flex items-center justify-center mx-auto">
                <IconStack className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold text-foreground">No Plans Found</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                {searchQuery
                  ? `No subscription plans matching "${searchQuery}".`
                  : "No commercial billing plans exist in the catalog yet."}
              </p>
              {!searchQuery && (
                <Button onClick={handleCreate} className="rounded-xl text-xs font-bold mt-2">
                  <IconPlus className="h-4 w-4 mr-1.5" />
                  Create Your First Plan
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/20 text-muted-foreground uppercase tracking-wider text-[10px] font-bold">
                    <th className="py-3.5 px-5">Rank &amp; Plan</th>
                    <th className="py-3.5 px-4">Pricing (PHP ₱)</th>
                    <th className="py-3.5 px-4">Key Limits Summary</th>
                    <th className="py-3.5 px-4">Features</th>
                    <th className="py-3.5 px-4">Subscribers</th>
                    <th className="py-3.5 px-4">Version</th>
                    <th className="py-3.5 px-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredPlans.map((plan) => {
                    const monthlyNum = typeof plan.monthlyPrice === "number" ? plan.monthlyPrice : (typeof plan.priceMonthly === "number" ? plan.priceMonthly : parseFloat(String(plan.priceMonthly || 0)) || 0);
                    const annualNum = typeof plan.annualPrice === "number" ? plan.annualPrice : (typeof plan.priceAnnually === "number" ? plan.priceAnnually : parseFloat(String(plan.priceAnnually || 0)) || 0);

                    // Limits summary
                    const clinicsLimit = plan.limits?.["limit.clinics"];
                    const staffLimit = plan.limits?.["limit.staff"];
                    const patientsLimit = plan.limits?.["limit.patients"];
                    const storageLimit = plan.limits?.["limit.storage_gb"];

                    return (
                      <tr key={plan.id} className="hover:bg-muted/30 transition-colors group">
                        {/* Plan & Rank */}
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-3">
                            <Badge
                              variant="outline"
                              className="font-mono font-bold text-[10px] px-2 py-0.5 border-border bg-muted/40 shrink-0"
                            >
                              Tier {plan.rank}
                            </Badge>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm text-foreground">{plan.name}</span>
                                {plan.highlighted && (
                                  <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] font-bold">
                                    Featured
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <code className="text-[11px] font-mono text-muted-foreground">{plan.slug}</code>
                                {plan.description && (
                                  <span className="text-[11px] text-muted-foreground truncate max-w-xs block">
                                    · {plan.description}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Pricing */}
                        <td className="py-4 px-4 whitespace-nowrap">
                          {monthlyNum === 0 && annualNum === 0 ? (
                            <span className="font-bold text-xs text-muted-foreground">Free / Custom</span>
                          ) : (
                            <div>
                              <div className="font-mono font-bold text-foreground">
                                ₱{monthlyNum.toLocaleString()}<span className="text-[10px] text-muted-foreground font-normal">/mo</span>
                              </div>
                              <div className="font-mono text-[11px] text-muted-foreground">
                                ₱{annualNum.toLocaleString()}<span className="text-[10px]">/yr</span>
                              </div>
                            </div>
                          )}
                        </td>

                        {/* Limits Summary */}
                        <td className="py-4 px-4">
                          <div className="flex flex-wrap gap-1.5 max-w-xs">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-muted/50 border border-border text-[10px] font-mono">
                              Clinics: {clinicsLimit === -1 ? "∞" : (clinicsLimit ?? 1)}
                            </span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-muted/50 border border-border text-[10px] font-mono">
                              Staff: {staffLimit === -1 ? "∞" : (staffLimit ?? 5)}
                            </span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-muted/50 border border-border text-[10px] font-mono">
                              Patients: {patientsLimit === -1 ? "∞" : (patientsLimit ? patientsLimit.toLocaleString() : "1,000")}
                            </span>
                            {storageLimit && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-muted/50 border border-border text-[10px] font-mono">
                                {storageLimit === -1 ? "∞ GB" : `${storageLimit}GB`}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Features */}
                        <td className="py-4 px-4 whitespace-nowrap">
                          <Badge variant="outline" className="border-border bg-muted/20 font-semibold text-[11px]">
                            <IconSparkles className="h-3 w-3 mr-1 text-primary" />
                            {plan.enabledFeatures?.length ?? 0} / 10 Active
                          </Badge>
                        </td>

                        {/* Subscribers */}
                        <td className="py-4 px-4 whitespace-nowrap">
                          <span className="font-bold text-xs text-foreground">
                            {plan.activeSubscribersCount ?? 0}
                          </span>
                          <span className="text-[10px] text-muted-foreground block">workspaces</span>
                        </td>

                        {/* Version */}
                        <td className="py-4 px-4 whitespace-nowrap">
                          <code className="text-[11px] font-mono font-bold text-muted-foreground">
                            v{plan.version ?? 1}
                          </code>
                        </td>

                        {/* Actions */}
                        <td className="py-4 px-5 text-right whitespace-nowrap">
                          {canManage ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                onClick={() => handleEdit(plan)}
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2.5 text-xs font-bold rounded-lg cursor-pointer hover:bg-muted text-foreground"
                              >
                                <IconEdit className="h-3.5 w-3.5 mr-1" />
                                Edit
                              </Button>
                              <Button
                                onClick={() => handleDeletePrompt(plan)}
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2.5 text-xs font-bold rounded-lg cursor-pointer hover:bg-destructive/10 text-destructive"
                              >
                                <IconTrash className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">Read-only</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Plan Editor Dialog */}
      <PlanEditorDialog
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        onSaved={loadPlans}
        plan={selectedPlan}
      />

      {/* Delete Confirmation Modal */}
      <Dialog open={Boolean(planToDelete)} onOpenChange={(open) => !open && setPlanToDelete(null)}>
        <DialogContent className="max-w-md rounded-3xl border-border bg-background p-6 shadow-2xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
                <IconTrash className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-foreground">
                  Delete Plan: {planToDelete?.name}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Are you sure you want to permanently remove this billing plan from the catalog?
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="p-4 my-2 rounded-2xl bg-destructive/5 border border-destructive/20 text-xs text-destructive space-y-1">
            <p className="font-bold">Warning: Permanent Action</p>
            <p className="opacity-90 leading-relaxed">
              If any active workspaces are currently subscribed to <strong>{planToDelete?.slug}</strong>, the backend will prevent deletion to preserve billing consistency.
            </p>
          </div>

          <DialogFooter className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPlanToDelete(null)}
              disabled={deleteLoading}
              className="rounded-xl text-xs font-bold cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteLoading}
              className="rounded-xl text-xs font-bold px-4 cursor-pointer"
            >
              {deleteLoading ? (
                <>
                  <IconLoader className="h-4 w-4 animate-spin mr-1.5" />
                  Deleting...
                </>
              ) : (
                "Delete Plan"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
