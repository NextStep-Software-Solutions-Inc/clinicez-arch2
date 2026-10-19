"use client";

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { NotificationPopover } from "@/components/dashboard/NotificationPopover";

export function SiteHeader() {
  const pathname = usePathname();
  const trimmedPath = pathname.replace(/\/+$/, "");
  const segments = trimmedPath.split("/");
  const currentPage = segments.length > 1 ? segments.pop() : "home";
  
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height) bg-background">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <h1 className="text-base font-medium capitalize">{currentPage}</h1>
        <div className="ml-auto flex items-center gap-3">
          <Button variant="ghost" asChild size="sm" className="hidden sm:flex">
            <Link
              href="/"
              rel="noopener noreferrer"
              className="dark:text-foreground"
            >
              Clinic EZ
            </Link>
          </Button>
          <NotificationPopover />
          <UserButton afterSignOutUrl="/" />
        </div>
      </div>
    </header>
  )
}
