"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { IconPlus, IconWebhook } from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { apiErrorMessage } from "@/lib/apiError";
import { tenantService, WorkspaceIntegrations, WorkspaceWebhook } from "@/services/tenant.service";
import { OneTimeSecret } from "./OneTimeSecret";

const EVENT_LABELS: Record<string, string> = {
    "workspace.profile.updated": "The workspace profile changed (brand, regional defaults, DPO, privacy notice)",
    "facility.created": "A facility was created in the workspace",
};

function when(value?: string | null): string {
    return value ? new Date(value).toLocaleString() : "-";
}

function Deliveries({ tenantSlug, webhookId }: { tenantSlug: string; webhookId: string }) {
    const { data, error, isLoading } = useSWR(
        `webhook-deliveries/${tenantSlug}/${webhookId}`,
        () => tenantService.getWebhookDeliveries(tenantSlug, webhookId),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    );

    if (isLoading) return <p className="text-xs text-slate-500">Loading deliveries...</p>;
    if (error) return <p className="text-xs text-red-600">Deliveries could not be loaded.</p>;
    if (!data || data.length === 0) return <p className="text-xs text-slate-500">Nothing has been sent to this endpoint yet.</p>;

    return (
        <ul className="space-y-1.5">
            {data.map((d) => (
                <li key={d.id} className="text-xs flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Badge variant={d.status === "Failed" ? "destructive" : "outline"} className="text-[10px]">{d.status}</Badge>
                    <span className="font-mono">{d.eventType}</span>
                    <span className="text-slate-500">
                        {d.attemptCount} attempt{d.attemptCount === 1 ? "" : "s"}
                        {d.responseStatusCode ? ` · HTTP ${d.responseStatusCode}` : ""} · {when(d.createdAt)}
                    </span>
                    {d.status === "Pending" && d.nextAttemptAt && <span className="text-slate-500">next try {when(d.nextAttemptAt)}</span>}
                    {d.lastError && <span className="text-red-600 break-words">{d.lastError}</span>}
                </li>
            ))}
        </ul>
    );
}

interface WebhooksCardProps {
    tenantSlug: string;
    integrations: WorkspaceIntegrations;
    onChanged: () => void;
}

export function WebhooksCard({ tenantSlug, integrations, onChanged }: WebhooksCardProps) {
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<WorkspaceWebhook | null>(null);
    const [url, setUrl] = useState("");
    const [description, setDescription] = useState("");
    const [events, setEvents] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    const [revealed, setRevealed] = useState<string | null>(null);
    const [openDeliveries, setOpenDeliveries] = useState<string | null>(null);

    const atLimit = integrations.webhooks.length >= integrations.maxWebhookEndpoints;

    const openCreate = () => {
        setEditing(null);
        setUrl("");
        setDescription("");
        setEvents([]);
        setFormOpen(true);
    };

    const openEdit = (hook: WorkspaceWebhook) => {
        setEditing(hook);
        setUrl(hook.url);
        setDescription(hook.description ?? "");
        setEvents(hook.events);
        setFormOpen(true);
    };

    const toggleEvent = (event: string, on: boolean) =>
        setEvents((current) => (on ? [...current, event] : current.filter((e) => e !== event)));

    const save = async () => {
        setBusy(true);
        try {
            if (editing) {
                await tenantService.updateWebhook(tenantSlug, editing.id, {
                    url: url.trim(),
                    description: description.trim() || null,
                    events,
                    isActive: editing.isActive,
                });
                toast.success("Webhook updated.");
            } else {
                const created = await tenantService.createWebhook(tenantSlug, { url: url.trim(), description: description.trim() || null, events });
                setRevealed(created.secret);
            }
            setFormOpen(false);
            onChanged();
        } catch (err: unknown) {
            toast.error(apiErrorMessage(err, "The webhook could not be saved."));
        } finally {
            setBusy(false);
        }
    };

    const setActive = async (hook: WorkspaceWebhook, isActive: boolean) => {
        try {
            await tenantService.updateWebhook(tenantSlug, hook.id, {
                url: hook.url,
                description: hook.description ?? null,
                events: hook.events,
                isActive,
            });
            onChanged();
        } catch (err: unknown) {
            toast.error(apiErrorMessage(err, "The webhook could not be updated."));
        }
    };

    const sendTest = async (hook: WorkspaceWebhook) => {
        try {
            await tenantService.sendTestWebhook(tenantSlug, hook.id);
            toast.success("Test event queued. It is sent within about a minute; check Deliveries.");
        } catch (err: unknown) {
            toast.error(apiErrorMessage(err, "The test event could not be queued."));
        }
    };

    const remove = async (hook: WorkspaceWebhook) => {
        if (!window.confirm(`Delete this webhook endpoint and its delivery log?\n${hook.url}`)) return;
        try {
            await tenantService.deleteWebhook(tenantSlug, hook.id);
            toast.success("Webhook deleted.");
            onChanged();
        } catch (err: unknown) {
            toast.error(apiErrorMessage(err, "The webhook could not be deleted."));
        }
    };

    return (
        <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950">
            <CardHeader className="p-6 pb-4">
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <IconWebhook className="h-5 w-5" /> Webhooks
                </CardTitle>
                <CardDescription className="text-xs font-medium text-slate-500">
                    ClinicEz sends a signed HTTPS POST to your URL when something changes in the workspace. Events carry
                    workspace and facility details only, never patient or clinical data. Failed deliveries are retried up to
                    {" "}6 times over about 15 hours. Delivery runs once a minute, so expect up to a minute of delay. The URL
                    must be public https; private and internal addresses are blocked.
                </CardDescription>
            </CardHeader>
            <CardContent className="p-6 pt-0 space-y-4">
                {revealed && (
                    <OneTimeSecret
                        title="Copy your signing secret now"
                        description="Use it to verify the X-ClinicEz-Signature header (t=<unix seconds>,v1=<hex HMAC-SHA256 of '<t>.<body>'>). It is not shown again."
                        value={revealed}
                        onDismiss={() => setRevealed(null)}
                    />
                )}

                {integrations.webhooks.length === 0 && !formOpen && <p className="text-sm text-slate-500">No webhook endpoints yet.</p>}

                {integrations.webhooks.length > 0 && (
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                        {integrations.webhooks.map((hook) => (
                            <li key={hook.id} className="py-3 first:pt-0 last:pb-0 space-y-2">
                                <div className="flex flex-wrap items-start gap-3">
                                    <div className="flex-1 min-w-0 space-y-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-semibold break-all">{hook.url}</span>
                                            <Badge variant="outline" className="text-[10px] shrink-0">{hook.isActive ? "Active" : "Disabled"}</Badge>
                                        </div>
                                        {hook.description && <p className="text-xs text-slate-500">{hook.description}</p>}
                                        <p className="text-xs font-mono text-slate-500">{hook.events.join(", ")}</p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <Button type="button" variant="outline" size="sm" onClick={() => sendTest(hook)} disabled={!hook.isActive} className="rounded-xl text-xs font-bold">Send test</Button>
                                        <Button type="button" variant="outline" size="sm" onClick={() => setOpenDeliveries(openDeliveries === hook.id ? null : hook.id)} className="rounded-xl text-xs font-bold">Deliveries</Button>
                                        <Button type="button" variant="outline" size="sm" onClick={() => openEdit(hook)} className="rounded-xl text-xs font-bold">Edit</Button>
                                        <Button type="button" variant="outline" size="sm" onClick={() => setActive(hook, !hook.isActive)} className="rounded-xl text-xs font-bold">{hook.isActive ? "Disable" : "Enable"}</Button>
                                        <Button type="button" variant="outline" size="sm" onClick={() => remove(hook)} className="rounded-xl text-xs font-bold text-red-600">Delete</Button>
                                    </div>
                                </div>
                                {openDeliveries === hook.id && (
                                    <div className="rounded-xl bg-slate-50 dark:bg-slate-900 p-3">
                                        <Deliveries tenantSlug={tenantSlug} webhookId={hook.id} />
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                )}

                {formOpen ? (
                    <div className="rounded-2xl border p-4 space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="webhook-url" className="text-xs font-bold">Endpoint URL</Label>
                            <Input id="webhook-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/clinicez/webhook" className="rounded-xl" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="webhook-description" className="text-xs font-bold">Description (optional)</Label>
                            <Input id="webhook-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} className="rounded-xl" />
                        </div>
                        <fieldset className="space-y-2">
                            <legend className="text-xs font-bold">Events</legend>
                            {integrations.availableEvents.map((event) => (
                                <div key={event} className="flex items-start gap-3">
                                    <Checkbox id={`event-${event}`} checked={events.includes(event)} onCheckedChange={(v) => toggleEvent(event, v === true)} className="mt-0.5" />
                                    <Label htmlFor={`event-${event}`} className="text-xs font-medium leading-snug">
                                        <span className="font-mono">{event}</span> - {EVENT_LABELS[event] ?? ""}
                                    </Label>
                                </div>
                            ))}
                        </fieldset>
                        <div className="flex gap-2">
                            <Button type="button" onClick={save} disabled={busy || !url.trim() || events.length === 0} className="rounded-xl font-bold">
                                {busy ? "Saving..." : editing ? "Save changes" : "Add webhook"}
                            </Button>
                            <Button type="button" variant="ghost" onClick={() => setFormOpen(false)} className="rounded-xl">Cancel</Button>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center gap-3">
                        <Button type="button" variant="outline" onClick={openCreate} disabled={atLimit} className="rounded-xl text-xs font-bold">
                            <IconPlus className="h-4 w-4 mr-1" /> New webhook
                        </Button>
                        <span className="text-xs text-slate-500">{integrations.webhooks.length} of {integrations.maxWebhookEndpoints} endpoints</span>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
