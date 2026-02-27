import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: ['@mediapipe/hands', '@mediapipe/camera_utils', '@mediapipe/drawing_utils'],
  reactStrictMode: false, // Disable StrictMode to prevent double API calls in development

  // Empty turbopack config to silence Next.js 16 warning about webpack config without turbopack
  turbopack: {},

  // Webpack fallback config for .glb 3D model assets (used when building with --webpack)
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.module.rules.push({
        test: /\.glb$/,
        type: 'asset/resource',
      });
    }
    return config;
  },

  // Add headers to prevent RSC caching issues
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, must-revalidate',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
