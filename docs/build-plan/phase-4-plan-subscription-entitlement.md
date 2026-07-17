# Phase 4 — Plan, Subscription và Entitlement

## 1. Trạng thái

`blocked`

Đây là kế hoạch, chưa phải mô tả implementation. Phase bị chặn cho tới khi Phase 3 đạt cổng ra và các quyết định nghiệp vụ ở mục 3 được phê duyệt. Tên phase trong tài liệu này là thứ tự build plan của repo, không thay thế cách đánh số lộ trình kiến trúc trong `docs/index.md` hoặc `docs/modular.md`.

Không được hiểu bất kỳ đường dẫn, endpoint, migration, bảng, màn hình hoặc test nào dưới đây là đã tồn tại. Repo hiện chưa có lệnh build/test/lint được xác nhận; khi bootstrap phải dùng script thật của repo, không tự ghi lệnh giả vào báo cáo QA.

## 2. Mục tiêu

1. Hiện thực mô hình Plan và Plan Version có snapshot bất biến, trong đó version chỉ đi theo `draft -> published -> retired`.
2. Hiện thực subscription cá nhân theo timeline, predicate hiệu lực canonical và mutation idempotent; không đưa organization/team vào mô hình.
3. Tính Effective Entitlement tại thời điểm yêu cầu từ account, subscription, plan grant và override; không tạo bảng materialized entitlement.
4. Cung cấp bề mặt REST/OpenAPI cho user, admin và service entitlement decision với authorization phía server.
5. Cấp scope M2M `entitlement:decide` cho đúng một feature thuộc đúng application; từ chối trước identity resolution nếu scope không hợp lệ.
6. Bảo đảm mutation nhạy cảm có audit đồng bộ trong cùng transaction và các invariant quan trọng được giữ cả ở service lẫn database.

## 3. Prerequisites và human decisions

- [ ] Phase 3 đã được QA và reviewer ký đạt; các port Account, Identity, Catalog, Service Identity tối thiểu và Audit đã có contract ổn định.
- [ ] Xác nhận migration Phase 3 đã tạo baseline `service_identities` và `audit_events`, gồm các FK actor cần thiết. Phase 4 phụ thuộc trực tiếp vào baseline này, không tạo lại hai bảng hoặc audit FK.
- [ ] Chủ sản phẩm phê duyệt **có hay không default plan/subscription khi account được tạo**. Nếu có, phải chốt chính xác Plan Version, thời điểm `starts_at`, trusted source, idempotency namespace và quy tắc migration khi có version mới.
- [ ] Chủ sản phẩm phê duyệt **account activation policy**: điều kiện `pending -> active`, quan hệ thứ tự giữa activation và tạo subscription, cách retry và hành vi nếu một bước thất bại.
- [ ] Chủ sản phẩm phê duyệt subscription lifecycle: create/change, suspend/resume, immediate cancel hay cuối kỳ, undo cancel nếu có, terminal state cuối kỳ là `canceled` hay `expired`, và effective time của từng transition.
- [ ] Chốt hành vi upgrade/downgrade không liên quan billing: version đích, thời điểm hiệu lực, cách tạo timeline mới, và dữ liệu feature bị mất quyền. Không tự chọn immediate hoặc end-of-period.
- [ ] Chốt trusted source/operation allowlist, retention/retry window của `subscription_idempotency_records`, revoke SLA, entitlement cache/outage policy và last-known-good theo mức rủi ro feature.
- [ ] Chốt danh sách admin permissions và separation of duties cho plan, subscription, override, service identity và audit read.
- [ ] Chốt retention/privacy cho subscription, override, idempotency response, audit và log; không tạo purge job trước quyết định.
- [ ] Nếu tạo draft `plan_quota_policies`, metric/unit/counting, window/timezone/DST, TTL và amount liên quan phải được phê duyệt đủ. Nếu chưa đủ, chỉ chuẩn bị ranh giới/schema được migration review chấp thuận, không cho nhập/publish quota policy.
- [ ] Kiểm chứng PostgreSQL/Supavisor thực tế và isolation level khi bootstrap trước khi chốt transaction implementation.

Thiếu bất kỳ quyết định bắt buộc nào cho một luồng thì **dừng riêng luồng đó**, ghi blocker và không điền default tạm. Phase này không chọn payment provider.

## 4. Phạm vi

- Các module Plan/Plan Version, Subscription, Entitlement và phần exact-feature scope của Service Identity trong cùng NestJS Control Plane modular monolith.
- Các bảng `plans`, `plan_versions`, `plan_feature_grants`, `subscriptions`, `subscription_idempotency_records`, `entitlement_overrides`; Phase 4 tạo `service_identity_scopes` exact feature dựa trên `service_identities` và audit FK do Phase 3 tạo.
- `plan_quota_policies` chỉ ở dạng cấu trúc draft nếu toàn bộ semantics đầu vào cần thiết đã được duyệt; không vận hành quota.
- REST JSON versioned và OpenAPI 3.1 cho user, service và admin.
- Next.js Web/BFF cho trang user và admin, responsive trên desktop/điện thoại/máy tính bảng.
- Admin RBAC server-side, audit bắt buộc, temporal/concurrency/idempotency/security tests và migration/trigger tests.
- Entitlement quyết định theo account cá nhân, application và feature; app tích hợp bằng stable feature key, không bằng tên plan.

## 5. Ngoài phạm vi

- Payment provider, checkout, invoice, webhook, refund, pricing, proration và Billing Adapter thật.
- Reserve/commit/cancel/status quota, usage bucket/reservation/event, reconciliation và mọi phép trừ quota.
- Organization, team, shared subscription, pooled quota hoặc owner ngoài account cá nhân.
- Data Plane business integration, gateway bắt buộc hoặc proxy business traffic qua Hub.
- Materialized `effective_entitlements`, Redis/cache làm nguồn quyền, tên plan/`isPremium` trong app logic hoặc token.
- Tự quyết quota metric/window/TTL/amount để có dữ liệu demo.
- Thay đổi stack, thêm microservice, outbox hoặc package chưa được phê duyệt.

## 6. Deliverables

1. OpenAPI 3.1 đã freeze cho toàn bộ endpoint trong phase, gồm auth scheme, reason code, idempotency và correlation.
2. Migration forward-only cùng custom SQL trigger cho immutable Plan Version và append-only audit liên quan.
3. Plan module với draft builder, validation, publish và retire.
4. Subscription module với timeline canonical, overlap prevention, lock order và replay semantics.
5. Entitlement module tính quyết định dẫn xuất và quản lý override có precedence.
6. Service Identity exact-feature scopes và re-authorization trước identity resolution.
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
| Integration backend | `apps/control-plane/src/modules/service-identity/` | Exact feature scopes và authorization port. |
| Admin/Audit | `apps/control-plane/src/modules/admin/`, `apps/control-plane/src/modules/audit/` | Admin orchestration qua public ports và audit append. |
| Migration | `apps/control-plane/drizzle/migrations/` | Drizzle forward migration và custom SQL trigger/constraint. |
| User Web | `apps/web/` | Route/component/BFF client cho plan, subscription, entitlement của chính user. |
| Admin Web | `apps/web/` | Route/component/BFF client admin; route namespace theo convention thật của app. |
| Backend tests | `tests/control-plane/` | Contract, integration DB, temporal, concurrency, trigger và security. |
| Web tests | `tests/web/` | User/admin behavior, RBAC response, accessibility và responsive. |

Không tạo HTTP loopback giữa các module. Module consumer gọi public application port trong cùng process và không import repository/table của module owner khác.

## 8. DB/migration

1. Migration Phase 4 trong `apps/control-plane/drizzle/migrations/` phải chạy sau migration Phase 3 đã tạo `service_identities`, `audit_events` và actor FK. Không tạo lại baseline đó; chuỗi tạo mới là `plans` -> `plan_versions` -> `plan_feature_grants` -> `plan_quota_policies` nếu đủ quyết định -> `subscriptions` -> `subscription_idempotency_records` -> `entitlement_overrides` -> `service_identity_scopes`; giữ FK `ON DELETE RESTRICT` mặc định.
2. Dùng `uuid` do application sinh, `timestamptz` UTC, DB clock cho thời gian quyết định, `text` + named `CHECK` cho state, `bigint` và decimal string ở API cho quantity nếu quota draft được phép.
3. `plan_versions` có unique `(plan_id, version)`, state shape và vòng đời duy nhất `draft -> published -> retired`; publish gán `published_at` bằng DB clock.
4. Custom SQL tạo `plan_versions_immutable_snapshot_trg`, `plan_feature_grants_immutable_trg` và `plan_quota_policies_immutable_trg`. Trigger phải khóa/đọc parent và chặn insert/update/delete cấu hình khi parent đã published/retired.
5. `subscriptions` giữ `account_id`, `plan_version_id`, status, `starts_at`, `ends_at`, `cancel_at`, trusted `source`, optional `source_reference` và supersession reference; không có organization/team columns.
6. Định nghĩa `effective_end = LEAST(cancel_at, ends_at)` theo PostgreSQL NULL semantics. Predicate hiệu lực tại database time `t` là `starts_at <= t AND t < COALESCE(effective_end, infinity)` với status `pending|active|cancel_at_period_end`.
7. Overlap dùng interval `[starts_at,effective_end)` của **mọi row và mọi status**, kể cả suspended/canceled/expired. Mutation khóa account để serialize; start mới đúng prior effective end phải được chấp nhận.
8. Terminal transition sang `canceled`/`expired` phải ghi `ends_at` hữu hạn trong cùng transaction. `cancel_at_period_end` phải có `cancel_at > starts_at` và không sau `ends_at` nếu end tồn tại.
9. `subscription_idempotency_records` unique theo `(trusted_source, operation, idempotency_key)`, lưu fingerprint, state, bounded sanitized replay và expiry. Lock order: idempotency record -> account -> subscription.
10. `entitlement_overrides` lưu effect `allow|deny`, validity `[valid_from,valid_until)`, creator/revoker và reason; không update nội dung lịch sử, chỉ revoke theo shape constraint và audit.
11. `service_identity_scopes` dùng composite FK để feature, application và service binding khớp nhau; `entitlement:decide` bắt buộc đúng một `feature_id`, `usage_metric_id` null, lifecycle active/revoked.
12. Sensitive mutation append `audit_events` bằng `operationId + sequence` trong cùng Unit of Work; lỗi audit rollback domain mutation.
13. Migration validation phải kiểm tra tên constraint/index/trigger, quyền runtime không được DDL/disable trigger, immutable snapshot, overlap race, terminal finite end, scope shape và replay bound.

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
- **Publish validation:** draft thiếu grant bắt buộc, feature sai app, quota draft chưa đủ semantics hoặc state không hợp lệ bị từ chối và không có audit “thành công”.
- **Temporal:** test đúng trước/tại/sau `starts_at`, `cancel_at`, `ends_at`; cả hai end null; một end null; end bằng start mới; pending tự effective; terminal không effective.
- **Overlap:** mọi cặp status, interval nested/equal/touching/infinite; two concurrent creates/changes cùng account không tạo overlap; terminal row vẫn tham gia check.
- **Lifecycle:** mọi transition cho phép và mọi transition cấm; terminal luôn có finite `ends_at`; undo scheduled cancel chỉ khi policy cho phép và clear shape đúng.
- **Subscription idempotency:** cùng source/operation/key + fingerprint replay đúng response; fingerprint khác conflict; concurrent same-key có một mutation/audit outcome; source từ authentication, không từ body.
- **Entitlement precedence:** disabled/pending account deny; deny override thắng allow/grant; expired/revoked override không ảnh hưởng; thiếu subscription/grant deny; rename plan không đổi decision.
- **Scope/security:** wrong app/feature/scope deny trước identity resolution; forged account ID bị từ chối; revoked identity/scope deny request mới; response không lộ existence/secret/plan name.
- **Audit:** mutation thành công có đúng audit sequence; audit append failure rollback mutation; equivalent retry không duplicate; conflicting audit replay rollback.
- **Database:** named constraints, composite FK, partial unique, role grants, trigger SQLSTATE/application error và forward migration từ schema trước được kiểm tra trên PostgreSQL thật.
- **API contract:** OpenAPI validation, error envelope, auth audience, idempotency/correlation headers và examples.
- **Web:** own-data isolation, loading/error/empty/conflict, keyboard/focus/label/contrast, mobile/tablet/desktop layout và server RBAC bypass attempts.

Không sửa test để hợp thức hóa hành vi trái contract. Test dùng database clock có kiểm soát hoặc boundary fixture phù hợp, không phụ thuộc clock browser.

## 15. Ordered steps

1. Xác nhận Phase 3 sign-off và ghi đầy đủ quyết định mục 3; blocker nào chưa chốt thì không lập fixture/default cho blocker đó.
2. Architect thiết kế state machine, permission matrix, port input/output và threat model ở chế độ read-only; đối chiếu `docs/modular.md` và `docs/database-schema.md`, review và xác nhận revision đủ điều kiện freeze.
3. Backend, với vai trò contract writer duy nhất do orchestrator giao, ghi OpenAPI, error/reason registry, idempotency fingerprint inputs và ví dụ vào `contracts/openapi/control-plane.v1.yaml`; architect review read-only trước khi freeze revision.
4. Viết migration Plan/Subscription/Entitlement/feature scope theo dependency; thêm custom SQL triggers và migration tests trước repository.
5. Hiện thực Plan domain/application/persistence; khóa invariant draft/publish/retire ở service và DB.
6. Hiện thực Subscription timeline, canonical predicate, overlap transaction, trusted source, idempotency và audit UoW.
7. Hiện thực Service Scope Authorization exact feature và Entitlement decision theo đúng thứ tự security.
8. Hiện thực override lifecycle/precedence và cache directive theo policy đã duyệt.
9. Hiện thực user/admin/service controllers từ frozen contract; không cho controller truy cập repository trực tiếp.
10. Song song sau freeze: frontend xây User/Admin Web, backend hoàn thiện các module, tester viết test độc lập theo contract.
11. Chạy migration/contract/unit/integration/concurrency/security/web tests bằng lệnh thật sau bootstrap; lưu output thật, sửa code owner nếu fail.
12. QA kiểm chứng acceptance/checklist và reviewer kiểm tra correctness/security/ownership. Lặp tối đa ba vòng theo `AGENTS.md`.
13. Chỉ khi cả QA và reviewer đạt mới cập nhật tài liệu vận hành/API dựa trên implementation thật và đề nghị phase exit.

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

- **Functional:** [ ] Tất cả endpoint frozen có ít nhất một happy-path và một denial test; [ ] plan version chỉ đi đúng ba state; [ ] subscription boundary tests đạt; [ ] entitlement đổi theo grant/subscription/override mà không deploy app.
- **Security:** [ ] 100% service-decision negative cases sai issuer/audience/app/feature/scope bị deny; [ ] exact scope được chứng minh chạy trước identity resolution; [ ] account disabled và deny override luôn deny; [ ] không response/log/audit nào chứa secret/token/plan authorization flag.
- **DB:** [ ] Migration sạch từ baseline đạt; [ ] mọi named constraint/index/trigger dự kiến tồn tại; [ ] custom trigger test chặn đủ INSERT/UPDATE/DELETE bất hợp lệ; [ ] runtime role không DDL/disable trigger.
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
2. Migration/trigger, backend, Web và OpenAPI cùng một contract revision; toàn bộ required test pass bằng output thật.
3. Published Plan Version được chứng minh bất biến ở API và database.
4. Subscription canonical predicate, effective end, overlap, account lock, trusted source và idempotency đạt temporal/concurrency tests.
5. Entitlement được tính, không có bảng effective entitlement; exact scope-before-resolution, disabled deny và deny precedence đạt security tests.
6. User/Admin Web đạt functional, accessibility và responsive gates; server RBAC không bypass được.
7. Audit failure rollback mutation và log/metric/correlation đáp ứng observability gate.
8. Không có quota reserve hay billing capability được đưa vào phase.
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
