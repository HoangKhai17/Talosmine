# Talosmine

Hub tập trung: một tài khoản dùng chung cho nhiều ứng dụng, với entitlement và quota
quản lý tập trung. Kiến trúc Control Plane (Hub) + Data Plane (từng app).

> **Trạng thái:** bộ sườn chạy được, cộng một bản demo sản phẩm (15 công cụ nhúng) và
> kết nối ví Cardano. Identity/catalog/plan/quota còn ở P2–P5.
> Xem [`docs/build-plan/`](docs/build-plan/).

---

## Cách 1 — Chạy toàn bộ bằng Docker (dùng cho server)

Một lệnh dựng hết: database, pooler, Logto, migration, API, worker, web, reverse proxy.
**Không cần cài Node hay pnpm trên server.**

```bash
git clone <repo> talosmine && cd talosmine
cp .env.example .env      # rồi điền giá trị thật — xem bảng bên dưới
docker compose -f infra/compose/docker-compose.yml --env-file .env up -d --build
```

Xong. Mở `https://talosmine.localhost` (hoặc domain bạn đặt ở `TALOSMINE_SITE_ADDRESS`).

### Thứ tự khởi động — compose tự lo, không phải gõ tay

```
db (healthy) ──▶ supavisor (healthy) ──▶ ┌─ control-plane ─┐
   └──────────▶ migrate (chạy xong, thoát) ┴─ worker ───────┴──▶ web ──▶ caddy
```

`migrate` là service **chạy một lần rồi thoát**. `control-plane`, `worker` và `web` chờ nó
thoát mã 0 mới khởi động (`service_completed_successfully`). Vì vậy **không còn bước
`pnpm db:migrate` chạy tay** như trước.

Thấy `talosmine-migrate` ở trạng thái `Exited (0)` là **đúng**, không phải hỏng.

### Biến môi trường

| Biến | Bắt buộc | Ghi chú |
|---|---|---|
| `POSTGRES_PASSWORD` | ✅ | mật khẩu superuser PostgreSQL |
| `TALOSMINE_MIGRATION_PASSWORD` | ✅ | role có quyền DDL — chỉ `migrate` dùng |
| `TALOSMINE_RUNTIME_PASSWORD` | ✅ | role của app, **không** có CREATE/ALTER/DROP |
| `SECRET_KEY_BASE`, `VAULT_ENC_KEY`, `JWT_SECRET` | ✅ | Supavisor |
| `LOGTO_DB_PASSWORD` | ✅ | database riêng của Logto |
| `TALOSMINE_SITE_ADDRESS` | | domain công khai. Mặc định `talosmine.localhost` |
| `TALOSMINE_HTTP_PORT` / `TALOSMINE_HTTPS_PORT` | | mặc định 80/443 — xem cạm bẫy bên dưới |
| `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_AUDIENCE` | | **thiếu thì không đăng nhập được**, phần còn lại vẫn chạy |
| `APP_BASE_URL` | | URL công khai của web — dùng cho redirect OIDC |
| `CATALOG_ALLOWED_HOSTS` | | allowlist host cho ảnh/URL do admin nhập |

> **Biến rỗng khác với biến không có.** Trong `docker-compose.yml`, các biến tuỳ chọn khai
> theo dạng `OIDC_ISSUER_URL:` (không có giá trị) — nghĩa là "lấy từ môi trường, thiếu thì
> thôi". Viết `${OIDC_ISSUER_URL:-}` sẽ luôn đặt biến với chuỗi **rỗng**, mà schema env dùng
> `z.url()` — chuỗi rỗng không phải "không có", nó là giá trị *sai*, và container chết ngay
> lúc khởi động. Đã dính đúng lỗi này.

### URL nội bộ ≠ URL trong `.env`

`DATABASE_URL` trong `.env` trỏ `127.0.0.1` — đúng khi bạn chạy app **trên host**, sai khi
app chạy **trong container** (ở đó `127.0.0.1` là chính container đó).

Vì vậy compose **dựng lại** connection string từ mật khẩu, dùng hostname của service
(`db`, `supavisor`). Không tái dùng `${DATABASE_URL}`. Đừng "sửa cho gọn" chỗ đó.

### Cạm bẫy đã gặp thật

| Triệu chứng | Nguyên nhân |
|---|---|
| Caddy không khởi động được, báo bind cổng 80 | Trên Windows, `HTTP.sys` (PID 4) giữ sẵn cổng 80. Đặt `TALOSMINE_HTTP_PORT=8080` và `TALOSMINE_HTTPS_PORT=8443` |
| Mọi URL trả 308 | Caddy tự chuyển HTTP sang HTTPS. Gọi qua `https://` |
| Ảnh trong `/demo-tools/` trả 404 **chỉ ở bản container** | `web.Dockerfile` phải `COPY apps/web/public`. Đã sửa — nhưng đây là lớp lỗi dễ tái phát khi thêm thư mục tĩnh mới |
| `talosmine-worker` khởi động lại liên tục | Worker chưa có job nên event loop rỗng và tiến trình thoát. Đã sửa bằng handle giữ sống trong `main-worker.ts`; gỡ nó khi P5 thêm job thật |

### Lệnh vận hành

```bash
# Xem trạng thái
docker compose -f infra/compose/docker-compose.yml --env-file .env ps

# Log một service
docker compose -f infra/compose/docker-compose.yml --env-file .env logs -f control-plane

# Deploy phiên bản mới (build lại + áp migration mới)
git pull
docker compose -f infra/compose/docker-compose.yml --env-file .env up -d --build

# Dừng (GIỮ dữ liệu)
docker compose -f infra/compose/docker-compose.yml --env-file .env down

# Cấp quyền quản trị cho một tài khoản (chạy sau khi người đó đã đăng nhập lần đầu)
docker compose -f infra/compose/docker-compose.yml --env-file .env \
  run --rm migrate node_modules/.bin/tsx src/cli/grant-admin.ts --account <uuid>
```

> `down -v` xoá cả volume, tức xoá **toàn bộ database**. Không có bước hỏi lại.

### Chỉ Caddy được expose

`web`, `control-plane`, `worker`, `db`, `supavisor`, `logto` **không publish cổng nào** ra
host — chúng chỉ nói chuyện với nhau qua network nội bộ. Đây là quyết định bảo mật
(DEC-T11), không phải sở thích topology: `db` và `supavisor` là đường vào thẳng PostgreSQL,
vòng qua toàn bộ enforcement entitlement/quota của Control Plane.

Thêm `ports:` cho bất kỳ service nào khác là **stop condition**, kể cả "chỉ để debug".

---

## Cách 2 — Chạy để phát triển (trên máy cá nhân)

Cần Node và pnpm trên máy, đổi lại có hot reload.

```bash
# Kích hoạt Node 24.18.0 CHỈ cho shell hiện tại (không đổi Node toàn máy)
. .\scripts\use-node.ps1     # PowerShell — chú ý dấu chấm đầu dòng
source ./scripts/use-node.sh # Git Bash

node --version   # phải ra v24.18.0
pnpm --version   # phải ra 11.13.1

cp .env.example .env
cp .env.dev.example .env.dev
pnpm install
```

> **Vì sao không `nvm use`:** nvm-windows cho mỗi bản Node một kho global riêng.
> `nvm use 24.18.0` sẽ làm biến mất các CLI global đang cài dưới bản Node hiện tại và đổi
> Node của mọi dự án khác trên máy. Chi tiết: `DEC-T17` trong
> [decision register](docs/build-plan/decision-register.md).

```bash
# 1. Bật hạ tầng (database + pooler + Logto), KHÔNG bật app
docker compose -f infra/compose/docker-compose.yml \
               -f infra/compose/docker-compose.dev.yml --env-file .env up -d db supavisor logto

# 2. Áp migration
pnpm db:migrate

# 3. Chạy app trên host
pnpm dev:web      # http://localhost:3000
pnpm dev:api      # cổng theo API_PORT trong .env.dev
pnpm dev:worker
```

Hoặc gọn hơn: `.\scripts\dev.ps1` (chạy web + API sau khi Docker đã bật).

> Overlay `docker-compose.dev.yml` bind **127.0.0.1:15433** (PostgreSQL), **127.0.0.1:16543**
> (Supavisor) và **3001/3002** (Logto). Không dùng 5432/6543 vì máy dev thường đã có
> PostgreSQL của dự án khác; và cố ý **dưới 49152** để Windows/Hyper-V không đặt gạch mất
> cổng sau mỗi lần khởi động máy. Overlay này **chỉ dùng ở máy cá nhân**.

> ⚠️ **`.env` và `.env.dev` là hai file khác nhau và dễ lệch.** Lệnh dev đọc `.env.dev`, còn
> Docker đọc `.env`. Nếu đổi cổng database ở một file, phải đổi ở cả hai — không thì migration
> chạy tay sẽ nhắm vào database khác mà không báo gì.

---

## Lệnh

| Lệnh | Việc |
|---|---|
| `pnpm typecheck` | TypeScript strict, toàn workspace |
| `pnpm lint` | Biome (lint + format check) |
| `pnpm format` | Biome tự sửa format |
| `pnpm build` | Build web + control-plane |
| `pnpm test` | Vitest — unit + integration |
| `pnpm test:e2e` | Playwright — tự build và start app, tự tắt |
| `pnpm test:concurrency` | Concurrency trên PostgreSQL thật (testcontainers) |
| `pnpm db:migrate` | Áp migration (role migration, nối thẳng PostgreSQL) |
| `pnpm db:generate` | Sinh migration từ schema |
| `pnpm db:studio` | Drizzle Studio — quản trị DB cục bộ |
| `pnpm openapi:lint` | Validate `contracts/openapi/control-plane.v1.yaml` |
| `pnpm openapi:types` | Sinh type TypeScript từ spec |
| `pnpm openapi:drift` | Fail nếu type đã commit lệch spec |

---

## Cấu trúc

```
apps/web/              Next.js — UI + BFF. Giữ session server-side;
                       browser KHÔNG bao giờ cầm M2M credential.
  app/[locale]/(user)/ trải nghiệm user (song ngữ vi/en)
  app/admin/           quản trị — deny mặc định ở SERVER (403), hai lớp
  app/auth/            luồng OIDC tới Logto
  components/wallet/   kết nối ví Cardano (CIP-30 qua Mesh SDK)
  components/tools/    khung nhúng công cụ bên thứ ba
  public/              tài sản tĩnh — PHẢI được copy vào image, xem web.Dockerfile

apps/control-plane/    NestJS + Fastify — nguồn sự thật về identity/entitlement/quota
  src/main-api.ts      entrypoint API
  src/main-worker.ts   entrypoint worker — CÙNG AppModule, không mở port nào
  src/cli/             công cụ vận hành (cấp quyền admin)
  drizzle/migrations/  migration, forward-only

apps/logto-ui/         giao diện đăng nhập, mount đè lên Logto
contracts/openapi/     Spec VIẾT TAY là nguồn sự thật (không sinh từ code)
tests/                 unit + integration + concurrency + e2e
infra/compose/         toàn bộ stack + overlay dev
infra/caddy/           reverse proxy — container DUY NHẤT expose ra ngoài
infra/docker/          Dockerfile web và control-plane (có stage `migrate` riêng)
```

**API và worker không phải hai microservice** — hai entrypoint, một codebase, chung
application port, **chung một image** chỉ khác `command`.

---

## Tài liệu

| File | Nội dung |
|---|---|
| [`docs/index.md`](docs/index.md) | Kiến trúc logic |
| [`docs/modular.md`](docs/modular.md) | Đặc tả module và application port |
| [`docs/database-schema.md`](docs/database-schema.md) | Physical schema PostgreSQL |
| [`docs/stack-tech.md`](docs/stack-tech.md) | Tech stack đã duyệt |
| [`docs/build-plan/decision-register.md`](docs/build-plan/decision-register.md) | **Mọi quyết định, version pin, tên lệnh** |
| [`docs/build-plan/catalyst-demo.md`](docs/build-plan/catalyst-demo.md) | Bản demo, và **nợ giấy phép nhúng Omni Calculator** |
| [`docs/build-plan/pending-work.md`](docs/build-plan/pending-work.md) | Nợ kỹ thuật đang mở |
| [`AGENTS.md`](AGENTS.md) | Quy trình agent |

Cần biết version của một package? Đọc **bảng D** của decision register — đó là nguồn sự
thật duy nhất. Đừng nâng version vì "có bản mới".
