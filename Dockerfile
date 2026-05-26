# syntax=docker/dockerfile:1.7

# --- 1. install deps ---
FROM node:22-alpine AS deps
WORKDIR /app
# pnpm version comes from the packageManager field in package.json.
# pnpm 10+ enforces minimumReleaseAge=24h as supply-chain protection;
# keeping it on is intentional. Locally bump that pin to the latest
# pnpm 11.x periodically.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable
RUN pnpm install --frozen-lockfile

# --- 2. build ---
FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm gen:api
RUN pnpm build

# --- 3. runtime ---
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 8080
CMD ["node", "server.js"]
