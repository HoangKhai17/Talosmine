# Talosmine

Hub tập trung: một tài khoản dùng chung cho nhiều ứng dụng, với entitlement và quota
quản lý tập trung. Kiến trúc Control Plane (Hub) + Data Plane (từng app).

> **Trạng thái: P1 — bộ sườn.** Có shell chạy được, chưa có business feature nào.
> Identity/catalog/plan/quota thuộc P2–P5. Xem [`docs/build-plan/`](docs/build-plan/).

## Chuẩn bị môi trường (làm một lần)

Dự án dùng **Node 24.18.0** — không phải Node global của máy bạn.

```bash
# Kích hoạt Node 24.18.0 CHỈ cho shell hiện tại (không đổi Node toàn máy)
. .\scripts\use-node.ps1     # PowerShell — chú ý dấu chấm đầu dòng
source ./scripts/use-node.sh # Git Bash

node --version   # phải ra v24.18.0
pnpm --version   # phải ra 11.13.1
```

> **Vì sao không `nvm use`:** nvm-windows cho mỗi bản Node một kho global riêng.
> `nvm use 24.18.0` sẽ làm biến mất các CLI global đang cài dưới bản Node hiện tại
> (`opencode`, `claude`, `gemini`, `bun`, `yarn`) và đổi Node của mọi dự án khác trên máy.
> Chi tiết: `DEC-T17` trong [decision register](docs/build-plan/decision-register.md).

```bash
cp .env.example .env    # rồi điền giá trị thật; .env không bao giờ được commit
pnpm install
```

## Chạy hằng ngày

```bash
# 1. Bật database (Supabase self-hosted rút gọn: chỉ PostgreSQL + Supavisor)
docker compose -f infra/compose/docker-compose.yml \
               -f infra/compose/docker-compose.dev.yml --env-file .env up -d

# 2. Áp migration
pnpm db:migrate

# 3. Chạy app
pnpm dev:web      # http://localhost:3000
pnpm dev:api      # http://localhost:3001
pnpm dev:worker
```

> Overlay `docker-compose.dev.yml` bind **127.0.0.1:55432** (PostgreSQL) và
> **127.0.0.1:56543** (Supavisor). Không phải 5432/6543 vì máy dev đã có PostgreSQL của
> dự án khác giữ cổng đó. Overlay này **chỉ dùng ở máy cá nhân** — production không
> publish port nào ngoài Caddy.

## Lệnh

| Lệnh | Việc |
|---|---|
| `pnpm typecheck` | TypeScript strict, toàn workspace |
| `pnpm lint` | Biome (lint + format check) |
| `pnpm format` | Biome tự sửa format |
| `pnpm build` | Build web + control-plane (api và worker) |
| `pnpm test` | Vitest — unit + integration |
| `pnpm test:concurrency` | Concurrency trên PostgreSQL thật (testcontainers) |
| `pnpm db:migrate` | Áp migration (role migration, nối thẳng PostgreSQL) |
| `pnpm db:generate` | Sinh migration từ schema |
| `pnpm db:studio` | Drizzle Studio — quản trị DB cục bộ |
| `pnpm openapi:lint` | Validate `contracts/openapi/control-plane.v1.yaml` |
| `pnpm openapi:types` | Sinh type TypeScript từ spec |
| `pnpm openapi:drift` | Fail nếu type đã commit lệch spec |
| `pnpm dev:web` / `dev:api` / `dev:worker` | Dev server |

`pnpm test:e2e` **chưa dùng được** — Playwright chưa cài. Bản nháp config và spec nằm ở
[`docs/build-plan/parked/`](docs/build-plan/parked/), chờ làm ở một lượt riêng.

## Cấu trúc

```
apps/web/              Next.js — UI + BFF. Giữ session server-side;
                       browser KHÔNG bao giờ cầm M2M credential.
  app/(user)/          trải nghiệm user
  app/admin/           quản trị — deny mặc định ở SERVER (403), hai lớp
  app/auth/            placeholder cho SSO ở P2

apps/control-plane/    NestJS + Fastify — nguồn sự thật về identity/entitlement/quota
  src/main-api.ts      entrypoint API
  src/main-worker.ts   entrypoint worker — CÙNG AppModule, không mở port nào
  src/shared/          env (fail-fast), error envelope, correlation, database
  drizzle/migrations/  migration, forward-only

contracts/openapi/     Spec VIẾT TAY là nguồn sự thật (không sinh từ code)
tests/                 unit + integration + concurrency
infra/compose/         Supabase rút gọn + overlay dev
infra/caddy/           reverse proxy — container DUY NHẤT expose ra ngoài
infra/docker/          Dockerfile web và control-plane
```

**API và worker không phải hai microservice** — hai entrypoint, một codebase, chung
application port.

## Tài liệu

| File | Nội dung |
|---|---|
| [`docs/index.md`](docs/index.md) | Kiến trúc logic |
| [`docs/modular.md`](docs/modular.md) | Đặc tả module và application port |
| [`docs/database-schema.md`](docs/database-schema.md) | Physical schema PostgreSQL |
| [`docs/stack-tech.md`](docs/stack-tech.md) | Tech stack đã duyệt |
| [`docs/build-plan/decision-register.md`](docs/build-plan/decision-register.md) | **Mọi quyết định, version pin, tên lệnh** |
| [`docs/build-plan/evidence-p1.md`](docs/build-plan/evidence-p1.md) | Cái gì đã chạy thật, cái gì chưa |
| [`AGENTS.md`](AGENTS.md) | Quy trình agent |

Cần biết version của một package? Đọc **bảng D** của decision register — đó là nguồn sự
thật duy nhất. Đừng nâng version vì "có bản mới".
