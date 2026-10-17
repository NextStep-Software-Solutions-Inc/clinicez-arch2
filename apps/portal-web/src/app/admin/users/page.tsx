"use client";

import React, { useEffect, useState } from "react";
import { useAdmin } from "../AdminLayoutClient";
import { adminService, AdminUserDto, AdminRoleDto } from "@/services/admin.service";
import { ADMIN_PERMISSIONS } from "@/constants/permissions";
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

import { 
  IconUsers, 
  IconPlus, 
  IconLoader, 
  IconEdit, 
  IconTrash, 
  IconCircleCheck, 
  IconAlertCircle, 
  IconCircleX 
} from "@tabler/icons-react";

export default function AdminUsersPage() {
  const { hasPermission } = useAdmin();
  const [users, setUsers] = useState<AdminUserDto[]>([]);
  const [roles, setRoles] = useState<AdminRoleDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog and form states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUserDto | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    roleId: "",
    isActive: true
  });

  const canManage = hasPermission(ADMIN_PERMISSIONS.MANAGE_ADMINS);

  const loadData = async () => {
    try {
      setLoading(true);
      const [fetchedUsers, fetchedRoles] = await Promise.all([
        adminService.getUsers(),
        adminService.getRoles()
      ]);
      setUsers(fetchedUsers);
      setRoles(fetchedRoles);
    } catch (err: any) {
      setError(err.message || "Failed to load admin users data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!hasPermission(ADMIN_PERMISSIONS.MANAGE_ADMINS)) {
      setError("Unauthorized access");
      setLoading(false);
      return;
    }
    loadData();
  }, [hasPermission]);

  const handleOpenCreate = () => {
    setEditingUser(null);
    setFormData({
      fullName: "",
      email: "",
      roleId: roles[0]?.id || "",
      isActive: true
    });
    setDialogOpen(true);
  };

  const handleOpenEdit = (user: AdminUserDto) => {
    setEditingUser(user);
    setFormData({
      fullName: user.fullName,
      email: user.email,
      roleId: user.roleId,
      isActive: user.isActive
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fullName || !formData.email || !formData.roleId) {
      toast.error("Please fill in all required fields.");
      return;
    }

    try {
      setFormLoading(true);
      if (editingUser) {
        await adminService.updateUser(editingUser.id, formData);
        toast.success("Admin user account updated successfully!");
      } else {
        await adminService.createUser(formData);
        toast.success("Admin user invited successfully!");
      }
      setDialogOpen(false);
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to save admin user");
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (user: AdminUserDto) => {
    if (!confirm(`Are you sure you want to delete administrative account for ${user.fullName}?`)) return;

    try {
      await adminService.deleteUser(user.id);
      toast.success("Admin user deleted successfully.");
      setUsers(prev => prev.filter(u => u.id !== user.id));
    } catch (err: any) {
      toast.error(err.message || "Failed to delete admin user");
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <IconLoader className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading admin user profiles...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/20 bg-destructive/5 text-destructive p-8 text-center max-w-xl mx-auto rounded-3xl">
        <IconCircleX className="h-12 w-12 mx-auto mb-4" />
        <CardTitle className="text-lg font-bold">Error Accessing Admin Users</CardTitle>
        <p className="text-sm mt-2 opacity-90 leading-relaxed">{error}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Admin User Accounts</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Invite and manage operational administrators and support staff profiles.
          </p>
        </div>
        {canManage && (
          <Button onClick={handleOpenCreate} className="rounded-full shadow-md">
            <IconPlus className="h-4.5 w-4.5 mr-1" />
            Invite Admin User
          </Button>
        )}
      </div>

      {/* Main Table */}
      <Card className="rounded-3xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50/50 dark:bg-slate-900/50">
              <TableRow>
                <TableHead className="pl-6 py-4 font-bold text-xs uppercase tracking-wider">Full Name</TableHead>
                <TableHead className="py-4 font-bold text-xs uppercase tracking-wider">Email Address</TableHead>
                <TableHead className="py-4 font-bold text-xs uppercase tracking-wider">Assigned Role</TableHead>
                <TableHead className="py-4 font-bold text-xs uppercase tracking-wider">Status</TableHead>
                <TableHead className="py-4 font-bold text-xs uppercase tracking-wider">Added On</TableHead>
                <TableHead className="pr-6 py-4 font-bold text-xs uppercase tracking-wider text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id} className="hover:bg-slate-50/30 dark:hover:bg-slate-800/20 transition-colors">
                  <td className="pl-6 py-4 font-bold text-sm text-slate-800 dark:text-slate-200">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-slate-600 dark:text-slate-400">
                        {u.fullName.split(" ").map(w => w[0]).join("")}
                      </div>
                      {u.fullName}
                    </div>
                  </td>
                  <td className="py-4 text-xs font-mono text-muted-foreground">
                    {u.email}
                  </td>
                  <td className="py-4">
                    <Badge className="font-bold text-[10px] uppercase rounded-full">
                      {u.role?.name || "No Role"}
                    </Badge>
                  </td>
                  <td className="py-4">
                    {u.isActive ? (
                      <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50/50 rounded-full flex items-center gap-1 w-fit font-bold text-[10px]">
                        <IconCircleCheck className="h-3.5 w-3.5" />
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50/50 rounded-full flex items-center gap-1 w-fit font-bold text-[10px]">
                        <IconCircleX className="h-3.5 w-3.5" />
                        Suspended
                      </Badge>
                    )}
                  </td>
                  <td className="py-4 text-xs text-muted-foreground font-semibold">
                    {new Date(u.createdAt).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric"
                    })}
                  </td>
                  <td className="pr-6 py-4 text-right">
                    {canManage && (
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenEdit(u)}
                          className="h-8 w-8 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                        >
                          <IconEdit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(u)}
                          className="h-8 w-8 rounded-xl text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <IconTrash className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </td>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Invite / Edit Admin User Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle>{editingUser ? "Modify Admin User Details" : "Invite Administrative Operator"}</DialogTitle>
            <DialogDescription>
              Assign standard or custom roles to authorize system operations.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="space-y-4">
              {/* Full Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Full Name *</label>
                <Input
                  required
                  placeholder="e.g. Wave Ambray"
                  value={formData.fullName}
                  onChange={e => setFormData(prev => ({ ...prev, fullName: e.target.value }))}
                  className="rounded-xl"
                />
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Email Address *</label>
                <Input
                  required
                  type="email"
                  placeholder="e.g. user@example.com"
                  value={formData.email}
                  onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  className="rounded-xl"
                />
              </div>

              {/* Role */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Assign Authorization Role *</label>
                <select
                  value={formData.roleId}
                  onChange={e => setFormData(prev => ({ ...prev, roleId: e.target.value }))}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {roles.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>

              {/* Active Toggle (Only when editing) */}
              {editingUser && (
                <div className="flex items-center justify-between p-3 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/20">
                  <div className="space-y-0.5">
                    <span className="block text-xs font-bold text-slate-700 dark:text-slate-200">Account Active Status</span>
                    <span className="block text-[10px] text-muted-foreground">Suspend this profile to instantly block API access.</span>
                  </div>
                  <select
                    value={formData.isActive ? "true" : "false"}
                    onChange={e => setFormData(prev => ({ ...prev, isActive: e.target.value === "true" }))}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold focus-visible:outline-hidden"
                  >
                    <option value="true">Active</option>
                    <option value="false">Suspended</option>
                  </select>
                </div>
              )}
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="rounded-full">
                Cancel
              </Button>
              <Button type="submit" disabled={formLoading} className="rounded-full shadow-md">
                {formLoading ? "Saving..." : editingUser ? "Update User" : "Invite User"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </div>
  );
}
