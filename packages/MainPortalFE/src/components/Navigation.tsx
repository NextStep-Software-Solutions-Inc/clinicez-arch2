"use client"

import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu"
import Link from "next/link"
import { cn } from "@/lib/utils"
import type dynamicIconImports from "lucide-react/dynamicIconImports"
import React from "react"
import Each from "./utils/Each"

type NavLinkType = {
  name: string
  href: string
  icon: keyof typeof dynamicIconImports
}

export const navLinks: NavLinkType[] = [
  { name: "Solution", href: "/solution", icon: "layers" },
  { name: "Products", href: "/products", icon: "package" },
  { name: "Pricing", href: "/pricing", icon: "coins" },
  { name: "Contact Us", href: "/contact-us", icon: "contact" },
]

export default function Navigation() {
  return (
    <NavigationMenu>
      <NavigationMenuList>
        <Each
          of={navLinks}
          render={(link: NavLinkType) => (
            <NavigationMenuItem key={link.name}>
              <NavigationMenuLink className={cn(navigationMenuTriggerStyle(), "bg-transparent")} asChild>
                <Link href={link.href}>
                  {link.name}
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
          )}
        />
      </NavigationMenuList>
    </NavigationMenu>
  )
}
