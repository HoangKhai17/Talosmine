# Phase 3 — Application Catalog

## 1. Trạng thái

`blocked` — Phase 3 phụ thuộc Phase 2 đạt exit gate và các human decision ở mục 3. Đây là kế hoạch, chưa phải implementation; các đường dẫn/API/migration/UI là target dự kiến. `TẮC` và `CẠN LƯỢT` là kết quả vòng kiểm chứng, không thay phase status canonical.

## 2. Mục tiêu

- Xây danh mục trung tâm cho Application, exact redirect URI, Feature và Usage Metric bằng key ổn định.
- Cho user khám phá, xem chi tiết và mở ứng dụng từ Hub mà không nhầm catalog visibility với authorization.
- Cho admin quản lý vòng đời `draft`, `active`, `inactive`, redirect allowlist, feature và metric semantics status với RBAC/audit.
- Bảo vệ `image_url` và `launch_url` khỏi credential leak, open redirect, SSRF và abuse qua Next.js image proxy.
- Cung cấp `CatalogLookupPort` và REST/OpenAPI contract ổn định cho các phase Plan/Entitlement/Quota sau này.
- Hoàn tất schema staging từ P2: tạo baseline `service_identities` sau `applications`, rồi thêm FK cho service actor của audit; chưa triển khai service scope hoặc management surface.

## 3. Prerequisites và human decisions

- Phase 2 phải đạt, gồm admin authentication, deny-by-default RBAC, transactional audit và account/session security.
- Chốt permission catalog: read, create/update, status change, redirect manage, feature manage, metric manage/approve semantics.
- Chốt public managed CDN/object-store host, ownership, upload/publish process, URL shape và CSP; không tự chọn provider hoặc package.
- Chốt `launch_url` scheme/host policy theo môi trường và canonicalization rules; xác định app nào được public catalog.
- Chốt exact login/logout redirect URI của từng app; không wildcard. Chủ app/service phải xác nhận ownership trước activation.
- Chốt yêu cầu search/filter thực tế: trường được tìm, filter trạng thái/category nếu có, sort và pagination. Không tự thêm taxonomy/category nếu requirement chưa có.
- Chốt quy tắc stable key: format, độ dài, case, bất biến sau tham chiếu và cấm tái sử dụng.
- Feature inventory cần owner xác nhận. **`unit` phải được product/app owner duyệt trước khi tạo bất kỳ `usage_metrics` row nào vì cột này `NOT NULL`.** `counting_point` và `failure_treatment` có thể giữ nullable/draft tới quyết định Phase 5; metric chưa đủ hai trường này không được approve/use cho quota.
- Chốt dữ liệu baseline không bí mật cho `service_identities`: Auth0 issuer, M2M client ID đã provision, display name, application owner và initial status. P3 không provision/lưu client secret và không cấp scope.
- Chốt image rendering strategy: browser direct theo CSP hay Next.js optimization/proxy với allowlist/redirect/DNS protections. Thiếu quyết định thì không bật remote proxy.

## 4. Phạm vi

- Migration `applications` gồm `image_url`, `launch_url`, stable key, metadata và lifecycle; cùng `application_redirect_uris`, `features`, `usage_metrics`.
- Baseline `service_identities` sau khi có `applications`, rồi hoàn thiện audit service-actor FK/shape từ schema staging P2.
- User catalog: list/card/detail, search/filter chỉ theo requirement đã duyệt và hành động launch app.
- Admin: Application CRUD theo nghĩa create/read/update không hard delete, status transition, safe image preview, exact redirect allowlist, feature/metric registration và semantics status.
- Backend catalog/admin REST APIs, internal `CatalogLookupPort`, ownership validation và audit cùng transaction cho mutation nhạy cảm.
- Chính sách public managed image URL, launch URL validation và phòng vệ SSRF/Next image proxy.
- Contract/security/accessibility/responsive tests cho key, redirect, URL và cross-application ownership.

## 5. Ngoài phạm vi

- Plan, Plan Version, Subscription, Entitlement, Quota, reservation, usage ledger, payment hoặc billing.
- Catalog visibility như một quyết định authorization; active card không cấp quyền truy cập backend app.
- Proxy/routing business traffic qua Hub, dữ liệu nghiệp vụ của app hoặc domain authorization của app.
- Upload binary/base64 vào PostgreSQL, presigned/credential-bearing image URL hoặc tự xây object store.
- Tự phê duyệt metric semantics khi product/app owner chưa quyết định; không tạo quota policy.
- Category, recommendation, ranking, favorites hoặc full-text engine nếu requirements chưa xác nhận.
- Service identity management UI/API, credential provisioning/rotation và `service_identity_scopes`; P3 chỉ tạo baseline table/binding và audit FK, còn exact scopes chờ P4.

## 6. Deliverables

- Forward migrations và constraints/indexes cho bốn bảng catalog, baseline `service_identities`, cùng migration hoàn thiện audit service-actor FK/check theo đúng thứ tự phụ thuộc.
- NestJS Catalog module với command/query/ports, validation và admin orchestration qua public ports.
- OpenAPI 3.1 cho user/admin catalog APIs và schemas/errors/pagination đã freeze.
- User list/card/detail/launch UI và admin application/redirect/feature/metric UI.
- URL policy dùng chung ở boundary phù hợp, không cho browser quyết định trust; cấu hình CSP/image allowlist theo quyết định được duyệt.
- Contract, integration, security, concurrency, accessibility và responsive tests.
- Runbook activate/inactivate app, thay redirect/image, xử lý URL bị compromise và rollback release.

## 7. Target paths

| Hạng mục | Target path dự kiến |
|---|---|
| User catalog | `apps/web/app/(user)` |
| Admin catalog | `apps/web/app/admin` |
| BFF auth/session dependency | `apps/web/src/bff/auth/features` |
| Catalog module | `apps/control-plane/src/modules/application-catalog` |
| Service identity baseline model/persistence | `apps/control-plane/src/modules/service-identity` |
| Admin orchestration extension | `apps/control-plane/src/modules/admin` |
| Migration | `apps/control-plane/drizzle/migrations/` |
| API contract | `contracts/openapi/control-plane.v1.yaml` |
| Tests | `tests/**` |

Các path này là target, không khẳng định tồn tại. Không đặt repository Catalog trong module Admin; Admin gọi public Catalog port.

## 8. DB/migration

- `applications`: UUID application-generated; unique immutable `key`; `display_name`, nullable `description`, nullable `image_url`, required `launch_url`, status `draft|active|inactive`, DB-clock timestamps.
- `application_redirect_uris`: FK application `ON DELETE RESTRICT`, purpose `login|logout`, URI canonical exact-match, unique `(application_id, purpose, uri)`; không wildcard.
- `features`: FK application, stable `key` unique trong app, display metadata, status `draft|active|inactive`; composite uniqueness phục vụ ownership.
- `usage_metrics`: FK application và composite FK tới feature cùng app; stable key unique trong app. `unit` là `NOT NULL`, non-empty và phải có giá trị đã được product/app owner duyệt **trước insert**. Chỉ `counting_point` (`start|milestone|success`) và `failure_treatment` (`commit|cancel|policy_defined`) được nullable khi metric còn draft tới P5.
- `service_identities`: chỉ tạo **sau `applications`**, gồm UUID, required `application_id`, `issuer`, `client_id`, `display_name`, status `active|revoked`, nullable `last_seen_at`, revoke fields và DB-clock timestamps; unique `(issuer, client_id)` và FK application. Không có client secret/access/refresh token.
- Sau khi `service_identities` tồn tại, migration thêm `audit_events.actor_service_identity_id REFERENCES service_identities(id) ON DELETE RESTRICT` và thay P2 actor check bằng canonical shape cho đúng một actor `account|service|system`. Đây là bước đưa schema từ P2 staging tới canonical final schema.
- Thứ tự migration bắt buộc: (1) `applications`; (2) redirect/feature/metric theo FK; (3) `service_identities`; (4) audit service FK + actor check. Migration test phải chứng minh không thể chạy bước 3/4 trước dependency.
- Không hard delete catalog/history. Key đã được tham chiếu không đổi hoặc tái sử dụng; rename chỉ đổi label. Transition/reactivation phải qua command có permission/reason/audit.
- Database check chỉ bảo vệ shape/non-empty/status. HTTPS, public host, credential/query, DNS/private address và redirect semantics phải được application layer xác minh; DB không giả vờ kiểm tra network safety.
- Migration test xác minh unique/FK/composite ownership/check/index, service/app binding, audit service FK/actor shape, dữ liệu lỗi bị reject và forward compatibility. Không seed app/metric/service giả khi inventory chưa được owner duyệt.
- Rollback rehearsal đi theo thứ tự ngược: bỏ audit service FK và phục hồi P2 account/system-only actor check, rồi mới bỏ baseline service table và catalog tables khi chưa có dữ liệu/consumer. Sau khi có dữ liệu, dùng forward fix; không drop audit/history hoặc application binding.

## 9. Backend API

Bề mặt dự kiến phải được architect đóng băng tên route/method chính xác trước implementation:

- User: list active/visible applications, get detail bằng stable key và trả metadata tối thiểu; search/filter/pagination chỉ gồm trường requirement đã duyệt.
- Admin: create, get/list, update metadata, set status; không có hard-delete endpoint.
- Redirect: list/add/remove exact URI theo purpose; thay đổi yêu cầu permission, reason và transactional audit.
- Feature: register/list/update label/status bằng `(applicationKey, featureKey)` hoặc identifier contract đã freeze; không resolve chéo app.
- Metric: register/list/update draft semantics/status và approve semantics khi đủ quyết định; metric thiếu semantics vẫn draft và không được downstream coi là approved.
- Metric create bắt buộc `unit` đã được owner duyệt; API từ chối thiếu/rỗng/placeholder unit. Chỉ counting/failure được để chưa quyết định trên draft.
- Internal `CatalogLookupPort`: resolve app/feature/metric stable key, verify ownership, check exact redirect và trả metadata tối thiểu; consumer không đọc table.
- Launch URL không được nhận tùy ý từ request launch của browser. UI dùng URL đã validate/lưu từ catalog response; backend mutation validate lại trước commit.
- Error machine codes phân biệt validation, duplicate stable key, invalid transition, forbidden, cross-app ownership, unsafe URL, exact redirect conflict và semantics incomplete.
- P3 không mở service identity management endpoint. Baseline mapping được tạo bằng quy trình migration/onboarding được duyệt; full API và exact scopes thuộc P4.

## 10. User web

- List/card chỉ hiển thị app đáp ứng visibility contract; card có tên, mô tả/ảnh fallback an toàn, trạng thái phù hợp và link detail/launch.
- Detail hiển thị metadata catalog, không hiển thị secret, redirect nội bộ hoặc metric config quản trị.
- Search/filter chỉ xuất hiện nếu requirement/contract hỗ trợ; query state có URL/accessibility semantics rõ, debounce không làm mất keyboard/screen-reader feedback.
- Launch dùng `launch_url` đã validate từ catalog, không ghép host/path từ input user. Inactive/draft không launch từ public catalog.
- UI ghi rõ việc thấy app không đồng nghĩa đã được cấp quyền; backend app vẫn phải authentication/authorization ở các phase liên quan.
- Ảnh lỗi có fallback, alt text theo vai trò (decorative hoặc tên app), kích thước cố định để hạn chế layout shift; không render URL HTML tùy ý.
- Loading/empty/error/pagination có focus và announcement phù hợp; card/grid không mất thứ tự đọc ở mobile/tablet/desktop.

## 11. Admin web

- Protected catalog routes dùng Phase 2 session và server-side permission result; menu ẩn không thay API authorization.
- Form Application quản lý key, label, description, image URL, launch URL và status; stable key bị khóa sau mốc contract quy định, không “đổi” bằng xóa/tạo lại.
- Image preview chỉ dùng URL đã qua server validation/policy; không fetch URL người nhập từ server trước validation, không gửi cookie/authorization header tới image host và có nút bỏ preview.
- Redirect editor hiển thị URI canonical, purpose và exact-match warning; add/remove có reason, confirmation khi ảnh hưởng login/logout và error theo field.
- Feature/metric editor luôn hiển thị application owner; không cho chọn feature từ app khác. Form không cho tạo metric khi `unit` chưa được owner duyệt; chỉ counting point/failure treatment được hiển thị “chưa quyết định/draft”.
- Không có service identity management UI trong P3; admin catalog không hiển thị hoặc thu thập M2M secret.
- Status transition nêu tác động visibility/launch; không hard delete. Mutation có pending/duplicate-submit protection và audit correlation khi thành công.
- Bảng có header/caption/sort state accessible, keyboard/focus đầy đủ; màn hình hẹp dùng responsive table/card có nhãn dữ liệu, không ẩn action bắt buộc.

## 12. Integration/security

- `image_url` chỉ cho HTTPS public ổn định trên managed CDN/object-store domain được allowlist; cấm userinfo, fragment/credential, signed/presigned query token và host ngoài quản lý.
- Nếu server/Next image optimizer fetch ảnh: allowlist tĩnh, giới hạn redirect, validate từng redirect hop, resolve DNS và chặn loopback/private/link-local/metadata ranges cho IPv4/IPv6, chống DNS rebinding theo cơ chế được review, đặt timeout/size/content-type limits và không forward credential.
- Nếu browser tải trực tiếp: CSP `img-src` hẹp theo managed host; không mở wildcard để né cấu hình. Image policy phải nhất quán giữa preview và public card.
- `launch_url` yêu cầu HTTPS và host/path policy đã duyệt; reject protocol-relative, non-HTTP scheme, userinfo, encoded-host bypass và URL không canonical. Launch không phải generic redirect endpoint.
- Redirect URI canonicalize một lần theo rule freeze rồi exact-match persisted active entry; không prefix/suffix/wildcard và không tự sửa URI “gần đúng”.
- Service ownership: application/feature/metric/redirect binding được xác minh ở API, port và composite FK nơi áp dụng. App A không resolve/mutate resource app B.
- Baseline service identity bind đúng một application bằng FK và unique issuer/client identity; không lưu secret, không có generic scope và chưa được dùng để gọi entitlement/quota. Audit service actor chỉ hợp lệ sau khi FK/check P3 đã áp dụng.
- Mọi catalog mutation server-side RBAC deny-by-default; mutation nhạy cảm và audit `operationId + sequence` cùng transaction, audit failure rollback.
- Không log full query chứa dữ liệu nhạy cảm; telemetry URL chỉ giữ host/policy outcome hoặc giá trị đã redact theo retention decision.

## 13. Contract freeze

Trước khi triển khai song song, architect phải freeze:

1. Resource schemas, route/method/status, pagination/search/filter, stable key rules và machine error codes.
2. Lifecycle/transition matrix cho application, feature, metric; visibility của draft/active/inactive.
3. URL canonicalization/allowlist cho image, launch và login/logout redirect; rendering strategy/CSP.
4. `CatalogLookupPort`, cross-app ownership outcomes và semantics draft/approved representation.
5. Metric-create contract bắt buộc approved non-empty `unit`; nullable representation chỉ dành cho counting point/failure treatment ở draft.
6. Baseline service identity shape/onboarding ownership, không-API boundary, audit FK/actor migration và permission/action/audit transaction.

Metric `counting_point`/`failure_treatment` có thể chưa freeze về giá trị nghiệp vụ, nhưng `unit` phải được owner duyệt trước insert; contract phải freeze cách biểu diễn **chưa quyết định** cho hai trường nullable và cấm approve/use. Breaking change sau freeze phải quay lại architect và đồng bộ cả ba làn.

## 14. Tests

- Migration: chạy đúng thứ tự application → catalog children → service identity → audit FK/check; constraints, stable key uniqueness, exact redirect uniqueness, composite ownership, service/app binding và rollback thứ tự ngược.
- API contract: schemas/status/errors/pagination; public chỉ thấy trạng thái cho phép; admin permission matrix deny-by-default.
- Stable keys: rename label giữ key; duplicate/case/canonical variant theo rule bị xử lý xác định; key đã tham chiếu không sửa/tái sử dụng.
- Cross-app: feature/metric/redirect của app A không resolve, attach hoặc mutate dưới app B qua ID/key/payload tampering.
- Metric: thiếu/rỗng/placeholder/chưa duyệt `unit` không tạo row; approved unit tạo được draft; nullable counting/failure giữ draft và không approve/use downstream.
- Service/audit: client secret/token không có cột/payload/log; service identity không bind app khác; audit service actor thiếu/không tồn tại FK bị từ chối, actor account/system vẫn hợp lệ, và không có service-management route/UI.
- Redirect/launch: exact valid success; gần giống host/path/port, wildcard, userinfo, encoded/protocol-relative/non-HTTPS input fail.
- Image URL: managed public URL success; presigned/credential query, redirect tới private host, loopback/private/link-local/metadata IPv4/IPv6, DNS/redirect bypass và oversized/non-image response bị chặn theo rendering strategy.
- Audit/concurrency: duplicate create/status/redirect mutation không tạo trạng thái mâu thuẫn; audit failure rollback; cùng operation/sequence replay tương đương không nhân đôi.
- UI: keyboard/focus/error, table semantics, image fallback/alt, loading/empty, long URL/text và viewport mobile/tablet/desktop.
- Security assertion xác nhận catalog visibility không phát sinh entitlement/authorization claim hoặc bypass backend app.

## 15. Ordered steps

1. Xác minh Phase 2 sign-off; thu inventory app/feature/redirect, approved metric units, baseline service metadata và các quyết định URL/search/permission còn thiếu.
2. Architect threat-model image/launch/redirect, định nghĩa lifecycle/ownership và freeze OpenAPI/internal port/browser behavior.
3. Backend tạo migration `applications` và catalog children, rồi baseline `service_identities`, cuối cùng audit FK/check; viết migration-order/rollback/composite ownership tests trước repository/API.
4. Backend hiện thực Catalog domain/application ports/repositories, URL policy và transactional audit; sau đó thêm user/admin controllers đúng contract.
5. Frontend xây user list/card/detail/search/filter được duyệt và launch behavior; không thêm authorization giả.
6. Frontend xây admin CRUD/status/redirect/feature/metric forms và safe image preview theo policy freeze.
7. Tester triển khai contract/security/cross-app/concurrency/UI tests trên `tests/**` độc lập.
8. Tích hợp, chạy migration dry-run và các command thật đã có; không bịa build/test script nếu repository chưa cung cấp.
9. Kiểm tra CSP/image config theo từng môi trường, không dùng wildcard tạm để pass.
10. QA và reviewer kiểm độc lập; owner tương ứng sửa mục bắt buộc, rồi kiểm lại theo giới hạn ba vòng.

## 16. Parallel lanes và ownership

Sau contract freeze, ba làn chạy song song trên path rời nhau:

| Làn | Owner | Path sở hữu | Ranh giới |
|---|---|---|---|
| Backend | `subagent/backend` | `apps/control-plane/src/modules/application-catalog`, baseline persistence tại `apps/control-plane/src/modules/service-identity`, extension qua public port tại admin, `apps/control-plane/drizzle/migrations/`, phần contract được giao | Không mở service management API/scope; không sửa web/test; Admin không sở hữu Catalog repository |
| Frontend | `subagent/frontend` | `apps/web/app/(user)`, `apps/web/app/admin`; chỉ dùng auth feature Phase 2 qua interface đã freeze | Không đổi DB/API ngầm hoặc fetch URL server-side trái policy |
| Tester | `subagent/tester` | `tests/**` | Không sửa product; không nới test khi implementation sai |

Orchestrator chỉ định một owner cho `contracts/openapi/control-plane.v1.yaml` để tránh conflict. QA/reviewer read-only. Nhu cầu chạm path làn khác phải dừng và điều phối lại.

## 17. Checklist

- [ ] **functional:** user list/card/detail/launch và admin application/status/redirect/feature/metric flows đạt test; search/filter chỉ có khi requirement hỗ trợ; không có service management surface.
- [ ] **security:** image/launch/redirect negative suite chặn mọi case đã freeze; server RBAC deny-by-default; visibility không authorization; không lưu/nhận M2M secret.
- [ ] **db:** migration root duy nhất đúng; thứ tự application → catalog children → service identity → audit FK/check pass; approved `unit` là required; canonical audit service FK/actor shape đạt sau P3.
- [ ] **concurrency:** ít nhất hai create cùng key/add cùng redirect/status mutation cạnh tranh cho một outcome nhất quán, không duplicate, và audit transaction không tách rời.
- [ ] **accessibility:** toàn bộ CRUD/list/launch dùng được bằng bàn phím; focus/error announcement, table/card labels và image alt/fallback đạt kiểm tra.
- [ ] **responsive:** catalog/admin hoạt động tại mobile/tablet/desktop đã chốt; long key/URL không che action hoặc gây page overflow ngoài vùng chủ đích.
- [ ] **observability:** correlation ID và audit operation; metric/log cho URL-policy deny, catalog mutation và launch outcome đã redact; không fetch/log secret URL.
- [ ] **rollback:** rehearsal thứ tự ngược phục hồi P2 audit check trước khi bỏ service/application khi chưa có data; production dùng forward fix, không drop audit/history.
- [ ] **docs:** OpenAPI, URL policy, permission matrix, approved unit/nullable semantics status, baseline service/audit schema delta, CSP/config placeholders và runbook đồng bộ.

## 18. Exit gate

Phase 3 chỉ đạt khi Phase 2 vẫn không regression; contract/API/UI/test đồng bộ; catalog lifecycle/stable key invariants và approved-unit-before-insert được chứng minh; baseline `service_identities` bind application không chứa secret; audit service FK/canonical actor check đã hoàn tất theo migration order; exact redirects/cross-app ownership/image/launch protections pass; không có service scope/management hoặc Plan/Subscription/Entitlement/Quota implementation; QA **PASS** và reviewer không còn mục “phải sửa”.

## 19. Stop/rollback

- Dừng nếu Phase 2 chưa sign-off, CDN/object-store/image strategy, launch/redirect allowlist, permission, app/service ownership hoặc metric unit chưa được con người chốt.
- Dừng release khi có SSRF/image proxy bypass, open redirect, cross-app resource confusion, key mutation/reuse, admin authorization chỉ ở UI, audit tách transaction hoặc catalog visibility cấp quyền.
- Nếu counting/failure semantics chưa quyết định, giữ hai trường đó draft/null và chặn approve/downstream; **không insert metric nếu unit chưa được duyệt** và không điền placeholder/default để tiếp tục.
- Trước production có thể sửa migration chưa phát hành theo review; sau khi có dữ liệu, rollback application/config và inactivate resource trước, dùng forward corrective migration thay vì drop/hard delete.
- Cùng lỗi lặp lần hai hoặc hết ba vòng chưa đạt thì dừng với kết quả TẮC/CẠN LƯỢT, nêu bằng chứng và quyết định còn thiếu; kết quả này không thay phase status.

## 20. QA/reviewer sign-off

- **QA:** chạy và lưu output thật cho migration-order/rollback/test/lint/typecheck/build hiện có; kiểm audit service FK, required approved unit, CSP/URL policy, cross-app cases, accessibility/responsive và regression Phase 2. Lệnh không tồn tại phải được báo đúng sự thật.
- **Reviewer:** kiểm module/table ownership, staged service/audit schema, không secret/scope/API, stable keys, required unit, exact redirect, SSRF/image/launch controls, RBAC/audit transaction, nullable counting/failure gate và việc không lấn sang P4 capability.
- Sign-off phải gắn commit/environment/evidence; người viết implementation không tự chứng nhận phần mình.
- Chỉ ghi **ĐẠT** khi QA PASS và reviewer hết mục bắt buộc; nếu phụ thuộc/quyết định ngoài thiếu thì ghi **TẮC**; sau ba vòng chưa hội tụ ghi **CẠN LƯỢT**.
