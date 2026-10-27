import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@shared/safe", "@clinicez/comms-sdk", "@clinicez/design-tokens"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        port: "",
        pathname: "/**"
      },
    ]
  },
  async redirects() {
    return [
      {
        source: "/signup",
        destination: "/sign-up",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
