# --- Dependances -----------------------------------------------------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- Build -------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Variables presentes au build (Next les inline si utilisees cote client).
# Les vraies valeurs runtime sont injectees via docker-compose / .env.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- Image finale (runtime) --------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Utilisateur non-root
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Dossier de stockage des conversations (sera monte en volume Docker).
# Cree ici pour avoir les bonnes permissions des le depart.
RUN mkdir -p /data/conversations && chown -R nextjs:nodejs /data
ENV DATA_DIR=/data

# Sortie "standalone" : seulement ce qui est necessaire pour tourner,
# pas besoin de node_modules complet ni du code source.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
