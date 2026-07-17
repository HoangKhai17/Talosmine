# Phase 4 — Plan, Subscription và Entitlement

## 1. Trạng thái

`blocked`

Đây là kế hoạch, chưa phải mô tả implementation. Phase bị chặn cho tới khi Phase 3 đạt cổng ra và các quyết định nghiệp vụ ở mục 3 được phê duyệt. Tên phase trong tài liệu này là thứ tự build plan của repo, không thay thế cách đánh số lộ trình kiến trúc trong `docs/index.md` hoặc `docs/modular.md`.

Không được hiểu bất kỳ đường dẫn, endpoint, migration, bảng, màn hình hoặc test nào dưới đây là đã tồn tại. Tên lệnh trong file này đã được chốt tại DEC-T15 (`./decision-register.md` mục E), nhưng script chỉ **được tạo ở bước P1.7** — repo hiện chưa có script nào chạy được. Không ghi lệnh giả hoặc output tưởng tượng vào báo cáo QA.

## 2. Mục tiêu

1. Hiện thực mô hình Plan và Plan Version có snapshot bất biến, trong đó version chỉ đi theo `draft -> published -> retired`.
2. Hiện thực subscription cá nhân theo timeline, predicate hiệu lực canonical và mutation idempotent; không đưa organization/team vào mô hình.
3. Tính Effective Entitlement tại thời điểm yêu cầu từ account, subscription, plan grant và override; không tạo bảng materialized entitlement.
4. Cung cấp bề mặt REST/OpenAPI cho user, admin và service entitlement decision với authorization phía server.
5. Cấp scope M2M `entitlement:decide` cho đúng một feature thuộc đúng application; từ chối trước identity resolution nếu scope không hợp lệ.
6. Bảo đảm mutation nhạy cảm có audit đồng bộ trong cùng transaction và các invariant quan trọng được giữ cả ở service lẫn database.

## 3. Prerequisites và human decisions

**Approver duy nhất cho mọi quyết định nghiệp vụ dưới đây là chủ dự án** (`./decision-register.md`, DEC-G01). Dự án là solo dev + AI agents; không có product owner/security/operations tách biệt ký duyệt chéo. Agent không tự approve thay con người, kể cả khi đề xuất do agent soạn.

- [ ] Phase 3 đã được QA và reviewer ký đạt; các port Account, Identity, Catalog, Service Identity tối thiểu và Audit đã có contract ổn định.
- [ ] Xác nhận migration Phase 3 đã tạo baseline `service_identities` và `audit_events`, gồm các FK actor cần thiết. Phase 4 phụ thuộc trực tiếp vào baseline này, không tạo lại hai bảng hoặc audit FK.
- [ ] Chủ dự án phê duyệt **có hay không default plan/subscription khi account được tạo** (DEC-B04). Nếu có, phải chốt chính xác Plan Version, thời điểm `starts_at`, trusted source, idempotency namespace và quy tắc migration khi có version mới.
- [ ] Chủ dự án phê duyệt **account activation policy** (DEC-B04): điều kiện `pending -> active`, quan hệ thứ tự giữa activation và tạo subscription, cách retry và hành vi nếu một bước thất bại.
- [ ] Chủ dự án phê duyệt subscription lifecycle (DEC-B09): create/change, suspend/resume, immediate cancel hay cuối kỳ, undo cancel nếu có, terminal state cuối kỳ là `canceled` hay `expired`, và effective time của từng transition.
- [ ] Chốt hành vi upgrade/downgrade không liên quan billing: version đích, thời điểm hiệu lực, cách tạo timeline mới, và dữ liệu feature bị mất quyền. Không tự chọn immediate hoặc end-of-period.
- [ ] Chốt trusted source/operation allowlist, retention/retry window của `subscription_idempotency_records`, revoke SLA, entitlement cache/outage policy và last-known-good theo mức rủi ro feature.
- [ ] Chốt danh sách admin permissions và separation of duties cho plan, subscription, override, service identity và audit read.
- [ ] Chốt retention/privacy cho subscription, override, idempotency response, audit và log; không tạo purge job trước quyết định.
- [ ] Xác nhận quota schema/API/data được hoãn toàn bộ sang Phase 5; Phase 4 không tạo fixture, seed hoặc endpoint quota để thay cho quyết định metric/window/TTL còn mở.
- [ ] Trước implementation, `docs/database-schema.md` phải được cập nhật với staged contract Phase 4 -> Phase 5 cho `service_identity_scopes`; migration Phase 4 đối chiếu contract staged đó sau source update, không suy diễn từ final schema hiện tại.
- [ ] Kiểm chứng PostgreSQL/Supavisor thực tế và isolation level trước khi chốt transaction implementation. Driver đã chốt tại DEC-T09: `postgres@3.4.9` (postgres.js) + `drizzle-orm@0.45.2`, **bắt buộc `prepare: false`** vì runtime đi qua Supavisor ở transaction pooling mode — prepared statement có tên sẽ vỡ khi connection bị trả về pool giữa các statement. Kéo theo: cấm mọi thứ phụ thuộc session state (session-level advisory lock, temp table, `SET` ngoài transaction); lock order của subscription chỉ dùng row lock trong **một** transaction.

Thiếu bất kỳ quyết định bắt buộc nào cho một luồng thì **dừng riêng luồng đó**, ghi blocker và không điền default tạm. Phase này không chọn payment provider.

## 4. Phạm vi

- Các module Plan/Plan Version, Subscription, Entitlement và phần exact-feature scope của Service Identity trong cùng NestJS Control Plane modular monolith.
- Các bảng `plans`, `plan_versions`, `plan_feature_grants`, `subscriptions`, `subscription_idempotency_records`, `entitlement_overrides`; Phase 4 tạo `service_identity_scopes` exact feature dựa trên `service_identities` và audit FK do Phase 3 tạo.
- `service_identity_scopes` staging dùng đủ canonical columns để Phase 5 expand tại chỗ, nhưng capability/shape chỉ chấp nhận `entitlement:decide` với exact feature.
- REST JSON versioned và OpenAPI 3.1 cho user, service và admin.
- Next.js Web/BFF cho trang user và admin, responsive trên desktop/điện thoại/máy tính bảng.
- Admin RBAC server-side, audit bắt buộc, temporal/concurrency/idempotency/security tests và migration/trigger tests.
- Entitlement quyết định theo account cá nhân, application và feature; app tích hợp bằng stable feature key, không bằng tên plan.

## 5. Ngoài phạm vi

- Payment provider, checkout, invoice, webhook, refund, pricing, proration và Billing Adapter thật.
- Reserve/commit/cancel/status quota, usage bucket/reservation/event, reconciliation và mọi phép trừ quota.
- Mọi quota API/data/table trong Phase 4, gồm `plan_quota_policies`, `quota_limit_overrides`, quota scope theo metric, usage ledger và quota seed/fixture.
- Organization, team, shared subscription, pooled quota hoặc owner ngoài account cá nhân.
- Data Plane business integration, gateway bắt buộc hoặc proxy business traffic qua Hub.
- Materialized `effective_entitlements`, Redis/cache làm nguồn quyền, tên plan/`isPremium` trong app logic hoặc token.
- Tự quyết quota metric/window/TTL/amount để có dữ liệu demo.
- Thay đổi stack, thêm microservice, outbox hoặc package chưa được phê duyệt.

## 6. Deliverables

1. OpenAPI 3.1 đã freeze cho toàn bộ endpoint trong phase, gồm auth scheme, reason code, idempotency và correlation.
2. Migration forward-only cùng custom SQL trigger cho immutable Plan Version, append-only audit liên quan và `service_identity_scopes` staging exact-feature.
3. Plan module với draft builder, validation, publish và retire.
4. Subscription module với timeline canonical, overlap prevention, lock order và replay semantics.
5. Entitlement module tính quyết định dẫn xuất và quản lý override có precedence.
6. Service Identity scope staging có canonical columns nhưng named capability/shape checks chỉ cho `entitlement:decide`, `feature_id` non-null và `usage_metric_id` null; re-authorization diễn ra trước identity resolution.
7. API/UI quản lý exact feature scope dựa trên baseline `service_identities` của Phase 3.
8. User Web hiển thị plan/subscription/entitlement và Admin Web cho các use case quản trị được duyệt.
9. Bộ test contract, unit, integration PostgreSQL, temporal boundary, concurrency, idempotency, security, audit, accessibility và responsive.
10. Tài liệu API/runbook/rollback được cập nhật sau khi code thật được kiểm chứng; không ghi trạng thái “đã chạy” nếu chưa chạy.

## 7. Target paths

Các path dưới đây là **ranh giới mục tiêu**; tên file cụ thể phải đối chiếu cấu trúc bootstrap thật trước khi tạo, nhưng không được chuyển ownership sang module khác.

| Làn | Target path | Nội dung |
|---|---|---|
| Contract | `contracts/openapi/control-plane.v1.yaml` | OpenAPI 3.1, schema và example cho user/service/admin; Backend là writer duy nhất theo manifest ở mục 16. |
| Plan backend | `apps/control-plane/src/modules/plan/` | Domain, application ports/use cases, controller và persistence Plan. |
| Subscription backend | `apps/control-plane/src/modules/subscription/` | Timeline, lifecycle, idempotency và persistence Subscription. |
| Entitlement backend | `apps/control-plane/src/modules/entitlement/` | Decision/override; không có effective-entitlement repository. |
| Integration backend | `apps/control-plane/src/modules/service-identity/` | Exact feature scopes trên staged schema; không có quota capability/API. |
| Admin/Audit | `apps/control-plane/src/modules/admin/`, `apps/control-plane/src/modules/audit/` | Admin orchestration qua public ports và audit append. |
| Migration | `apps/control-plane/drizzle/migrations/` | Drizzle forward migration và custom SQL trigger/constraint. |
| User Web | `apps/web/` | Route/component/BFF client cho plan, subscription, entitlement của chính user. |
| Admin Web | `apps/web/` | Route/component/BFF client admin; route namespace theo convention thật của app. |
| Backend tests | `tests/control-plane/` | Contract, integration DB, temporal, concurrency, trigger và security. |
| Web tests | `tests/web/` | User/admin behavior, RBAC response, accessibility và responsive. |

Không tạo HTTP loopback giữa các module. Module consumer gọi public application port trong cùng process và không import repository/table của module owner khác.

## 8. DB/migration

1. Migration Phase 4 trong `apps/control-plane/drizzle/migrations/` phải chạy sau migration Phase 3 đã tạo `service_identities`, `audit_events` và actor FK. Không tạo lại baseline đó; chuỗi tạo mới là `plans` -> `plan_versions` -> `plan_feature_grants` -> `subscriptions` -> `subscription_idempotency_records` -> `entitlement_overrides` -> `service_identity_scopes`; giữ FK `ON DELETE RESTRICT` mặc định. Phase 4 không tạo `plan_quota_policies` hoặc `quota_limit_overrides`.
2. Dùng `uuid` do application sinh, `timestamptz` UTC, DB clock cho thời gian quyết định và `text` + named `CHECK` cho state; Phase 4 không có quota quantity/API data.
3. `plan_versions` có unique `(plan_id, version)`, state shape và vòng đời duy nhất `draft -> published -> retired`; publish gán `published_at` bằng DB clock.
4. Custom SQL tạo `plan_versions_immutable_snapshot_trg` và `plan_feature_grants_immutable_trg`. Trigger phải khóa/đọc parent và chặn insert/update/delete grant khi parent đã published/retired; trigger quota policy chỉ được bổ sung khi Phase 5 tạo bảng đó.
5. `subscriptions` giữ `account_id`, `plan_version_id`, status, `starts_at`, `ends_at`, `cancel_at`, trusted `source`, optional `source_reference` và supersession reference; không có organization/team columns.
6. Định nghĩa `effective_end = LEAST(cancel_at, ends_at)` theo PostgreSQL NULL semantics. Predicate hiệu lực tại database time `t` là `starts_at <= t AND t < COALESCE(effective_end, infinity)` với status `pending|active|cancel_at_period_end`.
7. Overlap dùng interval `[starts_at,effective_end)` của **mọi row và mọi status**, kể cả suspended/canceled/expired. Mutation khóa account để serialize; start mới đúng prior effective end phải được chấp nhận.
8. Terminal transition sang `canceled`/`expired` phải ghi `ends_at` hữu hạn trong cùng transaction. `cancel_at_period_end` phải có `cancel_at > starts_at` và không sau `ends_at` nếu end tồn tại.
9. `subscription_idempotency_records` unique theo `(trusted_source, operation, idempotency_key)`, lưu fingerprint, state, bounded sanitized replay và expiry. Lock order: idempotency record -> account -> subscription.
10. `entitlement_overrides` lưu effect `allow|deny`, validity `[valid_from,valid_until)`, creator/revoker và reason; không update nội dung lịch sử, chỉ revoke theo shape constraint và audit.
11. Phase 4 tạo `service_identity_scopes` staging với canonical columns: `id`, `service_identity_id`, `application_id`, `capability`, `feature_id`, `usage_metric_id`, `status`, `revoked_at`, `revocation_reason`, `created_at`, `updated_at`. Composite FK bảo đảm service/feature/application binding; cột metric tồn tại để expand forward ở Phase 5 nhưng mọi row Phase 4 phải có metric null.
12. Named `service_identity_scopes_capability_check` ở Phase 4 chỉ cho `entitlement:decide`; named `service_identity_scopes_shape_check` yêu cầu đúng một `feature_id` non-null và `usage_metric_id IS NULL`. Chỉ tạo `service_identity_scopes_active_feature_key` cùng feature lookup index theo staged source contract; không tạo `service_identity_scopes_active_metric_key`, metric lookup index hoặc quota capability.
13. Sensitive mutation append `audit_events` bằng `operationId + sequence` trong cùng Unit of Work; lỗi audit rollback domain mutation.
14. Migration validation phải kiểm tra canonical columns, tên staging checks/indexes, từ chối mọi `quota:*`/metric row, quyền runtime không được DDL/disable trigger, immutable snapshot, overlap race, terminal finite end và replay bound.
15. Staged migration contract phải khớp phần Phase 4 của `docs/database-schema.md` sau source update; sai khác cột/check/index là blocker, không tự tạo biến thể thứ ba.

Không rollback production bằng cách sửa snapshot published hoặc xóa history. Sau khi migration nhận write, ưu tiên forward-fix; rollback DDL chỉ được dùng trước traffic theo mục 19.

## 9. Backend API

**User API:**

- `GET /v1/me/subscriptions`: trả current/future timeline của chính session account, dùng predicate canonical và không nhận `accountId` từ browser.
- `GET /v1/me/entitlements`: trả feature access dẫn xuất với machine reason an toàn, decision time/cache directive phù hợp; không lộ override reason nội bộ hoặc tên plan để app suy luận.
- Endpoint plan public/authorized chỉ trả metadata đã được công bố; path cuối cùng phải được freeze trong OpenAPI trước implementation.

**Service API:**

- `POST /v1/service/entitlement-decisions`: nhận full verified `issuer + subject`, stable application/feature key và correlation ID.
- Thứ tự bắt buộc: xác minh M2M token -> re-authorize DB active identity/app binding/exact feature scope -> resolve external identity -> account status -> catalog ownership -> active subscription -> immutable grant/override.
- Kết quả transport thành công chứa `decision: allow|deny`, machine-readable reason, decision time, policy/version reference tối thiểu và cache directive; không trả plan name.
- Account `pending|disabled`, không có subscription hiệu lực, thiếu grant hoặc deny override đều deny. Deny override hiệu lực thắng allow override và plan grant.

**Admin API:**

- Plan: create plan/version, set feature grant trên draft, review snapshot, publish, retire.
- Subscription: create/change, suspend/resume, set/undo cancel-at-period-end nếu policy cho phép, cancel/expire và xem timeline.
- Override: create/revoke entitlement override có scope, validity, reason và correlation.
- Service Identity: register metadata, grant/revoke exact `entitlement:decide` feature scope, revoke identity.
- Mỗi mutation retry-sensitive dùng `Idempotency-Key` theo contract; subscription trusted source đến từ authenticated actor/integration, không từ body.
- Admin controller chỉ điều phối public command/port, không sửa table của module khác. Permission và reason được kiểm tra phía server trước mutation.

Error contract tối thiểu bao phủ `VALIDATION_FAILED`, `SERVICE_RESOURCE_SCOPE_DENIED`, `ACCOUNT_NOT_ACTIVE`, `ENTITLEMENT_DENIED`, `IDEMPOTENCY_CONFLICT`, `INVALID_STATE_TRANSITION`, `SUBSCRIPTION_OVERLAP`, `SUBSCRIPTION_PERIOD_INVALID`, `SUBSCRIPTION_CANCEL_AT_INVALID` và dependency failure an toàn.

## 10. User web

1. Trang plan hiển thị metadata được phép công bố và ghi rõ đây là thông tin sản phẩm, không phải bằng chứng authorization.
2. Trang subscription hiển thị current/future timeline, status, `starts_at`, effective end và scheduled cancel theo dữ liệu server; không tự suy luận state từ clock browser để cấp quyền.
3. Trang entitlement liệt kê application/feature và trạng thái allow/deny ở mức an toàn; không hiển thị admin-only reason hoặc raw policy internals.
4. Mọi dữ liệu đi qua Next.js BFF với session server-side; browser không truyền account/actor đáng tin cậy và không gọi service M2M API.
5. Empty/loading/error/denied states có nội dung rõ ràng; dependency failure không được biến thành “được phép”.
6. UI responsive ở các viewport do test contract xác định cho mobile/tablet/desktop; bảng timeline phải có phương án card/overflow đọc được bằng keyboard và screen reader.
7. Ẩn nút hoặc route chỉ là UX. Backend vẫn thực thi ownership và authorization cho mọi request.

## 11. Admin web

1. Plan builder chỉ chỉnh draft; published/retired mở ở chế độ review bất biến. UI phải phản ánh lỗi trigger/service nếu state đổi cạnh tranh.
2. Version review hiển thị diff/summary grant, validation errors và cảnh báo quota-policy chưa đủ quyết định; publish cần confirmation, reason và permission.
3. Subscription timeline hiển thị interval half-open, source tin cậy, supersession và transition; form không cho chọn timing chưa được policy phê duyệt.
4. Override form yêu cầu exact account/feature, effect, validity và reason; deny precedence được giải thích trước submit.
5. Service identity scope editor chỉ cho exact feature thuộc application đã bind; không có generic wildcard scope.
6. Mỗi mutation gửi correlation/idempotency theo contract, xử lý replay/conflict rõ ràng và không tự retry với key mới sau timeout.
7. Route guard và navigation permission hỗ trợ UX, nhưng mọi RBAC quyết định nằm ở server. Không render client secret/token hoặc audit payload nhạy cảm.
8. Dialog, form error, focus restoration, keyboard order, table/card và responsive navigation phải qua test accessibility/admin.

## 12. Integration/security

- BFF user/admin dùng session cookie `HttpOnly`, `Secure`, `SameSite` và CSRF protection theo baseline; service API chỉ dùng Auth0 M2M token đúng issuer/audience/expiry.
- Exact `entitlement:decide` feature scope được kiểm tra **trước** `ExternalIdentityResolutionPort`; caller sai scope không được biết identity/account có tồn tại hay trạng thái gì.
- Data Plane phải gửi full verified `issuer + subject`; Control Plane không nhận internal `accountId` làm user identity từ service/browser.
- Service identity bind đúng một application, credential riêng từng backend, không lưu client secret trong DB/source/log/audit.
- Account disabled luôn deny, kể cả subscription và allow override còn hiệu lực. Deny override thắng mọi nguồn allow.
- App vẫn phải thực hiện domain authorization sau entitlement allow; entitlement không cấp quyền truy cập mọi resource nghiệp vụ.
- Authentication/entitlement rủi ro cao fail-closed. Last-known-good chỉ bật cho exact feature sau khi outage policy, TTL và revoke SLA được duyệt và test.
- Mutation nhạy cảm yêu cầu actor, permission, reason, correlation và transactional audit; payload log/audit phải redact token, secret và PII không cần thiết.
- Không gửi plan name, giá, `isPremium` hoặc quota remaining làm authorization claim.

## 13. Contract freeze

Trước khi frontend/backend/tester bắt đầu song song, architect thiết kế và review contract ở chế độ read-only.

Backend là writer duy nhất ghi revision OpenAPI vào `contracts/openapi/control-plane.v1.yaml` theo thiết kế đã review, gồm:

- path/method, operation ID và audience của từng endpoint;
- request/response schema, timestamp, nullable field và pagination;
- full `issuer + subject` shape cho service decision;
- entitlement decision/reason/cache directive;
- subscription state machine, canonical effective end và interval semantics;
- `Idempotency-Key`, fingerprint inputs, replay/conflict behavior và retention đã duyệt;
- `X-Correlation-Id` propagation;
- admin permission matrix và reason requirement;
- standard error envelope `code`, safe `message`, `correlationId`, allowlisted `details`;
- examples không chứa quota/plan mặc định giả hoặc provider-specific fields.

Architect xác nhận revision đủ điều kiện freeze bằng review read-only.

Backend ghi revision/commit cụ thể. Sau freeze, thay đổi breaking phải dừng ba làn, quay lại thiết kế/review, để Backend cập nhật contract rồi freeze revision mới; không để mỗi làn tự diễn giải payload.

## 14. Tests

- **Plan immutable:** mọi update/delete snapshot published/retired và insert/update/delete grant con đều bị custom SQL trigger chặn; chỉ `published -> retired` hợp lệ; concurrent publish chỉ có một kết quả canonical.
- **Publish validation:** draft thiếu grant bắt buộc, feature sai app hoặc state không hợp lệ bị từ chối và không có audit “thành công”; không có quota policy input/API trong Phase 4.
- **Temporal:** test đúng trước/tại/sau `starts_at`, `cancel_at`, `ends_at`; cả hai end null; một end null; end bằng start mới; pending tự effective; terminal không effective.
- **Overlap:** mọi cặp status, interval nested/equal/touching/infinite; two concurrent creates/changes cùng account không tạo overlap; terminal row vẫn tham gia check.
- **Lifecycle:** mọi transition cho phép và mọi transition cấm; terminal luôn có finite `ends_at`; undo scheduled cancel chỉ khi policy cho phép và clear shape đúng.
- **Subscription idempotency:** cùng source/operation/key + fingerprint replay đúng response; fingerprint khác conflict; concurrent same-key có một mutation/audit outcome; source từ authentication, không từ body.
- **Entitlement precedence:** disabled/pending account deny; deny override thắng allow/grant; expired/revoked override không ảnh hưởng; thiếu subscription/grant deny; rename plan không đổi decision.
- **Scope/security:** wrong app/feature/scope deny trước identity resolution; forged account ID bị từ chối; revoked identity/scope deny request mới; response không lộ existence/secret/plan name; staging DB từ chối `quota:*`, metric-bound scope và feature-null row.
- **Audit:** mutation thành công có đúng audit sequence; audit append failure rollback mutation; equivalent retry không duplicate; conflicting audit replay rollback.
- **Database:** canonical staged columns, entitlement-only named checks, `service_identity_scopes_active_feature_key`/feature lookup index, composite FK, role grants, trigger SQLSTATE/application error và forward migration từ Phase 3 được kiểm tra trên PostgreSQL thật; xác nhận không có metric index và không tồn tại `plan_quota_policies`/`quota_limit_overrides` do Phase 4 tạo.
- **API contract:** OpenAPI validation, error envelope, auth audience, idempotency/correlation headers và examples.
- **Web:** own-data isolation, loading/error/empty/conflict, keyboard/focus/label/contrast, mobile/tablet/desktop layout và server RBAC bypass attempts.

Không sửa test để hợp thức hóa hành vi trái contract. Test dùng database clock có kiểm soát hoặc boundary fixture phù hợp, không phụ thuộc clock browser.

## 15. Ordered steps

Runbook thực thi tuần tự theo mạch **decisions → contract freeze → migration tuần tự → parallel impl → integration → QA/reviewer**. Mỗi bước ghi năm thành phần: **Hành động**, **Sản phẩm**, **Phụ thuộc**, **Verify**, **Lane** (khớp mục 16).

**Tooling đã chốt.** Tên lệnh trong ô Verify lấy từ bảng script canonical DEC-T15 (`./decision-register.md` mục E); không tự đặt tên khác. Script được **tạo ở bước P1.7** — repo greenfield hiện chưa có script nào chạy được, nên mọi lệnh dưới đây chỉ chạy được sau P1.7. Tên bảng, constraint, trigger, index, lock order và tên test suite là cụ thể và bắt buộc. **Không đánh dấu bước nào là “đã chạy”.**

### Nhóm A — Decisions

1. **Bước 1 — Chốt tiền đề và quyết định nghiệp vụ**
   - **Hành động:** Xác nhận Phase 3 đã QA/reviewer sign-off; ghi đầy đủ các quyết định mục 3 (default plan/subscription, activation policy, subscription lifecycle + terminal branch `canceled` vs `expired`, upgrade/downgrade timing, trusted source/operation allowlist, retention/retry window `subscription_idempotency_records`, revoke SLA, entitlement cache/outage/last-known-good, admin permissions/SoD, retention/privacy). Blocker nào chưa chốt thì dừng riêng luồng đó, không lập fixture/default.
   - **Sản phẩm:** Bảng quyết định đã điền trong mục 3 của file này (checkbox tick + giá trị chốt).
   - **Phụ thuộc:** Phase 3 sign-off; `‹cần chốt: toàn bộ quyết định nghiệp vụ mục 3›`.
   - **Verify:** Rà mục 3 — không còn checkbox trống áp dụng cho luồng sắp build; mỗi luồng có quyết định tương ứng hoặc blocker được ghi rõ.
   - **Lane:** Orchestrator điều phối; các lane khác chưa mở.

### Nhóm B — Contract freeze

2. **Bước 2 — Architect thiết kế read-only**
   - **Hành động:** Thiết kế subscription state machine, entitlement decision order, permission matrix, port input/output (`PlanVersionLookupPort`, `ActiveSubscriptionPort`, `ServiceScopeAuthorizationPort`, `EntitlementDecisionPort`, `EntitlementEligibilityPort`, `SubscriptionMutationPort`, `AuditAppendPort`) và threat model; đối chiếu `docs/modular.md` và phần Phase 4 của `docs/database-schema.md` (đã source-update staged contract).
   - **Sản phẩm:** Ghi chú thiết kế/threat model (read-only, không ghi vào contract file).
   - **Phụ thuộc:** Bước 1; source update Phase 4 của `docs/database-schema.md`.
   - **Verify:** Design đối chiếu 1-1 với `docs/modular.md` mục 6–8 và mục 8.2 staged contract; architect xác nhận không lệch tên port/state.
   - **Lane:** Architect (read-only).

3. **Bước 3 — Backend ghi và freeze OpenAPI contract**
   - **Hành động:** Backend (contract writer duy nhất) ghi path/method/operation ID, request/response schema, full `issuer + subject` shape cho service decision, entitlement reason/cache directive, subscription interval semantics, `Idempotency-Key`/fingerprint inputs/replay-conflict, `X-Correlation-Id`, admin permission matrix, error envelope và examples không chứa quota/plan giả. Architect review read-only rồi xác nhận freeze revision.
   - **Sản phẩm:** `contracts/openapi/control-plane.v1.yaml` (revision freeze, ghi commit cụ thể).
   - **Phụ thuộc:** Bước 2.
   - **Verify:** `pnpm openapi:lint` (redocly lint `contracts/openapi/control-plane.v1.yaml`, DEC-T07/T15) kỳ vọng 0 lỗi schema OpenAPI 3.1; `pnpm openapi:drift` kỳ vọng type sinh lại khớp bản đã commit; không có operation quota/billing trong document.
   - **Lane:** Backend (contract writer) + Architect (review/freeze).

### Nhóm C — Migration tuần tự (root `apps/control-plane/drizzle/migrations/`, forward-only)

4. **Bước 4 — Migration Plan snapshot**
   - **Hành động:** Tạo `plans` → `plan_versions` → `plan_feature_grants` bằng Drizzle Kit forward migration, gồm unique `plan_versions_plan_version_key (plan_id, version)`, `plan_versions_id_status_key`, named checks `plan_versions_status_check`/`plan_versions_published_state_check`/`plan_versions_version_check` và `plan_feature_grants_version_feature_key`. Giữ FK `ON DELETE RESTRICT`.
   - **Sản phẩm:** Migration `*_p4_plan.sql` dưới `apps/control-plane/drizzle/migrations/`.
   - **Phụ thuộc:** Bước 3; baseline Phase 3 (`service_identities`, `audit_events`, actor FK).
   - **Verify:** `pnpm db:generate` sinh migration từ schema, rồi `pnpm db:migrate` (drizzle-kit 0.31.10, role migration nối **trực tiếp PostgreSQL, không qua Supavisor** — DEC-T09/T15); kiểm bằng psql `SELECT conname FROM pg_constraint WHERE conrelid = 'control_plane.plan_versions'::regclass` chứa `plan_versions_status_check` và `plan_versions_published_state_check`; `SELECT count(*) FROM information_schema.tables WHERE table_schema='control_plane' AND table_name IN ('plans','plan_versions','plan_feature_grants')` trả 3.
   - **Lane:** Backend (owner migration root).

5. **Bước 5 — Trigger immutable published snapshot**
   - **Hành động:** Viết custom SQL tạo `plan_versions_immutable_snapshot_trg` và `plan_feature_grants_immutable_trg`; trigger khóa/đọc parent version và chặn INSERT/UPDATE/DELETE grant cùng UPDATE/DELETE cột snapshot khi version `published`/`retired`. Chưa tạo trigger quota policy (bảng chưa tồn tại ở Phase 4).
   - **Sản phẩm:** Migration `*_p4_plan_immutable_triggers.sql`.
   - **Phụ thuộc:** Bước 4.
   - **Verify:** psql `SELECT tgname FROM pg_trigger WHERE tgrelid IN ('control_plane.plan_versions'::regclass,'control_plane.plan_feature_grants'::regclass)` chứa cả hai tên trigger; thử UPDATE một grant của version `published` kỳ vọng lỗi application-defined (raise), không thành công.
   - **Lane:** Backend.

6. **Bước 6 — Migration Subscription + idempotency**
   - **Hành động:** Tạo `subscriptions` (cột `account_id`, `plan_version_id`, `status`, `starts_at`, `ends_at`, `cancel_at`, `source`, `source_reference`, `supersedes_subscription_id`) và `subscription_idempotency_records`. Thêm `subscriptions_status_check`, `subscriptions_period_check`, `subscriptions_cancel_at_range_check`, `subscriptions_status_time_shape_check`, unique `subscriptions_id_account_key`, và unique `subscription_idempotency_records_source_operation_key (trusted_source, operation, idempotency_key)`. Không có cột organization/team.
   - **Sản phẩm:** Migration `*_p4_subscription.sql`.
   - **Phụ thuộc:** Bước 4.
   - **Verify:** psql kiểm `pg_constraint` cho `subscriptions_status_time_shape_check` và `subscription_idempotency_records_source_operation_key`; xác nhận không có cột `organization_id`/`team_id` qua `information_schema.columns`.
   - **Lane:** Backend.

7. **Bước 7 — Migration entitlement override**
   - **Hành động:** Tạo `entitlement_overrides` với `effect allow|deny`, validity `[valid_from, valid_until)`, creator/revoker FK, `entitlement_overrides_validity_check`, `entitlement_overrides_revocation_check` và `entitlement_overrides_lookup_idx (... ) WHERE revoked_at IS NULL`. Không tạo `quota_limit_overrides` ở Phase 4.
   - **Sản phẩm:** Migration `*_p4_entitlement_overrides.sql`.
   - **Phụ thuộc:** Bước 6.
   - **Verify:** psql xác nhận bảng `entitlement_overrides` tồn tại và `SELECT to_regclass('control_plane.quota_limit_overrides')` trả NULL (chưa được tạo ở Phase 4).
   - **Lane:** Backend.

8. **Bước 8 — Migration service_identity_scopes staging (entitlement-only)**
   - **Hành động:** Tạo `service_identity_scopes` với **đủ canonical columns** (`id`, `service_identity_id`, `application_id`, `capability`, `feature_id`, `usage_metric_id`, `status`, `revoked_at`, `revocation_reason`, `created_at`, `updated_at`) và composite FK service/feature/application. Named `service_identity_scopes_capability_check` ở P4 chỉ cho `entitlement:decide`; `service_identity_scopes_shape_check` yêu cầu đúng một `feature_id` non-null và `usage_metric_id IS NULL`. Chỉ tạo `service_identity_scopes_active_feature_key` + feature lookup index; **không** tạo `service_identity_scopes_active_metric_key` hay metric lookup.
   - **Sản phẩm:** Migration `*_p4_service_identity_scopes_staging.sql`.
   - **Phụ thuộc:** Bước 4 (features/usage_metrics từ Catalog Phase trước); baseline `service_identities` Phase 3.
   - **Verify:** psql: `pg_constraint` cho `service_identity_scopes_capability_check` chỉ chứa `entitlement:decide`; thử INSERT row có `usage_metric_id` non-null hoặc capability `quota:reserve` kỳ vọng bị check reject; `pg_indexes` có `service_identity_scopes_active_feature_key` và **không** có `service_identity_scopes_active_metric_key`.
   - **Lane:** Backend.

9. **Bước 9 — Migration/trigger tests trên PostgreSQL thật**
   - **Hành động:** Viết migration test đối chiếu staged contract Phase 4 của `docs/database-schema.md`: canonical columns, tên staging checks/indexes, từ chối `quota:*`/metric row, immutable snapshot, overlap race, terminal finite `ends_at`, replay bound, runtime role không DDL/disable-trigger.
   - **Sản phẩm:** `tests/control-plane/migration/p4-schema.spec.ts`, `tests/control-plane/migration/plan-immutable-trigger.spec.ts`.
   - **Phụ thuộc:** Bước 4–8.
   - **Verify:** `pnpm test` (Vitest 4.1.10, DEC-T05/T15) chạy suite trên **PostgreSQL thật qua testcontainers 12.0.4 + @testcontainers/postgresql 12.0.4** — trigger, constraint và overlap race là hành vi của PostgreSQL nên không mock/in-memory được. Kỳ vọng toàn bộ assertion pass, đặc biệt case reject `quota:*` scope và block mutation snapshot published.
   - **Lane:** Backend (migration owner) + Tester (assertion độc lập).

### Nhóm D — Parallel implementation (sau freeze)

10. **Bước 10 — Plan module**
    - **Hành động:** Hiện thực Plan domain/application/persistence: draft builder, validation, `PublishPlanVersionCommand` gán `published_at` bằng DB clock, `RetirePlanVersionCommand`; khóa invariant `draft -> published -> retired` ở service, dựa trigger ở DB.
    - **Sản phẩm:** `apps/control-plane/src/modules/plan/`.
    - **Phụ thuộc:** Bước 5, 9.
    - **Verify:** `tests/control-plane/plan/publish-lifecycle.spec.ts` — concurrent publish chỉ một transition canonical; sửa grant của published bị từ chối ở cả service lẫn DB.
    - **Lane:** Backend.

11. **Bước 11 — Subscription timeline + idempotency**
    - **Hành động:** Hiện thực canonical predicate `starts_at <= t AND t < COALESCE(LEAST(cancel_at, ends_at), 'infinity')` với status `pending|active|cancel_at_period_end`; overlap check trên `[starts_at, effective_end)` cho **mọi** status (kể cả terminal); mutation `SELECT ... FOR UPDATE` account để serialize; terminal transition ghi `ends_at` hữu hạn cùng transaction. Áp lock order **subscription idempotency record → account → subscription**; replay theo fingerprint.
    - **Sản phẩm:** `apps/control-plane/src/modules/subscription/`.
    - **Phụ thuộc:** Bước 6, 9.
    - **Verify:** `tests/control-plane/subscription/overlap.spec.ts` (hai concurrent create cùng account không tạo overlap; start đúng prior `effective_end` được chấp nhận); `tests/control-plane/subscription/idempotency-replay.spec.ts` (cùng key/fingerprint replay, khác fingerprint → `IDEMPOTENCY_CONFLICT`); `tests/control-plane/subscription/temporal-boundary.spec.ts`.
    - **Lane:** Backend.

12. **Bước 12 — Service scope authorization + Entitlement decision**
    - **Hành động:** Hiện thực `ServiceScopeAuthorizationPort` cho exact `entitlement:decide` feature, chạy **trước** `ExternalIdentityResolutionPort`; sau đó `AccountStatusPort` → `CatalogLookupPort` → `ActiveSubscriptionPort` → `PlanVersionLookupPort`. Account `pending|disabled` deny; deny override thắng allow/grant.
    - **Sản phẩm:** `apps/control-plane/src/modules/service-identity/` (authorization), `apps/control-plane/src/modules/entitlement/` (decision).
    - **Phụ thuộc:** Bước 8, 11.
    - **Verify:** `tests/control-plane/entitlement/scope-before-resolution.spec.ts` — caller sai app/feature/scope nhận deny **trước** identity resolution, response không lộ tồn tại account; `tests/control-plane/entitlement/precedence.spec.ts` cho disabled/deny precedence.
    - **Lane:** Backend.

13. **Bước 13 — Override lifecycle + cache directive**
    - **Hành động:** Hiện thực `CreateEntitlementOverrideCommand`/`RevokeEntitlementOverrideCommand` (không update lịch sử, chỉ revoke shape + audit), precedence deny-over-allow, và cache directive/last-known-good chỉ bật khi outage policy/TTL đã duyệt (`‹cần chốt: outage policy + revoke SLA + last-known-good theo rủi ro feature›`); chưa có policy thì fail-closed.
    - **Sản phẩm:** `apps/control-plane/src/modules/entitlement/` (override + directive).
    - **Phụ thuộc:** Bước 12.
    - **Verify:** `tests/control-plane/entitlement/override-lifecycle.spec.ts` — expired/revoked override không ảnh hưởng decision; mutation thiếu reason/scope/permission bị từ chối và mutation thành công có audit cùng transaction.
    - **Lane:** Backend.

14. **Bước 14 — Controllers user/admin/service từ frozen contract**
    - **Hành động:** Hiện thực controller cho `GET /v1/me/subscriptions`, `GET /v1/me/entitlements`, `POST /v1/service/entitlement-decisions` và admin plan/subscription/override/service-scope; controller chỉ điều phối public command/port, không truy cập repository trực tiếp; kiểm permission/reason phía server trước mutation.
    - **Sản phẩm:** controller trong các module thuộc `apps/control-plane/src/modules/`.
    - **Phụ thuộc:** Bước 10–13; contract freeze bước 3.
    - **Verify:** `tests/control-plane/contract/openapi-conformance.spec.ts` — response khớp OpenAPI, error envelope đúng registry mục 9; không endpoint nào trả plan name làm authorization claim.
    - **Lane:** Backend.

15. **Bước 15 — Parallel Web + test suites**
    - **Hành động:** Song song sau freeze: Frontend xây User Web (plan/subscription/entitlement của chính user) và Admin Web (plan builder, subscription timeline, override form, service scope editor) qua Next.js BFF; Tester viết contract/negative/concurrency/security/accessibility/responsive suites độc lập theo contract.
    - **Sản phẩm:** `apps/web/`; `tests/web/`.
    - **Phụ thuộc:** Bước 3 (contract freeze); Backend cung cấp API đúng revision (bước 10–14).
    - **Verify:** `tests/web/rbac-bypass.spec.ts` (server RBAC không bypass được); `tests/web/accessibility.spec.ts` và `tests/web/responsive.spec.ts` ở viewport mobile/tablet/desktop; kỳ vọng không lỗi nghiêm trọng.
    - **Lane:** Frontend + Tester.

### Nhóm E — Integration + QA/reviewer

16. **Bước 16 — Chạy toàn bộ test bằng lệnh thật**
    - **Hành động:** Chạy migration/contract/unit/integration PostgreSQL/temporal/concurrency/idempotency/security/audit/web suites; lưu output thật; lỗi thuộc code owner (Frontend/Backend) sửa, không bẻ test.
    - **Sản phẩm:** Log output test (đính kèm evidence checklist mục 17).
    - **Phụ thuộc:** Bước 9–15.
    - **Verify:** chạy theo thứ tự và dán output thật: `pnpm install --frozen-lockfile` → `pnpm typecheck` → `pnpm lint` → `pnpm openapi:lint` + `pnpm openapi:drift` → `pnpm db:migrate` (DB sạch từ Phase 3, role migration nối trực tiếp) → `pnpm test` (trên PostgreSQL thật qua testcontainers) → `pnpm test:e2e` (Playwright 1.61.1) → `pnpm build`. Kỳ vọng tất cả exit 0 và toàn bộ required suite pass. Lệnh chỉ chạy được sau P1.7; dán output thật, không output tưởng tượng.
    - **Lane:** Backend + Frontend + Tester (tự kiểm trước gate).

17. **Bước 17 — QA + reviewer song song**
    - **Hành động:** QA kiểm chứng acceptance/checklist (functional/contract, DB/concurrency, accessibility/responsive) từ output thật; reviewer kiểm correctness/security/ownership (lock order, scope-before-resolution, audit UoW, không billing/quota). Lặp tối đa ba vòng theo `AGENTS.md`.
    - **Sản phẩm:** Kết quả gate mục 20.
    - **Phụ thuộc:** Bước 16.
    - **Verify:** QA gate PASS với evidence; reviewer hết mục “phải sửa”. Nếu cùng lỗi lặp lần hai hoặc thiếu quyết định → khai báo TẮC/CẠN LƯỢT theo mục 19.
    - **Lane:** QA + Reviewer (edit deny).

18. **Bước 18 — Cập nhật tài liệu sau sign-off**
    - **Hành động:** Chỉ khi QA và reviewer đều đạt, cập nhật OpenAPI/runbook/rollback/API docs theo implementation thật và đề nghị phase exit; không ghi trạng thái “đã chạy” nếu chưa chạy.
    - **Sản phẩm:** Tài liệu API/runbook đã đối chiếu source.
    - **Phụ thuộc:** Bước 17 (cả hai gate đạt).
    - **Verify:** Đối chiếu docs ↔ OpenAPI ↔ migration ↔ source; không tuyên bố có billing/quota reserve; mọi lệnh/path khớp repo thật.
    - **Lane:** Document.

## 16. Parallel lanes và ownership

Chỉ mở ba làn sau contract freeze. Trước đó architect chỉ thiết kế/review/freeze revision ở chế độ read-only.

Backend thực hiện mọi write vào contract. Mỗi làn không sửa file của làn khác.

Manifest ownership cho shared path:

| Shared path | Writer duy nhất | Architect | Consumers |
|---|---|---|---|
| `contracts/openapi/control-plane.v1.yaml` | Backend do orchestrator chỉ định | Read-only: thiết kế/review/freeze revision | Frontend và Tester: read-only |

| Làn | Owner/path duy nhất | Được bắt đầu khi | Điểm đồng bộ |
|---|---|---|---|
| Contract, trước parallel implementation | Backend là writer duy nhất của `contracts/openapi/control-plane.v1.yaml`; architect read-only | Trước ba làn implementation | Architect chỉ thiết kế/review/freeze revision; Frontend/Tester read-only. |
| Frontend | `apps/web/` | OpenAPI, permission và UX states đã freeze | Dùng generated/typed contract theo setup thật; báo contract gap, không tự đổi backend shape. |
| Backend | `apps/control-plane/`, đồng thời là owner duy nhất của `apps/control-plane/drizzle/migrations/` | Contract và DB invariants đã freeze | Cung cấp API/ports đúng revision; không sửa test để pass; không giao migration root cho làn khác. |
| Tester | `tests/` | Acceptance examples và error registry đã freeze | Viết test từ contract, gồm negative/concurrency; không chỉnh logic sản phẩm. |

Migration dependency và custom trigger được backend thực hiện tuần tự trước khi integration test dựa vào schema. QA và reviewer chạy song song chỉ sau ba làn hoàn tất tự kiểm; document cập nhật sau sign-off.

## 17. Checklist

- **Functional:** [ ] Tất cả endpoint frozen có ít nhất một happy-path và một denial test; [ ] plan version chỉ đi đúng ba state; [ ] subscription boundary tests đạt; [ ] entitlement đổi theo grant/subscription/override mà không deploy app; [ ] OpenAPI/router không có quota operation.
- **Security:** [ ] 100% service-decision negative cases sai issuer/audience/app/feature/scope bị deny; [ ] exact scope được chứng minh chạy trước identity resolution; [ ] account disabled và deny override luôn deny; [ ] không response/log/audit nào chứa secret/token/plan authorization flag.
- **DB:** [ ] Migration sạch từ Phase 3 đạt; [ ] `service_identity_scopes` có đủ canonical columns nhưng entitlement-only named checks/indexes; [ ] `quota:*`, metric scope và invalid feature shape bị DB từ chối; [ ] không có `plan_quota_policies`/`quota_limit_overrides`/usage ledger do Phase 4 tạo; [ ] custom trigger test chặn đủ mutation bất hợp lệ; [ ] runtime role không DDL/disable trigger.
- **Concurrency:** [ ] Test đồng thời publish chỉ có một transition; [ ] same-key subscription mutation chỉ có một domain/audit outcome; [ ] concurrent timeline mutation không tạo overlap; [ ] không có deadlock lặp lại ngoài retry policy đã duyệt.
- **Accessibility:** [ ] User/admin pages qua automated scan không có lỗi nghiêm trọng; [ ] toàn bộ form/dialog/table dùng được bằng keyboard; [ ] focus/error association và accessible name có assertion.
- **Responsive:** [ ] Các viewport mobile/tablet/desktop đã freeze không có horizontal overflow ngoài container bảng chủ ý; [ ] action quan trọng và timeline đọc/thao tác được ở từng viewport.
- **Observability:** [ ] Mỗi request có correlation ID; [ ] metric/log phân biệt allow/deny reason, idempotency replay/conflict, overlap và audit rollback mà không lộ PII; [ ] alert threshold/runbook owner được ghi theo policy vận hành đã duyệt.
- **Rollback:** [ ] Có backup/PITR checkpoint theo môi trường; [ ] migration chưa nhận write có rollback rehearsal; [ ] sau write có forward-fix plan; [ ] feature exposure có kill switch/route disable không phá lịch sử.
- **Docs:** [ ] OpenAPI khớp response thực; [ ] state/permission/reason/runbook được cập nhật; [ ] không tài liệu nào nói có billing/quota reserve; [ ] mọi lệnh/path được đối chiếu repo thật.

Mỗi ô phải có evidence: test case/output, migration inspection, screenshot/accessibility report, log query hoặc reviewer reference; đánh dấu bằng nhận định không có bằng chứng không được tính.

## 18. Exit gate

Phase chỉ đủ điều kiện thoát khi:

1. Mọi prerequisite áp dụng đã có quyết định được lưu và không còn default ngầm.
2. Migration/trigger, backend, Web và OpenAPI cùng một contract revision; staged scope schema khớp `docs/database-schema.md` sau source update; toàn bộ required test pass bằng output thật.
3. Published Plan Version được chứng minh bất biến ở API và database.
4. Subscription canonical predicate, effective end, overlap, account lock, trusted source và idempotency đạt temporal/concurrency tests.
5. Entitlement được tính, không có bảng effective entitlement; exact scope-before-resolution, disabled deny và deny precedence đạt security tests. `service_identity_scopes` có canonical columns nhưng chỉ lưu/authorize entitlement feature scope.
6. User/Admin Web đạt functional, accessibility và responsive gates; server RBAC không bypass được.
7. Audit failure rollback mutation và log/metric/correlation đáp ứng observability gate.
8. Không có quota API/data/table được đưa vào phase, gồm `plan_quota_policies`, `quota_limit_overrides`, metric scope và usage ledger; không có billing capability.
9. QA ký **PASS** và reviewer không còn mục “phải sửa”.

## 19. Stop/rollback

**Dừng ngay** nếu thiếu quyết định lifecycle/default activation, contract mâu thuẫn, migration không bảo vệ immutable snapshot, overlap race chưa giải được, scope check xảy ra sau identity resolution, audit không cùng transaction, hoặc cùng lỗi lặp lần thứ hai. Báo rõ vị trí tắc, đã thử gì và cần quyết định nào.

Nếu lỗi trước khi nhận traffic/write: dừng rollout, vô hiệu route/feature exposure, rollback migration bằng script đã review và khôi phục checkpoint nếu cần. Nếu đã nhận write: không down-migrate bằng cách xóa subscription/override/audit hoặc sửa snapshot published; dừng mutation endpoint, giữ read an toàn, triển khai forward-fix đã review hoặc phục hồi PITR theo quyết định sự cố. Sau restore phải đối chiếu audit/idempotency/timeline trước mở lại.

Không tiếp tục sau ba vòng verification chưa đạt. Phase status vẫn là `blocked`, hoặc giữ `in_progress` nếu orchestrator đã chuyển phase sang trạng thái đó trước verification; ghi metadata riêng `verification_outcome: exhausted`, kèm test fail, thay đổi còn thiếu và rủi ro. Verification outcome không thay thế phase status và không được dùng để tuyên bố phase đã triển khai.

## 20. QA/reviewer sign-off

| Gate | Người chịu trách nhiệm | Bằng chứng bắt buộc | Kết quả |
|---|---|---|---|
| QA functional/contract | `subagent/qa` | Output lệnh thật, OpenAPI validation, user/admin/service acceptance | Chưa đánh giá |
| QA DB/concurrency | `subagent/qa` | Migration/trigger/temporal/overlap/idempotency test reports | Chưa đánh giá |
| QA accessibility/responsive | `subagent/qa` | Automated + keyboard checks và viewport evidence | Chưa đánh giá |
| Reviewer architecture/security | `subagent/reviewer` | Review ownership, lock order, scope-before-resolution, audit UoW, no billing/quota | Chưa đánh giá |
| Reviewer documentation | `subagent/reviewer` | Đối chiếu OpenAPI, source, migration và docs; không có tuyên bố sai | Chưa đánh giá |

Orchestrator chỉ ghi phase **ĐẠT** khi toàn bộ QA gate PASS và reviewer xác nhận không còn mục phải sửa. Người viết code không tự ký đạt phần mình viết.
