"use client"

import * as React from "react"
import { useParams } from "next/navigation"
import {
  IconBuilding,
  IconDashboard,
  IconHospital,
  IconInnerShadowTop,
  IconPill,
  IconSettings,
  IconTestPipe,
  IconCreditCard,
} from "@tabler/icons-react"

import { NavMain } from "@/components/dashboard/nav-main"
import { NavUser } from "@/components/dashboard/nav-user"
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

export function AppSidebar({ clinicName = "Clinic EZ", user, ...props }: { clinicName?: string, user?: any } & React.ComponentProps<typeof Sidebar>) {
  const params = useParams();
  const tenant = params.tenant as string || "demo-tenant";

  const data = {
    user: user || {
      name: "Dr. Admin",
      email: "admin@clinicez.net",
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
        ]
      },
    ],
    navSecondary: [
      {
        title: "Settings",
        url: `/dashboard/settings`,
        icon: IconSettings,
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
                <IconInnerShadowTop className="!size-5 text-primary" />
                <span className="text-base font-bold text-foreground truncate">{clinicName} | Workspace</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
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
