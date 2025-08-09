import Link from "next/link";
import { AiFillInstagram } from "react-icons/ai";
import { BsSlack } from "react-icons/bs";
import { FaFacebook, FaTwitter } from "react-icons/fa6";
import { Separator } from "./ui/separator";
import Image from "next/image";
import ClinicEzLogo from "../../public/clinic-ez_logo.svg";

const footerLinks = [
  {
    title: "About",
    link: "#",
  },
  {
    title: "Features",
    link: "#",
  },
  {
    title: "Works",
    link: "#",
  },
  {
    title: "Solution",
    link: "/solution",
  },
  {
    title: "Support",
    link: "#",
  },
  {
    title: "Help",
    link: "#",
  },
];

const socialIcons = [
  {
    alt: "facebook",
    icon: <FaFacebook />,
    link: "#",
  },
  {
    alt: "instagram",
    icon: <AiFillInstagram />,
    link: "#",
  },
  {
    alt: "slack",
    icon: <BsSlack />,
    link: "#",
  },
  {
    alt: "twitter",
    icon: <FaTwitter />,
    link: "#",
  },
];

const legalTerms = [
  {
    title: "Privacy Policy",
    link: "#",
  },
  {
    title: "Terms of Conditions",
    link: "#",
  }
];

const fullYear = new Date().getFullYear()

export default function RootFooter() {
  return (
    <footer className="bg-slate-50 py-12">
      <div className="container mx-auto px-6">
        <div className="flex flex-col justify-center items-center space-y-8">
          <Link href="/">
            <Image
              src={ClinicEzLogo}
              width={120}
              height={120}
              alt="logo"
            />
          </Link>
          <div className="flex flex-col sm:flex-row justify-center gap-4 sm:gap-8">
            {footerLinks.map((item, index) => {
              return (
                <Link
                  href={item.link}
                  key={index}
                  className="text-gray-700 hover:text-primary transition-colors text-center"
                >
                  <span>{item.title}</span>
                </Link>
              )
            })}
          </div>

          <Separator className="!w-48" />

          <div className="flex gap-6">
            {socialIcons.map((item, index) => {
              return (
                <Link
                  href={item.link}
                  key={index}
                  className="text-2xl text-gray-700 hover:text-primary transition-colors"
                >
                  <span className="w-6 h-6 flex items-center justify-center">{item.icon}</span>
                </Link>
              )
            })}
          </div>

          <p className="text-center text-sm text-gray-600">
            <span>&copy; Copyright {fullYear} </span>
            <span>PointersBit Inc.</span>, All rights reserved.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 justify-center items-center pt-4">
            {legalTerms.map((item, index) => {
              return (
                <Link
                  href={item.link}
                  key={index}
                  className="text-sm text-gray-700 hover:text-primary transition-colors text-center"
                >
                  <span>{item.title}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </footer>
  );
}