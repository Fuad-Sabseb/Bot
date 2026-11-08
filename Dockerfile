# ==========================================
# STAGE 1: Build & Compilation
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy application sources and Prisma schema
COPY backend/ ./backend/
COPY public/ ./public/

# Generate Prisma client and compile TypeScript
RUN npm run prisma:generate
RUN npm run build

# ==========================================
# STAGE 2: Production Runtime
# ==========================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# Install runtime utilities
RUN apk add --no-cache curl postgresql-client

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy generated Prisma engine, compiled backend, public web assets
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/backend/prisma ./backend/prisma
COPY --from=builder /app/public ./public

# Create storage directories
RUN mkdir -p /app/storage/assignments/individual \
    && mkdir -p /app/storage/assignments/group \
    && mkdir -p /app/storage/materials \
    && mkdir -p /app/storage/archive \
    && mkdir -p /app/storage/blog \
    && chown -R node:node /app

USER node

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:5000/health || exit 1

CMD ["node", "dist/server.js"]
