import Link from "next/link"
import Each from "./utils/Each"
import Icon from "./Icon"
import SectionHPImage from "../../public/assets/SectionHPImage.png"

import dynamicIconImports from 'lucide-react/dynamicIconImports';
import Image, { StaticImageData } from "next/image";
import { Input } from "./ui/input";
import { Button } from "./ui/button";

type FeaturedPageType = 'hero' | 'pricing'

interface FeaturedItemsComponentProps {
  page: FeaturedPageType
}

type FeaturedItemProps = {
  title?: string
  description?: string
  image?: {
    src: StaticImageData | string
    alt: string
  }
  input?: {
    type: string
    placeholder: string
  }
  button?: {
    text: string
    href: string
  }
  background?: React.CSSProperties["backgroundColor"] | string
  cards?: {
    orientation: "horizontal" | "vertical"
    background?: string
    content: {
      title: string
      description: string
      icon?: keyof typeof dynamicIconImports
      href?: string
    }[]
  }
}



const topFeatures: Record<string, FeaturedItemProps[]> = {
  hero: [
    {
      title: "Everything You Need, Already Built",
      description: "Our comprehensive platform handles all aspects of healthcare practice management features that are tested and ready to deploy.",
      cards: {
        orientation: "horizontal",
        content: [
          {
            title: "Smart Appointment Booking",
            description: "24/7 online booking with automated reminders and calendar sync. Reduce scheduling conflicts and no-shows.",
            icon: "calendar",
          },
          {
            title: "Patient Management",
            description: "Complete patient profiles, medical history, and secure document storage in one centralized system.",
            icon: "users",
          },
          {
            title: "Real-Time Scheduling",
            description: "Dynamic scheduling with conflict detection and automatic optimization for maximum efficiency.",
            icon: "clock",
          }
        ]
      },
    },
    {
      title: "Interested in ClinicEZ?",
      description: "Schedule a personalized demo to see how ClinicEZ can streamline your healthcare operations.",
      input: {
        type: "email",
        placeholder: "Enter your email address",
      },
      button: {
        text: "Get Started",
        href: "#",
      },
    },
    {
      title: "Ready to Expand to More Healthcare Providers",
      image: { src: SectionHPImage, alt: "Section HP Image" },
      cards: {
        orientation: "vertical",
        content: [
          {
            title: "Proven Reliability",
            description: "Battle-tested in real healthcare environments.",
            icon: "shield",
          },
          {
            title: "User-Friendly",
            description: "Intuitive design that healthcare staffs love.",
            icon: "user",
          },
          {
            title: "Quick Implementation",
            description: "Fast setup with comprehensive support.",
            icon: "zap",
          }
        ]
      }
    },
    {
      title: "Built by Healthcare Technology Experts",
      description: "Our team combines deep healthcare knowledge with modern technology expertise to create solutions that actually works in real healhcare environments.",
      button: {
        text: "Get Started",
        href: "#",
      }
    }
  ],
  pricing: [
    {
      background: "bg-transparent",
      cards: {
        background: "bg-white/60",
        orientation: "horizontal",
        content: [
          {
            title: "Healthcare Providers",
            description: "Streamline your practice management with our comprehensive tools.",
            icon: "users",
          },
          {
            title: "Patient Management",
            description: "Complete patient profiles, medical history, and secure document storage in one centralized system.",
            icon: "users",
          },
          {
            title: "Real-Time Scheduling",
            description: "Dynamic scheduling with conflict detection and automatic optimization for maximum efficiency.",
            icon: "clock",
          }
        ]
      },
    },
  ]
}

export default function FeaturedItems({ page }: FeaturedItemsComponentProps) {
  const pageFeatures = topFeatures[page] || topFeatures.hero

  return (
    <div className="w-full">
      <Each
        of={pageFeatures}
        render={(item: FeaturedItemProps) => (
          <section className={`w-full py-12 md:py-16 lg:py-24 px-4 sm:px-8 md:px-16 lg:px-36 ${item.input || item.button ? 'bg-accent' : 'bg-background'
            } ${item.background ? item.background : ''}`}>
            <div className="container mx-auto">
              <div className="text-center mb-8">
                <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-4 md:mb-6 max-w-5xl mx-auto leading-tight">{item.title}</h2>
                {item.description && <p className="text-base md:text-lg text-muted-foreground max-w-3xl md:max-w-4xl lg:max-w-5xl mx-auto leading-relaxed">{item.description}</p>}
              </div>
              {item.cards && (
                <div className={`${item.image ? 'flex flex-col lg:flex-row gap-6 md:gap-8 items-stretch' : 'flex justify-center'} ${item.cards.orientation === "horizontal" ? 'flex-wrap' : ''} ${item.image ? 'lg:items-center' : ''}`}>
                  {item.image && (
                    <div className="flex items-center justify-center lg:w-1/2 mb-6 lg:mb-0">
                      <Image
                        src={item.image.src}
                        alt={item.image.alt}
                        width={500}
                        height={300}
                        className="w-full h-auto rounded-lg shadow-md max-w-md lg:max-w-none"
                      />
                    </div>
                  )}
                  <div className={`${item.image ? 'lg:w-1/2 flex flex-col justify-center' : 'max-w-6xl'} grid ${item.cards.orientation === "horizontal"
                    ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                    : "grid-cols-1"
                    } gap-4 md:gap-6 ${item.image ? 'h-full' : ''}`}>
                    <Each
                      of={item.cards.content}
                      render={(card) => (
                        <div className={`p-4 md:p-6 rounded-lg shadow-sm bg-card hover:shadow-md transition-shadow ${item.cards?.background || ''}`}>
                          {item.cards?.orientation === "vertical" ? (
                            <div className="flex items-center gap-3 md:gap-4">
                              {card.icon && (
                                <div className="p-2 md:p-3 rounded-full bg-accent flex items-center justify-center shrink-0">
                                  <Icon name={card.icon} className="text-primary" size={18} />
                                </div>
                              )}
                              <div className="flex flex-col">
                                <h3 className="font-semibold text-base md:text-lg mb-1 md:mb-2">{card.title}</h3>
                                <p className="text-sm text-muted-foreground leading-relaxed">{card.description}</p>
                              </div>
                            </div>
                          ) : (
                            <div className="text-left">
                              {card.icon && (
                                <div className="p-3 md:p-4 rounded-full bg-accent inline-flex items-center justify-center mb-3 md:mb-4">
                                  <Icon name={card.icon} className="text-primary" size={20} />
                                </div>
                              )}
                              <div>
                                <h3 className="font-semibold text-base md:text-lg mb-2 md:mb-3">{card.title}</h3>
                                <p className="text-sm md:text-base text-muted-foreground leading-relaxed">{card.description}</p>
                              </div>
                            </div>
                          )}
                          {card.href && (
                            <Link href={card.href} className="text-primary hover:underline mt-4 block">
                              Learn More
                            </Link>
                          )}
                        </div>
                      )}
                    />
                  </div>
                </div>
              )}
              {(item.input || item.button) && (
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 md:gap-4 mt-6 md:mt-8">
                  {item.input && (
                    <Input
                      type={item.input.type}
                      placeholder={item.input.placeholder}
                      className="w-full sm:w-64 md:w-80 h-10 bg-background border border-gray-300 rounded-lg px-3 md:px-4 py-2 text-sm md:text-base focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  )}
                  {item.button && (
                    <Button asChild size="lg" className="w-full sm:w-auto">
                      <Link href={item.button.href}>
                        {item.button.text}
                      </Link>
                    </Button>
                  )}
                </div>
              )}
            </div>
          </section>
        )}
        fallback={<div className="text-center text-muted-foreground py-12">No featured items available</div>}
      />
    </div>
  );
}