# =============================================================================
# TalentFlow Data Plane Frontend — Next.js 16 (standalone output)
#
# NEXT_PUBLIC_* values are baked into the JS bundle AT BUILD TIME — they must
# arrive as --build-arg (CI passes them from GitLab CI/CD variables).
# Changing them requires a rebuild, not just a restart.
# =============================================================================

# Exact base tag (security sheet D2): every stage on the same pinned Node, so
# `--pull` can't silently change the runtime. Bump deliberately, all three.
# ---------- Stage 1: install dependencies ----------
FROM node:22.21.1-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------- Stage 2: build ----------
FROM node:22.21.1-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time public env (baked into client bundle)
ARG NEXT_PUBLIC_ENVIRONMENT
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_ADMIN_API_URL
ARG NEXT_PUBLIC_BILLING_API_URL
ARG NEXT_PUBLIC_USAGE_API_URL
ARG NEXT_PUBLIC_WS_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_BASE_DOMAIN
ARG NEXT_PUBLIC_RAZORPAY_BYPASS_ENABLED
ARG NEXT_PUBLIC_RAZORPAY_KEY_ID
ARG NEXT_PUBLIC_ENABLE_PROXY_INTEGRITY_VERIFICATION
ENV NEXT_PUBLIC_ENVIRONMENT=$NEXT_PUBLIC_ENVIRONMENT \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_ADMIN_API_URL=$NEXT_PUBLIC_ADMIN_API_URL \
    NEXT_PUBLIC_BILLING_API_URL=$NEXT_PUBLIC_BILLING_API_URL \
    NEXT_PUBLIC_USAGE_API_URL=$NEXT_PUBLIC_USAGE_API_URL \
    NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_BASE_DOMAIN=$NEXT_PUBLIC_BASE_DOMAIN \
    NEXT_PUBLIC_RAZORPAY_BYPASS_ENABLED=$NEXT_PUBLIC_RAZORPAY_BYPASS_ENABLED \
    NEXT_PUBLIC_RAZORPAY_KEY_ID=$NEXT_PUBLIC_RAZORPAY_KEY_ID \
    NEXT_PUBLIC_ENABLE_PROXY_INTEGRITY_VERIFICATION=$NEXT_PUBLIC_ENABLE_PROXY_INTEGRITY_VERIFICATION

# Same memory headroom as package.json's "build" script — the app is large
ENV NODE_OPTIONS=--max-old-space-size=8192 \
    NEXT_TELEMETRY_DISABLED=1
RUN npx next build

# ---------- Stage 3: runtime ----------
FROM node:22.21.1-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

# standalone build = server.js + minimal node_modules; static + public copied in
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

# 127.0.0.1 (not localhost): busybox wget resolves localhost to ::1 first,
# and the Next standalone server listens on IPv4 only
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD wget -qO /dev/null http://127.0.0.1:3000/ || exit 1

CMD ["node", "server.js"]
