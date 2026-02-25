import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: ['@mediapipe/hands', '@mediapipe/camera_utils', '@mediapipe/drawing_utils'],
  reactStrictMode: false, // Disable StrictMode to prevent double API calls in development

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
          {
            key: 'Permissions-Policy',
            value: 'fullscreen=*',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
