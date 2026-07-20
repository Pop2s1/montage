import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "512mb",
    },
  },
  // Allow large uploads in route handlers during local/dev usage
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
};

export default nextConfig;
