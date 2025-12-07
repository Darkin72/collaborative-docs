# Optimistic Concurrency Control (OCC) Implementation

## Tổng quan

Triển khai Optimistic Concurrency Control để đảm bảo tính nhất quán dữ liệu khi nhiều người dùng cùng chỉnh sửa và lưu tài liệu tại cùng một thời điểm.

## Vấn đề cần giải quyết

Trong ứng dụng collaborative editing, khi nhiều người dùng cùng chỉnh sửa một tài liệu:
- **Lost Update Problem**: Người dùng A và B cùng sửa, A lưu trước, B lưu sau -> thay đổi của A bị mất
- **Dirty Read**: Đọc dữ liệu chưa được commit
- **Race Condition**: Xung đột khi nhiều requests đồng thời

## Giải pháp: Optimistic Concurrency Control

### Cơ chế hoạt động

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client A  │     │   Server    │     │   Client B  │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       │  Load doc (v=1)   │                   │
       │◄──────────────────│                   │
       │                   │   Load doc (v=1)  │
       │                   │──────────────────►│
       │                   │                   │
       │    Edit...        │      Edit...      │
       │                   │                   │
       │  Save (data, v=1) │                   │
       │──────────────────►│                   │
       │                   │  Check v == DB.v  │
       │                   │  v=1 == v=1 ✓     │
       │                   │  Save & v++ (v=2) │
       │  Success (v=2)    │                   │
       │◄──────────────────│                   │
       │                   │                   │
       │                   │  Save (data, v=1) │
       │                   │◄──────────────────│
       │                   │  Check v == DB.v  │
       │                   │  v=1 != v=2 ✗     │
       │                   │  VERSION CONFLICT │
       │                   │──────────────────►│
       │                   │                   │
```

### Triển khai trong Mongoose

Mongoose tự động thêm trường `__v` (version key) vào schema. Ta tận dụng trường này cho OCC.

## Chi tiết Implementation

### 1. Server - Document Controller (`documentController.ts`)

```typescript
// Custom error class cho version conflicts
export class VersionConflictError extends Error {
    public currentVersion: number;
    public currentData: any;
    
    constructor(message: string, currentVersion: number, currentData: any) {
        super(message);
        this.name = 'VersionConflictError';
        this.currentVersion = currentVersion;
        this.currentData = currentData;
    }
}

// Update document với OCC
export const updateDocument = async(
    id: string, 
    data: Object, 
    userId: string,
    expectedVersion?: number
): Promise<{ version: number; data: any } | undefined> => {
    // ...permission check...
    
    if (expectedVersion !== undefined) {
        // Find document và check version
        const currentDoc = await Document.findById(id);
        const currentVersion = (currentDoc as any).__v || 0;
        
        // Check version match
        if (currentVersion !== expectedVersion) {
            throw new VersionConflictError(
                `Version conflict: expected ${expectedVersion}, current ${currentVersion}`,
                currentVersion,
                currentDoc.data
            );
        }
        
        // Atomic update với version check
        const updatedDoc = await Document.findOneAndUpdate(
            { _id: id, __v: expectedVersion },
            { 
                ...data,
                $inc: { __v: 1 }  // Increment version
            },
            { new: true }
        );
        
        // Handle race condition
        if (!updatedDoc) {
            const latestDoc = await Document.findById(id);
            throw new VersionConflictError(
                'Document was modified by another user',
                (latestDoc as any)?.__v || 0,
                latestDoc?.data
            );
        }
        
        return { version: (updatedDoc as any).__v, data: updatedDoc.data };
    }
    
    // Legacy behavior (no version check)
    // ...
}
```

### 2. Server - Socket Handler (`documentSocket.ts`)

```typescript
// Load document với version
socket.emit("load-document", {
    data: document.data,
    role: document.userRole,
    canEdit: document.canEdit,
    version: document.version  // Include version
});

// Save với OCC
socket.on("save-document", async (payload: { data: any; version?: number }) => {
    const data = payload.data !== undefined ? payload.data : payload;
    const expectedVersion = payload.version;
    
    // ... batching logic ...
    
    try {
        const result = await updateDocument(documentId, { data }, userId, expectedVersion);
        
        // Notify success với new version
        socket.emit("save-success", { version: result?.version });
        
        // Broadcast version update to others
        socket.broadcast.to(documentId).emit("version-update", { version: result?.version });
        
    } catch (error) {
        if (error instanceof VersionConflictError) {
            socket.emit("version-conflict", {
                error: error.message,
                currentVersion: error.currentVersion,
                currentData: error.currentData
            });
        }
    }
});
```

### 3. Client - TextEditor (`TextEditor.tsx`)

```typescript
// State tracking
const [documentVersion, setDocumentVersion] = useState<number>(0);
const [hasConflict, setHasConflict] = useState(false);

// Handle version conflict
const handleVersionConflict = (data: { 
    error: string; 
    currentVersion: number; 
    currentData: any;
}) => {
    setHasConflict(true);
    
    const shouldMerge = window.confirm(
        `Version conflict detected!\n` +
        `Your version: ${documentVersion}, Server: ${data.currentVersion}\n` +
        `Click OK to reload latest version.`
    );
    
    if (shouldMerge && quill) {
        quill.setContents(data.currentData);
        setDocumentVersion(data.currentVersion);
    } else {
        setDocumentVersion(data.currentVersion);
    }
    setHasConflict(false);
};

// Auto-save với version
const interval = setInterval(() => {
    socket.emit("save-document", {
        data: quill.getContents(),
        version: documentVersion
    });
}, SAVE_INTERVAL_MS);
```

## Socket Events mới

| Event | Direction | Payload | Mô tả |
|-------|-----------|---------|-------|
| `load-document` | Server → Client | `{ data, role, canEdit, version }` | Load document với version |
| `save-document` | Client → Server | `{ data, version }` | Save với expected version |
| `save-success` | Server → Client | `{ version, timestamp }` | Save thành công với new version |
| `version-update` | Server → Others | `{ version, timestamp }` | Broadcast version update |
| `version-conflict` | Server → Client | `{ error, currentVersion, currentData }` | Version conflict detected |

## UI Indicator

Version và conflict status được hiển thị trong toolbar:

```tsx
<div className={`
    px-3 py-1 text-xs font-medium rounded-md
    ${hasConflict 
        ? 'bg-red-100 text-red-800 animate-pulse' 
        : 'bg-gray-100 text-gray-600'
    }
`}>
    {hasConflict ? '⚠️ Conflict' : `v${documentVersion}`}
</div>
```

## Lợi ích

1. **Không blocking**: Không lock tài liệu, nhiều người có thể sửa đồng thời
2. **Detect conflicts**: Phát hiện và thông báo khi có xung đột
3. **Data integrity**: Đảm bảo không mất dữ liệu do overwrite
4. **User choice**: Cho phép user quyết định cách xử lý conflict
5. **Performance**: Không overhead của locking mechanism

## Hạn chế và cải tiến tương lai

### Hạn chế hiện tại
- **Manual merge**: User phải tự merge changes khi có conflict
- **Lost work**: Nếu user chọn reload, local changes sẽ mất

### Cải tiến tương lai
1. **Automatic merge**: Implement 3-way merge cho text content
2. **Operational Transformation (OT)**: Cho real-time collaborative editing
3. **CRDT**: Conflict-free Replicated Data Types cho better conflict resolution
4. **Diff view**: Hiển thị diff giữa local và server version

## Backward Compatibility

Implementation maintain backward compatibility:
- Nếu client không gửi version → server không check version
- Socket event format hỗ trợ cả format cũ và mới
- Khi disconnect, flush data không check version (prevent data loss)

## Test Scenarios

1. **Single user edit**: Version increment normally
2. **Two users, sequential saves**: Second user gets conflict
3. **Two users, simultaneous saves**: Atomic check prevents race condition
4. **Client reload on conflict**: Gets latest version
5. **Disconnect during edit**: Data flushed without version check
