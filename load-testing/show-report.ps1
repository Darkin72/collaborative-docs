# Simple Artillery Report Viewer
param([string]$ReportFile = "reports/baseline-report.json")

if (-not (Test-Path $ReportFile)) {
    Write-Host "File not found: $ReportFile" -ForegroundColor Red
    exit 1
}

$report = Get-Content $ReportFile | ConvertFrom-Json
$summary = $report.aggregate

Write-Host "`n========================================"  -ForegroundColor Cyan
Write-Host "  ARTILLERY TEST REPORT" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "SUMMARY:" -ForegroundColor Yellow
Write-Host "  Test ID: $($report.testRunId)"
Write-Host ""

Write-Host "VIRTUAL USERS:" -ForegroundColor Green
$created = $summary.counters.'vusers.created'
$completed = $summary.counters.'vusers.completed'
$failed = $summary.counters.'vusers.failed'
Write-Host "  Created: $created"
Write-Host "  Completed: $completed"
Write-Host "  Failed: $failed"
if ($created -gt 0) {
    $rate = [math]::Round($completed / $created * 100, 2)
    Write-Host "  Success Rate: $rate%" -ForegroundColor $(if ($rate -ge 99) { "Green" } else { "Yellow" })
}
Write-Host ""

Write-Host "SOCKET.IO EVENTS:" -ForegroundColor Magenta
Write-Host "  Total Emits: $($summary.counters.'socketio.emit')"
Write-Host "  Rate: ~$([math]::Round($summary.counters.'socketio.emit' / 120)) events/sec"
Write-Host ""

Write-Host "RESPONSE TIME (ms):" -ForegroundColor Blue
$rt = $summary.summaries.'socketio.response_time'
Write-Host "  Min: $($rt.min)ms"
Write-Host "  Median: $($rt.median)ms"
Write-Host "  Mean: $($rt.mean)ms"
Write-Host "  p95: $($rt.p95)ms" -ForegroundColor $(if ($rt.p95 -lt 200) { "Green" } elseif ($rt.p95 -lt 500) { "Yellow" } else { "Red" })
Write-Host "  p99: $($rt.p99)ms" -ForegroundColor $(if ($rt.p99 -lt 500) { "Green" } elseif ($rt.p99 -lt 1000) { "Yellow" } else { "Red" })
Write-Host "  Max: $($rt.max)ms"
Write-Host ""

if ($failed -eq 0) {
    Write-Host "NO ERRORS!" -ForegroundColor Green
} else {
    Write-Host "ERRORS DETECTED!" -ForegroundColor Red
    Write-Host "  Failed: $failed"
}

Write-Host "`n========================================`n" -ForegroundColor Cyan

Write-Host "EVALUATION:" -ForegroundColor Yellow
if ($rt.p95 -lt 200) {
    Write-Host "  [EXCELLENT] p95 < 200ms" -ForegroundColor Green
} elseif ($rt.p95 -lt 500) {
    Write-Host "  [GOOD] p95 200-500ms" -ForegroundColor Yellow
} else {
    Write-Host "  [NEEDS OPTIMIZATION] p95 > 500ms" -ForegroundColor Red
}
Write-Host ""
