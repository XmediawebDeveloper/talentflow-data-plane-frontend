import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false, // Disable StrictMode to prevent double API calls in development
};

export default nextConfig;
