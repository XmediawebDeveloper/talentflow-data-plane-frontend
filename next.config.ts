import type { NextConfig } from "next";
import webpack from "webpack";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  allowedDevOrigins: ['abi.0sms.com', '*.0sms.com'],
  serverExternalPackages: [
    '@mediapipe/hands', '@mediapipe/face_detection', '@mediapipe/face_mesh',
    '@mediapipe/camera_utils', '@mediapipe/drawing_utils',
    'three', '@react-three/fiber', '@react-three/drei',
  ],
  reactStrictMode: false,
  turbopack: {},

  experimental: {
    // Optimize barrel file imports — avoids bundling entire libraries when only a few exports are used.
    // Critical for lucide-react (1000+ icons) and all @radix-ui packages.
    optimizePackageImports: [
      'lucide-react',
      'recharts',
      '@radix-ui/react-accordion',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-avatar',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-hover-card',
      '@radix-ui/react-label',
      '@radix-ui/react-menubar',
      '@radix-ui/react-navigation-menu',
      '@radix-ui/react-popover',
      '@radix-ui/react-progress',
      '@radix-ui/react-radio-group',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-select',
      '@radix-ui/react-separator',
      '@radix-ui/react-slider',
      '@radix-ui/react-slot',
      '@radix-ui/react-switch',
      '@radix-ui/react-tabs',
      '@radix-ui/react-toggle',
      '@radix-ui/react-tooltip',
    ],
  },

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
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      // Proctoring web workers must never be served stale. These files live in
      // public/, so Next gives them the default 4-hour max-age — meaning after a
      // deploy, candidates' browsers AND the Cloudflare edge keep running the
      // previous worker for up to 4 hours. That silently shipped a known-broken
      // object detector to live interviews.
      {
        source: '/workers/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, must-revalidate' },
        ],
      },
      // Model weights and the ONNX runtime are large (28 MB + 24 MB) and
      // content-stable — the filename changes when the contents do. Cache them
      // hard so a candidate downloads them once, not on every interview.
      // Without this they were served max-age=0 and revalidated every time.
      {
        source: '/models/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/ort/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/:path((?!_next/static|_next/image|favicon.ico|.*\\..*).*)',
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
      {
        source: '/:path*',
        headers: [
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
