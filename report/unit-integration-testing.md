# Báo cáo: Unit Test & Integration Test

## 1. Tổng quan
Để đảm bảo chất lượng mã nguồn và tính ổn định của hệ thống, chúng tôi đã triển khai Unit Test và Integration Test cho phần Backend (Server). Các bài kiểm thử được viết bằng **Jest** và **Supertest**.

## 2. Công nghệ sử dụng
- **Jest**: Framework kiểm thử chính, hỗ trợ chạy test, assertion và mocking.
- **ts-jest**: Preprocessor để chạy TypeScript với Jest.
- **Supertest**: Thư viện để kiểm thử HTTP requests cho Integration Test.

## 3. Cấu trúc thư mục
Các file test được đặt trong thư mục `unit_test/` ở root của dự án, tách biệt với mã nguồn chính nhưng vẫn truy cập được vào các module của server.

```
unit_test/
├── documentController.test.ts  # Unit tests cho Document Controller
├── documentRoutes.test.ts      # Integration tests cho API Routes
├── jest.config.js              # Cấu hình Jest
└── tsconfig.json               # Cấu hình TypeScript cho môi trường test
```

## 4. Phạm vi kiểm thử

### 4.1. Unit Tests (`documentController.test.ts`)
Tập trung kiểm thử các hàm xử lý logic nghiệp vụ quan trọng trong `documentController`.

- **findOrCreateDocument**:
  - Kiểm tra logic lấy document từ Cache (Redis).
  - Kiểm tra logic lấy từ Database (MongoDB) khi Cache miss.
  - Kiểm tra logic tạo mới document khi chưa tồn tại.
  - Đảm bảo quyền truy cập (permissions) được kiểm tra chính xác.
- **getAllDocuments**:
  - Kiểm tra việc lấy danh sách document.
  - Kiểm tra logic map role của user (owner/viewer) vào kết quả trả về.
- **updateDocument**:
  - Kiểm tra quyền chỉnh sửa trước khi update.
  - Đảm bảo dữ liệu được cập nhật vào DB và Cache.

### 4.2. Integration Tests (`documentRoutes.test.ts`)
Kiểm thử các API endpoint thực tế, giả lập các request HTTP.

- **GET /api/documents**:
  - Kiểm tra response trả về danh sách document đúng định dạng.
  - Kiểm tra xử lý lỗi khi thiếu tham số (userId).
- **POST /api/documents/update-role**:
  - Kiểm tra luồng cập nhật quyền cho user.
  - Đảm bảo validation các trường input.
- **DELETE /api/documents/:documentId**:
  - Kiểm tra luồng xóa document.

## 5. Kết quả
Hiện tại, tất cả các test case đều đã pass (11/11 tests).

```bash
PASS  ../unit_test/documentRoutes.test.ts
PASS  ../unit_test/documentController.test.ts
```

## 6. Hướng dẫn chạy test

Để chạy bộ kiểm thử, thực hiện lệnh sau từ thư mục `server`:

```bash
cd server
npx jest --config ../unit_test/jest.config.js
```
