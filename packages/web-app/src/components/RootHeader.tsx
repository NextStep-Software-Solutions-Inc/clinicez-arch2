import { cn } from "@/lib/utils";
import { DetailedHTMLProps } from "react";
import AnimatedLogo from "./AnimatedLogo";
import Link from "next/link";
import Navigation from "./Navigation";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import HeaderEffects from "./HeaderEffects";

type IRootHeaderProps = DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement>
export default function RootHeader({ className, ...props }: IRootHeaderProps) {
  return (
    <header
      id="root-header"
      className={
        cn(
          "transition-colors duration-300 bg-transparent",
          className
        )
      } {...props}>
      <HeaderEffects headerId="root-header" />
      <div className="container mx-auto">
        <div className="flex items-center justify-between h-16 lg:h-20">
          <div className="hidden lg:flex flex-shrink-0">
            <Link href="/" className="flex h-40">
              <AnimatedLogo />
            </Link>
          </div>
          <div className="hidden md:flex lg:items-center lg:justify-center lg:space-x-10">
            <Navigation />
          </div>
          <div className="flex items-center">
            <Avatar className="size-10">
              <AvatarImage src="https://github.com/shadcn.png" alt="User" />
              <AvatarFallback>JS</AvatarFallback>
            </Avatar>
          </div>
        </div>
      </div>
    </header>
  );
}