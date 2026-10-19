"use client";

import { useClerk } from "@clerk/nextjs";
import { IconShieldLock } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";

interface MfaRequiredGateProps {
    workspaceName: string;
}

/**
 * Full-screen block shown instead of the dashboard when the workspace requires MFA and the signed-in
 * account has none. It is rendered by the server layout (no redirect), so it cannot loop and the
 * dashboard content is never sent to the browser.
 */
export function MfaRequiredGate({ workspaceName }: MfaRequiredGateProps) {
    const { openUserProfile, signOut } = useClerk();

    return (
        <div className="min-h-svh flex items-center justify-center p-6 bg-muted/30">
            <div className="max-w-md w-full rounded-3xl border bg-background p-8 shadow-sm space-y-5 text-center">
                <div className="mx-auto h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                    <IconShieldLock className="h-6 w-6" />
                </div>
                <div className="space-y-2">
                    <h1 className="text-xl font-extrabold tracking-tight">Two-step verification required</h1>
                    <p className="text-sm text-muted-foreground">
                        {workspaceName} requires every member to protect their account with two-step verification.
                        Turn it on under <span className="font-semibold">Security</span> in your account settings, then come back.
                    </p>
                </div>
                <div className="flex flex-col gap-2">
                    <Button onClick={() => openUserProfile()} className="rounded-xl font-bold">
                        Open account security
                    </Button>
                    <Button variant="outline" onClick={() => window.location.reload()} className="rounded-xl font-semibold">
                        I&apos;ve turned it on - continue
                    </Button>
                    <Button variant="ghost" onClick={() => signOut({ redirectUrl: "/sign-in" })} className="rounded-xl text-xs">
                        Sign out
                    </Button>
                </div>
            </div>
        </div>
    );
}
