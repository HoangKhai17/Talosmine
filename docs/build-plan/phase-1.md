# Phase 1 — Bootstrap và foundation

## 1. Trạng thái

`not_started` — **đã được mở**. Cổng P0→P1 đạt 2026-07-17; toàn bộ technical decision gate của phase này đã chốt tại [`decision-register.md`](./decision-register.md) nhóm A.

Đây là canonical phase status; `TẮC`/`CẠN LƯỢT` nếu xảy ra chỉ là verification outcome metadata. Trước phase này repo chưa có `package.json`, workspace config, script build/test/lint hay bất kỳ command nào — mọi lệnh trong file này **sẽ tồn tại sau bước P1.7**, và chỉ được coi là chạy được khi có evidence ở P1.13.

## 2. Mục tiêu

Tạo foundation tối thiểu, reproducible và an toàn cho monorepo theo stack đã duyệt: một Next.js Web/BFF responsive; một NestJS/Fastify Control Plane modular monolith với API và worker dùng chung code; PostgreSQL trong Supabase self-hosted; Drizzle migration baseline; OpenAPI/error/correlation baseline; container và CI.

Phase chỉ tạo shell/foundation. **Không** business feature.

## 3. Prerequisites và human decisions

### Prerequisite — đã đạt

- [x] Cổng P0→P1 `verified` (2026-07-17).
- [x] Baseline stack tại `../stack-tech.md` không thay đổi.
- [x] Target layout tại [`README.md`](./README.md) được review.

### Technical decisions — đã chốt

Bản trước để trống toàn bộ bảng này, khiến P1 không thể bắt đầu. Nay đã chốt; chi tiết và lý do tại [`decision-register.md`](./decision-register.md).

| Hạng mục | Đã chốt | Record |
|---|---|---|
| Node | **24.18.0** (Krypton, Active LTS) | DEC-T01 |
| Package manager | **pnpm 11.13.1** qua corepack, `pnpm-workspace.yaml` | DEC-T02 |
| TypeScript | **5.9.3** — cố ý không dùng 7.0.2 | DEC-T03 |
| Lint/format | **Biome 2.5.4** | DEC-T04 |
| Test | **Vitest 4.1.10**, **Playwright 1.61.1**, **testcontainers 12.0.4** | DEC-T05 |
| UUIDv7 | **`uuidv7@1.2.1`**, sinh ở application layer | DEC-T06 |
| OpenAPI | **spec-first**, `@redocly/cli@2.39.0` + `openapi-typescript@7.13.0` | DEC-T07 |
| Auth0 SDK | **`@auth0/nextjs-auth0@4.25.0`** (web), **`jose@6.2.3`** (verify) | DEC-T08 |
| DB driver | **`postgres@3.4.9`** với `prepare: false` + Drizzle | DEC-T09 |
| Supabase | official compose tag **`v1.26.07`**, pin theo digest | DEC-T10 |
| Caddy | **`caddy:2-alpine`**, local hostname `talosmine.localhost` | DEC-T11 |
| Image/CSP/proxy | CSP `default-src 'self'`, ảnh qua Next image proxy | DEC-T12 |
| CI | 4 job: `quality`, `test`, `db`, `build` | DEC-T13 |
| Tên script | Bảng canonical | DEC-T15 |
| Sample app runtime | **Deferred P6** — P1 không chọn | DEC-B02 |

### Còn chặn (nhưng không chặn P1)

- `‹cần chốt: DEC-B03 Auth0 tenant/issuer/audience›` — P1 **chỉ tạo config boundary và biến env rỗng**, không wiring Auth0 thật. Wiring thật là P2.
- `‹cần chốt: DEC-B01 danh sách app›` — không liên quan bootstrap.

### Cảnh báo môi trường

Máy dev hiện chạy **Node v25.2.1**, không phải LTS. Bước P1.3 phải chuyển sang **24.18.0** trước khi install; nếu không, lockfile và CI sẽ lệch.

## 4. Phạm vi

- Bootstrap workspace pnpm + strict TypeScript + script thật.
- `apps/web`: Next.js 16 responsive, route group `(user)`, `admin`, `auth`, BFF boundary.
- `apps/control-plane`: NestJS 11 + Fastify adapter, entrypoint `main-api` và `main-worker` dùng chung code.
- Module-boundary convention theo `../modular.md`; không repository/query xuyên module, không HTTP loopback nội bộ.
- Supabase self-hosted compose **rút gọn**: bắt buộc `db` + `supavisor`; Studio theo nhánh (a)/(b) do P1.10 quyết bằng thực nghiệm (DEC-T10). Private network, pin digest.
- Caddy skeleton; không public Supabase/Studio/Supavisor.
- `.env.example` + env schema validate bằng zod; không secret.
- Tách role migration và role runtime, least privilege.
- Drizzle baseline tạo schema `control_plane`.
- Liveness/readiness với semantics rõ.
- OpenAPI 3.1 skeleton, versioning `/v1`, error envelope, correlation ID.
- GitHub Actions + GHCR.
- Spike Supavisor transaction pinning — **điều kiện cần cho P5**.

## 5. Ngoài phạm vi

- Identity/account/admin business flow, Auth0 login hoạt động, RBAC (P2).
- Catalog (P3), plan/subscription/entitlement (P4), quota/reconciliation (P5).
- Sample Data Plane hoặc E2E (P6), app còn lại (P7), production DR (P8), billing (P9).
- Triển khai 25 domain tables. P1 chỉ tạo schema/role/grant nền.
- Business user/admin page; shell không giả lập dữ liệu/quyền.
- Mobile/native, API gateway, Redis ledger, outbox, tách worker thành microservice.
- Thêm library ngoài bảng D của register.

## 6. Deliverables

- Workspace pnpm + lockfile + script thật cho install/dev/build/lint/typecheck/test/migrate/compose.
- Next.js shell responsive user/admin/auth/BFF, không business capability.
- NestJS/Fastify modular shell, API + worker chung code.
- OpenAPI 3.1 skeleton + error/correlation convention + drift test.
- Drizzle migration baseline `control_plane` + role tách quyền + migration smoke.
- Compose Supabase rút gọn pin digest + Caddy + `.env.example` không secret.
- Health liveness/readiness.
- CI 4 job + GHCR wiring an toàn khi thiếu credential.
- Evidence spike Supavisor transaction pinning.
- Command reference sinh từ script thật + clean-clone bootstrap evidence.

## 7. Target paths

```text
.nvmrc                              # 24.18.0
package.json                        # root, packageManager: pnpm@11.13.1
pnpm-workspace.yaml
pnpm-lock.yaml
tsconfig.base.json                  # strict
biome.json
vitest.workspace.ts
.env.example
apps/web/
  app/(user)/
  app/admin/
  app/auth/
  next.config.ts
apps/control-plane/
  src/main-api.ts
  src/main-worker.ts
  src/modules/
  src/shared/                       # error envelope, correlation, env schema
  drizzle/migrations/
  drizzle.config.ts
contracts/openapi/
  control-plane.v1.yaml
  generated/types.ts
integrations/
tests/
infra/compose/
  docker-compose.yml
  IMAGE-PINS.md
infra/caddy/
  Caddyfile
.github/workflows/
```

Canonical path không đổi xuyên plan: `apps/control-plane/drizzle/migrations/`, `apps/control-plane/src/main-api.ts`, `apps/control-plane/src/main-worker.ts`, `.github/workflows/`.

## 8. DB/migration

- Compose Supabase **rút gọn theo DEC-T10**. Bắt buộc giữ `db` (tên service của PostgreSQL — **không phải** `postgres`) và `supavisor`. Loại `auth`/`rest`/`realtime`/`storage`/`imgproxy`/`functions`/`deno-cache`: dự án dùng Auth0 nên GoTrue thừa, và PostgREST sẽ mở một đường vào DB thứ hai vòng qua toàn bộ enforcement của Control Plane — loại nó là quyết định bảo mật.
- **Studio là câu hỏi mở P1.10 phải trả lời bằng thực nghiệm** (DEC-T10): `studio` phụ thuộc `meta` *và* `kong`, nên không thể giữ Studio mà bỏ Kong trọn vẹn. Chọn (a) `db+supavisor+studio+meta+kong` hoặc (b) `db+supavisor` rồi dùng `pnpm db:studio`. Nếu chọn (b) thì phải cập nhật `../stack-tech.md` và ghi record superseding, không âm thầm lệch khỏi stack đã duyệt.
- Mọi image pin **digest**, ghi ở `infra/compose/IMAGE-PINS.md`. Không tag trôi.
- Không service nào publish port ra host. Chỉ Caddy expose.
- **Runtime** nối PostgreSQL qua **Supavisor**, driver `postgres.js` với `prepare: false` (DEC-T09).
- **Migration** nối **trực tiếp PostgreSQL**, không qua Supavisor, bằng role migration riêng.
- **Spike bắt buộc (P1.5):** chứng minh transaction pinning, DB clock, row lock, isolation level trên pooling mode đã chọn. Cấm session-level advisory lock, temp table, session state. Spike fail → **TẮC**, và P5 không được build.
- Baseline migration tạo schema `control_plane` + role/grant tối thiểu. **Không** tạo 25 bảng.
- Runtime role không có `CREATE`, `ALTER`, `DROP`, không disable trigger, không quyền Studio/migration.
- Migration smoke từ DB sạch: apply, inspect schema/grant, rerun theo policy, kiểm failure không để state mơ hồ.
- Rollback chỉ cho baseline chưa nhận traffic/data; sau write ưu tiên forward-fix.

## 9. Backend API

- NestJS 11 + Fastify adapter, TypeScript strict, modular-monolith boundary.
- Prefix `/v1`. Browser auth route chưa implement ở P1.
- OpenAPI 3.1: file viết tay là nguồn sự thật; `pnpm openapi:lint` validate; `pnpm openapi:drift` chặn lệch.
- Error envelope:

  ```json
  {
    "code": "MACHINE_READABLE_CODE",
    "message": "Safe message",
    "correlationId": "00000000-0000-0000-0000-000000000000",
    "details": {}
  }
  ```

  Ví dụ chỉ mô tả shape; không khẳng định endpoint/ID thực tế.
- Fastify hook nhận hoặc tạo `X-Correlation-Id`, validate format, trả header/envelope, truyền vào structured context. Không log secret/token.
- **Liveness** chỉ chứng minh process/event loop đáp ứng — không chạm DB. **Readiness** phản ánh dependency bắt buộc. Health không lộ config/secret/topology.
- `main-worker` khởi tạo cùng module/application code nhưng **không expose public API** và **không đọc table trực tiếp** — chỉ gọi application port.
- Env validate bằng zod lúc khởi động; thiếu biến bắt buộc thì **fail fast**, không chạy với default ngầm.

## 10. User web

- Một Next.js codebase responsive cho desktop, điện thoại, máy tính bảng.
- `(user)`: app/layout shell, navigation placeholder trung tính, loading/error/not-found. **Không** catalog, plan, usage hay fake account.
- `auth`: chỉ route/boundary placeholder cho P2. Không tuyên bố login/callback/logout hoạt động.
- BFF server boundary scaffold để browser không bao giờ giữ M2M credential.
- CSP theo DEC-T12: `default-src 'self'`, `img-src 'self' data:`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`.
- `next.config.ts` **không** khai `remotePatterns` mở.
- Accessibility foundation: semantic landmark, keyboard/focus, reduced-motion, contrast, error announcement.

## 11. Admin web

- `admin` nằm trong cùng codebase, không tạo app admin thứ hai.
- Shell có server-side guard **deny mặc định**. P2 chưa có identity/RBAC nên P1 **không cấp quyền admin** và **không tạo bypass hay dev super-admin**.
- Mọi route/action/handler admin đi qua guard contract. Ẩn menu client-side chỉ là UX, không phải authorization.
- Không form mutation, không dashboard dữ liệu, không role giả.

## 12. Integration/security

- Trust boundary được tài liệu hóa: browser ↔ BFF, BFF ↔ Control Plane, Control Plane ↔ PostgreSQL/Supavisor, Caddy ↔ private service, CI ↔ GHCR.
- `.env.example` chỉ có tên biến, mô tả và placeholder rõ ràng là giả. Secret thật không commit, không bake vào image, không log, không vào client bundle.
- CORS/origin/CSP/image theo DEC-T12. Không wildcard "cho tiện dev".
- Caddy chỉ route web/API. Supabase endpoint không public.
- Container chạy least privilege, read-only filesystem khi khả thi. Image provenance/digest được ghi.
- Dependency pin + lockfile; generated OpenAPI type có drift test.
- **Auth0 wiring thật deferred P2.** P1 chỉ tạo config boundary; không dùng shared/example credential có hiệu lực.

## 13. Contract freeze

Trước khi các lane code song song, orchestrator lập manifest file-level owner; architect chỉ review/freeze, không write:

1. ~~Runtime/tool decisions~~ — đã chốt tại register nhóm A, không cần freeze lại.
2. Monorepo path, workspace/module boundary, manifest ánh xạ từng file/glob sang **đúng một** writer.
3. Script semantics theo DEC-T15. Command chỉ được ghi là chạy được sau khi tồn tại và được chạy.
4. Health endpoint/semantics, OpenAPI artifact, error envelope, correlation behavior.
5. Env variable contract, port/network exposure, DB role, migration lifecycle.
6. User/admin/auth/BFF shell route; admin deny-by-default server guard.
7. CI job/artifact/cache/GHCR behavior; `infra/**`, `.github/workflows/**` và root config cần approval cụ thể của chủ dự án ở P1.2.

Mỗi shared/root file và `contracts/openapi/**` có **đúng một** writer. Contract đổi sau freeze cần versioned note, impact review và re-freeze.

## 14. Tests

Tool đã chốt (DEC-T05). Baseline phải có:

- Clean install từ lockfile + clean-clone bootstrap.
- `pnpm typecheck` strict; `pnpm lint`; production build web/API/worker.
- Unit: error envelope, correlation validation, env schema fail-fast.
- Web smoke (Playwright): `(user)` render; direct `admin` bị deny **server-side**; loading/error/not-found; keyboard/focus; viewport desktop/tablet/mobile.
- API: liveness/readiness; error không lộ stack/secret; correlation propagation.
- Worker: startup/shutdown; không mở public port; chỉ dùng application port.
- Compose: `docker compose config` validate; kiểm không service nào publish port ngoài Caddy; container health.
- Migration smoke từ DB sạch với role tách quyền; runtime role **không** `CREATE/ALTER/DROP`.
- **Spike Supavisor**: transaction pinning/isolation/row-lock. Đây là evidence kỹ thuật, **chưa phải** hard-quota test.
- OpenAPI: `pnpm openapi:lint` + `pnpm openapi:drift`.
- Secret scan trong source, env example, image metadata, CI log.

Hard-quota/load scenario nằm P5. Sample Data Plane E2E nằm P6.

## 15. Ordered steps

Thứ tự: approval path điều kiện → contract freeze → bootstrap workspace → parallel impl (frontend ║ backend ║ tester) → infra/CI → integration từ clean clone → QA/reviewer → docs.

**Runbook là kế hoạch. Evidence chỉ có sau khi chạy thật.** Không bước nào được đánh dấu "đã chạy" ở thời điểm này. Mọi version lấy từ register bảng D; mọi tên lệnh lấy từ DEC-T15.

**P1.1 — Xác nhận cổng P0→P1**
- Hành động: xác nhận cổng P0→P1 `verified` và register nhóm A đầy đủ; xác nhận không còn technical gate nào mở.
- Sản phẩm: không tạo file; ghi nhận trong `docs/build-plan/`.
- Phụ thuộc: cổng P0→P1.
- Verify: register nhóm A không còn record `open`/`proposed` nào chặn P1; DEC-B03 (Auth0 tenant) được xác nhận là **không** chặn P1 vì P1 chỉ tạo config boundary.
- Lane: `orchestrator`; `architect` review.

**P1.2 — Xin approval cho path điều kiện**
- Hành động: xin chủ dự án phê duyệt cụ thể việc tạo/sửa `infra/**`, `.github/workflows/**` và root workspace/config trong P1.
- Sản phẩm: approval record; chưa tạo file.
- Phụ thuộc: P1.1.
- Verify: có approval tường minh mới mở P1.7 và P1.10; thiếu thì hai bước đó giữ `blocked`.
- Lane: `orchestrator`.

**P1.3 — Chuẩn bị môi trường Node**
- Hành động: cài Node **24.18.0**; tạo `.nvmrc` chứa `24.18.0`; bật corepack và khóa pnpm **11.13.1**.
- Sản phẩm: `.nvmrc`; môi trường dev (chưa phải file repo khác).
- Phụ thuộc: P1.2.
- Verify: `node --version` trả `v24.18.0` (**hiện máy đang là v25.2.1 — phải đổi**); `corepack enable` xong thì `pnpm --version` trả `11.13.1`.
- Lane: `orchestrator`.

**P1.4 — Contract freeze + manifest file-level owner**
- Hành động: orchestrator lập manifest gán **đúng một** writer cho từng shared/root file và `contracts/openapi/**`; architect review/freeze các mục tại mục 13.
- Sản phẩm: ownership manifest + freeze record dưới `docs/build-plan/`.
- Phụ thuộc: P1.3.
- Verify: mỗi shared/root/OpenAPI file có đúng một writer; architect chỉ review/freeze, không write; đủ 7 mục freeze.
- Lane: `orchestrator` (manifest) + `architect` (freeze).

**P1.5 — Spike Supavisor transaction pinning**
- Hành động: dựng PostgreSQL + Supavisor tạm; chạy transaction thử qua pooler; đo transaction pinning, isolation level, row lock, DB clock. Xác nhận `prepare: false` là bắt buộc.
- Sản phẩm: spike evidence record dưới `docs/build-plan/`; assumption dùng cho P1.10.
- Phụ thuộc: P1.3.
- Verify: mở transaction qua Supavisor, chạy nhiều statement, xác nhận **cùng một backend connection** giữ suốt transaction; `SHOW transaction_isolation` trả mức đã duyệt; hai transaction đồng thời `SELECT ... FOR UPDATE` cùng row phải serialize. Nếu pinning không đảm bảo → **TẮC**, và P5 không được build.
- Lane: `backend` (DB behavior) + `orchestrator` (infra); `architect` review.
- **Vì sao bước này quan trọng:** toàn bộ hard quota ở P5 đứng trên giả định row lock trong một transaction hoạt động qua pooler. Nếu giả định sai, phát hiện ở P5 sẽ tốn hơn nhiều lần.

**P1.6 — Chốt Caddy topology local**
- Hành động: chốt hostname `talosmine.localhost`, routing tới web/API, TLS nội bộ Caddy; ghi assumption private-network.
- Sản phẩm: topology note dưới `docs/build-plan/`; dùng ở P1.10.
- Phụ thuộc: P1.5.
- Verify: topology chỉ expose web/API; Supabase/Studio/Supavisor không có route public; `*.localhost` không cần chỉnh trust store thủ công.
- Lane: `orchestrator`.

**P1.7 — Bootstrap workspace, strict TypeScript và script thật**
- Hành động: writer được manifest giao khởi tạo root workspace pnpm; `packageManager: "pnpm@11.13.1"`; `engines.node: "24.18.0"`; `pnpm-workspace.yaml` gồm `apps/*`, `contracts`, `tests`; `tsconfig.base.json` với `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`; `biome.json`; và **tạo thật toàn bộ script** ở DEC-T15.
- Sản phẩm: `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.base.json`, `biome.json`, `vitest.workspace.ts`, `.nvmrc`.
- Phụ thuộc: P1.4; approval P1.2 cho root config.
- Verify: `pnpm install --frozen-lockfile` chạy trên clean clone; `pnpm typecheck` và `pnpm lint` tồn tại và exit 0 trên workspace rỗng. **Đây là bước biến mọi tên lệnh trong plan thành lệnh thật** — trước bước này chúng chỉ tồn tại trên giấy. Evidence thật ở P1.12.
- Lane: `orchestrator` hoặc agent được manifest giao root/workspace.
- **Chạy song song bắt đầu sau bước này**, không sớm hơn.

**P1.8 — Scaffold Next.js user/admin/auth/BFF shell** *(song song với P1.9, P1.11)*
- Hành động: dựng `apps/web` với `next@16.2.10`, `react@19.2.7`, `react-dom@19.2.7`, `@auth0/nextjs-auth0@4.25.0` (**chỉ boundary/config, không wiring**); route group `(user)`, `admin`, `auth`; BFF server boundary; admin guard server-side deny mặc định; loading/error/not-found; CSP header theo DEC-T12; accessibility baseline. Không business data, không login hoạt động.
- Sản phẩm: `apps/web/app/(user)/`, `apps/web/app/admin/`, `apps/web/app/auth/`, `apps/web/next.config.ts`, BFF handler boundary.
- Phụ thuộc: P1.7.
- Verify: `pnpm build` pass cho web; `pnpm dev:web` render `(user)` shell; request trực tiếp tới `/admin` bị deny **server-side** (không phải redirect client-side); response header có CSP đúng DEC-T12; `next.config.ts` không có `remotePatterns` mở; `pnpm test:e2e` pass smoke keyboard/focus và ba viewport.
- Lane: `frontend`.

**P1.9 — Scaffold NestJS/Fastify Control Plane + migration baseline** *(song song với P1.8, P1.11)*
- Hành động: dựng `apps/control-plane` với `@nestjs/core@11.1.28`, `@nestjs/common@11.1.28`, `@nestjs/platform-fastify@11.1.28`, `@nestjs/config@4.0.4`, `reflect-metadata@0.2.2`, `rxjs@7.8.2`, `jose@6.2.3`, `uuidv7@1.2.1`, `zod@4.4.3`; `drizzle-orm@0.45.2` + `drizzle-kit@0.31.10` + `postgres@3.4.9` (`prepare: false`). Tạo `src/main-api.ts` và `src/main-worker.ts` từ **cùng codebase** (worker chỉ gọi application port, không đọc table). Tạo health liveness/readiness, error envelope, correlation hook, env schema zod fail-fast. Tạo `drizzle.config.ts` và migration baseline tạo schema `control_plane` + role migration/runtime tách quyền + grant nền tối thiểu — **KHÔNG** tạo 25 domain tables.
- Sản phẩm: `apps/control-plane/src/main-api.ts`, `src/main-worker.ts`, `src/modules/`, `src/shared/`, `drizzle.config.ts`, `drizzle/migrations/` (baseline schema + role).
- Phụ thuộc: P1.7; P1.4 (manifest cho OpenAPI writer). Thứ tự migration theo `../database-schema.md` mục 17.1 bước 1 — chỉ schema/role/grant nền.
- Verify: `pnpm build` pass cho api và worker; `pnpm db:migrate` apply từ DB sạch; `psql` xác nhận `\dn` có schema `control_plane`, role migration và runtime tách biệt, và runtime role **không** có `CREATE/ALTER/DROP` (kiểm bằng `information_schema.role_table_grants` và thử `CREATE TABLE` bằng runtime role phải bị từ chối); rerun migration theo documented policy không tạo state mơ hồ; liveness không chạm DB còn readiness có; thiếu biến env bắt buộc thì process fail fast, không chạy với default ngầm.
- Lane: `backend`.

**P1.10 — Compose Supabase rút gọn, Caddy, env và CI/GHCR**
- Hành động: lấy `docker/docker-compose.yml` từ `supabase/supabase` tag `v1.26.07` (13 service — xem bằng chứng tại DEC-T10); **giữ `db` + `supavisor`**, loại `auth`/`rest`/`realtime`/`storage`/`imgproxy`/`functions`/`deno-cache`; **quyết định Studio bằng thực nghiệm** theo hai phương án (a)/(b) tại DEC-T10 rồi ghi lại kết quả; thay mọi image bằng **digest** và ghi `infra/compose/IMAGE-PINS.md`; bỏ mọi `ports:` publish ra host; viết `infra/caddy/Caddyfile` chỉ route web/API; viết `.env.example` không secret; viết 4 workflow `quality`/`test`/`db`/`build` với GHCR push có điều kiện.
- Sản phẩm: `infra/compose/docker-compose.yml`, `infra/compose/IMAGE-PINS.md`, `infra/caddy/Caddyfile`, `.env.example`, `.github/workflows/`.
- Phụ thuộc: approval P1.2; spike P1.5; topology P1.6; manifest P1.4.
- Verify: `docker compose -f infra/compose/docker-compose.yml config` validate không lỗi; `docker compose ... up -d` rồi `docker compose ... ps` cho thấy container healthy; **`docker compose ... port db 5432` không trả gì** và `ss -ltnp` xác nhận không port Supabase nào bind ra host — chỉ Caddy expose; `IMAGE-PINS.md` không còn tag trôi; grep `.env.example` không thấy secret thật; CI chạy đủ 4 job; step GHCR khi thiếu credential thì **skip và báo skip**, không log như thành công.
  Riêng Studio: nếu chọn (a), chứng minh Studio **thật sự mở được** và liệt kê chính xác service kéo theo; nếu chọn (b), chứng minh `pnpm db:studio` đáp ứng nhu cầu quản trị và **cập nhật `../stack-tech.md`** cùng record superseding. Không ghi "Studio hoạt động" nếu chưa mở thử.
- Lane: `orchestrator` (hoặc agent được manifest giao path chính xác).

**P1.11 — Viết baseline/smoke/migration/contract tests** *(song song với P1.8, P1.9)*
- Hành động: viết test theo contract đã freeze: clean-install/clean-clone; typecheck + lint; production build web/api/worker; unit error-envelope/correlation/env-schema; web smoke (`(user)`, denied `admin`, loading/error/not-found, keyboard, ba viewport); API liveness/readiness + no-stack/no-secret; worker startup/shutdown + không public port; compose private-network check; migration smoke từ DB sạch qua testcontainers; assertion cho spike Supavisor; OpenAPI lint + drift; secret scan.
- Sản phẩm: `tests/` và test-only fixture/config; `vitest.workspace.ts` wiring.
- Phụ thuộc: P1.4 (contract freeze). Consume artifact từ P1.8–P1.10 khi tích hợp.
- Verify: `pnpm test` và `pnpm test:e2e` chạy được; test dùng PostgreSQL thật qua testcontainers cho phần DB, **không mock**. Tester **không** hạ kỳ vọng để pass — test fail nghĩa là bug thuộc code, giao owner sửa (`../../AGENTS.md` mục 4b).
- Lane: `tester`.

**P1.12 — Integration từ clean clone**
- Hành động: từ **clean clone**, chạy toàn bộ lệnh thật vừa tạo và lưu output: `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm openapi:lint`, `pnpm openapi:drift`, `pnpm test`, `pnpm test:e2e`, `docker compose -f infra/compose/docker-compose.yml up -d`, `pnpm db:migrate`.
- Sản phẩm: integration evidence log dưới `docs/build-plan/` — **output thật**, không dùng lệnh mẫu thay evidence.
- Phụ thuộc: P1.7–P1.11.
- Verify: mọi lệnh chạy trên môi trường sạch với Node 24.18.0; `pnpm install --frozen-lockfile` không sửa lockfile. Contract đổi phải quay lại P1.4 re-freeze và thông báo mọi lane.
- Lane: `orchestrator` điều phối; owner từng lane hỗ trợ.

**P1.13 — QA và reviewer chạy độc lập + vòng sửa**
- Hành động: QA chạy gate từ clean state và lưu evidence; reviewer kiểm architecture/module boundary/security/rollback/docs; owner sửa lỗi, tối đa ba vòng.
- Sản phẩm: QA PASS/FAIL + reviewer "mục phải sửa" trong bảng mục 20.
- Phụ thuộc: P1.12.
- Verify: QA `PASS`; reviewer hết "mục phải sửa". Lệnh chưa tồn tại phải **báo đúng là chưa có**, không bịa. Lặp lỗi lần hai → **TẮC**; hết ba vòng → **CẠN LƯỢT** (metadata, không thay status canonical).
- Lane: `qa` ║ `reviewer` (read-only); owner lane sửa code.

**P1.14 — Cập nhật docs theo evidence**
- Hành động: cập nhật command/path/version/env/health/migration/CI docs theo behavior **đã chạy thật**; cập nhật `../../AGENTS.md` mục 3 (Lệnh) — hiện đang ghi "chưa có lệnh nào", chỉ được điền sau khi script tồn tại và chạy; cập nhật mục 1 file này chỉ sau khi exit gate đạt.
- Sản phẩm: command reference + setup docs khớp source thật; `AGENTS.md` mục 3; status update.
- Phụ thuộc: P1.13.
- Verify: docs chỉ liệt kê lệnh đã tồn tại và được chạy; vẫn nói rõ business feature chưa implement.
- Lane: `document`.

## 16. Parallel lanes và ownership

Chỉ bắt đầu song song **sau P1.7**.

| Lane | Path/công việc sở hữu | Ranh giới |
|---|---|---|
| Frontend | `apps/web` user/admin/auth/BFF shell | Không implement Control Plane/DB/test expectation; admin guard phải server-side. |
| Backend | `apps/control-plane` + migration baseline; `contracts/openapi/**` chỉ khi manifest giao | Không tự nhận shared/root/OpenAPI file; không sửa UI/test; không microservice hóa worker. |
| Tester | `tests/` và test-only fixture/config | Không sửa product code; không hạ kỳ vọng để pass. |
| Orchestrator | `infra/**`, `.github/workflows/**`, root workspace/config — **sau approval P1.2** | Chỉ giao lại path chính xác cho agent hiện hữu có quyền phù hợp. Không có lane tên `Infrastructure`. |
| QA | Chạy clean-clone/gate/container/migration evidence | Read-only; lệnh chưa có phải báo đúng là chưa có. |
| Reviewer | Boundary, security, reproducibility, rollback | Read-only, độc lập. |
| Document | README/command/setup docs sau khi behavior chạy thật | Không tuyên bố script/container/CI chạy nếu chưa có evidence. |

Mỗi shared/root file và `contracts/openapi/**` có **đúng một** writer. Architect chỉ review/freeze, không write. Lane khác gửi thay đổi qua writer đã ghi trong manifest.

## 17. Checklist

### Functional
- [ ] Chủ dự án đã phê duyệt scope P1 cho `infra/**`, `.github/workflows/**` và root config trước khi các file đó được tạo.
- [ ] Contract freeze có manifest file-level owner; mỗi shared/root/OpenAPI file có đúng một writer; architect chỉ review/freeze.
- [ ] Workspace bootstrap từ clean clone bằng `pnpm install --frozen-lockfile`.
- [ ] `pnpm build` pass cho web, api và worker; api/worker dùng chung Control Plane code.
- [ ] Liveness/readiness/error/correlation/OpenAPI baseline đúng contract đã freeze.
- [ ] User/admin shell không có fake business capability; admin deny mặc định server-side.

### Security
- [ ] Không secret/token/credential thật trong source, `.env.example`, image hoặc CI output.
- [ ] Supabase/Studio/Supavisor không publish port; chỉ Caddy expose.
- [ ] BFF/client boundary không đưa server secret/M2M config vào browser bundle.
- [ ] CSP/image/admin guard đúng DEC-T12; không wildcard, không dev bypass.
- [ ] Compose đã loại `auth`/`rest`/`realtime`/`storage`/`imgproxy`/`functions` theo DEC-T10; đặc biệt **PostgREST không chạy** (nó sẽ là đường vào DB thứ hai vòng qua enforcement của Control Plane).
- [ ] Quyết định Studio (a)/(b) được ghi kèm bằng chứng quan sát được, không phải suy đoán.

### DB
- [ ] Mọi image pin digest ở `IMAGE-PINS.md`; không tag trôi.
- [ ] Migration baseline apply từ DB sạch; smoke pass.
- [ ] Runtime role và migration role tách quyền; runtime role không `CREATE/ALTER/DROP`.
- [ ] Không triển khai 25 domain tables.

### Concurrency
- [ ] Spike chứng minh Supavisor transaction pinning, isolation và row lock; không dựa session affinity.
- [ ] `prepare: false` được đặt và có test chứng minh statement chạy qua pooler.
- [ ] Migration chạy song song có outcome rõ, không để schema half-applied.

### Accessibility
- [ ] Shell có semantic landmark, keyboard navigation, visible focus, accessible error/loading.
- [ ] Playwright baseline + manual keyboard review đã chạy.

### Responsive
- [ ] Cùng codebase hoạt động ở viewport desktop, điện thoại, máy tính bảng.
- [ ] Shell không overflow hoặc che navigation/action ở các viewport đã freeze.

### Observability
- [ ] Correlation ID truyền qua web/BFF/API/log/error; input invalid xử lý theo contract.
- [ ] Health/log không lộ secret, stack trace hay private topology.

### Rollback
- [ ] Compose/DB/web/api/worker cleanup và baseline rollback được tài liệu hóa và thử trên môi trường không dữ liệu.
- [ ] CI/container failure không publish/deploy artifact như thành công.

### Docs
- [ ] Setup và command reference chỉ liệt kê lệnh đã tồn tại và được chạy.
- [ ] `AGENTS.md` mục 3 được cập nhật từ "chưa có lệnh nào" sang danh sách thật.
- [ ] Path/version/env/health/migration/CI docs khớp source thật.
- [ ] Tài liệu vẫn nói rõ business feature chưa được implement.

## 18. Exit gate

P1 chỉ `verified` khi có evidence từ **clean clone/environment sạch** rằng:

1. Node 24.18.0 và pnpm 11.13.1 nhất quán giữa `.nvmrc`, `engines`, container và CI. Sample app runtime vẫn deferred P6.
2. `pnpm install --frozen-lockfile` và toàn bộ lệnh DEC-T15 được tạo, tài liệu hóa và QA chạy thật.
3. Web, api, worker build; typecheck/lint/test/OpenAPI lint + drift pass.
4. Container đạt health semantics; chỉ web/API expose; Supabase endpoint private.
5. Migration baseline apply từ DB sạch; runtime role không có migration privilege; **spike Supavisor pass**.
6. User/admin shell responsive/accessibility pass; direct admin request bị deny server-side.
7. CI chạy đủ 4 job; GHCR step an toàn khi thiếu credential; không lộ secret. Publish success chỉ được ghi nếu **thật sự chạy có quyền**.
8. Secret scan không tìm thấy secret thật.
9. QA `PASS`, reviewer hết "mục phải sửa", docs khớp evidence.

## 19. Stop/rollback

- Dừng nếu compose official không pin được theo digest, **Supavisor không chứng minh transaction semantics**, private network không bảo đảm, hoặc thiếu quyền để kiểm gate bắt buộc.
- **Spike Supavisor fail là TẮC nghiêm trọng**: nó vô hiệu hóa giả định nền của hard quota ở P5. Không đi tiếp bằng cách giả định "chắc là được".
- Không tự thêm library ngoài bảng D của register. Cần thêm → tạo record superseding, không cài rồi báo sau.
- Cùng lỗi lặp lần thứ hai → **TẮC**; hết ba vòng → **CẠN LƯỢT**. Hai outcome không thay canonical phase status.
- Contract đổi → dừng lane bị ảnh hưởng, re-freeze rồi mới sửa. Không sửa test để hợp thức hóa implementation.
- Trước traffic/data: rollback bằng `docker compose ... down -v` và baseline migration rollback đã review. Sau write: forward-fix; không xóa history, không sửa migration đã apply.
- CI/GHCR không có credential: kiểm phần không cần secret, nhưng **không** tuyên bố publish đã verified.

## 20. QA/reviewer sign-off

| Gate | Trạng thái | Evidence/người ký |
|---|---|---|
| QA clean clone, commands, builds, tests, compose, migration, exposure | `pending` | Chưa có implementation để chạy. |
| Reviewer architecture, module boundary, security, rollback, docs | `pending` | Chưa có implementation để review. |
| Spike Supavisor transaction pinning | `pending` | Điều kiện cần cho P5; chưa chạy. |
| Orchestrator xác nhận P1 exit gate | `pending` | Chỉ sau QA PASS và reviewer hết "mục phải sửa". |

Tác giả implementation không tự thay thế sign-off độc lập.
