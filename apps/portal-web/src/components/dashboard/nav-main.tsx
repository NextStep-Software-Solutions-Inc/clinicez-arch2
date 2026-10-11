"use client"

import { useState } from "react"
import { IconCirclePlusFilled, IconMail, IconChevronRight, type Icon } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from "@/components/ui/sidebar"
import Link from "next/link"
import { useParams, usePathname } from "next/navigation"
import QuickCreateDialog from "./QuickCreateDialog"

interface NavItem {
  title: string
  url?: string
  icon?: Icon
  items?: {
    title: string
    url: string
    icon?: Icon
  }[]
}

export function NavMain({
  items,
}: {
  items: NavItem[]
}) {
  const { tenant } = useParams<{ tenant: string }>()
  const pathname = usePathname()
  
  // Track open state of expandable menus
  const [openStates, setOpenStates] = useState<Record<string, boolean>>({})

  const toggleOpen = (title: string) => {
    setOpenStates((prev) => ({
      ...prev,
      [title]: !prev[title],
    }))
  }

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2">
            <QuickCreateDialog trigger={
              <SidebarMenuButton
                tooltip="Quick Create"
                className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground min-w-8 duration-200 ease-linear"
              >
                <IconCirclePlusFilled />
                <span>Quick Create</span>
              </SidebarMenuButton>
            } />
            <Button
              size="icon"
              className="size-8 group-data-[collapsible=icon]:opacity-0"
              variant="outline"
            >
              <IconMail />
              <span className="sr-only">Inbox</span>
            </Button>
          </SidebarMenuItem>
        </SidebarMenu>
        
        <SidebarMenu>
          {items.map((item) => {
            const hasSubItems = item.items && item.items.length > 0
            
            if (hasSubItems) {
              const isOpen = !!openStates[item.title]
              
              return (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    onClick={() => toggleOpen(item.title)}
                    tooltip={item.title}
                  >
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                    <IconChevronRight 
                      className={`ml-auto h-4 w-4 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`} 
                    />
                  </SidebarMenuButton>
                  
                  {isOpen && (
                    <SidebarMenuSub className="ml-4 border-l border-slate-100 dark:border-slate-800 pl-2 mt-1 space-y-1">
                      {item.items?.map((subItem) => {
                        const subPath = `/${tenant}${subItem.url}`
                        const isSubActive = pathname === subPath
                        
                        return (
                          <SidebarMenuSubItem key={subItem.title}>
                            <SidebarMenuSubButton asChild isActive={isSubActive}>
                              <Link href={subPath} className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-primary transition-colors">
                                {subItem.icon && <subItem.icon className="h-4 w-4" />}
                                <span className="text-xs font-semibold">{subItem.title}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )
                      })}
                    </SidebarMenuSub>
                  )}
                </SidebarMenuItem>
              )
            }

            const newPath = item.url ? `/${tenant}${item.url}` : ""
            const isActive = pathname === newPath || (!!item.url && item.url !== "/dashboard" && pathname?.startsWith(`${newPath}/`))
            
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
                  <Link href={newPath}>
                    {item.icon && <item.icon />}
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
