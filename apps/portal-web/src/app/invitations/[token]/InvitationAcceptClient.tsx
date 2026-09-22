"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useUser, SignInButton, SignUpButton } from "@clerk/nextjs";
import { 
    IconBuildingHospital, 
    IconShieldCheck, 
    IconCheck, 
    IconAlertCircle, 
    IconClock, 
    IconArrowRight, 
    IconLoader, 
    IconUser,
    IconMail
} from "@tabler/icons-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { staffService, InvitationDetailsDto } from "@/services/staff.service";
import { toast } from "sonner";

export default function InvitationAcceptClient({ token }: { token: string }) {
    const router = useRouter();
    const { isSignedIn, user, isLoaded } = useUser();

    const [invite, setInvite] = useState<InvitationDetailsDto | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [accepting, setAccepting] = useState(false);

    useEffect(() => {
        const fetchDetails = async () => {
            try {
                const data = await staffService.getInvitationDetails(token);
                setInvite(data);
            } catch (err: any) {
                setError(err.response?.data?.message || err.message || "Failed to load invitation.");
            } finally {
                setLoading(false);
            }
        };

        if (token) {
            fetchDetails();
        }
    }, [token]);

    const handleAccept = async () => {
        if (!invite) return;
        setAccepting(true);
        try {
            const res = await staffService.acceptInvitation(token);
            toast.success(`Welcome to ${res.workspaceName}!`);
            router.push(`/${res.tenantSlug}/dashboard/overview`);
        } catch (err: any) {
            const msg = err.response?.data?.message || err.message || "Failed to accept invitation.";
            toast.error(msg);
            setAccepting(false);
        }
    };

    if (loading || !isLoaded) {
        return (
            <div className="min-h-[70vh] flex flex-col items-center justify-center p-4">
                <Card className="w-full max-w-md p-8 text-center rounded-2xl border-slate-200 dark:border-slate-800 shadow-sm">
                    <IconLoader className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
                    <h2 className="text-base font-bold text-slate-800 dark:text-slate-200">Verifying Invitation...</h2>
                    <p className="text-xs text-slate-400 mt-1">Please wait while we validate your invitation token.</p>
                </Card>
            </div>
        );
    }

    if (error || !invite) {
        return (
            <div className="min-h-[70vh] flex flex-col items-center justify-center p-4">
                <Card className="w-full max-w-md p-6 sm:p-8 text-center rounded-2xl border-rose-200 dark:border-rose-900 shadow-sm bg-rose-50/20 dark:bg-rose-950/20">
                    <div className="size-12 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto mb-3">
                        <IconAlertCircle className="h-6 w-6" />
                    </div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Invalid Invitation Link</h2>
                    <p className="text-xs text-slate-500 mt-1 mb-6">
                        {error || "This invitation link is invalid or has expired."}
                    </p>
                    <Link href="/">
                        <Button variant="outline" className="rounded-xl text-xs font-semibold">
                            Return to Homepage
                        </Button>
                    </Link>
                </Card>
            </div>
        );
    }

    if (invite.isExpired) {
        return (
            <div className="min-h-[70vh] flex flex-col items-center justify-center p-4">
                <Card className="w-full max-w-md p-6 sm:p-8 text-center rounded-2xl border-amber-200 dark:border-amber-900 shadow-sm bg-amber-50/20 dark:bg-amber-950/20">
                    <div className="size-12 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-3">
                        <IconClock className="h-6 w-6" />
                    </div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Invitation Expired</h2>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 mb-6 leading-relaxed">
                        This invitation to join <strong>{invite.tenantName}</strong> was valid for 7 days and has expired. Please contact the clinic administrator to request a refreshed invitation.
                    </p>
                    <Link href="/">
                        <Button variant="outline" className="rounded-xl text-xs font-semibold">
                            Return to Homepage
                        </Button>
                    </Link>
                </Card>
            </div>
        );
    }

    if (invite.isAlreadyAccepted) {
        return (
            <div className="min-h-[70vh] flex flex-col items-center justify-center p-4">
                <Card className="w-full max-w-md p-6 sm:p-8 text-center rounded-2xl border-emerald-200 dark:border-emerald-900 shadow-sm bg-emerald-50/20 dark:bg-emerald-950/20">
                    <div className="size-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-3">
                        <IconCheck className="h-6 w-6" />
                    </div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Already Accepted</h2>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 mb-6">
                        This invitation for <strong>{invite.tenantName}</strong> has already been claimed and activated.
                    </p>
                    <Link href={`/${invite.tenantSlug}/dashboard/overview`}>
                        <Button className="rounded-xl text-xs font-semibold gap-2">
                            <span>Go to Workspace Dashboard</span>
                            <IconArrowRight className="h-4 w-4" />
                        </Button>
                    </Link>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-[80vh] flex flex-col items-center justify-center p-4 sm:p-6">
            <Card className="w-full max-w-lg rounded-2xl border-slate-200 dark:border-slate-800 shadow-md bg-white dark:bg-slate-950 overflow-hidden">
                {/* Header Banner */}
                <div className="p-6 sm:p-8 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-center">
                    <div className="size-14 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center mx-auto mb-3 border border-white/20">
                        <IconBuildingHospital className="h-7 w-7 text-white" />
                    </div>
                    <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
                        ClinicEZ Team Invitation
                    </h1>
                    <p className="text-xs text-indigo-100 mt-1 font-medium">
                        You have been invited to join a clinical healthcare team
                    </p>
                </div>

                <CardContent className="p-6 sm:p-8 space-y-6">
                    {/* Invitation Details Block */}
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 space-y-3">
                        <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                Workspace
                            </span>
                            <div className="text-base font-bold text-slate-900 dark:text-slate-100">
                                {invite.tenantName}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200/60 dark:border-slate-800">
                            <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                    Assigned Role
                                </span>
                                <div className="mt-0.5">
                                    <Badge variant="outline" className="text-xs font-bold px-2 py-0.5 border-purple-200 bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300">
                                        {invite.role}
                                    </Badge>
                                </div>
                            </div>
                            <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                    Clinical Branch
                                </span>
                                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-1">
                                    {invite.facilityName || "All Facilities (Unrestricted)"}
                                </div>
                            </div>
                        </div>

                        <div className="pt-1 border-t border-slate-200/60 dark:border-slate-800">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                Invitee
                            </span>
                            <div className="text-xs text-slate-700 dark:text-slate-300 font-medium mt-0.5 flex items-center gap-1.5">
                                <IconUser className="h-3.5 w-3.5 text-slate-400" />
                                <span>{invite.inviteeFullName}</span>
                                <span className="text-slate-400">({invite.inviteeEmail})</span>
                            </div>
                        </div>
                    </div>

                    {/* Action / Auth Section */}
                    {isSignedIn ? (
                        <div className="space-y-4">
                            <div className="p-3 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900 text-xs flex items-center gap-3">
                                <div className="size-8 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold text-xs shrink-0">
                                    {user.firstName?.[0] || user.primaryEmailAddress?.emailAddress?.[0]?.toUpperCase() || "U"}
                                </div>
                                <div className="min-w-0">
                                    <div className="font-bold text-slate-800 dark:text-slate-200 truncate">
                                        Signed in as {user.fullName || user.primaryEmailAddress?.emailAddress}
                                    </div>
                                    <div className="text-[11px] text-slate-400 truncate">
                                        {user.primaryEmailAddress?.emailAddress}
                                    </div>
                                </div>
                            </div>

                            <Button
                                onClick={handleAccept}
                                disabled={accepting}
                                className="w-full h-11 rounded-xl text-sm font-bold shadow-md gap-2"
                            >
                                {accepting ? (
                                    <>
                                        <IconLoader className="h-4 w-4 animate-spin" />
                                        <span>Accepting &amp; Entering Workspace...</span>
                                    </>
                                ) : (
                                    <>
                                        <IconShieldCheck className="h-4 w-4" />
                                        <span>Accept Invitation &amp; Enter Workspace</span>
                                    </>
                                )}
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <p className="text-xs text-slate-500 text-center leading-relaxed">
                                Please sign in or register with your account to accept this invitation and access <strong>{invite.tenantName}</strong>.
                            </p>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                                <SignInButton mode="modal">
                                    <Button className="w-full h-10 rounded-xl text-xs font-semibold gap-1.5">
                                        <span>Sign In to Accept</span>
                                        <IconArrowRight className="h-3.5 w-3.5" />
                                    </Button>
                                </SignInButton>

                                <SignUpButton mode="modal">
                                    <Button variant="outline" className="w-full h-10 rounded-xl text-xs font-semibold">
                                        Create New Account
                                    </Button>
                                </SignUpButton>
                            </div>
                        </div>
                    )}
                </CardContent>

                <CardFooter className="p-4 sm:p-6 pt-0 bg-slate-50/50 dark:bg-slate-900/30 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-[11px] text-slate-400">
                    <span>Protected by ClinicEZ Security</span>
                    <span>Valid for 7 days</span>
                </CardFooter>
            </Card>
        </div>
    );
}
