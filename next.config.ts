import type { NextConfig } from "next";
// `webpack` is NOT a direct dependency of this project - Next.js ships its own copy at
// next/dist/compiled/webpack and aliases the bare specifier when loading this config, so
// the top-level `import webpack from "webpack"` worked at runtime but had no types.
// The webpack instance is instead taken from the config callback context below, which is
// the documented Next.js API and the very same instance.

const nextConfig: NextConfig = {
  // Standalone output: emits .next/standalone with a self-contained server.js —
  // lets the Docker image ship without node_modules (~250MB instead of ~2GB).
  output: 'standalone',
  // Type-checking during `next build` was measured at ~117s of a ~150s build
  // (see .next/trace-build) — the dominant cost. Skipped here for build speed;
  // run `npx tsc --noEmit` separately (e.g. in CI or pre-commit) to still catch
  // type errors, since they will no longer fail this build.
  typescript: {
    ignoreBuildErrors: true,
  },
  allowedDevOrigins: ['abi.0sms.com', '*.0sms.com','10.10.9.149'],
  serverExternalPackages: [
    '@mediapipe/hands', '@mediapipe/face_detection', '@mediapipe/face_mesh',
    '@mediapipe/camera_utils', '@mediapipe/drawing_utils',
  ],
  reactStrictMode: false,
  turbopack: {
    /* Pin the workspace root. A stray package-lock.json sits in the user's HOME
       directory, so Next inferred HOME as the workspace root and watched that
       tree rather than this one. The practical symptom: edits to
       app/globals.css stopped invalidating Turbopack's cache, and the dev
       server kept serving a stale compile of it even across full restarts.
       process.cwd() is the project directory because `next dev` is launched
       from this package's own script. */
    root: process.cwd(),
  },

  experimental: {
    agentUpgrade: 'security',
    /* Fewer, larger JS files per route. A hard refresh of a dashboard page
       requested ~30 entry chunks (default cap 40 per chunk group); every request
       costs a round trip to the origin, while most of these chunks are a few KB. */
    turbopackChunking: {
      maxChunkCountPerGroup: 15,
      minChunkSize: 150000,
      requestCost: 400000,
      priorityRoutes: [/^\/dashboard/, /^\/recruitment\//],
    },
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

  webpack(config, { isServer, webpack }) {
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
      /* Production only: in dev, Next.js warns that a custom Cache-Control
         header on /_next/static/:path* "can break Next.js development
         behavior" — and it does. Dev-mode static chunks aren't content-hashed
         the same immutable way production's are, so a browser honoring this
         1-year immutable cache keeps serving a stale bundle after every edit,
         through plain refreshes and even across different browsers that have
         hit the page before. Confirmed the hard way: none of several rounds
         of component/CSS fixes were visibly taking effect until this was
         scoped to production. */
      ...(process.env.NODE_ENV === 'production' ? [{
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      }] : []),
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
      // TalkingHead library (talkinghead.mjs ~2 MB, dynamicbones, lipsync-*,
      // playback-worklet.js). Unlike /models and /ort these filenames are NOT
      // content-hashed — the files are edited in place and ship with a deploy —
      // so no 1-year immutable: a day of fresh caching, then serve-stale while
      // revalidating (one background ETag check), so a deploy is picked up on
      // the next load after expiry instead of being pinned for a year.
      {
        source: '/talkinghead/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=86400' },
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
          // "full application" #12. The CSP is limited to directives that can't
          // break the app (no script-src: inline scripts, WASM models, avatar
          // and proctoring libraries; no object-src: blob-URL PDF previews use
          // the browser's PDF plugin); it blocks framing by other sites and
          // <base> hijacking.
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'; base-uri 'self'" },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          ...(process.env.NODE_ENV === 'production'
            ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
