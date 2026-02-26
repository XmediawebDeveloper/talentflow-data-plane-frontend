import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: [
    '@mediapipe/hands', '@mediapipe/face_detection', '@mediapipe/face_mesh',
    '@mediapipe/camera_utils', '@mediapipe/drawing_utils',
    'three', '@react-three/fiber', '@react-three/drei',
  ],
  reactStrictMode: false,

  webpack(config) {
    // Allow .mjs ESM files from node_modules (TalkingHead uses ESM modules)
    config.module.rules.push({
      test: /\.mjs$/,
      include: /node_modules/,
      type: 'javascript/auto',
    });
    return config;
  },

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
