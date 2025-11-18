## ⭐ Giới thiệu
 Dự án này là một bản sao của 'Google Docs', được thiết kế để cung cấp trải nghiệm chỉnh sửa tài liệu cộng tác tương tự như Google Docs. Nó cho phép nhiều người dùng tạo, chỉnh sửa và cộng tác trên tài liệu theo thời gian thực.

## 🟢 Tính năng

- **Tạo và lưu trữ tài liệu:** Người dùng có thể tạo tài liệu mới và lưu trữ chúng an toàn trong cơ sở dữ liệu.
- **Chỉnh sửa tài liệu theo thời gian thực:** Nhiều người dùng có thể cộng tác và chỉnh sửa cùng một tài liệu đồng thời, với các thay đổi được phản ánh ngay lập tức cho tất cả các bên tham gia.
- **Đồng bộ hóa thời gian thực:** Các thay đổi được thực hiện bởi những người dùng khác nhau sẽ tự động được đồng bộ hóa trên tất cả các máy khách được kết nối, đảm bảo sự cộng tác liền mạch.
- **Chỉnh sửa văn bản phong phú:** Trình chỉnh sửa văn bản Quill cung cấp trải nghiệm chỉnh sửa phong phú, cho phép người dùng định dạng văn bản, thêm hình ảnh và nhiều hơn nữa.

## 🦾 Cải tiến

- [ ] Thêm auth (Đăng nhập / Đăng ký người dùng)
- [ ] Cài đặt kiến trúc Pub/Sub
- ... còn nữa


## ▶️ Bắt đầu

Để có một bản sao cục bộ và chạy, vui lòng làm theo các bước đơn giản sau.

### 🟡 Yêu cầu

Những gì bạn cần để có thể chạy ứng dụng cục bộ:

- Node.js (Phiên bản: >=18.x)
- MongoDB
- npm 

## 💻 Phát triển

## 🐋 Cài đặt (với Docker):

1. Thiết lập các biến môi trường:
   Thêm các biến môi trường:
   - Trong folder `/server`, thêm file `.env`:

   ```.env
   DATABASE_URL="mongodb://mongo-container:27017" 
   CLIENT_ORIGIN="http://localhost:5173"
   ```

   - Trong folder `/client`, thêm file `.env`:
   ```.env
   VITE_SERVER_URL="http://localhost:3000"
   ``` 
     

2. Chạy lệnh sau trong folder gốc: 
    ```sh
    docker-compose up
    ```

Bây giờ ứng dụng sẽ chạy trên http://localhost:5173


### 🟢 Cài đặt (không dùng Docker):

1. Clone repo

   ```sh
   git clone https://github.com/lephantriduc/collaborative-docs
   ```

   - Hoặc nếu bạn sử dụng SSH:
   ```sh
   git clone git@github.com:lephantriduc/collaborative-docs.git
   ```

2. Config server 

   - Trong folder `/server`, thêm file `.env`:
   ```.env
   DATABASE_URL="mongodb://localhost:27017"
   CLIENT_ORIGIN="http://localhost:5173"
   ```

   - Và sau đó chạy:

   ```sh
   npm install
   npm run dev
   ```

Bây giờ máy chủ backend sẽ chạy trên http://localhost:3000

3. Config client

   - Trong folder `/client`, thêm file `.env`:
   ```.env
   VITE_SERVER_URL="http://localhost:3000"
   ``` 

   - Và sau đó chạy:

   ```sh
   npm install
   npm run dev
   ```
Ứng dụng React sẽ chạy trên http://localhost:5173

## 🔧 Công nghệ sử dụng

- **Frontend:**
  - React.js
  - Quill
  - shadcn/ui

- **Backend:**
  - Node.js
  - Socket.io

- **DB:**
  - MongoDB

- **Khác:**
  - TypeScript
  - Docker


## ▶️ Demo

https://github.com/KshitijTodkar48/Google-Docs-Clone/assets/120639775/a7dc1200-3617-4214-b065-339a55eaad59
