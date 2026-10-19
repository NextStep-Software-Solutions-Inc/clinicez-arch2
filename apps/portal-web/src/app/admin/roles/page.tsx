"use client";

import React, { useEffect, useState } from "react";
import { useAdmin } from "../AdminLayoutClient";
import { adminService, AdminRoleDto, PermissionDefinitionDto } from "@/services/admin.service";
import { ADMIN_PERMISSIONS, DEFAULT_PERMISSION_DEFINITIONS } from "@/constants/permissions";
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
  IconCircleX,
  IconEdit,
  IconTrash,
  IconInfoCircle,
  IconAlertCircle
} from "@tabler/icons-react";

const FALLBACK_PERMISSIONS: PermissionDefinitionDto[] = DEFAULT_PERMISSION_DEFINITIONS as unknown as PermissionDefinitionDto[];

export default function AdminRolesPage() {
  const { hasPermission, refreshAdmin } = useAdmin();
  const [roles, setRoles] = useState<AdminRoleDto[]>([]);
  const [availablePermissions, setAvailablePermissions] = useState<PermissionDefinitionDto[]>(FALLBACK_PERMISSIONS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog and form states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<AdminRoleDto | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    permissions: [] as string[]
  });

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<AdminRoleDto | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const canManage = hasPermission(ADMIN_PERMISSIONS.MANAGE_ROLES);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [rolesData, permsData] = await Promise.all([
        adminService.getRoles(),
        adminService.getPermissions().catch(() => FALLBACK_PERMISSIONS)
      ]);
      setRoles(rolesData);
      if (permsData && permsData.length > 0) {
        setAvailablePermissions(permsData);
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || "Failed to load roles");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!hasPermission(ADMIN_PERMISSIONS.MANAGE_ROLES)) {
      setError("Unauthorized access. You do not have permissions to manage administrative roles.");
      setLoading(false);
      return;
    }
    loadData();
  }, [hasPermission]);

  const handleOpenCreate = () => {
    setEditingRole(null);
    setFormData({
      name: "",
      description: "",
      permissions: []
    });
    setDialogOpen(true);
  };

  const handleOpenEdit = (role: AdminRoleDto) => {
    setEditingRole(role);
    setFormData({
      name: role.name,
      description: role.description || "",
      permissions: role.name === "Super Admin" 
        ? availablePermissions.map(p => p.token)
        : [...role.permissions]
    });
    setDialogOpen(true);
  };

  const handleOpenDelete = (role: AdminRoleDto) => {
    setRoleToDelete(role);
    setDeleteDialogOpen(true);
  };

  const handlePermissionToggle = (token: string, checked: boolean) => {
    if (editingRole?.name === "Super Admin") return;
    setFormData(prev => {
      const perms = checked 
        ? [...prev.permissions, token] 
        : prev.permissions.filter(p => p !== token);
      return { ...prev, permissions: perms };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error("Role Name is required.");
      return;
    }

    if (formData.permissions.length === 0 && editingRole?.name !== "Super Admin") {
      toast.error("Please select at least one permission scope for this role.");
      return;
    }

    try {
      setFormLoading(true);
      if (editingRole) {
        await adminService.updateRole(editingRole.id, formData);
        toast.success(`Role "${formData.name}" updated successfully!`);
      } else {
        await adminService.createRole(formData);
        toast.success("Custom role created successfully!");
      }
      setDialogOpen(false);
      loadData();
      await refreshAdmin?.();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err.message || "Failed to save role");
    } finally {
      setFormLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!roleToDelete) return;
    try {
      setDeleteLoading(true);
      await adminService.deleteRole(roleToDelete.id);
      toast.success(`Role "${roleToDelete.name}" deleted successfully!`);
      setDeleteDialogOpen(false);
      setRoleToDelete(null);
      loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err.message || "Failed to delete role");
    } finally {
      setDeleteLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <IconLoader className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading portal roles and permission registry...</p>
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
            Configure platform administrative profiles, customize permission scopes, and adjust role authorities.
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
                <TableHead className="py-4 font-bold text-xs uppercase tracking-wider text-center">Scope Size</TableHead>
                {canManage && (
                  <TableHead className="pr-6 py-4 font-bold text-xs uppercase tracking-wider text-right">Actions</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((r) => {
                const isSuperAdmin = r.name === "Super Admin";
                return (
                  <TableRow key={r.id} className="hover:bg-slate-50/30 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="pl-6 py-4 font-bold text-sm text-slate-800 dark:text-slate-200">
                      <div className="flex items-center gap-2.5">
                        <IconShield className={`h-4.5 w-4.5 ${isSuperAdmin ? "text-amber-500" : "text-primary"}`} />
                        <span>{r.name}</span>
                        {isSuperAdmin && (
                          <Badge variant="secondary" className="text-[10px] bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-200">
                            Built-in
                          </Badge>
                        )}
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
                    <td className="py-4 text-center text-xs font-bold text-slate-700 dark:text-slate-300">
                      {r.permissions.length} keys
                    </td>
                    {canManage && (
                      <td className="pr-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEdit(r)}
                            className="h-8 px-2.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-primary"
                          >
                            <IconEdit className="h-3.5 w-3.5 mr-1" />
                            Edit
                          </Button>
                          {!isSuperAdmin && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenDelete(r)}
                              className="h-8 px-2.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                            >
                              <IconTrash className="h-3.5 w-3.5 mr-1" />
                              Delete
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Add / Edit Role Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto rounded-3xl">
          <DialogHeader>
            <DialogTitle>
              {editingRole ? `Edit Role: ${editingRole.name}` : "Create Custom Access Profile"}
            </DialogTitle>
            <DialogDescription>
              {editingRole 
                ? "Modify the role's title, description, and assigned permission scopes." 
                : "Specify a name, short summary, and configure explicit access tokens for this role."}
            </DialogDescription>
          </DialogHeader>

          {editingRole?.name === "Super Admin" && (
            <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-200 text-xs">
              <IconInfoCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <p>
                <strong>System Notice:</strong> The Super Admin role inherently inherits all system permissions (<code className="font-mono">Permissions.All</code>) across the platform to safeguard administration.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5 pt-2">
            <div className="space-y-4">
              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Role Title *</label>
                <Input
                  required
                  placeholder="e.g. Compliance Officer"
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  disabled={editingRole?.name === "Super Admin"}
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
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                    Scope Authorization Permissions ({formData.permissions.length} selected)
                  </label>
                  {editingRole?.name !== "Super Admin" && (
                    <div className="flex gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, permissions: availablePermissions.map(p => p.token) }))}
                        className="text-primary hover:underline font-medium text-[11px]"
                      >
                        Select All
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, permissions: [] }))}
                        className="text-muted-foreground hover:underline font-medium text-[11px]"
                      >
                        Clear All
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-3 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 bg-slate-50/20 max-h-72 overflow-y-auto">
                  {availablePermissions.map((p) => {
                    const isSuper = editingRole?.name === "Super Admin";
                    const isChecked = isSuper || formData.permissions.includes(p.token);
                    return (
                      <div key={p.token} className="flex items-start gap-3 group">
                        <Checkbox
                          id={`perm-${p.token}`}
                          checked={isChecked}
                          disabled={isSuper}
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
                            {p.description}
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
                {formLoading ? "Saving..." : editingRole ? "Update Role" : "Create Role"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <div className="flex items-center gap-2 text-destructive mb-1">
              <IconAlertCircle className="h-5 w-5" />
              <DialogTitle>Delete Role</DialogTitle>
            </div>
            <DialogDescription>
              Are you sure you want to delete role <strong>"{roleToDelete?.name}"</strong>? Any permissions granted through this role will no longer be available.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => setDeleteDialogOpen(false)} className="rounded-full">
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteLoading}
              onClick={handleConfirmDelete}
              className="rounded-full shadow-md"
            >
              {deleteLoading ? "Deleting..." : "Confirm Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
