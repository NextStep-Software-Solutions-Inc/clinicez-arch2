"use client"

import * as React from "react"
import { useParams } from "next/navigation"
import {
  IconArrowsExchange,
  IconBuilding,
  IconCrown,
  IconDashboard,
  IconGauge,
  IconHospital,
  IconInnerShadowTop,
  IconPill,
  IconReportMoney,
  IconSettings,
  IconTestPipe,
  IconCreditCard,
  IconUsers,
  IconMapPin,
  IconFileCertificate,
} from "@tabler/icons-react"

import { NavMain } from "@/components/dashboard/nav-main"
import { NavUser } from "@/components/dashboard/nav-user"
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
  user?: any 
} & React.ComponentProps<typeof Sidebar>) {
  const params = useParams();
  const tenant = params.tenant as string || "demo-tenant";
  const displayName = name || clinicName;

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
        title: "Facilities",
        icon: IconBuilding,
        items: [
          {
            title: "Branches & Locations",
            url: `/dashboard/branches`,
            icon: IconMapPin,
          },
          {
            title: "Clinics",
            url: `/dashboard/clinics`,
            icon: IconHospital,
          },
          {
            title: "Organizations",
            url: `/dashboard/organizations`,
            icon: IconBuilding,
          },
          {
            title: "Laboratories",
            url: `/dashboard/laboratories`,
            icon: IconTestPipe,
          },
          {
            title: "Pharmacies",
            url: `/dashboard/pharmacies`,
            icon: IconPill,
          },
          {
            title: "YAKAP Transmittals",
            url: `/dashboard/yakap`,
            icon: IconFileCertificate,
          },
        ]
      },
      {
        title: "Team & Staff",
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
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              <a href={`/${tenant}/dashboard`}>
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="" className="!size-5 rounded object-contain" referrerPolicy="no-referrer" />
                ) : (
                  <IconInnerShadowTop className="!size-5 text-primary" />
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
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  )
}
