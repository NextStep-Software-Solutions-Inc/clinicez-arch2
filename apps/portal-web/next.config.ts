import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@shared/safe"],
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
  async rewrites() {
    const clinicApiUrl = (process.env.NEXT_PUBLIC_CLINIC_API_URL || process.env.CLINIC_API_URL || "http://localhost:5245").replace(/\/+$/, "");
    return [
      {
        source: "/api/v1/public/:path*",
        destination: `${clinicApiUrl}/api/v1/public/:path*`,
      },
    ];
  }
};

export default nextConfig;
