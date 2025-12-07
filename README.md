# 📝 Collaborative Docs

Ứng dụng chỉnh sửa tài liệu cộng tác theo thời gian thực, tương tự Google Docs.

🌐 **Live Demo:** [https://colnote.iselab.info](https://colnote.iselab.info)

## Mục lục

1. [Giới thiệu](#-giới-thiệu)
2. [Tính năng](#-tính-năng)
3. [Kiến trúc hệ thống](#️-kiến-trúc-hệ-thống)
4. [Công nghệ sử dụng](#-công-nghệ-sử-dụng)
5. [Hướng dẫn cài đặt](#-hướng-dẫn-cài-đặt)
6. [Các tối ưu hóa](#-các-tối-ưu-hóa)
7. [Testing](#-testing)

---

## ⭐ Giới thiệu

**Collaborative Docs** là một ứng dụng web cho phép nhiều người dùng cùng tạo, chỉnh sửa và cộng tác trên tài liệu văn bản theo thời gian thực. Lấy cảm hứng từ Google Docs, dự án được xây dựng với mục tiêu:

- **Real-time collaboration**: Các thay đổi được đồng bộ ngay lập tức giữa tất cả người tham gia
- **High performance**: Tối ưu hóa để xử lý hàng nghìn người dùng đồng thời
- **Scalable architecture**: Hỗ trợ horizontal scaling với Redis Pub/Sub
- **Security-first**: Hệ thống phân quyền RBAC và rate limiting toàn diện

## 🟢 Tính năng

| Tính năng | Mô tả |
|-----------|-------|
| 📄 **Quản lý tài liệu** | Tạo, lưu trữ và quản lý tài liệu |
| ✏️ **Chỉnh sửa thời gian thực** | Nhiều người cùng chỉnh sửa, thay đổi hiển thị ngay lập tức |
| 🔄 **Đồng bộ hóa** | Tự động đồng bộ qua Socket.IO + Redis Pub/Sub |
| 🎨 **Rich Text Editor** | Quill editor với định dạng văn bản phong phú |
| 🔐 **Phân quyền RBAC** | Hệ thống Owner/Editor/Viewer với kiểm soát truy cập chi tiết |
| 🌙 **Dark Mode** | Chuyển đổi giao diện Sáng/Tối/Theo hệ thống |
| 📥 **Xuất tài liệu** | Tải tài liệu về dạng PDF hoặc Word (.docx) |
| 🛡️ **Rate Limiting** | Bảo vệ API và WebSocket khỏi spam/DDoS |

## 🏗️ Kiến trúc hệ thống

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              CLIENTS                                     │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐         │
│   │ Browser  │    │ Browser  │    │ Browser  │    │ Browser  │         │
│   │ (User A) │    │ (User B) │    │ (User C) │    │ (User D) │         │
│   └────┬─────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘         │
└────────┼───────────────┼───────────────┼───────────────┼────────────────┘
         │  HTTP/WS      │  HTTP/WS      │  HTTP/WS      │  HTTP/WS
         ▼               ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        LOAD BALANCER (Nginx)                             │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         ▼                        ▼                        ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Server 1      │    │   Server 2      │    │   Server 3      │
│   (Node.js)     │    │   (Node.js)     │    │   (Node.js)     │
│ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│ │Rate Limiter │ │    │ │Rate Limiter │ │    │ │Rate Limiter │ │
│ │Socket.IO    │ │    │ │Socket.IO    │ │    │ │Socket.IO    │ │
│ │Batching     │ │    │ │Batching     │ │    │ │Batching     │ │
│ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │
└────────┬────────┘    └────────┬────────┘    └────────┬────────┘
         └──────────────────────┼──────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              REDIS                                       │
│  ┌────────────┐       ┌────────────┐       ┌────────────┐               │
│  │  Pub/Sub   │       │   Cache    │       │ Rate Limit │               │
│  │  Channels  │       │  (doc:*)   │       │  Counters  │               │
│  └────────────┘       └────────────┘       └────────────┘               │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            MONGODB                                       │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ documents collection (với indexes: ownerId, name, createdAt)       │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

## 🔧 Công nghệ sử dụng

| Layer | Công nghệ |
|-------|-----------|
| **Frontend** | React.js, TypeScript, Quill, TailwindCSS, shadcn/ui |
| **Backend** | Node.js, Express, Socket.IO, TypeScript |
| **Database** | MongoDB (với indexing optimization) |
| **Cache/Pub-Sub** | Redis |
| **DevOps** | Docker, Docker Compose, Nginx, Certbot (SSL) |
| **Testing** | Jest, Supertest, Artillery |

---

## 🚀 Hướng dẫn cài đặt

### Yêu cầu hệ thống

- Docker & Docker Compose
- (Tùy chọn) Node.js >= 20.x để phát triển local

### Bước 1: Clone repo

```bash
git clone https://github.com/lephantriduc/collaborative-docs
cd collaborative-docs
```

### Bước 2: Cấu hình môi trường cho domain `colnote.iselab.info`

**Server** (`/server/.env`):
```env
DATABASE_URL=mongodb://mongo:27017/mydb
REDIS_HOST=redis
REDIS_PORT=6379
PORT=3000
CLIENT_ORIGIN=https://colnote.iselab.info
```

**Client** (`/client/.env`):
```env
VITE_SERVER_URL=https://colnote.iselab.info
```

### Bước 3: Build và chạy ứng dụng

```bash
# Build và chạy với Docker Compose
docker compose up -d --build

# Xem logs
docker compose logs -f
```

### Bước 4: Rebuild hoàn toàn (nếu cần)

```bash
# Xóa tất cả containers, images, volumes và rebuild
sudo docker compose down --rmi all --volumes --remove-orphans
sudo docker compose up -d --build --force-recreate
```

### Các lệnh Docker hữu ích

```bash
# Xem logs của từng service
docker compose logs -f server
docker compose logs -f client

# Restart một service
docker compose restart server

# Kiểm tra trạng thái containers
docker compose ps
```

Truy cập ứng dụng: **https://colnote.iselab.info**

---

## ⚡ Các tối ưu hóa

Dự án đã triển khai nhiều kỹ thuật tối ưu hóa để đảm bảo hiệu suất và khả năng mở rộng. Chi tiết từng tối ưu có trong thư mục [`/report`](./report/).

### 1. WebSocket Batching (Giảm 94% database writes)

**Vấn đề:** Mỗi keystroke khi người dùng gõ văn bản tạo ra một write operation vào MongoDB (500+ writes/phút/user).

**Giải pháp:** Buffer các thay đổi và ghi theo batch sau mỗi 2 giây.

```
User typing → Buffer → Buffer → Buffer → [2s] → MongoDB write (1 lần)
```

| Metric | Trước | Sau | Cải thiện |
|--------|-------|-----|-----------|
| DB Writes/phút (1 user) | ~500 | ~30 | **94%** |

📄 Chi tiết: [`report/websocket-batching-optimization.md`](./report/websocket-batching-optimization.md)

---

### 2. Redis Document Cache (Giảm 90% latency)

**Vấn đề:** Mỗi request đọc document đều query trực tiếp vào MongoDB.

**Giải pháp:** Cache document trong Redis với TTL 5 phút, tự động invalidate khi có thay đổi.

| Metric | Trước | Sau | Cải thiện |
|--------|-------|-----|-----------|
| Document Load | ~50ms | ~5ms | **90%** |
| API Response | ~50ms | ~10ms | **80%** |

📄 Chi tiết: [`report/rate-limit-redis-cache.md`](./report/rate-limit-redis-cache.md)

---

### 3. MongoDB Indexing (Tăng 10-200x tốc độ query)

**Vấn đề:** Các truy vấn chậm khi số lượng documents tăng lên hàng nghìn (collection scan).

**Giải pháp:** Đánh index cho các trường thường xuyên được query.

| Index | Trường | Mục đích |
|-------|--------|----------|
| Single Field | `ownerId` | Tìm documents của user |
| Single Field | `name` | Tìm kiếm theo tên |
| Single Field | `createdAt` | Sắp xếp theo ngày |
| Compound | `{ ownerId, createdAt }` | Query kết hợp |
| Text Index | `name` | Full-text search |

| Metric | Trước | Sau | Cải thiện |
|--------|-------|-----|-----------|
| Query 10k docs | ~1000ms | ~20ms | **50x** |

📄 Chi tiết: [`report/mongodb-indexing-optimization.md`](./report/mongodb-indexing-optimization.md)

---

### 4. Rate Limiting (Bảo vệ API & WebSocket)

**Vấn đề:** Hệ thống dễ bị tấn công DDoS, brute force, spam.

**Giải pháp:** Multi-layer rate limiting với Redis store.

| Layer | Giới hạn | Mục đích |
|-------|----------|----------|
| General API | 100 req/phút | Bảo vệ tất cả endpoints |
| Auth API | 20 req/phút | Ngăn brute force login |
| Document API | 50 req/phút | Bảo vệ document operations |
| WebSocket Connection | 10 conn/phút | Ngăn connection flood |
| WebSocket Events | 50 events/giây | Ngăn event flood |

📄 Chi tiết: [`report/rate-limit-redis-cache.md`](./report/rate-limit-redis-cache.md)

---

### 5. Redis Pub/Sub (Horizontal Scaling)

**Vấn đề:** Với single server, không thể scale horizontal. Users kết nối vào server khác nhau không nhận được updates của nhau.

**Giải pháp:** Sử dụng Redis Pub/Sub làm message broker để đồng bộ events giữa các server instances.

| Metric | Single Server | Multi-Server |
|--------|---------------|--------------|
| Max concurrent users | ~1,000 | ~10,000+ |
| Horizontal scaling | ❌ | ✅ |
| High availability | ❌ | ✅ |

📄 Chi tiết: [`report/redis-pubsub-scalability.md`](./report/redis-pubsub-scalability.md)

---

### 6. Permission System - RBAC (Role-Based Access Control)

**Vấn đề:** Cần kiểm soát quyền truy cập tài liệu chi tiết theo từng user.

**Giải pháp:** Hệ thống phân quyền 3 cấp với kiểm tra ở cả HTTP và WebSocket layer.

| Role | Xem | Sửa | Xóa | Chia sẻ |
|------|-----|-----|-----|---------|
| **OWNER** | ✅ | ✅ | ✅ | ✅ |
| **EDITOR** | ✅ | ✅ | ❌ | ❌ |
| **VIEWER** | ✅ | ❌ | ❌ | ❌ |

📄 Chi tiết: [`report/permission-system-rbac.md`](./report/permission-system-rbac.md)

---

### Tổng kết hiệu suất

| Optimization | Vấn đề | Giải pháp | Cải thiện |
|--------------|--------|-----------|-----------|
| **WebSocket Batching** | Quá nhiều DB writes | Buffer + batch writes | **94%** giảm writes |
| **Redis Cache** | Database load cao | Cache documents | **90%** giảm latency |
| **MongoDB Indexing** | Slow queries | Đánh index | **10-200x** faster |
| **Rate Limiting** | DDoS/Spam | Multi-layer limits | Bảo vệ endpoints |
| **Redis Pub/Sub** | Single server limit | Message broker | Horizontal scaling |
| **RBAC Permission** | Unauthorized access | Role-based control | Granular permissions |

---

## 🧪 Testing

### Unit & Integration Tests

Dự án bao gồm Unit Test và Integration Test cho Backend với Jest.

```bash
# Di chuyển vào thư mục server
cd server

# Cài đặt dependencies
npm install

# Chạy tests
npx jest --config ../unit_test/jest.config.js
```

| Test Type | Số lượng | Coverage |
|-----------|----------|----------|
| Unit Tests | 11 cases | Controllers |
| Integration Tests | ✅ | API Routes |

📄 Chi tiết: [`report/unit-integration-testing.md`](./report/unit-integration-testing.md)

### Load Testing (Artillery)

```bash
cd load-testing
npm install

# Quick smoke test (1 phút)
npm run test:smoke

# Full baseline test
npm run test:baseline
```

📄 Chi tiết: [`load-testing/README.md`](./load-testing/README.md)

---

## 📁 Cấu trúc thư mục

```
collaborative-docs/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # UI components (TextEditor, RoleManagement, ...)
│   │   ├── context/        # ThemeContext
│   │   ├── lib/            # Utilities
│   │   └── socket.ts       # Socket.IO client
│   └── Dockerfile
├── server/                 # Node.js backend
│   ├── src/
│   │   ├── config/         # Database, Redis, Cache config
│   │   ├── controllers/    # Request handlers
│   │   ├── middleware/     # Rate limiter, Permissions
│   │   ├── models/         # MongoDB models
│   │   ├── routes/         # API routes
│   │   └── sockets/        # WebSocket handlers (batching)
│   └── Dockerfile
├── unit_test/              # Jest tests
├── load-testing/           # Artillery load tests
├── report/                 # Báo cáo tối ưu hóa chi tiết
│   ├── 00-optimization-summary.md
│   ├── websocket-batching-optimization.md
│   ├── rate-limit-redis-cache.md
│   ├── mongodb-indexing-optimization.md
│   ├── redis-pubsub-scalability.md
│   ├── permission-system-rbac.md
│   └── ...
├── docker-compose.yml
└── README.md
```

---

## 📄 License

MIT License