# Phase 2 — Identity, Account và nền tảng bảo mật Admin

## 1. Trạng thái

`blocked` — Phase này phụ thuộc exit gate Phase 1 và các human decision ở mục 3. Đây là kế hoạch, chưa phải implementation; mọi đường dẫn là target dự kiến. `TẮC` và `CẠN LƯỢT` là kết quả của vòng kiểm chứng theo `AGENTS.md`, không phải phase status và không thay thế một trong bốn status canonical.

## 2. Mục tiêu

- Hoàn thiện đăng nhập Hub qua Auth0 managed bằng OIDC Authorization Code, SDK được phê duyệt, PKCE, `state` và `nonce`.
- Cung cấp entry flow khôi phục quyền truy cập do Auth0 sở hữu, không tự lưu password hoặc tự xây hệ thống reset credential.
- Tạo Account và External Identity an toàn theo khóa `(issuer, subject)`, không liên kết bằng email, kể cả email đã xác minh.
- Cung cấp phiên BFF phía server, trang tài khoản/phiên và khả năng logout/revoke có hiệu lực tại Hub.
- Đặt nền RBAC và audit để Admin quản lý account/session theo nguyên tắc deny-by-default.
- Đóng băng hợp đồng browser/BFF/API đủ cho frontend, backend và tester làm song song.

Exit của phase này chỉ xác nhận auth/account/admin security của **Hub**. Luồng SSO full E2E xuyên domain với app mẫu được hoãn tới Phase 6.

## 3. Prerequisites và human decisions

Phải chốt và ghi lại trước bước contract freeze:

- Auth0 tenant/domain, issuer canonical, audience, Hub Application và SDK Auth0 cụ thể được phê duyệt; không tự chọn package.
- Exact callback URL, post-logout URL và tập return URL của Hub theo từng môi trường; không wildcard, prefix-match hoặc fallback mở.
- Lifetime tuyệt đối/nhàn rỗi, rotation policy, hash algorithm và revoke SLA của web session; tên cookie và policy CSRF tương thích BFF.
- Provisioning policy chuyển account `pending -> active`; callback không được tự mặc định kích hoạt nếu policy chưa duyệt.
- Profile-sync policy: lần đầu có thể nhận claim đã xác minh; lần đăng nhập sau có hay không ghi đè trường user đã sửa.
- Bootstrap admin: danh tính nào được gán role đầu tiên, ai phê duyệt, cơ chế một lần, cách vô hiệu hóa sau bootstrap và bằng chứng audit. Không có super-admin mặc định.
- Danh mục permission tối thiểu cho account read, disable, enable, session read/revoke, role read/manage và audit read.
- Google social connection có được bật hay không, Google OAuth credential owner, secret store, callback do Auth0 cung cấp và danh sách môi trường được phép.
- Recovery access mặc định là capability bắt buộc của P2. Chốt Auth0 approved recovery flow/entry URL, exact return URL, anti-enumeration response, yêu cầu re-authentication và hành vi revoke/rotate Hub sessions sau recovery.
- Chỉ được loại recovery khỏi MVP khi đồng thời có: (1) scope decision được owner/approver ký; (2) `docs/index.md` và `docs/modular.md` đã được cập nhật để không còn yêu cầu hành vi cũ; (3) OpenAPI/browser contract và build plan liên quan đã được cập nhật; (4) toàn bộ change set đã qua review. Thiếu bất kỳ điều kiện nào thì recovery vẫn bắt buộc và P2 giữ `blocked`.
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
- UI: keyboard, focus, labels, errors, loading/empty, viewport mobile/tablet/desktop; kiểm tra không rò token trong DOM/URL/log fixture.

## 15. Ordered steps

1. Xác nhận prerequisites. Recovery được coi là bắt buộc trừ khi scope decision và toàn bộ source/contract/build-plan updates đã được review; dừng nếu thiếu SDK/config/bootstrap/revoke/recovery decision bắt buộc.
2. Architect lập threat model, permission matrix, login/logout/recovery browser sequences và OpenAPI; review rồi contract freeze.
3. Backend tạo migration Account/Identity/Admin/Audit với P2 phased audit constraint, constraints/indexes và migration tests trước repository/use case; không tạo service identity/application.
4. Backend hiện thực public ports, shared Unit of Work provisioning và transactional audit; sau đó controllers theo contract.
5. Backend tích hợp Auth0 SDK đã duyệt, exact redirect validator, session hash/CSRF/revoke, recovery redirect/config và Google config gate không secret.
6. Frontend xây BFF auth feature và user flows chỉ dựa trên frozen contract.
7. Frontend xây protected admin shell và account/session/RBAC foundation; không dựa vào menu để cấp quyền.
8. Tester viết/chạy contract, integration, concurrency, security và accessibility/responsive tests trên lane riêng; không sửa test để che lỗi code.
9. Tích hợp ba làn, chạy migration dry-run, test/lint/typecheck/build bằng lệnh thật sau khi repo bootstrap; nếu lệnh chưa tồn tại thì báo đúng sự thật.
10. QA và reviewer kiểm độc lập; owner sửa mục bắt buộc tối đa theo vòng lặp dự án. Chỉ qua exit gate khi cả hai sign-off.

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
- [ ] **db:** migration rỗng thành công; chỉ session hash unique, CSRF hash không unique, `auth0_sid` non-unique partial index; audit actor service nullable nhưng chưa FK và bị runtime/check từ chối; không raw password/reset/session/token/secret.
- [ ] **concurrency:** test barrier với ít nhất hai callback cùng identity chỉ tạo một account/mapping và không orphan; concurrent revoke/rotate không hồi sinh session.
- [ ] **accessibility:** login/recovery/account/admin chỉ bàn phím hoàn tất; focus/error announcement và accessible name được test.
- [ ] **responsive:** login/recovery/account/session/admin hoạt động tại viewport mobile, tablet, desktop đã chốt, không mất action hoặc tràn ngang ngoài vùng table chủ đích.
- [ ] **observability:** correlation ID xuyên BFF/API/audit; metric cho callback/recovery outcome, session revoke và RBAC deny; recovery logs không tạo existence signal và không chứa secret/PII thừa.
- [ ] **rollback:** migration/application rollback rehearsal có kết quả; release cũ không đọc schema không tương thích; Google/recovery connection và bootstrap endpoint có cách disable an toàn.
- [ ] **docs:** OpenAPI, login/logout/recovery browser-flow, permission matrix, env placeholders và runbook đồng bộ; nếu loại recovery, `docs/index.md`, `docs/modular.md`, OpenAPI/browser contract và build plan đều đã cập nhật/review, không còn mô tả scope cũ.

## 18. Exit gate

Phase 2 chỉ đạt khi: contract không còn breaking mismatch; migrations/tests bắt buộc pass; Hub login/account/session/admin security hoạt động theo môi trường kiểm chứng; recovery flow đạt approved behavior với anti-enumeration và hậu recovery session tests, **hoặc** approved scope decision loại recovery đã được phản ánh và review đồng bộ trong `docs/index.md`, `docs/modular.md`, OpenAPI/browser contract và build plan. Chỉ có scope decision nhưng chưa cập nhật/review đủ nguồn thì không qua exit gate và P2 vẫn `blocked`. Ngoài ra, mọi admin mutation phải được server authorize và audit atomically; provisioning race không orphan/duplicate; P2 chưa chấp nhận service audit actor; không có password/reset/session/token/secret thô; QA **PASS** và reviewer không còn mục “phải sửa”. Cross-domain sample app full E2E không phải gate này và vẫn chờ Phase 6.

## 19. Stop/rollback

- Dừng ngay nếu thiếu Auth0 credential/quyền tenant, SDK chưa được phê duyệt, callback URL/bootstrap admin/session/recovery policy chưa chốt, hoặc contract giữa lanes mâu thuẫn.
- Dừng tại contract/exit gate nếu có đề xuất loại recovery nhưng `docs/index.md`, `docs/modular.md`, OpenAPI/browser contract hoặc build plan chưa được cập nhật và review; không dùng scope decision đơn lẻ để bỏ capability.
- Dừng release nếu phát hiện open redirect, CSRF bypass, session fixation/revival, account auto-link theo email, admin API không enforce server-side, audit có thể commit thiếu hoặc secret bị log/lưu.
- Khi migration chưa phát hành: sửa forward migration theo quy trình review. Khi đã có dữ liệu: không drop/hard-delete tự động; rollback application/config trước, vô hiệu hóa route/Google connection nếu cần và dùng migration bù đã review.
- Nếu provisioning/audit transaction lỗi, rollback toàn Unit of Work; không “sửa” bằng tạo mapping/account/audit rời sau commit.
- Tuân thủ tối đa ba vòng kiểm chứng; cùng lỗi lặp lần hai thì khai báo TẮC với việc đã thử và quyết định cần người dùng.

## 20. QA/reviewer sign-off

- **QA:** xác minh output thật của migration/test/lint/typecheck/build hiện có, login/recovery browser security, phased audit schema, race tests, responsive/accessibility và kiểm tra secret; không suy diễn lệnh chưa tồn tại.
- **Reviewer:** kiểm ownership module, transaction boundaries, exact redirect, recovery anti-enumeration/provider behavior, identity key, profile scope, deny-by-default RBAC, P2 account/system-only audit actor, audit atomicity và mức khớp OpenAPI/UI/test.
- Ghi sign-off bằng bằng chứng run/commit/environment đã kiểm; không dùng người viết implementation tự tuyên bố đạt.
- Kết quả vòng kiểm chứng: **ĐẠT** khi QA PASS và reviewer hết mục bắt buộc; **TẮC** khi cần quyết định/phụ thuộc ngoài; **CẠN LƯỢT** sau ba vòng chưa đạt. Các kết quả này không tự đổi phase status.
