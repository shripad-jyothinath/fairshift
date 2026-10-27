# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# ZK artifacts (~30 MB for depths 1–10) are fetched at image build, never committed.
RUN npm run setup:zk
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV HOSTNAME=0.0.0.0
ENV FAIRSHIFT_DATA_DIR=/tmp/fairshift

RUN addgroup -S fairshift && adduser -S fairshift -G fairshift

COPY --from=builder /app/.next/standalone ./

RUN mkdir -p /tmp/fairshift && chown -R fairshift:fairshift /tmp/fairshift
USER fairshift

EXPOSE 8080
CMD ["node", "server.js"]
