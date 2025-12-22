import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "talentflow.data.mo.vc",
    "*.mo.vc",
  ],
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
