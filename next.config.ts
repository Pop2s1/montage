import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Vercel request body limits are lower in practice; keep modest for deploy
      bodySizeLimit: "32mb",
    },
  },
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  // ffmpeg-static ships a large binary via symlinks and breaks Vercel packaging:
  // "invalid deployment package for a Serverless Function"
  outputFileTracingExcludes: {
    "*": [
      "./node_modules/ffmpeg-static/**/*",
      "./node_modules/@ffmpeg-installer/**/*",
      "./storage/**/*",
    ],
  },
};

export default nextConfig;
