# Image unique : API REST + Socket.IO + front Next.js dans un seul processus Node.
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/server/prisma apps/server/prisma
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000
COPY --from=build /app /app
RUN mkdir -p /app/apps/server/uploads && chown -R node:node /app/apps/server/uploads
USER node
WORKDIR /app/apps/server
EXPOSE 3000
# Applique les migrations puis démarre
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
