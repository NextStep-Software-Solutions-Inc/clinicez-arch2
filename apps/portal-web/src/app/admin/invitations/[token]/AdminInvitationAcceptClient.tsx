"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useUser, SignInButton, SignUpButton } from "@clerk/nextjs";
import { 
    IconShieldCheck, 
    IconCheck, 
    IconAlertCircle, 
    IconClock, 
    IconArrowRight, 
    IconLoader, 
    IconUser,
    IconLock
} from "@tabler/icons-react";
import { Stethoscope, Sparkles } from "lucide-react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { adminService, AdminInvitationDetailsDto } from "@/services/admin.service";
import { toast } from "sonner";

export default function AdminInvitationAcceptClient({ token }: { token: string }) {
    const router = useRouter();
    const { isSignedIn, user, isLoaded } = useUser();

    const [invite, setInvite] = useState<AdminInvitationDetailsDto | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [accepting, setAccepting] = useState(false);

    useEffect(() => {
        const fetchDetails = async () => {
            try {
                const data = await adminService.getInvitationDetails(token);
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
            await adminService.acceptInvitation(token);
            toast.success("Welcome to Clinic EZ Administration!");
            router.push("/admin");
        } catch (err: any) {
            const msg = err.response?.data?.message || err.message || "Failed to accept invitation.";
            toast.error(msg);
            setAccepting(false);
        }
    };

    const renderShell = (content: React.ReactNode) => (
        <div className="min-h-screen flex flex-col bg-background relative overflow-hidden">
            {/* Ambient background glows */}
            <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/15 blur-[120px] pointer-events-none -z-10" />
            <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-accent/40 blur-[120px] pointer-events-none -z-10" />

            {/* Clinic EZ Branded Top Header */}
            <header className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-6 flex items-center justify-between z-10">
                <Link href="/" className="flex items-center gap-2.5 group shrink-0">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary transition-all group-hover:bg-primary group-hover:text-primary-foreground shadow-xs shrink-0">
                        <Stethoscope className="h-5 w-5" />
                    </div>
                    <span className="text-xl font-bold tracking-tight text-foreground whitespace-nowrap">
                        Clinic EZ
                    </span>
                </Link>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Platform Admin Invitation</span>
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
            <Card className="w-full max-w-md p-8 text-center rounded-2xl border border-border bg-card/80 backdrop-blur-md shadow-xs">
                <IconLoader className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
                <h2 className="text-base font-bold text-foreground">Verifying Invitation...</h2>
                <p className="text-xs text-muted-foreground mt-1">Please wait while we validate your invitation token.</p>
            </Card>
        );
    }

    if (error || !invite) {
        return renderShell(
            <Card className="w-full max-w-md p-6 sm:p-8 text-center rounded-2xl border-rose-200 dark:border-rose-900 shadow-xs bg-rose-50/30 dark:bg-rose-950/20">
                <div className="size-12 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto mb-3">
                    <IconAlertCircle className="h-6 w-6" />
                </div>
                <h2 className="text-lg font-bold text-foreground">Invalid Invitation Link</h2>
                <p className="text-xs text-muted-foreground mt-1 mb-6 leading-relaxed">
                    {error || "This invitation token is invalid or does not exist."}
                </p>
                <Button asChild variant="outline" className="rounded-xl w-full">
                    <Link href="/">Back to Home</Link>
                </Button>
            </Card>
        );
    }

    if (invite.isSuspended || invite.isRevoked) {
        const isSuspended = invite.isSuspended;
        return renderShell(
            <Card className="w-full max-w-md p-6 sm:p-8 text-center rounded-2xl border-slate-200 dark:border-slate-800 shadow-xs bg-slate-50/50 dark:bg-slate-900/50">
                <div className="size-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center mx-auto mb-3">
                    <IconLock className="h-6 w-6" />
                </div>
                <h2 className="text-lg font-bold text-foreground">
                    {isSuspended ? "Account Suspended" : "Invitation Revoked"}
                </h2>
                <p className="text-xs text-muted-foreground mt-1 mb-6 leading-relaxed">
                    {isSuspended
                        ? "This administrative account is suspended. If you believe this is an error, please contact your platform lead."
                        : "This administrative invitation was revoked by a system administrator. If you believe this is an error, please contact your platform lead."}
                </p>
                <Button asChild variant="outline" className="rounded-xl w-full">
                    <Link href="/">Return to Home</Link>
                </Button>
            </Card>
        );
    }

    if (invite.isExpired) {
        return renderShell(
            <Card className="w-full max-w-md p-6 sm:p-8 text-center rounded-2xl border-amber-200 dark:border-amber-900/50 shadow-xs bg-amber-50/30 dark:bg-amber-950/20">
                <div className="size-12 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-3">
                    <IconClock className="h-6 w-6" />
                </div>
                <h2 className="text-lg font-bold text-foreground">Invitation Expired</h2>
                <p className="text-xs text-muted-foreground mt-1 mb-6 leading-relaxed">
                    This invitation was valid for 7 days and has expired. Please ask a platform administrator to resend your invite link.
                </p>
                <Button asChild variant="outline" className="rounded-xl w-full">
                    <Link href="/">Return to Home</Link>
                </Button>
            </Card>
        );
    }

    if (invite.isAlreadyAccepted) {
        return renderShell(
            <Card className="w-full max-w-md p-6 sm:p-8 text-center rounded-2xl border-emerald-200 dark:border-emerald-900/50 shadow-xs bg-emerald-50/30 dark:bg-emerald-950/20">
                <div className="size-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-3">
                    <IconCheck className="h-6 w-6" />
                </div>
                <h2 className="text-lg font-bold text-foreground">Already Accepted</h2>
                <p className="text-xs text-muted-foreground mt-1 mb-6 leading-relaxed">
                    This invitation has already been accepted and linked. You can sign in and enter the administration portal directly.
                </p>
                <Button asChild className="rounded-xl w-full">
                    <Link href="/admin">Go to Admin Portal &rarr;</Link>
                </Button>
            </Card>
        );
    }

    return renderShell(
        <Card className="w-full max-w-lg rounded-3xl border border-border bg-card shadow-lg overflow-hidden">
            <div className="p-6 sm:p-8">
                <div className="flex items-center gap-3 mb-6">
                    <div className="size-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <IconShieldCheck className="h-6 w-6" />
                    </div>
                    <div>
                        <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider mb-1 text-primary border-primary/20 bg-primary/5">
                            Platform Governance
                        </Badge>
                        <h2 className="text-xl font-bold tracking-tight text-foreground">
                            Join Platform Administration
                        </h2>
                    </div>
                </div>

                <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                    Hello <strong className="text-foreground">{invite.fullName}</strong>, you have been invited to join the Clinic EZ platform governance team as <strong className="text-foreground">{invite.roleName}</strong>.
                </p>

                {/* Role Details Card */}
                <div className="p-4 rounded-2xl border border-border/80 bg-muted/30 mb-6 space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground font-semibold">Assigned Role</span>
                        <Badge className="font-bold text-xs">{invite.roleName}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground leading-relaxed">
                        {invite.roleDescription}
                    </div>
                    {invite.expiresAt && (
                        <div className="pt-2 border-t border-border/60 flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>Expiration</span>
                            <span>{new Date(invite.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                        </div>
                    )}
                </div>

                {/* Identity / Authentication Gate */}
                {isSignedIn ? (
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 p-3.5 rounded-2xl border border-border/80 bg-card">
                            <div className="size-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                                {user?.firstName ? user.firstName[0] : <IconUser className="h-5 w-5" />}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="text-xs font-bold truncate text-foreground">
                                    {user?.fullName || user?.primaryEmailAddress?.emailAddress}
                                </div>
                                <div className="text-[11px] text-muted-foreground truncate">
                                    {user?.primaryEmailAddress?.emailAddress}
                                </div>
                            </div>
                            <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 bg-emerald-50/50">
                                Authenticated
                            </Badge>
                        </div>

                        <Button 
                            onClick={handleAccept} 
                            disabled={accepting}
                            className="w-full h-11 rounded-2xl font-bold shadow-md gap-2"
                        >
                            {accepting ? (
                                <>
                                    <IconLoader className="h-4 w-4 animate-spin" />
                                    <span>Activating Admin Profile...</span>
                                </>
                            ) : (
                                <>
                                    <span>Accept Invitation &amp; Enter Admin Portal</span>
                                    <IconArrowRight className="h-4 w-4" />
                                </>
                            )}
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="p-4 rounded-2xl border border-border/80 bg-muted/40 text-center space-y-1">
                            <p className="text-xs font-bold text-foreground">Sign In to Accept</p>
                            <p className="text-[11px] text-muted-foreground">
                                Sign in or create a Clinic EZ account with your email (<span className="font-mono text-foreground">{invite.email}</span>) to activate admin access.
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <SignInButton mode="modal">
                                <Button variant="outline" className="w-full rounded-2xl h-10 font-bold">
                                    Sign In
                                </Button>
                            </SignInButton>
                            <SignUpButton mode="modal">
                                <Button className="w-full rounded-2xl h-10 font-bold">
                                    Create Account
                                </Button>
                            </SignUpButton>
                        </div>
                    </div>
                )}
            </div>

            <div className="px-6 py-4 bg-muted/20 border-t border-border/60 text-center">
                <p className="text-[11px] text-muted-foreground">
                    Secured by Clinic EZ Administrative RBAC &bull; High-Assurance Governance
                </p>
            </div>
        </Card>
    );
}
