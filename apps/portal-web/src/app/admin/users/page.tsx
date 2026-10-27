"use client";

import React, { useEffect, useState } from "react";
import { useAdmin } from "../AdminLayoutClient";
import { adminService, AdminUserDto, AdminRoleDto } from "@/services/admin.service";
import { ADMIN_PERMISSIONS } from "@/constants/permissions";
import {
  getAdminUserActionRestriction,
  isSelfAdminUser,
  SELF_ACTION_MESSAGES,
} from "@/lib/selfActionGuard";
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
  IconCheck,
  IconKey,
  IconLink
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

function extractAdminApiError(err: unknown, fallback: string): string {
  if (typeof err === "object" && err !== null) {
    const respData = (err as { response?: { data?: unknown } }).response?.data;
    if (typeof respData === "string" && respData.trim()) return respData;
    if (typeof respData === "object" && respData !== null) {
      const msg =
        (respData as { message?: string; Message?: string; detail?: string }).message ||
        (respData as { message?: string; Message?: string; detail?: string }).Message ||
        (respData as { message?: string; Message?: string; detail?: string }).detail;
      if (msg) return msg;
    }
    const errMsg = (err as { message?: string }).message;
    if (errMsg) return errMsg;
  }
  return fallback;
}

export default function AdminUsersPage() {
  const { admin, userId, hasPermission } = useAdmin();
  const currentAdminIdentity = React.useMemo(
    () => ({
      userId: userId ?? null,
      email: admin?.email ?? null,
    }),
    [userId, admin?.email]
  );
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

  // Revoke & Delete confirmation modals
  const [revokeTarget, setRevokeTarget] = useState<AdminUserDto | null>(null);
  const [submittingRevoke, setSubmittingRevoke] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminUserDto | null>(null);
  const [submittingDelete, setSubmittingDelete] = useState(false);

  // Reset Password Modal state
  const [resetTarget, setResetTarget] = useState<AdminUserDto | null>(null);
  const [resetMode, setResetMode] = useState<"email" | "link" | "password">("email");
  const [resetTempPassword, setResetTempPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [submittingReset, setSubmittingReset] = useState(false);
  const [resetResultModal, setResetResultModal] = useState<{
    open: boolean;
    fullName: string;
    email: string;
    deliveryMode: "email" | "link" | "password";
    resetUrl?: string;
    temporaryPassword?: string;
  } | null>(null);

  const canManage = hasPermission(ADMIN_PERMISSIONS.MANAGE_ADMINS);
  const isEditingSelf = React.useMemo(
    () => isSelfAdminUser(editingUser, currentAdminIdentity),
    [editingUser, currentAdminIdentity]
  );

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

    if (editingUser && isSelfAdminUser(editingUser, currentAdminIdentity) && !formData.isActive) {
      toast.error(SELF_ACTION_MESSAGES.adminSuspend);
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
    } catch (err: unknown) {
      toast.error(extractAdminApiError(err, "Failed to save admin user"));
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

  const handleRevoke = (u: AdminUserDto) => {
    if (isSelfAdminUser(u, currentAdminIdentity)) {
      toast.error(SELF_ACTION_MESSAGES.adminRevoke);
      return;
    }
    setRevokeTarget(u);
  };

  const handleRevokeConfirm = async () => {
    if (!revokeTarget) return;
    if (isSelfAdminUser(revokeTarget, currentAdminIdentity)) {
      toast.error(SELF_ACTION_MESSAGES.adminRevoke);
      setRevokeTarget(null);
      return;
    }
    try {
      setSubmittingRevoke(true);
      setActionLoadingId(revokeTarget.id);
      await adminService.revokeInvitation(revokeTarget.id);
      const status = resolveAdminDisplayStatus(revokeTarget);
      toast.success(
        status === "Invited" || status === "Expired"
          ? `Revoked invitation for ${revokeTarget.fullName}`
          : `Revoked admin access for ${revokeTarget.fullName}`
      );
      setRevokeTarget(null);
      loadData();
    } catch (err: unknown) {
      toast.error(extractAdminApiError(err, "Failed to revoke admin access"));
    } finally {
      setSubmittingRevoke(false);
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
    if (isSelfAdminUser(u, currentAdminIdentity)) {
      toast.error(SELF_ACTION_MESSAGES.adminSuspend);
      return;
    }
    if (!confirm(`Are you sure you want to suspend admin access for ${u.fullName}?`)) return;
    try {
      setActionLoadingId(u.id);
      await adminService.suspendUser(u.id);
      toast.success("Admin user suspended.");
      loadData();
    } catch (err: unknown) {
      toast.error(extractAdminApiError(err, "Failed to suspend admin user"));
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
    } catch (err: unknown) {
      toast.error(extractAdminApiError(err, "Failed to reactivate admin user"));
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDelete = (user: AdminUserDto) => {
    if (isSelfAdminUser(user, currentAdminIdentity)) {
      toast.error(SELF_ACTION_MESSAGES.adminDelete);
      return;
    }
    setDeleteTarget(user);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    if (isSelfAdminUser(deleteTarget, currentAdminIdentity)) {
      toast.error(SELF_ACTION_MESSAGES.adminDelete);
      setDeleteTarget(null);
      return;
    }
    try {
      setSubmittingDelete(true);
      setActionLoadingId(deleteTarget.id);
      await adminService.deleteUser(deleteTarget.id);
      toast.success(`Permanently removed ${deleteTarget.fullName} from platform admins.`);
      setUsers(prev => prev.filter(u => u.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err: unknown) {
      toast.error(extractAdminApiError(err, "Failed to delete admin user"));
    } finally {
      setSubmittingDelete(false);
      setActionLoadingId(null);
    }
  };

  const handleOpenResetPassword = (user: AdminUserDto) => {
    setResetTarget(user);
    setResetMode("email");
    setResetTempPassword("");
    setResetError(null);
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    setResetError(null);

    if (resetMode === "password" && resetTempPassword.trim().length < 8) {
      setResetError("Temporary password must be at least 8 characters.");
      return;
    }

    setSubmittingReset(true);
    try {
      const res = await adminService.resetUserPassword(resetTarget.id, {
        deliveryMode: resetMode,
        temporaryPassword: resetMode === "password" ? resetTempPassword : undefined,
      });

      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const fullResetUrl = res.resetToken
        ? `${origin}/reset-password/${res.resetToken}`
        : res.resetUrl || undefined;

      if (fullResetUrl) {
        navigator.clipboard.writeText(fullResetUrl);
      }

      const targetSnapshot = resetTarget;
      const tempPwdSnapshot = resetTempPassword;
      setResetTarget(null);

      setResetResultModal({
        open: true,
        fullName: targetSnapshot.fullName,
        email: targetSnapshot.email,
        deliveryMode: resetMode,
        resetUrl: fullResetUrl,
        temporaryPassword: resetMode === "password" ? tempPwdSnapshot : undefined,
      });

      if (resetMode === "email") {
        toast.success(`Password reset email sent to ${targetSnapshot.email}`);
      } else if (resetMode === "link") {
        toast.success("Password reset link generated and copied!");
      } else {
        toast.success(`Temporary password set for ${targetSnapshot.fullName}`);
      }

      loadData();
    } catch (err: any) {
      setResetError(err.response?.data?.message || err.message || "Failed to reset password.");
    } finally {
      setSubmittingReset(false);
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
                const restriction = getAdminUserActionRestriction(
                  { ...u, displayStatus: status },
                  currentAdminIdentity
                );

                return (
                  <TableRow key={u.id} className="hover:bg-slate-50/30 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="pl-6 py-4 font-bold text-sm text-slate-800 dark:text-slate-200">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-slate-600 dark:text-slate-400">
                          {u.fullName.split(" ").map(w => w[0]).join("")}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span>{u.fullName}</span>
                            {restriction.isSelf && (
                              <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4 font-medium shrink-0">
                                You
                              </Badge>
                            )}
                          </div>
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
                              <span
                                title={restriction.revokeTooltip}
                                className={!restriction.canRevoke ? "inline-flex cursor-not-allowed" : "inline-flex"}
                              >
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={isBusy || !restriction.canRevoke}
                                  onClick={() => handleRevoke(u)}
                                  className="h-7 px-2 text-xs rounded-lg gap-1 text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-40"
                                  title={restriction.revokeTooltip}
                                  aria-label={restriction.revokeTooltip}
                                >
                                  <IconBan className="h-3.5 w-3.5" />
                                  <span>Revoke</span>
                                </Button>
                              </span>
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
                              <span
                                title={restriction.revokeTooltip}
                                className={!restriction.canRevoke ? "inline-flex cursor-not-allowed" : "inline-flex"}
                              >
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={isBusy || !restriction.canRevoke}
                                  onClick={() => handleRevoke(u)}
                                  className="h-7 px-2 text-xs rounded-lg gap-1 text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-40"
                                  title={restriction.revokeTooltip}
                                  aria-label={restriction.revokeTooltip}
                                >
                                  <IconBan className="h-3.5 w-3.5" />
                                  <span>Revoke</span>
                                </Button>
                              </span>
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
                                variant="outline"
                                size="sm"
                                disabled={isBusy}
                                onClick={() => handleOpenResetPassword(u)}
                                className="h-7 px-2 text-xs rounded-lg gap-1"
                                title="Reset Password"
                              >
                                <IconKey className="h-3.5 w-3.5" />
                                <span>Reset Password</span>
                              </Button>
                              <span
                                title={restriction.suspendTooltip}
                                className={!restriction.canSuspend ? "inline-flex cursor-not-allowed" : "inline-flex"}
                              >
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={isBusy || !restriction.canSuspend}
                                  onClick={() => handleSuspend(u)}
                                  className="h-7 px-2 text-xs rounded-lg gap-1 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30 disabled:opacity-40"
                                  title={restriction.suspendTooltip}
                                  aria-label={restriction.suspendTooltip}
                                >
                                  <IconPlayerPause className="h-3.5 w-3.5" />
                                  <span>Suspend</span>
                                </Button>
                              </span>
                              <span
                                title={restriction.revokeTooltip}
                                className={!restriction.canRevoke ? "inline-flex cursor-not-allowed" : "inline-flex"}
                              >
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={isBusy || !restriction.canRevoke}
                                  onClick={() => handleRevoke(u)}
                                  className="h-7 px-2 text-xs rounded-lg gap-1 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-40"
                                  title={restriction.revokeTooltip}
                                  aria-label={restriction.revokeTooltip}
                                >
                                  <IconBan className="h-3.5 w-3.5" />
                                  <span>Revoke</span>
                                </Button>
                              </span>
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
                              <span
                                title={restriction.revokeTooltip}
                                className={!restriction.canRevoke ? "inline-flex cursor-not-allowed" : "inline-flex"}
                              >
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={isBusy || !restriction.canRevoke}
                                  onClick={() => handleRevoke(u)}
                                  className="h-7 px-2 text-xs rounded-lg gap-1 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-40"
                                  title={restriction.revokeTooltip}
                                  aria-label={restriction.revokeTooltip}
                                >
                                  <IconBan className="h-3.5 w-3.5" />
                                  <span>Revoke</span>
                                </Button>
                              </span>
                              <span
                                title={restriction.deleteTooltip}
                                className={!restriction.canDelete ? "inline-flex cursor-not-allowed" : "inline-flex"}
                              >
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={isBusy || !restriction.canDelete}
                                  onClick={() => handleDelete(u)}
                                  className="h-7 px-2 text-xs rounded-lg gap-1 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-40"
                                  title={restriction.deleteTooltip}
                                  aria-label={restriction.deleteTooltip}
                                >
                                  <IconTrash className="h-3.5 w-3.5" />
                                  <span>Remove</span>
                                </Button>
                              </span>
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
                              <span
                                title={restriction.deleteTooltip}
                                className={!restriction.canDelete ? "inline-flex cursor-not-allowed" : "inline-flex"}
                              >
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={isBusy || !restriction.canDelete}
                                  onClick={() => handleDelete(u)}
                                  className="h-7 px-2 text-xs rounded-lg gap-1 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-40"
                                  title={restriction.deleteTooltip}
                                  aria-label={restriction.deleteTooltip}
                                >
                                  <IconTrash className="h-3.5 w-3.5" />
                                  <span>Remove</span>
                                </Button>
                              </span>
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
                    <span className="block text-[10px] text-muted-foreground">
                      {isEditingSelf
                        ? SELF_ACTION_MESSAGES.adminSuspend
                        : "Suspend this profile to instantly block API access."}
                    </span>
                  </div>
                  <select
                    value={formData.isActive ? "true" : "false"}
                    disabled={isEditingSelf}
                    title={isEditingSelf ? SELF_ACTION_MESSAGES.adminSuspend : "Account Active Status"}
                    onChange={e => setFormData(prev => ({ ...prev, isActive: e.target.value === "true" }))}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold focus-visible:outline-hidden disabled:opacity-50 disabled:cursor-not-allowed"
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

      {/* Reset Password Dialog */}
      <Dialog open={!!resetTarget} onOpenChange={(open) => !open && setResetTarget(null)}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconKey className="h-5 w-5 text-primary" />
              Reset Admin User Password
            </DialogTitle>
            <DialogDescription>
              Choose how to reset the password for <strong>{resetTarget?.fullName}</strong> ({resetTarget?.email}).
            </DialogDescription>
          </DialogHeader>

          {resetError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2">
              <IconAlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{resetError}</span>
            </div>
          )}

          <form onSubmit={handleResetPasswordSubmit} className="space-y-4 pt-1">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Reset Method
              </label>
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => setResetMode("email")}
                  className={`p-3 rounded-2xl border text-left transition-all ${
                    resetMode === "email"
                      ? "border-primary bg-primary/10 text-primary font-bold shadow-xs"
                      : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900"
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-0.5 font-semibold text-xs">
                    <IconMail className="h-4 w-4" />
                    <span>Email Reset Link (Recommended)</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground font-normal">
                    Emails a secure 7-day self-service password reset link to {resetTarget?.email}.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setResetMode("link")}
                  className={`p-3 rounded-2xl border text-left transition-all ${
                    resetMode === "link"
                      ? "border-primary bg-primary/10 text-primary font-bold shadow-xs"
                      : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900"
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-0.5 font-semibold text-xs">
                    <IconLink className="h-4 w-4" />
                    <span>Copy Reset Link Only</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground font-normal">
                    Generates a 7-day reset link to copy and share manually (no email sent).
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setResetMode("password")}
                  className={`p-3 rounded-2xl border text-left transition-all ${
                    resetMode === "password"
                      ? "border-primary bg-primary/10 text-primary font-bold shadow-xs"
                      : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900"
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-0.5 font-semibold text-xs">
                    <IconKey className="h-4 w-4" />
                    <span>Set Temporary Password Directly</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground font-normal">
                    Immediately updates their password and signs out active sessions.
                  </p>
                </button>
              </div>
            </div>

            {resetMode === "password" && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  New Temporary Password *
                </label>
                <Input
                  type="text"
                  placeholder="Minimum 8 characters"
                  value={resetTempPassword}
                  onChange={(e) => setResetTempPassword(e.target.value)}
                  className="rounded-xl font-mono text-xs"
                  required
                />
                <p className="text-[11px] text-muted-foreground">
                  Share this temporary password with the administrator over a secure channel.
                </p>
              </div>
            )}

            <DialogFooter className="gap-2 pt-2 sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setResetTarget(null)}
                disabled={submittingReset}
                className="rounded-full"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submittingReset}
                className="rounded-full shadow-md gap-1.5"
              >
                {submittingReset ? (
                  <>
                    <IconLoader className="h-4 w-4 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <IconKey className="h-4 w-4" />
                    <span>
                      {resetMode === "email"
                        ? "Send Reset Email"
                        : resetMode === "link"
                          ? "Generate Reset Link"
                          : "Set Temporary Password"}
                    </span>
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reset Password Result Dialog */}
      <Dialog open={!!resetResultModal?.open} onOpenChange={(open) => !open && setResetResultModal(null)}>
        <DialogContent className="sm:max-w-lg rounded-3xl">
          <DialogHeader className="flex flex-col items-center text-center sm:items-center sm:text-center">
            <div className="size-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-1">
              <IconCheck className="h-6 w-6" />
            </div>
            <DialogTitle className="text-xl font-bold text-slate-900 dark:text-slate-100 text-center">
              {resetResultModal?.deliveryMode === "password"
                ? "Temporary Password Set"
                : "Password Reset Link Ready"}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 text-center max-w-sm">
              {resetResultModal?.deliveryMode === "email" ? (
                <>
                  A password reset email has been queued for <strong>{resetResultModal?.fullName}</strong> ({resetResultModal?.email}).
                </>
              ) : resetResultModal?.deliveryMode === "link" ? (
                <>
                  A self-service password reset link was generated for <strong>{resetResultModal?.fullName}</strong> (no email sent).
                </>
              ) : (
                <>
                  The password for <strong>{resetResultModal?.fullName}</strong> ({resetResultModal?.email}) has been updated immediately.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {resetResultModal?.resetUrl && (
              <>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  You can also copy and share this 7-day password reset link directly:
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={resetResultModal.resetUrl}
                    className="h-9 text-xs font-mono rounded-xl bg-slate-50 dark:bg-slate-900 select-all"
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      if (resetResultModal?.resetUrl) {
                        navigator.clipboard.writeText(resetResultModal.resetUrl);
                        toast.success("Reset link copied to clipboard!");
                      }
                    }}
                    className="h-9 px-3 text-xs font-semibold rounded-xl gap-1.5 shrink-0"
                  >
                    <IconCopy className="h-3.5 w-3.5" />
                    <span>Copy</span>
                  </Button>
                </div>
              </>
            )}

            {resetResultModal?.temporaryPassword && (
              <>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Copy the temporary credentials below and share them securely with the administrator:
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={resetResultModal.temporaryPassword}
                    className="h-9 text-xs font-mono rounded-xl bg-slate-50 dark:bg-slate-900 select-all"
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      if (resetResultModal?.temporaryPassword) {
                        navigator.clipboard.writeText(resetResultModal.temporaryPassword);
                        toast.success("Temporary password copied!");
                      }
                    }}
                    className="h-9 px-3 text-xs font-semibold rounded-xl gap-1.5 shrink-0"
                  >
                    <IconCopy className="h-3.5 w-3.5" />
                    <span>Copy</span>
                  </Button>
                </div>
              </>
            )}
          </div>

          <DialogFooter className="pt-2 sm:justify-end">
            <Button
              type="button"
              onClick={() => setResetResultModal(null)}
              className="w-full sm:w-auto rounded-xl text-xs font-semibold"
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Admin Invitation / Access Confirmation Dialog */}
      <Dialog open={!!revokeTarget} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-rose-600 dark:text-rose-400 flex items-center gap-2">
              <IconBan className="h-5 w-5" />
              {revokeTarget && (resolveAdminDisplayStatus(revokeTarget) === "Invited" || resolveAdminDisplayStatus(revokeTarget) === "Expired")
                ? "Revoke Invitation"
                : "Revoke Admin Access"}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              {revokeTarget && (resolveAdminDisplayStatus(revokeTarget) === "Invited" || resolveAdminDisplayStatus(revokeTarget) === "Expired") ? (
                <>
                  Are you sure you want to revoke the pending invitation for <strong>{revokeTarget?.fullName}</strong> ({revokeTarget?.email})?
                </>
              ) : (
                <>
                  Are you sure you want to revoke platform administrative access for <strong>{revokeTarget?.fullName}</strong> ({revokeTarget?.email})?
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-300">
            {revokeTarget && (resolveAdminDisplayStatus(revokeTarget) === "Invited" || resolveAdminDisplayStatus(revokeTarget) === "Expired")
              ? "This will invalidate their invitation link and mark the record as Revoked. You can re-invite or permanently remove them afterwards."
              : "This will immediately terminate their platform administrative access and keep the record in Revoked state for audit history. You can re-invite or permanently remove them afterwards."}
          </div>

          <DialogFooter className="gap-2 pt-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRevokeTarget(null)}
              disabled={submittingRevoke}
              className="rounded-full text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleRevokeConfirm}
              disabled={submittingRevoke}
              className="rounded-full text-xs font-semibold gap-1.5"
            >
              {submittingRevoke ? (
                <>
                  <IconLoader className="h-3.5 w-3.5 animate-spin" />
                  <span>Revoking...</span>
                </>
              ) : (
                <>
                  <IconBan className="h-3.5 w-3.5" />
                  <span>Confirm Revoke</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permanently Remove Admin User Dialog (from Revoked state) */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-rose-600 dark:text-rose-400 flex items-center gap-2">
              <IconTrash className="h-5 w-5" />
              Remove from Platform Admins
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Are you sure you want to permanently remove <strong>{deleteTarget?.fullName}</strong> ({deleteTarget?.email}) from the platform administrator directory?
            </DialogDescription>
          </DialogHeader>

          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-300">
            This will permanently delete the revoked administrator record from the platform directory.
          </div>

          <DialogFooter className="gap-2 pt-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={submittingDelete}
              className="rounded-full text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={submittingDelete}
              className="rounded-full text-xs font-semibold gap-1.5"
            >
              {submittingDelete ? (
                <>
                  <IconLoader className="h-3.5 w-3.5 animate-spin" />
                  <span>Removing...</span>
                </>
              ) : (
                <>
                  <IconTrash className="h-3.5 w-3.5" />
                  <span>Permanently Remove</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
