"use client"

import * as React from "react"
import { useParams } from "next/navigation"
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
} from "@tabler/icons-react"

import { NavMain, resolveDashboardNavHref } from "@/components/dashboard/nav-main"
import { NavUser } from "@/components/dashboard/nav-user"
import { NotificationsDialog } from "@/components/dashboard/NotificationsDialog"
import { WorkspaceSwitcher } from "@/components/dashboard/WorkspaceSwitcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { NavSecondary } from "./nav-secondary"
import { ClinicEzMark } from "@/components/ClinicEzLogo"

export function AppSidebar({ 
  name, 
  clinicName = "Clinic EZ", 
  logoUrl,
  user, 
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
  }
} & React.ComponentProps<typeof Sidebar>) {
  const params = useParams();
  const tenant = params.tenant as string || "demo-tenant";
  const displayName = name || clinicName;
  const [notificationsOpen, setNotificationsOpen] = React.useState(false);

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
