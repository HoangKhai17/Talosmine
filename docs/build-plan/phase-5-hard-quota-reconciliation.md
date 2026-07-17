# Phase 5 — Hard Quota và Reconciliation

## 1. Trạng thái

`blocked`

Đây là kế hoạch, chưa phải mô tả implementation. Phase bị chặn bởi Phase 4 của build plan và các quyết định metric/quota cụ thể ở mục 3. Không có nội dung nào dưới đây khẳng định bảng, API, worker, màn hình, migration hoặc test đã tồn tại hay chạy.

Phase này hiện thực hard quota trong **cùng Control Plane NestJS modular monolith**. Worker có main entrypoint riêng để vận hành nhưng chỉ gọi `QuotaReconciliationPort`; đó không phải microservice sở hữu quota và không được truy cập table/repository trực tiếp.

## 2. Mục tiêu

1. Thực thi hard limit nguyên tử bằng PostgreSQL cho một metric mẫu đã phê duyệt, không double-spend ở lượt cuối.
2. Cung cấp lifecycle `reserve -> commit|cancel`, status phục hồi timeout, expiration và reconciliation idempotent.
3. Dùng PostgreSQL làm ledger canonical; `usage_events` append-only và mọi adjustment có audit.
4. Re-authorize M2M identity, application binding và exact metric-specific capability ở từng operation trước identity resolution hoặc đọc reservation.
5. Cung cấp usage summary cho user chỉ để hiển thị và bề mặt quản trị quota có RBAC/audit.
6. Kiểm chứng correctness dưới concurrency, duplicate/retry, timeout, expiry, revoke race, migration và load có kiểm soát.

## 3. Prerequisites và human decisions

- [ ] Phase 4 đã được QA/reviewer ký đạt; Plan Version, Subscription, Entitlement, exact-feature scope và audit UoW ổn định; `service_identity_scopes` staging có canonical columns và chỉ chứa entitlement rows hợp lệ.
- [ ] Trước implementation, `docs/database-schema.md` đã được source update để mô tả staged contract Phase 4 -> Phase 5, gồm validation và replacement của named checks/indexes; migration Phase 5 phải đối chiếu đúng contract đó.
- [ ] Chọn **một metric mẫu** và phê duyệt stable application/feature/metric key, unit, `amount` cho từng logical operation và giới hạn plan/override dùng trong test.
- [ ] Phê duyệt counting point (`start`, `milestone` hoặc `success`) và failure treatment cho lỗi user, app, dependency, timeout/cancel; không dùng một rule chung nếu metric cần phân loại.
- [ ] Phê duyệt window type và thuật toán: calendar hoặc rolling; window boundaries, IANA timezone, DST gap/fold, anchor và reset display. Nếu rolling là exact sliding window, phải review/mở rộng bucket model trước implementation.
- [ ] Phê duyệt reservation TTL theo metric/workload, long-running behavior, bằng chứng late success và hành vi sau expiration; không tự chuyển `expired -> committed`.
- [ ] Phê duyệt outage policy: hard quota fail-closed, UX/retry khi Control Plane/DB/entitlement không sẵn sàng và không dùng stale remaining để cho phép action.
- [ ] Phê duyệt idempotency retention/retry window, canonical fingerprint fields/version, operation-reference lifecycle và bounded replay response.
- [ ] Phê duyệt quota limit override giữa window, adjustment semantics, admin permission/separation of duties và reconciliation anomaly/manual path.
- [ ] Phê duyệt retention/privacy cho usage/idempotency/audit/log, load target, SLO/alert threshold và worker batch/backoff/retry limits.
- [ ] Kiểm chứng Supavisor transaction pinning, PostgreSQL version/isolation, SQLSTATE retry policy và backup/PITR checkpoint trên môi trường mục tiêu.

Nếu thiếu metric/unit/amount/counting/failure, window/timezone/DST, TTL/late-success hoặc outage policy thì **không được bật reserve** cho metric đó. Không dùng fixture production giả để vượt prerequisite.

## 4. Phạm vi

- Tạo `plan_quota_policies` canonical và `quota_limit_overrides` theo semantics đã duyệt; đây là quota tables đầu tiên sau Phase 4 không có quota data.
- Tạo `usage_buckets`, `usage_reservations`, `usage_events`, `idempotency_records`, constraints, composite FKs, indexes và append-only trigger.
- Quota module cung cấp `reserve`, `commit`, `cancel`, `status`, usage summary, admin adjustment/ledger query và `QuotaReconciliationPort`.
- Background worker main entrypoint trong cùng codebase chỉ điều phối port system-only.
- Expand tại chỗ `service_identity_scopes`: giữ entitlement behavior/history, thay named capability/shape checks và bổ sung metric indexes để hỗ trợ exact `quota:reserve`, `quota:commit`, `quota:cancel`, `quota:read`; issuer + subject user identity và per-operation re-authorization.
- User Web usage summary/remaining chỉ để hiển thị; Admin Web cho bucket/reservation/event/override/adjustment.
- OpenAPI quantities dưới dạng decimal string, idempotency/correlation/error contract.
- Test PostgreSQL thật cho concurrency, terminal transitions, migration, append-only, revoke race, worker duplicates và load.

## 5. Ngoài phạm vi

- Data Plane business integration thật ngoài mock/contract adapter cho tới Phase 6; không chạy business action thực của app mẫu.
- Payment provider, checkout, billing event, pricing, invoice, refund hoặc paid subscription.
- Redis/local/distributed cache làm quota ledger hoặc cho phép reserve từ cached remaining.
- Microservice quota/reconciliation riêng, worker-owned table, direct worker SQL, `reconciliation_runs`, outbox hoặc message broker.
- Organization/team/pooled quota và chia sẻ bucket giữa nhiều account.
- Gateway bắt buộc hoặc chuyển business traffic qua Hub.
- Tự chọn metric/window/TTL/late-success/adjustment policy chưa được duyệt.
- Unlimited commit, commit vượt reserved quantity hoặc mở lại terminal reservation.

## 6. Deliverables

1. OpenAPI 3.1 frozen cho reserve/commit/cancel/status, own usage summary và admin quota operations.
2. Forward migrations cho quota policy/override/ledger/idempotency; validate staged entitlement rows rồi replace/expand named checks/indexes của `service_identity_scopes` mà không mất entitlement history; thêm composite FK và append-only trigger.
3. Quota domain/application/persistence với transaction SQL ngắn, atomic conditional update và DB clock.
4. Exact metric-specific Service Identity authorization cho từng operation.
5. `QuotaReservationPort` và system-only `QuotaReconciliationPort` có contract/test rõ ràng.
6. Worker main entrypoint gọi port, batch/backoff/observability theo policy, không import repository/table.
7. User/Admin Web theo frozen contract, server authorization và trạng thái fail-closed.
8. Bộ test correctness/concurrency/idempotency/security/migration/load/accessibility/responsive.
9. Runbook timeout, reconciliation anomaly, revoke, database outage, forward-fix/restore và quan sát ledger.

## 7. Target paths

| Làn | Target path | Nội dung |
|---|---|---|
| Contract | `contracts/openapi/control-plane.v1.yaml` | OpenAPI 3.1, decimal-string quantity, errors/examples; Backend là writer duy nhất theo manifest ở mục 16. |
| Quota backend | `apps/control-plane/src/modules/quota/` | Domain, ports, commands/queries, SQL transaction và persistence. |
| Entitlement integration | `apps/control-plane/src/modules/entitlement/` | `EntitlementEligibilityPort`/effective limit boundary; không cho Quota đọc override table. |
| Service authorization | `apps/control-plane/src/modules/service-identity/` | Exact metric capabilities và revoke-safe locking. |
| Reconciliation | `apps/control-plane/src/modules/reconciliation/` | Orchestration chỉ qua `QuotaReconciliationPort`. |
| Worker entrypoint | `apps/control-plane/src/main-worker.*` | Main/bootstrapping worker trong cùng Control Plane codebase; chỉ gọi reconciliation application port. |
| Admin/Audit | `apps/control-plane/src/modules/admin/`, `apps/control-plane/src/modules/audit/` | Admin orchestration và transactional audit. |
| Migration | `apps/control-plane/drizzle/migrations/` | Ledger schema, composite FK, trigger và grants. |
| User/Admin Web | `apps/web/` | Usage summary và quota administration qua BFF. |
| Backend tests | `tests/control-plane/` | Unit/contract/PostgreSQL/concurrency/reconciliation/load/security. |
| Web tests | `tests/web/` | Usage/admin/accessibility/responsive. |
| Integration mocks | `tests/integration/` | Data Plane mock theo contract; không chứa business integration thật. |

Tên file chi tiết phải theo convention bootstrap thật. Không chuyển worker thành app độc lập sở hữu domain và không tạo direct table adapter ngoài Quota module.

## 8. DB/migration

1. Tạo `plan_quota_policies` canonical với semantics đã duyệt: metric/application composite binding, `limit_quantity >= 0`, window shape, IANA timezone/rolling interval/anchor và positive `reservation_ttl_seconds`.
2. Tạo `quota_limit_overrides` có account/policy FK, decimal-string API quantity -> checked `bigint`, validity, reason và revoke triple. Khóa account để ngăn effective override overlap cho cùng policy.
3. Trước khi thay constraint/index, validate toàn bộ row `service_identity_scopes` từ Phase 4: đủ canonical columns, capability chỉ `entitlement:decide`, exact feature non-null, metric null, application/service/feature binding hợp lệ và lifecycle/revoke shape đúng. Bất kỳ row lỗi nào phải dừng migration để forward-fix dữ liệu có review; không drop constraint trước validation.
4. Replace named `service_identity_scopes_capability_check` bằng final check cho `entitlement:decide|quota:reserve|quota:commit|quota:cancel|quota:read`; replace named `service_identity_scopes_shape_check` để entitlement có đúng feature/non-metric, còn mọi `quota:*` có đúng metric/non-feature. Giữ nguyên row entitlement và lịch sử revoke.
5. Giữ/validate `service_identity_scopes_active_feature_key` và feature lookup index, rồi tạo final `service_identity_scopes_active_metric_key` cùng metric lookup index cho service/application/capability/metric theo staged source contract. Composite FK tiếp tục buộc service, feature hoặc metric thuộc đúng application; không rebuild bảng làm mất ID/history.
6. Tạo `usage_buckets` unique `(account_id, plan_quota_policy_id, window_start, window_end)`, composite FK tới subscription/account và policy/application/metric; snapshot effective limit, committed và reserved counters.
7. Thêm named checks: end > start, counters/limit không âm và `(committed::numeric + reserved::numeric) <= limit::numeric` để tránh overflow trước comparison.
8. Tạo `usage_reservations` với composite FK buộc bucket/account/application/metric và service/application khớp; unique service + operation reference; positive quantity; bounded committed; state `reserved|committed|canceled|expired`; terminal shape.
9. Tạo `usage_events` append-only, signed deltas, after-values, actor shape và composite FK bảo đảm reservation thuộc đúng bucket. Lifecycle event cần reservation; adjustment/reconciliation event không có reservation.
10. Tạo `idempotency_records` chỉ cho service operations `reserve|commit|cancel`, unique `(service_identity_id, operation, idempotency_key)`, fingerprint, processing/completed shape, bounded sanitized replay <= 64 KiB và retention expiry.
11. Tạo custom SQL `usage_events_append_only_trg`; runtime role không có `TRUNCATE`, DDL hay disable-trigger permission. Adjustment sửa bucket và append event/audit trong cùng transaction, không update/delete event cũ.
12. Dùng DB clock cho window, expiry, terminal/event time; không tin client `now`. Mọi timestamp là `timestamptz` UTC và quantity là PostgreSQL `bigint`.
13. Thứ tự migration bắt buộc: `plan_quota_policies` -> `quota_limit_overrides` -> preflight validate P4 scope rows -> replace `service_identity_scopes_capability_check`/`service_identity_scopes_shape_check` -> retain `service_identity_scopes_active_feature_key` và add `service_identity_scopes_active_metric_key`/metric lookup -> bucket -> reservation -> event -> idempotency -> custom triggers/grants -> final validation. Chỉ sau final validation mới được expose quota API.
14. Có gate trước replacement: nếu preflight hoặc rehearsal fail, giữ nguyên P4 constraints và không mở quota API. Sau replacement nhưng trước traffic, rollback chỉ dùng script đã review để trả checks/indexes về staged P4 khi chưa có quota rows. Sau quota write/traffic, không down-migrate; dừng exposure và dùng forward-fix bảo toàn entitlement/quota history.
15. Migration tests kiểm tra staged-to-final schema theo `docs/database-schema.md` sau source update, dirty/representative P4 rows, constraint replacement, entitlement-history preservation, trigger, composite FK, no-cascade history, role grants và forward-fix/rollback gate.

Không destructive rollback sau khi ledger nhận write. Không xóa event/idempotency/reservation để làm counter “khớp”; dùng event điều chỉnh được phê duyệt và audit.

## 9. Backend API

**Service API:**

- `POST /v1/service/usage-reservations`: reserve với verified full `issuer + subject`, application, metric, decimal-string `quantity`, stable operation reference, `Idempotency-Key` và correlation ID.
- `POST /v1/service/usage-reservations/{id}/commit`: terminal commit với decimal-string quantity theo approved counting policy và key riêng namespace `commit`.
- `POST /v1/service/usage-reservations/{id}/cancel`: terminal cancel có reason machine-readable và key namespace `cancel`.
- `GET /v1/service/usage-reservations/{id}`: status sau exact `quota:read` authorization; không đọc trước scope check.

**User API:**

- `GET /v1/me/usage`: summary theo application/metric/window, committed/reserved/remaining và reset boundary. Tất cả quantity là decimal string và remaining chỉ để hiển thị, không phải authorization cho lần gọi sau.

**Admin API:**

- Xem usage buckets, reservations và append-only events theo permission/scope, phân trang và bộ lọc bounded.
- Tạo/revoke quota limit override qua Entitlement-owned port; Quota không đọc bảng override trực tiếp.
- Điều chỉnh limit/ledger bằng command có reason, correlation và audit; tạo event `limit_adjusted` hoặc `reconciled_adjustment`, không rewrite history.
- Xem anomaly/reconciliation outcome được phép; không có endpoint cho admin tùy ý gọi worker internal port từ Internet.

Error contract gồm `VALIDATION_FAILED`, `METRIC_SEMANTICS_NOT_APPROVED`, `SERVICE_RESOURCE_SCOPE_DENIED`, `ACCOUNT_NOT_ACTIVE`, `ENTITLEMENT_DENIED`, `IDEMPOTENCY_CONFLICT`, `QUOTA_EXHAUSTED`, `INSUFFICIENT_QUOTA`, `POLICY_UNRESOLVED`, `RESERVATION_ALREADY_TERMINAL`, `QUOTA_DECISION_UNAVAILABLE` và safe not-found sau authorization. `retryAfter` chỉ trả khi policy xác định được.

## 10. User web

1. Hiển thị usage summary theo app/metric và canonical window, gồm committed/reserved/remaining dưới dạng text dễ hiểu; không dùng value đó để bật bypass hành động.
2. Reset time hiển thị theo policy/timezone đã duyệt, xử lý DST theo response server; không tự tính window bằng clock browser.
3. Loading/empty/stale/error/fail-closed states phân biệt rõ. Nếu không lấy được summary, UI không nói user còn quota.
4. Dữ liệu qua BFF session, chỉ của account hiện tại; browser không gửi internal account ID đáng tin cậy.
5. Quantity decimal string được format để hiển thị mà không parse qua JavaScript `number` gây mất chính xác; logic chuyển đổi phải theo contract/tooling đã bootstrap.
6. Mobile/tablet/desktop có card/table phù hợp, label rõ, progress visualization có text equivalent và không chỉ dựa màu sắc.

## 11. Admin web

1. Usage explorer hiển thị bucket window, limit, committed/reserved và binding subscription/policy ở mức được phép; pagination/filter không tải ledger vô hạn.
2. Reservation detail hiển thị state/timeline/operation reference/correlation, không lộ token, fingerprint thô hoặc PII không cần thiết.
3. Event ledger chỉ đọc; UI không có edit/delete. Adjustment là form riêng yêu cầu quantity semantics, reason, confirmation và permission.
4. Quota override form validate account/policy, validity và overlap; giải thích thay đổi giữa window theo policy đã duyệt, không hứa sửa bucket ngầm.
5. Reconciliation/anomaly view cho phép điều tra outcome; mọi manual adjustment đi qua command có audit, không có nút “force terminal” ngoài contract.
6. Mỗi mutation giữ cùng idempotency key khi retry sau timeout; conflict/terminal response được trình bày rõ, không tự phát key mới.
7. Server RBAC là bắt buộc; route guard chỉ hỗ trợ UX. Form/dialog/table/focus/keyboard và responsive behavior phải có test.

## 12. Integration/security

- Xác minh M2M token issuer/audience/expiry trước DB transaction. Trong từng reserve/commit/cancel/status, khóa/re-authorize DB service identity active, app binding và exact metric capability trước identity resolution hoặc reservation read.
- Data Plane mock gửi full verified `issuer + subject`; không gửi/trust internal `accountId`. Sau resolution, reservation phải khớp account/application/metric/service được authorize.
- Mỗi backend dùng identity riêng. Scope lần lượt là `quota:reserve`, `quota:commit`, `quota:cancel`, `quota:read` gắn exact metric; không wildcard/generic application quota scope.
- Revoke identity/scope dùng lock discipline tương thích prefix của usage operation. Operation đã khóa trước hoặc hoàn tất, hoặc revoke chờ; request bắt đầu sau revoke phải deny.
- Mỗi operation re-authorize, kể cả reservation đã tồn tại. Status không được trở thành đường lộ state sau revoke.
- Account chỉ `active` và EntitlementEligibility allow mới reserve. Commit/cancel/status vẫn kiểm tra resource ownership sau authorization theo frozen contract.
- Hard quota và dependency failure fail-closed. Không network call dưới row lock; không Redis/local remaining dùng để approve.
- Idempotency response/log/audit không chứa raw token, client secret, request payload nghiệp vụ hay PII thừa; correlation ID xuyên service/worker/audit.
- Worker là system actor tối thiểu, gọi system-only port nội bộ; không giả mạo M2M caller và không được public ra Internet.

## 13. Contract freeze

Architect thiết kế/review OpenAPI và port contract ở chế độ read-only.

Backend là writer duy nhất ghi `contracts/openapi/control-plane.v1.yaml`; revision phải được review và freeze trước khi mở làn song song, bao gồm:

- exact path/method/operation ID và auth audience;
- issuer + subject, application/metric identity và reservation resource binding;
- decimal-string schema cho mọi quantity/limit/counter/delta, gồm pattern/range validation;
- idempotency namespace theo service + operation + key, fingerprint inputs/version, replay/conflict và timeout recovery;
- reservation states, allowed terminal transitions, partial commit policy đã duyệt và expiry/late-success behavior;
- window start/end/reset/timezone semantics và remaining display disclaimer;
- standard error/reason/retryability, `X-Correlation-Id` và safe existence behavior;
- `QuotaReservationPort` và `QuotaReconciliationPort`, gồm duplicate candidate/no-op outcome;
- admin permission/reason/audit requirements và pagination/filter bounds.

Contract examples phải dùng sample metric đã phê duyệt, không ngụ ý paid plan hoặc Data Plane business action thật. Architect xác nhận freeze bằng review read-only.

Backend ghi revision/commit. Breaking change sau freeze dừng frontend/backend/tester, quay lại thiết kế/review, để Backend cập nhật revision rồi freeze lại trước khi tiếp tục.

## 14. Tests

- **Last-unit concurrency:** tại remaining = 1, nhiều reserve đồng thời có tổng successful quantity tối đa 1; bucket/event/reservation nhất quán.
- **Atomic/bounds:** zero/negative/overflow/too-large decimal string bị từ chối; conditional update không vượt limit; counters không âm sau partial commit/cancel/expire.
- **Idempotency:** same key/fingerprint replay exact response; same key/different fingerprint conflict; concurrent duplicate chỉ tạo một reservation/transition/event; denial hợp lệ replay ổn định.
- **Timeout/status:** simulated timeout sau commit DB nhưng trước response được phục hồi bằng retry/status; không tạo reservation/key mới; unavailable status giữ business action fail-closed.
- **Terminal states:** chỉ `reserved -> committed|canceled|expired`; commit/cancel terminal lặp không đổi bucket; opposite transition conflict; commit không vượt reserve.
- **Expiry/late success:** DB clock boundary trước/tại/sau expiry; worker clock skew không ảnh hưởng; late-success đi đúng approved policy hoặc anomaly, không tự reopen.
- **Reconciliation duplicates:** hai invocation nhận cùng candidate; dưới bucket -> reservation lock/recheck chỉ một transition, bucket change và event; loser no-op/terminal outcome.
- **Revoke race:** reserve/commit/cancel/status cạnh tranh revoke theo lock order; request sau revoke deny; không lộ reservation state.
- **Scope/privacy:** sai issuer/audience/app/metric/capability deny trước identity resolution; forged account/resource mismatch không lộ existence.
- **Append-only/audit:** UPDATE/DELETE/TRUNCATE runtime bị chặn; adjustment thêm event; audit failure rollback adjustment; no secret/token/PII thừa.
- **Migration:** clean upgrade từ staged Phase 4; invalid existing entitlement row chặn replacement; final named checks chấp nhận đúng feature/metric shapes; `service_identity_scopes_active_feature_key` và entitlement history vẫn hoạt động; `service_identity_scopes_active_metric_key`/metric lookup tồn tại; forward-fix và pre-traffic rollback gate được rehearsal.
- **Supavisor/SQLSTATE:** transaction pinning được kiểm chứng; chỉ retry bounded `40001`/`40P01` với backoff+jitter; business/constraint denial không retry như transient.
- **Load/contention:** load target đã duyệt đo latency/error/deadlock/retry/lock wait, worker batch contention và database saturation; không chỉ test throughput happy-path.
- **Web/admin:** decimal precision display, own-data isolation, error/conflict, ledger read-only, adjustment RBAC/audit, accessibility và responsive viewport.
- **Mock integration:** Data Plane mock chứng minh reserve phải thành công trước mock action và timeout không tạo key mới; không triển khai nghiệp vụ app thật.

## 15. Ordered steps

Runbook thực thi tuần tự theo mạch **decisions → contract freeze → migration tuần tự → parallel impl → integration → QA/reviewer**. Mỗi bước ghi năm thành phần: **Hành động**, **Sản phẩm**, **Phụ thuộc**, **Verify**, **Lane** (khớp mục 16). Repo greenfield chưa có script build/test/lint/migrate; wrapper npm/CI đánh dấu `‹cần chốt: script thật sau bootstrap›`, nhưng tên bảng, constraint, trigger, index, lock order, tên test suite và thứ tự migration P5 là cụ thể và bắt buộc. Migration root là `apps/control-plane/drizzle/migrations/`. Không đánh dấu bước nào là “đã chạy”.

### Nhóm A — Decisions

1. **Bước 1 — Chốt tiền đề và metric mẫu**
   - **Hành động:** Xác nhận Phase 4 sign-off và `service_identity_scopes` staging chỉ chứa entitlement rows hợp lệ; phê duyệt một metric mẫu (stable application/feature/metric key, unit, `amount`/logical operation, limit test), counting point + failure treatment, window type + timezone/DST/anchor, reservation TTL + late-success behavior, outage policy fail-closed, idempotency retention/fingerprint version, quota override/adjustment semantics + SoD, retention/privacy + load/SLO + worker batch/backoff. Thiếu metric/unit/amount/counting/failure, window/timezone/DST, TTL/late-success hoặc outage → không bật reserve cho metric đó.
   - **Sản phẩm:** Bảng quyết định đã điền trong mục 3 của file này.
   - **Phụ thuộc:** Phase 4 sign-off; `‹cần chốt: toàn bộ quyết định metric/window/TTL/outage mục 3›`.
   - **Verify:** Rà mục 3 — không còn checkbox trống áp dụng cho metric mẫu sắp build; semantics metric đối chiếu `usage_metrics.counting_point`/`failure_treatment` đã approved (không còn null).
   - **Lane:** Orchestrator điều phối.

2. **Bước 2 — Kiểm chứng Supavisor + PostgreSQL runtime**
   - **Hành động:** Kiểm chứng Supavisor **transaction pinning**, PostgreSQL version/isolation level, SQLSTATE retry policy (`40001`/`40P01`) và backup/PITR checkpoint trên môi trường mục tiêu trước khi chốt transaction implementation.
   - **Sản phẩm:** Ghi chú kiểm chứng runtime (đính kèm evidence checklist mục 17).
   - **Phụ thuộc:** Bước 1.
   - **Verify:** Chạy transaction thử qua Supavisor `‹cần chốt: connection string/pooler endpoint thật sau bootstrap›`; kỳ vọng session giữ nguyên connection trong suốt transaction (pinning xác nhận), và `SHOW transaction_isolation` trả mức đã duyệt. Nếu pinning không đảm bảo → khai báo TẮC theo mục 19.
   - **Lane:** Backend + Architect (read-only).

### Nhóm B — Contract freeze

3. **Bước 3 — Architect thiết kế read-only**
   - **Hành động:** Thiết kế window algorithm (calendar/rolling + DST), reserve/commit/cancel transaction + state machine, exact metric scopes, adjustment/reconciliation policy, `QuotaReservationPort`/`QuotaReconciliationPort` contract và threat model; đối chiếu `docs/modular.md` mục 9–10 và phần P5 của `docs/database-schema.md` sau source update.
   - **Sản phẩm:** Ghi chú thiết kế/threat model (read-only).
   - **Phụ thuộc:** Bước 1–2.
   - **Verify:** Design đối chiếu 1-1 với lock order canonical mục 9.4 của `docs/modular.md`; architect xác nhận không lệch tên port/state/capability.
   - **Lane:** Architect (read-only).

4. **Bước 4 — Backend ghi và freeze OpenAPI + port contract**
   - **Hành động:** Backend ghi path/method/operation ID + audience, `issuer + subject` + reservation resource binding, decimal-string schema (pattern/range) cho mọi quantity/limit/counter/delta, idempotency namespace `service + operation + key` + fingerprint version + timeout recovery, reservation states/terminal transitions/partial-commit/expiry, window start/end/reset/timezone + remaining disclaimer, error/reason/`X-Correlation-Id`, `QuotaReservationPort`/`QuotaReconciliationPort` (gồm duplicate candidate no-op), admin permission/pagination bounds. Examples dùng metric mẫu đã duyệt. Architect review read-only rồi freeze.
   - **Sản phẩm:** `contracts/openapi/control-plane.v1.yaml` (revision freeze, ghi commit).
   - **Phụ thuộc:** Bước 3.
   - **Verify:** Validate OpenAPI 3.1 bằng `‹cần chốt: openapi lint/validate script thật sau bootstrap›`; kỳ vọng 0 lỗi schema, mọi quantity là decimal string (không dùng JSON number), không có billing/Data Plane business operation.
   - **Lane:** Backend (contract writer) + Architect (review/freeze).

### Nhóm C — Migration tuần tự P5 (root `apps/control-plane/drizzle/migrations/`, forward-only)

Thứ tự migration bắt buộc: `plan_quota_policies` → `quota_limit_overrides` → preflight validate scope rows P4 → replace `service_identity_scopes_capability_check`/`service_identity_scopes_shape_check` → retain `service_identity_scopes_active_feature_key` + add `service_identity_scopes_active_metric_key`/metric lookup → `usage_buckets` → `usage_reservations` → `usage_events` → `idempotency_records` → append-only trigger + grants → final validation. Chỉ sau final validation mới expose quota API.

5. **Bước 5 — Migration `plan_quota_policies`**
   - **Hành động:** Tạo `plan_quota_policies` canonical: composite FK `plan_quota_policies_metric_application_fk (usage_metric_id, application_id)`, `limit_quantity >= 0`, `plan_quota_policies_window_type_check`, `plan_quota_policies_window_shape_check` (calendar có unit+timezone và mọi rolling field null, hoặc rolling có interval và mọi calendar field null), positive `reservation_ttl_seconds`, unique `plan_quota_policies_version_metric_key` và `plan_quota_policies_id_application_metric_key`.
   - **Sản phẩm:** Migration `*_p5_plan_quota_policies.sql`.
   - **Phụ thuộc:** Bước 4; `window`/`timezone`/`DST` đã duyệt (`‹cần chốt: window semantics + IANA timezone + DST›`).
   - **Verify:** psql `SELECT to_regclass('control_plane.plan_quota_policies')` non-NULL; `pg_constraint` chứa `plan_quota_policies_window_shape_check`; thử INSERT policy calendar kèm rolling field kỳ vọng bị check reject.
   - **Lane:** Backend (owner migration root).

6. **Bước 6 — Migration `quota_limit_overrides`**
   - **Hành động:** Tạo `quota_limit_overrides` với FK account/policy, `limit_quantity >= 0` (API decimal-string → checked `bigint`), validity `[valid_from, valid_until)`, revoke triple, `quota_limit_overrides_lookup_idx (account_id, plan_quota_policy_id, valid_from, valid_until) WHERE revoked_at IS NULL`. Overlap cho cùng account/policy là invariant transaction (khóa account), không phải CHECK.
   - **Sản phẩm:** Migration `*_p5_quota_limit_overrides.sql`.
   - **Phụ thuộc:** Bước 5.
   - **Verify:** psql xác nhận bảng + `quota_limit_overrides_lookup_idx` tồn tại; FK `plan_quota_policy_id` trỏ đúng `plan_quota_policies(id)`.
   - **Lane:** Backend.

7. **Bước 7 — Preflight validate scope rows P4**
   - **Hành động:** Trước khi thay constraint/index, validate mọi row `service_identity_scopes` từ P4: đủ canonical columns, capability chỉ `entitlement:decide`, `feature_id` non-null + `usage_metric_id` null, binding service/feature/application hợp lệ, lifecycle/revoke shape đúng. Row lỗi phải **dừng migration** để forward-fix dữ liệu có review; không drop constraint trước validation.
   - **Sản phẩm:** Preflight script `*_p5_preflight_scope_validation.sql` (gate, không mutate).
   - **Phụ thuộc:** Bước 6.
   - **Verify:** psql `SELECT count(*) FROM control_plane.service_identity_scopes WHERE capability <> 'entitlement:decide' OR usage_metric_id IS NOT NULL OR feature_id IS NULL` kỳ vọng trả 0. Khác 0 → dừng, forward-fix trước.
   - **Lane:** Backend.

8. **Bước 8 — Replace capability/shape checks (expand tại chỗ)**
   - **Hành động:** Replace `service_identity_scopes_capability_check` bằng final set `entitlement:decide|quota:reserve|quota:commit|quota:cancel|quota:read`; replace `service_identity_scopes_shape_check` để `entitlement:decide` có đúng feature/non-metric, mọi `quota:*` có đúng metric/non-feature. Giữ nguyên row entitlement và lịch sử revoke; không rebuild bảng làm mất ID/history. Thực hiện trong deployment transaction hoặc controlled DDL với lock/traffic gate — không có cửa sổ runtime mà capability/shape không được constraint bảo vệ.
   - **Sản phẩm:** Migration `*_p5_scope_checks_expand.sql`.
   - **Phụ thuộc:** Bước 7 (preflight pass).
   - **Verify:** psql: định nghĩa `service_identity_scopes_capability_check` chứa đủ 5 capability; thử INSERT scope `quota:reserve` với đúng metric/non-feature kỳ vọng thành công; thử `quota:reserve` với feature non-null kỳ vọng bị shape check reject; `SELECT count(*)` entitlement rows trước/sau không đổi.
   - **Lane:** Backend.

9. **Bước 9 — Retain feature index + add metric index**
   - **Hành động:** Giữ/validate `service_identity_scopes_active_feature_key` + feature lookup index; tạo final `service_identity_scopes_active_metric_key (service_identity_id, application_id, capability, usage_metric_id) WHERE status = 'active' AND usage_metric_id IS NOT NULL` + metric lookup index. Composite FK tiếp tục buộc service/feature/metric thuộc đúng application.
   - **Sản phẩm:** Migration `*_p5_scope_metric_indexes.sql`.
   - **Phụ thuộc:** Bước 8.
   - **Verify:** psql `pg_indexes` chứa cả `service_identity_scopes_active_feature_key` và `service_identity_scopes_active_metric_key`; entitlement lookup query cũ vẫn dùng feature index (regression pass).
   - **Lane:** Backend.

10. **Bước 10 — Migration quota ledger `usage_buckets`**
    - **Hành động:** Tạo `usage_buckets` unique `usage_buckets_account_policy_window_key (account_id, plan_quota_policy_id, window_start, window_end)` + `usage_buckets_id_account_app_metric_key`; composite FK `usage_buckets_subscription_account_fk` và `usage_buckets_policy_binding_fk`; snapshot `limit_quantity`, `committed_quantity`, `reserved_quantity`; checks `usage_buckets_window_check`, `usage_buckets_nonnegative_check`, `usage_buckets_hard_limit_check (committed::numeric + reserved::numeric <= limit::numeric)`.
    - **Sản phẩm:** Migration `*_p5_usage_buckets.sql`.
    - **Phụ thuộc:** Bước 5, 9.
    - **Verify:** psql `pg_constraint` chứa `usage_buckets_hard_limit_check`; thử UPDATE bucket để `committed + reserved > limit` kỳ vọng bị check reject.
    - **Lane:** Backend.

11. **Bước 11 — Migration `usage_reservations`**
    - **Hành động:** Tạo `usage_reservations` với composite FK `usage_reservations_bucket_binding_fk (usage_bucket_id, account_id, application_id, usage_metric_id)` và `usage_reservations_service_application_fk`; unique `usage_reservations_service_operation_reference_key`; `quantity > 0`, bounded `committed_quantity`, state `reserved|committed|canceled|expired`, `usage_reservations_terminal_check`; index `usage_reservations_expiry_idx (expires_at, id) WHERE state = 'reserved'`.
    - **Sản phẩm:** Migration `*_p5_usage_reservations.sql`.
    - **Phụ thuộc:** Bước 10.
    - **Verify:** psql xác nhận composite FK + `usage_reservations_terminal_check`; thử INSERT reservation state `committed` với terminal fields null kỳ vọng bị reject.
    - **Lane:** Backend.

12. **Bước 12 — Migration `usage_events` append-only**
    - **Hành động:** Tạo `usage_events` với signed deltas, after-values, `usage_events_type_check` (`reserved|committed|canceled|expired|limit_adjusted|reconciled_adjustment`), `usage_events_reservation_shape_check`, `usage_events_after_check` (numeric cast, sum bounded), `usage_events_actor_check`, composite FK `usage_events_reservation_bucket_fk`.
    - **Sản phẩm:** Migration `*_p5_usage_events.sql`.
    - **Phụ thuộc:** Bước 11.
    - **Verify:** psql `pg_constraint` chứa `usage_events_after_check` và `usage_events_reservation_shape_check`; thử INSERT `limit_adjusted` với reservation non-null kỳ vọng bị reject.
    - **Lane:** Backend.

13. **Bước 13 — Migration `idempotency_records` + append-only trigger + grants**
    - **Hành động:** Tạo `idempotency_records` cho service ops `reserve|commit|cancel`, unique `(service_identity_id, operation, idempotency_key)`, fingerprint, processing/completed shape, bounded replay ≤ 64 KiB, retention expiry. Tạo `usage_events_append_only_trg` chặn UPDATE/DELETE/TRUNCATE; cấp runtime role **không** có TRUNCATE/DDL/disable-trigger. DB clock cho window/expiry/terminal time.
    - **Sản phẩm:** Migration `*_p5_idempotency_and_triggers.sql`.
    - **Phụ thuộc:** Bước 12.
    - **Verify:** psql `SELECT tgname FROM pg_trigger WHERE tgrelid='control_plane.usage_events'::regclass` chứa `usage_events_append_only_trg`; thử UPDATE/DELETE trên `usage_events` bằng runtime role kỳ vọng bị chặn; `has_table_privilege(runtime_role,'control_plane.usage_events','TRUNCATE')` trả false.
    - **Lane:** Backend.

14. **Bước 14 — Migration tests + final validation gate**
    - **Hành động:** Viết migration test đối chiếu staged-to-final schema P5 của `docs/database-schema.md`: clean upgrade từ staged P4, dirty/representative P4 rows chặn replacement, final named checks chấp nhận đúng feature/metric shapes, entitlement-history preservation, composite FK, no-cascade history, role grants, forward-fix/pre-traffic rollback gate. Chỉ sau final validation mới expose quota API.
    - **Sản phẩm:** `tests/control-plane/migration/p5-staged-to-final.spec.ts`, `tests/control-plane/migration/append-only-trigger.spec.ts`.
    - **Phụ thuộc:** Bước 5–13.
    - **Verify:** Chạy suite bằng `‹cần chốt: test runner thật sau bootstrap›` trên PostgreSQL thật; kỳ vọng dirty P4 row chặn được replacement, entitlement history count không đổi, append-only trigger block mutation. Preflight/rehearsal fail → giữ nguyên P4 constraints, không mở quota API.
    - **Lane:** Backend (migration owner) + Tester.

### Nhóm D — Parallel implementation (sau freeze)

15. **Bước 15 — Window/policy calculator**
    - **Hành động:** Hiện thực policy/window calculator bằng DB-time inputs (`transaction_timestamp()`), xử lý calendar/rolling + DST gap/fold theo semantics đã duyệt; test boundary trước reserve transaction.
    - **Sản phẩm:** `apps/control-plane/src/modules/quota/` (window calculator).
    - **Phụ thuộc:** Bước 5, 14; `‹cần chốt: DST gap/fold behavior + anchor›`.
    - **Verify:** `tests/control-plane/quota/window-dst.spec.ts` — boundary trước/tại/sau reset và DST transition tính đúng window; không dùng client clock.
    - **Lane:** Backend.

16. **Bước 16 — Exact metric authorization + revoke locking**
    - **Hành động:** Hiện thực `ServiceScopeAuthorizationPort` cho exact `quota:reserve|commit|cancel|read` gắn đúng metric, chạy **trước** `ExternalIdentityResolutionPort`; revoke dùng lock discipline tương thích prefix lock order để request sau revoke bị deny.
    - **Sản phẩm:** `apps/control-plane/src/modules/service-identity/` (metric authorization).
    - **Phụ thuộc:** Bước 9, 15.
    - **Verify:** `tests/control-plane/quota/scope-before-resolution.spec.ts` — sai issuer/audience/app/metric/capability deny trước identity resolution; `tests/control-plane/quota/revoke-race.spec.ts` — request bắt đầu sau revoke bị deny, không lộ reservation state.
    - **Lane:** Backend.

17. **Bước 17 — Reserve transaction (atomic hard limit)**
    - **Hành động:** Hiện thực `ReserveUsageCommand` theo canonical transaction với atomic conditional update `limit - committed - active_reserved >= requested`, ghi `usage_reservations` + `usage_events(reserved)` + bucket counter trong cùng transaction. Lock order canonical **service identity/scope → idempotency → bucket → reservation**; không network call dưới row lock; fail-closed khi DB/entitlement không sẵn sàng.
    - **Sản phẩm:** `apps/control-plane/src/modules/quota/` (reserve).
    - **Phụ thuộc:** Bước 16.
    - **Verify:** `tests/control-plane/quota/last-unit-concurrency.spec.ts` — tại remaining = 1, nhiều reserve đồng thời có tổng successful quantity tối đa 1, bucket/event/reservation nhất quán; `tests/control-plane/quota/lock-order.spec.ts` assert đúng thứ tự lock.
    - **Lane:** Backend.

18. **Bước 18 — Commit / cancel / status**
    - **Hành động:** Hiện thực `CommitUsageCommand`, `CancelUsageCommand`, `GetReservationStatusQuery` theo cùng lock discipline; terminal chỉ `reserved -> committed|canceled|expired`; commit không vượt reserved; idempotency theo namespace `commit`/`cancel`; re-authorize exact metric scope trước mỗi operation kể cả reservation đã tồn tại.
    - **Sản phẩm:** `apps/control-plane/src/modules/quota/` (commit/cancel/status).
    - **Phụ thuộc:** Bước 17.
    - **Verify:** `tests/control-plane/quota/terminal-states.spec.ts` (opposite transition conflict; commit/cancel lặp không đổi bucket); `tests/control-plane/quota/timeout-status.spec.ts` (timeout phục hồi bằng status/retry cùng key, không tạo reservation mới).
    - **Lane:** Backend.

19. **Bước 19 — Usage summary + admin ledger/override/adjustment**
    - **Hành động:** Hiện thực `GetUsageSummaryQuery` (display-only remaining), admin ledger query, quota limit override qua Entitlement-owned port (Quota không đọc bảng override trực tiếp), `AdjustUsageCommand` tạo `limit_adjusted`/`reconciled_adjustment` event + audit trong cùng transaction, không rewrite history.
    - **Sản phẩm:** `apps/control-plane/src/modules/quota/` + `apps/control-plane/src/modules/entitlement/` (effective limit boundary).
    - **Phụ thuộc:** Bước 18.
    - **Verify:** `tests/control-plane/quota/adjustment-audit.spec.ts` — adjustment thêm event mới + audit, không UPDATE/DELETE event cũ; audit failure rollback adjustment.
    - **Lane:** Backend.

20. **Bước 20 — QuotaReconciliationPort + worker entrypoint**
    - **Hành động:** Hiện thực system-only `QuotaReconciliationPort` (list due candidates + expire/reconcile dưới transaction lock + state recheck, không lộ table) và worker main entrypoint `apps/control-plane/src/main-worker.*` chỉ gọi port, batch/backoff/observability theo policy; không import repository/table, không public ra Internet.
    - **Sản phẩm:** `apps/control-plane/src/modules/reconciliation/`; `apps/control-plane/src/main-worker.*`.
    - **Phụ thuộc:** Bước 18; `‹cần chốt: worker batch/backoff/retry limits + late-success policy›`.
    - **Verify:** `tests/control-plane/quota/reconciliation-duplicate.spec.ts` — hai invocation cùng nhận một due candidate chỉ tạo một terminal transition, một bucket change, một usage event (loser no-op); worker không truy cập table trực tiếp (review + test).
    - **Lane:** Backend.

21. **Bước 21 — Parallel Web + test suites**
    - **Hành động:** Song song sau freeze: Frontend xây User Web (usage summary/remaining display-only, reset time theo timezone server, decimal string format không parse qua JS `number`) và Admin Web (usage explorer, reservation detail, read-only event ledger, override/adjustment form) qua BFF; Tester viết concurrency/idempotency/security/migration/load/accessibility/responsive + mock Data Plane suites.
    - **Sản phẩm:** `apps/web/`; `tests/web/`; `tests/integration/` (Data Plane mock theo contract).
    - **Phụ thuộc:** Bước 4 (freeze); Backend API bước 17–20.
    - **Verify:** `tests/web/decimal-precision.spec.ts` (không mất chính xác), `tests/web/rbac-bypass.spec.ts`, `tests/web/accessibility.spec.ts`, `tests/web/responsive.spec.ts`; `tests/integration/dataplane-mock.spec.ts` chứng minh reserve phải thành công trước mock action và timeout không tạo key mới.
    - **Lane:** Frontend + Tester.

### Nhóm E — Integration + QA/reviewer

22. **Bước 22 — Chạy toàn bộ test bằng lệnh thật (gồm Supavisor + load)**
    - **Hành động:** Chạy migration/unit/contract/PostgreSQL/concurrency/reconciliation/security/load/web/mock suites; kiểm chứng Supavisor transaction pinning trong test thật; SQLSTATE chỉ retry bounded `40001`/`40P01` với backoff+jitter. Lỗi thuộc code owner sửa, không bẻ test.
    - **Sản phẩm:** Log output test + load report (evidence checklist mục 17).
    - **Phụ thuộc:** Bước 14–21.
    - **Verify:** `‹cần chốt: lệnh test tổng + load runner thật sau bootstrap›` trên PostgreSQL/Supavisor mục tiêu; kỳ vọng required suite pass, last-unit không double-spend, transaction pinning xác nhận, load report đo latency/error/deadlock/retry/lock-wait; dán output thật.
    - **Lane:** Backend + Frontend + Tester (tự kiểm trước gate).

23. **Bước 23 — QA + reviewer song song**
    - **Hành động:** QA kiểm chứng acceptance/checklist (API/functional, DB/concurrency/load, security/accessibility/responsive) từ output thật; reviewer kiểm ownership, port-only worker, lock order, atomic SQL, DB clock, no network-under-lock, append-only/audit, decimal contract, no Redis/billing/Data Plane business integration. Lặp tối đa ba vòng.
    - **Sản phẩm:** Kết quả gate mục 20.
    - **Phụ thuộc:** Bước 22.
    - **Verify:** QA gate PASS với evidence; reviewer hết mục “phải sửa”. Cùng lỗi lặp lần hai, Supavisor không pinning, hoặc thiếu quyết định → khai báo TẮC/CẠN LƯỢT theo mục 19.
    - **Lane:** QA + Reviewer (edit deny).

24. **Bước 24 — Cập nhật tài liệu sau sign-off**
    - **Hành động:** Chỉ khi cả hai gate đạt, cập nhật OpenAPI/runbook (timeout/outage/reconciliation/revoke/adjustment)/rollback/docs từ source và output đã kiểm chứng; đề nghị exit. Không ghi “đã chạy” nếu chưa chạy.
    - **Sản phẩm:** Tài liệu API/runbook đã đối chiếu source.
    - **Phụ thuộc:** Bước 23 (cả hai gate đạt).
    - **Verify:** Đối chiếu docs ↔ OpenAPI ↔ migration ↔ source; không tuyên bố có billing/Data Plane integration thật/Redis ledger; mọi lệnh/path khớp repo thật.
    - **Lane:** Document.

## 16. Parallel lanes và ownership

Manifest ownership cho shared path:

| Shared path | Writer duy nhất | Architect | Consumers |
|---|---|---|---|
| `contracts/openapi/control-plane.v1.yaml` | Backend do orchestrator chỉ định | Read-only: thiết kế/review/freeze revision | Frontend và Tester: read-only |

| Làn | Owner/path duy nhất | Điều kiện bắt đầu | Không được làm |
|---|---|---|---|
| Contract, trước parallel implementation | Backend là writer duy nhất của `contracts/openapi/control-plane.v1.yaml`; architect read-only | Trước ba làn implementation | Architect chỉ thiết kế/review/freeze revision; Frontend/Tester read-only. |
| Frontend | `apps/web/` | OpenAPI, decimal quantities, UX errors và permissions đã freeze | Không tự parse quantity bằng kiểu mất chính xác; không đổi API shape. |
| Backend | `apps/control-plane/`, đồng thời là owner duy nhất của `apps/control-plane/drizzle/migrations/` và `apps/control-plane/src/main-worker.*` | Port/API/DB semantics và lock order đã freeze | Không giao migration/worker entrypoint cho làn khác; không thêm network-under-lock, Redis ledger hay microservice. |
| Tester | `tests/` | Acceptance/concurrency/error/load targets đã freeze | Không giảm assertion để code pass; không triển khai product logic. |

Trong backend, migration phải có trước integration persistence; exact scope có trước quota service API; reserve có trước commit/cancel/status; port có trước worker. Frontend/backend/tester chỉ song song sau freeze. QA/reviewer chỉ vào gate sau khi ba làn tự kiểm xong; document cập nhật cuối.

## 17. Checklist

- **Functional:** [ ] Reserve/commit/cancel/status/summary/admin endpoints có happy/deny/timeout tests; [ ] terminal transition và partial commit đúng policy; [ ] worker xử lý due/anomaly đúng approved rules; [ ] remaining được đánh dấu display-only.
- **Security:** [ ] 100% operation re-authorize exact metric scope trước identity resolution/read; [ ] issuer+subject và resource mismatch tests đạt; [ ] revoke race không cho request mới qua; [ ] worker endpoint không public và không có secret/token trong persistence/log.
- **DB:** [ ] Migration Phase 4 -> 5 validate existing staged rows trước replacement; [ ] `quota_limit_overrides` được tạo trước scope expansion; [ ] final named capability/shape checks hỗ trợ đúng entitlement feature và bốn quota metric capabilities; [ ] active-feature rows/history/indexes được giữ, active-metric indexes tồn tại; [ ] mọi composite FK/trigger/grant đạt; [ ] event append-only; [ ] runtime role không DDL/TRUNCATE/disable trigger; [ ] forward-fix/pre-traffic rollback gate có evidence.
- **Concurrency:** [ ] Last-unit stress không double-spend; [ ] duplicate idempotency không duplicate mutation; [ ] duplicate reconciliation chỉ một terminal effect; [ ] SQLSTATE retry chỉ `40001|40P01`, bounded và có metric; [ ] lock order assertion/review hoàn tất.
- **Accessibility:** [ ] Usage/admin pages không có automated critical violation; [ ] progress có text equivalent; [ ] forms/dialogs/ledger keyboard-operable; [ ] focus/error/labels có assertions.
- **Responsive:** [ ] Viewport mobile/tablet/desktop đã freeze không làm mất action/filter/data cốt lõi; [ ] bảng ledger có overflow/card strategy có thể dùng bằng keyboard; [ ] decimal quantity không bị cắt nghĩa.
- **Observability:** [ ] Correlation xuyên API/transaction/worker/audit; [ ] dashboard/metric đo reserve allow/deny, replay/conflict, lock wait, SQLSTATE retry, expiry lag, anomaly và worker batch; [ ] alert threshold/runbook owner theo SLO đã duyệt.
- **Rollback:** [ ] Backup/PITR checkpoint và restore criteria có evidence; [ ] pre-write migration rollback được rehearsal; [ ] post-write forward-fix bảo toàn ledger; [ ] kill switch ngừng reserve/worker mà không xóa history; [ ] reopen checklist đối soát bucket-event-reservation.
- **Docs:** [ ] OpenAPI khớp implementation và decimal schema; [ ] runbook timeout/outage/reconciliation/revoke/adjustment được review; [ ] không docs nào nói có billing/Data Plane integration thật/Redis ledger; [ ] lệnh/path được đối chiếu repo.

Mỗi mục phải gắn evidence định lượng hoặc output thật. “Đã xem” không thay thế test result, query/constraint inspection, accessibility report, load report hoặc reviewer reference.

## 18. Exit gate

1. Sample metric và mọi decision bắt buộc đã được phê duyệt, biểu diễn thành contract/test; không còn default ngầm.
2. Migration, OpenAPI, backend, worker và Web cùng frozen revision; staged-to-final schema khớp `docs/database-schema.md` sau source update; required test pass trên PostgreSQL/Supavisor setup mục tiêu bằng output thật.
3. Last-unit concurrency chứng minh không double-spend; counters/reservations/events luôn thỏa invariant.
4. Replay/conflict, timeout/status, terminal/expiry và duplicate reconciliation đạt acceptance tests.
5. Exact per-operation metric scope, issuer+subject, scope-before-resolution, revoke race và fail-closed đạt security gate; entitlement scope behavior/history từ Phase 4 vẫn đạt regression tests sau constraint/index expansion.
6. Worker chỉ gọi `QuotaReconciliationPort`, cùng Control Plane codebase, không direct SQL/repository và không microservice ownership.
7. User/Admin Web đạt functional/accessibility/responsive/server-RBAC; remaining chỉ là display.
8. Observability/load/runbook/rollback gates có evidence; preflight-before-replacement, entitlement-history preservation, append-only/audit, forward-fix và pre-traffic rollback được kiểm chứng.
9. Không có Data Plane business integration ngoài mocks và không có billing.
10. QA PASS và reviewer không còn mục “phải sửa”.

## 19. Stop/rollback

**Dừng** nếu semantics metric/window/TTL/late-success/outage chưa đủ; Supavisor không bảo đảm transaction pinning; last-unit test double-spend; lock order bị đảo; có network call dưới lock; scope check sau identity resolution/read; append-only/audit bị bypass; worker cần direct table access; hoặc cùng lỗi lặp lần thứ hai.

Trước write/traffic, dừng route/worker, rollback migration bằng script đã review và dùng checkpoint nếu cần. Sau ledger write, không down-migrate bằng xóa/sửa event, reservation hoặc bucket history. Tắt reserve fail-closed và pause worker qua cơ chế vận hành đã duyệt, giữ status/read an toàn nếu xác minh được, chụp evidence, đối soát ledger, rồi forward-fix hoặc PITR restore theo incident decision. Sau restore/fix phải chạy lại invariant query, idempotency replay và reconciliation duplicate tests trước mở traffic.

Không fail-open để giảm outage và không chuyển sang Redis/manual counter. Hết ba vòng verification chưa đạt thì phase status vẫn là `blocked`, hoặc giữ `in_progress` nếu orchestrator đã chuyển phase sang trạng thái đó trước verification; ghi metadata riêng `verification_outcome: exhausted` cùng test/load evidence và rủi ro. Verification outcome không thay thế phase status và không được dùng để tuyên bố phase đã triển khai.

## 20. QA/reviewer sign-off

| Gate | Người chịu trách nhiệm | Bằng chứng bắt buộc | Kết quả |
|---|---|---|---|
| QA API/functional | `subagent/qa` | Contract, lifecycle, timeout/status, user/admin acceptance output | Chưa đánh giá |
| QA DB/concurrency/load | `subagent/qa` | Migration, last-unit, replay, duplicate worker, SQLSTATE và load reports | Chưa đánh giá |
| QA security/accessibility/responsive | `subagent/qa` | Exact-scope/revoke tests, accessibility scan/keyboard và viewport evidence | Chưa đánh giá |
| Reviewer architecture/correctness | `subagent/reviewer` | Review ownership, port-only worker, lock order, atomic SQL, DB clock, no network-under-lock | Chưa đánh giá |
| Reviewer security/data/docs | `subagent/reviewer` | Review issuer+subject, append-only/audit, decimal contract, no Redis/billing/Data Plane business integration | Chưa đánh giá |

Orchestrator chỉ đánh dấu **ĐẠT** sau khi mọi QA gate PASS và reviewer xác nhận không còn mục phải sửa. Backend/frontend/tester không tự ký đạt phần mình tạo.
