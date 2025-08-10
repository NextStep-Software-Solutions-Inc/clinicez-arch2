import { cn } from "@/lib/utils";
import { DetailedHTMLProps } from "react";
import ClinicEzLogo from "./../../public/clinic-ez_logo.svg";
import Link from "next/link";
import Navigation from "@/components/Navigation";
import HeaderEffects from "@/components/HeaderEffects";
import { Button } from "@/components/ui/button";
import RootDrawer from "@/components/RootDrawer";
import { Star } from "lucide-react";
import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import ClerkUserButton from "@/components/ClerkUserButton";
import Image from "next/image";

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
            <Link href="/" className="flex">
              <Image src={ClinicEzLogo}
                width={100}
                height={40}
                className=""
                alt="ClinicEz Logo" />
            </Link>
          </div>

          <RootDrawer>
            <Button variant="ghost" className="inline-flex p-2 text-black transition-all duration-200 rounded-md md:hidden focus:bg-gray-100 hover:bg-gray-100" asChild>
              <button>
                {/* <!-- Menu open: "hidden", Menu closed: "block" --> */}
                <svg className="block w-6 h-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8h16M4 16h16"></path>
                </svg>

                {/* <!-- Menu open: "block", Menu closed: "hidden" --> */}
                <svg className="hidden w-6 h-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </Button>
          </RootDrawer>

          <div className="hidden md:flex lg:items-center lg:justify-center lg:space-x-10">
            <Navigation />
          </div>
          <div className="flex items-center">
            <Link href="/tenants/register">
              <Button aria-label="Start your 30-day free trial">
                <Star />
                <span className="text-sm font-medium">Try 30 days for free</span>
              </Button>
            </Link>
            <div className="mx-2">
              <SignedIn>
                <ClerkUserButton />
              </SignedIn>
              <SignedOut>
                <SignInButton mode="modal">
                  <Button variant="link" aria-label="Login to your account">Login</Button>
                </SignInButton>
              </SignedOut>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}