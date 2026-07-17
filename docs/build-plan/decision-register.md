# Decision register Talosmine

> **Vai trò:** đây là nguồn sự thật cho mọi quyết định đã chốt của build plan. File phase **không được** tự chọn tool, version hay giá trị nghiệp vụ; phase chỉ tham chiếu `decisionId` tại đây.
>
> **Cập nhật lần cuối:** 2026-07-17.

## Cách đọc

| Trạng thái | Ý nghĩa |
|---|---|
| `approved` | Đã chốt. Phase phụ thuộc được mở. Thay đổi phải tạo record superseding. |
| `proposed` | Đã có đề xuất nhưng chưa được approve. **Vẫn là blocker.** |
| `open` | Chưa có đề xuất. Blocker cứng của phase liên quan. |
| `superseded` | Bị thay bởi record mới; giữ lại để truy vết, không xóa. |

**Mô hình phê duyệt (DEC-G01).** Dự án là solo dev + AI agents. Chủ dự án là approver duy nhất cho mọi quyết định nghiệp vụ, bảo mật, vận hành và ngân sách. Agent không tự approve thay con người, kể cả khi đề xuất do agent soạn.

## A. Quyết định kỹ thuật — `approved` 2026-07-17

Toàn bộ nhóm A được chủ dự án ủy quyền cho agent chốt (phiên 2026-07-17), phạm vi giới hạn ở **lựa chọn tooling/version**, không mở rộng sang stack đã duyệt tại `../stack-tech.md` và không đụng tới quyết định nghiệp vụ ở nhóm B.

Mọi version dưới đây được đọc từ registry thật ngày 2026-07-17 (`npm view <pkg> version`), không lấy từ trí nhớ.

### DEC-T01 — Node runtime

- **Quyết định:** Node **24.18.0** (codename Krypton).
- **Bằng chứng:** `https://nodejs.org/dist/index.json` ngày 2026-07-17 — `v24.18.0` có `lts: "Krypton"`; `v26.5.0` và `v25.9.0` có `lts: false`. Node 26 chỉ vào LTS từ 2026-10.
- **Lý do:** `stack-tech.md` yêu cầu "Node.js Active LTS tại thời điểm bootstrap". Tại 2026-07, dòng Active LTS là 24.
- **Pin ở ba nơi, phải khớp nhau:** `.nvmrc`, `engines.node` trong root `package.json`, và base image `node:24.18.0-bookworm-slim`.
- **Cảnh báo môi trường:** máy dev hiện tại chạy **v25.2.1** (không phải LTS). Bước P1.3 phải chuyển sang 24.18.0 trước khi install; CI kiểm tra version khớp `.nvmrc`.
- **Affected phase:** P1 và toàn bộ phase sau.

### DEC-T02 — Package manager và workspace

- **Quyết định:** **pnpm 11.13.1**, kích hoạt qua `corepack`; workspace bằng `pnpm-workspace.yaml`.
- **Lý do:** workspace gốc không cần thêm tool (Nx/Turbo) cho một monorepo 2 app; pnpm cho strict node_modules, chống phantom dependency — phù hợp luật ranh giới module tại `../modular.md` mục 1.2.
- **Lockfile policy:** `pnpm-lock.yaml` commit vào repo; CI và Docker build luôn dùng `--frozen-lockfile`; lockfile lệch làm fail CI, không tự sửa.
- **Pin:** `packageManager: "pnpm@11.13.1"` trong root `package.json` để corepack tự khóa version.
- **Affected phase:** P1+.

### DEC-T03 — TypeScript

- **Quyết định:** TypeScript **5.9.3**. **Không** dùng 7.0.2 dù đó là dist-tag `latest`.
- **Lý do:** NestJS 11 phụ thuộc `experimentalDecorators` + `emitDecoratorMetadata` cho DI. TypeScript 7 là bản port sang Go, mới phát hành và ra đời sau NestJS 11; hỗ trợ decorator metadata trong bản port chưa được kiểm chứng trên codebase này. Chọn 5.9.3 là quyết định giảm rủi ro có chủ đích, không phải quán tính.
- **Điều kiện xem lại:** khi NestJS công bố hỗ trợ TS 7 chính thức, hoặc khi spike chứng minh `emitDecoratorMetadata` hoạt động đủ. Tạo record superseding, không sửa tại chỗ.
- **Config:** `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `verbatimModuleSyntax: true`.
- **Affected phase:** P1+.

### DEC-T04 — Lint và format

- **Quyết định:** **Biome 2.5.4** (`@biomejs/biome`) làm cả linter và formatter.
- **Lý do:** một tool thay cặp ESLint + Prettier, một file config, không có xung đột rule format/lint. Giảm bề mặt dependency cho một dự án solo.
- **Exclusions:** `contracts/openapi/**` generated types, `apps/control-plane/drizzle/migrations/**` SQL, và mọi output build đều nằm ngoài phạm vi format.
- **Affected phase:** P1+.

### DEC-T05 — Test tooling

- **Quyết định:**
  - **Vitest 4.1.10** + `@vitest/coverage-v8@4.1.10` — unit và integration.
  - **Playwright 1.61.1** (`@playwright/test`) — E2E web, smoke, keyboard/focus và responsive viewport.
  - **testcontainers 12.0.4** + `@testcontainers/postgresql@12.0.4` — integration test chạy trên PostgreSQL thật.
- **Lý do quan trọng nhất:** hard quota ở P5 phải chứng minh không double-spend dưới concurrency. Điều đó **không thể** test bằng mock hay in-memory DB — nó phụ thuộc row lock và isolation level thật của PostgreSQL. Testcontainers là điều kiện cần cho exit gate P5.
- **Load/concurrency:** dùng chính Vitest chạy song song với pool `threads` cho concurrency test; công cụ load riêng (k6...) chưa cần và giữ `open` tới P8.
- **Affected phase:** P1+ (baseline), P5 (bắt buộc cho concurrency evidence).

### DEC-T06 — UUIDv7

- **Quyết định:** package **`uuidv7@1.2.1`**, sinh ID ở **application layer**.
- **Lý do:** `../database-schema.md` quy định `id uuid` application-generated. Không cài extension DB (`pg_uuidv7`) vì Supabase self-hosted sẽ phải tự quản extension đó qua mọi lần nâng cấp, và design không yêu cầu DB sinh ID.
- **Boundary:** chỉ repository layer gọi hàm sinh ID; domain nhận ID đã có.
- **Affected phase:** P1+.

### DEC-T07 — OpenAPI: spec-first

- **Quyết định:**
  - Nguồn sự thật là file viết tay **`contracts/openapi/control-plane.v1.yaml`**.
  - Validate bằng **`@redocly/cli@2.39.0`** (hỗ trợ OpenAPI 3.1).
  - Sinh type bằng **`openapi-typescript@7.13.0`**; output được commit và có drift test.
- **Lý do:** build plan bắt buộc **contract freeze trước khi code song song** (README mục "Workflow"). Code-first bằng `@nestjs/swagger` sẽ đảo ngược thứ tự đó — spec chỉ tồn tại sau khi code xong, nên không thể freeze để ba lane làm song song. Vì vậy **không** dùng `@nestjs/swagger`.
- **Drift test:** CI chạy lại `openapi-typescript` và fail nếu output khác bản đã commit.
- **Affected phase:** P1 (skeleton + validate + drift), P2–P5 (mở rộng theo phase).

### DEC-T08 — Auth0 SDK và xác minh token

- **Quyết định:**
  - Web/BFF: **`@auth0/nextjs-auth0@4.25.0`** — OIDC Authorization Code + PKCE, `state`, `nonce`, session cookie phía server.
  - Control Plane: **`jose@6.2.3`** — xác minh JWT (chữ ký, `iss`, `aud`, `exp`) qua JWKS, có cache.
- **Lý do:** Control Plane không dùng SDK của Next.js; nó chỉ cần verify token của user và của M2M caller. `jose` là thư viện thuần, không kéo theo framework.
- **Ràng buộc:** Control Plane **không lưu client secret** (`../modular.md` mục 10.1). Secret của BFF nằm trong env của riêng `apps/web`.
- **Affected phase:** P1 (chỉ tạo boundary/config, không wiring thật), P2 (wiring thật).

### DEC-T09 — Driver PostgreSQL

- **Quyết định:** **`postgres@3.4.9`** (postgres.js) + **`drizzle-orm@0.45.2`** + **`drizzle-kit@0.31.10`**.
- **Cấu hình bắt buộc:** `prepare: false`.
- **Lý do:** runtime đi qua **Supavisor ở transaction pooling mode**. Prepared statement có tên sẽ vỡ khi connection bị trả về pool giữa các statement. `prepare: false` là điều kiện bắt buộc, không phải tùy chọn tuning.
- **Ràng buộc kéo theo:** cấm mọi thứ phụ thuộc session state — session-level advisory lock, temp table, `SET` ngoài transaction. Hard quota chỉ dùng row lock trong một transaction (`../modular.md` mục 9.4). Spike P1.5 phải chứng minh transaction pinning trước khi P5 được build.
- **Migration:** dùng connection **trực tiếp tới PostgreSQL**, không qua Supavisor, bằng role migration riêng.
- **Affected phase:** P1 (baseline + spike), P5 (phụ thuộc cứng).

### DEC-T10 — Supabase self-hosted

- **Quyết định:** dùng `docker/docker-compose.yml` của repo chính thức `supabase/supabase` tại tag **`v1.26.07`**.
- **Bằng chứng (đọc thật ngày 2026-07-17):** compose tại tag này có **13 service** — `db`, `supavisor`, `studio`, `meta`, `kong`, `auth`, `rest`, `realtime`, `storage`, `imgproxy`, `functions`, `db-config`, `deno-cache`. Image gốc: `supabase/postgres:17.6.1.136`, `supabase/supavisor:2.9.5`, `supabase/studio:2026.07.07-sha-a6a04f2`, `supabase/postgres-meta:v0.96.6`, `kong/kong:3.9.1`, `supabase/gotrue:v2.189.0`, `postgrest/postgrest:v14.12`, `supabase/realtime:v2.102.3`, `supabase/storage-api:v1.60.4`, `darthsim/imgproxy:v3.30.1`, `supabase/edge-runtime:v1.74.0`.
- **Lưu ý tên service:** PostgreSQL tên là **`db`**, không phải `postgres`. Mọi hostname, healthcheck và connection string phải dùng `db`.
- **Cắt giảm scope — bắt buộc giữ:** `db` và `supavisor`. Đây là hai service duy nhất mà runtime nghiệp vụ cần.
- **Cắt giảm scope — loại bỏ:** `auth` (GoTrue), `rest` (PostgREST), `realtime`, `storage`, `imgproxy`, `functions`, `deno-cache`. Dự án dùng **Auth0** cho identity nên GoTrue là thừa; Control Plane là API duy nhất nên PostgREST sẽ tạo một đường truy cập DB thứ hai vòng qua toàn bộ enforcement của Control Plane — loại nó là quyết định **bảo mật**, không phải tối ưu dung lượng.
- **Studio — câu hỏi mở, P1.10 phải trả lời bằng thực nghiệm:** `studio` phụ thuộc `meta` (`STUDIO_PG_META_URL: http://meta:8080`) **và** `kong` (`SUPABASE_URL: http://kong:8000`); bản thân `meta` cũng `depends_on: kong`. Nghĩa là **không thể** giữ Studio mà bỏ Kong một cách trọn vẹn. P1.10 phải chọn một trong hai và ghi lại kết quả quan sát được:
  - **(a)** giữ `db + supavisor + studio + meta + kong` — Studio đầy đủ, đổi lại kéo theo Kong.
  - **(b)** giữ `db + supavisor` — bỏ Studio, dùng `pnpm db:studio` (Drizzle Studio, DEC-T15) cho nhu cầu quản trị.
  Không chọn trước ở đây vì lựa chọn phụ thuộc việc Studio có thực sự dùng được ở chế độ thiếu Kong hay không — đó là điều phải quan sát, không phải suy đoán. `../stack-tech.md` có nhắc "Supabase Studio chỉ dùng cho quản trị riêng tư"; nếu P1.10 chọn (b) thì phải cập nhật lại dòng đó tại stack-tech và ghi record superseding, **không** âm thầm lệch khỏi stack đã duyệt.
- **Pin:** tại P1.10, mọi image được thay bằng **digest** (`image: ...@sha256:...`) và ghi vào `infra/compose/IMAGE-PINS.md`. Không dùng tag trôi (`latest`, `nightly`).
- **Network:** toàn bộ service nằm trên internal network, không publish port ra host. Chỉ Caddy expose ra ngoài.
- **Affected phase:** P1, P8.

### DEC-T11 — Reverse proxy

- **Quyết định:** **`caddy:2-alpine`**, pin theo digest tại P1.10 và ghi vào `infra/compose/IMAGE-PINS.md`.
- **Local:** P1 dùng Caddy cho local với hostname `talosmine.localhost` và TLS nội bộ của Caddy. Không cần chỉnh trust store thủ công cho `*.localhost`.
- **Affected phase:** P1, P8.

### DEC-T12 — Image hosting, CSP và proxy *(quyết định duy nhất của P0 chặn P1)*

- **Quyết định:**
  - Ảnh app (`applications.image_url`) lưu trong **Supabase Storage bucket riêng, private network**; không dùng CDN bên thứ ba.
  - Browser **không** load ảnh trực tiếp từ origin ngoài. Ảnh đi qua **Next.js image optimizer** (`next/image`), nên host gốc không lộ ra client và không cần mở CSP cho domain ngoài.
  - CSP baseline: `default-src 'self'`; `img-src 'self' data:`; `frame-ancestors 'none'`; `object-src 'none'`; `base-uri 'self'`.
  - `next.config` **không** khai báo `remotePatterns` mở. Thêm host ảnh mới là một quyết định có record riêng, không phải sửa config tiện tay.
  - `launch_url` của app: bắt buộc `https`, host phải nằm trong allowlist đã đăng ký, **chặn private/link-local address** (RFC1918, `127.0.0.0/8`, `169.254.0.0/16`, `::1`, `fc00::/7`) để chống SSRF. Việc chặn này thực thi ở application layer, không phải DB check (`../modular.md` mục 5.4).
- **Lý do:** đây là mục duy nhất trong bảng P0 có "Block phase = P1", vì shell/config của P1 cần biết CSP và image strategy. Quyết định này thuần kỹ thuật/bảo mật nên nằm trong phạm vi ủy quyền nhóm A.
- **Affected phase:** P1, P3.

### DEC-T13 — Cấu trúc thư mục CI

- **Quyết định:** `.github/workflows/` là path canonical (GitHub Actions không cho path khác).
- **Job baseline P1:** `quality` (typecheck + Biome + OpenAPI validate/drift), `test` (Vitest + Playwright), `db` (migration smoke trên PostgreSQL container), `build` (Docker build, không push khi thiếu credential).
- **GHCR:** step push có điều kiện; thiếu credential thì skip và **báo skip**, không được log như thành công.
- **Affected phase:** P1, P8.

## B. Quyết định nghiệp vụ — chờ chủ dự án

Nhóm B **không** nằm trong ủy quyền của agent. Không điền "default hợp lý" vào bất kỳ ô nào dưới đây.

| ID | Quyết định | Trạng thái | Chặn phase | Ghi chú |
|---|---|---|---|---|
| DEC-B01 | **Danh sách ứng dụng của Hub** và owner từng app | `open` | P3, P6, P7 | Không tồn tại ở bất kỳ đâu trong repo. Blocker lớn nhất còn lại. Không chặn P1/P2. |
| DEC-B02 | **Sample app** cho P6 và path nào nó đại diện | `open` | P6 | Phụ thuộc DEC-B01. |
| DEC-B03 | Auth0 tenant/environment thật, issuer, audience | `open` | P2 | Cần tài khoản Auth0 của chủ dự án. Cấu trúc topology đã đề xuất tại DEC-T14. |
| DEC-B04 | Account activation policy và default plan | `open` | P2, P4 | |
| DEC-B05 | Metric/unit/amount cho từng action | `open` | P3, P5–P7 | Phụ thuộc DEC-B01. |
| DEC-B06 | Counting point (`start`/`milestone`/`success`) và failure treatment | `open` | P5–P7 | |
| DEC-B07 | Quota window: calendar hay rolling, timezone, DST | `open` | P5 | |
| DEC-B08 | Reservation TTL và late-success behavior | `open` | P5–P7 | |
| DEC-B09 | Subscription lifecycle: timing upgrade/downgrade/cancel, terminal branch | `open` | P4, P9 | `../modular.md` mục 7.4 cố ý không chọn nhánh. |
| DEC-B10 | Revoke SLA, outage policy, last-known-good | `open` | P2, P4, P6–P8 | Chưa chốt thì mặc định fail-closed. |
| DEC-B11 | Retention và privacy matrix | `open` | P2, P5, P8 | |
| DEC-B12 | RPO/RTO và restore drill cadence | `open` | P8 | |
| DEC-B13 | Payment provider | `open` | P9 | Deferred có chủ đích. |

### DEC-T14 — Cấu trúc Auth0 topology *(`proposed` — chờ DEC-B03)*

Đây là **đề xuất cấu trúc**, không phải cấu hình thật. Không có giá trị nào ở đây là secret.

- Một tenant cho mỗi environment (`dev`, `prod`). Không dùng chung tenant giữa hai môi trường.
- **Một** Regular Web Application cho Hub BFF (`apps/web`) — nơi duy nhất giữ client secret của user flow.
- **Một** API resource đại diện Control Plane, có audience riêng.
- **Một** M2M application cho **mỗi** backend ứng dụng — không dùng chung credential (`../modular.md` mục 10.4).
- Callback/logout URL khai báo **exact match**, không wildcard, khai riêng cho từng environment.
- Google social connection: `open`, phụ thuộc DEC-B03.

Trạng thái giữ `proposed` cho tới khi chủ dự án cung cấp tenant thật. P1 chỉ tạo boundary config và biến env rỗng; **không** wiring Auth0 thật ở P1.

## C. Truy vết `decision -> phase`

| Phase | Quyết định bắt buộc phải `approved` để mở phase | Tình trạng hiện tại |
|---|---|---|
| P0 | DEC-G01 | Đạt cho phần kỹ thuật; inventory app vẫn `open` (DEC-B01). |
| **P1** | DEC-T01…T13 | **Đủ — P1 được mở.** |
| P2 | DEC-B03, DEC-B04, DEC-B10, DEC-T14 | Chưa đủ. |
| P3 | DEC-B01, DEC-B05, DEC-T12 | Chưa đủ. |
| P4 | DEC-B04, DEC-B09, DEC-B10 | Chưa đủ. |
| P5 | DEC-B05…B08, DEC-T05, DEC-T09 | Chưa đủ. |
| P6 | DEC-B01, DEC-B02 | Chưa đủ. |
| P7 | DEC-B01, DEC-B05 | Chưa đủ. |
| P8 | DEC-B11, DEC-B12 | Chưa đủ. |
| P9 | DEC-B13 + approval riêng | Deferred. |

## D. Bảng version pin — nguồn sự thật duy nhất

Mọi file phase tham chiếu bảng này thay vì tự ghi version. Đọc từ npm registry ngày 2026-07-17.

| Package | Version | Dùng ở | Record |
|---|---|---|---|
| node | 24.18.0 | runtime | DEC-T01 |
| pnpm | 11.13.1 | workspace | DEC-T02 |
| typescript | 5.9.3 | toàn repo | DEC-T03 |
| @types/node | ^24 | toàn repo | DEC-T01 |
| @biomejs/biome | 2.5.4 | lint/format | DEC-T04 |
| vitest | 4.1.10 | test | DEC-T05 |
| @vitest/coverage-v8 | 4.1.10 | test | DEC-T05 |
| @playwright/test | 1.61.1 | E2E | DEC-T05 |
| testcontainers | 12.0.4 | integration | DEC-T05 |
| @testcontainers/postgresql | 12.0.4 | integration | DEC-T05 |
| next | 16.2.10 | apps/web | stack |
| react / react-dom | 19.2.7 | apps/web | peer của next 16 |
| @auth0/nextjs-auth0 | 4.25.0 | apps/web | DEC-T08 |
| @nestjs/core | 11.1.28 | apps/control-plane | stack |
| @nestjs/common | 11.1.28 | apps/control-plane | stack |
| @nestjs/platform-fastify | 11.1.28 | apps/control-plane | stack |
| @nestjs/config | 4.0.4 | apps/control-plane | stack |
| @nestjs/testing | 11.1.28 | apps/control-plane | DEC-T05 |
| reflect-metadata | 0.2.2 | apps/control-plane | peer của nest |
| rxjs | 7.8.2 | apps/control-plane | peer của nest |
| fastify | 5.10.0 | (transitive) | qua platform-fastify |
| jose | 6.2.3 | apps/control-plane | DEC-T08 |
| drizzle-orm | 0.45.2 | apps/control-plane | DEC-T09 |
| drizzle-kit | 0.31.10 | apps/control-plane | DEC-T09 |
| postgres | 3.4.9 | apps/control-plane | DEC-T09 |
| uuidv7 | 1.2.1 | apps/control-plane | DEC-T06 |
| zod | 4.4.3 | toàn repo | validate env + input |
| @redocly/cli | 2.39.0 | contracts | DEC-T07 |
| openapi-typescript | 7.13.0 | contracts | DEC-T07 |
| tsx | 4.23.1 | dev/scripts | DEC-T02 |
| supabase/supabase | tag v1.26.07 | infra/compose | DEC-T10 |
| caddy | 2-alpine (pin digest ở P1.10) | infra/caddy | DEC-T11 |

**Luật:** version trong bảng này chỉ được đổi bằng một record superseding có lý do. Agent không tự nâng version vì "có bản mới".

## E. DEC-T15 — Tên script canonical

`approved` 2026-07-17. Đây là **hợp đồng tên lệnh** cho toàn bộ build plan. Mọi ô **Verify** của mọi phase phải dùng đúng các lệnh dưới đây, không tự đặt tên khác, không viết `‹cần chốt: script thật›` nữa.

Script được tạo thật ở bước **P1.7**. Trước P1.7, lệnh tồn tại trên giấy nhưng chưa chạy được — phase phải nói rõ điều đó thay vì tuyên bố đã chạy.

| Lệnh | Việc nó làm | Tạo ở |
|---|---|---|
| `pnpm install --frozen-lockfile` | Cài từ lockfile, fail nếu lockfile lệch | P1.7 |
| `pnpm typecheck` | `tsc --noEmit` cho mọi workspace | P1.7 |
| `pnpm lint` | `biome check .` | P1.7 |
| `pnpm format` | `biome format --write .` | P1.7 |
| `pnpm build` | Build web + control-plane (api và worker) | P1.7 |
| `pnpm test` | Vitest unit + integration | P1.7 |
| `pnpm test:e2e` | Playwright | P1.7 |
| `pnpm test:concurrency` | Suite concurrency chạy trên PostgreSQL thật qua testcontainers | P1.7, dùng thật ở P5 |
| `pnpm db:generate` | `drizzle-kit generate` — sinh migration từ schema | P1.7 |
| `pnpm db:migrate` | `drizzle-kit migrate` — apply, dùng role migration, nối trực tiếp PostgreSQL không qua Supavisor | P1.7 |
| `pnpm db:studio` | `drizzle-kit studio` — chỉ dùng cục bộ để quản trị | P1.7 |
| `pnpm openapi:lint` | `redocly lint contracts/openapi/control-plane.v1.yaml` | P1.7 |
| `pnpm openapi:types` | `openapi-typescript` sinh type từ spec | P1.7 |
| `pnpm openapi:drift` | Sinh lại type và fail nếu khác bản đã commit | P1.7 |
| `pnpm dev:web` | Next.js dev server | P1.7 |
| `pnpm dev:api` | Control Plane API ở chế độ watch | P1.7 |
| `pnpm dev:worker` | Control Plane worker ở chế độ watch | P1.7 |
| `docker compose -f infra/compose/docker-compose.yml config` | Validate compose | P1.10 |
| `docker compose -f infra/compose/docker-compose.yml up -d` | Bật stack local | P1.10 |
| `docker compose -f infra/compose/docker-compose.yml down -v` | Teardown, xóa volume | P1.10 |

**Quy tắc trung thực:** một lệnh có tên trong bảng này **không** chứng minh nó đã chạy. Chỉ QA chạy thật từ clean clone mới tạo evidence (`P1.12`, `P1.13`).
