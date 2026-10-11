"use client";

import Link from "next/link";
import useSWR from "swr";
import { IconArrowRight, IconCrown } from "@tabler/icons-react";
import { tenantService } from "@/services/tenant.service";

interface OwnershipOfferBannerProps {
    tenantSlug: string;
    /** Role of the viewer in this workspace. The owner already knows about their own offer. */
    role: string;
}

/** Tells the member an ownership offer is waiting for them, and links to the accept/decline screen. */
export default function OwnershipOfferBanner({ tenantSlug, role }: OwnershipOfferBannerProps) {
    const isOwner = role === "Owner";
    const { data: offer } = useSWR(
        isOwner ? null : `/tenants/${tenantSlug}/settings/ownership-transfer`,
        () => tenantService.getOwnershipTransfer(tenantSlug),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    );

    if (isOwner || !offer || offer.status !== "Pending") {
        return null;
    }

    return (
        <div className="w-full bg-violet-500/10 border-b border-violet-500/20 px-4 py-3 sm:px-6 text-violet-950 dark:text-violet-100 animate-in fade-in duration-300">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-start gap-2.5 min-w-0">
                    <div className="p-1 rounded-full bg-violet-500/20 text-violet-600 dark:text-violet-400 shrink-0 mt-0.5">
                        <IconCrown className="h-4 w-4" />
                    </div>
                    <span className="font-semibold leading-relaxed">
                        You have been offered ownership of this workspace. Review the offer before it expires.
                    </span>
                </div>
                <Link
                    href={`/${tenantSlug}/dashboard/ownership`}
                    className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs h-7 px-3.5 shadow-sm"
                >
                    Review offer
                    <IconArrowRight className="h-3.5 w-3.5" />
                </Link>
            </div>
        </div>
    );
}
