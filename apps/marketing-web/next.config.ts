import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@shared/safe", "@clinicez/design-tokens"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        port: "",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
