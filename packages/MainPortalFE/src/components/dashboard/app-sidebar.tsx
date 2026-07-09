"use client"

import * as React from "react"
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

const data = {
  user: {
    name: "shadcn",
    email: "m@example.com",
    avatar: "/avatars/shadcn.jpg",
  },
  navMain: [
    {
      title: "Overview",
      url: "/dashboard/overview",
      icon: IconDashboard,
    },
    {
      title: "Clinics",
      url: "/dashboard/clinics",
      icon: IconHospital,
    },
    {
      title: "Organizations",
      url: "/dashboard/organizations",
      icon: IconBuilding,
    },
    {
      title: "Laboratories",
      url: "/dashboard/laboratories",
      icon: IconTestPipe,
    },
    {
      title: "Pharmacies",
      url: "/dashboard/pharmacies",
      icon: IconPill,
    },
  ],
  navSecondary: [
    {
      title: "Settings",
      url: "/dashboard/settings",
      icon: IconSettings,
    },
    {
      title: "Billing",
      url: "/dashboard/billing",
      icon: IconCreditCard,
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              <a href="#">
                <IconInnerShadowTop className="!size-5" />
                <span className="text-base font-semibold">Acme Inc.</span>
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
