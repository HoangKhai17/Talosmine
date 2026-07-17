# Kích hoạt Node 24.18.0 (DEC-T01) CHỈ trong shell hiện tại.
#
# Vì sao cần script này thay vì `nvm use`: xem scripts/use-node.ps1.
# Tóm tắt: `nvm use` đổi Node cho toàn máy và làm mất các CLI global đang cài
# dưới bản Node hiện tại. Script này chỉ sửa PATH của shell này.
#
# Dùng:  source ./scripts/use-node.sh
#
# Kiểm tra:  node --version  ->  v24.18.0
#            pnpm --version  ->  11.13.1

_talosmine_use_node() {
  local script_dir version node_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  version="$(tr -d '[:space:]' < "$script_dir/../.nvmrc")"

  # nvm-windows lưu ở %APPDATA%\nvm\v<version>; trên Linux/macOS dùng ~/.nvm/versions/node
  if [ -n "$APPDATA" ]; then
    node_dir="$(cygpath -u "$APPDATA" 2>/dev/null || echo "$APPDATA")/nvm/v$version"
  else
    node_dir="$HOME/.nvm/versions/node/v$version/bin"
  fi

  if [ ! -x "$node_dir/node.exe" ] && [ ! -x "$node_dir/node" ]; then
    echo "Không tìm thấy Node $version tại: $node_dir" >&2
    echo "Xem hướng dẫn cài trong scripts/use-node.ps1" >&2
    return 1
  fi

  export PATH="$node_dir:$node_dir/node_modules/npm/bin:$PATH"
  echo "Node $(node --version) da kich hoat cho shell nay (khong doi Node toan may)."
}

_talosmine_use_node
