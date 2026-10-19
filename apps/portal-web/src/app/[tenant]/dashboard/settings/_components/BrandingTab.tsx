"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IconCheck, IconDeviceFloppy, IconInnerShadowTop } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { tenantService, WorkspaceBranding } from "@/services/tenant.service";
import { HEX_COLOR, bestTextContrast, isUsableAccent, readableForeground, MIN_ACCENT_CONTRAST } from "@/lib/color";

const PRESETS = [
    { color: "#0D6963", label: "Teal (default)" },
    { color: "#0284C7", label: "Sky Blue" },
    { color: "#059669", label: "Emerald" },
    { color: "#4F46E5", label: "Indigo" },
    { color: "#E11D48", label: "Rose" },
    { color: "#334155", label: "Slate" },
];

const labelClass = "text-xs font-bold text-slate-500 uppercase tracking-wider";

interface BrandingTabProps {
    tenantSlug: string;
    workspaceName: string;
    branding: WorkspaceBranding;
    onSaved: () => void;
}

export function BrandingTab({ tenantSlug, workspaceName, branding, onSaved }: BrandingTabProps) {
    const router = useRouter();
    const [brandName, setBrandName] = useState(branding.brandName ?? "");
    const [logoUrl, setLogoUrl] = useState(branding.logoUrl ?? "");
    const [accent, setAccent] = useState(branding.accentColorHex ?? "");
    const [logoBroken, setLogoBroken] = useState(false);
    const [saving, setSaving] = useState(false);

    const accentTrimmed = accent.trim();
    const accentSet = accentTrimmed.length > 0;
    const accentValidShape = !accentSet || HEX_COLOR.test(accentTrimmed);
    const accentUsable = !accentSet || isUsableAccent(accentTrimmed);
    const logoValid = !logoUrl.trim() || /^https:\/\//i.test(logoUrl.trim());
    const canSave = accentValidShape && accentUsable && logoValid;

    const previewAccent = accentSet && accentUsable ? accentTrimmed : undefined;
    const previewName = brandName.trim() || workspaceName;

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSave) return;
        setSaving(true);
        try {
            await tenantService.updateBranding(tenantSlug, {
                brandName: brandName.trim() || null,
                logoUrl: logoUrl.trim() || null,
                accentColorHex: accentSet ? accentTrimmed.toUpperCase() : null,
            });
            toast.success("Branding saved. It now applies across your workspace.");
            onSaved();
            router.refresh(); // re-render the server layout so the new theme/logo apply immediately
        } catch (err: any) {
            toast.error(err.response?.data?.errors?.[0]?.message || err.message || "Failed to save branding");
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={handleSave}>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                <Card className="lg:col-span-7 rounded-3xl border-slate-100 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950">
                    <CardHeader className="p-6 pb-4">
                        <CardTitle className="text-lg font-bold">Brand Identity</CardTitle>
                        <CardDescription className="text-xs font-medium text-slate-500">
                            Your workspace&apos;s display name, logo and accent color. They are applied to this dashboard and shared with
                            your facilities as their default look. Facility letterheads and printouts are configured in each facility.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-6 pt-0 space-y-5">
                        <div className="space-y-2">
                            <Label htmlFor="brandName" className={labelClass}>Display Name</Label>
                            <Input
                                id="brandName"
                                value={brandName}
                                onChange={(e) => setBrandName(e.target.value)}
                                placeholder={workspaceName}
                                maxLength={120}
                                className="rounded-xl"
                            />
                            <p className="text-[11px] text-slate-400">Leave blank to use the workspace name.</p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="logoUrl" className={labelClass}>Logo URL</Label>
                            <Input
                                id="logoUrl"
                                value={logoUrl}
                                onChange={(e) => {
                                    setLogoUrl(e.target.value);
                                    setLogoBroken(false);
                                }}
                                placeholder="https://your-domain.com/logo.png"
                                maxLength={2048}
                                className="rounded-xl text-xs"
                                aria-invalid={!logoValid}
                            />
                            {!logoValid ? (
                                <p className="text-[11px] text-rose-600">The logo must be a public https:// link.</p>
                            ) : logoBroken ? (
                                <p className="text-[11px] text-amber-600">The image could not be loaded from this address.</p>
                            ) : (
                                <p className="text-[11px] text-slate-400">Square PNG, SVG or WebP with a transparent background works best.</p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label className={labelClass}>Accent Color</Label>
                            <div className="flex items-center gap-3 flex-wrap">
                                <input
                                    type="color"
                                    aria-label="Pick accent color"
                                    value={HEX_COLOR.test(accentTrimmed) ? accentTrimmed : "#0D6963"}
                                    onChange={(e) => setAccent(e.target.value.toUpperCase())}
                                    className="h-10 w-12 rounded-xl cursor-pointer border border-slate-200 p-1 bg-white"
                                />
                                <Input
                                    value={accent}
                                    onChange={(e) => setAccent(e.target.value)}
                                    placeholder="#0D6963"
                                    maxLength={7}
                                    className="font-mono text-xs max-w-[120px] rounded-xl"
                                    aria-invalid={!accentValidShape}
                                />
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    {PRESETS.map((p) => (
                                        <button
                                            key={p.color}
                                            type="button"
                                            onClick={() => setAccent(p.color)}
                                            title={p.label}
                                            aria-label={p.label}
                                            className="h-6 w-6 rounded-full border border-slate-300 transition-transform hover:scale-110 flex items-center justify-center"
                                            style={{ backgroundColor: p.color }}
                                        >
                                            {accentTrimmed.toLowerCase() === p.color.toLowerCase() && (
                                                <IconCheck className="h-3 w-3" style={{ color: readableForeground(p.color) }} />
                                            )}
                                        </button>
                                    ))}
                                </div>
                                {accentSet && (
                                    <button type="button" onClick={() => setAccent("")} className="text-[11px] text-primary hover:underline font-semibold">
                                        Reset to default
                                    </button>
                                )}
                            </div>
                            {!accentValidShape && <p className="text-[11px] text-rose-600">Use a hex color like #0284C7.</p>}
                            {accentValidShape && !accentUsable && (
                                <p className="text-[11px] text-rose-600">
                                    This color is too light to keep button text readable (contrast {bestTextContrast(accentTrimmed).toFixed(1)}:1, needs at least {MIN_ACCENT_CONTRAST}:1). Pick a stronger color.
                                </p>
                            )}
                        </div>
                    </CardContent>
                    <CardFooter className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/10 rounded-b-3xl flex justify-end">
                        <Button type="submit" disabled={saving || !canSave} className="rounded-xl text-xs font-bold px-5 flex items-center gap-1.5">
                            <IconDeviceFloppy className="h-4 w-4" />
                            {saving ? "Saving..." : "Save Branding"}
                        </Button>
                    </CardFooter>
                </Card>

                {/* Live preview: the same elements the dashboard actually themes */}
                <div className="lg:col-span-5 space-y-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Preview</span>
                    <div
                        className="rounded-2xl border bg-white dark:bg-slate-950 p-4 space-y-4 shadow-sm"
                        style={
                            previewAccent
                                ? ({ "--primary": previewAccent, "--primary-foreground": readableForeground(previewAccent) } as React.CSSProperties)
                                : undefined
                        }
                    >
                        <div className="flex items-center gap-2 min-w-0">
                            {logoUrl.trim() && logoValid && !logoBroken ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={logoUrl.trim()}
                                    alt=""
                                    className="size-5 rounded object-contain"
                                    referrerPolicy="no-referrer"
                                    onError={() => setLogoBroken(true)}
                                />
                            ) : (
                                <IconInnerShadowTop className="size-5 text-primary" />
                            )}
                            <span className="text-base font-bold truncate">{previewName} | Workspace</span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <Button type="button" size="sm" className="rounded-lg text-xs">Primary action</Button>
                            <Button type="button" size="sm" variant="outline" className="rounded-lg text-xs">Secondary</Button>
                            <span className="text-xs font-semibold text-primary">A link</span>
                        </div>
                    </div>
                </div>
            </div>
        </form>
    );
}
