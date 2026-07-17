# Phase 1 — Bootstrap và foundation

## 1. Trạng thái

`blocked` — phụ thuộc P0 exit gate và các technical decision gate dưới đây. Đây là canonical phase status; `TẮC`/`CẠN LƯỢT`, nếu xảy ra, chỉ là verification outcome metadata. Trước phase này repo chưa có `package.json`, package/workspace config, build/test/lint script hay command được xác minh.

## 2. Mục tiêu

Tạo foundation tối thiểu, reproducible và an toàn cho một monorepo web fullstack theo stack đã duyệt: một responsive Next.js Web/BFF; một NestJS/Fastify Control Plane modular monolith với API/worker entrypoint dùng chung code; PostgreSQL trong Supabase self-hosted; Drizzle migration baseline; OpenAPI/error/correlation baseline; container và CI skeleton. Phase chỉ tạo shell/foundation, chưa tạo business feature.

## 3. Prerequisites và human decisions

### Prerequisite

- P0 `verified` cho các decision chặn bootstrap, đặc biệt Auth0 topology, admin bootstrap boundary và image/CSP/proxy policy cần cho shell/config.
- Baseline stack trong `docs/stack-tech.md` không thay đổi.
- Target layout trong README được review; path vật lý cho GitHub Actions được làm rõ.

### Technical decision gates chưa chốt

Không implementation phần phụ thuộc trước khi decision tương ứng được approve:

| Gate | Phải quyết định/kiểm chứng | Output bắt buộc |
|---|---|---|
| Node | Exact Node.js Active LTS tại thời điểm bootstrap và pin strategy | Version record + CI/container/dev consistency check. |
| Workspace | Package manager, exact version, workspace mechanism và lockfile policy | Approved workspace layout; clean-install acceptance. |
| Lint/format | Tool và policy; generated/vendor exclusions | Config decision + CI behavior; không tự thêm library. |
| Test tools | Unit, integration/E2E và load/concurrency tool | Tool ownership, command naming và minimum baseline suites. |
| UUIDv7 | Exact package/version và generation boundary | Collision/order/basic format tests; không dùng DB extension nếu design không đổi. |
| OpenAPI | Generation/source-of-truth/validation approach và tool | Artifact path, drift rule, validation command và failure behavior. |
| Auth0 SDK | Exact SDK/package/version phù hợp Next.js runtime và BFF flow | Supported runtime/cookie/callback design; secret handling review. |
| Sample app runtime | Runtime/tooling của sample Data Plane | **Deferred P6**; P1 chỉ ghi blocker/compatibility, không chọn. |
| Supavisor | Pooling mode, transaction pinning và isolation-level spike | Evidence transaction/row-lock behavior; cấm dựa vào session affinity. |
| Local Caddy | Có dùng local routing/TLS không; hostname/certificate trust model | Approved local topology và documented setup/rollback. |

Nếu một gate thiếu approver hoặc cùng spike fail lặp lần hai, ghi verification outcome metadata **TẮC** và dừng; không chọn package “phổ biến” để đi tiếp và không thay phase status bằng outcome này.

## 4. Phạm vi

- Finalize target monorepo paths và workspace boundary sau approval.
- Bootstrap `apps/web` bằng Next.js + strict TypeScript: một responsive codebase với `(user)`, `admin`, `auth` và BFF boundary.
- Bootstrap `apps/control-plane` bằng NestJS + Fastify adapter + strict TypeScript.
- Tạo API entrypoint canonical `apps/control-plane/src/main-api.*` và worker entrypoint canonical `apps/control-plane/src/main-worker.*` từ cùng Control Plane codebase; worker chỉ gọi application port, không thành microservice/domain riêng.
- Thiết lập module-boundary convention phù hợp `docs/modular.md`; không repository/query xuyên module, không internal HTTP loopback.
- Tạo Supabase official self-hosted Docker Compose skeleton đã pin theo approved version; private endpoints only.
- Tạo Caddy skeleton theo local/deploy decision; không public Supabase/Studio/Supavisor.
- Tạo `.env.example`/environment schema/documentation không chứa secret.
- Tách migration role và runtime role với least privilege baseline.
- Tạo Drizzle/Drizzle Kit baseline và migration mechanism cho schema `control_plane`.
- Tạo liveness/readiness/health baseline có semantics rõ.
- Tạo OpenAPI 3.1 skeleton, versioning, error envelope và correlation ID propagation.
- Tạo GitHub Actions/GHCR skeleton theo decision; không tuyên bố publish/deploy thành công nếu chưa có credential/evidence.
- Sau khi tool được chọn, tạo và tài liệu hóa command thật cho install/dev/build/lint/typecheck/test/migrate/compose.

## 5. Ngoài phạm vi

- Identity/account/admin business flow, Auth0 login hoạt động và RBAC implementation (P2).
- Catalog (P3), plan/subscription/entitlement (P4), quota/reconciliation (P5).
- Sample Data Plane runtime hoặc E2E (P6), app còn lại (P7), production DR (P8), billing (P9).
- Triển khai toàn bộ 25 domain tables. Chỉ baseline schema/migration đủ chứng minh mechanism; bảng chỉ được thêm khi phase scope rõ.
- Business user/admin page; shell không được giả lập dữ liệu/quyền.
- Mobile/native app, API gateway, Redis ledger, outbox hoặc tách worker thành microservice.
- Tự chọn library ngoài stack/decision đã approve.

## 6. Deliverables

- Approved workspace/layout decision và pinned tool/runtime manifests.
- Next.js user/admin/auth/BFF shell responsive, không business capability.
- NestJS/Fastify modular shell với shared API/worker code và boundaries kiểm được.
- OpenAPI 3.1 skeleton + error/correlation conventions.
- Drizzle migration baseline tạo/quản lý `control_plane` theo role đã duyệt; migration smoke test.
- Pinned private Supabase Compose skeleton, Caddy topology/config skeleton và secret-free env example.
- Health/liveness/readiness endpoints/checks với dependency semantics.
- CI quality/build/container skeleton và GHCR wiring không chứa credential.
- Command reference được sinh từ script thật sau decisions; clean-clone bootstrap evidence.
- Foundation test suite và rollback/cleanup instructions.

## 7. Target paths

Các path sau là target cần finalize ở đầu P1, không phải khẳng định hiện đang tồn tại:

```text
apps/web/
  app/(user)/
  app/admin/
  app/auth/
  # BFF handlers/server boundary theo Next.js convention đã chọn
apps/control-plane/
  src/main-api.*
  src/main-worker.*
  src/modules/
  drizzle/migrations/
contracts/openapi/
integrations/
tests/
infra/compose/
infra/caddy/
.github/workflows/
```

P1 phải approve/finalize layout và tên extension/config cụ thể, nhưng giữ các canonical path xuyên plan: `apps/control-plane/drizzle/migrations/`, `apps/control-plane/src/main-api.*`, `apps/control-plane/src/main-worker.*` và `.github/workflows/`. Shared package placement chỉ được ghi sau workspace/framework decision.

## 8. DB/migration

- Pin image/version của official Supabase self-hosted Compose theo approval; không dùng floating tag.
- Chỉ expose application qua Caddy; PostgreSQL, Supavisor, Studio và Supabase internal services ở private/internal network.
- Runtime nghiệp vụ kết nối PostgreSQL qua Supavisor; migration dùng role/connection riêng.
- Spike chứng minh transaction pinning, DB clock, row lock và isolation behavior trên pooling mode đã chọn; không dùng session-level advisory lock/temp table/session state.
- Migration baseline tại `apps/control-plane/drizzle/migrations/` tạo schema `control_plane`, role/grant tối thiểu và một non-business mechanism check nếu cần. Không triển khai toàn bộ schema 25 bảng.
- Drizzle Kit dùng forward migration đã review; custom SQL mechanism phải hỗ trợ constraint/trigger khi phase sau cần.
- Migration smoke từ database sạch: apply, inspect expected schema/grant, chạy lại theo documented policy, và kiểm failure không để state mơ hồ.
- Runtime role không có `CREATE`, `ALTER`, `DROP`, disable trigger hoặc quyền Studio/migration.
- Rollback chỉ cho baseline chưa nhận traffic/data; sau write ưu tiên forward-fix.

## 9. Backend API

- NestJS dùng Fastify adapter, TypeScript strict và modular-monolith boundary.
- API prefix version theo contract target `/v1`; browser auth routes chưa được implement ở P1.
- OpenAPI 3.1 skeleton là contract source/artifact theo decision gate; CI phát hiện invalid/drift theo tool đã chọn.
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
- Middleware/hook nhận hoặc tạo `X-Correlation-Id`, validate format theo contract, trả header/envelope và truyền vào structured context; không log secret/token.
- Liveness chỉ chứng minh process/event loop đáp ứng; readiness phản ánh dependency bắt buộc theo policy đã duyệt; health không lộ config/secret/internal topology.
- `main-worker` khởi tạo cùng module/application code cần thiết nhưng không expose public API và không đọc table trực tiếp.

## 10. User web

- Một Next.js codebase responsive cho desktop, điện thoại và máy tính bảng.
- `(user)` chỉ có app/layout shell, navigation placeholder trung tính, loading/error/not-found foundation; không hiển thị catalog, plan, usage hoặc fake account.
- `auth` chỉ đặt route/boundary placeholder cần cho P2; không tuyên bố login/callback/logout hoạt động.
- BFF server boundary được scaffold để browser không gọi service API bằng M2M credential.
- Foundation accessibility: semantic landmarks, keyboard/focus baseline, reduced-motion/color contrast policy theo review và error announcement.

## 11. Admin web

- `admin` nằm trong cùng responsive Next.js codebase, không tạo app admin thứ hai.
- Shell có server-side guard boundary mặc định deny. Vì P2 chưa có identity/RBAC, P1 không cấp quyền admin và không tạo bypass/dev super-admin.
- Route/action/handler admin đều phải đi qua guard contract; client-side hiding chỉ là UX.
- Không có form mutation, dashboard dữ liệu hoặc role giả.

## 12. Integration/security

- BFF, Control Plane API/worker, PostgreSQL/Supavisor, Caddy và CI có trust boundary documented.
- Env example chỉ có tên biến, mô tả/required scope và non-secret placeholder rõ ràng; secret thật không commit, bake vào image, log hoặc client bundle.
- CORS/origin/CSP/image policy chỉ cấu hình theo P0 approval; default không mở wildcard để “dev cho tiện”.
- Caddy route chỉ tới web/API cần thiết; internal Supabase endpoint không public.
- Container chạy với least privilege/read-only filesystem khi khả thi theo spike; image provenance/tag strategy được ghi.
- Dependency pin/lockfile và generated OpenAPI handling theo approved supply-chain policy.
- M2M/Auth0 wiring thực tế deferred P2; P1 chỉ tạo config boundary, không dùng shared/example credential có hiệu lực.

## 13. Contract freeze

Trước khi các lane code song song, orchestrator lập manifest file-level owner và architect chỉ review/freeze; architect không write contract, config hay implementation:

1. Exact runtime/tool decisions và approved versions.
2. Monorepo paths, workspace/module boundaries và manifest ánh xạ từng file/glob sang đúng một writer có quyền.
3. Script names/semantics dự kiến, nhưng command chỉ được tài liệu hóa là chạy được sau khi script tồn tại và được chạy.
4. Health endpoints/semantics, OpenAPI source/artifact, error envelope và correlation behavior.
5. Env variable contract, ports/network exposure, DB roles và migration lifecycle.
6. User/admin/auth/BFF shell routes; admin deny-by-default server guard boundary.
7. CI jobs/artifacts/cache/GHCR behavior và credential limitation; `infra/**`, `.github/workflows/**` và root workspace/config có approval cụ thể của người dùng ở đầu phase.

Manifest phải chỉ ra một writer cho từng shared/root file và `contracts/openapi/**`. Mặc định orchestrator sở hữu các path infrastructure/CI/root sau user approval; chỉ được giao lại path chính xác cho agent hiện hữu có quyền phù hợp. Không có lane hoặc owner tên `Infrastructure`.

Contract change sau freeze cần versioned note, impact review cho frontend/backend/tester và re-freeze; không sửa một lane âm thầm.

## 14. Tests

Tool cụ thể chờ decision gate. Baseline sau khi chọn phải có:

- Clean install từ lockfile và clean-clone bootstrap test.
- Strict typecheck, lint/format policy checks và production build cho web/API/worker.
- Unit baseline cho error envelope/correlation validation và module-boundary rule nếu tool hỗ trợ theo decision.
- Web smoke cho `(user)`, denied `admin`, loading/error/not-found; keyboard/focus và responsive viewport checks.
- API liveness/readiness tests, safe error/no-stack/no-secret assertions và correlation propagation.
- Worker startup/shutdown smoke; xác nhận không public port ngoài contract và dùng public application boundary.
- Compose config validation, private-network exposure check và container health.
- Migration smoke từ DB sạch với migration/runtime role separation.
- Supavisor spike cho transaction pinning/isolation/row-lock behavior; đây là evidence kỹ thuật, chưa phải hard-quota test.
- OpenAPI 3.1 validation/drift test theo tool đã approve.
- Secret scan/config test trong source, env example, image metadata và CI log ở mức tool đã duyệt.

Load tool có thể được chọn ở P1 nhưng hard-quota/load scenario nằm P5. Sample Data Plane E2E nằm P6.

## 15. Ordered steps

1. Xác nhận P0 gate và mở từng technical decision/spike; lưu owner/approver/evidence.
2. Xin người dùng phê duyệt cụ thể việc sửa `infra/**`, `.github/workflows/**` và root workspace/config trong P1; chưa có approval thì giữ các phần này `blocked`.
3. Chốt Node exact, package manager/workspace và target paths; pin versions/lockfile policy.
4. Chốt lint/format, test, UUIDv7, OpenAPI và Auth0 SDK decisions; sample app runtime giữ deferred P6.
5. Chạy Supavisor và Caddy topology spike sau approval phù hợp; freeze DB/network assumptions.
6. Orchestrator lập manifest file-level owner với một writer có quyền cho từng shared/root/OpenAPI file; architect chỉ review và freeze foundation contract/ownership.
7. Writer được manifest giao bootstrap workspace/strict TypeScript; chỉ lúc này mới tạo script thật theo decisions.
8. Frontend dựng responsive user/admin/auth/BFF shell với server-side admin deny boundary.
9. Backend dựng NestJS/Fastify modules, API/worker entrypoints, health/error/correlation và migration baseline; chỉ write OpenAPI file nếu manifest giao.
10. Orchestrator dựng pinned private Compose/Caddy/env/role và CI/GHCR skeleton sau user approval, hoặc giao path chính xác cho agent hiện hữu có quyền phù hợp trong manifest.
11. Tester thêm baseline/smoke/migration/contract tests theo frozen contract.
12. Integration từ clean clone; chạy **các command thật vừa được tạo** và lưu output/evidence. Không dùng command mẫu trong tài liệu thay evidence.
13. QA và reviewer chạy độc lập; owner sửa lỗi, tối đa ba vòng.
14. Document cập nhật command/path thực tế và status sau verification.

## 16. Parallel lanes và ownership

Chỉ bắt đầu song song sau contract freeze.

| Lane | Path/công việc sở hữu | Ranh giới |
|---|---|---|
| Frontend | `apps/web` user/admin/auth/BFF shell | Không implement Control Plane/DB/test expectation; admin guard server-side. |
| Backend | `apps/control-plane` và migration baseline; `contracts/openapi/**` chỉ khi manifest giao | Không tự nhận shared/root/OpenAPI file, sửa UI/test hoặc microservice hóa worker. |
| Tester | `tests` và test-only fixtures/config theo tool duyệt | Không sửa product code hay hạ kỳ vọng để pass. |
| Orchestrator hoặc agent hiện hữu được giao rõ | `infra/**`, `.github/workflows/**`, root workspace/config sau user approval cụ thể | Mặc định orchestrator là owner; chỉ giao path chính xác, phù hợp quyền và ghi manifest. Không có lane `Infrastructure`. |
| QA | Chạy clean-clone/gate/container/migration evidence | Read-only; command chưa có phải báo đúng là chưa có. |
| Reviewer | Boundary, security, reproducibility, rollback review | Read-only và độc lập. |
| Document | README/command/setup docs sau khi behavior được chạy thật | Không tuyên bố script/container/CI chạy nếu chưa có evidence. |

Contract freeze phải có manifest chỉ định đúng một writer có quyền cho `contracts/openapi/**` và từng shared/root file như workspace manifest/lockfile, root TypeScript config và `.github/workflows/**`; architect chỉ review/freeze, không write. Lane khác không sửa song song mà gửi thay đổi qua writer. Nếu path ownership thực tế khác target, contract freeze phải cập nhật trước; không để hai lane sửa cùng file.

## 17. Checklist

### Functional
- [ ] Người dùng đã phê duyệt cụ thể scope P1 cho `infra/**`, `.github/workflows/**` và root workspace/config trước khi các file đó được sửa.
- [ ] Contract freeze có manifest file-level owner; mỗi shared/root/OpenAPI file có đúng một writer hiện hữu với quyền phù hợp, architect chỉ review/freeze.
- [ ] Workspace/layout được approve và bootstrap từ clean clone bằng script thật.
- [ ] Web, API và worker production build thành công; API/worker dùng cùng Control Plane code.
- [ ] Liveness/readiness/error/correlation/OpenAPI baseline đúng frozen contract.
- [ ] User/admin shell không có fake business capability; admin mặc định deny server-side.

### Security
- [ ] Không có secret/token/credential thật trong source, env example, image hoặc CI output.
- [ ] Supabase/Studio/Supavisor không public; Caddy chỉ expose route đã duyệt.
- [ ] BFF/client boundary không đưa server secret/M2M config vào browser bundle.
- [ ] CORS/CSP/image/proxy và admin guard tuân decision đã approve, không wildcard/dev bypass.

### DB
- [ ] Supabase Compose/image được pin; runtime và migration role tách quyền.
- [ ] `control_plane` migration baseline apply được từ DB sạch và smoke test pass.
- [ ] Không triển khai toàn bộ 25 domain tables ngoài scope.

### Concurrency
- [ ] Supavisor mode chứng minh transaction pinning/row-lock/isolation assumptions; không dựa session affinity.
- [ ] Startup/migration song song có outcome rõ, không để schema half-applied theo test đã freeze.

### Accessibility
- [ ] Shell dùng semantic landmarks, keyboard navigation, visible focus và accessible error/loading behavior.
- [ ] Automated baseline và manual keyboard review đã chạy theo tool/process duyệt.

### Responsive
- [ ] Cùng một Next.js codebase hoạt động ở viewport desktop, điện thoại và máy tính bảng.
- [ ] User/admin shell không overflow hoặc che navigation/action quan trọng ở viewport đã freeze.

### Observability
- [ ] Correlation ID truyền qua web/BFF/API/log/error; invalid input xử lý theo contract.
- [ ] Health/log không lộ secret, stack trace hoặc private topology; startup/shutdown có signal hữu ích.

### Rollback
- [ ] Compose/DB/web/API/worker cleanup và baseline rollback/forward-fix criteria được tài liệu hóa và thử trên môi trường không dữ liệu.
- [ ] CI/container failure không publish/deploy artifact như thành công.

### Docs
- [ ] Setup và command reference chỉ liệt kê command/script đã tồn tại và được chạy.
- [ ] Path/version/env/health/migration/CI docs khớp source/config thực tế.
- [ ] Tài liệu vẫn nói rõ business feature chưa được implement.

## 18. Exit gate

P1 chỉ `verified` khi có evidence từ một clean clone/environment sạch rằng:

1. Exact runtime/package/tool decisions được approve, pin và nhất quán; sample app runtime vẫn deferred P6.
2. Install cùng lockfile và mọi command thật cho dev/build/lint/typecheck/test/migrate/compose được tạo, tài liệu hóa và QA chạy theo contract. Không yêu cầu tên lệnh trước khi decision/script tồn tại.
3. Web, API và worker build; baseline tests/typecheck/lint/OpenAPI validation pass.
4. Containers đạt health semantics; chỉ web/API route được expose, Supabase endpoints private.
5. Migration baseline apply từ DB sạch; runtime role không có migration privilege; Supavisor spike pass.
6. User/admin shell responsive/accessibility baseline pass; direct admin request bị deny server-side khi chưa có authorization.
7. CI chạy cùng quality/build/test/migration checks; GHCR step an toàn khi credential thiếu và không lộ secret. Publish success chỉ được ghi nếu thật sự chạy có quyền.
8. Secret scan/review không tìm secret thật.
9. QA `PASS`, reviewer không còn mục “phải sửa”, docs khớp evidence.

## 19. Stop/rollback

- Dừng trước implementation nếu thiếu bất kỳ technical decision gate ảnh hưởng phần đang làm; không tự thêm library.
- Dừng nếu official Compose/version không pin được, Supavisor không chứng minh transaction semantics, private network không bảo đảm, hoặc thiếu credential/quyền để kiểm gate bắt buộc.
- Cùng lỗi lặp lần thứ hai: ghi verification outcome metadata **TẮC** và yêu cầu quyết định; hết ba vòng: ghi outcome metadata **CẠN LƯỢT**. Hai outcome không thay canonical phase status.
- Khi contract đổi, dừng lane bị ảnh hưởng, re-freeze rồi mới sửa; không sửa test để hợp thức hóa implementation.
- Trước traffic/data, rollback bằng teardown artifact/container và baseline migration rollback đã review. Sau write, ưu tiên forward-fix; không xóa history hoặc sửa migration đã apply.
- CI/GHCR không có credential: kiểm được dry/config/build phần không cần secret, nhưng không tuyên bố publish đã verified.

## 20. QA/reviewer sign-off

| Gate | Trạng thái | Evidence/người ký |
|---|---|---|
| QA clean clone, commands, builds, tests, compose, migration, exposure | `pending` | Chưa có command/config/implementation để chạy. |
| Reviewer architecture, module boundary, security, rollback, docs | `pending` | Chưa có implementation để review. |
| Orchestrator xác nhận P1 exit gate | `pending` | Chỉ sau QA PASS và không còn mục reviewer “phải sửa”. |

Tác giả implementation không tự thay thế sign-off độc lập.
