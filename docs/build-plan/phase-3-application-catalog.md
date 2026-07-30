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

**Approver duy nhất cho mọi quyết định nghiệp vụ dưới đây là chủ dự án** (`./decision-register.md`, DEC-G01). Dự án là solo dev + AI agents; không có product/security/operations owner tách biệt ký duyệt chéo. Agent không tự approve thay con người.

- Phase 2 phải đạt, gồm admin authentication, deny-by-default RBAC, transactional audit và account/session security.
- Chốt permission catalog: read, create/update, status change, redirect manage, feature manage, metric manage/approve semantics.
- Image hosting/CSP/proxy **đã chốt** tại DEC-T12: ảnh app lưu trong **Supabase Storage bucket riêng trên private network** (không CDN bên thứ ba); browser **không** load ảnh trực tiếp từ origin ngoài mà đi qua **Next.js image optimizer** (`next/image`), nên `next.config` không khai `remotePatterns` mở và CSP không cần mở cho domain ngoài. CSP baseline: `default-src 'self'`; `img-src 'self' data:`; `frame-ancestors 'none'`; `object-src 'none'`; `base-uri 'self'`. Thêm host ảnh mới là record riêng, không sửa config tiện tay.
- `launch_url` policy **đã chốt** tại DEC-T12: bắt buộc `https`, host phải nằm trong allowlist đã đăng ký, chặn private/link-local address (RFC1918, `127.0.0.0/8`, `169.254.0.0/16`, `::1`, `fc00::/7`) để chống SSRF; thực thi ở **application layer**, không phải DB check (`../modular.md` mục 5.4). Canonicalization rules và việc app nào được public catalog vẫn cần chốt cùng inventory (DEC-B01).
- Chốt exact login/logout redirect URI của từng app; không wildcard. Chủ app/service phải xác nhận ownership trước activation.
- Chốt yêu cầu search/filter thực tế: trường được tìm, filter trạng thái/category nếu có, sort và pagination. Không tự thêm taxonomy/category nếu requirement chưa có.
- Chốt quy tắc stable key: format, độ dài, case, bất biến sau tham chiếu và cấm tái sử dụng.
- Feature inventory cần chủ dự án xác nhận (DEC-B01). **`unit` phải được chủ dự án duyệt trước khi tạo bất kỳ `usage_metrics` row nào vì cột này `NOT NULL`** (DEC-B05). `counting_point` và `failure_treatment` có thể giữ nullable/draft tới quyết định Phase 5; metric chưa đủ hai trường này không được approve/use cho quota.
- Chốt dữ liệu baseline không bí mật cho `service_identities`: Auth0 issuer, M2M client ID đã provision, display name, application owner và initial status. P3 không provision/lưu client secret và không cấp scope.
- Image rendering strategy **không còn là quyết định mở**: DEC-T12 đã chốt Next.js image optimizer với ảnh nằm trong Supabase Storage trên private network. Vẫn phải hiện thực đủ allowlist tĩnh, giới hạn/validate từng redirect hop, resolve DNS chặn loopback/private/link-local/metadata, chống DNS rebinding, timeout/size/content-type limits và không forward credential (mục 12).

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
- Tự phê duyệt metric semantics khi chủ dự án chưa quyết định (DEC-B05); không tạo quota policy.
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
| User catalog | `apps/web/app/[locale]/(user)` |
| Admin catalog | `apps/web/app/admin` |
| BFF auth/session dependency | `apps/web/app/api/bff/` (route handlers) + `apps/web/server/` (`control-plane-boundary.ts`, `session.ts`…) |
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
- `usage_metrics`: FK application và composite FK tới feature cùng app; stable key unique trong app. `unit` là `NOT NULL`, non-empty và phải có giá trị đã được chủ dự án duyệt **trước insert** (DEC-B05). Chỉ `counting_point` (`start|milestone|success`) và `failure_treatment` (`commit|cancel|policy_defined`) được nullable khi metric còn draft tới P5.
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

Runbook dưới đây là **kế hoạch thực thi**, không khẳng định artifact đã tồn tại hoặc lệnh đã chạy. Mạch logic: decisions → contract freeze → parallel impl (backend/frontend/tester) → integration → QA/reviewer. Mỗi bước ghi năm thành phần: **Hành động** / **Sản phẩm** / **Phụ thuộc** / **Verify** / **Lane**.

**Tooling đã chốt.** Tên lệnh trong ô Verify lấy từ bảng script canonical DEC-T15 (`./decision-register.md` mục E). Script được **tạo ở bước P1.7**; trước đó lệnh tồn tại trên giấy và chưa chạy được — không ô Verify nào dưới đây khẳng định lệnh đã chạy.

**Quyết định nghiệp vụ chưa chốt** vẫn ghi `‹cần chốt: ...›` và là blocker cứng của bước liên quan; approver duy nhất là chủ dự án (DEC-G01). Tôn trọng phased migration P2->P3: `service_identities` chỉ tạo **sau `applications`**, audit service-actor FK/check hoàn thiện **sau `service_identities`**.

**A. Decisions và contract freeze (tuần tự, chặn mọi bước sau)**

1. Xác minh Phase 2 sign-off và thu thập human decisions ở mục 3.
   - **Hành động:** đối chiếu Phase 2 exit gate (admin auth, deny-by-default RBAC, transactional audit, account/session security); thu inventory app/feature/redirect, approved metric `unit`, baseline `service_identities` metadata (issuer, M2M client ID, display name, owner, initial status), permission catalog và các quyết định URL/search còn thiếu.
   - **Sản phẩm:** bản xác nhận decision (orchestrator/architect giữ), không thuộc 2 file lane này.
   - **Phụ thuộc:** Phase 2 exit gate. Đã chốt, không còn blocker: image hosting/CSP/`launch_url` scheme/host policy và image rendering strategy (DEC-T12). Còn `open`: `‹cần chốt: permission catalog catalog/feature/metric/redirect›`; `‹cần chốt: danh sách app của Hub + owner từng app (DEC-B01)›`; `‹cần chốt: exact login/logout redirect URI từng app›`; `‹cần chốt: search/filter requirement›`; `‹cần chốt: stable key rule›`; `‹cần chốt: approved metric unit (DEC-B05)›`; `‹cần chốt: baseline service_identities metadata›`.
   - **Verify:** mọi mục 3 có giá trị chốt hoặc `‹cần chốt›`; thiếu decision bắt buộc thì DỪNG (TẮC); không seed app/metric/service giả khi inventory chưa duyệt.
   - **Lane:** orchestrator/architect.

2. Architect threat-model image/launch/redirect, định nghĩa lifecycle/ownership và freeze OpenAPI/internal port/browser behavior.
   - **Hành động:** mở rộng `contracts/openapi/control-plane.v1.yaml` cho user/admin catalog APIs; freeze resource schemas, route/method/status, pagination/search/filter, stable key rules, machine error codes (validation, duplicate key, invalid transition, forbidden, cross-app ownership, unsafe URL, redirect conflict, semantics incomplete); freeze lifecycle/transition matrix, URL canonicalization/allowlist, `CatalogLookupPort` shape, metric-create contract bắt buộc approved non-empty `unit`, và baseline service identity/audit FK migration ownership.
   - **Sản phẩm:** `contracts/openapi/control-plane.v1.yaml` (frozen delta), lifecycle/ownership doc, `CatalogLookupPort` contract.
   - **Phụ thuộc:** bước 1.
   - **Verify:** `pnpm openapi:lint` (redocly lint `contracts/openapi/control-plane.v1.yaml`, DEC-T07/T15) kỳ vọng 0 lỗi schema OpenAPI 3.1; `pnpm openapi:drift` kỳ vọng type sinh lại khớp bản đã commit; metric-create yêu cầu approved `unit`; nullable `counting_point`/`failure_treatment` có cách biểu diễn “chưa quyết định”; breaking change sau freeze quay lại architect.
   - **Lane:** architect (OpenAPI owner do orchestrator chỉ định).

**B. Backend — migrations theo thứ tự phụ thuộc (lane backend, chỉ sau freeze)**

3. Tạo migration `applications`.
   - **Hành động:** tạo `control_plane.applications` với `id uuid` application-generated, unique immutable `key` (`applications_key_key`), `display_name` non-empty, nullable `description`, nullable `image_url` (non-empty nếu có), required `launch_url`, status `draft|active|inactive` (`applications_status_check`), DB-clock timestamps, index `applications_status_idx`. DB check chỉ bảo vệ shape/non-empty/status; HTTPS/host/SSRF là application layer.
   - **Sản phẩm:** `apps/control-plane/drizzle/migrations/` (migration `applications`).
   - **Phụ thuộc:** bước 2; Phase 2 migrations đã áp dụng.
   - **Verify:** `pnpm db:generate` rồi `pnpm db:migrate` (drizzle-kit 0.31.10, role migration nối trực tiếp PostgreSQL không qua Supavisor — DEC-T09/T15) trên DB đã có schema P2; trùng `key` bị unique từ chối; status ngoài tập bị check từ chối; `launch_url` rỗng bị từ chối.
   - **Lane:** backend.

4. Tạo migration catalog children: `application_redirect_uris` → `features` → `usage_metrics`.
   - **Hành động:** tạo `application_redirect_uris` (FK application `RESTRICT`, purpose `login|logout`, unique `(application_id, purpose, uri)`, không wildcard); `features` (FK application, unique `(application_id, key)` và `(id, application_id)` cho composite FK target, status check); `usage_metrics` (FK application, composite FK `(feature_id, application_id) REFERENCES features(id, application_id)`, unique `(application_id, key)`/`(id, application_id)`/`(id, feature_id, application_id)`, **`unit` NOT NULL non-empty**, `counting_point`/`failure_treatment` nullable với named checks, status check).
   - **Sản phẩm:** `apps/control-plane/drizzle/migrations/` (migrations redirect/feature/metric).
   - **Phụ thuộc:** bước 3.
   - **Verify:** migration smoke; không thể tạo children trước `applications`; redirect trùng `(application_id, purpose, uri)` bị từ chối; metric của feature khác app bị composite FK từ chối; insert metric thiếu/rỗng `unit` bị `NOT NULL`/check từ chối.
   - **Lane:** backend.

5. Tạo migration baseline `service_identities` (sau `applications`).
   - **Hành động:** tạo `service_identities` với `id uuid`, required `application_id` (FK), `issuer`, `client_id`, `display_name`, status `active|revoked`, nullable `last_seen_at`/revoke fields, DB-clock timestamps, unique `(issuer, client_id)` và `(id, application_id)`, index `(application_id, status)`; **không** cột client secret/access/refresh token; **không** tạo `service_identity_scopes` (thuộc P4).
   - **Sản phẩm:** `apps/control-plane/drizzle/migrations/` (migration `service_identities`).
   - **Phụ thuộc:** bước 3 (`applications` phải tồn tại trước).
   - **Verify:** migration smoke; không thể chạy bước này trước `applications` (test order ở bước 8); trùng `(issuer, client_id)` bị từ chối; không tồn tại cột secret/token.
   - **Lane:** backend.

6. Tạo migration hoàn thiện audit service-actor FK + canonical actor check (phased P2->P3 upgrade).
   - **Hành động:** sau khi `service_identities` tồn tại, kiểm tra dữ liệu staging tương thích, thêm `audit_events.actor_service_identity_id REFERENCES service_identities(id) ON DELETE RESTRICT`, rồi thay P2 actor check bằng canonical check cho đúng một actor `account|service|system`. Giữ nguyên `audit_events_append_only` và runtime grants đã tạo ở P2.
   - **Sản phẩm:** `apps/control-plane/drizzle/migrations/` (migration audit FK + actor check upgrade).
   - **Phụ thuộc:** bước 5 (`service_identities` phải tồn tại).
   - **Verify:** evidence SQL trực tiếp — sau upgrade, `actor_type = 'service'` với FK hợp lệ được chấp nhận, service identity không tồn tại bị FK từ chối, `account`/`system` vẫn hợp lệ; `audit_events_append_only` vẫn chặn `UPDATE`/`DELETE`; runtime grants vẫn chặn `TRUNCATE`; không có cửa sổ thiếu actor constraint.
   - **Lane:** backend.

7. Viết migration-order/rollback/composite-ownership tests trước repository/API.
   - **Hành động:** viết test khẳng định thứ tự bắt buộc (1) `applications` (2) redirect/feature/metric (3) `service_identities` (4) audit FK/check; không thể chạy bước 3/4 trước dependency; rollback thứ tự ngược khôi phục P2 account/system-only actor check trước khi bỏ service/catalog; composite ownership/uniqueness đúng.
   - **Sản phẩm:** migration tests trong `tests/**` (tester phối hợp, backend cấp fixture SQL).
   - **Phụ thuộc:** bước 6.
   - **Verify:** `pnpm test` (Vitest 4.1.10, DEC-T05/T15) chạy migration-order suite trên **PostgreSQL thật qua testcontainers 12.0.4 + @testcontainers/postgresql 12.0.4** — thứ tự FK/constraint là hành vi của PostgreSQL, không mock được. Script có sau P1.7; chưa tồn tại thì báo đúng sự thật, không bịa script.
   - **Lane:** tester (fixture do backend cấp).

**C. Backend — domain, ports, controllers (lane backend)**

8. Hiện thực Catalog domain, ports, repositories, URL policy và `CatalogLookupPort`; transactional audit.
   - **Hành động:** trong `apps/control-plane/src/modules/application-catalog` viết command/query/ports/repositories; validate `launch_url`/`image_url`/redirect URI ở application layer (HTTPS, host allowlist, canonicalize exact-match, chặn SSRF/loopback/private/link-local/metadata theo rendering strategy); `CatalogLookupPort` resolve stable key + verify ownership + trả metadata tối thiểu (consumer không đọc table); baseline persistence `service_identities` tại `apps/control-plane/src/modules/service-identity`; mutation nhạy cảm append audit `operationId + sequence` cùng transaction.
   - **Sản phẩm:** module `application-catalog` + `service-identity` baseline persistence.
   - **Phụ thuộc:** bước 6, 7; launch/image/CSP policy đã chốt tại DEC-T12 (https-only + host allowlist + chặn private/link-local ở application layer; ảnh qua Next image optimizer từ Supabase Storage private network).
   - **Verify:** `pnpm test` chạy URL policy tests (bước 12) pass; `pnpm typecheck` sạch; App A không resolve/mutate resource App B; audit lỗi rollback mutation; không lưu/nhận M2M secret.
   - **Lane:** backend.

9. Viết user/admin catalog controllers đúng frozen contract với RBAC deny-by-default.
   - **Hành động:** user endpoints list active/visible + get detail bằng stable key + search/filter/pagination theo requirement; admin create/get/list/update/set-status (không hard delete), redirect list/add/remove, feature register/list/update, metric register/list/update/approve (bắt buộc approved `unit`, từ chối rỗng/placeholder); admin orchestration gọi public Catalog port từ `apps/control-plane/src/modules/admin`; **không** service identity management endpoint (thuộc P4).
   - **Sản phẩm:** controllers user/admin + admin orchestration extension.
   - **Phụ thuộc:** bước 8; contract bước 2.
   - **Verify:** contract test khớp OpenAPI; permission thiếu trả `403` kể cả gọi trực tiếp; metric thiếu `unit` bị từ chối; launch dùng URL đã validate/lưu, không nhận tùy ý từ request.
   - **Lane:** backend.

**D. Frontend (lane frontend, song song sau freeze)**

10. Xây user list/card/detail/search/filter được duyệt và launch behavior.
    - **Hành động:** trong `apps/web/app/[locale]/(user)` dựng list/card (chỉ app theo visibility contract, fallback ảnh/alt an toàn), detail (metadata catalog, không secret/redirect nội bộ), search/filter chỉ khi requirement hỗ trợ, launch dùng `launch_url` đã validate từ catalog (không ghép host/path từ input); ghi rõ thấy app không đồng nghĩa được cấp quyền; dùng auth/session Phase 2 qua `apps/web/app/api/bff/` + `apps/web/server/`.
    - **Sản phẩm:** `apps/web/app/[locale]/(user)`.
    - **Phụ thuộc:** bước 2 (frozen contract); Phase 2 auth feature. Không đổi DB/API ngầm hoặc fetch URL server-side trái policy.
    - **Verify:** UI tests (bước 12); keyboard/focus/error/announcement, image fallback/alt, card/grid không mất thứ tự đọc mobile/tablet/desktop; inactive/draft không launch.
    - **Lane:** frontend.

11. Xây admin CRUD/status/redirect/feature/metric forms và safe image preview.
    - **Hành động:** trong `apps/web/app/admin` dựng form Application (key khóa sau mốc contract, không đổi bằng xóa/tạo lại), redirect editor (canonical URI, exact-match warning, reason/confirmation), feature/metric editor (luôn hiển thị owner, không chọn feature app khác, chặn tạo metric khi `unit` chưa duyệt); image preview chỉ dùng URL đã qua server validation, không gửi cookie/authorization header tới image host; protected routes dùng Phase 2 session + server-side permission.
    - **Sản phẩm:** `apps/web/app/admin`.
    - **Phụ thuộc:** bước 2; image rendering strategy/CSP đã chốt tại DEC-T12 — preview dùng `next/image`, `next.config` không khai `remotePatterns` mở, CSP giữ `img-src 'self' data:`.
    - **Verify:** `pnpm test:e2e` (Playwright 1.61.1) chạy UI tests (bước 12); action thiếu permission bị server từ chối dù gọi trực tiếp; không hiển thị/thu thập M2M secret; bảng accessible + responsive table/card, không ẩn action bắt buộc.
    - **Lane:** frontend.

**E. Tester (lane tester, song song sau freeze)**

12. Triển khai contract/security/cross-app/concurrency/UI tests trên `tests/**`.
    - **Hành động:** viết migration-order/rollback, API contract/permission matrix, stable key, cross-app ownership, metric-unit, service/audit (no secret, FK reject), redirect/launch/image URL negative suite, audit/concurrency, và UI/accessibility/responsive tests theo mục 14; không sửa product, không nới assertion khi implementation sai.
    - **Sản phẩm:** `tests/**`.
    - **Phụ thuộc:** bước 2 (contract); fixture backend bước 7.
    - **Verify:** `pnpm test` (Vitest, unit + integration trên PostgreSQL thật qua testcontainers) và `pnpm test:e2e` (Playwright — accessibility/responsive viewport). Test fail thì trả backend/frontend sửa code, cấm nới assertion; script có sau P1.7, chưa tồn tại thì báo đúng sự thật.
    - **Lane:** tester.

**F. Integration**

13. Tích hợp ba làn, chạy migration dry-run và command thật; kiểm CSP/image config từng môi trường.
    - **Hành động:** hợp nhất ba làn trên path rời nhau; chạy migration dry-run theo đúng thứ tự application → catalog children → service identity → audit FK/check + rollback rehearsal thứ tự ngược; kiểm CSP/image allowlist theo từng môi trường, không dùng wildcard tạm để pass; chạy build/test/lint/typecheck.
    - **Sản phẩm:** evidence run (log/output thật), không bịa build/test script.
    - **Phụ thuộc:** bước 9, 11, 12.
    - **Verify:** chạy theo thứ tự và dán output thật: `pnpm install --frozen-lockfile` → `pnpm typecheck` → `pnpm lint` → `pnpm openapi:lint` + `pnpm openapi:drift` → `pnpm db:migrate` (đúng thứ tự application → catalog children → service identity → audit FK/check) → `pnpm test` → `pnpm test:e2e` → `pnpm build`. Kỳ vọng tất cả exit 0. Lệnh chỉ chạy được sau P1.7; chưa tồn tại thì báo đúng sự thật theo AGENTS.md.
    - **Lane:** orchestrator/integration.

**G. QA và reviewer**

14. QA và reviewer kiểm độc lập; owner sửa mục bắt buộc theo giới hạn ba vòng.
    - **Hành động:** QA chạy/lưu output thật cho migration-order/rollback/test/lint/typecheck/build + evidence audit service FK, approved unit, CSP/URL policy, cross-app, regression Phase 2; reviewer kiểm module/table ownership, staged service/audit schema, no secret/scope/API, stable keys, required unit, exact redirect, SSRF/image/launch controls, RBAC/audit transaction theo mục 20.
    - **Sản phẩm:** QA/reviewer sign-off gắn commit/environment/evidence.
    - **Phụ thuộc:** bước 13.
    - **Verify:** QA **PASS** và reviewer hết mục “phải sửa” → ĐẠT; cùng lỗi lặp lần hai → TẮC; hết ba vòng chưa đạt → CẠN LƯỢT. QA/reviewer không sửa file.
    - **Lane:** qa, reviewer.

## 16. Parallel lanes và ownership

Sau contract freeze, ba làn chạy song song trên path rời nhau:

| Làn | Owner | Path sở hữu | Ranh giới |
|---|---|---|---|
| Backend | `subagent/backend` | `apps/control-plane/src/modules/application-catalog`, baseline persistence tại `apps/control-plane/src/modules/service-identity`, extension qua public port tại admin, `apps/control-plane/drizzle/migrations/`, phần contract được giao | Không mở service management API/scope; không sửa web/test; Admin không sở hữu Catalog repository |
| Frontend | `subagent/frontend` | `apps/web/app/[locale]/(user)`, `apps/web/app/admin`; chỉ dùng auth feature Phase 2 qua interface đã freeze | Không đổi DB/API ngầm hoặc fetch URL server-side trái policy |
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

- Dừng nếu Phase 2 chưa sign-off, hoặc redirect allowlist từng app, permission catalog, app/service ownership (DEC-B01) hoặc metric unit (DEC-B05) chưa được **chủ dự án** chốt. Image hosting/CSP/launch policy đã chốt tại DEC-T12; lệch khỏi record đó là blocker, phải tạo record superseding chứ không sửa config tại chỗ.
- Dừng release khi có SSRF/image proxy bypass, open redirect, cross-app resource confusion, key mutation/reuse, admin authorization chỉ ở UI, audit tách transaction hoặc catalog visibility cấp quyền.
- Nếu counting/failure semantics chưa quyết định, giữ hai trường đó draft/null và chặn approve/downstream; **không insert metric nếu unit chưa được duyệt** và không điền placeholder/default để tiếp tục.
- Trước production có thể sửa migration chưa phát hành theo review; sau khi có dữ liệu, rollback application/config và inactivate resource trước, dùng forward corrective migration thay vì drop/hard delete.
- Cùng lỗi lặp lần hai hoặc hết ba vòng chưa đạt thì dừng với kết quả TẮC/CẠN LƯỢT, nêu bằng chứng và quyết định còn thiếu; kết quả này không thay phase status.

## 20. QA/reviewer sign-off

- **QA:** chạy và lưu output thật cho migration-order/rollback/test/lint/typecheck/build hiện có; kiểm audit service FK, required approved unit, CSP/URL policy, cross-app cases, accessibility/responsive và regression Phase 2. Lệnh không tồn tại phải được báo đúng sự thật.
- **Reviewer:** kiểm module/table ownership, staged service/audit schema, không secret/scope/API, stable keys, required unit, exact redirect, SSRF/image/launch controls, RBAC/audit transaction, nullable counting/failure gate và việc không lấn sang P4 capability.
- Sign-off phải gắn commit/environment/evidence; người viết implementation không tự chứng nhận phần mình.
- Chỉ ghi **ĐẠT** khi QA PASS và reviewer hết mục bắt buộc; nếu phụ thuộc/quyết định ngoài thiếu thì ghi **TẮC**; sau ba vòng chưa hội tụ ghi **CẠN LƯỢT**.
