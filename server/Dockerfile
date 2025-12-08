# server/Dockerfile

# 1) Build stage - install all deps and build
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --production=false

COPY . .
RUN npm run build

# 2) Production dependencies stage
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# 3) Minimal production image
FROM node:20-alpine AS production
WORKDIR /app

# Install only essential Chromium packages
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    && rm -rf /var/cache/apk/* \
    && rm -rf /usr/share/man/* \
    && rm -rf /tmp/*

# Tell Puppeteer to use installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    NODE_ENV=production \
    PORT=3000

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy only production dependencies from deps stage
COPY --from=deps --chown=appuser:appgroup /app/node_modules ./node_modules

# Copy built files
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --chown=appuser:appgroup package.json ./

# Clean up node_modules aggressively
RUN find ./node_modules -type f -name "*.md" -delete && \
    find ./node_modules -type f -name "*.ts" -delete && \
    find ./node_modules -type f -name "*.map" -delete && \
    find ./node_modules -type d -name "__tests__" -exec rm -rf {} + 2>/dev/null || true && \
    find ./node_modules -type d -name "test" -exec rm -rf {} + 2>/dev/null || true && \
    find ./node_modules -type d -name "tests" -exec rm -rf {} + 2>/dev/null || true && \
    find ./node_modules -type d -name "*.ts" -exec rm -rf {} + 2>/dev/null || true && \
    find ./node_modules -type d -name "docs" -exec rm -rf {} + 2>/dev/null || true && \
    find ./node_modules -type d -name "example" -exec rm -rf {} + 2>/dev/null || true && \
    find ./node_modules -type d -name "examples" -exec rm -rf {} + 2>/dev/null || true && \
    find ./node_modules -type f -name "*.spec.js" -delete && \
    find ./node_modules -type f -name "*.test.js" -delete && \
    find ./node_modules -type f -name "LICENSE*" -delete && \
    find ./node_modules -type f -name "CHANGELOG*" -delete && \
    rm -rf ./node_modules/.cache

USER appuser

EXPOSE 3000

CMD ["node", "dist/index.js"]
