"use client"

import { useState, useEffect } from "react"
import { IconCirclePlusFilled, IconSearch, IconChevronRight, type Icon } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  useSidebar,
} from "@/components/ui/sidebar"
import Link from "next/link"
import { useParams, usePathname } from "next/navigation"
import { isTenantSubdomainHost } from "@/utils/domain"
import QuickCreateDialog from "./QuickCreateDialog"
import WorkspaceSearchDialog from "./WorkspaceSearchDialog"

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

export function resolveDashboardNavHref(
  tenant: string | undefined,
  itemUrl?: string,
  onSubdomain: boolean = isTenantSubdomainHost(),
): string {
  if (!itemUrl) return ""
  if (onSubdomain || !tenant) {
    return itemUrl
  }
  return `/${tenant}${itemUrl}`
}

export function isDashboardNavActive(
  pathname: string | null | undefined,
  tenant: string | undefined,
  itemUrl?: string,
  allowSubPath: boolean = true,
): boolean {
  if (!pathname || !itemUrl) return false
  const prefixed = tenant ? `/${tenant}${itemUrl}` : itemUrl

  if (pathname === itemUrl || pathname === prefixed) {
    return true
  }

  if (allowSubPath && itemUrl !== "/dashboard") {
    return (
      pathname.startsWith(`${itemUrl}/`) ||
      pathname.startsWith(`${prefixed}/`)
    )
  }

  return false
}

export function NavMain({
  items,
}: {
  items: NavItem[]
}) {
  const { tenant } = useParams<{ tenant: string }>()
  const pathname = usePathname()
  const onSubdomain = isTenantSubdomainHost()
  
  // Track open state of expandable menus
  const [openStates, setOpenStates] = useState<Record<string, boolean>>({})
  const [isSearchOpen, setIsSearchOpen] = useState(false)

  let isMobile = false
  let setOpenMobile: ((open: boolean) => void) | undefined
  try {
    const sidebar = useSidebar()
    isMobile = sidebar.isMobile
    setOpenMobile = sidebar.setOpenMobile
  } catch {
    // Graceful fallback when rendered without SidebarProvider in isolated tests
  }

  // Ensure search modal closes on route change
  useEffect(() => {
    setIsSearchOpen(false)
  }, [pathname])

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
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  id="workspace-search-trigger"
                  size="icon"
                  className="size-8 group-data-[collapsible=icon]:opacity-0 cursor-pointer touch-manipulation"
                  variant="outline"
                  onClick={() => {
                    if (isMobile) {
                      setOpenMobile?.(false)
                    }
                    setIsSearchOpen(true)
                  }}
                  aria-label="Search workspace (⌘K)"
                >
                  <IconSearch className="size-4" />
                  <span className="sr-only">Search workspace (⌘K)</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                Search workspace (⌘K)
              </TooltipContent>
            </Tooltip>
            <WorkspaceSearchDialog
              open={isSearchOpen}
              onOpenChange={setIsSearchOpen}
              tenantSlug={tenant}
            />
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
                    <SidebarMenuSub className="ml-4 border-l border-border pl-2 mt-1 space-y-1">
                      {item.items?.map((subItem) => {
                        const subHref = resolveDashboardNavHref(tenant, subItem.url, onSubdomain)
                        const isSubActive = isDashboardNavActive(pathname, tenant, subItem.url, true)
                        
                        return (
                          <SidebarMenuSubItem key={subItem.title}>
                            <SidebarMenuSubButton asChild isActive={isSubActive}>
                              <Link href={subHref} className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors">
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

            const newPath = resolveDashboardNavHref(tenant, item.url, onSubdomain)
            const isActive = isDashboardNavActive(pathname, tenant, item.url, true)
            
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
