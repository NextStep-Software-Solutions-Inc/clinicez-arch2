"use client";

import { useParams } from "next/navigation";
import { IconPalette, IconSettings } from "@tabler/icons-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspaceSettings } from "@/hooks/useWorkspaceSettings";
import { GeneralTab } from "./_components/GeneralTab";
import { BrandingTab } from "./_components/BrandingTab";

export default function SettingsPage() {
    const params = useParams();
    const tenantSlug = params?.tenant as string;
    const { settings, isLoading, isForbidden, error, mutate } = useWorkspaceSettings(tenantSlug);

    return (
        <div className="w-full flex-1 flex flex-col gap-6 sm:gap-8 p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto animate-in fade-in-50 duration-300">
            <div className="border-b pb-6">
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Workspace Settings</h1>
                <p className="text-muted-foreground text-xs sm:text-sm mt-1">
                    Settings that apply to the whole workspace. Each facility is configured in its own console.
                </p>
            </div>

            {isLoading && (
                <div className="space-y-4">
                    <Skeleton className="h-10 w-48 rounded-xl" />
                    <Skeleton className="h-72 w-full rounded-3xl" />
                </div>
            )}

            {isForbidden && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 p-6 text-sm text-amber-800 dark:text-amber-300">
                    Only the workspace Owner or an Admin can view and change workspace settings.
                </div>
            )}

            {!isLoading && !isForbidden && error && (
                <div className="rounded-2xl border border-red-200 bg-red-50/50 dark:bg-red-950/20 p-6 text-sm text-red-700 dark:text-red-300">
                    Workspace settings could not be loaded. Please refresh and try again.
                </div>
            )}

            {settings && (
                <Tabs defaultValue="general" className="w-full space-y-6">
                    <div className="w-full overflow-x-auto pb-1.5 no-scrollbar -mx-1 px-1">
                        <TabsList className="inline-flex w-auto min-w-full sm:min-w-0 justify-start h-auto p-1 bg-muted/65 rounded-xl border flex-nowrap gap-1">
                            <TabsTrigger value="general" className="px-4 sm:px-6 py-2 text-xs font-semibold flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                                <IconSettings className="h-3.5 w-3.5 shrink-0" />
                                General
                            </TabsTrigger>
                            <TabsTrigger value="branding" className="px-4 sm:px-6 py-2 text-xs font-semibold flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                                <IconPalette className="h-3.5 w-3.5 shrink-0" />
                                Branding
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value="general" className="outline-none">
                        <GeneralTab key={JSON.stringify(settings.general)} tenantSlug={tenantSlug} general={settings.general} onSaved={() => mutate()} />
                    </TabsContent>

                    <TabsContent value="branding" className="outline-none">
                        <BrandingTab
                            key={JSON.stringify(settings.branding)}
                            tenantSlug={tenantSlug}
                            workspaceName={settings.general.name}
                            branding={settings.branding}
                            onSaved={() => mutate()}
                        />
                    </TabsContent>
                </Tabs>
            )}
        </div>
    );
}
