# 📊 Load Testing cho Collaborative Docs

## 🎯 Mục đích
Đánh giá hiệu năng hệ thống khi có nhiều users đồng thời chỉnh sửa tài liệu, so sánh performance trước và sau khi implement batching.

## 🚀 Cài đặt

```bash
cd load-testing
npm install
```

## 📖 Kiến thức cần biết

### Artillery là gì?
- Tool load testing mã nguồn mở, viết bằng Node.js
- Config đơn giản bằng YAML
- Hỗ trợ HTTP, WebSocket, Socket.io

### Metrics quan trọng:
- **Latency (p50, p95, p99)**: Thời gian phản hồi
- **RPS (Requests per second)**: Số requests/giây
- **Error Rate**: Tỷ lệ lỗi
- **Concurrent Users**: Số users đồng thời

## 📊 Các Test Scenarios

### 1️⃣ Baseline Test (Trước khi tối ưu)
Đo hiệu năng hệ thống hiện tại - **CHẠY TRƯỚC**
```bash
npm run test:baseline
```

**Kịch bản:**
- 600 virtual users trong 2 phút (5 users/giây)
- Mỗi user connect socket, join document
- Gửi 50 text changes (mô phỏng typing)
- Measure: latency, throughput, errors

### 2️⃣ Optimized Test (Sau khi implement batching)
Đo hiệu năng sau tối ưu - **CHẠY SAU**
```bash
npm run test:optimized
```

**Same scenario như baseline để so sánh công bằng**

### 3️⃣ Smoke Test (Quick verification)
Test nhanh để verify setup:
```bash
npx artillery run scenarios/smoke-test.yml
```

**Kịch bản:**
- 10 virtual users trong 10 giây
- Quick sanity check
- Verify server connectivity

## 📈 Xem Reports

**Note:** Artillery v2 không hỗ trợ HTML reports nữa. Dùng PowerShell scripts:

```bash
# Xem baseline report
./show-report.ps1

# Xem optimized report  
./show-report.ps1 -ReportFile reports/optimized-report.json

# So sánh 2 reports
./compare-reports.ps1
```

Reports được format đẹp trong terminal với màu sắc.
## 🎯 Kết Quả Đạt Được

### Trước tối ưu (Baseline):
- ✅ p95 latency: 0.2ms
- ❌ DB writes: ~600 writes (1 per user)
- ✅ 100% success rate

### Sau tối ưu (Batching):
- ✅ p95 latency: 0.2ms (maintained)
- ✅ DB writes: ~60 writes (batched every 2s)
- ✅ 100% success rate
- 🎉 **90% reduction in DB writes!**writes/phút (giảm 97%)
- ✅ Lower CPU usage

## 📝 Cách đọc kết quả

### Response Time (Latency)
- **p50 (median)**: 50% requests nhanh hơn giá trị này
- **p95**: 95% requests nhanh hơn (quan trọng nhất)
- **p99**: 99% requests nhanh hơn

**Đánh giá:**
- ✅ p95 < 200ms: Excellent
- ⚠️ p95 200-500ms: Good
- ❌ p95 > 500ms: Cần tối ưu

### Error Rate
- ✅ < 1%: Acceptable
- ⚠️ 1-5%: Warning
- ❌ > 5%: Critical

### Throughput (RPS)
Càng cao càng tốt = hệ thống xử lý được nhiều requests

## 🔄 Quy trình Test

1. **Đảm bảo server đang chạy:**
   ```bash
   cd ..
   docker-compose up
   ```

2. **Chạy baseline test:**
   ```bash
   npm run test:baseline
3. **Implement batching** (đã hoàn thành)

4. **Chạy optimized test:**bước sau)

4. **Chạy optimized test:**
   ```bash
   npm run test:optimized
   ```
5. **So sánh kết quả:**
   ```bash
   ./compare-reports.ps1
   ```
   - So sánh p95 latency
   - So sánh error rate
   - Tính % reduction DB writes
   - Check MongoDB logs để đếm số writes
```
load-testing/
├── package.json              # Dependencies
├── README.md                 # File này
├── show-report.ps1           # Script xem individual report
├── compare-reports.ps1       # Script so sánh reports
├── scenarios/                # Test scenarios
│   ├── baseline-test.yml    # Test trước tối ưu
│   ├── optimized-test.yml   # Test sau tối ưu
│   └── smoke-test.yml       # Quick verification test
└── reports/                  # Test reports (auto-generated)
    ├── baseline-report.json
    └── optimized-report.json
```

## ✨ Batching Implementation

Batching được implement trong `server/src/sockets/documentSocket.ts`:

**Cơ chế:**
- Gom nhiều `save-document` events lại
- Debounce với interval 2 giây
- Chỉ ghi DB 1 lần sau khoảng trễ
- Auto-flush khi user disconnect

**Kết quả:**
- Latency không đổi (vẫn 0.2ms p95)
- DB writes giảm 90% (từ 600 → 60)
- Hiệu quả với high-frequency updates

---

## 🔧 Mở rộng & Tùy chỉnh

### Thêm Test Scenario Mới

1. **Tạo file YAML mới trong `scenarios/`:**

```yaml
# scenarios/heavy-load-test.yml
config:
  target: "http://localhost:3000"
  phases:
    - duration: 300  # 5 phút
      arrivalRate: 10  # 10 users/giây = 3000 users
      name: "Heavy Load Test"
  engines:
    socketio:
      transports: ["websocket"]

scenarios:
  - name: "Heavy Document Editing"
    engine: socketio
    flow:
      - emit:
          channel: "connection"
      
      - emit:
          channel: "get-document"
          data:
            documentId: "heavy-test-doc-{{ $randomNumber(1, 20) }}"
            documentName: "Heavy Test Doc"
      
      - think: 1
      
      - loop:
          - emit:
              channel: "send-changes"
              data:
                ops:
                  - insert: "{{ $randomString(10) }}"
          - think: 0.1  # Faster typing
        count: 100  # More keystrokes
      
      - emit:
          channel: "save-document"
          data: "Heavy test content"
```

2. **Thêm script vào `package.json`:**

```json
"scripts": {
  "test:heavy": "artillery run scenarios/heavy-load-test.yml --output reports/heavy-report.json"
}
```

3. **Chạy test:**

```bash
npm run test:heavy
./show-report.ps1 -ReportFile reports/heavy-report.json
```

### Điều chỉnh Batching Interval

Trong `server/src/sockets/documentSocket.ts`:

```typescript
// Thay đổi từ 2s sang 5s
const BATCH_INTERVAL = 5000; // 5 seconds

// Hoặc config động qua env variable
const BATCH_INTERVAL = Number(process.env.BATCH_INTERVAL || 2000);
```

**Lưu ý:**
- Interval càng cao → DB writes càng ít → Nhưng có thể mất data nếu crash
- Interval càng thấp → Nhiều DB writes hơn → An toàn hơn
- Recommend: 1-3 seconds cho production

### Test với Multiple Documents

Modify scenario để test nhiều documents đồng thời:

```yaml
- emit:
    channel: "get-document"
    data:
      # Random từ 1-100 documents
      documentId: "doc-{{ $randomNumber(1, 100) }}"
      documentName: "Test Doc {{ $randomNumber(1, 100) }}"
```

**Use case:**
- Test Redis Pub/Sub broadcast
- Test concurrent document editing
- Measure isolation giữa documents

### Thêm Custom Metrics

Tạo file `scenarios/custom-metrics.yml`:

```yaml
config:
  target: "http://localhost:3000"
  phases:
    - duration: 60
      arrivalRate: 5
  engines:
    socketio:
      transports: ["websocket"]
  processor: "./custom-functions.js"  # Custom logic

scenarios:
  - name: "Custom Metrics Test"
    engine: socketio
    flow:
      - function: "generateUserId"  # Custom function
      - emit:
          channel: "get-document"
          data:
            documentId: "{{ userId }}-doc"
```

**File `custom-functions.js`:**

```javascript
module.exports = {
  generateUserId: function(context, events, done) {
    context.vars.userId = `user-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return done();
  }
};
```

### Monitor Server Metrics

**Trong khi test, monitor server:**

```bash
# Terminal 1: Chạy test
npm run test:baseline

# Terminal 2: Monitor logs
docker logs -f collaborative-docs-server-1

# Terminal 3: Monitor resources
docker stats collaborative-docs-server-1
```

**Metrics để theo dõi:**
- CPU usage
- Memory usage
- DB connections
- Redis commands/sec
- Socket.io connection count

### Stress Testing

Tìm breaking point của hệ thống:

```yaml
# scenarios/stress-test.yml
config:
  target: "http://localhost:3000"
  phases:
    # Ramp up slowly
    - duration: 60
      arrivalRate: 5
      name: "Warm up"
    
    # Increase load
    - duration: 120
      arrivalRate: 10
      name: "Medium load"
    
    # Heavy load
    - duration: 120
      arrivalRate: 20
      name: "Heavy load"
    
    # Extreme load
    - duration: 60
      arrivalRate: 50
      name: "Stress test"
```

**Mục tiêu:**
- Tìm số users tối đa hệ thống chịu được
- Xác định bottleneck
- Test recovery sau overload

### CI/CD Integration

**GitHub Actions example:**

```yaml
# .github/workflows/load-test.yml
name: Load Testing

on:
  pull_request:
    branches: [main]

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Start services
        run: docker-compose up -d
      
      - name: Run load test
        run: |
          cd load-testing
          npm install
          npm run test:baseline
      
      - name: Check performance
        run: |
          # Fail if p95 > 500ms
          p95=$(jq '.aggregate.summaries."socketio.response_time".p95' reports/baseline-report.json)
          if (( $(echo "$p95 > 500" | bc -l) )); then
            echo "Performance regression detected!"
            exit 1
          fi
```

### Batching Variants

**1. Time-based Batching (hiện tại):**
```typescript
// Batch sau mỗi 2s
setTimeout(() => save(), 2000);
```

**2. Count-based Batching:**
```typescript
// Batch sau mỗi 100 changes
if (changeCount >= 100) {
  save();
  changeCount = 0;
}
```

**3. Hybrid Batching:**
```typescript
// Batch khi: 2s HOẶC 100 changes (cái nào đến trước)
if (Date.now() - lastSave > 2000 || changeCount >= 100) {
  save();
}
```

### Troubleshooting

**Test fails với "Connection refused":**
```bash
# Check server đang chạy
docker ps

# Restart nếu cần
docker-compose restart server
```

**Artillery timeout:**
```yaml
config:
  timeout: 30  # Tăng timeout lên 30s
```

**Memory issues:**
```bash
# Giảm số concurrent users
arrivalRate: 2  # Thay vì 5
```

### Best Practices

1. **Always test trước khi deploy:**
   ```bash
   npm run test:baseline
   ```

2. **Compare với baseline:**
   ```bash
   npm run test:optimized
   ./compare-reports.ps1
   ```

3. **Monitor production metrics:**
   - Setup logging
   - Track DB writes/minute
   - Alert on high latency

4. **Version control reports:**
   ```bash
   # Tag reports với timestamp
   cp reports/baseline-report.json reports/baseline-2024-12-04.json
   ```

5. **Document changes:**
   - Ghi lại mỗi optimization
   - Lưu comparison results
   - Track performance over time

---

## 📚 Tài liệu Tham khảo

- [Artillery Documentation](https://www.artillery.io/docs)
- [Socket.io Load Testing](https://socket.io/docs/v4/load-testing/)
- [Node.js Performance Best Practices](https://nodejs.org/en/docs/guides/simple-profiling/)
- [MongoDB Performance](https://www.mongodb.com/docs/manual/administration/analyzing-mongodb-performance/)

## 🤝 Contributing

Muốn thêm test scenarios hoặc optimizations:

1. Fork repo
2. Tạo branch: `git checkout -b feature/new-optimization`
3. Test kỹ và document kết quả
4. Tạo Pull Request với comparison report

---

## 📞 Support

Gặp vấn đề? Tạo issue tại [GitHub Issues](https://github.com/lephantriduc/collaborative-docs/issues) reports/                  # Test reports (auto-generated)
    ├── baseline-report.json
    └── optimized-report.json
```
