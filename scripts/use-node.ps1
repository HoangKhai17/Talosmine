# Kích hoạt Node 24.18.0 (DEC-T01) CHỈ trong phiên PowerShell hiện tại.
#
# Vì sao cần script này thay vì `nvm use`:
#   nvm-windows đổi symlink `C:\Program Files\nodejs` nên nó đổi Node cho TOÀN MÁY.
#   Mỗi bản Node lại có kho global riêng, nên `nvm use 24.18.0` sẽ làm biến mất các CLI
#   global đang cài dưới v25.2.1 (opencode, claude, gemini, bun, yarn) và đổi luôn Node
#   của các dự án khác. Script này chỉ sửa PATH của phiên hiện tại — không đụng gì tới máy.
#
# Dùng:  . .\scripts\use-node.ps1     (chú ý dấu chấm đầu dòng — phải dot-source)
#
# Kiểm tra sau khi chạy:  node --version  ->  v24.18.0
#                         pnpm --version  ->  11.13.1

$ErrorActionPreference = 'Stop'

$version = (Get-Content "$PSScriptRoot\..\.nvmrc").Trim()
$nodeDir = "$env:APPDATA\nvm\v$version"

if (-not (Test-Path "$nodeDir\node.exe")) {
    Write-Error @"
Không tìm thấy Node $version tại: $nodeDir

Cài bằng một trong hai cách:
  1) nvm install $version        (chạy trong terminal thật, nvm cần console tương tác)
  2) Tải https://nodejs.org/dist/v$version/node-v$version-win-x64.zip
     rồi giải nén vào $nodeDir sao cho node.exe nằm ngay trong đó.
"@
}

$env:Path = "$nodeDir;$nodeDir\node_modules\npm\bin;" + $env:Path

$actual = (& "$nodeDir\node.exe" --version)
Write-Host "Node $actual da kich hoat cho phien nay (khong doi Node toan may)." -ForegroundColor Green
Write-Host "Global symlink van la: $((Get-Item 'C:\Program Files\nodejs' -ErrorAction SilentlyContinue).Target)" -ForegroundColor DarkGray
