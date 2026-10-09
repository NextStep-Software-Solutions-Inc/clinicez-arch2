"use client";

import { useState } from "react";
import { toast } from "sonner";
import { IconKey, IconPlus } from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { apiErrorMessage } from "@/lib/apiError";
import { tenantService, WorkspaceApiKey, WorkspaceIntegrations } from "@/services/tenant.service";
import { OneTimeSecret } from "./OneTimeSecret";

const SCOPE_LABELS: Record<string, string> = {
    "workspace:read": "Read the workspace profile (name, brand, regional defaults, DPO, privacy notice)",
    "facilities:read": "Read the list of facilities (name, type, status, branch, deployment mode)",
};

function when(value?: string | null): string {
    return value ? new Date(value).toLocaleString() : "never";
}

interface ApiKeysCardProps {
    tenantSlug: string;
    integrations: WorkspaceIntegrations;
    onChanged: () => void;
}

export function ApiKeysCard({ tenantSlug, integrations, onChanged }: ApiKeysCardProps) {
    const [creating, setCreating] = useState(false);
    const [name, setName] = useState("");
    const [scopes, setScopes] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    const [revealed, setRevealed] = useState<string | null>(null);

    const activeCount = integrations.apiKeys.filter((k) => !k.revokedAt).length;
    const atLimit = activeCount >= integrations.maxActiveApiKeys;

    const toggleScope = (scope: string, on: boolean) =>
        setScopes((current) => (on ? [...current, scope] : current.filter((s) => s !== scope)));

    const create = async () => {
        setBusy(true);
        try {
            const result = await tenantService.createApiKey(tenantSlug, { name: name.trim(), scopes });
            setRevealed(result.key);
            setCreating(false);
            setName("");
            setScopes([]);
            onChanged();
        } catch (err: unknown) {
            toast.error(apiErrorMessage(err, "The API key could not be created."));
        } finally {
            setBusy(false);
        }
    };

    const revoke = async (key: WorkspaceApiKey) => {
        if (!window.confirm(`Revoke "${key.name}"? Systems using it stop working immediately. This cannot be undone.`)) return;
        try {
            await tenantService.revokeApiKey(tenantSlug, key.id);
            toast.success("API key revoked.");
            onChanged();
        } catch (err: unknown) {
            toast.error(apiErrorMessage(err, "The API key could not be revoked."));
        }
    };

    return (
        <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950">
            <CardHeader className="p-6 pb-4">
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <IconKey className="h-5 w-5" /> API keys
                </CardTitle>
                <CardDescription className="text-xs font-medium text-slate-500">
                    Read-only keys for your own systems (ERP, BI, intranet). A key can read the workspace profile and the
                    facility list. It can never read patient or clinical data, which stays inside each facility, and it can
                    never change anything. Send it as the <code className="font-mono">X-Api-Key</code> header to{" "}
                    <code className="font-mono">/api/v1/integrations/workspace</code> or{" "}
                    <code className="font-mono">/api/v1/integrations/facilities</code>.
                </CardDescription>
            </CardHeader>
            <CardContent className="p-6 pt-0 space-y-4">
                {revealed && (
                    <OneTimeSecret
                        title="Copy your new API key now"
                        description="This is the only time it is shown. If you lose it, revoke it and create a new one."
                        value={revealed}
                        onDismiss={() => setRevealed(null)}
                    />
                )}

                {integrations.apiKeys.length === 0 && !creating && (
                    <p className="text-sm text-slate-500">No API keys yet.</p>
                )}

                {integrations.apiKeys.length > 0 && (
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                        {integrations.apiKeys.map((key) => (
                            <li key={key.id} className="py-3 first:pt-0 last:pb-0 flex flex-wrap items-start gap-3">
                                <div className="flex-1 min-w-0 space-y-1">
                                    <div className="flex items-center gap-2">
                                        <span className={`text-sm font-semibold ${key.revokedAt ? "line-through text-slate-400" : ""}`}>{key.name}</span>
                                        {key.revokedAt && <Badge variant="outline" className="text-[10px]">Revoked</Badge>}
                                    </div>
                                    <p className="text-xs font-mono text-slate-500">{key.keyPrefix}…</p>
                                    <p className="text-xs text-slate-500">
                                        {key.scopes.join(", ")} · created by {key.createdByName || "unknown"} on {when(key.createdAt)} · last used {when(key.lastUsedAt)}
                                    </p>
                                </div>
                                {!key.revokedAt && (
                                    <Button type="button" variant="outline" size="sm" onClick={() => revoke(key)} className="rounded-xl text-xs font-bold text-red-600">
                                        Revoke
                                    </Button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}

                {creating ? (
                    <div className="rounded-2xl border p-4 space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="api-key-name" className="text-xs font-bold">Name</Label>
                            <Input id="api-key-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. ERP nightly sync" maxLength={100} className="rounded-xl" />
                        </div>
                        <fieldset className="space-y-2">
                            <legend className="text-xs font-bold">Access</legend>
                            {integrations.availableScopes.map((scope) => (
                                <div key={scope} className="flex items-start gap-3">
                                    <Checkbox id={`scope-${scope}`} checked={scopes.includes(scope)} onCheckedChange={(v) => toggleScope(scope, v === true)} className="mt-0.5" />
                                    <Label htmlFor={`scope-${scope}`} className="text-xs font-medium leading-snug">
                                        <span className="font-mono">{scope}</span> - {SCOPE_LABELS[scope] ?? ""}
                                    </Label>
                                </div>
                            ))}
                        </fieldset>
                        <div className="flex gap-2">
                            <Button type="button" onClick={create} disabled={busy || name.trim().length < 2 || scopes.length === 0} className="rounded-xl font-bold">
                                {busy ? "Creating..." : "Create key"}
                            </Button>
                            <Button type="button" variant="ghost" onClick={() => setCreating(false)} className="rounded-xl">Cancel</Button>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center gap-3">
                        <Button type="button" variant="outline" onClick={() => setCreating(true)} disabled={atLimit} className="rounded-xl text-xs font-bold">
                            <IconPlus className="h-4 w-4 mr-1" /> New API key
                        </Button>
                        <span className="text-xs text-slate-500">{activeCount} of {integrations.maxActiveApiKeys} active keys</span>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
