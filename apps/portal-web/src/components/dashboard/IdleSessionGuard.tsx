"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useClerk } from "@clerk/nextjs";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const ACTIVITY_KEY = "clinicez:last-activity";
const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "scroll", "wheel"] as const;
const WARNING_SECONDS = 60;
const TICK_MS = 5_000;
const WRITE_THROTTLE_MS = 2_000;

interface IdleSessionGuardProps {
    /** Workspace inactivity limit in minutes. Values <= 0 disable the guard. */
    timeoutMinutes: number;
}

/**
 * Signs the user out of the portal after `timeoutMinutes` without activity. Activity is shared across
 * tabs through localStorage so working in one tab keeps the others alive. A warning with a
 * "Stay signed in" action appears for the last minute.
 *
 * This is a browser-side control for this dashboard only; it is not a server-enforced session limit.
 */
export function IdleSessionGuard({ timeoutMinutes }: IdleSessionGuardProps) {
    const { signOut } = useClerk();
    const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
    // Mirrors state for the activity handler, which must not re-subscribe on every tick.
    const secondsLeftRef = useRef<number | null>(null);
    const lastWrite = useRef(0);
    const signingOut = useRef(false);

    const markActive = useCallback((force = false) => {
        const now = Date.now();
        if (!force && now - lastWrite.current < WRITE_THROTTLE_MS) return;
        lastWrite.current = now;
        try {
            localStorage.setItem(ACTIVITY_KEY, String(now));
        } catch {
            // Storage can be blocked; the in-memory timestamp below still drives this tab.
        }
    }, []);

    useEffect(() => {
        if (timeoutMinutes <= 0) return;

        const limitMs = timeoutMinutes * 60_000;
        markActive(true);

        const onActivity = () => {
            // While the warning is up only the explicit button counts, so a stray mouse move cannot hide it.
            if (secondsLeftRef.current === null) markActive();
        };
        ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

        const timer = window.setInterval(() => {
            let last = lastWrite.current;
            try {
                last = Math.max(last, Number(localStorage.getItem(ACTIVITY_KEY)) || 0);
            } catch {
                // fall back to the in-memory value
            }
            const remaining = limitMs - (Date.now() - last);
            if (remaining <= 0) {
                if (!signingOut.current) {
                    signingOut.current = true;
                    void signOut({ redirectUrl: "/sign-in" });
                }
                return;
            }
            const warn = remaining <= WARNING_SECONDS * 1000;
            secondsLeftRef.current = warn ? Math.ceil(remaining / 1000) : null;
            setSecondsLeft(secondsLeftRef.current);
        }, TICK_MS);

        return () => {
            ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
            window.clearInterval(timer);
        };
    }, [timeoutMinutes, markActive, signOut]);

    if (timeoutMinutes <= 0) return null;

    return (
        <Dialog open={secondsLeft !== null}>
            <DialogContent showCloseButton={false} onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
                <DialogHeader>
                    <DialogTitle>Still there?</DialogTitle>
                    <DialogDescription>
                        You will be signed out in about {secondsLeft} seconds because of inactivity.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button
                        onClick={() => {
                            secondsLeftRef.current = null;
                            setSecondsLeft(null);
                            markActive(true);
                        }}
                    >
                        Stay signed in
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
