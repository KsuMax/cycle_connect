# syntax=docker/dockerfile:1
FROM node:24-alpine AS base

# Установка зависимостей
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Сборка
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Next.js needs env during the build. Mount it without adding it to an image
# layer, then remove any env copies made by standalone output tracing.
RUN --mount=type=secret,id=app_env,target=/app/.env.production,required=true \
    NODE_OPTIONS=--max-old-space-size=1536 npm run build && npm run build:ops && rm -f .next/standalone/.env*

# Продакшн образ
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# nodemailer is an external package used in /api/email-send.
# Next.js standalone output doesn't auto-copy native/non-tree-shaken packages,
# so we copy it explicitly here as a safety net alongside outputFileTracingIncludes.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/nodemailer ./node_modules/nodemailer

USER nextjs
EXPOSE 4000
ENV PORT=4000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
