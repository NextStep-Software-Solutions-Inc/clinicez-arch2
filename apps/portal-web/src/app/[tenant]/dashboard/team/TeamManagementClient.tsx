"use client";

import React, { useState, useEffect, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { 
    IconUsers, 
    IconUserPlus, 
    IconShieldCheck, 
    IconMail, 
    IconBuildingHospital, 
    IconClock, 
    IconCheck, 
    IconTrash, 
    IconAlertCircle, 
    IconArrowRight, 
    IconCreditCard,
    IconLoader,
    IconSearch,
    IconUser,
    IconCopy,
    IconLink,
    IconRefresh,
    IconPencil,
    IconPlayerPause,
    IconPlayerPlay,
    IconBan,
    IconKey
} from "@tabler/icons-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { staffService, TenantStaffResultDto, StaffMemberDto } from "@/services/staff.service";
import { apiClient } from "@/transport/apiClient";
import { apiErrorMessage } from "@/lib/apiError";
import { toastApiError } from "@/lib/apiToast";
import {
    getWorkspaceMemberActionRestriction,
    isSelfWorkspaceMember,
    SELF_ACTION_MESSAGES,
} from "@/lib/selfActionGuard";
import { toast } from "sonner";

interface FacilityOption {
    id: string;
    name: string;
    facilityType: string;
}

const ROLE_DETAILS: Record<string, { label: string; badgeClass: string; description: string }> = {
    Owner: {
        label: "Workspace Owner",
        badgeClass: "bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800",
        description: "Primary enterprise administrator with full authority over workspace settings, billing, and facilities."
    },
    Admin: {
        label: "Tenant Administrator",
        badgeClass: "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800",
        description: "Can manage facilities, invite workspace team members, and configure tenancy settings."
    },
    "Facility Administrator": {
        label: "Facility Administrator",
        badgeClass: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800",
        description: "Governs branch-level clinical operations, staff scheduling, and local facility settings."
    },
    "Attending Physician": {
        label: "Attending Physician",
        badgeClass: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800",
        description: "Licensed medical doctor authorized to consult, order lab tests, and prescribe signed e-prescriptions."
    },
    "Medical Technologist": {
        label: "Medical Technologist",
        badgeClass: "bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border-teal-200 dark:border-teal-800",
        description: "Certified diagnostic professional performing laboratory analyses and releasing validated test results."
    },
    "Registered Pharmacist": {
        label: "Registered Pharmacist",
        badgeClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
        description: "Licensed pharmacist authorized to review e-prescriptions, log fulfillment, and dispense medications."
    },
    Phlebotomist: {
        label: "Phlebotomist",
        badgeClass: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-800",
        description: "Specimen collector managing venipuncture, barcode accessioning, and patient routing in the diagnostic dropzone."
    },
    "Cashier/Billing Staff": {
        label: "Cashier / Billing Staff",
        badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800",
        description: "Handles patient payment reconciliation, PhilHealth Konsulta co-pays, and official BIR receipts."
    },
    Biller: {
        label: "Biller / Finance",
        badgeClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
        description: "Can manage subscription plans, checkout sessions, payment methods, and download tax invoices."
    },
    Billing: {
        label: "Billing",
        badgeClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
        description: "Can manage the subscription, payment methods and tax invoices, and view finance totals."
    },
    Member: {
        label: "Member",
        badgeClass: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700",
        description: "Belongs to the workspace and works inside the facilities they are assigned to."
    },
    Viewer: {
        label: "Viewer / Analyst",
        badgeClass: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700",
        description: "Read-only access to tenancy health, analytics, and branch operational telemetry."
    }
};

export default function TeamManagementClient({ tenantSlug }: { tenantSlug: string }) {
    const { user } = useUser();
    const currentIdentity = React.useMemo(
        () => ({
            userId: user?.id ?? null,
            email: user?.primaryEmailAddress?.emailAddress ?? null,
            emails: user?.emailAddresses?.map((e) => e.emailAddress) ?? [],
        }),
        [user]
    );

    const [staffData, setStaffData] = useState<TenantStaffResultDto | null>(null);
    const [facilities, setFacilities] = useState<FacilityOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");

    // Invite Modal state
    const [inviteOpen, setInviteOpen] = useState(false);
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [role, setRole] = useState("Admin");
    const [facilityId, setFacilityId] = useState("");
    const [sendEmail, setSendEmail] = useState(true);
    const [inviteError, setInviteError] = useState<string | null>(null);
    const [submittingInvite, setSubmittingInvite] = useState(false);

    // Edit Staff Modal state
    const [editTarget, setEditTarget] = useState<StaffMemberDto | null>(null);
    const [editFullName, setEditFullName] = useState("");
    const [editRole, setEditRole] = useState("Admin");
    const [editFacilityId, setEditFacilityId] = useState("");
    const [editError, setEditError] = useState<string | null>(null);
    const [submittingEdit, setSubmittingEdit] = useState(false);

    // Action loading indicator for suspend / reactivate
    const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

    // Created Invite Success Modal
    const [createdInviteModal, setCreatedInviteModal] = useState<{
        open: boolean;
        fullName: string;
        email: string;
        role: string;
        inviteUrl: string;
        sentEmail: boolean;
    } | null>(null);

    // Resending state
    const [resendingId, setResendingId] = useState<string | null>(null);

    // Revoke Modal state
    const [revokeTarget, setRevokeTarget] = useState<StaffMemberDto | null>(null);
    const [submittingRevoke, setSubmittingRevoke] = useState(false);

    // Permanent Remove Modal state (from Revoked state)
    const [deleteTarget, setDeleteTarget] = useState<StaffMemberDto | null>(null);
    const [submittingDelete, setSubmittingDelete] = useState(false);

    // Reset Password Modal state
    const [resetTarget, setResetTarget] = useState<StaffMemberDto | null>(null);
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

    const loadData = async () => {
        try {
            const [staffRes, facRes] = await Promise.all([
                staffService.getTenantStaff(tenantSlug),
                apiClient.get<FacilityOption[]>(`/facilities?tenantSlug=${tenantSlug}`).catch(() => ({ data: [] }))
            ]);
            setStaffData(staffRes);
            setFacilities(facRes.data || []);
        } catch (err: unknown) {
            console.error("Failed to fetch team data", err);
            toastApiError(err, "Failed to load team members", tenantSlug);
        } finally {
            setLoading(false);
        }
    };

    const searchParams = useSearchParams();

    useEffect(() => {
        loadData();
    }, [tenantSlug]);

    useEffect(() => {
        if (searchParams?.get("invite") === "true") {
            setInviteOpen(true);
            const sp = new URLSearchParams(window.location.search);
            sp.delete("invite");
            window.history.replaceState({}, "", `${window.location.pathname}${sp.toString() ? `?${sp.toString()}` : ""}`);
        }
    }, [searchParams]);

    const handleCopyInviteLink = (token?: string | null) => {
        if (!token) return;
        const url = `${window.location.origin}/invitations/${token}`;
        navigator.clipboard.writeText(url);
        toast.success("Invitation link copied to clipboard!");
    };

    const handleResendInvite = async (member: StaffMemberDto) => {
        setResendingId(member.id);
        try {
            const updated = await staffService.resendInvitation(member.id, tenantSlug);
            const inviteUrl = `${window.location.origin}/invitations/${updated.invitationToken}`;
            navigator.clipboard.writeText(inviteUrl);

            toast.success(`Invitation resent by email. Link copied to clipboard.`);
            await loadData();
        } catch (err: unknown) {
            toastApiError(err, "Failed to resend invitation", tenantSlug);
        } finally {
            setResendingId(null);
        }
    };

    const handleInviteSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setInviteError(null);

        if (!fullName.trim()) {
            setInviteError("Please enter the full name.");
            return;
        }

        if (!email.trim() || !email.includes("@")) {
            setInviteError("Please enter a valid email address.");
            return;
        }

        if (role === "Facility Administrator" && !facilityId) {
            setInviteError("Please select a branch / facility for the Facility Administrator.");
            return;
        }

        setSubmittingInvite(true);
        try {
            const created = await staffService.inviteStaffMember({
                tenantSlug,
                fullName: fullName.trim(),
                email: email.trim(),
                role,
                facilityId: facilityId || undefined,
                sendEmail,
            });

            const inviteUrl = created.invitationToken
                ? `${window.location.origin}/invitations/${created.invitationToken}`
                : "";

            setInviteOpen(false);
            setFullName("");
            setEmail("");
            setRole("Admin");
            setFacilityId("");
            setSendEmail(true);

            if (inviteUrl) {
                setCreatedInviteModal({
                    open: true,
                    fullName: created.fullName,
                    email: created.email,
                    role: created.role,
                    inviteUrl,
                    sentEmail: sendEmail,
                });
            } else {
                toast.success(`Invitation sent successfully to ${email}`);
            }

            await loadData();
        } catch (err: unknown) {
            setInviteError(apiErrorMessage(err, "Failed to send staff invitation."));
        } finally {
            setSubmittingInvite(false);
        }
    };

    const handleOpenEdit = (member: StaffMemberDto) => {
        setEditTarget(member);
        setEditFullName(member.fullName);
        setEditRole(member.role);
        setEditFacilityId(member.facilityId || "");
        setEditError(null);
    };

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editTarget) return;
        setEditError(null);

        if (!editFullName.trim()) {
            setEditError("Please enter the full name.");
            return;
        }

        if (editRole === "Facility Administrator" && !editFacilityId) {
            setEditError("Please select a branch / facility for the Facility Administrator.");
            return;
        }

        setSubmittingEdit(true);
        try {
            await staffService.updateStaffMember(editTarget.id, tenantSlug, {
                fullName: editFullName.trim(),
                role: editRole,
                facilityId: editFacilityId || null,
            });

            toast.success(`Updated details for ${editFullName}`);
            setEditTarget(null);
            await loadData();
        } catch (err: unknown) {
            setEditError(apiErrorMessage(err, "Failed to update staff member."));
        } finally {
            setSubmittingEdit(false);
        }
    };

    const handleSuspend = async (member: StaffMemberDto) => {
        if (isSelfWorkspaceMember(member, currentIdentity)) {
            toast.error(SELF_ACTION_MESSAGES.workspaceSuspend);
            return;
        }
        try {
            setActionLoadingId(member.id);
            await staffService.suspendStaffMember(member.id, tenantSlug);
            toast.success(`Suspended access for ${member.fullName}`);
            await loadData();
        } catch (err: unknown) {
            toastApiError(err, "Failed to suspend staff member", tenantSlug);
        } finally {
            setActionLoadingId(null);
        }
    };

    const handleReactivate = async (member: StaffMemberDto) => {
        try {
            setActionLoadingId(member.id);
            await staffService.reactivateStaffMember(member.id, tenantSlug);
            toast.success(`Reactivated access for ${member.fullName}`);
            await loadData();
        } catch (err: unknown) {
            toastApiError(err, "Failed to reactivate staff member", tenantSlug);
        } finally {
            setActionLoadingId(null);
        }
    };

    const handleOpenRevoke = (member: StaffMemberDto) => {
        if (isSelfWorkspaceMember(member, currentIdentity)) {
            toast.error(SELF_ACTION_MESSAGES.workspaceRevoke);
            return;
        }
        setRevokeTarget(member);
    };

    const handleRevokeConfirm = async () => {
        if (!revokeTarget) return;
        if (isSelfWorkspaceMember(revokeTarget, currentIdentity)) {
            toast.error(SELF_ACTION_MESSAGES.workspaceRevoke);
            setRevokeTarget(null);
            return;
        }
        setSubmittingRevoke(true);
        try {
            await staffService.revokeStaffMember(revokeTarget.id, tenantSlug);
            toast.success(
                revokeTarget.status === "Invited" || revokeTarget.status === "Expired"
                    ? `Revoked invitation for ${revokeTarget.fullName}`
                    : `Revoked workspace access for ${revokeTarget.fullName}`
            );
            setRevokeTarget(null);
            await loadData();
        } catch (err: unknown) {
            toastApiError(err, "Failed to revoke staff member", tenantSlug);
        } finally {
            setSubmittingRevoke(false);
        }
    };

    const handleReinvite = async (member: StaffMemberDto) => {
        setResendingId(member.id);
        try {
            const reinvited = await staffService.inviteStaffMember({
                tenantSlug,
                fullName: member.fullName,
                email: member.email,
                role: member.role,
                facilityId: member.facilityId || undefined,
                sendEmail: true,
            });
            const inviteUrl = reinvited.invitationToken
                ? `${window.location.origin}/invitations/${reinvited.invitationToken}`
                : "";
            if (inviteUrl) {
                navigator.clipboard.writeText(inviteUrl);
                setCreatedInviteModal({
                    open: true,
                    fullName: reinvited.fullName,
                    email: reinvited.email,
                    role: reinvited.role,
                    inviteUrl,
                    sentEmail: true,
                });
            } else {
                toast.success(`Re-invited ${member.fullName} and sent a new invitation email.`);
            }
            await loadData();
        } catch (err: unknown) {
            toastApiError(err, "Failed to re-invite member", tenantSlug);
        } finally {
            setResendingId(null);
        }
    };

    const handleOpenDelete = (member: StaffMemberDto) => {
        if (isSelfWorkspaceMember(member, currentIdentity)) {
            toast.error(SELF_ACTION_MESSAGES.workspaceDelete);
            return;
        }
        setDeleteTarget(member);
    };

    const handlePermanentDeleteConfirm = async () => {
        if (!deleteTarget) return;
        if (isSelfWorkspaceMember(deleteTarget, currentIdentity)) {
            toast.error(SELF_ACTION_MESSAGES.workspaceDelete);
            setDeleteTarget(null);
            return;
        }
        setSubmittingDelete(true);
        try {
            await staffService.deleteStaffMemberPermanently(deleteTarget.id, tenantSlug);
            toast.success(`Permanently removed ${deleteTarget.fullName} from workspace`);
            setDeleteTarget(null);
            await loadData();
        } catch (err: unknown) {
            toastApiError(err, "Failed to permanently remove member", tenantSlug);
        } finally {
            setSubmittingDelete(false);
        }
    };

    const handleOpenResetPassword = (member: StaffMemberDto) => {
        setResetTarget(member);
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
            const res = await staffService.resetStaffMemberPassword(resetTarget.id, tenantSlug, {
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

            await loadData();
        } catch (err: unknown) {
            setResetError(apiErrorMessage(err, "Failed to reset password."));
        } finally {
            setSubmittingReset(false);
        }
    };

    const existingEmailMember = React.useMemo(() => {
        const normalized = email.trim().toLowerCase();
        if (!normalized) return null;
        return (staffData?.members || []).find(
            (m) => m.email.trim().toLowerCase() === normalized
        ) || null;
    }, [email, staffData?.members]);

    const quota = staffData?.quota;
    const currentSeats = quota?.currentCount ?? 1;
    const maxSeats = quota?.maxAllowed ?? 3;
    const isUnlimited = maxSeats >= 9999;
    const isQuotaFull = !isUnlimited && currentSeats >= maxSeats;
    const availableSeats = isUnlimited ? 9999 : Math.max(0, maxSeats - currentSeats);
    const usagePercentage = isUnlimited ? 20 : Math.min(100, Math.round((currentSeats / maxSeats) * 100));

    const members = (staffData?.members || []).filter(m => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
            m.fullName.toLowerCase().includes(q) ||
            m.email.toLowerCase().includes(q) ||
            m.role.toLowerCase().includes(q) ||
            (m.facilityName && m.facilityName.toLowerCase().includes(q))
        );
    });

    return (
        <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
            {/* 1. Header Section */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-lg bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 shrink-0">
                            <IconUsers className="h-5 w-5" />
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight">
                            Workspace Team
                        </h1>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                        Manage tenant administrators, finance billers, and portal analysts.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <Button
                        onClick={() => setInviteOpen(true)}
                        disabled={loading || isQuotaFull}
                        className="rounded-xl shadow-sm gap-2 font-semibold"
                    >
                        <IconUserPlus className="h-4 w-4" />
                        <span>Invite Workspace Member</span>
                    </Button>
                </div>
            </div>

            {/* 2. Seat Quota & Allocation Banner */}
            <Card className="rounded-2xl border-slate-200/80 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950 overflow-hidden">
                <div className="p-5 sm:p-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                                    Subscription Capacity
                                </span>
                                <Badge variant="outline" className="text-xs font-semibold px-2 py-0.5 bg-slate-50 dark:bg-slate-900">
                                    {quota?.planTitle || "Starter"} Plan
                                </Badge>
                            </div>
                            <div className="text-2xl sm:text-3xl font-extrabold text-slate-800 dark:text-slate-100 flex items-baseline gap-2">
                                <span>{currentSeats}</span>
                                <span className="text-base text-slate-400 font-semibold font-sans">
                                    / {isUnlimited ? "Unlimited" : `${maxSeats} Seats`}
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 font-medium">
                                {isUnlimited 
                                    ? "Your enterprise subscription includes unlimited workspace member accounts."
                                    : isQuotaFull
                                        ? "All allocated workspace seats for your current plan are in use."
                                        : `${availableSeats} member seat${availableSeats === 1 ? "" : "s"} available for new invitations.`
                                }
                            </p>
                        </div>

                        {/* Progress meter and upgrade callout */}
                        <div className="w-full md:w-72 lg:w-80 flex flex-col gap-2">
                            <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300">
                                <span>Seat Allocation</span>
                                <span>{usagePercentage}%</span>
                            </div>
                            <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div 
                                    className={`h-full transition-all duration-500 rounded-full ${
                                        isQuotaFull 
                                            ? "bg-rose-500" 
                                            : usagePercentage >= 80 
                                                ? "bg-amber-500" 
                                                : "bg-primary"
                                    }`}
                                    style={{ width: `${usagePercentage}%` }}
                                />
                            </div>

                            {isQuotaFull && (
                                <div className="mt-1">
                                    <Link href={`/${tenantSlug}/dashboard/billing?tab=plans`}>
                                        <Button 
                                            variant="outline" 
                                            size="sm"
                                            className="w-full h-8 text-xs font-semibold rounded-lg border-amber-300 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 hover:bg-amber-100/60 flex items-center justify-between"
                                        >
                                            <span className="flex items-center gap-1.5">
                                                <IconCreditCard className="h-3.5 w-3.5 text-amber-600" />
                                                Upgrade for More Seats
                                            </span>
                                            <IconArrowRight className="h-3 w-3" />
                                        </Button>
                                    </Link>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </Card>

            {/* 3. Team Roster Card & Filter */}
            <Card className="rounded-2xl border-slate-200/80 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950">
                <CardHeader className="p-5 sm:p-6 pb-3 border-b border-slate-100 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <CardTitle className="text-base sm:text-lg font-bold">Workspace Team Directory</CardTitle>
                        <CardDescription className="text-xs text-slate-500 mt-0.5">
                            Active workspace administrators, financial billers, and analytical members.
                        </CardDescription>
                    </div>

                    <div className="relative w-full sm:w-64">
                        <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            type="text"
                            placeholder="Filter members..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 h-9 text-xs rounded-xl bg-slate-50/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800"
                        />
                    </div>
                </CardHeader>

                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center p-12 text-slate-400 gap-2">
                            <IconLoader className="h-6 w-6 animate-spin text-primary" />
                            <span className="text-xs font-semibold">Loading team members...</span>
                        </div>
                    ) : members.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-12 text-center">
                            <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-900 text-slate-400 mb-3">
                                <IconUsers className="h-6 w-6" />
                            </div>
                            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">No team members found</h3>
                            <p className="text-xs text-slate-500 max-w-xs mt-1">
                                {searchQuery ? "No members match your search criteria." : "Invite administrative and billing colleagues to help govern this workspace."}
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                    <tr className="border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-900/20 text-slate-500 font-semibold">
                                        <th className="py-3 px-4 sm:px-6">Team Member</th>
                                        <th className="py-3 px-4">Workspace Role</th>
                                        <th className="py-3 px-4">Access Scope</th>
                                        <th className="py-3 px-4">Status</th>
                                        <th className="py-3 px-4 hidden md:table-cell">Added On</th>
                                        <th className="py-3 px-4 sm:px-6 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                    {members.map((member) => {
                                        const roleMeta = ROLE_DETAILS[member.role] || ROLE_DETAILS.Viewer;
                                        const isOwner = member.role === "Owner";
                                        const isPending = member.status === "Invited";
                                        const isExpired = member.status === "Expired";
                                        const isSuspended = member.status === "Suspended";
                                        const isRevoked = member.status === "Revoked";
                                        const isActive = member.status === "Active";
                                        const restriction = getWorkspaceMemberActionRestriction(member, currentIdentity);

                                        // Initials for avatar
                                        const initials = member.fullName
                                            .split(" ")
                                            .map((n) => n[0])
                                            .filter(Boolean)
                                            .slice(0, 2)
                                            .join("")
                                            .toUpperCase() || "U";

                                        return (
                                            <tr key={member.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40 transition-colors">
                                                <td className="py-3.5 px-4 sm:px-6">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`size-8 rounded-full flex items-center justify-center font-bold text-[11px] shrink-0 ${
                                                            isOwner 
                                                                ? "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300"
                                                                : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                                        }`}>
                                                            {initials}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="font-bold text-slate-900 dark:text-slate-100 truncate flex items-center gap-1.5">
                                                                <span className="truncate">{member.fullName}</span>
                                                                {restriction.isSelf && (
                                                                    <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4 font-medium shrink-0">
                                                                        You
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                            <div className="text-[11px] text-slate-400 truncate flex items-center gap-1">
                                                                <IconMail className="h-3 w-3 inline shrink-0" />
                                                                {member.email}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="py-3.5 px-4">
                                                    <Badge 
                                                        variant="outline" 
                                                        className={`text-[10px] font-bold px-2 py-0.5 border ${roleMeta.badgeClass}`}
                                                    >
                                                        {roleMeta.label}
                                                    </Badge>
                                                </td>
                                                <td className="py-3.5 px-4">
                                                    {member.facilityName ? (
                                                        <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-medium">
                                                            <IconBuildingHospital className="h-3.5 w-3.5 text-primary shrink-0" />
                                                            {member.facilityName}
                                                        </span>
                                                    ) : (
                                                        <span className="text-slate-500 font-medium">Entire Workspace</span>
                                                    )}
                                                </td>
                                                <td className="py-3.5 px-4">
                                                    {isPending && (
                                                        <div className="flex flex-col gap-0.5">
                                                            <Badge variant="outline" className="text-[10px] font-semibold gap-1 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border-blue-200 dark:border-blue-800 w-fit">
                                                                <IconClock className="h-3 w-3" />
                                                                Invited
                                                            </Badge>
                                                            {member.invitationExpiresAt && (
                                                                <span className="text-[10px] text-slate-400">
                                                                    {new Date(member.invitationExpiresAt) < new Date()
                                                                        ? "Expired"
                                                                        : `Expires ${new Date(member.invitationExpiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                    {isExpired && (
                                                        <div className="flex flex-col gap-0.5">
                                                            <Badge variant="outline" className="text-[10px] font-semibold gap-1 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-800 w-fit">
                                                                <IconAlertCircle className="h-3 w-3" />
                                                                Expired
                                                            </Badge>
                                                            <span className="text-[10px] text-slate-400">Token Expired</span>
                                                        </div>
                                                    )}
                                                    {isSuspended && (
                                                        <Badge variant="outline" className="text-[10px] font-semibold gap-1 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700 w-fit">
                                                            <IconPlayerPause className="h-3 w-3" />
                                                            Suspended
                                                        </Badge>
                                                    )}
                                                    {isRevoked && (
                                                        <Badge variant="outline" className="text-[10px] font-semibold gap-1 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border-rose-200 dark:border-rose-800 w-fit">
                                                            <IconTrash className="h-3 w-3" />
                                                            Revoked
                                                        </Badge>
                                                    )}
                                                    {isActive && (
                                                        <Badge variant="outline" className="text-[10px] font-semibold gap-1 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 w-fit">
                                                            <IconCheck className="h-3 w-3" />
                                                            Active
                                                        </Badge>
                                                    )}
                                                </td>
                                                <td className="py-3.5 px-4 hidden md:table-cell text-slate-400 text-[11px]">
                                                    {new Date(member.createdAt).toLocaleDateString("en-US", {
                                                        month: "short",
                                                        day: "numeric",
                                                        year: "numeric"
                                                    })}
                                                </td>
                                                <td className="py-3.5 px-4 sm:px-6 text-right">
                                                    {isOwner ? (
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                                            Owner
                                                        </span>
                                                    ) : (
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            {isPending && (
                                                                <>
                                                                    {member.invitationToken && (
                                                                        <Button
                                                                            size="sm"
                                                                            variant="outline"
                                                                            onClick={() => handleCopyInviteLink(member.invitationToken)}
                                                                            title="Copy direct invitation link"
                                                                            className="h-8 px-2.5 text-slate-700 dark:text-slate-200 hover:text-primary rounded-lg text-xs font-semibold gap-1.5 border-slate-200 dark:border-slate-800"
                                                                        >
                                                                            <IconCopy className="h-3.5 w-3.5" />
                                                                            <span className="hidden lg:inline">Copy Link</span>
                                                                        </Button>
                                                                    )}
                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline"
                                                                        disabled={resendingId === member.id}
                                                                        onClick={() => handleResendInvite(member)}
                                                                        title="Resend invitation"
                                                                        className="h-8 px-2.5 text-slate-700 dark:text-slate-200 hover:text-primary rounded-lg text-xs font-semibold gap-1.5 border-slate-200 dark:border-slate-800"
                                                                    >
                                                                        {resendingId === member.id ? (
                                                                            <IconLoader className="h-3.5 w-3.5 animate-spin" />
                                                                        ) : (
                                                                            <IconRefresh className="h-3.5 w-3.5" />
                                                                        )}
                                                                        <span className="hidden lg:inline">Resend</span>
                                                                    </Button>
                                                                    <span
                                                                        title={restriction.revokeTooltip}
                                                                        className={!restriction.canRevoke ? "inline-flex cursor-not-allowed" : "inline-flex"}
                                                                    >
                                                                        <Button
                                                                            size="sm"
                                                                            variant="ghost"
                                                                            disabled={!restriction.canRevoke}
                                                                            onClick={() => handleOpenRevoke(member)}
                                                                            title={restriction.revokeTooltip}
                                                                            aria-label={restriction.revokeTooltip}
                                                                            className="h-8 px-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-40 rounded-lg text-xs font-semibold gap-1"
                                                                        >
                                                                            <IconTrash className="h-3.5 w-3.5" />
                                                                            <span className="hidden sm:inline">Revoke</span>
                                                                        </Button>
                                                                    </span>
                                                                </>
                                                            )}

                                                            {isExpired && (
                                                                <>
                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline"
                                                                        disabled={resendingId === member.id}
                                                                        onClick={() => handleResendInvite(member)}
                                                                        title="Resend fresh invitation email"
                                                                        className="h-8 px-2.5 text-slate-700 dark:text-slate-200 hover:text-primary rounded-lg text-xs font-semibold gap-1.5 border-slate-200 dark:border-slate-800"
                                                                    >
                                                                        {resendingId === member.id ? (
                                                                            <IconLoader className="h-3.5 w-3.5 animate-spin" />
                                                                        ) : (
                                                                            <IconRefresh className="h-3.5 w-3.5" />
                                                                        )}
                                                                        <span className="hidden lg:inline">Resend</span>
                                                                    </Button>
                                                                    <span
                                                                        title={restriction.revokeTooltip}
                                                                        className={!restriction.canRevoke ? "inline-flex cursor-not-allowed" : "inline-flex"}
                                                                    >
                                                                        <Button
                                                                            size="sm"
                                                                            variant="ghost"
                                                                            disabled={!restriction.canRevoke}
                                                                            onClick={() => handleOpenRevoke(member)}
                                                                            title={restriction.revokeTooltip}
                                                                            aria-label={restriction.revokeTooltip}
                                                                            className="h-8 px-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-40 rounded-lg text-xs font-semibold gap-1"
                                                                        >
                                                                            <IconTrash className="h-3.5 w-3.5" />
                                                                            <span className="hidden sm:inline">Revoke</span>
                                                                        </Button>
                                                                    </span>
                                                                </>
                                                            )}

                                                            {isActive && (
                                                                <>
                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline"
                                                                        onClick={() => handleOpenEdit(member)}
                                                                        title="Edit Details"
                                                                        className="h-8 px-2.5 text-slate-700 dark:text-slate-200 hover:text-primary rounded-lg text-xs font-semibold gap-1.5 border-slate-200 dark:border-slate-800"
                                                                    >
                                                                        <IconPencil className="h-3.5 w-3.5" />
                                                                        <span className="hidden lg:inline">Edit Details</span>
                                                                    </Button>
                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline"
                                                                        onClick={() => handleOpenResetPassword(member)}
                                                                        title="Reset Password"
                                                                        className="h-8 px-2.5 text-slate-700 dark:text-slate-200 hover:text-primary rounded-lg text-xs font-semibold gap-1.5 border-slate-200 dark:border-slate-800"
                                                                    >
                                                                        <IconKey className="h-3.5 w-3.5" />
                                                                        <span className="hidden lg:inline">Reset Password</span>
                                                                    </Button>
                                                                    <span
                                                                        title={restriction.suspendTooltip}
                                                                        className={!restriction.canSuspend ? "inline-flex cursor-not-allowed" : "inline-flex"}
                                                                    >
                                                                        <Button
                                                                            size="sm"
                                                                            variant="ghost"
                                                                            disabled={actionLoadingId === member.id || !restriction.canSuspend}
                                                                            onClick={() => handleSuspend(member)}
                                                                            title={restriction.suspendTooltip}
                                                                            aria-label={restriction.suspendTooltip}
                                                                            className="h-8 px-2 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/40 disabled:opacity-40 rounded-lg text-xs font-semibold gap-1"
                                                                        >
                                                                            {actionLoadingId === member.id ? (
                                                                                <IconLoader className="h-3.5 w-3.5 animate-spin" />
                                                                            ) : (
                                                                                <IconPlayerPause className="h-3.5 w-3.5" />
                                                                            )}
                                                                            <span className="hidden sm:inline">Suspend</span>
                                                                        </Button>
                                                                    </span>
                                                                    <span
                                                                        title={restriction.revokeTooltip}
                                                                        className={!restriction.canRevoke ? "inline-flex cursor-not-allowed" : "inline-flex"}
                                                                    >
                                                                        <Button
                                                                            size="sm"
                                                                            variant="ghost"
                                                                            disabled={!restriction.canRevoke}
                                                                            onClick={() => handleOpenRevoke(member)}
                                                                            title={restriction.revokeTooltip}
                                                                            aria-label={restriction.revokeTooltip}
                                                                            className="h-8 px-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-40 rounded-lg text-xs font-semibold gap-1"
                                                                        >
                                                                            <IconBan className="h-3.5 w-3.5" />
                                                                            <span className="hidden sm:inline">Revoke</span>
                                                                        </Button>
                                                                    </span>
                                                                </>
                                                            )}

                                                            {isSuspended && (
                                                                <>
                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline"
                                                                        disabled={actionLoadingId === member.id}
                                                                        onClick={() => handleReactivate(member)}
                                                                        title="Reactivate Account"
                                                                        className="h-8 px-2.5 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded-lg text-xs font-semibold gap-1.5"
                                                                    >
                                                                        {actionLoadingId === member.id ? (
                                                                            <IconLoader className="h-3.5 w-3.5 animate-spin" />
                                                                        ) : (
                                                                            <IconPlayerPlay className="h-3.5 w-3.5" />
                                                                        )}
                                                                        <span>Reactivate</span>
                                                                    </Button>
                                                                    <span
                                                                        title={restriction.revokeTooltip}
                                                                        className={!restriction.canRevoke ? "inline-flex cursor-not-allowed" : "inline-flex"}
                                                                    >
                                                                        <Button
                                                                            size="sm"
                                                                            variant="ghost"
                                                                            disabled={!restriction.canRevoke}
                                                                            onClick={() => handleOpenRevoke(member)}
                                                                            title={restriction.revokeTooltip}
                                                                            aria-label={restriction.revokeTooltip}
                                                                            className="h-8 px-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-40 rounded-lg text-xs font-semibold gap-1"
                                                                        >
                                                                            <IconBan className="h-3.5 w-3.5" />
                                                                            <span className="hidden sm:inline">Revoke</span>
                                                                        </Button>
                                                                    </span>
                                                                    <span
                                                                        title={restriction.deleteTooltip}
                                                                        className={!restriction.canDelete ? "inline-flex cursor-not-allowed" : "inline-flex"}
                                                                    >
                                                                        <Button
                                                                            size="sm"
                                                                            variant="ghost"
                                                                            disabled={!restriction.canDelete}
                                                                            onClick={() => handleOpenDelete(member)}
                                                                            title={restriction.deleteTooltip}
                                                                            aria-label={restriction.deleteTooltip}
                                                                            className="h-8 px-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-40 rounded-lg text-xs font-semibold gap-1"
                                                                        >
                                                                            <IconTrash className="h-3.5 w-3.5" />
                                                                            <span className="hidden sm:inline">Remove</span>
                                                                        </Button>
                                                                    </span>
                                                                </>
                                                            )}

                                                            {isRevoked && (
                                                                <>
                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline"
                                                                        disabled={resendingId === member.id || isQuotaFull}
                                                                        onClick={() => handleReinvite(member)}
                                                                        title="Send a fresh 7-day invitation"
                                                                        className="h-8 px-2.5 text-slate-700 dark:text-slate-200 hover:text-primary rounded-lg text-xs font-semibold gap-1.5 border-slate-200 dark:border-slate-800"
                                                                    >
                                                                        {resendingId === member.id ? (
                                                                            <IconLoader className="h-3.5 w-3.5 animate-spin" />
                                                                        ) : (
                                                                            <IconRefresh className="h-3.5 w-3.5" />
                                                                        )}
                                                                        <span>Re-invite</span>
                                                                    </Button>
                                                                    <span
                                                                        title={restriction.deleteTooltip}
                                                                        className={!restriction.canDelete ? "inline-flex cursor-not-allowed" : "inline-flex"}
                                                                    >
                                                                        <Button
                                                                            size="sm"
                                                                            variant="ghost"
                                                                            disabled={!restriction.canDelete}
                                                                            onClick={() => handleOpenDelete(member)}
                                                                            title={restriction.deleteTooltip}
                                                                            aria-label={restriction.deleteTooltip}
                                                                            className="h-8 px-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-40 rounded-lg text-xs font-semibold gap-1"
                                                                        >
                                                                            <IconTrash className="h-3.5 w-3.5" />
                                                                            <span className="hidden sm:inline">Remove</span>
                                                                        </Button>
                                                                    </span>
                                                                </>
                                                            )}
                                                        </div>
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

            {/* 4. Invite Team Member Dialog */}
            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                <DialogContent className="sm:max-w-md rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold flex items-center gap-2">
                            <IconUserPlus className="h-5 w-5 text-primary" />
                            Invite Workspace Member
                        </DialogTitle>
                        <DialogDescription className="text-xs text-slate-500">
                            Add an administrator, finance biller, or analyst with portal access.
                        </DialogDescription>
                    </DialogHeader>

                    {inviteError && (
                        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2">
                            <IconAlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                            <span>{inviteError}</span>
                        </div>
                    )}

                    <form onSubmit={handleInviteSubmit} className="space-y-4 pt-1">
                        <div className="space-y-1.5">
                            <Label htmlFor="fullName" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                Full Name <span className="text-rose-500">*</span>
                            </Label>
                            <Input
                                id="fullName"
                                placeholder="e.g. Alex Morgan"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                className="h-9 text-xs rounded-xl"
                                required
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="email" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                Email Address <span className="text-rose-500">*</span>
                            </Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="staff@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="h-9 text-xs rounded-xl"
                                required
                            />
                            {existingEmailMember && existingEmailMember.status === "Active" && (
                                <div className="mt-1.5 p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2">
                                    <IconAlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                                    <div>
                                        <strong>Existing Active Member:</strong> {existingEmailMember.fullName} ({existingEmailMember.email}) is already an active member of this workspace ({ROLE_DETAILS[existingEmailMember.role]?.label || existingEmailMember.role}).
                                    </div>
                                </div>
                            )}
                            {existingEmailMember && (existingEmailMember.status === "Invited" || existingEmailMember.status === "Expired") && (
                                <div className="mt-1.5 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs space-y-2">
                                    <div className="flex items-start gap-2">
                                        <IconClock className="h-4 w-4 shrink-0 mt-0.5" />
                                        <div>
                                            <strong>{existingEmailMember.status === "Expired" ? "Expired" : "Pending"} Invitation Detected:</strong> {existingEmailMember.fullName} ({existingEmailMember.email}) already has {existingEmailMember.status === "Expired" ? "an expired" : "a pending"} invitation as {ROLE_DETAILS[existingEmailMember.role]?.label || existingEmailMember.role}.
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 pl-6">
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            disabled={resendingId === existingEmailMember.id}
                                            onClick={async () => {
                                                await handleResendInvite(existingEmailMember);
                                                setInviteOpen(false);
                                            }}
                                            className="h-7 px-2.5 text-[11px] font-semibold rounded-lg gap-1 bg-white dark:bg-slate-900"
                                        >
                                            <IconRefresh className="h-3 w-3" />
                                            <span>Resend Invitation Instead</span>
                                        </Button>
                                        {existingEmailMember.status === "Invited" && existingEmailMember.invitationToken && (
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleCopyInviteLink(existingEmailMember.invitationToken)}
                                                className="h-7 px-2.5 text-[11px] font-semibold rounded-lg gap-1 bg-white dark:bg-slate-900"
                                            >
                                                <IconCopy className="h-3 w-3" />
                                                <span>Copy Link</span>
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            )}
                            {existingEmailMember && existingEmailMember.status === "Suspended" && (
                                <div className="mt-1.5 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs space-y-2">
                                    <div className="flex items-start gap-2">
                                        <IconAlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                                        <div>
                                            <strong>Suspended Account Detected:</strong> {existingEmailMember.fullName} ({existingEmailMember.email}) is currently suspended in this workspace.
                                        </div>
                                    </div>
                                    <div className="pl-6">
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            disabled={actionLoadingId === existingEmailMember.id}
                                            onClick={async () => {
                                                await handleReactivate(existingEmailMember);
                                                setInviteOpen(false);
                                            }}
                                            className="h-7 px-2.5 text-[11px] font-semibold rounded-lg gap-1 bg-white dark:bg-slate-900"
                                        >
                                            <IconPlayerPlay className="h-3 w-3" />
                                            <span>Reactivate Account Instead</span>
                                        </Button>
                                    </div>
                                </div>
                            )}
                            {existingEmailMember && existingEmailMember.status === "Revoked" && (
                                <div className="mt-1.5 p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs flex items-start gap-2">
                                    <IconRefresh className="h-4 w-4 shrink-0 mt-0.5" />
                                    <div>
                                        <strong>Previously Revoked Member:</strong> {existingEmailMember.fullName} ({existingEmailMember.email}) was previously revoked. Submitting this form will re-invite them with a fresh 7-day invitation token.
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="role" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                Workspace Role <span className="text-rose-500">*</span>
                            </Label>
                            <select
                                id="role"
                                value={role}
                                onChange={(e) => {
                                    const newRole = e.target.value;
                                    setRole(newRole);
                                    if (newRole !== "Facility Administrator") {
                                        setFacilityId("");
                                    }
                                }}
                                className="w-full h-9 px-3 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/20"
                            >
                                <option value="Admin">Tenant Administrator (Manage branches, invites, &amp; tenancy settings)</option>
                                <option value="Facility Administrator">Facility Administrator (Branch clinical operations &amp; local settings)</option>
                                <option value="Biller">Biller / Finance (Manage subscriptions, checkout sessions, &amp; invoices)</option>
                                <option value="Viewer">Viewer / Analyst (Read-only access to tenancy health &amp; branch stats)</option>
                            </select>
                            <p className="text-[11px] text-slate-400">
                                {ROLE_DETAILS[role]?.description}
                            </p>
                        </div>

                        {role === "Facility Administrator" && (
                            <div className="space-y-1.5">
                                <Label htmlFor="facilityId" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                    Assigned Branch / Facility <span className="text-rose-500">*</span>
                                </Label>
                                <select
                                    id="facilityId"
                                    value={facilityId}
                                    onChange={(e) => setFacilityId(e.target.value)}
                                    className="w-full h-9 px-3 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/20"
                                    required
                                >
                                    <option value="">Select a branch / facility...</option>
                                    {facilities.map((fac) => (
                                        <option key={fac.id} value={fac.id}>
                                            {fac.name} ({fac.facilityType})
                                        </option>
                                    ))}
                                </select>
                                <p className="text-[11px] text-slate-400">
                                    Designate which branch facility this administrator manages in the portal.
                                </p>
                            </div>
                        )}

                        {/* Delivery Method Choice */}
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                Delivery Method
                            </Label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setSendEmail(true)}
                                    className={`p-3 rounded-xl border text-left transition-all ${
                                        sendEmail
                                            ? "border-primary bg-primary/10 text-primary font-bold shadow-xs"
                                            : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900"
                                    }`}
                                >
                                    <div className="flex items-center gap-1.5 mb-1 font-semibold text-xs">
                                        <IconMail className="h-4 w-4" />
                                        <span>Send Invitation Email</span>
                                    </div>
                                    <p className="text-[10px] text-slate-500 font-normal">
                                        Dispatches invitation email automatically.
                                    </p>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setSendEmail(false)}
                                    className={`p-3 rounded-xl border text-left transition-all ${
                                        !sendEmail
                                            ? "border-primary bg-primary/10 text-primary font-bold shadow-xs"
                                            : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900"
                                    }`}
                                >
                                    <div className="flex items-center gap-1.5 mb-1 font-semibold text-xs">
                                        <IconCopy className="h-4 w-4" />
                                        <span>Copy Invite Link Only</span>
                                    </div>
                                    <p className="text-[10px] text-slate-500 font-normal">
                                        Generates secure link for manual sharing.
                                    </p>
                                </button>
                            </div>
                        </div>

                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-start gap-2.5">
                            <IconAlertCircle className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                            <span className="leading-relaxed">
                                <strong className="text-slate-700 dark:text-slate-300">Looking to add Doctors, Nurses, or Pharmacists?</strong> Clinical staff are authenticated locally using each facility&apos;s own JWT signing key. Add clinical practitioners directly within their workstation app (Clinic, Laboratory, or Pharmacy).
                            </span>
                        </div>

                        <DialogFooter className="gap-2 pt-2 sm:justify-end">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setInviteOpen(false)}
                                disabled={submittingInvite}
                                className="rounded-xl text-xs"
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={
                                    submittingInvite ||
                                    isQuotaFull ||
                                    (!!existingEmailMember && existingEmailMember.status !== "Revoked")
                                }
                                className="rounded-xl text-xs font-semibold gap-1.5"
                            >
                                {submittingInvite ? (
                                    <>
                                        <IconLoader className="h-3.5 w-3.5 animate-spin" />
                                        <span>Sending Invitation...</span>
                                    </>
                                ) : (
                                    <>
                                        <IconUserPlus className="h-3.5 w-3.5" />
                                        <span>Send Invitation</span>
                                    </>
                                )}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* 5. Edit Staff Member Dialog */}
            <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
                <DialogContent className="sm:max-w-md rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold flex items-center gap-2">
                            <IconPencil className="h-5 w-5 text-primary" />
                            Edit Staff Member
                        </DialogTitle>
                        <DialogDescription className="text-xs text-slate-500">
                            Update workspace details and clinical branch assignment for {editTarget?.fullName}.
                        </DialogDescription>
                    </DialogHeader>

                    {editError && (
                        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2">
                            <IconAlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                            <span>{editError}</span>
                        </div>
                    )}

                    <form onSubmit={handleEditSubmit} className="space-y-4 pt-1">
                        <div className="space-y-1.5">
                            <Label htmlFor="editFullName" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                Full Name <span className="text-rose-500">*</span>
                            </Label>
                            <Input
                                id="editFullName"
                                placeholder="e.g. Alex Morgan"
                                value={editFullName}
                                onChange={(e) => setEditFullName(e.target.value)}
                                className="h-9 text-xs rounded-xl"
                                required
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="editRole" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                Workspace Role <span className="text-rose-500">*</span>
                            </Label>
                            <select
                                id="editRole"
                                value={editRole}
                                onChange={(e) => {
                                    const newRole = e.target.value;
                                    setEditRole(newRole);
                                    if (newRole !== "Facility Administrator") {
                                        setEditFacilityId("");
                                    }
                                }}
                                className="w-full h-9 px-3 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/20"
                            >
                                <option value="Admin">Tenant Administrator (Manage branches, invites, &amp; tenancy settings)</option>
                                <option value="Facility Administrator">Facility Administrator (Branch clinical operations &amp; local settings)</option>
                                <option value="Biller">Biller / Finance (Manage subscriptions, checkout sessions, &amp; invoices)</option>
                                <option value="Viewer">Viewer / Analyst (Read-only access to tenancy health &amp; branch stats)</option>
                            </select>
                        </div>

                        {editRole === "Facility Administrator" && (
                            <div className="space-y-1.5">
                                <Label htmlFor="editFacilityId" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                    Assigned Branch / Facility <span className="text-rose-500">*</span>
                                </Label>
                                <select
                                    id="editFacilityId"
                                    value={editFacilityId}
                                    onChange={(e) => setEditFacilityId(e.target.value)}
                                    className="w-full h-9 px-3 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/20"
                                    required
                                >
                                    <option value="">Select a branch / facility...</option>
                                    {facilities.map((fac) => (
                                        <option key={fac.id} value={fac.id}>
                                            {fac.name} ({fac.facilityType})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <DialogFooter className="gap-2 pt-2 sm:justify-end">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setEditTarget(null)}
                                disabled={submittingEdit}
                                className="rounded-xl text-xs"
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={submittingEdit}
                                className="rounded-xl text-xs font-semibold gap-1.5"
                            >
                                {submittingEdit ? (
                                    <>
                                        <IconLoader className="h-3.5 w-3.5 animate-spin" />
                                        <span>Saving Changes...</span>
                                    </>
                                ) : (
                                    <>
                                        <IconCheck className="h-3.5 w-3.5" />
                                        <span>Save Changes</span>
                                    </>
                                )}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* 6. Revoke Staff Confirmation Dialog */}
            <Dialog open={!!revokeTarget} onOpenChange={(open) => !open && setRevokeTarget(null)}>
                <DialogContent className="sm:max-w-md rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold text-rose-600 dark:text-rose-400 flex items-center gap-2">
                            <IconBan className="h-5 w-5" />
                            {revokeTarget?.status === "Invited" || revokeTarget?.status === "Expired"
                                ? "Revoke Invitation"
                                : "Revoke Workspace Access"}
                        </DialogTitle>
                        <DialogDescription className="text-xs text-slate-500">
                            {revokeTarget?.status === "Invited" || revokeTarget?.status === "Expired" ? (
                                <>
                                    Are you sure you want to revoke the pending invitation for <strong>{revokeTarget?.fullName}</strong> ({revokeTarget?.email})?
                                </>
                            ) : (
                                <>
                                    Are you sure you want to revoke workspace access for <strong>{revokeTarget?.fullName}</strong> ({revokeTarget?.email})?
                                </>
                            )}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-300">
                        {revokeTarget?.status === "Invited" || revokeTarget?.status === "Expired"
                            ? "This will invalidate their invitation link, free up 1 seat in your subscription quota, and mark the record as Revoked. You can re-invite or permanently remove them afterwards."
                            : "This will immediately terminate their workspace access, free up 1 seat in your subscription quota, and keep the record in Revoked state for audit history. You can re-invite or permanently remove them afterwards."}
                    </div>

                    <DialogFooter className="gap-2 pt-2 sm:justify-end">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setRevokeTarget(null)}
                            disabled={submittingRevoke}
                            className="rounded-xl text-xs"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={handleRevokeConfirm}
                            disabled={submittingRevoke}
                            className="rounded-xl text-xs font-semibold gap-1.5"
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

            {/* 6b. Permanently Remove Member Dialog (from Revoked state) */}
            <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
                <DialogContent className="sm:max-w-md rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold text-rose-600 dark:text-rose-400 flex items-center gap-2">
                            <IconTrash className="h-5 w-5" />
                            Remove from Workspace
                        </DialogTitle>
                        <DialogDescription className="text-xs text-slate-500">
                            Are you sure you want to permanently remove <strong>{deleteTarget?.fullName}</strong> ({deleteTarget?.email}) from this workspace directory?
                        </DialogDescription>
                    </DialogHeader>

                    <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-300">
                        This will permanently delete the revoked member record from your workspace directory.
                    </div>

                    <DialogFooter className="gap-2 pt-2 sm:justify-end">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setDeleteTarget(null)}
                            disabled={submittingDelete}
                            className="rounded-xl text-xs"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={handlePermanentDeleteConfirm}
                            disabled={submittingDelete}
                            className="rounded-xl text-xs font-semibold gap-1.5"
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

            {/* 6. Created Invite Link Success Dialog */}
            <Dialog open={!!createdInviteModal?.open} onOpenChange={(open) => !open && setCreatedInviteModal(null)}>
                <DialogContent className="sm:max-w-lg rounded-2xl">
                    <DialogHeader className="flex flex-col items-center text-center sm:items-center sm:text-center">
                        <div className="size-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-1">
                            <IconCheck className="h-6 w-6" />
                        </div>
                        <DialogTitle className="text-xl font-bold text-slate-900 dark:text-slate-100 text-center">
                            Invitation Created!
                        </DialogTitle>
                        <DialogDescription className="text-xs text-slate-500 text-center max-w-sm">
                            <strong>{createdInviteModal?.fullName}</strong> ({createdInviteModal?.email}) has been invited as <strong>{createdInviteModal?.role}</strong>.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3 py-2">
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                            {createdInviteModal?.sentEmail
                                ? "An invitation email has been sent. You can also directly copy and share this link via WhatsApp, Slack, or SMS:"
                                : "Invitation link generated (no email was sent). You can directly copy and share this link via WhatsApp, Slack, or SMS:"}
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
                            • This invitation token is valid for <strong>7 days</strong>.<br />
                            • The invitee can sign in or create their personal account to immediately join your workspace.
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

            {/* 7. Reset Password Dialog */}
            <Dialog open={!!resetTarget} onOpenChange={(open) => !open && setResetTarget(null)}>
                <DialogContent className="sm:max-w-md rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold flex items-center gap-2">
                            <IconKey className="h-5 w-5 text-primary" />
                            Reset Member Password
                        </DialogTitle>
                        <DialogDescription className="text-xs text-slate-500">
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
                            <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                Reset Method
                            </Label>
                            <div className="grid grid-cols-1 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setResetMode("email")}
                                    className={`p-3 rounded-xl border text-left transition-all ${
                                        resetMode === "email"
                                            ? "border-primary bg-primary/10 text-primary font-bold shadow-xs"
                                            : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900"
                                    }`}
                                >
                                    <div className="flex items-center gap-1.5 mb-0.5 font-semibold text-xs">
                                        <IconMail className="h-4 w-4" />
                                        <span>Email Reset Link (Recommended)</span>
                                    </div>
                                    <p className="text-[11px] text-slate-500 font-normal">
                                        Emails a secure 7-day self-service password reset link to {resetTarget?.email}.
                                    </p>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setResetMode("link")}
                                    className={`p-3 rounded-xl border text-left transition-all ${
                                        resetMode === "link"
                                            ? "border-primary bg-primary/10 text-primary font-bold shadow-xs"
                                            : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900"
                                    }`}
                                >
                                    <div className="flex items-center gap-1.5 mb-0.5 font-semibold text-xs">
                                        <IconLink className="h-4 w-4" />
                                        <span>Copy Reset Link Only</span>
                                    </div>
                                    <p className="text-[11px] text-slate-500 font-normal">
                                        Generates a 7-day reset link to copy and share manually (no email sent).
                                    </p>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setResetMode("password")}
                                    className={`p-3 rounded-xl border text-left transition-all ${
                                        resetMode === "password"
                                            ? "border-primary bg-primary/10 text-primary font-bold shadow-xs"
                                            : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900"
                                    }`}
                                >
                                    <div className="flex items-center gap-1.5 mb-0.5 font-semibold text-xs">
                                        <IconKey className="h-4 w-4" />
                                        <span>Set Temporary Password Directly</span>
                                    </div>
                                    <p className="text-[11px] text-slate-500 font-normal">
                                        Immediately updates their password and signs out active sessions.
                                    </p>
                                </button>
                            </div>
                        </div>

                        {resetMode === "password" && (
                            <div className="space-y-1.5">
                                <Label htmlFor="resetTempPassword" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                    New Temporary Password <span className="text-rose-500">*</span>
                                </Label>
                                <Input
                                    id="resetTempPassword"
                                    type="text"
                                    placeholder="Minimum 8 characters"
                                    value={resetTempPassword}
                                    onChange={(e) => setResetTempPassword(e.target.value)}
                                    className="h-9 text-xs font-mono rounded-xl"
                                    required
                                />
                                <p className="text-[11px] text-slate-400">
                                    Share this temporary password with the member over a secure channel.
                                </p>
                            </div>
                        )}

                        <DialogFooter className="gap-2 pt-2 sm:justify-end">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setResetTarget(null)}
                                disabled={submittingReset}
                                className="rounded-xl text-xs"
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={submittingReset}
                                className="rounded-xl text-xs font-semibold gap-1.5"
                            >
                                {submittingReset ? (
                                    <>
                                        <IconLoader className="h-3.5 w-3.5 animate-spin" />
                                        <span>Processing...</span>
                                    </>
                                ) : (
                                    <>
                                        <IconKey className="h-3.5 w-3.5" />
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

            {/* 8. Reset Password Result Dialog */}
            <Dialog open={!!resetResultModal?.open} onOpenChange={(open) => !open && setResetResultModal(null)}>
                <DialogContent className="sm:max-w-lg rounded-2xl">
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
                                    Copy the temporary credentials below and share them securely with the member:
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
        </div>
    );
}
