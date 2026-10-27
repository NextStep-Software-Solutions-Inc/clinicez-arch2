"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { useClerk } from "@clerk/nextjs"

import {
  IconCreditCard,
  IconDotsVertical,
  IconLogout,
  IconNotification,
  IconUserCircle,
} from "@tabler/icons-react"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { NotificationsDialog } from "@/components/dashboard/NotificationsDialog"
import { forceReleaseBodyScrollLock } from "@/components/dashboard/WorkspaceSearchDialog"
import { usePortalNotifications } from "@/hooks/usePortalNotifications"
import {
  CLERK_PORTAL_APPEARANCE,
  sanitizeStaleClerkBillingHash,
} from "@/lib/clerkAppearance"

export function getSubscriptionPlansHref(
  tenant?: string | string[] | null,
): string {
  const raw = Array.isArray(tenant) ? tenant[0] : tenant
  const slug = typeof raw === "string" ? raw.trim() : ""
  if (!slug) {
    return "/admin/plans"
  }
  return `/${encodeURIComponent(slug)}/dashboard/billing?tab=plans`
}

export function getUserInitials(
  name?: string | null,
  email?: string | null,
): string {
  const cleanName = typeof name === "string" ? name.trim() : ""
  if (cleanName) {
    const tokens = cleanName.split(/\s+/).filter(Boolean)
    const filtered =
      tokens.length > 1
        ? tokens.filter((t) => !/^(dr|mr|mrs|ms|prof)\.?$/i.test(t))
        : tokens
    const effective = filtered.length > 0 ? filtered : tokens
    if (effective.length >= 2) {
      return `${effective[0][0] ?? ""}${effective[effective.length - 1][0] ?? ""}`.toUpperCase()
    }
    if (effective[0]) {
      return effective[0].slice(0, 2).toUpperCase()
    }
  }

  const cleanEmail = typeof email === "string" ? email.trim() : ""
  if (cleanEmail) {
    return cleanEmail[0].toUpperCase()
  }

  return "U"
}

export interface NavUserActionDeps {
  tenant?: string | string[] | null
  isMobile: boolean
  setDropdownOpen: (open: boolean) => void
  setOpenMobile?: (open: boolean) => void
  openUserProfile: (props?: { appearance?: typeof CLERK_PORTAL_APPEARANCE }) => void
  pushRoute: (href: string) => void
  openNotificationsModal: () => void
  signOut: (opts?: { redirectUrl?: string }) => Promise<void> | void
  scheduleNextTick?: (cb: () => void) => void
  sanitizeHash?: () => void
  suppressDropdownCloseAutoFocus?: () => void
  releaseBodyScrollLock?: () => void
}

export function createNavUserActions(deps: NavUserActionDeps) {
  const closeMenus = () => {
    deps.setDropdownOpen(false)
    if (deps.isMobile) {
      deps.setOpenMobile?.(false)
    }
  }

  const schedule =
    deps.scheduleNextTick ?? ((cb: () => void) => setTimeout(cb, 0))
  const cleanHash =
    deps.sanitizeHash ?? (() => sanitizeStaleClerkBillingHash())
  const releaseLock =
    deps.releaseBodyScrollLock ?? (() => forceReleaseBodyScrollLock())

  return {
    handleOpenAccount: () => {
      deps.suppressDropdownCloseAutoFocus?.()
      closeMenus()
      cleanHash()
      // Defer opening Clerk's modal by one tick after DropdownMenu / mobile Sheet
      // starts closing so Radix pointer-events & FocusScope never fight Clerk's modal.
      schedule(() => {
        releaseLock()
        deps.openUserProfile({ appearance: CLERK_PORTAL_APPEARANCE })
      })
    },
    handleNavigateSubscriptionPlans: () => {
      closeMenus()
      deps.pushRoute(getSubscriptionPlansHref(deps.tenant))
    },
    handleOpenNotifications: () => {
      deps.suppressDropdownCloseAutoFocus?.()
      closeMenus()
      // Defer opening the Radix Dialog by one tick after DropdownMenu closes
      // so Radix FocusScope and body pointer-events locks never collide.
      schedule(() => {
        releaseLock()
        deps.openNotificationsModal()
      })
    },
    handleSignOut: () => {
      closeMenus()
      void deps.signOut({ redirectUrl: "/" })
    },
  }
}

export interface NavUserProps {
  user: {
    name: string
    email: string
    avatar: string
    role?: string
  }
  onOpenNotifications?: () => void
}

export function NavUser({ user, onOpenNotifications }: NavUserProps) {
  let isMobile = false
  let setOpenMobile: ((open: boolean) => void) | undefined
  try {
    const sidebar = useSidebar()
    isMobile = sidebar.isMobile
    setOpenMobile = sidebar.setOpenMobile
  } catch {
    // Graceful fallback when rendered outside SidebarProvider in isolated tests
  }

  const params = useParams<{ tenant?: string | string[] }>()
  const tenant = params?.tenant
  const router = useRouter()
  const { openUserProfile, signOut } = useClerk()
  const { unreadCount } = usePortalNotifications()

  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [internalNotificationsOpen, setInternalNotificationsOpen] = useState(false)
  const isMountedRef = useRef(true)
  const suppressCloseAutoFocusRef = useRef(false)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const handleDropdownCloseAutoFocus = useCallback((event: Event) => {
    if (suppressCloseAutoFocusRef.current) {
      event.preventDefault()
      suppressCloseAutoFocusRef.current = false
    }
  }, [])

  const getActions = useCallback(
    () =>
      createNavUserActions({
        tenant,
        isMobile,
        setDropdownOpen,
        setOpenMobile,
        openUserProfile,
        pushRoute: (href) => router.push(href),
        openNotificationsModal: () => {
          if (onOpenNotifications) {
            onOpenNotifications()
          } else if (isMountedRef.current) {
            setInternalNotificationsOpen(true)
          }
        },
        signOut,
        suppressDropdownCloseAutoFocus: () => {
          suppressCloseAutoFocusRef.current = true
        },
      }),
    [
      tenant,
      isMobile,
      setOpenMobile,
      openUserProfile,
      router,
      onOpenNotifications,
      signOut,
    ],
  )

  const handleOpenAccount = useCallback(() => {
    getActions().handleOpenAccount()
  }, [getActions])

  const handleNavigateSubscriptionPlans = useCallback(() => {
    getActions().handleNavigateSubscriptionPlans()
  }, [getActions])

  const handleOpenNotifications = useCallback(() => {
    getActions().handleOpenNotifications()
  }, [getActions])

  const handleSignOut = useCallback(() => {
    getActions().handleSignOut()
  }, [getActions])

  const initials = getUserInitials(user.name, user.email)

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <Avatar className="h-8 w-8 rounded-lg grayscale">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {user.email}
                  </span>
                </div>
                <IconDotsVertical className="ml-auto size-4" aria-hidden="true" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
              side={isMobile ? "bottom" : "right"}
              align="end"
              sideOffset={4}
              onCloseAutoFocus={handleDropdownCloseAutoFocus}
            >
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarImage src={user.avatar} alt={user.name} />
                    <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{user.name}</span>
                    <span className="text-muted-foreground truncate text-xs">
                      {user.email}
                    </span>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onSelect={handleOpenAccount}>
                  <IconUserCircle aria-hidden="true" />
                  Account
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handleNavigateSubscriptionPlans}>
                  <IconCreditCard aria-hidden="true" />
                  Subscription Plans
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handleOpenNotifications}>
                  <IconNotification aria-hidden="true" />
                  <span className="flex-1">Notifications</span>
                  {unreadCount > 0 ? (
                    <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </Badge>
                  ) : null}
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={handleSignOut}>
                <IconLogout aria-hidden="true" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      {!onOpenNotifications ? (
        <NotificationsDialog
          open={internalNotificationsOpen}
          onOpenChange={setInternalNotificationsOpen}
        />
      ) : null}
    </>
  )
}
