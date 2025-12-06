# client/Dockerfile

# 1) Build stage
FROM node:20-alpine AS build
WORKDIR /app

# copy package files first để tận dụng layer cache
COPY package.json package-lock.json ./
RUN npm ci

# copy source & build
COPY . .
ENV NODE_ENV=production
RUN npm run build

# 2) Production stage: lightweight static server
FROM node:20-alpine AS production
# cài http-server toàn cục (nhẹ)
RUN npm install -g http-server

# tạo user không phải root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app
# copy artifact build từ stage trước
COPY --from=build /app/dist /app

# set quyền và user
RUN chown -R appuser:appgroup /app
USER appuser

# serve trên port 80 trong container
EXPOSE 80

# cmd: serve static trên port 80
CMD ["http-server", "/app", "-p", "80", "-c-1"]
