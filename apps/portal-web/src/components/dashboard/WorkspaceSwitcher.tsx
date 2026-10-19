"use client";

import { useRouter } from "next/navigation";
import { useAuth, useUser } from "@clerk/nextjs";
import useSWR from "swr";
import { IconCheck, IconSelector } from "@tabler/icons-react";
import { RoleChip } from "@/components/dashboard/RoleChip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { tenantService } from "@/services/tenant.service";

interface Membership {
  tenantId: string;
  role: string;
}

/** The workspace ids on the user's Clerk metadata: the one they own plus every membership. Anything malformed is skipped. */
function readMemberships(metadata: unknown): Membership[] {
  if (typeof metadata !== "object" || metadata === null) return [];
  const { ownedTenantId, memberships } = metadata as { ownedTenantId?: unknown; memberships?: unknown };

  const result: Membership[] = [];
  if (typeof ownedTenantId === "string" && ownedTenantId) result.push({ tenantId: ownedTenantId, role: "Owner" });
  if (Array.isArray(memberships)) {
    for (const entry of memberships) {
      if (typeof entry !== "object" || entry === null) continue;
      const { tenantId, role } = entry as { tenantId?: unknown; role?: unknown };
      if (typeof tenantId === "string" && typeof role === "string" && !result.some((m) => m.tenantId === tenantId)) {
        result.push({ tenantId, role });
      }
    }
  }
  return result;
}

interface WorkspaceOption {
  slug: string;
  name: string;
  role: string;
}

interface WorkspaceSwitcherProps {
  currentSlug: string;
}

/** Lets someone who belongs to several workspaces jump between them. Renders nothing for a single workspace. */
export function WorkspaceSwitcher({ currentSlug }: WorkspaceSwitcherProps) {
  const router = useRouter();
  const { user } = useUser();
  const { getToken } = useAuth();

  const memberships = readMemberships(user?.publicMetadata);
  const userId = user?.id;

  const { data: options } = useSWR<WorkspaceOption[]>(
    userId && memberships.length > 1 ? ["workspaces", userId, ...memberships.map((m) => m.tenantId)] : null,
    async () => {
      const token = await getToken();
      const resolved = await Promise.all(
        memberships.map(async (m): Promise<WorkspaceOption | null> => {
          const tenant = await tenantService.getTenantByOwner(userId ?? "", token, m.tenantId).catch(() => null);
          return tenant ? { slug: tenant.tenantSlug, name: tenant.name || tenant.tenantSlug, role: tenant.role ?? m.role } : null;
        }),
      );
      return resolved.filter((o): o is WorkspaceOption => o !== null);
    },
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  if (!options || options.length < 2) return null;

  const current = options.find((o) => o.slug.toLowerCase() === currentSlug.toLowerCase());

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton className="justify-between" aria-label="Switch workspace">
              <span className="truncate text-xs font-semibold">{current?.name ?? currentSlug}</span>
              <IconSelector className="size-4 shrink-0 text-muted-foreground" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64 rounded-xl">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Your workspaces</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {options.map((option) => (
              <DropdownMenuItem
                key={option.slug}
                className="flex items-center gap-2"
                onSelect={() => router.push(`/${option.slug}/dashboard/overview`)}
              >
                <span className="flex-1 truncate text-sm">{option.name}</span>
                <RoleChip role={option.role} />
                {option.slug.toLowerCase() === currentSlug.toLowerCase() && <IconCheck className="size-4 shrink-0" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
