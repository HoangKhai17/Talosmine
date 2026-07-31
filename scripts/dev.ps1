# Khởi động toàn bộ môi trường phát triển bằng MỘT lệnh.
#
# Dùng:
#     .\scripts\dev.ps1
#
# Script này KHÔNG tự bật Docker — chủ dự án tự bật từ Docker Desktop. Nó chỉ kiểm tra
# hạ tầng đã sẵn sàng chưa, rồi chạy hai app Node trong cùng một cửa sổ terminal.
#
# Vì sao hai app không nằm trong Docker: chúng cần hot-reload (sửa code thấy ngay).
# Đóng gói vào image sẽ mất khả năng đó và làm vòng lặp phát triển chậm hẳn.
#
# Nhấn Ctrl+C để dừng cả hai cùng lúc.

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot

function Write-Step($text) { Write-Host "`n▸ $text" -ForegroundColor Cyan }
function Write-Ok($text)   { Write-Host "  ✓ $text" -ForegroundColor Green }
function Write-Warn($text) { Write-Host "  ! $text" -ForegroundColor Yellow }

# ─────────────────────────────────────────────────────────────────────────────
# 1. Node 24.18.0 (DEC-T01)
# ─────────────────────────────────────────────────────────────────────────────
# Dot-source để PATH áp dụng cho chính script này và mọi tiến trình con nó sinh ra.
# Gọi thường (không có dấu chấm) thì thay đổi PATH mất ngay khi script kia kết thúc.
Write-Step 'Kích hoạt Node'
. "$PSScriptRoot\use-node.ps1"

# ─────────────────────────────────────────────────────────────────────────────
# 2. Kiểm tra hạ tầng Docker
# ─────────────────────────────────────────────────────────────────────────────
# Fail fast ở đây thay vì để app khởi động rồi chết vì không nối được database —
# lỗi lúc đó là một stack trace khó đọc, còn ở đây là một câu tiếng Việt rõ ràng.
Write-Step 'Kiểm tra hạ tầng Docker'

$required = @('talosmine-db', 'talosmine-pooler', 'talosmine-logto')
try {
    $running = @(docker ps --format '{{.Names}}' 2>$null)
} catch {
    Write-Host @'

  ✗ Không gọi được Docker.

    Hãy mở Docker Desktop và đợi nó khởi động xong, rồi chạy lại script này.

'@ -ForegroundColor Red
    exit 1
}

$missing = $required | Where-Object { $running -notcontains $_ }

if ($missing.Count -gt 0) {
    Write-Host "`n  ✗ Thiếu container: $($missing -join ', ')" -ForegroundColor Red
    Write-Host @'

    Bật hạ tầng bằng lệnh:

      docker compose -f infra/compose/docker-compose.yml -f infra/compose/docker-compose.dev.yml --env-file .env up -d

    (`--env-file .env` là BẮT BUỘC: thư mục dự án của compose là infra/compose/ chứ không phải
     gốc repo, nên nó KHÔNG tự tìm thấy .env ở gốc và sẽ dừng ở
     "required variable LOGTO_DB_PASSWORD is missing a value". Là .env, không phải .env.dev —
     .env.dev dành cho hai app Node, không chứa biến của compose.)

'@ -ForegroundColor Yellow
    exit 1
}
Write-Ok "3 container đang chạy"

# ─────────────────────────────────────────────────────────────────────────────
# 3. Kiểm tra file cấu hình
# ─────────────────────────────────────────────────────────────────────────────
Write-Step 'Kiểm tra cấu hình'

$envDev = Join-Path $repoRoot '.env.dev'
if (-not (Test-Path $envDev)) {
    Write-Host "`n  ✗ Thiếu file .env.dev ở gốc dự án." -ForegroundColor Red
    Write-Host "    Xem .env.example để biết các biến cần điền.`n" -ForegroundColor Yellow
    exit 1
}
Write-Ok '.env.dev'

# apps/web không đọc .env.dev ở gốc — Next.js chỉ tự nạp .env.local trong thư mục app.
$envLocal = Join-Path $repoRoot 'apps\web\.env.local'
if (-not (Test-Path $envLocal)) {
    Write-Host "`n  ✗ Thiếu apps/web/.env.local" -ForegroundColor Red
    Write-Host @'
    Next.js không đọc .env.dev ở gốc repo. Cần các biến:
      OIDC_ISSUER_URL, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET,
      APP_BASE_URL, CONTROL_PLANE_BASE_URL

'@ -ForegroundColor Yellow
    exit 1
}
Write-Ok 'apps/web/.env.local'

# ─────────────────────────────────────────────────────────────────────────────
# 4. Kiểm tra cổng còn trống
# ─────────────────────────────────────────────────────────────────────────────
# Cổng đã bị chiếm thường là do một phiên trước chưa tắt hẳn. Báo trước sẽ đỡ mất công
# hơn là để Next/Nest tự nhảy sang cổng khác rồi mọi URL đều sai.
Write-Step 'Kiểm tra cổng'

foreach ($port in 3000, 3100) {
    $inUse = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($inUse) {
        $procId = $inUse[0].OwningProcess
        $name = (Get-Process -Id $procId -ErrorAction SilentlyContinue).ProcessName
        Write-Host "`n  ✗ Cổng $port đang bị chiếm bởi PID $procId ($name)." -ForegroundColor Red
        Write-Host @"
    Thường là tiến trình sót lại từ lần chạy trước chưa tắt hẳn.
    Hạ nó bằng lệnh (dùng /T để hạ cả tiến trình con):

      taskkill /PID $procId /T /F

"@ -ForegroundColor Yellow
        exit 1
    }
}
Write-Ok 'cổng 3000 và 3100 còn trống'

# ─────────────────────────────────────────────────────────────────────────────
# 5. Chạy hai app
# ─────────────────────────────────────────────────────────────────────────────
Write-Step 'Khởi động ứng dụng'
Write-Host @'

  Web người dùng      http://localhost:3000
  Khu quản trị        http://localhost:3000/admin
  Control Plane API   http://localhost:3100
  Đăng nhập (Logto)   http://localhost:3001
  Quản trị Logto      http://localhost:3002

  Nhấn Ctrl+C để dừng cả hai.

'@ -ForegroundColor Gray

# Dùng pnpm.cmd chứ không phải `pnpm`: Start-Process cần đường dẫn tới một file thực thi
# thật, mà `pnpm` trong PowerShell là một shim .ps1 nên nó không nhận.
$pnpm = (Get-Command pnpm.cmd -ErrorAction SilentlyContinue).Source
if (-not $pnpm) { $pnpm = (Get-Command pnpm -ErrorAction Stop).Source }

$processes = @()

try {
    # -NoNewWindow: cả hai tiến trình dùng chung console này nên log hiện cùng một chỗ,
    # không phải nhảy qua lại giữa nhiều cửa sổ.
    $processes += Start-Process -FilePath $pnpm `
        -ArgumentList 'dev:api' `
        -WorkingDirectory $repoRoot -NoNewWindow -PassThru

    # Đợi API nhận cổng trước khi mở web. Không bắt buộc, nhưng nếu web lên trước thì
    # request đầu tiên của nó sẽ lỗi kết nối và log đầy thông báo gây hiểu nhầm.
    Start-Sleep -Seconds 3

    $processes += Start-Process -FilePath $pnpm `
        -ArgumentList 'dev:web' `
        -WorkingDirectory $repoRoot -NoNewWindow -PassThru

    # Chặn ở đây tới khi người dùng Ctrl+C hoặc một tiến trình chết.
    Wait-Process -Id ($processes | ForEach-Object { $_.Id })
}
finally {
    # finally chạy cả khi Ctrl+C. Thiếu khối này thì tiến trình con sống sót và giữ cổng,
    # khiến lần chạy sau báo "cổng đang bị chiếm".
    Write-Host "`n▸ Đang dừng..." -ForegroundColor Cyan
    foreach ($p in $processes) {
        if ($p -and -not $p.HasExited) {
            # /T để hạ cả cây tiến trình con: pnpm sinh ra node, giết mỗi pnpm thì node
            # vẫn sống và tiếp tục giữ cổng.
            & taskkill /PID $p.Id /T /F 2>&1 | Out-Null
        }
    }
    Write-Host "  ✓ Đã dừng.`n" -ForegroundColor Green
}
