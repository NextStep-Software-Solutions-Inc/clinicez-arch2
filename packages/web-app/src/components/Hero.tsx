import React from "react"
import { FaCirclePlay } from "react-icons/fa6"
import { StyledText } from "./StyledText"
import Link from "next/link"
import { Button } from "./ui/button"

type HeroFeaturedProps = {
  tagline?: string
  title: {
    text: string
    className?: string
    breakLine?: boolean
  }[]
  description?: string
  button: {
    text: string
    href: string
    variant?: "default" | "outline" | "ghost" | "link" | "secondary" | "destructive"
    icon?: React.ReactNode
  }[]
}

type HeroPageType = 'hero' | 'pricing'

export interface HeroFeaturedComponentProps {
  page: HeroPageType
}

const heroFeaturedItems: Record<string, HeroFeaturedProps> = {
  hero: {
    tagline: "Proven & Ready — Now Accepting New Partners",
    title: [{ text: "Streamline Your " }, { text: "Healthcare Practice", className: "text-primary", breakLine: true }],
    description:
      "Complete healthcare management system that simplifies appointment booking, patient records, and clinic operations. Proven effective with our educational healthcare partner.",
    button: [
      {
        text: "Register Now",
        href: "/tenants/register",
        variant: "default",
      },
      {
        text: "Watch free demo",
        href: "https://www.youtube.com/@ClinicEZ",
        icon: <FaCirclePlay fill="hsl(var(--primary)" size={24} />,
        variant: "outline",
      },
    ],
  },
  pricing: {
    tagline: "Healthcare Management Made Simple",
    title: [{ text: "Get a " }, { text: " Quote ", className: "text-primary" }, { text: "for Your " }, { text: "Healthcare Solution", breakLine: true }],
    description: "Pricing details will be available soon. Contact us for early access or custom inquiries. Transform your healthcare practice with our comprehensive management platform.",
    button: [
      {
        text: "Get a Quote",
        href: "#",
        variant: "default",
      },
      {
        text: "Watch free demo",
        href: "https://www.youtube.com/@ClinicEZ",
        variant: "outline",
      },
    ],
  },
}

export default function HeroFeatured({ page }: HeroFeaturedComponentProps) {
  const pageFeatures = heroFeaturedItems[page]

  if (!pageFeatures) {
    return null
  }

  return (
    <>
      {pageFeatures.tagline && (
        <div className="flex justify-center">
          <p className="inline-block text-xs md:text-sm lg:text-base font-semibold bg-teal-100 text-primary mb-4 rounded-full px-4 py-1">
            {pageFeatures.tagline}
          </p>
        </div>
      )}

      <HeroHeader
        header={pageFeatures.title}
        description={pageFeatures.description}
      />

      <div className="flex flex-col sm:flex-row gap-4 mt-6 justify-center items-center max-w-md sm:max-w-none mx-auto">
        {pageFeatures.button.map((item, index) => (
          <Button
            key={index}
            size="sm"
            className={`text-sm h-10 flex items-center justify-center gap-2 px-4 py-5 w-full sm:w-auto cursor-pointer ${item.variant === "outline"
              ? "border border-primary/20 hover:border-primary/40 hover:bg-primary/5"
              : ""
              }`}
            variant={item.variant === "outline" ? "ghost" : (item.variant || "default")}
            asChild
          >
            <Link href={item.href} className="w-full sm:w-auto">
              {item.icon && (
                <span className="flex items-center justify-center w-4 h-4">
                  {item.icon}
                </span>
              )}
              <span>{item.text}</span>
            </Link>
          </Button>
        ))}
      </div>
    </>
  )
}

interface HeroHeaderProps {
  header?: Array<{ text: string; className?: string; breakLine?: boolean }>
  description?: string
  className?: string
}

export const HeroHeader: React.FC<HeroHeaderProps> = ({ header, description }) => {
  return (
    <div className="text-center">
      {header && (
        <div className="text-3xl md:text-4xl lg:text-5xl font-semibold tracking-normal">
          <div className="mb-2">
            <StyledText segments={header} as="span" />
          </div>
        </div>
      )}
      {description && (
        <div className="text-gray-500 md:text-lg lg:text-xl mt-4 mx-auto text-base max-w-5xl">
          <span>{description}</span>
        </div>
      )}
    </div>
  )
}