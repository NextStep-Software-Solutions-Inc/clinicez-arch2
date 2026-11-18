"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, usePathname } from "next/navigation"
import useSWR from "swr"
import {
  IconArrowsExchange,
  IconBuilding,
  IconCrown,
  IconDashboard,
  IconGauge,
  IconReportMoney,
  IconSettings,
  IconCreditCard,
  IconUsers,
  IconFileCertificate,
  IconShieldCheck,
} from "@tabler/icons-react"

import { NavMain, resolveDashboardNavHref } from "@/components/dashboard/nav-main"
import { NavUser } from "@/components/dashboard/nav-user"
import { NotificationsDialog } from "@/components/dashboard/NotificationsDialog"
import { WorkspaceSwitcher } from "@/components/dashboard/WorkspaceSwitcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { NavSecondary } from "./nav-secondary"
import { ClinicEzMark } from "@/components/ClinicEzLogo"
import {
  canViewVerifications,
  verificationService,
  type ReviewerProfile,
} from "@/services/verification.service"

export const PORTAL_VERIFICATIONS_PATH = "/portal/verifications"

export function shouldShowVerificationsNav(
  profile: ReviewerProfile | null | undefined,
): boolean {
  return canViewVerifications(profile)
}

export function AppSidebar({ 
  name, 
  clinicName = "Clinic EZ", 
  logoUrl,
  user,
  reviewerProfile,
  ...props 
}: { 
  name?: string; 
  clinicName?: string; 
  logoUrl?: string;
  user?: {
    name: string;
    email: string;
    avatar: string;
    role?: string;
  };
  reviewerProfile?: ReviewerProfile | null;
} & React.ComponentProps<typeof Sidebar>) {
  const params = useParams();
  const pathname = usePathname();
  const tenant = (params?.tenant as string) || "demo-tenant";
  const displayName = name || clinicName;
  const [notificationsOpen, setNotificationsOpen] = React.useState(false);

  const { data: fetchedReviewerProfile } = useSWR<ReviewerProfile | null>(
    reviewerProfile === undefined ? "portal/reviewer-profile" : null,
    () => verificationService.getReviewerProfile().catch(() => null),
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  const resolvedReviewerProfile =
    reviewerProfile !== undefined ? reviewerProfile : fetchedReviewerProfile;
  const showVerificationsNav = shouldShowVerificationsNav(resolvedReviewerProfile);
  const isVerificationsActive =
    pathname === PORTAL_VERIFICATIONS_PATH ||
    Boolean(pathname?.startsWith(`${PORTAL_VERIFICATIONS_PATH}/`));

  const data = {
    user: user || {
      name: "Dr. Admin",
      email: "",
      avatar: "/avatars/shadcn.jpg",
    },
    navMain: [
      {
        title: "Overview",
        url: `/dashboard/overview`,
        icon: IconDashboard,
      },
      {
        title: "Branches",
        url: `/dashboard/branches`,
        icon: IconBuilding,
      },
      {
        title: "PhilHealth YAKAP",
        url: `/dashboard/yakap`,
        icon: IconFileCertificate,
      },
      {
        title: "Workspace Team",
        url: `/dashboard/team`,
        icon: IconUsers,
      },
      {
        title: "Network",
        url: `/dashboard/network`,
        icon: IconArrowsExchange,
      },
      {
        title: "Finance",
        url: `/dashboard/finance`,
        icon: IconReportMoney,
      },
    ],
    navSecondary: [
      {
        title: "Settings",
        url: `/dashboard/settings`,
        icon: IconSettings,
      },
      {
        title: "Plan & Usage",
        url: `/dashboard/plan`,
        icon: IconGauge,
      },
      {
        title: "Ownership",
        url: `/dashboard/ownership`,
        icon: IconCrown,
      },
      {
        title: "Billing",
        url: `/dashboard/billing`,
        icon: IconCreditCard,
      },
    ],
  }

  return (
    <>
      <Sidebar collapsible="offcanvas" {...props}>
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                className="data-[slot=sidebar-menu-button]:!p-1.5"
              >
                <a href={resolveDashboardNavHref(tenant, "/dashboard")}>
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoUrl} alt="" className="!size-5 rounded object-contain" referrerPolicy="no-referrer" />
                  ) : (
                    <ClinicEzMark variant="squircle" className="!size-6 shrink-0" />
                  )}
                  <span className="text-base font-bold text-foreground truncate">{displayName} | Workspace</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <WorkspaceSwitcher currentSlug={tenant} />
        </SidebarHeader>
        <SidebarContent>
          <NavMain items={data.navMain} />
          {showVerificationsNav ? (
            <SidebarGroup>
              <SidebarGroupLabel>Platform Review</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={isVerificationsActive}
                      tooltip="Directory Verifications"
                    >
                      <Link href={PORTAL_VERIFICATIONS_PATH}>
                        <IconShieldCheck />
                        <span>Directory Verifications</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ) : null}
          <NavSecondary items={data.navSecondary} />
        </SidebarContent>
        <SidebarFooter>
          <NavUser
            user={data.user}
            onOpenNotifications={() => setNotificationsOpen(true)}
          />
        </SidebarFooter>
      </Sidebar>

      <NotificationsDialog
        open={notificationsOpen}
        onOpenChange={setNotificationsOpen}
      />
    </>
  )
}
