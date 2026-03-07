import type { NextConfig } from "next";
import webpack from "webpack";

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

  webpack(config, { isServer }) {
    // Allow .mjs ESM files from node_modules (TalkingHead uses ESM modules)
    config.module.rules.push({
      test: /\.mjs$/,
      include: /node_modules/,
      type: 'javascript/auto',
    });

    // face-api.js references the Node.js built-in 'fs' — stub it out in the browser bundle.
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
      };
    }

    // node-fetch optionally requires 'encoding' (an npm package, not a Node core module).
    // resolve.fallback doesn't cover npm packages, so use IgnorePlugin instead.
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^encoding$/,
        contextRegExp: /node-fetch/,
      })
    );

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
