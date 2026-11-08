# syntax=docker/dockerfile:1

# --- deps: install with a clean, reproducible lockfile ---
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# --- build: compile the Next.js standalone output ---
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- runtime: minimal image running the standalone server ---
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# Next's standalone server listens on $HOSTNAME. Docker sets that to the
# container ID, which binds only the container's network address — Caddy can
# reach it but the localhost healthcheck can't, so it reads "unhealthy" and
# auto-update would roll every deploy back. Listen on all interfaces.
ENV HOSTNAME=0.0.0.0
ENV DATABASE_URL=file:/data/app.db
ENV UPLOAD_DIR=/data/uploads

# Standalone server + assets + migrations (needed by the boot-time migrator).
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/db/migrations ./db/migrations

# Data volume for the SQLite file and uploaded photos.
RUN mkdir -p /data/uploads && chown -R node:node /data /app
VOLUME /data
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+ (process.env.PORT||3000) +'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
