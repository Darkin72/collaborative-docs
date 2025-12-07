# Operational Transformation - Quick Reference

## 🚀 Quick Start

### Enable OT in Your Editor

**3 Simple Steps:**

1. **Import OT Client Manager**
```typescript
import { OTClientManager } from '../utils/otClient';
const otManager = new OTClientManager();
```

2. **Send Changes with Version**
```typescript
// Instead of: socket.emit('send-changes', delta);
socket.emit('send-changes-ot', {
  delta,
  version: otManager.getVersion()
});
```

3. **Receive Transformed Changes**
```typescript
socket.on('receive-changes-ot', ({ delta, version }) => {
  quill.updateContents(delta);
  otManager.setVersion(version);
});
```

**That's it!** OT is now enabled.

---

## 📡 Socket Events Reference

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `send-changes-ot` | `{ delta, version }` | Send edit with version |
| `save-document-ot` | none | Save current OT state |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `receive-changes-ot` | `{ delta, version, clientId }` | Receive transformed edit |
| `ot-ack` | `{ version }` | Operation acknowledged |
| `ot-transform` | `{ version }` | Operation was transformed |
| `ot-error` | `{ error, currentVersion }` | Error occurred |

---

## 🔧 Common Patterns

### Pattern 1: Basic OT Setup

```typescript
// Initialize on document load
socket.on('load-document', ({ data, version }) => {
  otManager.initialize(version);
  quill.setContents(data);
});

// Send changes
quill.on('text-change', (delta, _, source) => {
  if (source === 'user') {
    socket.emit('send-changes-ot', {
      delta,
      version: otManager.getVersion()
    });
  }
});

// Receive changes
socket.on('receive-changes-ot', ({ delta, version }) => {
  quill.updateContents(delta);
  otManager.setVersion(version);
});

// Handle acks
socket.on('ot-ack', ({ version }) => {
  otManager.setVersion(version);
});
```

### Pattern 2: With Error Handling

```typescript
socket.on('ot-error', ({ error, currentVersion }) => {
  console.error('OT Error:', error);
  
  // Resync with server
  socket.emit('get-document', {
    documentId,
    documentName
  });
});
```

### Pattern 3: Show Version Info

```typescript
const VersionDisplay = () => {
  const [version, setVersion] = useState(0);
  
  useEffect(() => {
    socket.on('ot-ack', ({ version: v }) => {
      setVersion(v);
    });
  }, []);
  
  return <div>Document v{version}</div>;
};
```

---

## 🎯 Migration Guide

### From Basic to OT

**Before (without OT):**
```typescript
socket.emit('send-changes', delta);
socket.on('receive-changes', delta => {
  quill.updateContents(delta);
});
```

**After (with OT):**
```typescript
socket.emit('send-changes-ot', { delta, version });
socket.on('receive-changes-ot', ({ delta, version }) => {
  quill.updateContents(delta);
  otManager.setVersion(version);
});
```

**Changes:**
1. ✅ Add version to send
2. ✅ Extract version from receive
3. ✅ Update local version

---

## 🐛 Troubleshooting

### Issue: "OT Error: Client version ahead of server"

**Cause:** Client version got out of sync

**Fix:**
```typescript
socket.on('ot-error', () => {
  // Reload document
  location.reload();
});
```

### Issue: Changes not applying

**Cause:** Not listening to `receive-changes-ot`

**Fix:** Make sure you have:
```typescript
socket.on('receive-changes-ot', handler);
```

### Issue: Version always 0

**Cause:** Not updating version on ack

**Fix:**
```typescript
socket.on('ot-ack', ({ version }) => {
  otManager.setVersion(version);  // ← Don't forget this!
});
```

---

## 📊 Debugging

### Check OT Status

```typescript
const stats = otManager.getStats();
console.log('Version:', stats.version);
console.log('Pending ops:', stats.pendingCount);
console.log('Waiting:', stats.isWaiting);
```

### Monitor Events

```typescript
// Log all OT events
socket.onAny((eventName, ...args) => {
  if (eventName.includes('ot')) {
    console.log('[OT Event]', eventName, args);
  }
});
```

### Check Server State

Server logs show:
```
[OT] Document loaded, version: 0
[OT] Sent change, version: 0
[OT] Operation acknowledged, version: 1
```

---

## ✅ Best Practices

### DO ✅

- ✅ Always send version with operations
- ✅ Update version on every ack
- ✅ Handle `ot-error` events
- ✅ Test with multiple concurrent users
- ✅ Monitor version consistency

### DON'T ❌

- ❌ Ignore version numbers
- ❌ Forget to handle acks
- ❌ Mix OT and non-OT events
- ❌ Assume operations apply immediately
- ❌ Skip error handling

---

## 🎓 Advanced Usage

### Compose Multiple Deltas

```typescript
import { composeDeltas } from '../utils/otClient';

const combined = composeDeltas(delta1, delta2);
socket.emit('send-changes-ot', {
  delta: combined,
  version: otManager.getVersion()
});
```

### Check if Delta is Empty

```typescript
import { isDeltaEmpty } from '../utils/otClient';

if (!isDeltaEmpty(delta)) {
  socket.emit('send-changes-ot', { delta, version });
}
```

### Batch Operations

```typescript
let pendingDeltas = [];
const batchInterval = 100; // ms

quill.on('text-change', (delta) => {
  pendingDeltas.push(delta);
  
  clearTimeout(batchTimer);
  batchTimer = setTimeout(() => {
    const combined = pendingDeltas.reduce(composeDeltas);
    socket.emit('send-changes-ot', {
      delta: combined,
      version: otManager.getVersion()
    });
    pendingDeltas = [];
  }, batchInterval);
});
```

---

## 📚 See Also

- [Full Documentation](./operational-transformation.md)
- [Example Implementation](../client/src/examples/TextEditorWithOT.example.tsx)
- [Server Code](../server/src/sockets/documentSocket.ts)
- [OT Utils](../server/src/utils/operationalTransformation.ts)

---

**Quick Questions?**

- **Q: Do I need to change my database?**
  A: No, OT works with existing schema.

- **Q: Is it backward compatible?**
  A: Yes! Old `send-changes` still works.

- **Q: Performance impact?**
  A: Minimal, transformations are O(1) for most cases.

- **Q: Works offline?**
  A: Operations queue and sync when reconnected.

---

**Ready to enable OT?** Just add 3 lines of code! 🚀
