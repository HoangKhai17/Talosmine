// DEC-T07: OpenAPI là spec-first. File YAML viết tay là nguồn sự thật; type TypeScript
// được sinh ra từ nó và được commit. Script này sinh lại type rồi so với bản đã commit.
//
// Vì sao cần: nếu ai đó sửa YAML mà quên chạy `pnpm openapi:types`, type đã commit sẽ
// mô tả một contract KHÁC với spec. Lúc đó code compile qua nhưng chạy sai — đúng loại
// lỗi im lặng mà contract freeze sinh ra để ngăn. Script này biến nó thành lỗi CI ồn ào.
//
// Dùng: pnpm openapi:drift    (exit 1 nếu lệch)

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const spec = resolve(root, 'contracts/openapi/control-plane.v1.yaml');
const committed = resolve(root, 'contracts/openapi/generated/types.ts');

if (!existsSync(spec)) {
  console.error(`[openapi:drift] Không tìm thấy spec: ${spec}`);
  process.exit(1);
}
if (!existsSync(committed)) {
  console.error(
    `[openapi:drift] Chưa có type đã commit: ${committed}\n` +
      `Chạy "pnpm openapi:types" rồi commit kết quả.`,
  );
  process.exit(1);
}

let regenerated;
try {
  // Sinh ra stdout thay vì ghi đè file đã commit — script này chỉ kiểm tra, không sửa.
  regenerated = execFileSync(
    process.execPath,
    [resolve(root, 'node_modules/openapi-typescript/bin/cli.js'), spec],
    { encoding: 'utf8', cwd: root },
  );
} catch (err) {
  console.error('[openapi:drift] Sinh type thất bại:', err.message);
  process.exit(1);
}

const normalize = (s) => s.replace(/\r\n/g, '\n').trimEnd();
const onDisk = normalize(readFileSync(committed, 'utf8'));
const fresh = normalize(regenerated);

if (onDisk === fresh) {
  console.log('[openapi:drift] OK — type đã commit khớp với spec.');
  process.exit(0);
}

console.error(
  '[openapi:drift] LỆCH — type đã commit KHÔNG khớp spec.\n' +
    'Spec đã đổi nhưng type chưa được sinh lại.\n\n' +
    'Sửa bằng:  pnpm openapi:types   rồi commit contracts/openapi/generated/types.ts\n',
);
process.exit(1);
