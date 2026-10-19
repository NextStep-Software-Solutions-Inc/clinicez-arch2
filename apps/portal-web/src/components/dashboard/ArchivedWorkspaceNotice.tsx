"use client";

import { useClerk } from "@clerk/nextjs";
import { IconArchive } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";

interface ArchivedWorkspaceNoticeProps {
    workspaceName: string;
}

/**
 * Full-screen notice shown instead of the dashboard once a workspace is archived. Rendered by the
 * server layout (no redirect) so it cannot loop and no dashboard content is sent to the browser.
 */
export function ArchivedWorkspaceNotice({ workspaceName }: ArchivedWorkspaceNoticeProps) {
    const { signOut } = useClerk();

    return (
        <div className="min-h-svh flex items-center justify-center p-6 bg-muted/30">
            <div className="max-w-md w-full rounded-3xl border bg-background p-8 shadow-sm space-y-5 text-center">
                <div className="mx-auto h-12 w-12 rounded-2xl bg-muted text-muted-foreground flex items-center justify-center">
                    <IconArchive className="h-6 w-6" />
                </div>
                <div className="space-y-2">
                    <h1 className="text-xl font-extrabold tracking-tight">{workspaceName} is archived</h1>
                    <p className="text-sm text-muted-foreground">
                        This workspace was closed by its owner. Nothing was deleted. To bring it back, contact Clinic EZ support.
                    </p>
                </div>
                <Button variant="outline" onClick={() => signOut({ redirectUrl: "/sign-in" })} className="rounded-xl font-semibold">
                    Sign out
                </Button>
            </div>
        </div>
    );
}
