"use client"

import * as React from "react"
import { useParams } from "next/navigation"
import {
  IconBuilding,
  IconCreditCard,
  IconDashboard,
  IconHospital,
  IconInnerShadowTop,
  IconPill,
  IconSettings,
  IconTestPipe,
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

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const params = useParams();
  const tenant = params.tenant as string || "demo-tenant";

  const data = {
    user: {
      name: "Dr. Admin",
      email: "admin@clinicez.com",
      avatar: "/avatars/shadcn.jpg",
    },
    navMain: [
      {
        title: "Overview",
        url: `/${tenant}/dashboard/overview`,
        icon: IconDashboard,
      },
      {
        title: "Clinics",
        url: `/${tenant}/dashboard/clinics`,
        icon: IconHospital,
      },
      {
        title: "Organizations",
        url: `/${tenant}/dashboard/organizations`,
        icon: IconBuilding,
      },
      {
        title: "Laboratories",
        url: `/${tenant}/dashboard/laboratories`,
        icon: IconTestPipe,
      },
      {
        title: "Pharmacies",
        url: `/${tenant}/dashboard/pharmacies`,
        icon: IconPill,
      },
    ],
    navSecondary: [
      {
        title: "Settings",
        url: `/${tenant}/dashboard/settings`,
        icon: IconSettings,
      },
      {
        title: "Billing",
        url: `/${tenant}/dashboard/billing`,
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
                <span className="text-base font-bold text-foreground">Clinic EZ</span>
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
