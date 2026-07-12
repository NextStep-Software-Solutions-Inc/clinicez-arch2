"use client";

import React, { useEffect, useState } from "react";
import { useAdmin } from "../AdminLayoutClient";
import { adminService, AdminRoleDto } from "@/services/admin.service";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  IconKey, 
  IconPlus, 
  IconLoader, 
  IconShield,
  IconCircleX 
} from "@tabler/icons-react";

const AVAILABLE_PERMISSIONS = [
  { token: "view:analytics", label: "View Analytics", desc: "Allows viewing high-level dashboard charts, stats, and estimated MRR." },
  { token: "view:tenants", label: "View Tenants & Leads", desc: "Allows viewing lists of registered tenants and conversion leads." },
  { token: "manage:tenants", label: "Manage Tenant Details", desc: "Allows modifying organization files and onboarding status." },
  { token: "toggle:subscription", label: "Adjust Subscription Plan", desc: "Allows manually upgrading/downgrading tenant billing active states." },
  { token: "manage:blogs", label: "Manage Blogs (CRM)", desc: "Allows creating, updating, and deleting marketing blog posts." },
  { token: "manage:roles", label: "Manage Roles & Access", desc: "Allows viewing and editing roles and permissions configurations." },
  { token: "manage:admins", label: "Manage Admin Users", desc: "Allows full control to invite, edit, or delete other administrative profiles." }
];

export default function AdminRolesPage() {
  const { hasPermission } = useAdmin();
  const [roles, setRoles] = useState<AdminRoleDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog and form states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    permissions: [] as string[]
  });

  const canManage = hasPermission("manage:roles");

  const loadRoles = async () => {
    try {
      setLoading(true);
      const data = await adminService.getRoles();
      setRoles(data);
    } catch (err: any) {
      setError(err.message || "Failed to load roles");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!hasPermission("manage:roles")) {
      setError("Unauthorized access");
      setLoading(false);
      return;
    }
    loadRoles();
  }, [hasPermission]);

  const handleOpenCreate = () => {
    setFormData({
      name: "",
      description: "",
      permissions: []
    });
    setDialogOpen(true);
  };

  const handlePermissionToggle = (token: string, checked: boolean) => {
    setFormData(prev => {
      const perms = checked 
        ? [...prev.permissions, token] 
        : prev.permissions.filter(p => p !== token);
      return { ...prev, permissions: perms };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) {
      toast.error("Role Name is required.");
      return;
    }

    try {
      setFormLoading(true);
      await adminService.createRole(formData);
      toast.success("Custom role created successfully!");
      setDialogOpen(false);
      loadRoles();
    } catch (err: any) {
      toast.error(err.message || "Failed to create custom role");
    } finally {
      setFormLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <IconLoader className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading portal roles...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/20 bg-destructive/5 text-destructive p-8 text-center max-w-xl mx-auto rounded-3xl">
        <IconCircleX className="h-12 w-12 mx-auto mb-4" />
        <CardTitle className="text-lg font-bold">Error Accessing Roles</CardTitle>
        <p className="text-sm mt-2 opacity-90 leading-relaxed">{error}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Roles & Permissions Registry</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configure system authorization profiles and align specific user accounts with permission scopes.
          </p>
        </div>
        {canManage && (
          <Button onClick={handleOpenCreate} className="rounded-full shadow-md">
            <IconPlus className="h-4.5 w-4.5 mr-1" />
            Add Custom Role
          </Button>
        )}
      </div>

      {/* Main Table */}
      <Card className="rounded-3xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50/50 dark:bg-slate-900/50">
              <TableRow>
                <TableHead className="pl-6 py-4 font-bold text-xs uppercase tracking-wider">Role Title</TableHead>
                <TableHead className="py-4 font-bold text-xs uppercase tracking-wider">Description</TableHead>
                <TableHead className="py-4 font-bold text-xs uppercase tracking-wider">Permission Tokens</TableHead>
                <TableHead className="pr-6 py-4 font-bold text-xs uppercase tracking-wider text-right">Scope Size</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((r) => (
                <TableRow key={r.id} className="hover:bg-slate-50/30 dark:hover:bg-slate-800/20 transition-colors">
                  <td className="pl-6 py-4 font-bold text-sm text-slate-800 dark:text-slate-200">
                    <div className="flex items-center gap-2.5">
                      <IconShield className="h-4.5 w-4.5 text-primary" />
                      {r.name}
                    </div>
                  </td>
                  <td className="py-4 text-xs text-muted-foreground max-w-sm">
                    {r.description || "No description provided."}
                  </td>
                  <td className="py-4 max-w-md">
                    <div className="flex flex-wrap gap-1.5">
                      {r.permissions.map((p) => (
                        <Badge key={p} variant="outline" className="text-[9px] font-mono font-semibold lowercase border-slate-200 dark:border-slate-800">
                          {p}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="pr-6 py-4 text-right text-xs font-bold text-slate-700 dark:text-slate-300">
                    {r.permissions.length} keys
                  </td>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Add Role Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto rounded-3xl">
          <DialogHeader>
            <DialogTitle>Create Custom Access Profile</DialogTitle>
            <DialogDescription>
              Specify a name, short summary, and configure explicit access tokens for this role.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-5 pt-2">
            <div className="space-y-4">
              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Role Title *</label>
                <Input
                  required
                  placeholder="e.g. Sales Agent"
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="rounded-xl"
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Description</label>
                <Input
                  placeholder="Summarize the core utility of this role..."
                  value={formData.description}
                  onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="rounded-xl"
                />
              </div>

              {/* Permissions Checklist */}
              <div className="space-y-2.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Scope Authorization Permissions</label>
                <div className="space-y-3 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 bg-slate-50/20 max-h-64 overflow-y-auto">
                  {AVAILABLE_PERMISSIONS.map((p) => {
                    const isChecked = formData.permissions.includes(p.token);
                    return (
                      <div key={p.token} className="flex items-start gap-3 group">
                        <Checkbox
                          id={`perm-${p.token}`}
                          checked={isChecked}
                          onCheckedChange={(checked) => handlePermissionToggle(p.token, !!checked)}
                          className="mt-0.5 rounded-sm"
                        />
                        <label 
                          htmlFor={`perm-${p.token}`}
                          className="text-xs cursor-pointer select-none space-y-0.5"
                        >
                          <span className="block font-bold text-slate-700 dark:text-slate-200 group-hover:text-primary transition-colors">
                            {p.label} <code className="text-[10px] font-mono text-muted-foreground">({p.token})</code>
                          </span>
                          <span className="block text-[10px] text-muted-foreground leading-normal">
                            {p.desc}
                          </span>
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="rounded-full">
                Cancel
              </Button>
              <Button type="submit" disabled={formLoading} className="rounded-full shadow-md">
                {formLoading ? "Creating..." : "Save Role"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </div>
  );
}
