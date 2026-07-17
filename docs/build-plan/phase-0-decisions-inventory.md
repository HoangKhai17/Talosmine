# Phase 0 — Decisions và inventory

## 1. Trạng thái

`in_progress` — cổng **P0→P1 đã đạt** (2026-07-17). Các cổng còn lại vẫn `blocked` vì thiếu quyết định nghiệp vụ của chủ dự án.

P0 không tạo implementation. Đây là canonical phase status; `TẮC`/`CẠN LƯỢT` nếu xảy ra chỉ là verification outcome metadata.

### Cổng theo từng phase

P0 **không phải một cổng nguyên khối**. Bản trước gộp mọi quyết định vào một exit gate duy nhất, khiến P0 tự khóa chính nó: bootstrap không thể bắt đầu chỉ vì chưa chốt quota window — hai thứ chẳng liên quan gì đến nhau. Nay P0 mở từng cổng theo phase mà quyết định thực sự chặn.

| Cổng | Yêu cầu | Trạng thái |
|---|---|---|
| **P0→P1** | DEC-T01…T13 (tooling, image/CSP/proxy) | `verified` 2026-07-17 |
| P0→P2 | DEC-B03 (Auth0 tenant), DEC-B04, DEC-B10, DEC-T14 | `blocked` |
| P0→P3 | DEC-B01 (danh sách app), DEC-B05 | `blocked` |
| P0→P4 | DEC-B04, DEC-B09, DEC-B10 | `blocked` |
| P0→P5 | DEC-B05…B08 | `blocked` |
| P0→P6 | DEC-B01, DEC-B02 (sample app) | `blocked` |
| P0→P7 | DEC-B01, DEC-B05 | `blocked` |
| P0→P8 | DEC-B11, DEC-B12 | `blocked` |
| P0→P9 | DEC-B13 + approval riêng | `deferred` |

Nguồn sự thật cho mọi cổng là [`decision-register.md`](./decision-register.md). Bảng trên chỉ là chỉ mục; không sửa trạng thái ở đây mà không sửa register.

## 2. Mục tiêu

Biến các điểm còn mở trong kiến trúc thành decision record có owner, approver, testable outcome và blocker mapping; kiểm kê app để các phase sau không đoán protected surface, metric, policy hoặc vận hành.

Mục tiêu **không phải** là chốt mọi thứ trước khi làm bất cứ việc gì. Mục tiêu là mỗi phase chỉ bị chặn bởi đúng những quyết định nó thật sự cần.

## 3. Prerequisites và human decisions

Prerequisite là đọc và đối chiếu `../index.md`, `../modular.md`, `../database-schema.md`, `../stack-tech.md` và `../../AGENTS.md`.

### Mô hình phê duyệt (DEC-G01)

Dự án là **solo dev + AI agents**. Không có Product owner, Security officer, Legal/Privacy hay Operations team riêng biệt — các vai đó trong bản trước mô tả một tổ chức không tồn tại, và đòi hỏi sign-off chéo giữa những vai không có người đảm nhiệm là lý do P0 không bao giờ đóng được.

- **Chủ dự án** là approver duy nhất cho mọi quyết định nghiệp vụ, bảo mật, vận hành.
- **Agent** đề xuất, soạn record, thực thi — nhưng không tự approve thay con người.
- **Ngoại lệ đã ủy quyền:** chủ dự án ủy quyền cho agent chốt nhóm quyết định **kỹ thuật** (tooling/version) trong phiên 2026-07-17. Phạm vi giới hạn ở lựa chọn tool và version; không mở rộng sang stack đã duyệt hay bất kỳ giá trị nghiệp vụ nào.
- **Vẫn giữ tách lane `qa` và `reviewer`** khỏi lane viết code. Đây không phải nghi thức: theo `../../AGENTS.md` mục 4b, agent viết code không được tự tuyên bố code mình đạt chuẩn. Cơ chế chống tự lừa này giữ nguyên.

### Trạng thái các nhóm quyết định

Chi tiết đầy đủ ở [`decision-register.md`](./decision-register.md). Tóm tắt:

| Nhóm | Record | Trạng thái | Chặn phase |
|---|---|---|---|
| Tooling, runtime, version | DEC-T01…T11, T13, T15 | `approved` | — |
| Image/CSP/proxy | DEC-T12 | `approved` | — |
| Auth0 topology (cấu trúc) | DEC-T14 | `proposed` | P2 |
| Danh sách app và owner | DEC-B01 | `open` | P3, P6, P7 |
| Sample app | DEC-B02 | `open` | P6 |
| Auth0 tenant thật | DEC-B03 | `open` | P2 |
| Account activation/default plan | DEC-B04 | `open` | P2, P4 |
| Metric/unit/amount | DEC-B05 | `open` | P3, P5–P7 |
| Counting/failure | DEC-B06 | `open` | P5–P7 |
| Window/timezone/DST | DEC-B07 | `open` | P5 |
| Reservation TTL/late success | DEC-B08 | `open` | P5–P7 |
| Subscription lifecycle | DEC-B09 | `open` | P4, P9 |
| Revoke/outage/LKG | DEC-B10 | `open` | P2, P4, P6–P8 |
| Retention/privacy | DEC-B11 | `open` | P2, P5, P8 |
| RPO/RTO | DEC-B12 | `open` | P8 |
| Payment provider | DEC-B13 | `open` | P9 |

Không điền "default hợp lý" vào bất kỳ ô `open` nào.

### Blocker lớn nhất còn lại

**DEC-B01 — danh sách ứng dụng của Hub.** Toàn bộ kiến trúc mô tả một Hub cho "khoảng 10 ứng dụng trở lên", nhưng danh sách đó **không tồn tại ở bất kỳ đâu trong repo**. Không có nó thì không thể inventory route/action/worker, không thể chốt metric, không thể chọn sample app.

Điều này **không chặn P1**. Bootstrap không cần biết app nào sẽ được onboard.

## 4. Phạm vi

### Inventory từng ứng dụng — `blocked` bởi DEC-B01

Mỗi app phải có một record theo template dưới đây. Bảng hiện **trống** vì DEC-B01 chưa chốt; không điền app giả để lấp chỗ.

| Field | Nội dung cần thu thập |
|---|---|
| Identity/ownership | Tên, owner kỹ thuật/product, repo, runtime/deploy boundary, domain/environment. |
| User entry | Hub launch URL, direct URL, login/callback/logout URL và return URL allowlist. |
| Protected routes | Mọi page/API route cần authentication, entitlement, domain authorization và quota. |
| Protected actions | Read/mutation/upload/export/long-running action; điểm server-side enforce; input ownership. |
| Workers/jobs | Queue/cron/background callback, cách mang user/service context và reservation; retry/timeout path. |
| Direct access/bypass | Direct URL, deep link, API call, server action, webhook/internal endpoint có thể bỏ qua UI/Hub. |
| Feature/metric | Stable key dự kiến, unit, amount, counting point, failure behavior, window, TTL — để trống nếu chưa duyệt. |
| Data/domain auth | Resource ownership/tenant boundary của app; dữ liệu nào không được gửi Control Plane. |
| Service identity | Backend nào cần M2M identity riêng; audience và exact feature/metric capability cần thiết. |
| Observability | Correlation propagation, log/metric/audit cần có, alert owner. |
| Rollout/rollback | Cách disable integration/feature an toàn, fail-closed impact, data compatibility. |

Sample app (DEC-B02) phải đại diện được direct URL, backend protected action và worker/async path. Nếu không app nào đại diện đủ, record phải nêu phạm vi sample hoặc yêu cầu hơn một sample; agent không tự chọn.

### Decision register

Đã tồn tại tại [`decision-register.md`](./decision-register.md). Mỗi record có `decisionId`, quyết định, lý do, bằng chứng, affected phase và trạng thái. Record `proposed` vẫn là blocker.

## 5. Ngoài phạm vi

- Không tạo DB/schema/migration/seed.
- Không tạo REST/OpenAPI endpoint hoặc BFF route.
- Không tạo user/admin UI, Auth0 tenant config, M2M client hay Google connection.
- Không bootstrap package, command, container hoặc CI — đó là P1.
- Không chọn payment provider hoặc triển khai billing.

Lưu ý thay đổi so với bản trước: mục "không chọn library/tool kỹ thuật dành cho Phase 1" **đã bị gỡ**. Việc trì hoãn mọi lựa chọn tool sang P1, trong khi P1 lại coi chúng là prerequisite từ P0, tạo ra một vòng lặp chết. Nay tool được chốt tại register (nhóm A) và P1 thực thi.

## 6. Deliverables

- [x] Decision register với đầy đủ record kỹ thuật đã approve — [`decision-register.md`](./decision-register.md).
- [x] Bảng version pin đọc từ registry thật, không lấy từ trí nhớ — register mục D.
- [x] Bảng tên script canonical (DEC-T15) — register mục E.
- [x] Image/CSP/proxy policy (DEC-T12).
- [x] Traceability `decision -> phase` — register mục C.
- [x] Cổng P0 tách theo từng phase — mục 1.
- [ ] Inventory app — `blocked` bởi DEC-B01.
- [ ] Auth0 topology thật — `proposed` (DEC-T14), chờ DEC-B03.
- [ ] Admin permission matrix — dẫn xuất từ `../modular.md` mục 11, cần chốt ở cổng P0→P2.
- [ ] Threat inventory cho direct access, callback/redirect, BFF/admin, M2M, worker — phần image proxy/CSP đã có tại DEC-T12; phần còn lại chờ inventory app.
- [ ] Retention matrix, RPO/RTO — `open` (DEC-B11, DEC-B12).

## 7. Target paths

Chỉ tài liệu trong `docs/build-plan/`. P0 không tạo source path.

## 8. DB/migration

N/A — P0 không implementation DB. P0 chỉ xác nhận decision nào ảnh hưởng 25-table design, temporal semantics, retention, role/grant và migration; không tạo bảng.

Ghi chú đã chốt ảnh hưởng DB: DEC-T06 (UUIDv7 sinh ở application layer, không dùng extension DB) và DEC-T09 (driver `postgres.js` với `prepare: false`, cấm mọi cơ chế phụ thuộc session state như advisory lock hay temp table — ràng buộc cứng cho hard quota ở P5).

## 9. Backend API

N/A — không tạo API. Đã chốt DEC-T07: OpenAPI là **spec-first**, file viết tay tại `contracts/openapi/control-plane.v1.yaml`, validate bằng `@redocly/cli`. Quyết định này là điều kiện cần để build plan giữ được thứ tự "freeze contract trước, ba lane code song song sau".

## 10. User web

N/A — không tạo UI. Đã chốt DEC-T12 (CSP baseline, ảnh qua Next image proxy, không mở `remotePatterns`).

## 11. Admin web

N/A — không tạo UI. Permission matrix dẫn xuất từ `../modular.md` mục 11 và chốt ở cổng P0→P2. Admin bootstrap ceremony là blocker của P2, không phải P1: P1 để admin **deny mặc định**, không tạo bypass hay dev super-admin.

## 12. Integration/security

- Kiểm kê trust boundary: browser ↔ BFF, BFF ↔ Control Plane, Data Plane ↔ Auth0/Control Plane, worker ↔ application port, Caddy ↔ private services.
- Mỗi protected path ghi rõ authentication, entitlement, domain authorization, quota và service scope nào áp dụng; `N/A` cần lý do. **`blocked` bởi DEC-B01.**
- Test negative cần có: direct URL/API, forged `accountId`, wrong issuer/audience, cross-app feature/metric, missing/revoked scope, open redirect, CSRF, replay.
- Credential owner/rotation/revoke được ghi mà không đưa secret vào docs.
- **Mặc định fail-closed** cho authentication, high-risk entitlement và hard quota cho tới khi DEC-B10 chốt. Đây là mặc định an toàn, không phải quyết định bị bỏ trống.
- Đã chốt tại DEC-T12: chặn private/link-local address cho `launch_url` để chống SSRF, thực thi ở application layer.

## 13. Contract freeze

P0 freeze **decision contract**, chưa freeze endpoint. Freeze theo từng cổng, không phải một lần cho tất cả:

1. Thuật ngữ/key không mâu thuẫn giữa register và docs nguồn.
2. Mỗi quyết định `approved` có lý do và bằng chứng kiểm chứng được.
3. Mỗi item `open` map tới đúng phase bị block.
4. Không có giá trị nghiệp vụ nào bị agent điền thay chủ dự án.
5. Billing vẫn deferred P9.

**Cổng P0→P1 đã freeze** 2026-07-17: đủ 5 điều kiện trên trong phạm vi các quyết định chặn P1.

Thay đổi decision đã approve phải tạo record superseding, đánh giá impact và reopen phase liên quan nếu cần.

## 14. Tests

Review/test-design, không phải automated test run — P0 không có code.

- [x] Version pin được kiểm chứng từ nguồn thật (`npm view`, `nodejs.org/dist/index.json`) chứ không từ trí nhớ.
- [x] Kiểm chứng Node 24 là dòng Active LTS tại thời điểm bootstrap (không phải Node 25/26).
- [x] Kiểm chứng NestJS 11 không tuyên bố hỗ trợ TypeScript 7 → chốt TS 5.9.3 có lý do.
- [ ] Tabletop scenarios cho signup/activation/default plan — chờ DEC-B04.
- [ ] Boundary tables cho subscription/window/timezone/DST/TTL — chờ DEC-B07, DEC-B08, DEC-B09.
- [ ] Route/action/worker bypass review — chờ DEC-B01.
- [ ] Threat-model abuse cases cho admin bootstrap, Auth0, M2M, BFF — chờ DEC-B03.
- [ ] Traceability: mỗi protected path có positive/negative acceptance case — chờ DEC-B01.

## 15. Ordered steps

P0 không tạo implementation nên mọi **Sản phẩm** là tài liệu và mọi **Verify** là review/evidence, không phải lệnh build.

**P0.1 — Chốt nhóm quyết định kỹ thuật** ✅ *hoàn thành 2026-07-17*
- Hành động: đọc version thật từ npm registry và `nodejs.org/dist/index.json`; chốt runtime, package manager, TypeScript, lint, test, UUIDv7, OpenAPI, Auth0 SDK, DB driver, Supabase, Caddy, CI; ghi lý do và bằng chứng cho từng record.
- Sản phẩm: [`decision-register.md`](./decision-register.md) nhóm A + bảng D.
- Phụ thuộc: ủy quyền của chủ dự án cho nhóm quyết định kỹ thuật.
- Verify: mỗi record có version cụ thể + bằng chứng nguồn; không record nào lấy version từ trí nhớ; các lựa chọn đi ngược mặc định (TS 5.9.3 thay vì `latest` 7.0.2) có lý do ghi rõ.
- Lane: `orchestrator`.

**P0.2 — Chốt image/CSP/proxy** ✅ *hoàn thành 2026-07-17*
- Hành động: chốt image host, CSP baseline, chiến lược proxy và policy chống SSRF cho `launch_url`.
- Sản phẩm: DEC-T12.
- Phụ thuộc: P0.1.
- Verify: đây là mục duy nhất trong bảng quyết định có "Block phase = P1"; sau khi chốt, không còn quyết định P0 nào chặn bootstrap.
- Lane: `orchestrator`.

**P0.3 — Chốt tên script canonical** ✅ *hoàn thành 2026-07-17*
- Hành động: định nghĩa bảng tên lệnh dùng chung để mọi phase tham chiếu thay vì tự đặt tên.
- Sản phẩm: DEC-T15 (register mục E).
- Phụ thuộc: P0.1.
- Verify: mọi ô Verify của P1–P8 dùng được tên lệnh từ bảng này; không file phase nào còn `‹cần chốt: script thật sau bootstrap›`.
- Lane: `orchestrator`.

**P0.4 — Tách cổng P0 theo phase và mở P0→P1** ✅ *hoàn thành 2026-07-17*
- Hành động: thay exit gate nguyên khối bằng cổng theo từng phase; map mỗi cổng tới đúng tập quyết định nó cần.
- Sản phẩm: mục 1 file này + register mục C.
- Phụ thuộc: P0.1–P0.3.
- Verify: cổng P0→P1 không tham chiếu bất kỳ quyết định nghiệp vụ nào; các cổng còn lại vẫn `blocked` và nêu đúng blocker.
- Lane: `orchestrator`; `architect` review.

**P0.5 — Chốt danh sách app và owner** 🔴 *blocker chính*
- Hành động: chủ dự án liệt kê các app của Hub, owner từng app, repo/domain/runtime.
- Sản phẩm: DEC-B01 chuyển `approved`; bảng inventory mục 4 được điền.
- Phụ thuộc: **chỉ chủ dự án**. `‹cần chốt: DEC-B01 danh sách app›`.
- Verify: mỗi app có owner và ranh giới deploy; không app nào do agent bịa ra.
- Lane: chủ dự án quyết định; `document` ghi lại.

**P0.6 — Inventory route/action/worker/direct URL từng app**
- Hành động: với mỗi app, thu thập user/admin route, API/action, worker/job, direct/deep URL và enforcement point hiện có theo template mục 4.
- Sản phẩm: per-app inventory record dưới `docs/build-plan/`.
- Phụ thuộc: P0.5.
- Verify: mỗi protected path ghi rõ authentication/entitlement/domain-auth/quota áp dụng hoặc `N/A` kèm lý do.
- Lane: `frontend` (route/image/CSP), `backend` (API/action/worker/data boundary).

**P0.7 — Chọn sample app cho P6**
- Hành động: chọn app đại diện được direct URL, backend protected action và worker/async path.
- Sản phẩm: DEC-B02 chuyển `approved`.
- Phụ thuộc: P0.6. `‹cần chốt: DEC-B02 sample app›`.
- Verify: record nêu rõ path nào được đại diện **và path nào không**; nếu một app không đủ, ghi yêu cầu nhiều sample thay vì chọn bừa.
- Lane: chủ dự án quyết định; `architect` đề xuất tiêu chí.

**P0.8 — Chốt Auth0 tenant thật (mở cổng P0→P2)**
- Hành động: chủ dự án cung cấp tenant/environment, issuer, audience; đối chiếu với cấu trúc đề xuất tại DEC-T14.
- Sản phẩm: DEC-B03 `approved`; DEC-T14 chuyển từ `proposed` sang `approved`.
- Phụ thuộc: **chỉ chủ dự án** — cần tài khoản Auth0. `‹cần chốt: DEC-B03 Auth0 tenant/issuer/audience›`.
- Verify: topology inventory **không chứa secret**; callback/logout URL exact match, không wildcard; mỗi backend có M2M app riêng.
- Lane: chủ dự án cung cấp; `architect` review; `document` ghi.

**P0.9 — Chốt metric/counting/window/TTL (mở cổng P0→P5)**
- Hành động: với mỗi action tính lượt, chốt metric key, unit, amount, counting point, failure treatment, window type/timezone/DST và reservation TTL.
- Sản phẩm: DEC-B05…B08 `approved` + boundary examples testable.
- Phụ thuộc: P0.6. `‹cần chốt: DEC-B05…B08›`.
- Verify: mỗi metric có ví dụ trước/tại/sau reset và DST case; mỗi loại failure có expected `commit|cancel|anomaly`; không giá trị nào do agent điền.
- Lane: chủ dự án quyết định; `tester` chuyển thành scenario.

**P0.10 — Chốt lifecycle, revoke SLA, retention, RPO/RTO**
- Hành động: chốt subscription lifecycle timing/terminal branch, revoke SLA, outage/LKG, retention matrix và RPO/RTO.
- Sản phẩm: DEC-B09…B12 `approved`.
- Phụ thuộc: P0.5. `‹cần chốt: DEC-B09…B12›`.
- Verify: SLA và retention đo được; RPO/RTO có tiêu chí pass/fail cho restore drill; chưa chốt thì phase phụ thuộc giữ `blocked` và mặc định fail-closed.
- Lane: chủ dự án quyết định; `document` ghi.

**P0.11 — Threat model và traceability cho phần còn lại**
- Hành động: dựng threat inventory cho direct access, callback/redirect, BFF/admin, M2M, worker; map threat → control → phase/test.
- Sản phẩm: threat inventory + traceability matrix dưới `docs/build-plan/`.
- Phụ thuộc: P0.6, P0.8.
- Verify: mỗi trust boundary mục 12 có ít nhất một negative case; không protected path bỏ trống.
- Lane: `architect` + `reviewer`; `tester` chuyển thành negative test design.

**P0.12 — Mở các cổng còn lại**
- Hành động: khi một nhóm quyết định đủ, cập nhật register mục C và bảng cổng mục 1; thông báo phase liên quan được mở.
- Sản phẩm: cập nhật register + mục 1.
- Phụ thuộc: theo từng cổng.
- Verify: cổng chỉ mở khi đúng tập quyết định của nó `approved`; không mở cổng bằng cách hạ yêu cầu.
- Lane: `orchestrator`; `reviewer` kiểm độc lập.

## 16. Parallel lanes và ownership

| Lane | Công việc P0 | Output |
|---|---|---|
| Chủ dự án | Quyết định nghiệp vụ: app list, sample app, Auth0 tenant, metric/quota, lifecycle, retention, RPO/RTO | Approval. Không agent nào thay thế được. |
| Orchestrator | Điều phối, soạn register, tách cổng, map blocker | Decision register + cổng theo phase. |
| Architect | Options/trade-off, threat model, consistency review | Đề xuất + freeze record; không tự approve thay người. |
| Frontend | Inventory user/admin route, auth transition, image flow | Route/image/CSP inventory; không code. |
| Backend | Inventory API/action/worker, data/auth/quota boundary | Backend/worker/DB impact matrix; không migration. |
| Tester | Chuyển decision thành scenario/boundary/negative test design | Test traceability; không bịa fixture value. |
| QA | Kiểm completeness, evidence, unresolved blocker | PASS/FAIL độc lập; không sửa docs. |
| Reviewer | Review kiến trúc, security/privacy, consistency | Mục phải sửa; không sửa docs. |
| Document | Chuẩn hóa docs sau approval | Tài liệu phản ánh đúng decision, không thêm quyết định. |

`qa` và `reviewer` giữ read-only theo `../../AGENTS.md` mục 4b — chúng không sửa được file, và đó chính là lý do kết luận của chúng đáng tin.

## 17. Checklist

### Functional
- [x] Quyết định kỹ thuật có record, version pin và bằng chứng nguồn.
- [x] Cổng P0 tách theo phase; P0→P1 đạt.
- [ ] Sample app và mọi app còn lại có owner, route/action/worker/direct URL inventory — `blocked` DEC-B01.
- [ ] Default plan/account activation và subscription lifecycle có decision/testable examples — `blocked` DEC-B04, DEC-B09.
- [ ] Metric/unit/amount/counting/failure/window/TTL được duyệt — `blocked` DEC-B05…B08.

### Security
- [x] Image hosting/CSP/proxy policy có allow/deny rõ và chống SSRF; không chứa secret.
- [ ] Admin permission/bootstrap matrix và Auth0 topology được approve — `blocked` DEC-B03.
- [ ] Revoke SLA, outage/LKG có measurable acceptance — `blocked` DEC-B10. Tới lúc đó: fail-closed.

### DB
- [x] Ràng buộc driver/pooling được ghi và map tới thiết kế hard quota (DEC-T09).
- [ ] Decision impact map tới schema/constraint/retention — một phần, chờ nghiệp vụ.

### Concurrency
- [x] Công cụ chứng minh concurrency được chốt: PostgreSQL thật qua testcontainers, không mock (DEC-T05).
- [ ] Scenario race cho identity provisioning, subscription overlap, quota/idempotency được ghi — chờ inventory.

### Accessibility
- [ ] Inventory ghi auth/error/loading/denied flow cần keyboard/focus/semantic acceptance — chờ DEC-B01.

### Responsive
- [x] Xác nhận một web codebase responsive cho desktop/điện thoại/máy tính bảng; không có mobile/native scope.

### Observability
- [ ] Correlation, log/metric/audit/alert expectation cho mỗi critical flow — chờ inventory.

### Rollback
- [x] Quyết định kỹ thuật có điều kiện xem lại (ví dụ TS 7 khi NestJS hỗ trợ) thay vì khóa cứng vĩnh viễn.
- [ ] Rollout app có disable/forward-fix path và stop trigger — chờ DEC-B01.

### Docs
- [x] Decision record có lý do, bằng chứng, trạng thái và blocker mapping.
- [x] Không có giá trị, command, package, API, DB hay UI nào được mô tả như đã tồn tại.

## 18. Exit gate

P0 **không có** một exit gate nguyên khối. Mỗi cổng `P0→Pn` đạt độc lập khi:

1. Đúng tập quyết định chặn `Pn` có status `approved` tại register.
2. Mỗi quyết định có lý do và bằng chứng kiểm chứng được, không phải "default hợp lý".
3. Không giá trị nghiệp vụ nào bị agent điền thay chủ dự án.
4. Traceability không có blocker vô chủ.
5. Reviewer xác nhận cổng không bị mở bằng cách hạ yêu cầu.

**Cổng P0→P1: đạt 2026-07-17.** P1 được mở.

P0 chỉ chuyển `verified` khi **mọi** cổng đã mở — tức là sau khi DEC-B01…B13 đều `approved`. Việc P0 chưa `verified` không chặn các phase đã có cổng mở.

## 19. Stop/rollback

- Dừng ngay khi cần **tự chọn một giá trị nghiệp vụ** để đi tiếp. Đó là TẮC, và TẮC là kết quả hợp lệ.
- Ranh giới ủy quyền: agent được chốt tool/version; agent **không** được chốt metric, quota, plan, SLA, retention, danh sách app hay payment provider. Vượt ranh giới này là lỗi nghiêm trọng nhất của P0.
- Cùng ambiguity lặp lần thứ hai: ghi **TẮC**, nêu đã thử gì và cần quyết định gì.
- Decision bị rút lại: mark `superseded`, đưa phase phụ thuộc về `blocked`, re-freeze.
- P0 không có product rollback. Không xóa lịch sử decision; dùng superseding record.
- Tối đa ba vòng; hết vòng chưa đạt thì ghi **CẠN LƯỢT**, không dùng làm phase status.

## 20. QA/reviewer sign-off

| Gate | Trạng thái | Evidence/người ký |
|---|---|---|
| Cổng P0→P1: quyết định kỹ thuật đủ và có bằng chứng | `pass` | Register nhóm A + bảng D; version đọc từ npm registry và nodejs.org ngày 2026-07-17. |
| Reviewer: cổng P0→P1 không chứa quyết định nghiệp vụ bị điền thay người | `pending` | Cần review độc lập trước khi P1 chạy lệnh thật. |
| QA inventory/approval/traceability toàn P0 | `pending` | `blocked` bởi DEC-B01. |
| Reviewer architecture/security/testability toàn P0 | `pending` | `blocked` bởi DEC-B01. |

Không dùng chính tác giả tài liệu làm bằng chứng QA/reviewer độc lập.
