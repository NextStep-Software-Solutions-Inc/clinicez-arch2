"use client";

import { useState } from "react";
import { toast } from "sonner";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";

interface OneTimeSecretProps {
    title: string;
    description: string;
    value: string;
    onDismiss: () => void;
}

/** Shows a credential that the server will never return again, with a copy button and an explicit acknowledgement. */
export function OneTimeSecret({ title, description, value, onDismiss }: OneTimeSecretProps) {
    const [copied, setCopied] = useState(false);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error("Could not copy. Select the text and copy it manually.");
        }
    };

    return (
        <div role="alert" className="rounded-2xl border border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 p-4 space-y-3">
            <div className="space-y-1">
                <p className="text-sm font-bold text-amber-900 dark:text-amber-200">{title}</p>
                <p className="text-xs text-amber-800 dark:text-amber-300">{description}</p>
            </div>
            <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 break-all rounded-xl bg-white dark:bg-slate-900 border px-3 py-2 text-xs font-mono select-all">{value}</code>
                <Button type="button" variant="outline" size="sm" onClick={copy} className="rounded-xl shrink-0">
                    {copied ? <IconCheck className="h-4 w-4" /> : <IconCopy className="h-4 w-4" />}
                    <span className="ml-1.5 text-xs font-bold">{copied ? "Copied" : "Copy"}</span>
                </Button>
            </div>
            <Button type="button" size="sm" onClick={onDismiss} className="rounded-xl text-xs font-bold">
                I&apos;ve saved it
            </Button>
        </div>
    );
}
