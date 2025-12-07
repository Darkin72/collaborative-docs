# 📊 Báo cáo: WebSocket Batching Optimization

## Mục lục
1. [Tổng quan](#1-tổng-quan)
2. [Vấn đề](#2-vấn-đề)
3. [Giải pháp: Document Save Batching](#3-giải-pháp-document-save-batching)
4. [Implementation](#4-implementation)
5. [Flow Diagram](#5-flow-diagram)
6. [Kết quả đạt được](#6-kết-quả-đạt-được)
7. [Cấu hình & Tuning](#7-cấu-hình--tuning)

---

## 1. Tổng quan

### 1.1 Mục tiêu
- **Giảm tải MongoDB** bằng cách gom nhóm (batching) các lệnh lưu document
- **Tối ưu real-time collaboration** - giảm số lượng write operations
- **Cải thiện hiệu suất** khi nhiều người cùng chỉnh sửa document

### 1.2 File liên quan
| File | Mục đích |
|------|----------|
| `server/src/sockets/documentSocket.ts` | Xử lý batching logic |
| `server/src/controllers/documentController.ts` | Update document vào DB |
| `server/src/config/documentCache.ts` | Cập nhật cache |

---

## 2. Vấn đề

### 2.1 Tình huống ban đầu

Khi người dùng gõ văn bản trong real-time editor:
- **Mỗi keystroke** tạo ra một `save-document` event
- **Mỗi event** ghi trực tiếp vào MongoDB
- **Với 100 WPM** (words per minute) → ~500 characters/phút → ~500 writes/phút/user

```
User typing → save-document → MongoDB write
User typing → save-document → MongoDB write
User typing → save-document → MongoDB write
...
```

### 2.2 Hậu quả

| Vấn đề | Mô tả |
|--------|-------|
| **Database overload** | Quá nhiều write operations |
| **Latency cao** | Mỗi write phải đợi MongoDB response |
| **Cost tăng** | MongoDB Atlas tính tiền theo operations |
| **Lock contention** | Nhiều writes cùng document gây conflict |

---

## 3. Giải pháp: Document Save Batching

### 3.1 Ý tưởng

Thay vì ghi ngay lập tức, **buffer các changes** và ghi theo batch:

```
User typing → Buffer
User typing → Buffer
User typing → Buffer
           ↓
    [Sau 2 giây]
           ↓
    MongoDB write (1 lần duy nhất)
```

### 3.2 Cấu hình Batching

```typescript
// Batching configuration
const BATCH_INTERVAL = 2000; // 2 seconds

const documentBatches = new Map<string, {
  data: any;              // Document data hiện tại
  timer: NodeJS.Timeout | null;  // Timer để trigger save
  lastUpdate: number;     // Timestamp của update cuối
}>();
```

| Tham số | Giá trị | Mô tả |
|---------|---------|-------|
| `BATCH_INTERVAL` | 2000ms | Thời gian chờ trước khi ghi |
| `data` | Object | Dữ liệu document mới nhất |
| `timer` | Timeout | Timer để đếm ngược |
| `lastUpdate` | Timestamp | Thời điểm update cuối |

---

## 4. Implementation

### 4.1 Batching Logic

```typescript
socket.on("save-document", rateLimitEvent("save-document", async (data) => {
  // Kiểm tra quyền chỉnh sửa
  if (!document.canEdit) {
    socket.emit("permission-error", {
      error: "You do not have permission to edit this document"
    });
    return;
  }

  const now = Date.now();
  
  // Lấy hoặc tạo batch cho document này
  let batch = documentBatches.get(documentId);
  
  if (!batch) {
    batch = {
      data: null,
      timer: null,
      lastUpdate: now
    };
    documentBatches.set(documentId, batch);
  }

  // Cập nhật data (chỉ giữ bản mới nhất)
  batch.data = data;
  batch.lastUpdate = now;

  // Xóa timer cũ nếu có
  if (batch.timer) {
    clearTimeout(batch.timer);
  }

  // Tạo timer mới - ghi sau BATCH_INTERVAL
  batch.timer = setTimeout(async () => {
    const batchToSave = documentBatches.get(documentId);
    
    if (batchToSave && batchToSave.data) {
      try {
        await updateDocument(documentId, { data: batchToSave.data }, userId);
        console.log(`[BATCHING] Saved document ${documentId} (batched after ${BATCH_INTERVAL}ms)`);
      } catch (error: any) {
        console.error(`[BATCHING] Error saving document ${documentId}:`, error);
        socket.emit("save-error", {
          error: error.message || "Failed to save document"
        });
      }
    }
    
    // Cleanup batch
    documentBatches.delete(documentId);
  }, BATCH_INTERVAL);
}));
```

### 4.2 Flush on Disconnect

Khi user disconnect, **flush ngay lập tức** để không mất dữ liệu:

```typescript
socket.on("disconnecting", () => {
  for (const room of socket.rooms) {
    if (room !== socket.id) {
      console.log(`User ${displayUsername} unsubscribing from document ${room}`);
      
      // Thông báo user rời khỏi
      socket.to(room).emit("user-left", {
        userId,
        username: displayUsername,
      });
      
      // Flush pending batched writes
      const batch = documentBatches.get(room);
      if (batch && batch.timer) {
        clearTimeout(batch.timer);
        
        // Ghi ngay nếu có data pending
        if (batch.data) {
          updateDocument(room, { data: batch.data }, userId)
            .then(() => console.log(`[BATCHING] Flushed document ${room} on user disconnect`))
            .catch(err => console.error(`[BATCHING] Error flushing document ${room}:`, err));
        }
        
        documentBatches.delete(room);
      }
    }
  }
});
```

### 4.3 Tích hợp với Cache

Khi batch được lưu, cache cũng được update:

```typescript
// Trong documentController.ts
export const updateDocument = async(id: string, data: Object, userId: string) => {
  // ... permission checks ...
  
  const updatedDoc = await Document.findByIdAndUpdate(
    id,
    { ...data, updatedAt: new Date() },
    { new: true }
  );
  
  if (updatedDoc) {
    // Update cache với data mới
    await updateDocumentDataInCache(id, updatedDoc.data);
  }
  
  return updatedDoc;
}
```

---

## 5. Flow Diagram

### 5.1 Normal Save Flow (với Batching)

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Client    │    │   Server    │    │   MongoDB   │
└─────┬───────┘    └─────┬───────┘    └─────┬───────┘
      │                  │                  │
      │  save-document   │                  │
      │─────────────────>│                  │
      │                  │  Buffer data     │
      │                  │  Reset timer     │
      │                  │                  │
      │  save-document   │                  │
      │─────────────────>│                  │
      │                  │  Update buffer   │
      │                  │  Reset timer     │
      │                  │                  │
      │  save-document   │                  │
      │─────────────────>│                  │
      │                  │  Update buffer   │
      │                  │  Reset timer     │
      │                  │                  │
      │                  │  [2s timeout]    │
      │                  │                  │
      │                  │    updateDoc     │
      │                  │─────────────────>│
      │                  │                  │
      │                  │     success      │
      │                  │<─────────────────│
      │                  │                  │
```

### 5.2 Disconnect Flush Flow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Client    │    │   Server    │    │   MongoDB   │
└─────┬───────┘    └─────┬───────┘    └─────┬───────┘
      │                  │                  │
      │  disconnect      │                  │
      │─────────────────>│                  │
      │                  │                  │
      │                  │ Clear timer      │
      │                  │ Check buffer     │
      │                  │                  │
      │                  │ [If has data]    │
      │                  │    updateDoc     │
      │                  │─────────────────>│
      │                  │                  │
      │                  │     success      │
      │                  │<─────────────────│
      │                  │                  │
      │                  │ Cleanup batch    │
      │                  │                  │
```

---

## 6. Kết quả đạt được

### 6.1 Load Testing với Artillery

**Test Configuration:**
- Tool: Artillery v2.0.0
- Duration: 120 seconds
- Virtual Users: 600 concurrent users
- Scenario: Each user edits a document with random keystrokes

**Baseline Test (ENABLE_BATCHING = false):**
```
✅ 600/600 users completed
📊 31,800 socket events
💾 600 database writes (1 write per user completion)
⚡ p95 latency: 0.4ms
📈 Events/sec: 235
```

**Optimized Test (ENABLE_BATCHING = true):**
```
✅ 600/600 users completed
📊 31,800 socket events
💾 343 database writes (batched writes)
⚡ p95 latency: 0.4ms
📈 Events/sec: 277
```

**Results:**

| Metric | Baseline (No Batching) | Optimized (With Batching) | Improvement |
|--------|------------------------|---------------------------|-------------|
| Total Users | 600/600 ✅ | 600/600 ✅ | - |
| DB Writes | 600 | 343 | **-42.8%** ⬇️ |
| Latency (p95) | 0.4ms | 0.4ms | Same ✅ |
| Events/sec | 235 | 277 | +18% ⬆️ |

**Key Findings:**
- Batching reduced database writes by **43%** without affecting latency
- Server handled 18% more events/sec with batching enabled
- All 600 concurrent users completed successfully in both scenarios

### 6.2 Giảm Latency

| Metric | Observation |
|--------|-------------|
| Write latency (p95) | 0.4ms (same for both baseline and optimized) |
| Perceived input lag | No degradation |
| MongoDB load | Reduced by 43% |
| Throughput | Increased by 18% |

### 6.3 Đảm bảo Data Integrity

| Tình huống | Xử lý |
|------------|-------|
| User disconnect bình thường | Flush buffer ngay lập tức |
| Server restart | Mất buffer (chấp nhận được - 2s data) |
| Network error | Client có thể retry |

---

## 7. Cấu hình & Tuning

### 7.1 Điều chỉnh BATCH_INTERVAL

```typescript
// Cấu hình cho different use cases

// Real-time collaboration (hiện tại)
const BATCH_INTERVAL = 2000; // 2 seconds

// High-traffic environment
const BATCH_INTERVAL = 5000; // 5 seconds

// Low-latency requirement
const BATCH_INTERVAL = 1000; // 1 second
```

### 7.2 Trade-offs

| BATCH_INTERVAL | Ưu điểm | Nhược điểm |
|----------------|---------|------------|
| **Ngắn (1s)** | Ít mất data hơn | Nhiều writes hơn |
| **Dài (5s)** | Ít writes | Mất nhiều data hơn nếu crash |
| **Trung bình (2s)** | Cân bằng | Cân bằng |

### 7.3 Monitoring

Có thể thêm metrics để monitor:

```typescript
// Thêm vào documentSocket.ts
let batchStats = {
  totalSaves: 0,
  totalBatched: 0,
  averageBatchSize: 0
};

// Log batch statistics
setInterval(() => {
  console.log(`[BATCHING STATS] Total saves: ${batchStats.totalSaves}, Batched: ${batchStats.totalBatched}`);
}, 60000);
```

---

## Kết luận

WebSocket Batching Optimization đã được kiểm chứng qua load testing thực tế với Artillery:

- ✅ **Giảm 43% database writes** (600 → 343 writes với 600 concurrent users)
- ✅ **Duy trì latency ổn định** (p95: 0.4ms cho cả baseline và optimized)
- ✅ **Tăng throughput 18%** (235 → 277 events/sec)
- ✅ **Đảm bảo data integrity** với flush on disconnect
- ✅ **Scale tốt** với 600 concurrent users (100% completion rate)

---

## Tài liệu tham khảo

- [Socket.IO Documentation](https://socket.io/docs/v4/)
- [MongoDB Write Operations](https://www.mongodb.com/docs/manual/crud/)
- [Real-time Collaboration Patterns](https://www.pubnub.com/blog/real-time-collaboration-patterns/)

---

*Cập nhật lần cuối: December 2025*
