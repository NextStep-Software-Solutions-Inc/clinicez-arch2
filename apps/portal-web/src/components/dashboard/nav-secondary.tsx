"use client"

import * as React from "react"
import Link from "next/link"
import { type Icon } from "@tabler/icons-react"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useParams, usePathname } from "next/navigation"
import { isTenantSubdomainHost } from "@/utils/domain"
import {
  isDashboardNavActive,
  resolveDashboardNavHref,
} from "./nav-main"

export function NavSecondary({
  items,
  ...props
}: {
  items: {
    title: string
    url: string
    icon: Icon
  }[]
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  const { tenant } = useParams<{ tenant: string }>()
  const pathname = usePathname()
  const onSubdomain = isTenantSubdomainHost()

  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const newPath = resolveDashboardNavHref(tenant, item.url, onSubdomain)
            const isActive = isDashboardNavActive(pathname, tenant, item.url, true)
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild isActive={isActive}>
                  <Link href={newPath}>
                    <item.icon />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
