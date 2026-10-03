# =============================================================
# Production Dockerfile - Hospital AI Automation Layer
# Multi-Stage, Minimalist & Hardened (Non-Root User)
# =============================================================

FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies if needed
RUN apk add --no-cache python3 make g++

# Copy dependency manifests
COPY package*.json ./

# Install all dependencies (including dev) for asset preparation/testing
RUN npm ci

# Copy source code
COPY . .

# Run test suite during build stage to guarantee zero defective builds
RUN node src/db/seed.js && node test/test_workflows.js

# -------------------------------------------------------------
# Runtime Production Image
# -------------------------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install only production dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy verified application files from builder
COPY --from=builder /app/src ./src
COPY --from=builder /app/public ./public
COPY --from=builder /app/integrations ./integrations

# Create data directory with proper non-root permissions
RUN mkdir -p /app/data && chown -R node:node /app

# Security: Run as unprivileged node user
USER node

# Healthcheck for orchestration (K8s / Docker Swarm / AWS ECS)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

EXPOSE 3000

CMD ["node", "src/server.js"]
