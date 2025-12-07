# 📝 Collaborative Docs

Ứng dụng chỉnh sửa tài liệu cộng tác theo thời gian thực, tương tự Google Docs.

🌐 **Live Demo:** [https://colnote.iselab.info](https://colnote.iselab.info)

## ⭐ Giới thiệu

Dự án cho phép nhiều người dùng cùng tạo, chỉnh sửa và cộng tác trên tài liệu theo thời gian thực. Các thay đổi được đồng bộ ngay lập tức giữa tất cả người tham gia.

## 🟢 Tính năng

| Tính năng | Mô tả |
|-----------|-------|
| 📄 **Quản lý tài liệu** | Tạo, lưu trữ và quản lý tài liệu |
| ✏️ **Chỉnh sửa thời gian thực** | Nhiều người cùng chỉnh sửa, thay đổi hiển thị ngay lập tức |
| 🔄 **Đồng bộ hóa** | Tự động đồng bộ qua Socket.IO + Redis Pub/Sub |
| 🎨 **Rich Text Editor** | Quill editor với định dạng văn bản phong phú |
| 🔐 **Xác thực người dùng** | Đăng nhập/Đăng ký |
| 🌙 **Dark Mode** | Chuyển đổi giao diện Sáng/Tối/Theo hệ thống |
| 📥 **Xuất tài liệu** | Tải tài liệu về dạng PDF hoặc Word (.docx) |

## 🏗️ Kiến trúc hệ thống

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│   Nginx     │────▶│   Server    │
│  (React)    │◀────│  (Reverse   │◀────│  (Node.js)  │
│  Port 80    │     │   Proxy)    │     │  Port 3000  │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                         ┌─────────────────────┼─────────────────────┐
                         │                     │                     │
                         ▼                     ▼                     ▼
                  ┌─────────────┐       ┌─────────────┐       ┌─────────────┐
                  │   MongoDB   │       │    Redis    │       │   Redis     │
                  │  (Storage)  │       │   (Cache)   │       │  (Pub/Sub)  │
                  └─────────────┘       └─────────────┘       └─────────────┘
```

## 🔧 Công nghệ sử dụng

| Layer | Công nghệ |
|-------|-----------|
| **Frontend** | React.js, TypeScript, Quill, TailwindCSS, shadcn/ui |
| **Backend** | Node.js, Express, Socket.IO, TypeScript |
| **Database** | MongoDB |
| **Cache/Pub-Sub** | Redis |
| **DevOps** | Docker, Docker Compose, Nginx, Certbot (SSL) |

## 🚀 Cài đặt

### Yêu cầu
- Docker & Docker Compose
- (Tùy chọn) Node.js >= 20.x để phát triển local

### Bước 1: Clone repo

```bash
git clone https://github.com/lephantriduc/collaborative-docs
cd collaborative-docs
```

### Bước 2: Cấu hình môi trường

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

### Bước 3: Chạy ứng dụng

```bash
# Development
docker compose up -d --build

# Xem logs
docker compose logs -f
```

Truy cập: http://localhost:12354

### Production (với HTTPS)

Cập nhật `.env` files:

**Server** (`/server/.env`):
```env
CLIENT_ORIGIN=https://your-domain.com
```

**Client** (`/client/.env`):
```env
VITE_SERVER_URL=https://your-domain.com
```


## 📊 Load Testing

Xem hướng dẫn chi tiết tại [`/load-testing/README.md`](./load-testing/README.md)

```bash
cd load-testing
npm install

# Quick smoke test
npm run test:smoke

# Full baseline test
npm run test:baseline
```

## 🐳 Docker Commands

```bash
# Build và chạy
docker compose up -d --build

# Rebuild hoàn toàn (xóa cache, volumes)
sudo docker compose down --rmi all --volumes --remove-orphans && sudo docker compose up -d --build --force-recreate

# Xem logs
docker compose logs -f server
docker compose logs -f client

# Restart service
docker compose restart server
```

## 📁 Cấu trúc thư mục

```
collaborative-docs/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # UI components
│   │   ├── lib/            # Utilities
│   │   └── socket.ts       # Socket.IO client
│   └── Dockerfile
├── server/                 # Node.js backend
│   ├── src/
│   │   ├── config/         # Database & Redis config
│   │   ├── controllers/    # Request handlers
│   │   ├── models/         # MongoDB models
│   │   ├── routes/         # API routes
│   │   └── sockets/        # Socket.IO handlers
│   └── Dockerfile
├── load-testing/           # Artillery load tests
│   └── scenarios/
├── docker-compose.yml
└── README.md
```

## 📄 License

MIT License