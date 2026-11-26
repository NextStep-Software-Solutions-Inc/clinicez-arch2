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
import { Button, Chip, SelectField, Tabs, Text } from '@/components/ui';
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
      const res = await adminService.inviteUser({
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
      const res = await adminService.resetUserPassword(resetModalUser.id, {
        deliveryMode: resetMode === 'temporary' ? 'password' : resetMode,
      });
      setResetResult(res);
      toast.success(`Password reset executed via ${resetMode} workflow.`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to reset password');
    } finally {
      setResetting(false);
    }
  };

  const resolveRoleName = (u: AdminUserDto): string =>
    u.role?.name || roles.find((r) => r.id === u.roleId)?.name || '';

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const q = search.trim().toLowerCase();
      const resolvedRole = resolveRoleName(u);
      const matchesSearch =
        !q ||
        u.fullName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (resolvedRole && resolvedRole.toLowerCase().includes(q));

      const matchesRole =
        roleFilter === 'ALL' ||
        (u.roleId && u.roleId === roleFilter) ||
        (resolvedRole && resolvedRole.toLowerCase() === roleFilter.toLowerCase());

      return matchesSearch && matchesRole;
    });
  }, [users, roles, search, roleFilter]);

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
          <Button
            variant="secondary"
            size="md"
            onClick={loadData}
            disabled={loading}
            leadingIcon={<IconRefresh className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleOpenInvite}
            leadingIcon={<IconPlus className="h-4 w-4" />}
          >
            Invite Admin
          </Button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <IconAlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <Button variant="dangerSubtle" size="xs" onClick={loadData} className="shrink-0">
            Retry
          </Button>
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

        <div className="flex items-center gap-2 w-full sm:w-44">
          <SelectField
            ariaLabel="Filter administrators by role"
            value={roleFilter}
            onValueChange={setRoleFilter}
            align="right"
            options={[
              { value: 'ALL', label: 'All Roles' },
              ...roles.map((r) => ({
                value: r.id,
                label: r.name,
              })),
            ]}
          />
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
                      <Button
                        variant="primary"
                        size="md"
                        onClick={handleOpenInvite}
                        leadingIcon={<IconPlus className="h-4 w-4" />}
                        className="px-5"
                      >
                        Invite Administrator
                      </Button>
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
                      <td className="px-5 py-4 max-w-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <Text as="span" className="font-semibold text-text">
                            {admin.fullName}
                          </Text>
                          {isSelf && (
                            <Chip tone="primary" size="xs" className="shrink-0">
                              You
                            </Chip>
                          )}
                          <input type="hidden" disabled={isEditingSelf} value="self-guard" />
                        </div>
                        <div className="text-[11px] text-text-muted font-mono mt-0.5 flex items-center gap-1.5 min-w-0">
                          <Text as="span" className="font-mono text-[11px] text-text-muted">
                            {admin.email}
                          </Text>
                          <Button
                            variant="ghost"
                            size="custom"
                            onClick={() => {
                              navigator.clipboard.writeText(admin.email);
                              toast.success(`Copied '${admin.email}'`);
                            }}
                            className="p-0.5 rounded text-text-muted hover:text-text shrink-0"
                            title="Copy Email"
                            aria-label="Copy Email"
                          >
                            <IconCopy className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <Chip tone="neutral" size="xs" className="text-text">
                          {resolveRoleName(admin) || '—'}
                        </Chip>
                      </td>

                      <td className="px-5 py-4">
                        <Chip
                          tone={
                            isActive
                              ? 'success'
                              : isInvited
                              ? 'info'
                              : isSuspended || isRevoked || isExpired
                              ? 'danger'
                              : 'neutral'
                          }
                          size="xs"
                        >
                          {displayStatus}
                        </Chip>
                      </td>

                      <td className="px-5 py-4 text-text-muted font-mono text-[11px]">
                        <Text as="span" className="font-mono text-[11px] text-text-muted">
                          {admin.createdAt
                            ? new Date(admin.createdAt).toLocaleDateString()
                            : '—'}
                        </Text>
                      </td>

                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          {/* 3-Mode Password Reset */}
                          <Button
                            variant="ghost"
                            size="iconSm"
                            onClick={() => handleOpenResetPassword(admin)}
                            className="text-text-muted hover:text-primary"
                            title="3-Mode Password Reset"
                            aria-label="3-Mode Password Reset"
                          >
                            <IconKey className="h-4 w-4" />
                          </Button>

                          {/* Invite Actions if Invited */}
                          {isInvited && (
                            <>
                              <Button
                                variant="ghost"
                                size="iconSm"
                                onClick={() => handleResendInvite(admin)}
                                disabled={actionLoadingId === admin.id}
                                className="text-text-muted hover:text-text"
                                title="Resend Invitation"
                                aria-label="Resend Invitation"
                              >
                                <IconMailForward className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="iconSm"
                                onClick={() => handleRevokeInvite(admin)}
                                disabled={!restriction.canRevoke || actionLoadingId === admin.id}
                                className="text-text-muted hover:text-red-600 hover:bg-red-500/10 disabled:opacity-40"
                                title={!restriction.canRevoke ? SELF_ACTION_MESSAGES.adminRevoke : 'Revoke Invitation'}
                                aria-label={!restriction.canRevoke ? SELF_ACTION_MESSAGES.adminRevoke : 'Revoke Invitation'}
                              >
                                <IconBan className="h-4 w-4" />
                              </Button>
                            </>
                          )}

                          {/* Suspend / Reactivate for non-invited */}
                          {!isInvited && !isRevoked && (
                            <Button
                              variant="ghost"
                              size="iconSm"
                              onClick={() => handleToggleSuspend(admin)}
                              disabled={!restriction.canSuspend || isEditingSelf || actionLoadingId === admin.id}
                              className="text-text-muted hover:text-text disabled:opacity-40"
                              title={
                                !restriction.canSuspend
                                  ? SELF_ACTION_MESSAGES.adminSuspend
                                  : (admin.isActive ? 'Suspend Administrator' : 'Reactivate Administrator')
                              }
                              aria-label={
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
                            </Button>
                          )}

                          {/* Delete Account */}
                          <Button
                            variant="ghost"
                            size="iconSm"
                            onClick={() => setUserToDelete(admin)}
                            disabled={!restriction.canDelete}
                            className="text-text-muted hover:text-red-600 hover:bg-red-500/10 disabled:opacity-40"
                            title={!restriction.canDelete ? restriction.deleteTooltip : 'Delete Administrator Account'}
                            aria-label={!restriction.canDelete ? restriction.deleteTooltip : 'Delete Administrator Account'}
                          >
                            <IconTrash className="h-4 w-4" />
                          </Button>
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
              <Button
                variant="ghost"
                size="iconSm"
                onClick={() => setInviteModalOpen(false)}
                className="text-text-muted hover:text-text shrink-0"
                aria-label="Close invite modal"
              >
                <IconX className="h-4 w-4" />
              </Button>
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
                  <Text as="label" className="font-semibold text-text">
                    Direct Invitation URL
                  </Text>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={generatedInviteUrl}
                      className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono text-xs focus:outline-hidden"
                    />
                    <Button
                      variant="primary"
                      size="md"
                      onClick={() => {
                        navigator.clipboard.writeText(generatedInviteUrl);
                        toast.success('Invitation link copied to clipboard');
                      }}
                      className="shrink-0"
                    >
                      Copy
                    </Button>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => setInviteModalOpen(false)}
                    className="px-5"
                  >
                    Done
                  </Button>
                </div>
              </div>
            ) : (
              /* Form */
              <form onSubmit={handleCreateInvite} className="p-6 space-y-4 text-xs">
                {/* Delivery Mode Toggle */}
                <div className="space-y-1.5">
                  <Text as="label" className="font-semibold text-text">
                    Delivery Mode
                  </Text>
                  <Tabs
                    ariaLabel="Invitation delivery mode"
                    fullWidthUntil="always"
                    value={inviteMode}
                    onValueChange={setInviteMode}
                    items={[
                      {
                        value: 'email',
                        label: 'Email Delivery',
                        icon: <IconMail className="h-4 w-4" />,
                      },
                      {
                        value: 'link',
                        label: 'Direct Link Mode',
                        icon: <IconLink className="h-4 w-4" />,
                      },
                    ]}
                  />
                </div>

                <div className="space-y-1.5">
                  <Text as="label" className="font-semibold text-text">
                    Full Name
                  </Text>
                  <input
                    type="text"
                    value={inviteFullName}
                    onChange={(e) => setInviteFullName(e.target.value)}
                    placeholder="e.g. Dr. Maria Santos"
                    className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1.5">
                  <Text as="label" className="font-semibold text-text">
                    Work Email Address
                  </Text>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="e.g. msantos@hospital.ph"
                    className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1.5">
                  <Text as="label" className="font-semibold text-text">
                    Assigned Administrative Role
                  </Text>
                  <SelectField
                    ariaLabel="Assigned Administrative Role"
                    value={inviteRoleId}
                    onValueChange={setInviteRoleId}
                    placeholder="Select an administrative role..."
                    searchable={false}
                    options={roles.map((r) => ({
                      value: r.id,
                      label: r.name,
                      description: r.description,
                    }))}
                  />
                </div>

                <div className="pt-3 border-t border-border flex items-center justify-end gap-3">
                  <Button
                    variant="ghost"
                    size="md"
                    onClick={() => setInviteModalOpen(false)}
                    disabled={inviting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    disabled={inviting}
                    leadingIcon={inviting ? <IconLoader className="h-4 w-4 animate-spin" /> : undefined}
                    className="px-5"
                  >
                    {inviteMode === 'link' ? 'Generate Link' : 'Send Invitation Email'}
                  </Button>
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
            <div className="flex items-center justify-between p-5 border-b border-border gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 rounded-xl bg-primary-subtle text-primary shrink-0">
                  <IconKey className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <Text as="h2" className="text-base font-bold text-text">
                    Administrative Password Reset
                  </Text>
                  <Text as="p" className="text-xs text-text-muted">
                    {resetModalUser.fullName}
                  </Text>
                </div>
              </div>
              <Button
                variant="ghost"
                size="iconSm"
                onClick={() => setResetModalUser(null)}
                className="text-text-muted hover:text-text shrink-0"
                aria-label="Close password reset modal"
              >
                <IconX className="h-4 w-4" />
              </Button>
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
                      Reset mode: <span className="font-semibold uppercase">{resetMode}</span>
                    </p>
                    {resetResult.message && (
                      <p className="text-[11px] opacity-90">{resetResult.message}</p>
                    )}
                  </div>

                  {resetResult.resetUrl && (
                    <div className="space-y-1.5">
                      <Text as="label" className="font-semibold text-text">
                        Direct Reset URL
                      </Text>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={resetResult.resetUrl}
                          className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono text-xs focus:outline-hidden"
                        />
                        <Button
                          variant="primary"
                          size="md"
                          onClick={() => {
                            navigator.clipboard.writeText(resetResult.resetUrl!);
                            toast.success('Reset URL copied to clipboard');
                          }}
                          className="shrink-0"
                        >
                          Copy
                        </Button>
                      </div>
                    </div>
                  )}

                  {resetResult.temporaryPassword && (
                    <div className="space-y-1.5">
                      <Text as="label" className="font-semibold text-text">
                        Temporary Generated Password
                      </Text>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={resetResult.temporaryPassword}
                          className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono text-xs focus:outline-hidden font-bold"
                        />
                        <Button
                          variant="primary"
                          size="md"
                          onClick={() => {
                            navigator.clipboard.writeText(resetResult.temporaryPassword!);
                            toast.success('Temporary password copied');
                          }}
                          className="shrink-0"
                        >
                          Copy
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="pt-2 flex justify-end">
                    <Button
                      variant="primary"
                      size="md"
                      onClick={() => setResetModalUser(null)}
                      className="px-5"
                    >
                      Done
                    </Button>
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
                      <Button
                        key={m.mode}
                        variant="unstyled"
                        size="custom"
                        multiline
                        tooltip={m.title}
                        onClick={() => setResetMode(m.mode)}
                        className={`w-full p-3 rounded-xl border text-left ${
                          resetMode === m.mode
                            ? 'border-primary bg-primary-subtle text-primary font-semibold'
                            : 'border-border bg-surface hover:bg-surface-muted text-text'
                        }`}
                      >
                        <Text as="div" className="font-semibold">
                          {m.title}
                        </Text>
                        <div className="text-[11px] text-text-muted mt-0.5">{m.desc}</div>
                      </Button>
                    ))}
                  </div>

                  <div className="pt-3 border-t border-border flex items-center justify-end gap-3">
                    <Button
                      variant="ghost"
                      size="md"
                      onClick={() => setResetModalUser(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      size="md"
                      onClick={handleExecutePasswordReset}
                      disabled={resetting}
                      leadingIcon={resetting ? <IconLoader className="h-4 w-4 animate-spin" /> : undefined}
                      className="px-5"
                    >
                      Execute Recovery
                    </Button>
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
              <Button
                variant="ghost"
                size="md"
                onClick={() => setUserToDelete(null)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="md"
                onClick={handleDeleteUser}
                disabled={deleting}
                leadingIcon={deleting ? <IconLoader className="h-4 w-4 animate-spin" /> : undefined}
                className="px-5"
              >
                Confirm Delete
              </Button>
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
