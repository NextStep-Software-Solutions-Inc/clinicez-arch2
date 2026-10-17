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
  async redirects() {
    return [
      {
        source: "/signup",
        destination: "/sign-up",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    const rawClinicApiUrl = (process.env.NEXT_PUBLIC_CLINIC_API_URL || process.env.CLINIC_API_URL || "http://localhost:5245").replace(/\/+$/, "");
    const clinicOrigin = rawClinicApiUrl.replace(/\/api\/v1\/?$/i, "");
    return [
      {
        source: "/api/v1/public/:path*",
        destination: `${clinicOrigin}/api/v1/public/:path*`,
      },
    ];
  }
};

export default nextConfig;
