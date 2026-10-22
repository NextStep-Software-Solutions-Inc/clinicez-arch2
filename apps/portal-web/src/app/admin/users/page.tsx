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
  IconCircleX,
  IconCopy,
  IconMail,
  IconMailForward,
  IconBan,
  IconPlayerPause,
  IconPlayerPlay,
  IconClock,
  IconCheck
} from "@tabler/icons-react";

export const resolveAdminDisplayStatus = (u: {
  status?: string;
  displayStatus?: string;
  invitationExpiresAt?: string | null;
  isActive?: boolean;
}): string => {
  if (u.displayStatus) return u.displayStatus;
  if (u.status === "Invited" && u.invitationExpiresAt && new Date(u.invitationExpiresAt) < new Date()) {
    return "Expired";
  }
  return u.status || (u.isActive ? "Active" : "Suspended");
};

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
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<{
    fullName: string;
    email: string;
    roleId: string;
    isActive: boolean;
    deliveryMode: "email" | "link";
  }>({
    fullName: "",
    email: "",
    roleId: "",
    isActive: true,
    deliveryMode: "email"
  });

  // Post-invite link success modal
  const [createdInviteModal, setCreatedInviteModal] = useState<{
    open: boolean;
    fullName: string;
    email: string;
    role: string;
    inviteUrl: string;
  } | null>(null);

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
      isActive: true,
      deliveryMode: "email"
    });
    setDialogOpen(true);
  };

  const handleOpenEdit = (user: AdminUserDto) => {
    setEditingUser(user);
    setFormData({
      fullName: user.fullName,
      email: user.email,
      roleId: user.roleId,
      isActive: user.isActive,
      deliveryMode: "email"
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
        await adminService.updateUser(editingUser.id, {
          fullName: formData.fullName,
          email: formData.email,
          roleId: formData.roleId,
          isActive: formData.isActive
        });
        toast.success("Admin user account updated successfully!");
        setDialogOpen(false);
        loadData();
      } else {
        const res = await adminService.inviteUser({
          email: formData.email,
          fullName: formData.fullName,
          roleId: formData.roleId,
          deliveryMode: formData.deliveryMode
        });
        toast.success("Admin invitation created successfully!");
        setDialogOpen(false);
        loadData();

        const roleObj = roles.find(r => r.id === formData.roleId);
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const linkUrl = res.inviteUrl || (res.invitationToken ? `${origin}/admin/invitations/${res.invitationToken}` : "");

        if (linkUrl) {
          setCreatedInviteModal({
            open: true,
            fullName: res.fullName,
            email: res.email,
            role: roleObj?.name || "Admin",
            inviteUrl: linkUrl
          });
        }
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to save admin user");
    } finally {
      setFormLoading(false);
    }
  };

  const handleCopyLink = (u: AdminUserDto) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = u.inviteUrl || (u.invitationToken ? `${origin}/admin/invitations/${u.invitationToken}` : "");
    if (!url) {
      toast.error("Invitation link is not available for this account.");
      return;
    }
    navigator.clipboard.writeText(url);
    toast.success("Invitation link copied to clipboard!");
  };

  const handleResend = async (u: AdminUserDto) => {
    try {
      setActionLoadingId(u.id);
      const res = await adminService.resendInvitation(u.id);
      toast.success(`Invitation resent to ${u.email}!`);
      loadData();

      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const linkUrl = res.inviteUrl || (res.invitationToken ? `${origin}/admin/invitations/${res.invitationToken}` : "");
      if (linkUrl) {
        setCreatedInviteModal({
          open: true,
          fullName: res.fullName,
          email: res.email,
          role: u.role?.name || "Admin",
          inviteUrl: linkUrl
        });
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to resend invitation");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRevoke = async (u: AdminUserDto) => {
    const status = resolveAdminDisplayStatus(u);
    const msg =
      status === "Invited" || status === "Expired"
        ? `Are you sure you want to revoke the pending invitation for ${u.fullName}?`
        : `Are you sure you want to revoke admin access for ${u.fullName}? Their status will be marked as Revoked.`;
    if (!confirm(msg)) return;
    try {
      setActionLoadingId(u.id);
      await adminService.revokeInvitation(u.id);
      toast.success("Admin access / invitation revoked.");
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to revoke invitation");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReinvite = async (u: AdminUserDto) => {
    try {
      setActionLoadingId(u.id);
      const res = await adminService.inviteUser({
        email: u.email,
        fullName: u.fullName,
        roleId: u.roleId,
        deliveryMode: "email"
      });
      toast.success(`Re-invited ${u.fullName} and sent a new invitation email!`);
      loadData();

      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const linkUrl = res.inviteUrl || (res.invitationToken ? `${origin}/admin/invitations/${res.invitationToken}` : "");
      if (linkUrl) {
        setCreatedInviteModal({
          open: true,
          fullName: res.fullName,
          email: res.email,
          role: u.role?.name || "Admin",
          inviteUrl: linkUrl
        });
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to re-invite admin user");
    } finally {
      setActionLoadingId(null);
    }
  };

  const existingEmailAdmin = React.useMemo(() => {
    if (editingUser) return null;
    const normalized = formData.email.trim().toLowerCase();
    if (!normalized) return null;
    return users.find(u => u.email.trim().toLowerCase() === normalized) || null;
  }, [editingUser, formData.email, users]);
  const existingEmailAdminStatus = existingEmailAdmin ? resolveAdminDisplayStatus(existingEmailAdmin) : null;

  const handleSuspend = async (u: AdminUserDto) => {
    if (!confirm(`Are you sure you want to suspend admin access for ${u.fullName}?`)) return;
    try {
      setActionLoadingId(u.id);
      await adminService.suspendUser(u.id);
      toast.success("Admin user suspended.");
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to suspend admin user");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReactivate = async (u: AdminUserDto) => {
    try {
      setActionLoadingId(u.id);
      await adminService.reactivateUser(u.id);
      toast.success("Admin user reactivated.");
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to reactivate admin user");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDelete = async (user: AdminUserDto) => {
    if (!confirm(`Are you sure you want to permanently delete administrative account for ${user.fullName}?`)) return;

    try {
      await adminService.deleteUser(user.id);
      toast.success("Admin user deleted successfully.");
      setUsers(prev => prev.filter(u => u.id !== user.id));
    } catch (err: any) {
      toast.error(err.message || "Failed to delete admin user");
    }
  };

  const renderStatusBadge = (user: AdminUserDto) => {
    const status = resolveAdminDisplayStatus(user);

    switch (status) {
      case "Active":
        return (
          <Badge variant="outline" className="text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/40 rounded-full flex items-center gap-1 w-fit font-bold text-[10px]">
            <IconCircleCheck className="h-3.5 w-3.5" />
            Active
          </Badge>
        );
      case "Invited":
        return (
          <Badge variant="outline" className="text-sky-700 dark:text-sky-400 border-sky-200 dark:border-sky-800 bg-sky-50/50 dark:bg-sky-950/40 rounded-full flex items-center gap-1 w-fit font-bold text-[10px]">
            <IconClock className="h-3.5 w-3.5" />
            Invited
          </Badge>
        );
      case "Expired":
        return (
          <Badge variant="outline" className="text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/40 rounded-full flex items-center gap-1 w-fit font-bold text-[10px]">
            <IconAlertCircle className="h-3.5 w-3.5" />
            Expired
          </Badge>
        );
      case "Suspended":
        return (
          <Badge variant="outline" className="text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-950/40 rounded-full flex items-center gap-1 w-fit font-bold text-[10px]">
            <IconCircleX className="h-3.5 w-3.5" />
            Suspended
          </Badge>
        );
      case "Revoked":
        return (
          <Badge variant="outline" className="text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-800/40 rounded-full flex items-center gap-1 w-fit font-bold text-[10px]">
            <IconBan className="h-3.5 w-3.5" />
            Revoked
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="rounded-full text-[10px]">
            {status}
          </Badge>
        );
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
            Invite and manage operational administrators, governance roles, and support staff profiles.
          </p>
        </div>
        {canManage && (
          <Button onClick={handleOpenCreate} className="rounded-full shadow-md gap-1.5">
            <IconPlus className="h-4.5 w-4.5" />
            <span>Invite Admin User</span>
          </Button>
        )}
      </div>

      {/* Main Table */}
      <Card className="rounded-3xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
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
              {users.map((u) => {
                const status = resolveAdminDisplayStatus(u);
                const isBusy = actionLoadingId === u.id;

                return (
                  <TableRow key={u.id} className="hover:bg-slate-50/30 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="pl-6 py-4 font-bold text-sm text-slate-800 dark:text-slate-200">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-slate-600 dark:text-slate-400">
                          {u.fullName.split(" ").map(w => w[0]).join("")}
                        </div>
                        <div>
                          <div>{u.fullName}</div>
                          {u.clerkUserId && (
                            <div className="text-[10px] text-muted-foreground font-mono font-normal">
                              Linked: {u.clerkUserId.substring(0, 12)}...
                            </div>
                          )}
                        </div>
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
                      {renderStatusBadge(u)}
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
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Status-aware Actions */}
                          {status === "Invited" && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleCopyLink(u)}
                                className="h-7 px-2 text-xs rounded-lg gap-1"
                                title="Copy Invitation Link"
                              >
                                <IconCopy className="h-3.5 w-3.5" />
                                <span>Copy Link</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={isBusy}
                                onClick={() => handleResend(u)}
                                className="h-7 px-2 text-xs rounded-lg gap-1 text-sky-600 hover:text-sky-700 hover:bg-sky-50 dark:hover:bg-sky-950/30"
                                title="Resend Invitation Email"
                              >
                                <IconMailForward className="h-3.5 w-3.5" />
                                <span>Resend</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={isBusy}
                                onClick={() => handleRevoke(u)}
                                className="h-7 px-2 text-xs rounded-lg gap-1 text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                                title="Revoke Invitation"
                              >
                                <IconBan className="h-3.5 w-3.5" />
                                <span>Revoke</span>
                              </Button>
                            </>
                          )}

                          {status === "Expired" && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={isBusy}
                                onClick={() => handleResend(u)}
                                className="h-7 px-2 text-xs rounded-lg gap-1 border-amber-300 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                                title="Renew Token & Resend Invitation"
                              >
                                <IconMailForward className="h-3.5 w-3.5" />
                                <span>Resend</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={isBusy}
                                onClick={() => handleRevoke(u)}
                                className="h-7 px-2 text-xs rounded-lg gap-1 text-slate-500 hover:text-rose-600 hover:bg-rose-50"
                                title="Revoke Expired Invitation"
                              >
                                <IconBan className="h-3.5 w-3.5" />
                                <span>Revoke</span>
                              </Button>
                            </>
                          )}

                          {status === "Active" && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleOpenEdit(u)}
                                className="h-8 w-8 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                                title="Edit Details"
                              >
                                <IconEdit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={isBusy}
                                onClick={() => handleSuspend(u)}
                                className="h-7 px-2 text-xs rounded-lg gap-1 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                title="Suspend Account"
                              >
                                <IconPlayerPause className="h-3.5 w-3.5" />
                                <span>Suspend</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={isBusy}
                                onClick={() => handleRevoke(u)}
                                className="h-7 px-2 text-xs rounded-lg gap-1 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                                title="Revoke Admin Access"
                              >
                                <IconBan className="h-3.5 w-3.5" />
                                <span>Revoke</span>
                              </Button>
                            </>
                          )}

                          {status === "Suspended" && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={isBusy}
                                onClick={() => handleReactivate(u)}
                                className="h-7 px-2 text-xs rounded-lg gap-1 text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                                title="Reactivate Account"
                              >
                                <IconPlayerPlay className="h-3.5 w-3.5" />
                                <span>Reactivate</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={isBusy}
                                onClick={() => handleRevoke(u)}
                                className="h-7 px-2 text-xs rounded-lg gap-1 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                                title="Revoke Admin Access"
                              >
                                <IconBan className="h-3.5 w-3.5" />
                                <span>Revoke</span>
                              </Button>
                            </>
                          )}

                          {status === "Revoked" && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={isBusy}
                                onClick={() => handleReinvite(u)}
                                className="h-7 px-2 text-xs rounded-lg gap-1 text-sky-600 border-sky-200 hover:bg-sky-50 dark:hover:bg-sky-950/30"
                                title="Send a fresh 7-day invitation"
                              >
                                <IconMailForward className="h-3.5 w-3.5" />
                                <span>Re-invite</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(u)}
                                className="h-7 px-2 text-xs rounded-lg gap-1 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                                title="Permanently Delete Admin Profile"
                              >
                                <IconTrash className="h-3.5 w-3.5" />
                                <span>Remove</span>
                              </Button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </TableRow>
                );
              })}
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
                {existingEmailAdmin && existingEmailAdminStatus === "Active" && (
                  <div className="mt-1.5 p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2">
                    <IconAlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <div>
                      <strong>Existing Active Admin:</strong> {existingEmailAdmin.fullName} ({existingEmailAdmin.email}) is already an active platform administrator ({existingEmailAdmin.role?.name || "Admin"}).
                    </div>
                  </div>
                )}
                {existingEmailAdmin && (existingEmailAdminStatus === "Invited" || existingEmailAdminStatus === "Expired") && (
                  <div className="mt-1.5 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs space-y-2">
                    <div className="flex items-start gap-2">
                      <IconClock className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>
                        <strong>{existingEmailAdminStatus === "Expired" ? "Expired" : "Pending"} Invitation Detected:</strong> {existingEmailAdmin.fullName} ({existingEmailAdmin.email}) already has {existingEmailAdminStatus === "Expired" ? "an expired" : "a pending"} invitation ({existingEmailAdmin.role?.name || "Admin"}).
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pl-6">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={actionLoadingId === existingEmailAdmin.id}
                        onClick={async () => {
                          setDialogOpen(false);
                          await handleResend(existingEmailAdmin);
                        }}
                        className="h-7 px-2.5 text-[11px] font-semibold rounded-lg gap-1 bg-white dark:bg-slate-900"
                      >
                        <IconMailForward className="h-3 w-3" />
                        <span>Resend Invitation Instead</span>
                      </Button>
                      {existingEmailAdminStatus === "Invited" && existingEmailAdmin.invitationToken && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleCopyLink(existingEmailAdmin)}
                          className="h-7 px-2.5 text-[11px] font-semibold rounded-lg gap-1 bg-white dark:bg-slate-900"
                        >
                          <IconCopy className="h-3 w-3" />
                          <span>Copy Link</span>
                        </Button>
                      )}
                    </div>
                  </div>
                )}
                {existingEmailAdmin && existingEmailAdminStatus === "Suspended" && (
                  <div className="mt-1.5 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs space-y-2">
                    <div className="flex items-start gap-2">
                      <IconAlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>
                        <strong>Suspended Account Detected:</strong> {existingEmailAdmin.fullName} ({existingEmailAdmin.email}) is currently suspended.
                      </div>
                    </div>
                    <div className="pl-6">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={actionLoadingId === existingEmailAdmin.id}
                        onClick={async () => {
                          setDialogOpen(false);
                          await handleReactivate(existingEmailAdmin);
                        }}
                        className="h-7 px-2.5 text-[11px] font-semibold rounded-lg gap-1 bg-white dark:bg-slate-900"
                      >
                        <IconPlayerPlay className="h-3 w-3" />
                        <span>Reactivate Account Instead</span>
                      </Button>
                    </div>
                  </div>
                )}
                {existingEmailAdmin && existingEmailAdminStatus === "Revoked" && (
                  <div className="mt-1.5 p-2.5 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300 text-xs flex items-start gap-2">
                    <IconMailForward className="h-4 w-4 shrink-0 mt-0.5" />
                    <div>
                      <strong>Previously Revoked Admin:</strong> {existingEmailAdmin.fullName} ({existingEmailAdmin.email}) was previously revoked. Submitting this form will re-invite them with a fresh 7-day invitation token.
                    </div>
                  </div>
                )}
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

              {/* Delivery Mode Choice (Only when inviting) */}
              {!editingUser && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Delivery Method</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, deliveryMode: "email" }))}
                      className={`p-3 rounded-2xl border text-left transition-all ${
                        formData.deliveryMode === "email"
                          ? "border-primary bg-primary/10 text-primary font-bold shadow-xs"
                          : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-1 font-semibold text-xs">
                        <IconMail className="h-4 w-4" />
                        <span>Send Email</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground font-normal">Dispatches invitation email automatically via Interop.</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, deliveryMode: "link" }))}
                      className={`p-3 rounded-2xl border text-left transition-all ${
                        formData.deliveryMode === "link"
                          ? "border-primary bg-primary/10 text-primary font-bold shadow-xs"
                          : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-1 font-semibold text-xs">
                        <IconCopy className="h-4 w-4" />
                        <span>Copy Link Only</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground font-normal">Generates secure 7-day token for manual sharing.</p>
                    </button>
                  </div>
                </div>
              )}

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
              <Button
                type="submit"
                disabled={
                  formLoading ||
                  (!editingUser && !!existingEmailAdmin && existingEmailAdminStatus !== "Revoked")
                }
                className="rounded-full shadow-md"
              >
                {formLoading ? "Saving..." : editingUser ? "Update User" : "Invite User"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Post-Invite Link Success Dialog */}
      <Dialog open={!!createdInviteModal?.open} onOpenChange={(open) => !open && setCreatedInviteModal(null)}>
        <DialogContent className="sm:max-w-lg rounded-3xl">
          <DialogHeader className="flex flex-col items-center text-center sm:items-center sm:text-center">
            <div className="size-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-1">
              <IconCheck className="h-6 w-6" />
            </div>
            <DialogTitle className="text-xl font-bold text-slate-900 dark:text-slate-100 text-center">
              Admin Invitation Created!
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 text-center max-w-sm">
              <strong>{createdInviteModal?.fullName}</strong> ({createdInviteModal?.email}) has been invited as <strong>{createdInviteModal?.role}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <p className="text-xs text-slate-600 dark:text-slate-400">
              The invitation link has been generated. You can share this link directly via Slack, WhatsApp, or email:
            </p>

            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={createdInviteModal?.inviteUrl || ""}
                className="h-9 text-xs font-mono rounded-xl bg-slate-50 dark:bg-slate-900 select-all"
              />
              <Button
                size="sm"
                onClick={() => {
                  if (createdInviteModal?.inviteUrl) {
                    navigator.clipboard.writeText(createdInviteModal.inviteUrl);
                    toast.success("Link copied to clipboard!");
                  }
                }}
                className="h-9 px-3 text-xs font-semibold rounded-xl gap-1.5 shrink-0"
              >
                <IconCopy className="h-3.5 w-3.5" />
                <span>Copy</span>
              </Button>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-500">
              &bull; This invitation token is valid for <strong>7 days</strong>.<br />
              &bull; The invitee can sign in or create their personal account to immediately activate their administrative profile.
            </div>
          </div>

          <DialogFooter className="pt-2 sm:justify-end">
            <Button
              type="button"
              onClick={() => setCreatedInviteModal(null)}
              className="w-full sm:w-auto rounded-xl text-xs font-semibold"
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
