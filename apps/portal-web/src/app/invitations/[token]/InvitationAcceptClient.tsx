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
    IconUser
} from "@tabler/icons-react";
import { Stethoscope, Sparkles } from "lucide-react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { staffService, InvitationDetailsDto } from "@/services/staff.service";
import { toast } from "sonner";

const ROLE_DESCRIPTIONS: Record<string, string> = {
    "Attending Physician": "Authorized to conduct patient consultations, order laboratory diagnostics, and issue digitally signed e-prescriptions.",
    "Medical Technologist": "Authorized to access the diagnostic dropzone, process specimen assays, and certify clinical lab results.",
    "Registered Pharmacist": "Authorized to verify e-prescriptions, log dispensing transactions, and manage pharmacy dispensary pathways.",
    "Facility Administrator": "Authorized to govern branch-level operations, facility operating hours, staff schedules, and letterhead customizers.",
    "Phlebotomist": "Authorized to collect specimens, manage barcode accessioning, and intake patients at the diagnostic dropzone.",
    "Cashier/Billing Staff": "Authorized to process patient payments, manage PhilHealth Konsulta claims, and generate official BIR receipts.",
    Admin: "Full administrative access to manage facilities, invite workspace practitioners, and configure tenancy settings.",
    Biller: "Authorized to manage subscription plans, payment methods, checkout sessions, and tax invoices.",
    Viewer: "Read-only access to workspace health, analytics, and branch operational telemetry."
};

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

    const renderShell = (content: React.ReactNode) => (
        <div className="min-h-screen flex flex-col bg-background relative overflow-hidden">
            {/* Ambient background glows matching sign-in / sign-up */}
            <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/15 blur-[120px] pointer-events-none -z-10" />
            <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-accent/40 blur-[120px] pointer-events-none -z-10" />

            {/* ClinicEZ Branded Top Header */}
            <header className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-6 flex items-center justify-between z-10">
                <Link href="/" className="flex items-center gap-2.5 group shrink-0">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary transition-all group-hover:bg-primary group-hover:text-primary-foreground shadow-sm shrink-0">
                        <Stethoscope className="h-5 w-5" />
                    </div>
                    <span className="text-xl font-bold tracking-tight text-foreground whitespace-nowrap">
                        Clinic EZ
                    </span>
                </Link>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Workspace Invitation</span>
                </div>
            </header>

            {/* Main Content Area */}
            <main className="flex-1 flex w-full max-w-5xl mx-auto items-center justify-center px-3 py-6 sm:px-6 sm:py-10 z-10">
                {content}
            </main>
        </div>
    );

    if (loading || !isLoaded) {
        return renderShell(
            <Card className="w-full max-w-md p-8 text-center rounded-2xl border border-border bg-card/80 backdrop-blur-md shadow-sm">
                <IconLoader className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
                <h2 className="text-base font-bold text-foreground">Verifying Invitation...</h2>
                <p className="text-xs text-muted-foreground mt-1">Please wait while we validate your invitation token.</p>
            </Card>
        );
    }

    if (error || !invite) {
        return renderShell(
            <Card className="w-full max-w-md p-6 sm:p-8 text-center rounded-2xl border-rose-200 dark:border-rose-900 shadow-sm bg-rose-50/30 dark:bg-rose-950/20">
                <div className="size-12 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto mb-3">
                    <IconAlertCircle className="h-6 w-6" />
                </div>
                <h2 className="text-lg font-bold text-foreground">Invalid Invitation Link</h2>
                <p className="text-xs text-muted-foreground mt-1 mb-6 leading-relaxed">
                    {error || "This invitation link is invalid or has expired."}
                </p>
                <Link href="/">
                    <Button variant="outline" className="rounded-xl text-xs font-semibold">
                        Return to Homepage
                    </Button>
                </Link>
            </Card>
        );
    }

    if (invite.isExpired) {
        return renderShell(
            <Card className="w-full max-w-md p-6 sm:p-8 text-center rounded-2xl border-amber-200 dark:border-amber-900 shadow-sm bg-amber-50/30 dark:bg-amber-950/20">
                <div className="size-12 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-3">
                    <IconClock className="h-6 w-6" />
                </div>
                <h2 className="text-lg font-bold text-foreground">Invitation Expired</h2>
                <p className="text-xs text-muted-foreground mt-2 mb-6 leading-relaxed">
                    This invitation to join <strong>{invite.tenantName}</strong> was valid for 7 days and has expired. Please contact the clinic administrator to request a refreshed invitation.
                </p>
                <Link href="/">
                    <Button variant="outline" className="rounded-xl text-xs font-semibold">
                        Return to Homepage
                    </Button>
                </Link>
            </Card>
        );
    }

    if (invite.isAlreadyAccepted) {
        return renderShell(
            <Card className="w-full max-w-md p-6 sm:p-8 text-center rounded-2xl border-emerald-200 dark:border-emerald-900 shadow-sm bg-emerald-50/30 dark:bg-emerald-950/20">
                <div className="size-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-3">
                    <IconCheck className="h-6 w-6" />
                </div>
                <h2 className="text-lg font-bold text-foreground">Already Accepted</h2>
                <p className="text-xs text-muted-foreground mt-2 mb-6 leading-relaxed">
                    This invitation for <strong>{invite.tenantName}</strong> has already been claimed and activated.
                </p>
                <Link href={`/${invite.tenantSlug}/dashboard/overview`}>
                    <Button className="rounded-xl text-xs font-semibold gap-2 bg-primary hover:bg-primary/90 text-primary-foreground">
                        <span>Go to Workspace Dashboard</span>
                        <IconArrowRight className="h-4 w-4" />
                    </Button>
                </Link>
            </Card>
        );
    }

    return renderShell(
        <Card className="w-full max-w-lg rounded-2xl sm:rounded-3xl border border-border shadow-xl shadow-primary/5 bg-card/90 backdrop-blur-xl overflow-hidden">
            {/* Clean ClinicEZ Branded Card Header */}
            <div className="p-6 sm:p-8 text-center border-b border-border/60 bg-gradient-to-b from-primary/5 via-primary/[0.02] to-transparent">
                <div className="flex items-center justify-center gap-3 mb-4">
                    <div className="size-12 rounded-2xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shadow-xs">
                        <Stethoscope className="h-6 w-6" />
                    </div>
                    <div className="h-px w-6 bg-border" />
                    <div className="size-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
                        <IconBuildingHospital className="h-6 w-6" />
                    </div>
                </div>

                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/10 text-[11px] font-semibold text-primary mb-2">
                    Official Team Invitation
                </div>

                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                    Join {invite.tenantName}
                </h1>
                <p className="text-xs text-muted-foreground mt-1.5 font-medium max-w-xs mx-auto leading-relaxed">
                    You have been invited to join the workspace clinical and administrative team on Clinic EZ
                </p>
            </div>

            <CardContent className="p-6 sm:p-8 space-y-6">
                {/* Invitation Details Block */}
                <div className="p-4 rounded-xl bg-muted/40 border border-border/70 space-y-3">
                    <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            Workspace
                        </span>
                        <div className="text-base font-bold text-foreground flex items-center gap-2 mt-0.5">
                            <IconBuildingHospital className="h-4 w-4 text-primary shrink-0" />
                            <span>{invite.tenantName}</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/60">
                        <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                Assigned Role
                            </span>
                            <div className="mt-1">
                                <Badge variant="outline" className="text-xs font-bold px-2.5 py-0.5 border-primary/20 bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-foreground">
                                    {invite.role}
                                </Badge>
                            </div>
                        </div>
                        <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                Access Scope
                            </span>
                            <div className="text-xs font-semibold text-foreground mt-1.5">
                                {invite.facilityName || "Entire Workspace"}
                            </div>
                        </div>
                    </div>

                    {ROLE_DESCRIPTIONS[invite.role] && (
                        <div className="p-2.5 rounded-lg bg-background/60 border border-border/60 text-[11px] text-muted-foreground leading-relaxed">
                            <span className="font-semibold text-foreground">Role Scope: </span>
                            {ROLE_DESCRIPTIONS[invite.role]}
                        </div>
                    )}

                    <div className="pt-2 border-t border-border/60">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            Invitee
                        </span>
                        <div className="text-xs text-foreground font-medium mt-1 flex items-center gap-1.5">
                            <IconUser className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span>{invite.inviteeFullName}</span>
                            <span className="text-muted-foreground">({invite.inviteeEmail})</span>
                        </div>
                    </div>
                </div>

                {/* Action / Auth Section */}
                {isSignedIn ? (
                    <div className="space-y-4">
                        <div className="p-3.5 rounded-2xl bg-primary/5 dark:bg-primary/10 border border-primary/15 text-xs flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="size-9 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-xs shrink-0 overflow-hidden">
                                    {user.imageUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={user.imageUrl} alt={user.fullName || "User"} className="size-9 rounded-full object-cover" />
                                    ) : (
                                        user.firstName?.[0] || user.primaryEmailAddress?.emailAddress?.[0]?.toUpperCase() || "U"
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <div className="font-semibold text-foreground truncate flex items-center gap-1.5">
                                        <span>{user.fullName || user.primaryEmailAddress?.emailAddress}</span>
                                        <IconShieldCheck className="h-3.5 w-3.5 text-primary shrink-0" />
                                    </div>
                                    <div className="text-[11px] text-muted-foreground truncate">
                                        {user.primaryEmailAddress?.emailAddress}
                                    </div>
                                </div>
                            </div>
                            <span className="text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full shrink-0">
                                Signed In
                            </span>
                        </div>

                        <Button
                            onClick={handleAccept}
                            disabled={accepting}
                            className="w-full h-11 rounded-xl text-sm font-bold shadow-md gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
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
                        <p className="text-xs text-muted-foreground text-center leading-relaxed">
                            Please sign in or register with your account to accept this invitation and access <strong>{invite.tenantName}</strong>.
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                            <SignInButton mode="modal">
                                <Button className="w-full h-10 rounded-xl text-xs font-semibold gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground">
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

            <CardFooter className="p-4 sm:p-5 bg-muted/30 border-t border-border/60 flex justify-between items-center text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                    <IconShieldCheck className="h-3.5 w-3.5 text-primary" />
                    <span>Protected by ClinicEZ Security</span>
                </span>
                <span>
                    {invite.expiresAt ? (
                        <>Valid until {new Date(invite.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</>
                    ) : (
                        <>Valid for 7 days</>
                    )}
                </span>
            </CardFooter>
        </Card>
    );
}
