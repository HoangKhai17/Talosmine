# Evidence P1 — output thật, không phải kế hoạch

> Ghi lại ngày 2026-07-17. Mọi khối dưới đây là output **đã chạy thật** trên máy dev.
> Những gì CHƯA chạy được ghi ở mục cuối, không trộn lẫn với phần đã chạy.

## P1.3 — Node và pnpm

```
node --version   -> v24.18.0
pnpm --version   -> 11.13.1
```

**Cô lập, không đổi Node toàn máy.** Kiểm chứng sau khi cài:

```
Global symlink: C:\Users\ACER\AppData\Roaming\nvm\v25.2.1   (không đổi)
opencode con song? CO
claude con song?   CO
```

Lý do phải cô lập: nvm-windows cho mỗi bản Node một kho global riêng. `nvm use 24.18.0`
sẽ làm biến mất `opencode`, `claude`, `gemini`, `bun`, `yarn` vốn cài dưới v25.2.1.
Kích hoạt bằng `scripts/use-node.ps1` / `scripts/use-node.sh` — chỉ sửa PATH của shell.

Ghi chú: **Node 25 đã bỏ corepack**; Node 24 vẫn kèm. Đây là một lý do độc lập nữa
để DEC-T01 chọn 24.

## P1.7 — Workspace

```
pnpm typecheck   -> EXIT=0   (apps/web + apps/control-plane)
pnpm lint        -> EXIT=0   (39 files, 1 warning)
pnpm format      -> Formatted 39 files
```

## P1.9 — Control Plane

```
pnpm --filter @talosmine/control-plane run build  -> EXIT=0
dist/main-api.js  dist/main-worker.js  (CommonJS: "use strict"; require(...))
```

**Env fail-fast — chứng minh thật** (chạy API không có `DATABASE_URL`):

```
ERROR [main-api] Cấu hình môi trường không hợp lệ. Process dừng thay vì chạy với cấu hình sai.
  - DATABASE_URL: Invalid input: expected string, received undefined
EXIT=1
```

Không lộ giá trị biến, chỉ nêu tên và lý do.

## P1.8 — Web

```
pnpm --filter @talosmine/web run build  -> EXIT=0   (Next.js 16.2.10, 5 route)
```

**Runtime thật** (`next start`):

```
GET /       -> 200
  CSP: default-src 'self'; script-src 'self' 'nonce-...' 'strict-dynamic';
       img-src 'self' data:; frame-ancestors 'none'; object-src 'none'; base-uri 'self'
GET /admin  -> 403   (server-side, hai lớp: proxy + layout guard)
GET /api/bff/anything -> 501
```

## P1.10 — Compose

```
docker compose -f infra/compose/docker-compose.yml config  -> EXIT=0
Service render: db, supavisor      (2/11 của bản gốc)
ports: -> KHÔNG service nào publish ra host
Service bị loại vắng mặt: auth, rest, realtime, storage, imgproxy, functions, studio, meta, kong
```

```
docker compose ... ps
talosmine-db      Up (healthy)
talosmine-pooler  Up (healthy)
```

### Ba cái bẫy im lặng đã gặp và cách xử lý

Ghi lại vì cả ba đều **không báo lỗi** — container vẫn `healthy` trong khi không có gì
được áp dụng. Ai cắt service Supabase lần sau sẽ gặp lại chúng.

1. **`migrate.sh` chỉ xử lý `*.sql`.** File `.sh` bị lờ đi, không cảnh báo.
2. **`POSTGRES_USER` không được set.** Image mặc định `POSTGRES_USER=supabase_admin`, và
   `migrate.sh` kết nối bằng chính role đó ở câu lệnh đầu tiên. Đặt `POSTGRES_USER=postgres`
   khiến `supabase_admin` không tồn tại → migrate.sh chết ngay dòng 1 → **không init script
   nào chạy**. Compose chính thức cố ý không set biến này.
3. **`roles.sql` phụ thuộc service đã bị cắt.** Nó `ALTER USER supabase_functions_admin`,
   role do `webhooks.sql` tạo — file chỉ có khi service `functions` tồn tại. Với
   `ON_ERROR_STOP=1`, lỗi này giết cả `migrate.sh` nên toàn bộ `migrations/` (gồm
   `_supabase.sql`, `pooler.sql`) không chạy → Supavisor không bao giờ khởi động được.
   Đã sửa: xoá dòng đó khỏi `roles.sql` và ghi rõ lý do trong file.

**Bài học:** init script của Supabase phụ thuộc chéo nhau. Cắt một service thì phải rà
các file SQL còn lại xem có tham chiếu tới nó không.

## P1.9b — Migration baseline và tách role

```
Init chain: 6 init-scripts + 60 migrations, gồm 99-talosmine-roles.sql
Database:   _supabase, postgres
Role:       talosmine_migration | login=true | super=false | createrole=false
            talosmine_runtime   | login=true | super=false | createrole=false
Schema:     control_plane | owner=talosmine_migration
```

**Tách role được chứng minh, không phải khai báo:**

```
-- runtime thử tạo bảng:
ERROR:  permission denied for schema control_plane

-- migration thử tạo bảng:
CREATE TABLE
DROP TABLE
```

## P1.5 — Spike Supavisor transaction pinning ✅ PASS

Đây là **điều kiện cần của P5**: toàn bộ hard quota đứng trên giả định row lock trong
một transaction hoạt động qua pooler. Nếu giả định sai, phát hiện ở P5 sẽ tốn hơn nhiều lần.

Nối qua `supavisor:6543` (transaction mode), user dạng `<role>.<tenant>`:

```
=== pg_backend_pid() hai lần TRONG CÙNG transaction ===
BEGIN
 pid_lan_1 -> 498
 pid_lan_2 -> 498          <-- BẰNG NHAU => transaction pinning XÁC NHẬN
 current_user -> talosmine_runtime
COMMIT

=== isolation ===
 transaction_isolation -> read committed
```

**Kết luận:** Supavisor giữ nguyên một backend connection suốt transaction. Giả định nền
của P5 đứng vững. `prepare: false` (DEC-T09) vẫn bắt buộc vì connection được trả về pool
**giữa các transaction**.

## P1.9b (bổ sung) — `pnpm db:migrate` qua drizzle-kit trên DB SẠCH ✅

Lần trước migration chạy bằng `docker compose exec` + psql — chưa chứng minh drizzle-kit.
Nay chạy bằng đúng lệnh canonical DEC-T15 từ host, sau `down -v` (DB rỗng hoàn toàn):

```
schema control_plane TRƯỚC migrate  -> CHƯA CÓ
pnpm db:migrate                      -> [✓] migrations applied successfully!  EXIT=0
schema SAU migrate                   -> control_plane | owner=talosmine_migration
drizzle journal                      -> 1 | hash_len=64      (drizzle-kit thật sự chạy)
quyền database                       -> migration CREATE=true | runtime CREATE=false
rerun pnpm db:migrate                -> EXIT=0               (idempotent)
```

**Tách role, chứng minh lại trên DB sạch:**

```
runtime   CREATE TABLE -> ERROR: permission denied for schema control_plane
migration CREATE TABLE -> CREATE TABLE / DROP TABLE
```

### Overlay dev — vì sao tồn tại và vì sao không phải 5432

`docker-compose.yml` (baseline) cố ý 0 port (DEC-T10) — đúng cho production nhưng khiến
drizzle-kit trên host không tới được DB. `infra/compose/docker-compose.dev.yml` chỉ THÊM
`ports`, bind **127.0.0.1** (không phải 0.0.0.0), và **không bao giờ dùng ở production**.

Cổng chọn `55432`/`56543` chứ không phải `5432`/`6543` vì:

```
Get-NetTCPConnection -LocalPort 5432 -> PID 6836 (postgres) ĐANG CHẠY
```

Máy dev đã có PostgreSQL của **dự án khác**. Chiếm 5432 sẽ hoặc fail lúc `up`, hoặc tệ hơn
là làm công cụ trỏ nhầm database. Sau khi đổi cổng, đã xác minh PID 6836 vẫn giữ 5432 —
dự án kia không bị đụng.

## OpenAPI (DEC-T07) ✅

```
pnpm openapi:lint   -> Woohoo! Your API description is valid. 🎉   EXIT=0  (7 warning:
                       component của P2 chưa dùng — chấp nhận được)
pnpm openapi:types  -> contracts/openapi/generated/types.ts (177 dòng)  EXIT=0
pnpm openapi:drift  -> OK — type đã commit khớp với spec           EXIT=0
```

**Thử nghiệm âm bản — guard có biết fail không:**

```
1) baseline                                  -> EXIT=0
2) sửa spec hợp lệ, KHÔNG sinh lại type      -> EXIT=1   <-- GUARD BẮT ĐƯỢC
3) khôi phục                                 -> EXIT=0
```

Một guard chỉ đáng tin khi nó biết fail. Bước 2 chứng minh điều đó, chứ không chỉ dựa vào
việc bước 1 xanh.

Phạm vi spec ở P1 **chỉ có health**. Không khai endpoint nghiệp vụ nào vì chúng chưa tồn tại.

## CHƯA chạy được / còn lại của P1

Ghi trung thực, không tính vào phần đã đạt:

- [ ] `tests/` — đang viết ở lane `tester`. `pnpm test`, `pnpm test:e2e`,
      `pnpm test:concurrency` chưa chạy.
- [ ] `infra/caddy/Caddyfile` và `.github/workflows/` (4 job DEC-T13) — đang viết ở lane
      `orchestrator(infra,CI)`.
- [ ] `pnpm install --frozen-lockfile` trên **clean clone** — chưa kiểm.
      `allowBuilds` trong `pnpm-workspace.yaml` đã chốt (`esbuild`/`sharp` = true;
      `ssh2`/`cpu-features`/`protobufjs` = false vì chỉ cần khi nói chuyện với Docker
      daemon qua SSH — ta dùng npipe/unix socket). Cần clean-clone để xác nhận.
- [ ] P1.12 integration từ clean clone, P1.13 QA/reviewer độc lập — chưa chạy.
- [ ] Dockerfile cho web/control-plane — đang viết ở lane infra.

**P1 chưa `verified`.** Exit gate mục 18 yêu cầu đủ 9 điều kiện. Phần runtime/DB/contract
đã có evidence thật; còn thiếu tests, Caddy, CI và clean-clone evidence.

## Lệch khỏi plan cần record

1. **CSP có thêm `script-src` + nonce.** DEC-T12 không nhắc `script-src`; với
   `default-src 'self'` trần thì Next App Router không hydrate được (nó chèn script inline
   để truyền RSC payload). Nonce là **thắt chặt** chứ không nới — không wildcard, không
   `'unsafe-inline'` cho script. Cần một record bổ sung DEC-T12, chưa tự coi là đã duyệt.
2. **`useImportType` tắt cho `apps/control-plane`.** Biome đề xuất đổi
   `import { HealthService }` thành `import type` — nếu làm theo, `emitDecoratorMetadata`
   mất tham chiếu runtime và **DI của NestJS vỡ lúc khởi động**. Đây là fix mà linter gọi
   là "safe" nhưng thực tế phá app.
3. **`module: Node16`** thay `CommonJS`/`Node10` cho control-plane: `node10` đã deprecated
   và sẽ ngừng hoạt động ở TS 7. Output vẫn là CommonJS (đã kiểm: `"use strict"; require(...)`).
