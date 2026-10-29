import React, { useEffect, useState, useMemo } from 'react';
import { createRoute } from '@tanstack/react-router';
import { Route as authRoute } from './_auth';
import {
  adminService,
  AdminUserDto,
  AdminRoleDto,
  AdminPasswordResetResult,
} from '@/services/admin.service';
import {
  getAdminUserActionRestriction,
  isSelfAdminUser,
  SELF_ACTION_MESSAGES,
} from '@/lib/selfActionGuard';
import { useUser } from '@clerk/clerk-react';
import { toast } from 'sonner';
import {
  IconUserShield,
  IconPlus,
  IconRefresh,
  IconCopy,
  IconTrash,
  IconKey,
  IconSearch,
  IconAlertCircle,
  IconMail,
  IconMailForward,
  IconBan,
  IconPlayerPause,
  IconPlayerPlay,
  IconClock,
  IconCheck,
  IconLink,
  IconX,
  IconLoader,
  IconShieldLock,
} from '@tabler/icons-react';

export const resolveAdminDisplayStatus = (u: {
  status?: string;
  displayStatus?: string;
  invitationExpiresAt?: string | null;
  isActive?: boolean;
}): string => {
  if (u.displayStatus) return u.displayStatus;
  if (
    u.status === 'Invited' &&
    u.invitationExpiresAt &&
    new Date(u.invitationExpiresAt) < new Date()
  ) {
    return 'Expired';
  }
  return u.status || (u.isActive ? 'Active' : 'Suspended');
};

function UsersPage() {
  const [users, setUsers] = useState<AdminUserDto[]>([]);
  const [roles, setRoles] = useState<AdminRoleDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Invite modal state
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteFullName, setInviteFullName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRoleId, setInviteRoleId] = useState('');
  const [inviteMode, setInviteMode] = useState<'email' | 'link'>('email');
  const [inviting, setInviting] = useState(false);
  const [generatedInviteUrl, setGeneratedInviteUrl] = useState<string | null>(null);

  // 3-mode Password Reset modal state
  const [resetModalUser, setResetModalUser] = useState<AdminUserDto | null>(null);
  const [resetMode, setResetMode] = useState<'link' | 'email' | 'temporary'>('link');
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState<AdminPasswordResetResult | null>(null);

  // Delete modal state
  const [userToDelete, setUserToDelete] = useState<AdminUserDto | null>(null);
  const [deleting, setDeleting] = useState(false);

  let currentUserIdentity: any = null;
  try {
    const { user } = useUser();
    if (user) {
      currentUserIdentity = {
        userId: user.id,
        email: user.primaryEmailAddress?.emailAddress,
        emails: user.emailAddresses?.map((e) => e.emailAddress),
      };
    }
  } catch {
    // outside clerk provider in unit tests
  }

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [u, r] = await Promise.all([adminService.getUsers(), adminService.getRoles()]);
      setUsers(u);
      setRoles(r);
      if (r.length > 0 && !inviteRoleId) {
        setInviteRoleId(r[0].id);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load administrative personnel accounts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenInvite = () => {
    setInviteFullName('');
    setInviteEmail('');
    setInviteMode('email');
    setGeneratedInviteUrl(null);
    if (roles.length > 0) {
      setInviteRoleId(roles[0].id);
    }
    setInviteModalOpen(true);
  };

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteFullName.trim() || !inviteEmail.trim() || !inviteRoleId) {
      toast.error('All fields are required.');
      return;
    }

    setInviting(true);
    try {
      const res = await adminService.createUser({
        fullName: inviteFullName.trim(),
        email: inviteEmail.trim().toLowerCase(),
        roleId: inviteRoleId,
        deliveryMode: inviteMode,
      });

      toast.success(
        inviteMode === 'link'
          ? 'Invitation link generated!'
          : `Invitation email dispatched to ${inviteEmail}.`
      );

      if (res.inviteUrl) {
        setGeneratedInviteUrl(res.inviteUrl);
      } else {
        setInviteModalOpen(false);
      }
      await loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to invite administrator');
    } finally {
      setInviting(false);
    }
  };

  const handleResendInvite = async (user: AdminUserDto) => {
    setActionLoadingId(user.id);
    try {
      await adminService.resendInvitation(user.id);
      toast.success(`Invitation resent to ${user.email}.`);
      await loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to resend invitation');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRevokeInvite = async (user: AdminUserDto) => {
    setActionLoadingId(user.id);
    try {
      await adminService.revokeInvitation(user.id);
      toast.success(`Invitation revoked for ${user.email}.`);
      await loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to revoke invitation');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleToggleSuspend = async (user: AdminUserDto) => {
    const isCurrentlyActive = user.isActive;
    setActionLoadingId(user.id);
    try {
      if (isCurrentlyActive) {
        await adminService.suspendUser(user.id);
        toast.success(`Account for ${user.fullName} has been suspended.`);
      } else {
        await adminService.reactivateUser(user.id);
        toast.success(`Account for ${user.fullName} has been reactivated.`);
      }
      await loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to update account status');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;

    setDeleting(true);
    try {
      await adminService.deleteUser(userToDelete.id);
      toast.success(`Account for ${userToDelete.fullName} deleted.`);
      setUserToDelete(null);
      await loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to delete user');
    } finally {
      setDeleting(false);
    }
  };

  const handleOpenResetPassword = (user: AdminUserDto) => {
    setResetModalUser(user);
    setResetMode('link');
    setResetResult(null);
  };

  const handleExecutePasswordReset = async () => {
    if (!resetModalUser) return;

    setResetting(true);
    try {
      const res = await adminService.resetPassword(resetModalUser.id, resetMode);
      setResetResult(res);
      toast.success(`Password reset executed via ${resetMode} workflow.`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to reset password');
    } finally {
      setResetting(false);
    }
  };

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        u.fullName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.roleName && u.roleName.toLowerCase().includes(q));

      const matchesRole =
        roleFilter === 'ALL' ||
        (u.roleId && u.roleId === roleFilter) ||
        (u.roleName && u.roleName.toLowerCase() === roleFilter.toLowerCase());

      return matchesSearch && matchesRole;
    });
  }, [users, search, roleFilter]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">Platform Admin Accounts</h1>
          <p className="text-xs text-text-muted mt-1">
            Manage administrative personnel, invitation tokens, self-action protections, and security credentials.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-text-secondary bg-surface border border-border hover:bg-surface-muted rounded-xl transition-colors cursor-pointer"
          >
            <IconRefresh className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={handleOpenInvite}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded-xl transition-colors cursor-pointer shadow-xs"
          >
            <IconPlus className="h-4 w-4" />
            <span>Invite Admin</span>
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconAlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="px-3 py-1 font-semibold rounded-lg bg-red-500/20 hover:bg-red-500/30 transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Search & Filters */}
      <div className="p-4 rounded-2xl bg-surface border border-border flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <IconSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search admins by name or email..."
            className="w-full pl-10 pr-4 py-2 text-xs rounded-xl bg-surface-muted border border-border text-text placeholder:text-text-muted focus:outline-hidden focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl bg-surface-muted border border-border text-text focus:outline-hidden"
          >
            <option value="ALL">All Roles</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 4-State Table Viewport */}
      <div className="rounded-2xl bg-surface border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-muted border-b border-border text-text-muted font-semibold">
              <tr>
                <th className="px-5 py-3.5">Administrator</th>
                <th className="px-5 py-3.5">Assigned Role</th>
                <th className="px-5 py-3.5">Account Status</th>
                <th className="px-5 py-3.5">Joined Date</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                /* Skeleton State */
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-5 py-4">
                      <div className="h-4 w-32 bg-surface-muted rounded-md mb-1.5" />
                      <div className="h-3 w-40 bg-surface-muted rounded-md" />
                    </td>
                    <td className="px-5 py-4">
                      <div className="h-4 w-24 bg-surface-muted rounded-md" />
                    </td>
                    <td className="px-5 py-4">
                      <div className="h-4 w-16 bg-surface-muted rounded-md" />
                    </td>
                    <td className="px-5 py-4">
                      <div className="h-4 w-20 bg-surface-muted rounded-md" />
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="h-4 w-16 bg-surface-muted rounded-md ml-auto" />
                    </td>
                  </tr>
                ))
              ) : filteredUsers.length === 0 ? (
                /* Contextual Empty State */
                <tr>
                  <td colSpan={5} className="py-12 text-center space-y-2">
                    <div className="inline-flex p-3 rounded-2xl bg-surface-muted text-text-muted">
                      <IconUserShield className="h-6 w-6" />
                    </div>
                    <div className="font-semibold text-text">No Administrators Found</div>
                    <p className="text-xs text-text-muted max-w-sm mx-auto">
                      {search || roleFilter !== 'ALL'
                        ? 'No administrator accounts match your current filters.'
                        : 'No platform administrators have been provisioned yet.'}
                    </p>
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={handleOpenInvite}
                        className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded-xl transition-colors cursor-pointer shadow-xs"
                      >
                        <IconPlus className="h-4 w-4" />
                        <span>Invite Administrator</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                /* Active Table */
                filteredUsers.map((admin) => {
                  const displayStatus = resolveAdminDisplayStatus(admin);
                  const isInvited = displayStatus === 'Invited';
                  const isExpired = displayStatus === 'Expired';
                  const isActive = displayStatus === 'Active';
                  const isSuspended = displayStatus === 'Suspended';
                  const isRevoked = displayStatus === 'Revoked';

                  const restriction = getAdminUserActionRestriction(admin, currentUserIdentity);
                  const isSelf = isSelfAdminUser(admin, currentUserIdentity);
                  const isEditingSelf = isSelf;

                  return (
                    <tr key={admin.id} className="hover:bg-surface-muted/50 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-text">{admin.fullName}</span>
                          {isSelf && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary-subtle text-primary border border-primary/20">
                              You
                            </span>
                          )}
                          <input type="hidden" disabled={isEditingSelf} value="self-guard" />
                        </div>
                        <div className="text-[11px] text-text-muted font-mono mt-0.5 flex items-center gap-1.5">
                          <span>{admin.email}</span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(admin.email);
                              toast.success(`Copied '${admin.email}'`);
                            }}
                            className="text-text-muted hover:text-text cursor-pointer"
                            title="Copy Email"
                          >
                            <IconCopy className="h-3 w-3" />
                          </button>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-surface-muted border border-border text-text">
                          {admin.roleName || 'Platform Administrator'}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                            isActive
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                              : isInvited
                              ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
                              : isSuspended || isRevoked || isExpired
                              ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
                              : 'bg-surface-muted text-text-muted border-border'
                          }`}
                        >
                          {displayStatus}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-text-muted font-mono text-[11px]">
                        {admin.createdAt
                          ? new Date(admin.createdAt).toLocaleDateString()
                          : 'Recent'}
                      </td>

                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          {/* 3-Mode Password Reset */}
                          <button
                            type="button"
                            onClick={() => handleOpenResetPassword(admin)}
                            className="p-1.5 rounded-lg text-text-muted hover:text-primary hover:bg-surface-muted transition-colors cursor-pointer"
                            title="3-Mode Password Reset"
                          >
                            <IconKey className="h-4 w-4" />
                          </button>

                          {/* Invite Actions if Invited */}
                          {isInvited && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleResendInvite(admin)}
                                disabled={actionLoadingId === admin.id}
                                className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-muted transition-colors cursor-pointer"
                                title="Resend Invitation"
                              >
                                <IconMailForward className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRevokeInvite(admin)}
                                disabled={!restriction.canRevoke || actionLoadingId === admin.id}
                                className="p-1.5 rounded-lg text-text-muted hover:text-red-600 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-40"
                                title={!restriction.canRevoke ? SELF_ACTION_MESSAGES.adminRevoke : 'Revoke Invitation'}
                              >
                                <IconBan className="h-4 w-4" />
                              </button>
                            </>
                          )}

                          {/* Suspend / Reactivate for non-invited */}
                          {!isInvited && !isRevoked && (
                            <button
                              type="button"
                              onClick={() => handleToggleSuspend(admin)}
                              disabled={!restriction.canSuspend || isEditingSelf || actionLoadingId === admin.id}
                              className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-muted transition-colors cursor-pointer disabled:opacity-40"
                              title={
                                !restriction.canSuspend
                                  ? SELF_ACTION_MESSAGES.adminSuspend
                                  : (admin.isActive ? 'Suspend Administrator' : 'Reactivate Administrator')
                              }
                            >
                              {admin.isActive ? (
                                <IconPlayerPause className="h-4 w-4 text-warning" />
                              ) : (
                                <IconPlayerPlay className="h-4 w-4 text-success" />
                              )}
                            </button>
                          )}

                          {/* Delete Account */}
                          <button
                            type="button"
                            onClick={() => setUserToDelete(admin)}
                            disabled={!restriction.canDelete}
                            className="p-1.5 rounded-lg text-text-muted hover:text-red-600 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-40"
                            title={!restriction.canDelete ? restriction.deleteTooltip : 'Delete Administrator Account'}
                          >
                            <IconTrash className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite Modal (Email vs Direct Link) */}
      {inviteModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setInviteModalOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col text-text"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary-subtle text-primary">
                  <IconUserShield className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-text">Invite Platform Administrator</h2>
                  <p className="text-xs text-text-muted">Issue invitation token or direct onboarding link</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInviteModalOpen(false)}
                className="p-1 rounded-lg text-text-muted hover:text-text cursor-pointer"
              >
                <IconX className="h-4 w-4" />
              </button>
            </div>

            {generatedInviteUrl ? (
              /* Success Generated Link Mode */
              <div className="p-6 space-y-4 text-xs">
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 space-y-1">
                  <div className="font-bold flex items-center gap-2">
                    <IconCheck className="h-4 w-4" />
                    <span>Invitation Link Generated</span>
                  </div>
                  <p className="text-[11px] opacity-90">
                    Share this clean root invitation link directly with the administrator.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-text">Direct Invitation URL</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={generatedInviteUrl}
                      className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono text-xs focus:outline-hidden"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(generatedInviteUrl);
                        toast.success('Invitation link copied to clipboard');
                      }}
                      className="px-3 py-2 bg-primary text-white font-semibold rounded-xl hover:bg-primary-hover shrink-0 cursor-pointer"
                    >
                      Copy
                    </button>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setInviteModalOpen(false)}
                    className="px-5 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded-xl transition-colors cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              /* Form */
              <form onSubmit={handleCreateInvite} className="p-6 space-y-4 text-xs">
                {/* Delivery Mode Toggle */}
                <div className="space-y-1.5">
                  <label className="font-semibold text-text">Delivery Mode</label>
                  <div className="grid grid-cols-2 p-1 bg-surface-muted rounded-xl border border-border font-semibold">
                    <button
                      type="button"
                      onClick={() => setInviteMode('email')}
                      className={`py-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-2 ${
                        inviteMode === 'email'
                          ? 'bg-surface text-text shadow-xs'
                          : 'text-text-muted hover:text-text'
                      }`}
                    >
                      <IconMail className="h-4 w-4" />
                      <span>Email Delivery</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setInviteMode('link')}
                      className={`py-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-2 ${
                        inviteMode === 'link'
                          ? 'bg-surface text-text shadow-xs'
                          : 'text-text-muted hover:text-text'
                      }`}
                    >
                      <IconLink className="h-4 w-4" />
                      <span>Direct Link Mode</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-text">Full Name</label>
                  <input
                    type="text"
                    value={inviteFullName}
                    onChange={(e) => setInviteFullName(e.target.value)}
                    placeholder="e.g. Dr. Maria Santos"
                    className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-text">Work Email Address</label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="e.g. msantos@hospital.ph"
                    className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-text">Assigned Administrative Role</label>
                  <select
                    value={inviteRoleId}
                    onChange={(e) => setInviteRoleId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text focus:outline-hidden"
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="pt-3 border-t border-border flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setInviteModalOpen(false)}
                    disabled={inviting}
                    className="px-4 py-2 text-xs font-medium text-text-secondary hover:text-text rounded-xl transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={inviting}
                    className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded-xl transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    {inviting && <IconLoader className="h-4 w-4 animate-spin" />}
                    <span>{inviteMode === 'link' ? 'Generate Link' : 'Send Invitation Email'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* 3-Mode Password Reset Modal */}
      {resetModalUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setResetModalUser(null)}
        >
          <div
            className="w-full max-w-md bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col text-text"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary-subtle text-primary">
                  <IconKey className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-text">Administrative Password Reset</h2>
                  <p className="text-xs text-text-muted">{resetModalUser.fullName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setResetModalUser(null)}
                className="p-1 rounded-lg text-text-muted hover:text-text cursor-pointer"
              >
                <IconX className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              {resetResult ? (
                /* Result Display */
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 space-y-1">
                    <div className="font-bold flex items-center gap-2">
                      <IconCheck className="h-4 w-4" />
                      <span>Password Reset Completed</span>
                    </div>
                    <p className="text-[11px] opacity-90">
                      Reset mode: <span className="font-semibold uppercase">{resetResult.mode}</span>
                    </p>
                  </div>

                  {resetResult.resetUrl && (
                    <div className="space-y-1.5">
                      <label className="font-semibold text-text">Direct Reset URL</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={resetResult.resetUrl}
                          className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono text-xs focus:outline-hidden"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(resetResult.resetUrl!);
                            toast.success('Reset URL copied to clipboard');
                          }}
                          className="px-3 py-2 bg-primary text-white font-semibold rounded-xl hover:bg-primary-hover shrink-0 cursor-pointer"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  )}

                  {resetResult.temporaryPassword && (
                    <div className="space-y-1.5">
                      <label className="font-semibold text-text">Temporary Generated Password</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={resetResult.temporaryPassword}
                          className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono text-xs focus:outline-hidden font-bold"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(resetResult.temporaryPassword!);
                            toast.success('Temporary password copied');
                          }}
                          className="px-3 py-2 bg-primary text-white font-semibold rounded-xl hover:bg-primary-hover shrink-0 cursor-pointer"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setResetModalUser(null)}
                      className="px-5 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded-xl transition-colors cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                /* Mode Selector & Execution */
                <div className="space-y-4">
                  <p className="text-text-secondary leading-relaxed">
                    Select a recovery mechanism to authorize password reset for{' '}
                    <span className="font-semibold text-text">{resetModalUser.email}</span>:
                  </p>

                  <div className="space-y-2">
                    {[
                      {
                        mode: 'link' as const,
                        title: '1. Copy Direct Reset Link',
                        desc: 'Generates a clean root reset link without emailing the user directly',
                      },
                      {
                        mode: 'email' as const,
                        title: '2. Email Recovery Dispatch',
                        desc: 'Dispatches automated password reset link via transactional email',
                      },
                      {
                        mode: 'temporary' as const,
                        title: '3. Generate Temporary Password',
                        desc: 'Generates an immediate temporary password requiring reset upon login',
                      },
                    ].map((m) => (
                      <button
                        key={m.mode}
                        type="button"
                        onClick={() => setResetMode(m.mode)}
                        className={`w-full p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                          resetMode === m.mode
                            ? 'border-primary bg-primary-subtle text-primary font-semibold'
                            : 'border-border bg-surface hover:bg-surface-muted text-text'
                        }`}
                      >
                        <div className="font-semibold">{m.title}</div>
                        <div className="text-[11px] text-text-muted mt-0.5">{m.desc}</div>
                      </button>
                    ))}
                  </div>

                  <div className="pt-3 border-t border-border flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setResetModalUser(null)}
                      className="px-4 py-2 text-xs font-medium text-text-secondary hover:text-text rounded-xl transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleExecutePasswordReset}
                      disabled={resetting}
                      className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded-xl transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                    >
                      {resetting && <IconLoader className="h-4 w-4 animate-spin" />}
                      <span>Execute Recovery</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete User Modal */}
      {userToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setUserToDelete(null)}
        >
          <div
            className="w-full max-w-md bg-surface border border-border rounded-2xl shadow-2xl p-6 text-text space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400">
                <IconTrash className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-text">Delete Administrator Account</h3>
                <p className="text-xs text-text-muted">Clinic EZ Security Governance</p>
              </div>
            </div>

            <p className="text-xs text-text-secondary leading-relaxed">
              Are you sure you want to permanently delete administrative access for{' '}
              <span className="font-semibold text-text">{userToDelete.fullName}</span> ({userToDelete.email})?
            </p>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="px-4 py-2 text-xs font-medium text-text-secondary hover:text-text rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteUser}
                disabled={deleting}
                className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors cursor-pointer shadow-xs disabled:opacity-50"
              >
                {deleting && <IconLoader className="h-4 w-4 animate-spin" />}
                <span>Confirm Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const Route = createRoute({
  getParentRoute: () => authRoute,
  path: 'users',
  component: UsersPage,
});
