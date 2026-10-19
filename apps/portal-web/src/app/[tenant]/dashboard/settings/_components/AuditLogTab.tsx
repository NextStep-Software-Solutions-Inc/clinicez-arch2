"use client";

import { useState } from "react";
import useSWR from "swr";
import { IconHistory } from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { apiErrorMessage } from "@/lib/apiError";
import { tenantService, WorkspaceAuditEntry } from "@/services/tenant.service";

const SECTIONS = [
    { value: "", label: "All changes" },
    { value: "general", label: "General" },
    { value: "branding", label: "Branding" },
    { value: "security", label: "Security" },
    { value: "compliance", label: "Compliance" },
    { value: "facilities", label: "Facilities" },
    { value: "integrations", label: "Integrations" },
    { value: "ownership", label: "Ownership" },
    { value: "workspace", label: "Workspace" },
];

const PAGE_SIZE = 25;

function show(value: unknown): string {
    if (value === null || value === undefined || value === "") return "(empty)";
    const text = typeof value === "string" ? value : JSON.stringify(value);
    return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function EntryRow({ entry }: { entry: WorkspaceAuditEntry }) {
    const fields = Object.entries(entry.changes ?? {});
    return (
        <li className="py-4 first:pt-0 last:pb-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline" className="text-[10px] capitalize">{entry.section}</Badge>
                <span className="font-semibold capitalize">{entry.action.replace(/_/g, " ")}</span>
                <span className="text-slate-500">
                    by {entry.actorName || "Unknown"}{entry.actorRole ? ` (${entry.actorRole})` : ""}
                </span>
                <time className="ml-auto text-slate-400" dateTime={entry.occurredAt}>
                    {new Date(entry.occurredAt).toLocaleString()}
                </time>
            </div>
            {fields.length > 0 && (
                <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
                    {fields.map(([field, change]) => (
                        <li key={field} className="break-words">
                            <span className="font-mono text-slate-500">{field}</span>:{" "}
                            <span className="line-through opacity-70">{show(change?.old)}</span>
                            {" -> "}
                            <span className="font-medium text-slate-800 dark:text-slate-200">{show(change?.new)}</span>
                        </li>
                    ))}
                </ul>
            )}
        </li>
    );
}

export function AuditLogTab({ tenantSlug }: { tenantSlug: string }) {
    const [section, setSection] = useState("");
    const [extra, setExtra] = useState<{ section: string; items: WorkspaceAuditEntry[]; cursor?: string | null } | null>(null);
    const [loadingMore, setLoadingMore] = useState(false);
    const [moreError, setMoreError] = useState<string | null>(null);

    const { data, isLoading, error } = useSWR(
        `audit-log/${tenantSlug}/${section}`,
        () => tenantService.getAuditLog(tenantSlug, { take: PAGE_SIZE, section: section || null }),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    );

    const extraForThisFilter = extra && extra.section === section ? extra : null;
    const items = [...(data?.items ?? []), ...(extraForThisFilter?.items ?? [])];
    const cursor = extraForThisFilter ? extraForThisFilter.cursor : data?.nextCursor;

    const loadMore = async () => {
        if (!cursor) return;
        setLoadingMore(true);
        setMoreError(null);
        try {
            const page = await tenantService.getAuditLog(tenantSlug, { take: PAGE_SIZE, before: cursor, section: section || null });
            setExtra({ section, items: [...(extraForThisFilter?.items ?? []), ...page.items], cursor: page.nextCursor });
        } catch (err: unknown) {
            setMoreError(apiErrorMessage(err, "Could not load older changes."));
        } finally {
            setLoadingMore(false);
        }
    };

    return (
        <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950">
            <CardHeader className="p-6 pb-4">
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <IconHistory className="h-5 w-5" /> Audit Log
                </CardTitle>
                <CardDescription className="text-xs font-medium text-slate-500">
                    Who changed which workspace setting, and when. Entries cannot be edited or deleted.
                </CardDescription>
            </CardHeader>
            <CardContent className="p-6 pt-0 space-y-4">
                <select
                    aria-label="Filter audit log"
                    value={section}
                    onChange={(e) => setSection(e.target.value)}
                    className="h-9 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                >
                    {SECTIONS.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                </select>

                {isLoading && <Skeleton className="h-40 w-full rounded-2xl" />}
                {!isLoading && error && <p className="text-sm text-red-600">The audit log could not be loaded. Please refresh and try again.</p>}
                {!isLoading && !error && items.length === 0 && <p className="text-sm text-slate-500">No changes recorded yet.</p>}

                {items.length > 0 && (
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                        {items.map((entry) => (
                            <EntryRow key={entry.id} entry={entry} />
                        ))}
                    </ul>
                )}

                {moreError && <p className="text-xs text-red-600">{moreError}</p>}
                {cursor && (
                    <Button type="button" variant="outline" size="sm" disabled={loadingMore} onClick={loadMore} className="rounded-xl text-xs font-bold">
                        {loadingMore ? "Loading..." : "Load older changes"}
                    </Button>
                )}
            </CardContent>
        </Card>
    );
}
