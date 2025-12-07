# MongoDB Indexing Optimization Report

## Tổng quan

Báo cáo này mô tả việc tối ưu hóa truy vấn MongoDB thông qua việc đánh index cho các trường thường xuyên được query.

## Vấn đề

Khi số lượng tài liệu tăng lên hàng nghìn, các truy vấn sau sẽ rất chậm nếu quét toàn bộ collection (collection scan):

- `Document.find({ ownerId: userId })` - Tìm documents của một user
- `Document.find()` với sort - Lấy tất cả documents và sắp xếp
- `Document.find({ name: /keyword/ })` - Tìm kiếm theo tên

## Giải pháp

### 1. Indexes được thêm vào Document Schema

```typescript
const documentSchema = new mongoose.Schema({
    _id: String,
    name: {
        type: String,
        index: true  // Index cho tìm kiếm theo tên
    },
    data: Object,
    ownerId: {
        type: String,
        required: true,
        index: true  // Index cho tìm kiếm theo owner
    },
    permissions: {
        type: Map,
        of: String,
        default: new Map()
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true  // Index cho sắp xếp theo ngày tạo
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Compound index cho query phổ biến: tìm documents theo owner, sắp xếp theo ngày
documentSchema.index({ ownerId: 1, createdAt: -1 });

// Text index cho full-text search
documentSchema.index({ name: 'text' });
```

### 2. Các loại Index được sử dụng

| Index | Trường | Mục đích |
|-------|--------|----------|
| **Single Field Index** | `ownerId` | Tìm nhanh documents của một user |
| **Single Field Index** | `name` | Tìm nhanh documents theo tên |
| **Single Field Index** | `createdAt` | Sắp xếp nhanh theo ngày tạo |
| **Compound Index** | `{ ownerId: 1, createdAt: -1 }` | Query kết hợp: tìm theo owner + sort theo ngày |
| **Text Index** | `name` | Full-text search trên tên document |

### 3. Query Patterns được tối ưu

#### A. Lấy tất cả documents (sorted)
```typescript
// Trước: Collection scan + in-memory sort
const documents = await Document.find();
documents.reverse();

// Sau: Sử dụng index + lean() cho performance
const documents = await Document.find()
    .sort({ createdAt: -1 })
    .lean()
    .exec();
```

#### B. Tìm documents theo owner
```typescript
// Sử dụng compound index (ownerId, createdAt)
const documents = await Document.find({ ownerId })
    .sort({ createdAt: -1 })
    .lean()
    .exec();
```

#### C. Full-text search
```typescript
// Sử dụng text index
const documents = await Document.find(
    { $text: { $search: searchQuery } },
    { score: { $meta: "textScore" } }
)
.sort({ score: { $meta: "textScore" } })
.lean()
.exec();
```

### 4. API Endpoints mới

| Endpoint | Method | Mô tả |
|----------|--------|-------|
| `/api/documents/search?userId=X&q=keyword` | GET | Tìm kiếm documents theo tên |
| `/api/documents/my-documents?userId=X` | GET | Lấy documents của user (owner) |

## Hiệu năng dự kiến

### Trước khi có Index
- **Collection Scan**: O(n) - Quét toàn bộ collection
- **In-memory Sort**: Tốn RAM và chậm với data lớn

### Sau khi có Index
- **Index Scan**: O(log n) - Sử dụng B-tree index
- **Covered Query**: Không cần đọc documents từ disk trong một số trường hợp

### So sánh thời gian truy vấn (ước tính)

| Số lượng documents | Trước (ms) | Sau (ms) | Cải thiện |
|-------------------|------------|----------|-----------|
| 100 | ~10 | ~5 | 2x |
| 1,000 | ~100 | ~10 | 10x |
| 10,000 | ~1,000 | ~20 | 50x |
| 100,000 | ~10,000 | ~50 | 200x |

## Kiểm tra Index

Để kiểm tra các indexes đã được tạo, sử dụng MongoDB shell:

```javascript
// Kết nối vào MongoDB container
docker exec -it <mongodb-container> mongosh

// Chọn database
use mydb

// Xem tất cả indexes của collection documents
db.documents.getIndexes()

// Explain query để kiểm tra index được sử dụng
db.documents.find({ ownerId: "user-001" }).explain("executionStats")
```

## Các files đã thay đổi

1. **`server/src/models/documentModel.ts`**
   - Thêm indexes cho `ownerId`, `name`, `createdAt`
   - Thêm compound index `{ ownerId: 1, createdAt: -1 }`
   - Thêm text index cho `name`
   - Thêm trường `createdAt` và `updatedAt`

2. **`server/src/controllers/documentController.ts`**
   - Thêm function `searchDocuments()` - Full-text search
   - Thêm function `getDocumentsByOwner()` - Query theo owner
   - Tối ưu `getAllDocuments()` với `.lean()` và `.sort()`

3. **`server/src/routes/documents.routes.ts`**
   - Thêm endpoint `GET /api/documents/search`
   - Thêm endpoint `GET /api/documents/my-documents`

4. **`client/src/components/Topbar.tsx`**
   - Thêm search functionality với callback

5. **`client/src/components/LandingPage.tsx`**
   - Tích hợp search với debounce (300ms)
   - Gọi API search endpoint

## Lưu ý khi triển khai

1. **Rebuild indexes**: Khi deploy lên production, MongoDB sẽ tự động tạo indexes dựa trên schema definition. Với data hiện có, nên sử dụng background index creation.

2. **Text Index limitation**: Mỗi collection chỉ có thể có 1 text index. Nếu cần search nhiều trường, cần kết hợp chúng trong cùng 1 text index.

3. **Memory usage**: Indexes tốn RAM. Với mỗi 1 triệu documents, mỗi index có thể tốn ~50-100MB RAM.

## Kết luận

Việc đánh index giúp:
- Giảm thời gian query từ O(n) xuống O(log n)
- Hỗ trợ full-text search cho tính năng tìm kiếm
- Tối ưu các truy vấn thường xuyên như lấy documents theo owner
- Cải thiện trải nghiệm người dùng với thời gian phản hồi nhanh hơn
