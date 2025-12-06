# server/Dockerfile

# 1) Install deps
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production=false

# 2) Build (nếu bạn có bước build như tsc / babel)
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# nếu có script build (ví dụ tsc), chạy nó; nếu không có, lệnh này không phá vỡ (yêu cầu script build tồn tại)
RUN if [ -f package.json ] && grep -q "\"build\":" package.json; then npm run build; fi

# 3) Production image
FROM node:20-alpine AS production
WORKDIR /app

# tạo user non-root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

ENV NODE_ENV=production
# mặc định BE lắng nghe PORT 3000 nếu không set
ENV PORT=3000

# copy với --chown để set ownership ngay lúc copy (tránh chown -R chậm)
COPY --chown=appuser:appgroup --from=builder /app ./
# nếu bạn muốn tiết kiệm dung lượng: xóa devDependencies nếu có
RUN npm prune --production || true

USER appuser

# container port (khuyến nghị 3000)
EXPOSE 3000

# CMD: nếu có script start sẽ chạy npm run start, nếu không, fallback sang npm run dev
# (shell form để hỗ trợ fallback đơn giản)
CMD sh -c 'if npm run | grep -q " start"; then npm run start; else npm run dev; fi'
