import Image from "next/image";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./ui/card";
import Link from "next/link";
import { Button } from "./ui/button";

interface ShellCardProps {
  title: string
  description?: string
  image?: {
    src: string
    alt?: string
  }
  content: {
    count: number
    title: string
  }
  button: {
    href: string
    text: string
    variant?: "default" | "outline"
  }
  privacyPolicyUrl?: string
  termsUrl?: string
}

export default function ShellCard({ image, title, description, button, content, privacyPolicyUrl, termsUrl }: ShellCardProps) {
  return (
    <Card className="flex flex-col border-none shadow-none bg-transparent">
      <CardHeader className="pb-4">
        <div className="aspect-square relative mb-4 overflow-hidden rounded-lg w-full">
          <Image
            src={image?.src || "/placeholder.svg"}
            alt={image?.alt || "Unknown Image"}
            fill
            className="object-cover"
          />
        </div>
        <CardTitle className="text-xl capitalize">{title}</CardTitle>
        {description && <CardDescription className="text-sm line-clamp-1">{description}</CardDescription>}
      </CardHeader>
      <CardContent className="pb-4">
        <div className="flex justify-start">
          <div className="bg-primary/15 rounded-full px-3 py-1 flex items-center justify-center">
            <span className="text-xs font-medium text-accent-foreground">
              {content.count} {content.title}
            </span>
          </div>
        </div>
      </CardContent>
      <CardFooter className="pt-0 flex flex-col gap-2">
        <Link
          href={button.href}
          className="w-full"
          target={button.href.startsWith("http") ? "_blank" : undefined}
          rel={button.href.startsWith("http") ? "noopener noreferrer" : undefined}
        >
          <Button className="w-full">{button.text}</Button>
        </Link>
        <div className="flex items-center justify-between w-full text-[11px] text-muted-foreground pt-1">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
            DPA 2012 Compliant
          </span>
          <Link
            href={privacyPolicyUrl || "/privacy"}
            className="hover:underline hover:text-foreground transition-colors"
            target={privacyPolicyUrl?.startsWith("http") ? "_blank" : undefined}
          >
            Privacy Policy
          </Link>
        </div>
      </CardFooter>
    </Card>
  );
}