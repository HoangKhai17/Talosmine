# Phase 0 — Decisions và inventory

## 1. Trạng thái

`blocked` — chưa có đủ quyết định và inventory được owner/approver xác nhận. Đây là canonical phase status; `TẮC`/`CẠN LƯỢT`, nếu xảy ra, chỉ là verification outcome metadata. Phase này không tạo implementation.

## 2. Mục tiêu

Biến các điểm còn mở trong kiến trúc thành decision record có owner, approver, deadline, testable outcome và blocker mapping; đồng thời kiểm kê sample app cùng mọi app còn lại để các phase sau không đoán protected surface, metric, policy hoặc vận hành.

## 3. Prerequisites và human decisions

Prerequisite là đọc và đối chiếu `docs/index.md`, `docs/modular.md`, `docs/database-schema.md`, `docs/stack-tech.md` và `AGENTS.md`. Các nhóm quyết định bắt buộc:

| Decision group | Câu hỏi phải chốt | Output có thể kiểm thử tối thiểu | Owner/approver | Block phase |
|---|---|---|---|---|
| Account activation/default plan | Account `pending` được activate khi nào; có tự tạo subscription/default plan không; version/effective time/migration rule nào? | State examples và expected transition/deny; không dùng tên/giá/quota giả. | Product + Security | P2, P4 |
| Metric/unit/amount | Stable `applicationKey`, `featureKey`, `metricKey`; unit; amount cho từng logical action. | Bảng action → metric/amount và positive/invalid examples. | Product + App owner | P3, P5–P7 |
| Counting/failure | Counting point là `start`, `milestone` hay `success`; từng loại user/app/dependency/timeout failure commit hay cancel. | Decision table và scenario expected `commit|cancel|anomaly`. | Product + App owner | P5–P7 |
| Window/timezone/DST | `calendar` hay `rolling`; boundary, anchor, IANA timezone, DST fold/gap; nếu rolling có phải exact sliding không. | Boundary examples trước/tại/sau reset và DST cases. | Product + Backend + Operations | P5 |
| Reservation TTL/late success | TTL theo workload; long-running/extension; xử lý success sau expiry/cancel; bằng chứng cuối. | Timeline scenarios và terminal transition expected. | Product + App owner + Operations | P5–P7 |
| Subscription lifecycle | Upgrade/downgrade/cancel immediate hay cuối kỳ; terminal state; usage vượt limit mới; dữ liệu feature mất quyền; suspension/expiry. | Timeline `[starts_at,effective_end)` và expected entitlement/usage outcomes. | Product + Legal/Operations khi cần | P4, P9 |
| Revoke/outage/LKG | Revoke SLA cho account/session/entitlement/service identity; feature nào fail-closed hoặc được `last-known-good`; TTL/invalidation và UX outage. | Measurable SLA, risk classification, cache/outage test cases. | Security + Product + Operations | P2, P4, P6–P8 |
| Retention/privacy | Data category, purpose/legal basis, access, retention, anonymization/deletion/legal hold, backup interaction. | Retention matrix cho session/idempotency/usage/audit/log/PII. | Privacy/Legal + Security + Operations | P2, P5, P8 |
| RPO/RTO | Mức mất dữ liệu và thời gian phục hồi; backup/WAL/PITR; restore drill cadence và degraded mode. | Measurable RPO/RTO và pass/fail restore drill. | Operations + Business owner | P8 |
| Admin permissions/bootstrap | Permission matrix deny-by-default; segregation of duties; ai cấp admin đầu tiên và thu hồi khẩn cấp thế nào. | Actor/action/resource matrix, bootstrap ceremony và audit evidence. | Security + Business owner | P2–P5 |
| Auth0 topology | Tenant/environment; Web Application, API/audience, M2M app riêng từng backend; callback/logout/origin allowlists; Google connection; credential custody/rotation. | Approved topology diagram/config inventory, không chứa secret; negative redirect/audience cases. | Security + Operations | P2, P6–P8 |
| Image/CSP/proxy | Image host/CDN/object storage; CSP allowlist; browser direct load hay Next image proxy; redirect/DNS/private-address policy. | Allowed/denied URL cases và CSP/proxy threat tests. | Security + Frontend + Operations | P1, P3 |

Không điền “default hợp lý”. Mọi ô owner/approver phải được thay bằng người/role có thẩm quyền cụ thể trong decision register trước sign-off.

## 4. Phạm vi

### Inventory từng ứng dụng

Mỗi app, gồm sample app và các app còn lại, phải có một record:

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

Sample app phải đại diện được direct URL, backend protected action và worker/async path nếu hệ thống cần chứng minh các đường đó. Nếu không một app nào đại diện đủ, decision record phải nêu phạm vi sample hoặc yêu cầu hơn một sample; không tự chọn.

### Decision register

Mỗi record bắt buộc có: `decisionId`, title, context, options/trade-offs, decision, owner, approver, approval date, affected phase, testable acceptance, security/privacy impact, migration/rollback impact, links và trạng thái `proposed|approved|superseded`. Decision `proposed` vẫn là blocker.

## 5. Ngoài phạm vi

- Không tạo DB/schema/migration/seed.
- Không tạo REST/OpenAPI endpoint hoặc BFF route.
- Không tạo user/admin UI, Auth0 tenant config, M2M client hay Google connection.
- Không bootstrap package, command, container hoặc CI.
- Không chọn library/tool kỹ thuật dành cho Phase 1.
- Không chọn payment provider hoặc triển khai billing.

## 6. Deliverables

- Inventory đầy đủ cho sample app và danh sách app còn lại, gồm route/action/worker/direct URL.
- Decision register đã approve cho các quyết định chặn phase kế tiếp.
- Admin permission matrix và bootstrap procedure được security approve.
- Auth0 non-secret topology/config inventory.
- Threat inventory cho direct access, callback/redirect, BFF/admin, M2M, worker và image proxy/CSP.
- Traceability matrix `decision -> contract/test -> blocked phase`.
- Danh sách unresolved item với owner, approver và phase phải dừng.

## 7. Target paths

Chỉ tài liệu trong `docs/build-plan/` thuộc phase này. Target source paths trong README chỉ được xem xét/finalize ở P1; P0 không tạo chúng.

## 8. DB/migration

N/A — P0 không implementation DB. P0 chỉ xác nhận decision nào ảnh hưởng 25-table design, temporal semantics, retention, role/grant, migration/rollback và test data; không tạo đủ/thiếu bảng để né blocker.

## 9. Backend API

N/A — không tạo API. Output chỉ mô tả capability, actor/audience, protected operation, expected allow/deny/error/idempotency để P2–P6 khóa OpenAPI sau này.

## 10. User web

N/A — không tạo UI. Inventory ghi user routes, direct/deep links, auth transition, accessibility risk và responsive states cần cover trong phase liên quan.

## 11. Admin web

N/A — không tạo UI. P0 chốt permission matrix, server-side guard expectations, sensitive mutation reason/audit và bootstrap/recovery flow.

## 12. Integration/security

- Kiểm kê mọi trust boundary: browser ↔ BFF, BFF ↔ Control Plane, Data Plane ↔ Auth0/Control Plane, worker ↔ application port, Caddy ↔ private services.
- Mỗi protected path ghi rõ authentication, entitlement, domain authorization, quota và service scope nào áp dụng; `N/A` cần lý do.
- Ghi test negative cho direct URL/API, forged `accountId`, wrong issuer/audience, cross-app feature/metric, missing/revoked scope, open redirect, CSRF và replay.
- Xác định credential owner/rotation/revoke mà không ghi secret vào docs.
- Phân loại fail-closed/LKG theo approval; nếu chưa duyệt thì authentication, high-risk entitlement và hard quota giữ fail-closed.

## 13. Contract freeze

P0 freeze **decision contract**, chưa freeze endpoint. Architect chỉ ký freeze khi:

1. Thuật ngữ/key không mâu thuẫn giữa inventory và docs nguồn.
2. Mỗi quyết định có testable examples, owner và approver.
3. Mỗi unresolved item map tới phase bị block; không che bằng placeholder runtime value.
4. Sample app selection và representative paths được approve.
5. Billing vẫn deferred P9.

Thay đổi decision đã approve phải tạo record superseding, đánh giá contract/test/migration impact và reopen phase liên quan nếu cần.

## 14. Tests

Đây là review/test-design, không phải automated test run vì repo chưa có test framework hoặc command.

- Tabletop scenarios cho signup/activation/default plan.
- Boundary tables cho subscription/window/timezone/DST/TTL/late success.
- Route/action/worker bypass review từ direct URL.
- Threat-model abuse cases cho admin bootstrap, Auth0, M2M, BFF, image proxy/CSP.
- Traceability check: mỗi protected path và decision có ít nhất một positive/negative acceptance case.
- Inventory completeness review bởi owner của từng app.

## 15. Ordered steps

P0 không tạo implementation nên mọi **Sản phẩm** là tài liệu trong `docs/build-plan/` và mọi **Verify** là review/completeness/approval evidence, không phải lệnh build. Các bước tuân thứ tự logic inventory → decisions → threat/traceability → contract freeze → QA/reviewer.

**P0.1 — Lập danh sách app/backend/domain và đề cử sample app**
- Hành động: liệt kê toàn bộ app/backend/domain cùng owner kỹ thuật/product; đề cử sample app theo tiêu chí đại diện (direct URL, backend protected action, worker/async path) tại mục 4.
- Sản phẩm: bảng application inventory + đề cử sample app trong `docs/build-plan/phase-0-decisions-inventory.md` (mục 4) và/hoặc inventory record đính kèm dưới `docs/build-plan/`.
- Phụ thuộc: đọc/đối chiếu `docs/index.md`, `docs/modular.md`, `docs/database-schema.md`, `docs/stack-tech.md`, `AGENTS.md`. `‹cần chốt: danh sách app chính thức và ai là owner từng app›`.
- Verify: mỗi app có owner xác nhận; đề cử sample app nêu rõ path nào được đại diện, path nào không — reviewer/app owner đọc và xác nhận đủ đại diện.
- Lane: `architect` điều phối; `frontend`/`backend` cung cấp inventory theo lane; `document` chuẩn hóa.

**P0.2 — Inventory route/action/worker/direct URL từng app**
- Hành động: với mỗi app, thu thập user/admin routes, API/actions, workers/jobs, direct/deep URLs và enforcement point hiện có theo template mục 4; không kết luận capability tồn tại nếu chưa có evidence.
- Sản phẩm: per-app inventory record (identity, user entry, protected routes/actions, workers, direct-access/bypass, feature/metric để trống nếu chưa duyệt, data/domain auth, service identity, observability, rollout/rollback) dưới `docs/build-plan/`.
- Phụ thuộc: P0.1.
- Verify: owner từng app review completeness; mỗi protected path có ghi authentication/entitlement/domain-auth/quota áp dụng hoặc `N/A` kèm lý do.
- Lane: `frontend` (route/image/CSP), `backend` (API/action/worker/data boundary); `document` chuẩn hóa.

**P0.3 — Tạo decision register từ mọi open decision**
- Hành động: chuyển từng open decision trong docs nguồn (mục 3) thành record đủ trường: `decisionId`, title, context, options/trade-offs, decision, owner, approver, approval date, affected phase, testable acceptance, security/privacy impact, migration/rollback impact, links, status `proposed|approved|superseded`.
- Sản phẩm: decision register dưới `docs/build-plan/` với mọi record khởi tạo ở `proposed`.
- Phụ thuộc: P0.1, P0.2.
- Verify: mỗi decision group ở mục 3 có tối thiểu một record; không ô nào điền “default hợp lý”; register liệt kê đầy đủ, chưa cần approved.
- Lane: `architect` điều phối; `document` chuẩn hóa.

**P0.4 — Workshop chốt quyết định theo nhóm**
- Hành động: tổ chức workshop theo product, security/privacy, operations và app integration để đưa từng `proposed` decision tới `approved` với owner/approver cụ thể.
- Sản phẩm: cập nhật decision register (owner/approver/approval date/decision) + biên bản/evidence link dưới `docs/build-plan/`.
- Phụ thuộc: P0.3. `‹cần chốt: người/role có thẩm quyền đóng vai owner và approver cho từng decision group›`.
- Verify: mỗi decision chặn P1/P2 chuyển sang `approved` có approver hợp lệ; decision còn `proposed` vẫn được đánh dấu blocker của phase tương ứng.
- Lane: `architect` điều phối (không tự approve thay human); `document` ghi kết quả.

**P0.5 — Viết scenario/boundary examples testable**
- Hành động: cho mỗi decision đã chốt, viết testable examples (state transitions, boundary tables cho subscription/window/timezone/DST/TTL/late success, positive/invalid action→metric) trước khi xin sign-off; không điền giá trị giả.
- Sản phẩm: scenario/boundary appendix dưới `docs/build-plan/`, liên kết ngược `decisionId`.
- Phụ thuộc: P0.4.
- Verify: mỗi decision có tối thiểu một expected outcome quan sát được (`commit|cancel|anomaly`, allow/deny, transition); reviewer xác nhận không có giá trị bịa.
- Lane: `tester` thiết kế scenario (không bịa fixture value); `architect` review.

**P0.6 — Hoàn thiện Auth0 topology, admin matrix, retention, RPO/RTO**
- Hành động: chốt non-secret Auth0 topology/config inventory, admin permission matrix + bootstrap ceremony, retention/privacy matrix và RPO/RTO ownership.
- Sản phẩm: topology inventory (không secret), admin matrix, retention matrix, RPO/RTO record dưới `docs/build-plan/`.
- Phụ thuộc: P0.4. `‹cần chốt: Auth0 tenant/topology, admin bootstrap authority, retention policy, mục tiêu RPO/RTO›`.
- Verify: security/operations approver ký; inventory không chứa secret; mỗi mục có measurable acceptance (SLA, retention interval, restore drill pass/fail).
- Lane: `architect` điều phối; `frontend`/`backend` cấp input boundary; `document` chuẩn hóa.

**P0.7 — Threat model và map threat/control sang phase/test**
- Hành động: dựng threat inventory cho direct access, callback/redirect, BFF/admin, M2M, worker và image proxy/CSP; map mỗi threat/control sang phase và acceptance case.
- Sản phẩm: threat inventory + threat→control→phase/test mapping dưới `docs/build-plan/`.
- Phụ thuộc: P0.2, P0.5, P0.6.
- Verify: mỗi trust boundary ở mục 12 có ít nhất một negative case; reviewer xác nhận không có protected path bỏ trống.
- Lane: `architect` + `reviewer` (review); `tester` chuyển thành negative test design.

**P0.8 — Traceability matrix decision → contract/test → blocked phase**
- Hành động: lập ma trận truy vết nối mỗi decision và protected path tới contract/test dự kiến và phase bị block; đánh dấu unresolved item với owner/approver/phase phải dừng.
- Sản phẩm: traceability matrix + unresolved list dưới `docs/build-plan/`.
- Phụ thuộc: P0.3–P0.7.
- Verify: không có protected path hoặc blocker vô chủ; mỗi unresolved item map tới đúng phase `blocked`.
- Lane: `architect` điều phối; `document` chuẩn hóa.

**P0.9 — Architect kiểm consistency và freeze decision contract**
- Hành động: architect kiểm thuật ngữ/key nhất quán giữa inventory và docs nguồn, dependency và các điều kiện freeze tại mục 13; ký freeze decision contract (không freeze endpoint).
- Sản phẩm: freeze record cho decision contract dưới `docs/build-plan/`.
- Phụ thuộc: P0.8; billing vẫn deferred P9.
- Verify: đủ 5 điều kiện mục 13; freeze record dẫn chiếu decision register + traceability; architect không tự write/approve thay human.
- Lane: `architect` (review/freeze, không write implementation).

**P0.10 — QA và reviewer kiểm độc lập**
- Hành động: QA kiểm evidence/completeness/approval và unresolved blocker; reviewer kiểm ambiguity, security/privacy và khả năng kiểm thử; chạy song song.
- Sản phẩm: QA PASS/FAIL record và reviewer “mục phải sửa”/khuyến nghị trong bảng mục 20.
- Phụ thuộc: P0.9.
- Verify: QA/reviewer là người độc lập, không phải tác giả tài liệu; kết luận có evidence link.
- Lane: `qa` ║ `reviewer` (read-only, không sửa docs).

**P0.11 — Vòng sửa và cập nhật status**
- Hành động: chủ tài liệu sửa mục QA/reviewer nêu, tối đa ba vòng; chỉ cập nhật phase status khi exit gate (mục 18) đạt.
- Sản phẩm: cập nhật decision/inventory docs và mục 1 (status) dưới `docs/build-plan/`.
- Phụ thuộc: P0.10.
- Verify: QA `PASS` và reviewer hết “mục phải sửa”; nếu lặp lỗi lần hai ghi **TẮC**, hết ba vòng ghi **CẠN LƯỢT** (metadata, không thay status canonical).
- Lane: `document` (sửa docs sau approval); `architect`/`orchestrator` điều phối vòng.

## 16. Parallel lanes và ownership

| Lane | Công việc P0 | Output |
|---|---|---|
| Architect | Điều phối decision, options/trade-off, contract và blocker map | Decision register + freeze record; không tự approve thay human. |
| Frontend | Inventory user/admin route, auth transition, accessibility/responsive và image flow | Route/image/CSP inventory; không code. |
| Backend | Inventory APIs/actions/workers, data/auth/quota boundaries, DB-impact questions | Backend/worker/DB impact matrix; không migration. |
| Tester | Chuyển decision thành scenario/boundary/negative test design | Test traceability matrix; không bịa fixture value. |
| QA | Kiểm completeness, approval evidence và unresolved blockers | PASS/FAIL độc lập; không sửa docs. |
| Reviewer | Review kiến trúc, security/privacy, consistency | Mục phải sửa/khuyến nghị; không sửa docs. |
| Document | Chuẩn hóa decision/inventory docs sau approval | Tài liệu phản ánh đúng decision, không thêm quyết định. |

Các lane có thể thu thập song song sau khi thống nhất template; contract freeze chỉ diễn ra sau khi merge và review chéo.

## 17. Checklist

### Functional
- [ ] Sample app và mọi app còn lại có owner, route/action/worker/direct URL inventory.
- [ ] Default plan/account activation và subscription lifecycle có decision/testable examples.
- [ ] Metric/unit/amount/counting/failure/window/TTL/late success được duyệt cho phạm vi cần ở phase tương ứng.

### Security
- [ ] Admin permission/bootstrap matrix và Auth0 tenant/app/API/M2M/Google topology được approve.
- [ ] Revoke SLA, outage/LKG và direct-access threat cases có measurable acceptance.
- [ ] Image hosting/CSP/Next proxy policy có allow/deny tests và không chứa secret.

### DB
- [ ] Decision impact được map tới schema/table/constraint/retention/migration; không tạo business default.

### Concurrency
- [ ] Scenario race cho identity provisioning, subscription overlap, quota/idempotency và duplicate worker candidate được ghi cho phase test tương ứng.

### Accessibility
- [ ] Inventory ghi auth/error/loading/denied flows cần keyboard, focus, semantic và screen-reader acceptance.

### Responsive
- [ ] User/admin route inventory bao phủ desktop, điện thoại và máy tính bảng trong cùng web codebase; không có mobile/native scope.

### Observability
- [ ] Correlation, log/metric/audit/alert expectation và owner được ghi cho mỗi critical flow.

### Rollback
- [ ] Mỗi decision có migration/rollback impact; rollout app có disable/forward-fix path và stop trigger.

### Docs
- [ ] Decision record có owner, approver, status, evidence và blocker mapping.
- [ ] Không có giá trị, command, package, API, DB hay UI được mô tả như đã tồn tại.

## 18. Exit gate

P0 chỉ `verified` khi:

1. Inventory được từng app owner xác nhận; sample app và representative path được approve.
2. Tất cả decision chặn P1/P2 có status `approved`; decision cho phase sau có owner/deadline/blocker rõ ràng.
3. Metric/quota decision chưa cần ngay có thể giữ mở nhưng phase phụ thuộc phải tiếp tục `blocked`.
4. Decision-to-test-to-phase traceability không có protected path hoặc blocker vô chủ.
5. QA `PASS`; reviewer không còn mục “phải sửa”; evidence link được lưu.

## 19. Stop/rollback

- Dừng ngay khi thiếu human approver, app owner/evidence, yêu cầu mâu thuẫn, hoặc cần tự chọn giá trị để tiếp tục.
- Cùng lỗi/ambiguity lặp lần thứ hai: ghi verification outcome metadata **TẮC**, nêu đã thử gì và cần quyết định gì; phase status giữ một giá trị canonical.
- Decision bị rút lại trước implementation: mark `superseded`, khôi phục phase phụ thuộc về `blocked` và re-freeze contract.
- P0 không có product rollback. Không xóa lịch sử decision; dùng superseding record.
- Tối đa ba vòng; hết vòng mà chưa đạt thì ghi verification outcome metadata **CẠN LƯỢT**, không dùng outcome này làm phase status và không ghi `verified`.

## 20. QA/reviewer sign-off

| Gate | Trạng thái | Evidence/người ký |
|---|---|---|
| QA inventory/approval/traceability | `pending` | Chưa có evidence. |
| Reviewer architecture/security/testability | `pending` | Chưa có evidence. |
| Orchestrator xác nhận exit gate | `pending` | Chỉ xác nhận sau cả hai gate trên. |

Không dùng chính tác giả tài liệu làm bằng chứng QA/reviewer độc lập.
