import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  allowedDevOrigins: ["dashboard.127.0.0.1.nip.io"],
};

export default nextConfig;