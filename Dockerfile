FROM node:20-alpine AS base

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
RUN npm run build

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

USER nextjs
EXPOSE 4000
ENV PORT=4000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
