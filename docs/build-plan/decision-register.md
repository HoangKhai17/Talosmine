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
- **Bằng chứng (parse thật ngày 2026-07-17):** compose tại tag này có đúng **11 service** — `db`, `supavisor`, `studio`, `meta`, `kong`, `auth`, `rest`, `realtime`, `storage`, `imgproxy`, `functions` — và **2 named volume**: `db-config`, `deno-cache`. Image gốc: `supabase/postgres:17.6.1.136`, `supabase/supavisor:2.9.5`, `supabase/studio:2026.07.07-sha-a6a04f2`, `supabase/postgres-meta:v0.96.6`, `kong/kong:3.9.1`, `supabase/gotrue:v2.189.0`, `postgrest/postgrest:v14.12`, `supabase/realtime:v2.102.3`, `supabase/storage-api:v1.60.4`, `darthsim/imgproxy:v3.30.1`, `supabase/edge-runtime:v1.74.0`.
- **Lưu ý tên service:** PostgreSQL tên là **`db`**, không phải `postgres`. Mọi hostname, healthcheck, connection string và lệnh `docker compose ... port` phải dùng `db`.
- **`db-config` và `deno-cache` là VOLUME, không phải service.** Đừng xếp chúng vào nhóm service.
  - `db-config` → mount vào **`db`** tại `/etc/postgresql-custom`, dùng để **giữ pgsodium decryption key qua các lần restart**. **Bắt buộc giữ** cùng `db`; bỏ nó sẽ mất key sau restart.
  - `deno-cache` → chỉ mount vào `functions`. Vì `functions` bị loại, volume này thành mồ côi và **bỏ theo**.
- **Cắt giảm scope — bắt buộc giữ:** service `db` + `supavisor`, và volume `db-config`. Đây là tập tối thiểu mà runtime nghiệp vụ cần.
- **Cắt giảm scope — loại bỏ (6 service + 1 volume):** `auth` (GoTrue), `rest` (PostgREST), `realtime`, `storage`, `imgproxy`, `functions`, cùng volume `deno-cache`. Dự án dùng **Auth0** cho identity nên GoTrue là thừa; Control Plane là API duy nhất nên PostgREST sẽ tạo một đường truy cập `db` thứ hai vòng qua toàn bộ enforcement entitlement/quota của Control Plane — loại nó là quyết định **bảo mật**, không phải tối ưu dung lượng, và nó là stop condition **kể cả khi không lộ ra Internet**.
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

### DEC-T16 — Overlay compose cho dev và cổng host

`approved` 2026-07-17, sau khi P1.10 chạy thật.

- **Vấn đề:** `docker-compose.yml` cố ý 0 port (DEC-T10). Đúng cho production, nhưng
  drizzle-kit / Drizzle Studio / psql chạy trên host thì không tới được database.
- **Quyết định:** thêm `infra/compose/docker-compose.dev.yml` — overlay **chỉ dùng ở máy cá nhân**,
  chỉ THÊM `ports`, không đổi image/network/volume/env.
- **Bind loopback:** `127.0.0.1:55432 -> db:5432` và `127.0.0.1:56543 -> supavisor:6543`.
  Không bind `0.0.0.0` nên không lộ ra LAN.
- **Vì sao 55432/56543 chứ không phải 5432/6543:** máy dev **đã có một PostgreSQL của dự án
  khác** giữ cổng 5432 (kiểm chứng: `Get-NetTCPConnection -LocalPort 5432` → PID 6836).
  Chiếm cổng đó sẽ hoặc làm `up` fail, hoặc tệ hơn là khiến công cụ lặng lẽ trỏ nhầm
  database của dự án kia. Dịch sang dải 55xxx để hai dự án sống chung trên một máy.
- **Ràng buộc:** overlay này **không bao giờ** dùng ở staging/production. Lệnh production chỉ
  nêu `docker-compose.yml`. P8 coi việc một service ngoài Caddy publish port ra Internet là
  stop condition.
- **Affected phase:** P1, P5 (test concurrency cần đi qua pooler), P8 (không áp dụng).

### DEC-T17 — Node cô lập cho Talosmine, không đổi Node toàn máy

`approved` 2026-07-17, thay cho ý định ban đầu là `nvm use`.

- **Vấn đề phát hiện khi thực thi:** nvm-windows cho **mỗi bản Node một kho global riêng**.
  Máy dev có 5 CLI global cài dưới v25.2.1: `opencode`, `claude`, `gemini`, `bun`, `yarn`.
  `nvm use 24.18.0` sẽ đổi symlink `C:\Program Files\nodejs` và làm **cả 5 CLI biến mất** —
  gồm chính bộ công cụ chủ dự án đang dùng để làm việc. Nó cũng đổi Node của mọi dự án khác.
- **Quyết định:** giữ global ở v25.2.1. Cài Node 24.18.0 vào `%APPDATA%\nvm\v24.18.0`
  (đúng cấu trúc nvm, nên `nvm use` vẫn dùng được sau này nếu muốn), rồi kích hoạt theo
  từng shell bằng `scripts/use-node.ps1` / `scripts/use-node.sh` — chỉ sửa `PATH` của phiên.
- **Kiểm chứng sau khi cài:** `node --version` → v24.18.0 trong shell dự án; symlink global
  vẫn trỏ v25.2.1; `opencode`/`claude` còn nguyên.
- **Ghi chú:** `nvm.exe` **không dùng được** trong môi trường non-interactive — nó exit 0,
  không in gì và không cài gì. Node 24.18.0 được tải trực tiếp từ nodejs.org và **đã kiểm
  checksum SHA256** khớp `SHASUMS256.txt`.
- **Ghi chú thứ hai:** Node 25 **đã bỏ corepack**; Node 24 vẫn kèm. Đây là một lý do độc lập
  nữa để DEC-T01 chọn 24 — DEC-T02 dựa vào corepack.
- **Affected phase:** P1+. CI và Docker vẫn pin 24.18.0 độc lập với host nên không lệch.

### DEC-T18 — Vitest dùng `vitest.config.ts` + `test.projects`, không phải `vitest.workspace.ts`

`approved` 2026-07-17, thay cho ý định ban đầu ghi trong phase-1 mục 7.

- **Vấn đề phát hiện khi thực thi:** phase-1 và P1.11 ghi `vitest.workspace.ts`. Cơ chế đó
  **đã bị gỡ ở Vitest 4** (DEC-T05 pin 4.1.10). Bằng chứng từ source vitest: tham số
  workspace-path bị hardcode `void 0`, và có dòng ném lỗi *"The test.workspace option was
  removed in Vitest 4. Please, migrate to test.projects"*.
- **Hỏng im lặng:** tester đã tạo `vitest.workspace.ts` đúng như plan rồi chạy
  `pnpm test:concurrency` → `No projects matched the filter "concurrency"`. File bị bỏ qua
  hoàn toàn, **không một cảnh báo**. `pnpm test` vẫn chạy (vitest rơi về default include)
  nên nhìn qua tưởng đã wiring xong.
- **Quyết định:** dùng `vitest.config.ts` với `test.projects` (thay thế 1-1). Ba project:
  `unit`, `integration`, `concurrency`. **Không đổi tên lệnh nào** của DEC-T15.
- **Affected phase:** P1+. phase-1 mục 7 và P1.11 cần cập nhật khỏi `vitest.workspace.ts`.

### DEC-T19 — Testcontainers dùng `postgres:17.6-alpine`, không phải `supabase/postgres`

`approved` 2026-07-17.

- **Quyết định:** integration/concurrency test dựng container bằng image chính thức
  **`postgres:17.6-alpine`** (pin cứng, không dùng tag trôi mặc định của testcontainers).
- **Vì sao khớp major 17:** DEC-T10 pin `supabase/postgres:17.6.1.136` (PG 17). Row lock,
  isolation và wait event là hành vi của engine — test trên major khác thì kết luận không
  chuyển sang production được.
- **Vì sao KHÔNG dùng `supabase/postgres`:** image đó chạy init chain `migrate.sh` phụ thuộc
  `POSTGRES_USER=supabase_admin`, trong khi `PostgreSqlContainer` của testcontainers **luôn**
  set `POSTGRES_USER`. Tổ hợp này làm init chết im lặng — đúng bẫy đã ghi ở
  [`evidence-p1.md`](./evidence-p1.md). Test cần một PostgreSQL trần để chứng minh baseline
  apply được từ DB rỗng, không phải để tái tạo toàn bộ Supabase.
- **Affected phase:** P1 (integration test), P5 (concurrency/hard-quota test).

### DEC-T20 — CSP có `script-src` với nonce cho Next App Router

`approved` 2026-07-17, mở rộng DEC-T12.

- **Vấn đề:** DEC-T12 chốt CSP baseline `default-src 'self'` (cùng `img-src`, `frame-ancestors`,
  `object-src`, `base-uri`). Nhưng Next.js App Router **chèn script inline** để truyền RSC
  payload sang client. Với `default-src 'self'` trần, script đó bị chặn và **trang không
  hydrate** — tức là không tương tác được.
- **Quyết định:** thêm `script-src 'self' 'nonce-<random>' 'strict-dynamic'`, nonce sinh
  **theo từng request** ở `apps/web/proxy.ts`. Đây là **thắt chặt**, không phải nới lỏng:
  không wildcard, không `'unsafe-inline'` cho script trong production.
- **Ngoại lệ chỉ ở dev:** khi `NODE_ENV !== 'production'`, thêm `'unsafe-eval'` (script) và
  `'unsafe-inline'` (style) cho React Refresh/HMR. Chúng **không tồn tại** trong production
  build — có test e2e xác nhận (khi Playwright được bật ở lượt riêng).
- **Toàn bộ directive baseline của DEC-T12 giữ nguyên.** Record này chỉ bổ sung `script-src`
  (và `style-src`/`connect-src` cần cho Next hoạt động), không gỡ ràng buộc nào.
- **Affected phase:** P1, P3 (khi thêm ảnh app phải giữ nguyên kỷ luật này).

### DEC-T21 — Secret scan bằng gitleaks

`approved` 2026-07-17. Đây là tool còn thiếu cho exit gate P1 điều 8.

- **Quyết định:** **`ghcr.io/gitleaks/gitleaks:v8.28.0`** (pin version, chạy qua Docker nên
  không thêm dependency vào repo). Config tại `.gitleaks.toml`.
- **Scan ở git-mode**, KHÔNG `--no-git`: git-mode chỉ quét file được git track nên tôn trọng
  `.gitignore`. `--no-git` quét cả `node_modules/` và `apps/web/.next/` (build artifact có
  dev preview key) — toàn false positive về thứ không bao giờ được commit.
- **Allowlist chỉ chứa false positive đã KIỂM CHỨNG bằng tay:** tài liệu tiếng Việt trong
  `docs/*.md` (chuỗi dấu entropy cao bị `generic-api-key` bắt nhầm), placeholder
  `CHANGE_ME_*` trong `.env.example`, và password dev-only `devlocal_*`. Không tắt rule.
- **Đã kiểm chứng bằng thử nghiệm âm bản:** cắm một AWS key giả vào file source →
  `leaks found: 6`; xoá đi → `no leaks found`. Scan này biết bắt, không chỉ biết báo xanh.
- **Kết quả 2026-07-17:** full scan 22 commit + working tree → **no leaks found**.
- **CI:** job `quality` chạy gitleaks git-mode; finding làm fail build.
- **Affected phase:** P1+.

### DEC-T22 — Identity provider: **Logto self-host** (SUPERSEDES DEC-T08 phần Auth0)

`approved` 2026-07-18 bởi chủ dự án. **Đây là thay đổi stack** — `../stack-tech.md` phải
được cập nhật (đang ghi "Auth0 managed").

- **Vì sao đổi:** chủ dự án nêu lo ngại về việc dữ liệu xác thực và credential nằm ở hạ tầng
  nước ngoài, và khả năng không phù hợp yêu cầu pháp lý Việt Nam về dữ liệu. Đây là quyết
  định **nghiệp vụ/pháp lý của chủ dự án**, không phải agent tự chọn.
  Agent **không** tư vấn pháp lý; việc xác định dự án có thuộc diện phải lưu dữ liệu trong
  nước hay không cần luật sư/chuyên gia tuân thủ xác nhận.
- **Quyết định:** **Logto v1.41.0**, self-host bằng Docker trên VPS do chủ dự án kiểm soát.
- **License: MPL-2.0.** File-level copyleft — chỉ ràng buộc nếu SỬA source của Logto thì
  phải mở file đó. Talosmine là ứng dụng riêng gọi qua OIDC nên **không bị ảnh hưởng**.

**Các phương án đã cân nhắc và loại (đọc số liệu thật từ GitHub API 2026-07-18):**

| Phương án | License | Lý do loại |
|---|---|---|
| Zitadel v4.16.1 | **AGPL-3.0** | Copyleft mạnh — rủi ro lan sang sản phẩm thương mại. Agent từng nghiêng về nó **trước khi kiểm license**, và đã rút lại. |
| Authentik | NOASSERTION | License không rõ ràng. |
| Ory Hydra | Apache-2.0 | Chỉ là OAuth2 server, **không có quản lý user** — phải ghép thêm Kratos, quá phức tạp cho dự án solo. |
| Keycloak 26.7.0 | Apache-2.0 | Ứng viên tốt (license sạch nhất, chuẩn công nghiệp) nhưng chạy Java, ~1GB RAM. Chủ dự án chọn Logto vì nhẹ hơn và cùng ngôn ngữ TypeScript. |

**VÌ SAO ĐỔI NÀY KHÔNG PHÁ KIẾN TRÚC — điểm quan trọng nhất:**

Nửa A đã xây trên **chuẩn OIDC**, không phải trên Auth0:

- `external_identities` khoá bằng `(issuer, subject)` — chuẩn OIDC, đúng với mọi provider.
- Verify token bằng `jose` + JWKS — chuẩn OIDC thuần.
- Session, RBAC, audit là **của Talosmine**, nằm trong PostgreSQL self-hosted.

Đổi provider chỉ cần: đổi issuer URL trong env, và đổi CHECK
`external_identities_provider_check` (hiện khoá `'auth0'`). **Không phải viết lại logic nào.**

**Thay đổi kéo theo:**
- `../stack-tech.md`: dòng Identity/SSO đổi từ Auth0 managed sang Logto self-host.
- DEC-T08: phần `@auth0/nextjs-auth0` **bị superseded** — BFF sẽ dùng client OIDC chuẩn.
  Phần `jose@6.2.3` cho verify token **giữ nguyên** (chuẩn OIDC, không phụ thuộc provider).
- DEC-B03 (Auth0 tenant) **không còn là blocker** — thay bằng cấu hình Logto local.
- Migration mới cần mở rộng `external_identities_provider_check` cho `'logto'`.

**Còn phải làm khi triển khai:**
- Pin image Logto theo **digest**, ghi vào `infra/compose/IMAGE-PINS.md` (DEC-T10 quy tắc).
- Logto dùng PostgreSQL — dùng lại service `db` đã có, **database riêng** để tách dữ liệu
  IdP khỏi `control_plane`.
- Affected phase: P2 nửa B.

### DEC-T23 — CAPTCHA chống spam *(`proposed` — chốt sau khi dựng Logto)*

- **Yêu cầu:** chủ dự án muốn thêm lớp CAPTCHA chống spam (2026-07-18).
- **Chưa chốt công cụ** vì Logto có thể đã tích hợp sẵn — kiểm tra thực tế trước rồi quyết,
  tránh thêm dependency thừa.
- Hai ứng viên khi tới đó:
  - **Altcha** — self-host, proof-of-work, không gửi dữ liệu ra ngoài. Nhất quán với hướng
    "dữ liệu trong nước". Đổi lại: chống bot yếu hơn với bot chịu tốn CPU.
  - **Cloudflare Turnstile** — dễ nhất, ít phiền người dùng, nhưng là dịch vụ nước ngoài.
- **Ghi chú kỹ thuật quan trọng:** CAPTCHA chống **bot đăng ký hàng loạt**. Chống
  **brute-force mật khẩu** thì rate limiting + khóa tài khoản tạm thời hiệu quả hơn nhiều.
  Cần cả hai, đúng chỗ — không coi CAPTCHA là giải pháp vạn năng.

## B. Quyết định nghiệp vụ — chờ chủ dự án

Nhóm B **không** nằm trong ủy quyền của agent. Không điền "default hợp lý" vào bất kỳ ô nào dưới đây.

| ID | Quyết định | Trạng thái | Chặn phase | Ghi chú |
|---|---|---|---|---|
| DEC-B01 | **Danh sách ứng dụng của Hub** và owner từng app | `open` | P3, P6, P7 | Không tồn tại ở bất kỳ đâu trong repo. Blocker lớn nhất còn lại. Không chặn P1/P2. |
| DEC-B02 | **Sample app** cho P6 và path nào nó đại diện | `open` | P6 | Phụ thuộc DEC-B01. |
| DEC-B03 | Auth0 tenant/environment thật, issuer, audience | `open` | P2 | Cần tài khoản Auth0 của chủ dự án. Cấu trúc topology đã đề xuất tại DEC-T14. |
| DEC-B04 | Account activation policy và default plan | `approved` (một phần) | P2, P4 | Activation đã chốt — xem dưới. Default plan vẫn `open` (thuộc P4). |
| DEC-B05 | Metric/unit/amount cho từng action | `open` | P3, P5–P7 | Phụ thuộc DEC-B01. |
| DEC-B06 | Counting point (`start`/`milestone`/`success`) và failure treatment | `open` | P5–P7 | |
| DEC-B07 | Quota window: calendar hay rolling, timezone, DST | `open` | P5 | |
| DEC-B08 | Reservation TTL và late-success behavior | `open` | P5–P7 | |
| DEC-B09 | Subscription lifecycle: timing upgrade/downgrade/cancel, terminal branch | `open` | P4, P9 | `../modular.md` mục 7.4 cố ý không chọn nhánh. |
| DEC-B10 | Revoke SLA, outage policy, last-known-good | `open` | P2, P4, P6–P8 | Chưa chốt thì mặc định fail-closed. |
| DEC-B11 | Retention và privacy matrix | `open` | P2, P5, P8 | |
| DEC-B12 | RPO/RTO và restore drill cadence | `open` | P8 | |
| DEC-B13 | Payment provider | `open` | P9 | Deferred có chủ đích. |

### DEC-B04a — Account activation policy

`approved` 2026-07-17 bởi chủ dự án.

- **Quyết định:** khi user login lần đầu, account được tạo và **kích hoạt `active` ngay**
  (`pending -> active` tự động trong cùng luồng provisioning).
- **Tính chất tạm thời — có chủ đích:** đây là policy cho giai đoạn đầu. Kế hoạch tương lai
  (chưa lên lịch, cần record riêng khi làm):
  - account mới ở `pending`, chỉ `active` sau khi **verify email**;
  - hoặc `active` ngay khi login qua Google (email đã verified bởi Google).
- **Vì sao chốt được ngay:** schema `accounts` đã hỗ trợ đủ 3 status; đổi policy sau này là
  đổi **logic provisioning**, KHÔNG đổi schema — nên không tạo nợ kỹ thuật.
- **Ràng buộc giữ nguyên:** account `disabled` vẫn luôn deny (không bị policy này ảnh hưởng);
  và việc đổi sang `pending`-by-default sau này phải là một quyết định có record, không âm thầm.
- **Affected phase:** P2 (provisioning logic).

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
| **P1** | DEC-T01…T13, T15…T17 | **Đủ — P1 đang thực thi.** Xem [`evidence-p1.md`](./evidence-p1.md) để biết phần nào đã chạy thật. |
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
| postgres (image) | 17.6-alpine | testcontainers | DEC-T19 |
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
