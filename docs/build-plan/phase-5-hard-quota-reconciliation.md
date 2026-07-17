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

1. Xác nhận Phase 4 sign-off và phê duyệt đầy đủ sample metric cùng mọi decision ở mục 3.
2. Architect thiết kế window algorithm, transaction/state machine, exact scopes, adjustment/reconciliation policy và threat model ở chế độ read-only; review và xác nhận revision đủ điều kiện freeze.
3. Backend, với vai trò contract writer duy nhất do orchestrator giao, ghi OpenAPI cùng hai port contracts, reason registry, idempotency canonicalization và examples vào `contracts/openapi/control-plane.v1.yaml`; architect review read-only trước khi freeze revision.
4. Viết migration theo staged order: tạo policy và `quota_limit_overrides`, validate P4 rows, replace/expand named scope checks/indexes, rồi tạo ledger/idempotency; thêm trigger, grants, preservation assertions và forward-fix/rollback tests.
5. Hiện thực policy/window calculator bằng DB-time inputs và test DST/boundaries trước reserve transaction.
6. Hiện thực exact metric authorization/revoke locking; chứng minh scope check xảy ra trước identity resolution.
7. Hiện thực reserve theo canonical transaction và atomic conditional update; sau đó commit, cancel và status theo cùng lock discipline.
8. Hiện thực usage summary, admin ledger/override/adjustment qua public ports và transactional audit.
9. Hiện thực `QuotaReconciliationPort`, duplicate-safe expire/reconcile và worker main chỉ gọi port.
10. Sau contract freeze, frontend/backend/tester làm song song trong ownership path; integration chỉ dùng mocks.
11. Chạy migration/unit/contract/PostgreSQL/concurrency/security/reconciliation/load/web tests bằng lệnh thật của repo sau bootstrap; lưu output thật.
12. Khắc phục lỗi ở code owner, không bẻ test; QA và reviewer kiểm tra độc lập tối đa ba vòng.
13. Cập nhật OpenAPI/runbook/docs từ source và output đã kiểm chứng; chỉ đề nghị exit khi cả hai gate ký đạt.

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
