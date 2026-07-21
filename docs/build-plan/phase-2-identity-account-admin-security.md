# Phase 2 — Identity, Account và nền tảng bảo mật Admin

## 1. Trạng thái

`in_progress` — bắt đầu 2026-07-17. Cập nhật 2026-07-21.

**IdP đã đổi:** DEC-T22 thay Auth0 bằng **Logto self-host** (lý do: dữ liệu xác thực phải
nằm trên hạ tầng do chủ dự án kiểm soát). DEC-B03 (Auth0 tenant) do đó không còn là blocker.
Client OIDC của BFF là `openid-client@6.8.4` — DEC-T24.

### Đã xong và kiểm chứng

| Hạng mục | Bằng chứng |
|---|---|
| 7 bảng DB + trigger append-only + tách role runtime/migration | migration 0001–0006, test SQL trực tiếp |
| Provisioning race-safe theo `(issuer, subject)` | test 8 request song song → đúng 1 account |
| Phiên: tạo/kiểm/thu hồi, chỉ lưu hash SHA-256 | |
| Luồng OIDC đầy đủ PKCE + `state` + `nonce` | đăng nhập thật chạy được |
| Control Plane **tự verify chữ ký** id_token qua JWKS | không tin claim do BFF khai |
| CSRF hai lớp (double-submit ở BFF + đối chiếu hash ở Control Plane) | 5 negative test |
| Chặn account bị khoá ở **2 điểm** (lúc cấp phiên và mỗi lần dùng phiên) | 4 negative test |
| RBAC deny-by-default, 6 permission khoá bằng CHECK | chặn 3 lớp: proxy → RSC → guard |
| **Chốt chặn leo thang đặc quyền** | test: admin quyền thấp không cấp được quyền cao |
| Bootstrap admin qua script CLI | đã chạy thật |
| Audit ghi trong cùng transaction với mutation | audit lỗi → rollback |
| UI người dùng: hồ sơ, phiên đăng nhập | |
| UI quản trị: tài khoản, nhật ký, vai trò & phân quyền | 3 tab |
| OpenAPI đồng bộ, `openapi:drift` xanh | |

### Còn lại — chờ quyết định của chủ dự án

1. **Recovery flow** (§18). Phải **hoặc** hiện thực, **hoặc** ra quyết định loại bỏ rồi cập
   nhật đồng bộ `docs/index.md`, `docs/modular.md`, OpenAPI/browser contract và build plan.
   Có quyết định mà chưa cập nhật đủ 4 nguồn thì P2 vẫn `blocked`.

   Ghi chú kỹ thuật: Logto **có sẵn** luồng quên mật khẩu qua email, nhưng hiện chưa dùng
   được — chưa có email connector (`connectors` rỗng) và định danh đăng nhập mới chỉ là
   `username`, chưa bật email. Cần chọn nhà cung cấp email; đây là quyết định có ràng buộc
   về nơi lưu dữ liệu, giống lý do đã bỏ Auth0.

2. **CAPTCHA** (DEC-T23, `proposed`). Logto có bảng `captcha_providers` nên hỗ trợ sẵn;
   cần chốt dùng nhà cung cấp nào.

3. **Xoay Logto App Secret** — secret hiện tại đã lộ trong hội thoại, phải thay.

### Việc kỹ thuật còn thiếu (không chờ ai)

- Test e2e cho luồng đăng nhập thật và các trang mới. Hiện 48 test e2e mới phủ shell,
  CSP và lưới cột — chưa phủ đăng nhập, tài khoản, phiên, khu quản trị.
- Negative test OIDC theo §14: `state`/`nonce`/PKCE sai, callback replay, open redirect.
- Observability §17: correlation ID xuyên BFF → API → audit (Control Plane đã có, BFF chưa
  nối); metric cho callback/session revoke/RBAC deny — **chưa có gì**.
- Rollback rehearsal §17.

### Ghi chú phạm vi

Trang chủ đã dựng lưới công cụ, danh mục, blog, FAQ, newsletter với **dữ liệu mẫu**. Phần
danh mục thực chất thuộc **P3** (§10 của phase-3). Bố cục làm trước là có chủ đích; sang P3
chỉ thay các mảng `PLACEHOLDER_*` bằng lời gọi API, **không dựng lại layout**.

Blog và "gửi công cụ" đến từ thiết kế Figma nhưng **không nằm trong bất kỳ phase nào** của
build plan P0–P9. Đây là khoảng trống thật giữa thiết kế và kế hoạch, cần chủ dự án quyết
định đưa vào phase nào hoặc bỏ khỏi thiết kế.

`TẮC`/`CẠN LƯỢT` là kết quả vòng kiểm chứng theo `AGENTS.md`, không phải phase status.

## 2. Mục tiêu

- Hoàn thiện đăng nhập Hub qua Auth0 managed bằng OIDC Authorization Code, SDK được phê duyệt, PKCE, `state` và `nonce`.
- Cung cấp entry flow khôi phục quyền truy cập do Auth0 sở hữu, không tự lưu password hoặc tự xây hệ thống reset credential.
- Tạo Account và External Identity an toàn theo khóa `(issuer, subject)`, không liên kết bằng email, kể cả email đã xác minh.
- Cung cấp phiên BFF phía server, trang tài khoản/phiên và khả năng logout/revoke có hiệu lực tại Hub.
- Đặt nền RBAC và audit để Admin quản lý account/session theo nguyên tắc deny-by-default.
- Đóng băng hợp đồng browser/BFF/API đủ cho frontend, backend và tester làm song song.

Exit của phase này chỉ xác nhận auth/account/admin security của **Hub**. Luồng SSO full E2E xuyên domain với app mẫu được hoãn tới Phase 6.

## 3. Prerequisites và human decisions

Phải chốt và ghi lại trước bước contract freeze. **Approver duy nhất cho mọi quyết định nghiệp vụ/bảo mật/vận hành dưới đây là chủ dự án** (`./decision-register.md`, DEC-G01); dự án là solo dev + AI agents, không có hội đồng ký duyệt chéo. Agent không tự approve thay con người, kể cả khi đề xuất do agent soạn.

- SDK Auth0 **đã chốt** tại DEC-T08: `@auth0/nextjs-auth0@4.25.0` cho Hub BFF (`apps/web`) và `jose@6.2.3` cho Control Plane verify JWT qua JWKS. Không tự chọn package khác; đổi version phải tạo record superseding.
- Auth0 tenant/domain, issuer canonical, audience và Hub Application thật vẫn `open` (DEC-B03); cấu trúc topology đề xuất tại DEC-T14 giữ `proposed`. Đây là quyết định của chủ dự án, không phải lựa chọn tooling.
- Exact callback URL, post-logout URL và tập return URL của Hub theo từng môi trường; không wildcard, prefix-match hoặc fallback mở.
- Lifetime tuyệt đối/nhàn rỗi, rotation policy, hash algorithm và revoke SLA của web session; tên cookie và policy CSRF tương thích BFF.
- Provisioning policy chuyển account `pending -> active`; callback không được tự mặc định kích hoạt nếu policy chưa duyệt.
- Profile-sync policy: lần đầu có thể nhận claim đã xác minh; lần đăng nhập sau có hay không ghi đè trường user đã sửa.
- Bootstrap admin: danh tính nào được gán role đầu tiên, ai phê duyệt, cơ chế một lần, cách vô hiệu hóa sau bootstrap và bằng chứng audit. Không có super-admin mặc định.
- Danh mục permission tối thiểu cho account read, disable, enable, session read/revoke, role read/manage và audit read.
- Google social connection có được bật hay không, Google OAuth credential owner, secret store, callback do Auth0 cung cấp và danh sách môi trường được phép.
- Recovery access mặc định là capability bắt buộc của P2. Chốt Auth0 approved recovery flow/entry URL, exact return URL, anti-enumeration response, yêu cầu re-authentication và hành vi revoke/rotate Hub sessions sau recovery.
- Chỉ được loại recovery khỏi MVP khi đồng thời có: (1) scope decision được **chủ dự án** ký (DEC-G01); (2) `docs/index.md` và `docs/modular.md` đã được cập nhật để không còn yêu cầu hành vi cũ; (3) OpenAPI/browser contract và build plan liên quan đã được cập nhật; (4) toàn bộ change set đã qua review. Thiếu bất kỳ điều kiện nào thì recovery vẫn bắt buộc và P2 giữ `blocked`.
- Phân biệt account dùng database/password connection do Auth0 sở hữu với Google/social account: Talosmine không hứa reset Google credential; UX phải dẫn tới cơ chế recovery của đúng provider mà không tiết lộ account/provider có tồn tại.
- Chính sách audit/PII retention, redaction, correlation ID và rate limit cho auth/admin endpoints.
- P2 không tạo `applications`, `service_identities` hoặc service scope; toàn bộ baseline này thuộc P3.

Thiếu bất kỳ quyết định bắt buộc nào ở trên thì dừng tại bước liên quan; không điền giá trị giả.

## 4. Phạm vi

- Auth0 OIDC cho Hub BFF: login, callback, logout, exact return URL, xử lý lỗi và phiên phía server.
- Recovery access entry UX/BFF redirect/config qua approved Auth0 flow, exact allowlist, anti-enumeration và session/re-auth/revoke behavior đã được duyệt.
- Account profile gồm đúng `display_name`, `email`, `email_verified`, `locale`, `timezone`; trạng thái `pending`, `active`, `disabled`.
- Atomic Unit of Work tạo `accounts` và `external_identities`; đồng bộ `email`/`email_verified` nguyên tử.
- Quản lý `web_sessions`: chỉ lưu hash, kiểm tra expiry/revoke, liệt kê phiên của chính user và revoke.
- User web cho login/callback/logout, trang account và danh sách session.
- Admin shell được bảo vệ; tìm kiếm/xem account, disable/enable và revoke session; nền role/permission/assignment/audit.
- OpenAPI 3.1 cho REST JSON versioned và hợp đồng browser flow cho `/auth/*`.
- Google Login qua Auth0 sau config gate; kiểm thử không auto-link theo email.

## 5. Ngoài phạm vi

- Password store, credential UI hoặc tự xây identity provider.
- Tự lưu password, sinh reset token hoặc tự triển khai password-reset backend. Recovery do Auth0/provider sở hữu; chỉ được loại toàn bộ recovery UX khỏi MVP khi đáp ứng đủ scope decision, cập nhật nguồn/contract/build plan và review ở mục 3.
- Avatar, số điện thoại, profile JSON tùy ý, organization/team và hard delete account.
- Account linking/merge thủ công hoặc tự động; khôi phục password do Auth0 quản lý theo cấu hình riêng.
- Plan, Subscription, Entitlement, Quota, payment và quyền theo feature/metric.
- Phiên cục bộ của Data Plane, global logout hoàn chỉnh và cross-domain app mẫu full E2E; các mục này chờ Phase 6/hardening liên quan.
- Application Catalog, `applications`, `service_identities` và service scope; baseline bắt đầu ở P3. P2 không lưu Auth0 client secret trong Control Plane.

## 6. Deliverables

- Migration forward-only cho Identity, Account và nền Admin/Audit, kèm kế hoạch rollback vận hành.
- Module NestJS theo ownership: identity/web-session, account và audit/admin; không có Application Catalog hoặc Service Identity deliverable trong P2.
- BFF auth feature, user pages và admin protected shell trong Next.js.
- OpenAPI/browsers-flow contract đã freeze, machine-readable error codes và ma trận permission.
- Bộ test tự động cho OIDC, session, CSRF, race provisioning, RBAC và transactional audit.
- Recovery entry/config/E2E tests cho exact redirect, anti-enumeration, provider distinction và session behavior đã duyệt.
- Cấu hình mẫu chỉ chứa tên biến/placeholder; không chứa tenant secret, client secret, cookie/session token hoặc dữ liệu thật.
- Runbook ngắn cho bootstrap admin, bật/tắt Google connection, revoke session và rollback release.

## 7. Target paths

Các path sau là đích dự kiến, không khẳng định đang tồn tại:

| Hạng mục | Target path |
|---|---|
| User routes | `apps/web/app/(user)` |
| Auth routes/pages | `apps/web/app/auth` |
| Admin shell/pages | `apps/web/app/admin` |
| BFF auth feature | `apps/web/src/bff/auth/features` |
| Identity module | `apps/control-plane/src/modules/identity` |
| Account module | `apps/control-plane/src/modules/account` |
| Admin/Audit module | `apps/control-plane/src/modules/admin` |
| Migration | `apps/control-plane/drizzle/migrations/` |
| API contract | `contracts/openapi/control-plane.v1.yaml` |
| Test | `tests/**` |

Không tạo cấu trúc thay thế nếu bootstrap repository chốt path khác; phải cập nhật contract/plan bằng quyết định được duyệt trước.

## 8. DB/migration

- Tạo `control_plane.accounts` với UUID do application sinh; profile typed; check trạng thái và consistency của `disabled_at`; không unique `email`/`display_name`.
- Tạo `external_identities` với unique `(issuer, subject)`, FK `account_id ON DELETE RESTRICT`, provider baseline `auth0`; không có unique/index để link email.
- Tạo `web_sessions` với **unique duy nhất trên `session_token_hash`**. `csrf_token_hash` bắt buộc nhưng **không unique**. `auth0_sid` nullable và chỉ có non-unique partial index `WHERE auth0_sid IS NOT NULL`; thêm DB-clock timestamps, expiry/revoke checks và active-session index. Không lưu token/cookie/CSRF thô.
- Tạo `admin_roles`, `admin_role_permissions`, `admin_role_assignments` và append-only `audit_events`; permission deny-by-default, assignment không cấp vượt quyền actor.
- **Schema delta P2:** `audit_events.actor_service_identity_id` được tạo nullable để tránh migration phá vỡ về sau nhưng **chưa có FK**, vì `service_identities` phụ thuộc `applications` của P3. P2 actor check/runtime chỉ chấp nhận `actor_type = account|system`, yêu cầu `actor_service_identity_id IS NULL`, và test phải từ chối mọi service actor/value. P3 mới tạo `service_identities`, thêm FK và mở actor shape cho `service` để đạt canonical final schema.
- P2 bắt buộc tạo trigger `audit_events_append_only_trg` trên `audit_events` để PostgreSQL trực tiếp từ chối mọi `UPDATE` và `DELETE`; append-only không được chỉ dựa vào repository/application layer. Trigger được tạo sau table và P2 actor check staging, nhưng không phụ thuộc danh sách actor/FK nên vẫn giữ nguyên khi P3 thay actor check và thêm service-identity FK.
- Runtime database role chỉ nhận quyền tối thiểu cần cho `SELECT`/`INSERT` theo ownership và bị cấm `UPDATE`, `DELETE`, `TRUNCATE` trên `audit_events`. Migration/owner role tách riêng, không được dùng trong API/worker/runtime connection string. P3 không được drop, disable, replace yếu hơn trigger hoặc nới runtime grants khi upgrade FK/check.
- Audit dùng identity idempotent `operation_id + sequence`. Mutation nhạy cảm và append audit phải cùng PostgreSQL transaction/shared Unit of Work; audit lỗi thì rollback mutation.
- Provisioning mở một transaction, gọi Account provisioning port tạo account `pending`, rồi insert external identity. Nếu unique race thua, rollback toàn transaction—including account vừa tạo—sau đó mở transaction mới đọc mapping thắng; không để account orphan.
- Cập nhật `email` cùng `email_verified` trong một statement/transaction: email đổi thì mặc định `false`; chỉ `true` khi đúng email đó có boolean claim đã được SDK/Auth0 xác minh.
- Dùng `timestamptz`, DB clock, named checks/indexes và forward migration. Dry-run trên database rỗng và snapshot tương thích; rollback ưu tiên rollback application trước, không drop dữ liệu production tự động.
- Recovery flow không tạo bảng password/reset token/provider credential trong Control Plane.

## 9. Backend API

Contract freeze phải xác định request/response/error cụ thể cho bề mặt dự kiến sau:

- Browser/BFF `/auth/login`, `/auth/callback`, `/auth/logout`; chỉ nhận return URL đã canonicalize và exact-match allowlist. Callback xác minh code flow qua SDK, PKCE, `state`, `nonce`, issuer, audience, signature và expiry trước provisioning/session.
- Browser/BFF recovery entry (exact route được freeze) chỉ chuyển hướng tới approved Auth0 recovery flow và exact return URL; response khởi tạo/hoàn tất không được xác nhận account, email hay provider có tồn tại. Contract phải nêu outcome khi recovery yêu cầu re-authentication và session rotate/revoke.
- `GET /v1/me/account`, `PATCH /v1/me/account` với field allowlist; user không sửa `status` hoặc `email_verified` trực tiếp.
- `GET /v1/me/account/sessions`, `DELETE /v1/me/account/sessions/{sessionId}` và, nếu contract duyệt, thao tác revoke các phiên khác; luôn kiểm tra ownership.
- Admin account: search phân trang, detail, disable, enable; mutation có permission riêng, reason không rỗng và audit transaction.
- Admin session: list metadata tối thiểu và revoke một/toàn bộ session của account; không trả hash/token.
- Admin role foundation: read role/permission/assignment và mutation tối thiểu cần cho bootstrap đã duyệt; mọi endpoint server-side authorize deny-by-default.
- Không có application/service identity endpoint hoặc schema API trong P2; baseline đó thuộc P3.
- `/auth/*` là browser-flow contract, không buộc giả vờ là REST resource trong OpenAPI nếu framework biểu diễn redirect khác; vẫn phải tài liệu hóa status, cookie, redirect và error outcome.
- Error code ổn định cho unauthenticated, CSRF invalid, forbidden, account pending/disabled, invalid return URL, callback invalid, session revoked/expired, validation và conflict.

## 10. User web

- Nút login bắt đầu flow qua BFF, không tạo authorization URL ở browser và không lưu token trong local/session storage.
- Recovery entry dùng cùng nguyên tắc BFF: thông báo trung tính bất kể account/provider tồn tại, exact redirect, không thu thập/lưu password và không hứa reset credential của Google/social provider.
- Callback page chỉ hiển thị trạng thái tối thiểu; BFF xử lý code và đặt cookie. Không render code/token/claim nhạy cảm vào HTML, URL tiếp theo, telemetry hoặc error message.
- Logout là mutation có CSRF protection, revoke server-side session hiện tại, xóa cookie với cùng attributes và chỉ redirect tới exact URL được phép.
- Account page đọc/sửa đúng field cho phép, phân biệt email với trạng thái verified và không gợi ý email là identity key.
- Session page hiển thị metadata an toàn như thời điểm tạo/gần nhất/hết hạn và phiên hiện tại; revoke có xác nhận, pending state, success/error focus management.
- Sau recovery, UX bắt buộc thực thi behavior đã freeze: yêu cầu đăng nhập lại, rotate hoặc revoke phiên theo decision; không tiếp tục phiên cũ bằng suy đoán.
- Các màn hình có loading/empty/error rõ ràng, keyboard navigation, label, heading order, visible focus, live region phù hợp và không phụ thuộc màu.
- Layout hoạt động ở mobile, tablet và desktop; nội dung dài, locale/timezone và lỗi validation không gây tràn ngang.

## 11. Admin web

- Protected shell kiểm tra session và permission ở server/BFF trước khi tải dữ liệu; client guard và menu ẩn chỉ là UX, không phải authorization.
- Bootstrap admin UI chỉ xuất hiện nếu quy trình một lần đã được duyệt; không nhận email tùy ý để tự cấp quyền và không để endpoint bootstrap mở sau khi hoàn tất.
- Account search dùng tiêu chí contract cho phép, phân trang và tránh enumeration quá mức; detail chỉ trả dữ liệu cần cho nhiệm vụ hỗ trợ.
- Disable/enable yêu cầu reason, hiển thị transition hợp lệ và phản hồi audit correlation; không cung cấp hard delete.
- Revoke session hiển thị scope tác động, xác nhận rõ và không hiển thị token/hash.
- Role/permission foundation trình bày deny-by-default; action thiếu permission phải bị server từ chối ngay cả khi gọi URL/API trực tiếp.
- Bảng admin có caption/accessible name, header đúng, keyboard access, focus sau modal/error và phương án card/scroll có chủ đích ở màn hình hẹp.

## 12. Integration/security

- Cookie session BFF bắt buộc `HttpOnly`, `Secure`, `SameSite` theo quyết định môi trường, path/domain hẹp; chống session fixation bằng session identifier mới sau callback và rotation đã duyệt.
- Mọi state-changing request được bảo vệ CSRF; kiểm tra origin/same-site và token theo policy đã chốt. Không dùng GET để logout/revoke/mutate.
- Return URL/callback/logout exact-match; reject scheme/host/port/path/query không đúng canonical entry, protocol-relative URL, userinfo và encoded bypass.
- Google connection là config gate: secret chỉ ở Auth0/secret manager; bật đúng Auth0 Application, scope tối thiểu `openid profile email`; tắt Action/Management flow tự động hoặc email-based linking.
- Recovery chỉ đi qua Auth0/provider approved flow, exact callback/return allowlist và thông báo chống account enumeration. Talosmine không xử lý password/reset token; Google credential recovery thuộc Google, không được trình bày như password reset do Talosmine/Auth0 database connection sở hữu.
- `(issuer, subject)` là identity key duy nhất. Hai subject cùng email tạo hai mapping/account độc lập theo provisioning policy; không merge ngầm.
- Session, CSRF token, authorization code, ID/access/refresh token và Auth0 client secret không vào database thô, source, log, audit, URL hoặc test fixture.
- Account `pending`/`disabled` không tạo hoặc tiếp tục session theo contract đã freeze; disable phải phối hợp revoke Hub sessions trong Unit of Work/operation có hành vi lỗi rõ ràng.
- P2 không tạo hoặc freeze application/service identity runtime surface; P3 sở hữu baseline `applications` và `service_identities`.

## 13. Contract freeze

Architect phải chốt trước khi ba làn implementation bắt đầu:

1. Route names/methods/status, schemas, pagination, field mutability và machine error codes trong `control-plane.v1.yaml`.
2. Browser sequence login → callback → session, logout, cookie attributes, CSRF exchange và exact return URL normalization.
3. Recovery sequence entry → Auth0/provider → exact return, anti-enumeration envelope, provider distinction và session/re-auth/revoke outcome. Nếu đề xuất loại recovery, contract freeze chỉ được tiếp tục sau khi scope decision, `docs/index.md`, `docs/modular.md`, OpenAPI/browser contract và build plan đã cập nhật nhất quán và được review.
4. State machine account/session, permission IDs, audit action/target schema, P2 account/system-only actor constraint và `operationId + sequence` rules.
5. Transaction boundary provisioning, disable/enable/revoke và race outcome quan sát được.
6. Mock contract không chứa secret cho Auth0/Google/recovery; cách test SDK errors mà không gọi tenant thật.

Sau freeze, thay đổi breaking phải quay lại architect, version/ghi rõ impact và đồng bộ frontend/backend/tests trước khi tiếp tục; không sửa ngầm theo một làn.

## 14. Tests

- OIDC: success, provider denial, missing/duplicate code, invalid/expired `state`/`nonce`, PKCE failure, issuer/audience/signature/expiry lỗi và callback replay.
- Redirect: exact allowlist success; gần giống host/path/port, wildcard, encoded payload, protocol-relative và open redirect đều bị từ chối.
- CSRF/session: thiếu/sai token, cross-site request, fixation trước/sau login, cookie attributes, rotation, expiry, logout, revoke hiện tại/phiên khác và revoked session không hồi sinh.
- Provisioning: hai callback đồng thời cùng `(issuer, subject)` cho đúng một account/mapping, transaction thua không để orphan; callback retry đọc winner.
- Identity: cùng email khác subject không merge; email/email_verified cập nhật nguyên tử; claim thiếu/không boolean không xác minh email.
- Google gate: disabled không hiện/không dùng connection; enabled dùng đúng connection; không secret trong snapshot/log và không automatic account linking.
- Recovery: exact entry/return, provider denial/error, expired/replayed state nếu flow dùng state, anti-enumeration cho email/account/provider khác nhau, Google/provider-owned distinction và session re-auth/rotate/revoke theo decision. E2E fixture không chứa password/credential thật.
- Nếu recovery được loại bằng change set hợp lệ, contract/docs consistency test phải chứng minh `docs/index.md`, `docs/modular.md`, OpenAPI/browser contract và build plan không còn mô tả recovery là capability P2; nếu chưa đạt, recovery test suite vẫn bắt buộc và phase vẫn blocked.
- RBAC/audit: mọi permission thiếu đều `403`; hidden-menu bypass không thành công; reason bắt buộc; audit lỗi rollback mutation; replay operation/sequence tương đương không nhân đôi, khác nội dung conflict.
- P2 schema test xác nhận `csrf_token_hash` không unique, `auth0_sid` partial index không unique, audit chưa có service FK và insert/runtime service actor/value bị từ chối.
- Audit append-only DB tests chạy SQL trực tiếp: dùng migration-test role có quyền mutation để xác nhận `UPDATE` và `DELETE` bị `audit_events_append_only_trg` từ chối, bản ghi không đổi/mất; dùng đúng runtime role để xác nhận `TRUNCATE audit_events` bị PostgreSQL từ chối bởi grants. Đồng thời kiểm tra runtime role không phải owner/migration role và không có `UPDATE`/`DELETE` privilege.
- Migration compatibility test áp dụng P2 actor staging rồi mô phỏng P3 thay actor check/thêm FK; sau upgrade, `audit_events_append_only_trg` vẫn enabled, direct `UPDATE`/`DELETE` vẫn bị chặn và runtime `TRUNCATE` vẫn bị deny.
- UI: keyboard, focus, labels, errors, loading/empty, viewport mobile/tablet/desktop; kiểm tra không rò token trong DOM/URL/log fixture.

## 15. Ordered steps

Runbook dưới đây là **kế hoạch thực thi**, không khẳng định artifact đã tồn tại hoặc lệnh đã chạy. Mạch logic: decisions → contract freeze → parallel impl (backend/frontend/tester) → integration → QA/reviewer. Mỗi bước ghi năm thành phần: **Hành động** / **Sản phẩm** / **Phụ thuộc** / **Verify** / **Lane**.

**Tooling đã chốt.** Tên lệnh trong ô Verify lấy từ bảng script canonical DEC-T15 (`./decision-register.md` mục E); không tự đặt tên khác. Các script này được **tạo ở bước P1.7** — trước P1.7 chúng tồn tại trên giấy và chưa chạy được. Không ô Verify nào dưới đây khẳng định lệnh đã chạy; chỉ QA chạy thật từ clean clone mới tạo evidence.

**Quyết định nghiệp vụ chưa chốt** vẫn ghi `‹cần chốt: ...›` và là blocker cứng của bước liên quan; approver duy nhất là chủ dự án (DEC-G01).

**A. Decisions và contract freeze (tuần tự, chặn mọi bước sau)**

1. Xác nhận exit gate Phase 1 và toàn bộ human decision ở mục 3. Recovery mặc định bắt buộc; chỉ được coi N/A khi scope decision đã cập nhật/review đủ bốn nguồn ở mục 3.
   - **Hành động:** đối chiếu từng mục 3 (Auth0 tenant/issuer/audience/SDK, callback/return URL từng môi trường, session lifetime/rotation/cookie/CSRF policy, provisioning policy, profile-sync policy, bootstrap admin, permission catalog tối thiểu, Google connection, recovery flow/return/anti-enumeration, retention/PII); đánh dấu mục nào còn thiếu.
   - **Sản phẩm:** bản xác nhận decision (do orchestrator/architect giữ), không phải file trong 2 file thuộc lane này.
   - **Phụ thuộc:** Phase 1 exit gate (gồm P1.7 tạo script và P1.12/P1.13 evidence); SDK Auth0 đã chốt tại DEC-T08 nên không còn là blocker; `‹cần chốt: Auth0 tenant/issuer/audience thật (DEC-B03)›`; `‹cần chốt: session/cookie/CSRF/rotation policy›`; `‹cần chốt: bootstrap admin one-time process›`; `‹cần chốt: permission catalog tối thiểu›`; `‹cần chốt: recovery flow + exact return URL›`.
   - **Verify:** mọi mục 3 có giá trị chốt hoặc được ghi `‹cần chốt›`; nếu thiếu decision bắt buộc thì DỪNG tại đây (TẮC), không điền giá trị giả.
   - **Lane:** orchestrator/architect.

2. Architect lập threat model, permission matrix, login/logout/recovery browser sequences, state machine account/session và OpenAPI; review rồi contract freeze theo mục 13.
   - **Hành động:** viết `contracts/openapi/control-plane.v1.yaml` cho `/v1/me/account`, `/v1/me/account/sessions`, admin account/session/role endpoints và machine error codes ở mục 9/18; tài liệu hóa browser-flow `/auth/login|callback|logout` (status, cookie attributes, CSRF exchange, exact return URL normalization) và recovery entry.
   - **Sản phẩm:** `contracts/openapi/control-plane.v1.yaml` (frozen), browser-flow contract, permission matrix, audit action/target schema, `operationId + sequence` rules.
   - **Phụ thuộc:** bước 1.
   - **Verify:** `pnpm openapi:lint` (redocly lint `contracts/openapi/control-plane.v1.yaml`, DEC-T07/T15) kỳ vọng 0 lỗi schema OpenAPI 3.1; `pnpm openapi:types` + `pnpm openapi:drift` kỳ vọng type sinh lại khớp bản đã commit; mọi route/method/status/error code có định nghĩa; ba làn xác nhận đủ để implement; breaking change sau freeze phải quay lại architect.
   - **Lane:** architect (OpenAPI owner do orchestrator chỉ định để tránh ghi đồng thời).

**B. Backend — migrations theo thứ tự phụ thuộc (lane backend, chỉ sau freeze)**

3. Tạo migration nền: schema `control_plane`, migration role và runtime role, grants tối thiểu.
   - **Hành động:** viết forward migration tạo schema `control_plane`; tạo migration/owner role và runtime role tách biệt; cấp runtime role chỉ `SELECT`/`INSERT` theo ownership, cấm `UPDATE`/`DELETE`/`TRUNCATE` trên `audit_events`.
   - **Sản phẩm:** `apps/control-plane/drizzle/migrations/` (migration 0001 nền schema/roles/grants).
   - **Phụ thuộc:** bước 2.
   - **Verify:** `pnpm db:generate` sinh migration từ schema, rồi `pnpm db:migrate` (drizzle-kit 0.31.10, DEC-T09/T15) apply forward trên database rỗng bằng **role migration nối trực tiếp PostgreSQL, không qua Supavisor**; `\dn` cho thấy schema `control_plane`; `SELECT current_user` trong runtime connection khác migration/owner role.
   - **Lane:** backend.

4. Tạo migration `accounts`.
   - **Hành động:** tạo `control_plane.accounts` với `id uuid` application-generated, profile typed (`display_name`, `email`, `email_verified`, `locale`, `timezone`), status `pending|active|disabled`; named checks `accounts_status_check`, `accounts_disabled_state_check`, `accounts_email_verified_check`, `accounts_locale_check`, `accounts_timezone_check`; index `accounts_status_idx`; không unique `email`/`display_name`.
   - **Sản phẩm:** `apps/control-plane/drizzle/migrations/` (migration `accounts`).
   - **Phụ thuộc:** bước 3.
   - **Verify:** migration smoke trên DB rỗng; insert hợp lệ pass, `disabled` không `disabled_at` bị check từ chối, `email_verified = true` khi `email IS NULL` bị từ chối; không tồn tại unique index trên `email`/`display_name`.
   - **Lane:** backend.

5. Tạo migration `external_identities`.
   - **Hành động:** tạo `external_identities` với FK `account_id REFERENCES accounts(id) ON DELETE RESTRICT`, provider baseline `auth0`, unique `external_identities_issuer_subject_key (issuer, subject)`, checks provider/issuer/subject non-empty, index `external_identities_account_idx`; không có index/unique liên kết theo email.
   - **Sản phẩm:** `apps/control-plane/drizzle/migrations/` (migration `external_identities`).
   - **Phụ thuộc:** bước 4.
   - **Verify:** migration smoke; hai row cùng `(issuer, subject)` bị unique từ chối; xóa `accounts` còn identity bị `RESTRICT`; không có unique nào trên email.
   - **Lane:** backend.

6. Tạo migration `web_sessions`.
   - **Hành động:** tạo `web_sessions` với `session_token_hash bytea` unique (`web_sessions_token_hash_key`), `csrf_token_hash bytea` **bắt buộc nhưng không unique**, `auth0_sid` nullable với partial index `web_sessions_auth0_sid_idx ... WHERE auth0_sid IS NOT NULL` (không unique), DB-clock timestamps, `web_sessions_expiry_check`, `web_sessions_revocation_check`, active index `web_sessions_account_active_idx (account_id, expires_at) WHERE revoked_at IS NULL`; không lưu token/cookie/CSRF thô.
   - **Sản phẩm:** `apps/control-plane/drizzle/migrations/` (migration `web_sessions`).
   - **Phụ thuộc:** bước 4.
   - **Verify:** migration smoke; chỉ `session_token_hash` unique; `csrf_token_hash` cho phép trùng; `auth0_sid` partial index tồn tại và không unique; `expires_at <= created_at` bị từ chối.
   - **Lane:** backend.

7. Tạo migration Admin RBAC: `admin_roles` → `admin_role_permissions` → `admin_role_assignments`.
   - **Hành động:** tạo `admin_roles` (unique `key`, status `active|inactive`), `admin_role_permissions` (unique `(admin_role_id, permission)`, named check danh sách permission đã duyệt), `admin_role_assignments` (validity/revoke triple checks, `admin_role_assignments_lookup_idx`); permission list khóa bằng named check theo mục 3.
   - **Sản phẩm:** `apps/control-plane/drizzle/migrations/` (migration admin RBAC).
   - **Phụ thuộc:** bước 4; `‹cần chốt: permission catalog tối thiểu›` cho named check.
   - **Verify:** migration smoke; permission ngoài danh sách bị named check từ chối; assignment trùng khoảng hiệu lực do service ngăn (test ở bước tester).
   - **Lane:** backend.

8. Tạo migration `audit_events` staging P2 + append-only trigger + runtime grants.
   - **Hành động:** tạo `audit_events` theo canonical shape nhưng với **P2 actor check** chỉ chấp nhận `account|system` (cột `actor_service_identity_id` nullable, **chưa FK**, runtime yêu cầu `IS NULL`); unique `audit_events_operation_sequence_key (operation_id, sequence)`; details shape/size checks; tạo trigger `audit_events_append_only_trg BEFORE UPDATE OR DELETE` từ chối mutation; xác nhận runtime grants cấm `UPDATE`/`DELETE`/`TRUNCATE`.
   - **Sản phẩm:** `apps/control-plane/drizzle/migrations/` (migration audit staging + trigger).
   - **Phụ thuộc:** bước 7 (audit foundation đi sau admin roles); tôn trọng phased P2->P3: P2 chưa tạo `service_identities`/FK.
   - **Verify:** evidence SQL trực tiếp — dùng migration-test role thực `UPDATE`/`DELETE` trên `audit_events` bị `audit_events_append_only_trg` từ chối; dùng runtime role thực `TRUNCATE audit_events` bị grants từ chối; insert `actor_type = 'service'` hoặc `actor_service_identity_id` non-null bị check/runtime từ chối; `account`/`system` shape hợp lệ pass.
   - **Lane:** backend.

9. Viết migration/compatibility tests P2 trước repository/use case.
   - **Hành động:** viết test khẳng định constraint existence/name, `csrf_token_hash` không unique, `auth0_sid` partial index không unique, audit chưa có service FK và từ chối service actor/value; mô phỏng nâng cấp P3 (thêm FK + đổi actor check) và khẳng định trigger/grants vẫn còn hiệu lực.
   - **Sản phẩm:** migration tests trong `tests/**` (owner tester phối hợp; backend cung cấp fixture SQL).
   - **Phụ thuộc:** bước 8.
   - **Verify:** `pnpm test` (Vitest 4.1.10, DEC-T05/T15) chạy migration/compatibility suite trên **PostgreSQL thật qua testcontainers 12.0.4 + @testcontainers/postgresql 12.0.4** — constraint/index/trigger là hành vi của PostgreSQL nên không mock được. Script có sau P1.7; nếu chưa tồn tại thì báo đúng sự thật, không tạo config giả để lệnh chạy được.
   - **Lane:** tester (fixture do backend cấp).

**C. Backend — ports, use cases, controllers (lane backend)**

10. Hiện thực public ports, shared Unit of Work provisioning và transactional audit.
    - **Hành động:** trong `apps/control-plane/src/modules/account` và `apps/control-plane/src/modules/identity`, viết Account provisioning port và Identity resolve-by-`(issuer, subject)`; mở một PostgreSQL transaction tạo `accounts` (`pending`) rồi insert `external_identities`; thua unique race thì rollback toàn transaction (kể cả account) và retry đọc winner; append audit qua `AuditAppendPort` cùng UoW với `operationId + sequence`.
    - **Sản phẩm:** module identity/account (ports, repositories, use cases).
    - **Phụ thuộc:** bước 8, 9.
    - **Verify:** unit/integration test provisioning race (bước 15) pass; không tạo account orphan; audit lỗi rollback mutation.
    - **Lane:** backend.

11. Tích hợp Auth0 SDK, exact redirect validator, session hash/CSRF/revoke, recovery redirect và Google config gate.
    - **Hành động:** wiring Auth0 SDK trong module identity/BFF boundary: verify code flow (PKCE, `state`, `nonce`, issuer, audience, signature, expiry) trước provisioning/session; canonicalize + exact-match allowlist cho return/callback/logout; sinh session token/CSRF token, chỉ lưu hash; revoke server-side; recovery redirect tới approved Auth0 flow với anti-enumeration; Google connection gate không secret.
    - **Sản phẩm:** identity/session integration code trong `apps/control-plane/src/modules/identity` và BFF boundary.
    - **Phụ thuộc:** bước 10; SDK đã chốt (DEC-T08: `@auth0/nextjs-auth0@4.25.0` ở BFF, `jose@6.2.3` verify JWT ở Control Plane — Control Plane **không** lưu client secret); `‹cần chốt: Auth0 tenant/issuer/audience thật (DEC-B03)›`; `‹cần chốt: recovery flow/entry/return URL›`; `‹cần chốt: cookie/CSRF/rotation policy›`.
    - **Verify:** `pnpm test` chạy OIDC/redirect/CSRF/recovery tests (bước 15) pass; `pnpm typecheck` sạch; không secret/token trong log/DB/URL. Wiring chỉ dùng SDK đã chốt; nếu thiếu tenant thật thì test chạy trên mock contract (mục 13.6) và DỪNG (TẮC) trước khi wiring tenant.
    - **Lane:** backend.

12. Viết controllers theo frozen contract cho account, session và admin, với RBAC guard server-side.
    - **Hành động:** `GET/PATCH /v1/me/account` (field allowlist, không cho user sửa `status`/`email_verified`); `GET /v1/me/account/sessions`, `DELETE /v1/me/account/sessions/{sessionId}` (kiểm ownership); admin account search/detail/disable/enable (reason bắt buộc, audit transaction); admin session list/revoke (không trả hash/token); admin role read + mutation tối thiểu; guard authorize deny-by-default server-side trong `apps/control-plane/src/modules/admin`.
    - **Sản phẩm:** controllers + RBAC guard trong module account/admin.
    - **Phụ thuộc:** bước 10, 11; contract bước 2.
    - **Verify:** contract test khớp OpenAPI; mọi permission thiếu trả `403` kể cả gọi API trực tiếp; disable phối hợp revoke session trong UoW.
    - **Lane:** backend.

**D. Frontend (lane frontend, song song sau freeze)**

13. Xây BFF auth feature và user flows chỉ dựa trên frozen contract.
    - **Hành động:** trong `apps/web/src/bff/auth/features` dựng route BFF `/auth/login`, `/auth/callback`, `/auth/logout` và recovery entry; login khởi động flow qua BFF (không tạo authorization URL ở browser, không lưu token client); callback page hiển thị trạng thái tối thiểu; logout là mutation có CSRF, revoke session, xóa cookie; trong `apps/web/app/(user)` và `apps/web/app/auth` dựng account page và session list page.
    - **Sản phẩm:** `apps/web/src/bff/auth/features`, `apps/web/app/auth`, `apps/web/app/(user)`.
    - **Phụ thuộc:** bước 2 (frozen contract). Không truy cập DB hoặc đổi backend contract ngầm.
    - **Verify:** e2e/UI tests (bước 15); không token/claim trong DOM/URL/log; keyboard/focus/label đạt; layout mobile/tablet/desktop không tràn ngang.
    - **Lane:** frontend.

14. Xây protected admin shell và account/session/RBAC foundation UI.
    - **Hành động:** trong `apps/web/app/admin` dựng shell kiểm session + permission ở server/BFF trước khi tải dữ liệu; account search/detail, disable/enable (reason), session revoke (hiển thị scope, không hiện token/hash); bootstrap admin UI chỉ hiện nếu one-time process đã duyệt; menu ẩn/client guard chỉ là UX.
    - **Sản phẩm:** `apps/web/app/admin`.
    - **Phụ thuộc:** bước 2; `‹cần chốt: bootstrap admin one-time process›`.
    - **Verify:** UI tests (bước 15); action thiếu permission bị server từ chối dù gọi URL/API trực tiếp; bảng có caption/header/keyboard/focus, responsive card/scroll ở màn hình hẹp.
    - **Lane:** frontend.

**E. Tester (lane tester, song song sau freeze)**

15. Viết/chạy contract, integration, concurrency, security và accessibility/responsive tests trên `tests/**`.
    - **Hành động:** viết OIDC/redirect/CSRF/session/provisioning-race/identity/Google-gate/recovery/RBAC-audit tests và schema/append-only/P3-upgrade tests theo mục 14; không sửa test để che lỗi code.
    - **Sản phẩm:** `tests/**`.
    - **Phụ thuộc:** bước 2 (contract); fixture backend bước 9; không sửa sản phẩm.
    - **Verify:** `pnpm test` (Vitest, unit + integration trên PostgreSQL thật qua testcontainers) và `pnpm test:e2e` (Playwright 1.61.1 — keyboard/focus, responsive viewport, không rò token trong DOM/URL). Test fail thì trả về backend/frontend sửa code, cấm nới assertion; script có sau P1.7, chưa tồn tại thì báo đúng sự thật.
    - **Lane:** tester.

**F. Integration**

16. Tích hợp ba làn, chạy migration dry-run và lưu evidence SQL, rồi chạy build/test/lint/typecheck bằng lệnh thật.
    - **Hành động:** hợp nhất ba làn trên path rời nhau; chạy migration dry-run trên DB rỗng; lưu evidence SQL trực tiếp cho `audit_events_append_only_trg`, runtime grants và mô phỏng P3 FK/check upgrade; chạy build/test/lint/typecheck.
    - **Sản phẩm:** evidence run (log/output thật), không tạo config giả để lệnh tồn tại.
    - **Phụ thuộc:** bước 12, 14, 15.
    - **Verify:** chạy theo thứ tự và dán output thật: `pnpm install --frozen-lockfile` → `pnpm typecheck` → `pnpm lint` → `pnpm openapi:lint` + `pnpm openapi:drift` → `pnpm db:migrate` (DB rỗng, role migration nối trực tiếp) → `pnpm test` → `pnpm test:e2e` → `pnpm build`. Kỳ vọng tất cả exit 0, lockfile không lệch, drift test không báo khác biệt. Lệnh chỉ chạy được sau P1.7; chưa tồn tại thì báo đúng sự thật theo AGENTS.md, không tạo config giả để lệnh tồn tại.
    - **Lane:** orchestrator/integration.

**G. QA và reviewer**

17. QA và reviewer kiểm độc lập; owner sửa mục bắt buộc theo giới hạn ba vòng. Chỉ qua exit gate khi cả hai sign-off.
    - **Hành động:** QA xác minh output thật + evidence SQL; reviewer kiểm ownership/transaction/redirect/RBAC/phased audit theo mục 20.
    - **Sản phẩm:** QA/reviewer sign-off có gắn commit/environment/evidence.
    - **Phụ thuộc:** bước 16.
    - **Verify:** QA **PASS** và reviewer hết mục “phải sửa” → ĐẠT; cùng lỗi lặp lần hai → TẮC; hết ba vòng chưa đạt → CẠN LƯỢT. QA/reviewer không sửa file.
    - **Lane:** qa, reviewer.

## 16. Parallel lanes và ownership

Chỉ bắt đầu song song **sau contract freeze**:

| Làn | Owner | Path được sở hữu | Không được làm |
|---|---|---|---|
| Backend | `subagent/backend` | `apps/control-plane/src/modules/identity`, `account`, `admin`; `apps/control-plane/drizzle/migrations/`; phần backend contract được giao | Không tạo application/service identity trong P2; không sửa web/test để làm pass |
| Frontend | `subagent/frontend` | `apps/web/app/(user)`, `apps/web/app/auth`, `apps/web/app/admin`, `apps/web/src/bff/auth/features` | Không truy cập DB/đổi backend contract ngầm |
| Tester | `subagent/tester` | `tests/**` | Không sửa sản phẩm; không nới assertion theo lỗi implementation |

OpenAPI có một owner tích hợp do orchestrator chỉ định trước freeze để tránh ghi đồng thời. QA/reviewer chỉ kiểm chứng, không sửa. Nếu một làn cần chạm path của làn khác, dừng và trả về orchestrator.

## 17. Checklist

- [ ] **functional:** login/callback/logout/recovery, account/profile/session và admin search/detail/disable/enable/revoke đạt acceptance cases bằng test; chỉ được đánh dấu recovery N/A khi approved scope change đã cập nhật/review đủ bốn nguồn bắt buộc.
- [ ] **security:** PKCE/`state`/`nonce`, exact redirect, recovery anti-enumeration/provider distinction, CSRF, secure cookie, fixation/revoke, deny-by-default RBAC và no-email-link đều có negative test; nếu recovery bị loại hợp lệ, có evidence review thay cho recovery runtime tests.
- [ ] **db:** migration rỗng thành công; chỉ session hash unique, CSRF hash không unique, `auth0_sid` non-unique partial index; audit actor service nullable nhưng chưa FK và bị runtime/check từ chối; có evidence DB trực tiếp rằng `audit_events_append_only_trg` chặn `UPDATE`/`DELETE`, runtime grants chặn `TRUNCATE` và runtime không dùng owner/migration role; mô phỏng P3 FK/check upgrade không làm mất trigger/grants; không raw password/reset/session/token/secret.
- [ ] **concurrency:** test barrier với ít nhất hai callback cùng identity chỉ tạo một account/mapping và không orphan; concurrent revoke/rotate không hồi sinh session.
- [ ] **accessibility:** login/recovery/account/admin chỉ bàn phím hoàn tất; focus/error announcement và accessible name được test.
- [ ] **responsive:** login/recovery/account/session/admin hoạt động tại viewport mobile, tablet, desktop đã chốt, không mất action hoặc tràn ngang ngoài vùng table chủ đích.
- [ ] **observability:** correlation ID xuyên BFF/API/audit; metric cho callback/recovery outcome, session revoke và RBAC deny; recovery logs không tạo existence signal và không chứa secret/PII thừa.
- [ ] **rollback:** migration/application rollback rehearsal có kết quả; rollback/forward-fix không vô hiệu hóa `audit_events_append_only_trg` hoặc cấp lại quyền mutation audit cho runtime; release cũ không đọc schema không tương thích; Google/recovery connection và bootstrap endpoint có cách disable an toàn.
- [ ] **docs:** OpenAPI, login/logout/recovery browser-flow, permission matrix, env placeholders và runbook đồng bộ; nếu loại recovery, `docs/index.md`, `docs/modular.md`, OpenAPI/browser contract và build plan đều đã cập nhật/review, không còn mô tả scope cũ.

## 18. Exit gate

Phase 2 chỉ đạt khi: contract không còn breaking mismatch; migrations/tests bắt buộc pass; Hub login/account/session/admin security hoạt động theo môi trường kiểm chứng; recovery flow đạt approved behavior với anti-enumeration và hậu recovery session tests, **hoặc** approved scope decision loại recovery đã được phản ánh và review đồng bộ trong `docs/index.md`, `docs/modular.md`, OpenAPI/browser contract và build plan. Chỉ có scope decision nhưng chưa cập nhật/review đủ nguồn thì không qua exit gate và P2 vẫn `blocked`. Ngoài ra, mọi admin mutation phải được server authorize và audit atomically; provisioning race không orphan/duplicate; P2 chưa chấp nhận service audit actor; evidence SQL trực tiếp phải chứng minh `audit_events_append_only_trg` chặn `UPDATE`/`DELETE`, runtime grants chặn `TRUNCATE`, runtime không dùng migration/owner role và P3 FK/check upgrade không làm mất các bảo vệ này; không có password/reset/session/token/secret thô; QA **PASS** và reviewer không còn mục “phải sửa”. Cross-domain sample app full E2E không phải gate này và vẫn chờ Phase 6.

## 19. Stop/rollback

- Dừng ngay nếu thiếu Auth0 credential/quyền tenant, SDK chưa được phê duyệt, callback URL/bootstrap admin/session/recovery policy chưa chốt, hoặc contract giữa lanes mâu thuẫn.
- Dừng tại contract/exit gate nếu có đề xuất loại recovery nhưng `docs/index.md`, `docs/modular.md`, OpenAPI/browser contract hoặc build plan chưa được cập nhật và review; không dùng scope decision đơn lẻ để bỏ capability.
- Dừng release nếu phát hiện open redirect, CSRF bypass, session fixation/revival, account auto-link theo email, admin API không enforce server-side, audit có thể commit thiếu hoặc secret bị log/lưu.
- Dừng migration/release nếu `audit_events_append_only_trg` thiếu/disabled, direct SQL có thể `UPDATE`/`DELETE`, runtime role có thể `TRUNCATE` hoặc đang dùng owner/migration credential, hay thử nghiệm P3 FK/check upgrade làm mất append-only trigger/grants.
- Khi migration chưa phát hành: sửa forward migration theo quy trình review. Khi đã có dữ liệu: không drop/hard-delete tự động, không tắt trigger hoặc nới grant để rollback; rollback application/config trước, vô hiệu hóa route/Google connection nếu cần và dùng migration bù đã review nhưng vẫn giữ append-only protection.
- Nếu provisioning/audit transaction lỗi, rollback toàn Unit of Work; không “sửa” bằng tạo mapping/account/audit rời sau commit.
- Tuân thủ tối đa ba vòng kiểm chứng; cùng lỗi lặp lần hai thì khai báo TẮC với việc đã thử và quyết định cần người dùng.

## 20. QA/reviewer sign-off

- **QA:** xác minh output thật của migration/test/lint/typecheck/build hiện có, gồm evidence SQL trực tiếp cho `audit_events_append_only_trg`, runtime grants và mô phỏng P3 FK/check upgrade; đồng thời kiểm login/recovery browser security, phased audit schema, race tests, responsive/accessibility và secret. Không suy diễn lệnh chưa tồn tại.
- **Reviewer:** kiểm ownership module, transaction boundaries, exact redirect, recovery anti-enumeration/provider behavior, identity key, profile scope, deny-by-default RBAC, P2 account/system-only audit actor, audit atomicity, tách runtime khỏi migration/owner role và việc P3 upgrade không làm yếu append-only protection; đối chiếu OpenAPI/UI/test.
- Ghi sign-off bằng bằng chứng run/commit/environment đã kiểm; không dùng người viết implementation tự tuyên bố đạt.
- Kết quả vòng kiểm chứng: **ĐẠT** khi QA PASS và reviewer hết mục bắt buộc; **TẮC** khi cần quyết định/phụ thuộc ngoài; **CẠN LƯỢT** sau ba vòng chưa đạt. Các kết quả này không tự đổi phase status.
