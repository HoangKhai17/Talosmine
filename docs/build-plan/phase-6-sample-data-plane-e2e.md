# Phase 6 — Sample Data Plane end-to-end

> Tài liệu này là kế hoạch triển khai, không xác nhận code, cấu hình, migration, credential, môi trường hay test nào đã tồn tại hoặc đang chạy.

## 1. Trạng thái

- **Trạng thái:** `blocked`
- **Cổng vào bắt buộc:** Phase 5 phải được QA và reviewer xác nhận **PASS**; mọi mục phải sửa của Phase 5 đã đóng.
- **Decision gate:** nếu sample app, runtime hoặc framework của sample app chưa được phê duyệt, dừng tại bước lựa chọn. Không tự chọn và chưa tạo `integrations/sample-data-plane/`.
- **Cổng hoàn tất:** một ứng dụng đại diện thật đi trọn luồng Hub/direct URL → SSO → local enforcement → entitlement → reserve → nghiệp vụ → commit/cancel, có bằng chứng test và rollback.

## 2. Mục tiêu

1. Chứng minh hợp đồng Control Plane–Data Plane hoạt động end-to-end với một ứng dụng đại diện thật.
2. Chặn mọi đường truy cập được bảo vệ tại backend, kể cả URL trực tiếp, API, action và worker.
3. Chứng minh hard quota không bị bypass, double-spend hoặc tính hai lần khi retry/timeout.
4. Chứng minh Hub chỉ launch và quản lý, không proxy business traffic của sample app.
5. Tạo mẫu onboarding có thể kiểm chứng cho Phase 7 mà không nhúng plan name, quota cục bộ hoặc policy thương mại vào app.

## 3. Prerequisites và human decisions

- [ ] Có biên bản Phase 5 QA PASS và reviewer không còn mục phải sửa.
- [ ] Chủ sản phẩm và chủ ứng dụng phê duyệt sample app dựa trên mức đại diện, mức rủi ro và khả năng dựng môi trường; ghi rõ app repo nằm trong hay ngoài monorepo.
- [ ] Runtime/framework của sample app được phê duyệt. Việc phê duyệt stack Control Plane không mặc nhiên phê duyệt stack cho Data Plane mẫu.
- [ ] Chốt cơ chế phân phối tích hợp: adapter trong app repo, package qua registry đã duyệt, hoặc generated client từ OpenAPI. Không tạo package/registry tạm thời nếu chưa có quyết định.
- [ ] Chốt Auth0 tenant/environment, application loại phù hợp cho user flow, API audience, exact callback/logout URL và M2M client riêng của backend.
- [ ] Chốt từng stable `applicationKey`, `featureKey`, `metricKey`, unit, quantity, counting point, failure treatment, window/timezone, reservation TTL, late-success và retry/retention semantics.
- [ ] Chốt domain authorization mapping, revoke SLA, local-session lifetime/invalidation, outage policy và kill-switch owner.
- [ ] Chốt semantics app-side cho durable logical operation: state machine, atomic claim/transition, lease/recovery nếu có worker cạnh tranh hoặc process có thể chết, bằng chứng xác nhận side effect, và quy tắc reconciliation cho từng crash window.
- [ ] Chốt test accounts/subscriptions bằng dữ liệu được kiểm soát; không dùng quota, plan hoặc quyền giả định.

Thiếu bất kỳ quyết định nào ảnh hưởng hành vi thì Phase 6 tiếp tục ở trạng thái `blocked`; ghi rõ quyết định cần có và không code quanh blocker.

## 4. Phạm vi

- Inventory toàn bộ protected route, endpoint, server action, mutation, worker/job, webhook/internal trigger liên quan, domain authorization và đường truy cập trực tiếp của sample app.
- SSO khi launch từ Hub và khi mở URL app trực tiếp; Data Plane tạo/kiểm tra phiên cục bộ theo thiết kế đã duyệt.
- Xác minh local user token/session, `issuer`, `audience`, expiry và subject; backend app dùng M2M identity riêng khi gọi Control Plane.
- Exact feature/metric scopes: `entitlement:decide` theo feature và `quota:reserve|commit|cancel|read` theo metric.
- Enforcement theo thứ tự phù hợp: authentication, domain authorization, entitlement và reserve trước hành động có tính lượt; commit/cancel đúng counting semantics.
- Tác vụ bất đồng bộ lưu và truyền reservation ID cùng operation/idempotency context; timeout dùng status/retry cùng key.
- Sample app phải có durable operation state trong datastore của chính app, keyed bằng unique logical operation/idempotency key. Claim và transition giữa `pending`, `processing`, `succeeded`, `failed` hoặc state machine tương đương đã duyệt phải nguyên tử; persist reservation ID, lease/recovery metadata cần thiết và bằng chứng side effect trước khi retry/reconcile.
- Side effect bất khả nghịch phải idempotent theo logical operation. Idempotency của Quota chỉ bảo vệ mutation quota, **không** bảo đảm business side effect exactly once.
- UX launch, denial, hết quota, lỗi phụ thuộc và trạng thái đang xử lý trên Hub/sample app.
- E2E, contract, security, bypass, revoke, concurrency, timeout và rollback drill.

## 5. Ngoài phạm vi

- Onboard đồng loạt các app còn lại; việc đó thuộc Phase 7.
- Billing, payment provider, giá, refund hoặc paid subscription automation.
- Bắt buộc API gateway hoặc chuyển business traffic qua Hub.
- Đưa dữ liệu domain của app vào Control Plane hoặc để Hub xử lý nghiệp vụ app.
- Tự chọn sample app/runtime/framework, quota, plan, metric, timeout, retry hay outage default.
- Tạo local quota ledger, sao chép policy/plan name vào adapter, hoặc tin entitlement/quota do browser gửi.

## 6. Deliverables

- Worksheet sample app đã ký duyệt: owner, repo, topology, routes/actions/workers, authz, feature/metric và counting examples.
- OpenAPI 3.1 đã freeze cho phần service API được dùng, gồm auth, schemas, machine reason, idempotency, conflict, status và decimal-string quantity.
- Adapter/generated client theo cơ chế phân phối đã duyệt, cộng hướng dẫn tích hợp không chứa secret.
- Sample Data Plane integration với local enforcement và correlation xuyên Hub, app, Control Plane và worker.
- Durable operation protocol phía sample app, gồm unique key, atomic claim/state transition, reservation binding, side-effect idempotency, lease/recovery và reconciliation evidence; tên table/framework chỉ được chọn sau decision gate của sample app.
- Hub launch/error/quota UX; admin readiness/config/status chỉ khi contract đã cho phép và quyền admin đã được phê duyệt.
- Dữ liệu catalog/scope/plan/subscription được nạp bằng command quản trị/migration seed có kiểm soát, nhưng chỉ sau khi cơ chế đó được xác minh trong repo tại thời điểm thực hiện; manifest không chứa giá trị giả.
- Bộ test và evidence map mỗi protected surface tới test tương ứng.
- Runbook enable/disable, credential rotation/revoke, outage, reservation recovery và rollback.

## 7. Target paths

Các path sau là **đích dự kiến**, chỉ dùng nếu cấu trúc thực tế ở thời điểm triển khai đã phê duyệt:

- `contracts/openapi/`: contract OpenAPI 3.1 và fixtures contract đã sanitize.
- `integrations/data-plane/`: boundary/adapter dùng chung, chỉ sau quyết định phân phối.
- `integrations/sample-data-plane/`: chỉ tạo sau khi sample app, runtime và framework đã được duyệt.
- `apps/web/`: một frontend owner duy nhất chịu trách nhiệm mọi thay đổi user và admin của Hub.
- `apps/control-plane/drizzle/migrations/`: target duy nhất nếu một forward migration Control Plane được phê duyệt là cần thiết.
- `apps/control-plane/src/main-worker.*`: entrypoint worker Control Plane nếu cần thay đổi orchestration/reconciliation; worker Data Plane vẫn thuộc app repo tương ứng.
- `tests/e2e/`: luồng liên hệ thống.
- `tests/security/`: bypass, scope, token, redirect và revoke.
- App repo ngoài monorepo: ghi URL/revision/owner làm external reference trong worksheet; thay đổi app phải thực hiện tại repo đó, không giả vờ source nằm trong Talosmine.

Không tạo path chỉ để hợp thức hóa kế hoạch. Path cuối cùng phải đối chiếu repo thật trước khi giao việc.

## 8. DB/migration

- Mặc định **không thêm Control Plane table** trong Phase 6; dùng schema Application Catalog, Plan, Subscription, Service Identity và Quota đã được thiết kế.
- Catalog, redirect, feature, approved metric, service scopes, plan/version và test subscription được cấu hình bằng controlled command hoặc seed/migration đã review, có reason/audit khi contract yêu cầu.
- Không chèn trực tiếp bằng SQL ad hoc để né domain invariant; migration task/Studio chỉ là ngoại lệ quản trị có kiểm soát theo tài liệu schema.
- Không đặt fake quota, fake reset window, fake TTL hoặc plan mặc định. Dữ liệu chưa được duyệt giữ inactive/draft và không nhận traffic.
- Nếu integration thật chứng minh cần schema Control Plane mới, dừng rollout; architect, DB owner, QA và reviewer phải duyệt migration forward-only tại `apps/control-plane/drizzle/migrations/`, backup/PITR checkpoint và rollback/forward-fix trước khi tiếp tục.
- Durable operation state là dữ liệu thuộc sample app và nằm trong datastore của app, không phải bảng Control Plane. Physical schema, migration path và framework của app chỉ được chốt sau khi sample app/runtime/repo đã được phê duyệt.
- Kiểm chứng binding app–feature–metric–scope, immutable published snapshot, append-only usage/audit và decimal-string `bigint` tại API boundary.

## 9. Backend API

- Freeze phần API service tối thiểu tương ứng với entitlement decision và usage reservation `reserve`, `commit`, `cancel`, `status`; path cuối cùng lấy từ OpenAPI, không suy ra từ ví dụ.
- Data Plane gửi full verified `issuer + subject`; không gửi hoặc tin internal `accountId` từ app/browser.
- Mỗi operation xác thực M2M token, audience/issuer/expiry, active identity, app binding và exact resource scope trước khi lộ user/reservation state.
- Reserve dùng operation reference và idempotency key ổn định; retry cùng key/fingerprint replay outcome, khác fingerprint phải conflict.
- Timeout/unknown outcome: hỏi status hoặc retry cùng key; tuyệt đối không sinh reservation mới để “thử lại”.
- App chỉ chạy nghiệp vụ sau reserve thành công; Control Plane/entitlement/quota không xác minh được thì fail-closed.
- Commit/cancel theo counting point/failure treatment đã duyệt. Worker lưu reservation ID bền vững trước khi nhận/tiếp tục công việc và không chuyển terminal state trái phép.
- Trước side effect, app atomically claim unique logical operation và gắn reservation ID vào durable state. Duplicate request/worker phải đọc/claim cùng operation thay vì tạo một execution độc lập.
- Protocol phải xử lý rõ ba crash window: **sau reserve/trước effect**, **sau effect/trước durable success**, và **sau durable success/trước commit**. Recovery chỉ transition/retry khi evidence đã duyệt chứng minh trạng thái business effect; không suy luận thành công từ quota state.
- Side-effect API/domain mutation phải hỗ trợ idempotency hoặc uniqueness guard theo logical operation để nhiều worker/process vẫn tạo nhiều nhất một irreversible effect. Quota idempotency không thay thế guard này.
- Mọi response/error mapping giữ machine reason ổn định, không lộ token, secret, stack trace, account/reservation ngoài scope.

## 10. User web

- Hub catalog hiển thị sample app theo metadata/status đã cho phép và launch tới exact `launch_url`; Hub không cấp quyền chỉ bằng việc hiện card/nút.
- Launch từ Hub và direct URL đều vào cùng backend enforcement; không có query/header “đến từ Hub” để bypass.
- UX phân biệt tối thiểu: cần đăng nhập, không entitlement, hết quota, request đang xử lý, dependency unavailable/fail-closed và lỗi domain; copy không đoán reset time.
- Sau timeout, UI không tự submit ý định mới; dùng operation state/status để phục hồi an toàn.
- Sample app bảo toàn return URL đã allowlist, chống open redirect/replay và không để token/secret trong URL hoặc browser storage không được duyệt.
- Trạng thái loading/error/focus hoạt động trên keyboard, screen reader, mobile, tablet và desktop.

## 11. Admin web

- Chỉ triển khai trang integration status/config/readiness nếu OpenAPI/admin contract và RBAC đã cho phép; nếu chưa có contract, deliverable là worksheet/runbook, không tự thêm API.
- Readiness cần thể hiện metadata không nhạy cảm: app status, exact redirects, identity status, feature/metric scope coverage, contract version và lần kiểm tra; không hiển thị client secret/token.
- Mutation cấu hình phải đi qua command domain có permission, reason, correlation và audit; không sửa bảng trực tiếp.
- Có trạng thái rõ cho draft/not-ready/disabled/revoked; không có nút bulk-enable.
- Trang audit chỉ hiển thị trong phạm vi permission, phân trang và redact dữ liệu nhạy cảm.

## 12. Integration/security

- Auth0 user application/API/M2M identity của sample app là duy nhất trong môi trường; credential không dùng chung và không nằm trong repo, fixture, log, screenshot hoặc tài liệu.
- Exact callback/logout URI, issuer, audience và scope được cấu hình theo environment; không wildcard ngầm định.
- Adapter chỉ làm token/session validation, gọi contract, idempotency/correlation và error mapping; domain authorization vẫn ở app, policy thương mại vẫn ở Control Plane.
- Kiểm tra domain authorization cho từng resource sau authentication và trước business effect; entitlement không thay thế ownership/role của domain.
- Mỗi route/action/worker được map tới feature/metric và test bypass. Worker không được nhận job thiếu verified subject, operation reference hoặc reservation ID cần thiết.
- Durable operation record và business object/effect phải liên kết bằng unique logical operation key hoặc invariant tương đương đã duyệt; không log payload/secret để dùng thay durable evidence.
- Kill switch vô hiệu hóa integration/app theo policy đã duyệt, fail-closed cho hành động tốn lượt và không làm mất ledger/audit.
- Log/trace dùng correlation ID xuyên hệ thống, redact subject theo policy và không chứa raw user/M2M token, cookie hoặc secret.

## 13. Contract freeze

Trước khi frontend/backend/tester triển khai song song, architect và owners phải ký freeze record gồm:

- OpenAPI version/commit và cơ chế distribution; compatibility/deprecation rule.
- Exact endpoint, auth scheme, issuer/audience, request/response/error schema và decimal-string quantity.
- Stable application/feature/metric keys, exact capability scopes và service binding.
- Counting examples cho success, domain failure, user cancel, dependency failure, timeout, duplicate và late result.
- Idempotency namespace, fingerprint inputs, operation reference, retry/status flow và reservation state transitions.
- **Bắt buộc phía sample app:** durable operation state keyed bằng unique logical operation/idempotency key trong datastore của app; atomic claim và state transition `pending/processing/succeeded/failed` hoặc tương đương đã duyệt; reservation ID persistence; lease expiry/ownership/recovery khi cần; side-effect idempotency/uniqueness; terminal-state rules và retention.
- Quy tắc cùng evidence source cho từng crash window: sau reserve/trước effect thì cancel/retry thế nào; sau effect/trước durable success thì xác minh effect ra sao trước khi mark/retry; sau durable success/trước commit thì status/retry commit cùng key thế nào. Không được coi Quota replay là bằng chứng business effect exactly once.
- Correlation fields, log redaction, revoke SLA, outage/fail-closed behavior và kill-switch semantics.
- UI reason-code mapping và admin capabilities nếu có.

Sau freeze, thay đổi breaking phải quay lại architect, cập nhật consumer/provider contract tests và được sign-off; không sửa riêng một phía.

## 14. Tests

- **Contract:** validate OpenAPI, request/response, auth, reason code, idempotency replay/conflict và adapter compatibility.
- **E2E:** launch từ Hub, direct URL, local session bootstrap, entitlement allow/deny, reserve→commit và reserve→cancel.
- **Security:** missing/expired/wrong issuer/wrong audience token, callback gần giống, open redirect, app/feature/metric cross-binding, thiếu từng exact scope và browser-forged claims.
- **Bypass:** gọi trực tiếp mọi protected route/action/API; inject/trigger mọi protected worker path; chứng minh frontend hiding không phải enforcement.
- **Revoke:** user session/account/entitlement/service identity/từng scope bị revoke theo SLA; request mới deny và không lộ reservation state.
- **Concurrency:** tại remaining = 1, tổng reserve thành công tối đa 1; duplicate worker không tạo business effect/usage thứ hai.
- **Concurrent side-effect barrier:** đồng thời thả nhiều duplicate request/worker cho cùng logical operation qua barrier; chứng minh atomic claim và app-side uniqueness cho phép nhiều nhất một irreversible business effect, đồng thời quota cuối cùng đúng.
- **Crash injection:** cưỡng bức dừng process ở cả ba cửa sổ sau reserve/trước effect, sau effect/trước durable success, sau durable success/trước commit; restart/redeliver đồng thời và kiểm tra recovery theo evidence đã duyệt. Sequential redelivery đơn thuần không đạt.
- **Timeout/duplicate:** timeout trước/sau response, status recovery, retry cùng key, fingerprint conflict, commit/cancel lặp và terminal conflict.
- **Outage/rollback:** Auth0/Control Plane/database/network unavailable, kill switch, credential rotation, rollback app version và re-enable có kiểm soát.
- Test matrix phải có một dòng cho **mọi** protected route/action/worker; không dùng một happy-path test để đại diện toàn bộ inventory.

## 15. Ordered steps

1. Xác minh Phase 5 PASS; lập danh sách blocker và owners.
2. Tổ chức decision gate, phê duyệt sample app/runtime/framework/repo và distribution mechanism.
3. Hoàn tất inventory route/action/worker/domain auth/direct URL và threat model.
4. Chốt feature/metric/counting/quota semantics bằng ví dụ; không đi tiếp nếu còn “tùy trường hợp” chưa định nghĩa.
5. Provision Auth0 objects và secret-store references ngoài repo; lập rotation/revoke record.
6. Freeze OpenAPI/integration/security/UI contract cùng durable operation/crash-recovery protocol; sinh consumer/provider và concurrent crash-injection test skeleton theo cơ chế đã duyệt.
7. Cấu hình catalog, redirects, scopes, plan/version/subscription bằng controlled commands với dữ liệu đã duyệt.
8. Tích hợp local SSO/session validation và backend protection cho toàn inventory.
9. Tích hợp entitlement, domain authorization, reserve/commit/cancel/status; hiện thực atomic durable operation claim/state, reservation binding, side-effect idempotency và recovery cho async flow trong app repo đã chọn.
10. Hoàn thiện Hub launch/error/quota UX và admin readiness chỉ trong contract.
11. Chạy contract, E2E, security, bypass, revoke, concurrency, timeout, outage và accessibility/responsive checks; lưu evidence.
12. Chạy canary nội bộ, kill-switch/rollback drill, đối soát usage/audit; QA và reviewer sign-off trước khi mở rộng.

## 16. Parallel lanes và ownership

Chỉ bắt đầu sau contract freeze; mỗi làn có owner và file/repo boundary rõ:

| Làn | Công việc | Phụ thuộc/kết quả |
|---|---|---|
| OpenAPI/shared integration | Một owner duy nhất cho `contracts/openapi/`, shared adapter/client và compatibility | Không đổi contract hoặc generated artifact đơn phương |
| Control Plane | Config/command, scope, observability, provider contract tests và `apps/control-plane/src/main-worker.*` nếu cần | Không sở hữu OpenAPI/shared artifact |
| Sample app repo | SSO/session, domain auth, adapter, async persistence, kill switch | Repo ngoài phải có owner/revision rõ |
| Frontend Hub | Một frontend owner cho toàn bộ `apps/web/**`, gồm catalog/user UX và readiness/config/audit admin | Không tách user/admin thành owner song song; chỉ dùng contract đã freeze |
| Tester | Contract/E2E/security/concurrency matrix | Độc lập với code lanes; không sửa test để hợp thức lỗi |
| Ops/Security | Auth0, secret store, rotation/revoke, canary/rollback | Không đưa secret vào repo |

Không song song hóa các bước selection, metric semantics, contract freeze và production enablement.

## 17. Checklist

**Functional**
- [ ] Hub launch và direct URL cùng hoạt động qua SSO/local session và backend enforcement.
- [ ] Mọi protected route/action/worker có feature/metric mapping và test.
- [ ] Reserve xảy ra trước business effect; commit/cancel đúng semantics; async flow persist reservation ID.
- [ ] Async/sync path có side effect dùng durable operation state bắt buộc; thiếu durable state làm Phase 6 tiếp tục `blocked`.

**Security**
- [ ] Exact issuer/audience/redirect/scope được kiểm tra; domain authorization không bị entitlement thay thế.
- [ ] Identity/credential riêng; không secret/token/cookie trong repo, log hoặc evidence.
- [ ] Bypass và revoke tests pass cho từng protected surface.

**Database**
- [ ] Không thêm Control Plane table nếu không qua schema decision riêng.
- [ ] Config dùng controlled commands; không fake quota; usage/audit append-only được đối soát.

**Concurrency**
- [ ] Remaining = 1 không double-spend; duplicate/retry không double business effect hoặc double count.
- [ ] Timeout phục hồi bằng status/cùng key, không tạo reservation mới.
- [ ] Concurrent barrier với duplicate workers/requests chứng minh nhiều nhất một irreversible effect và quota đúng.
- [ ] Crash injection ở đủ ba cửa sổ phục hồi theo approved evidence; sequential redelivery không được dùng thay thế.

**Accessibility**
- [ ] Keyboard order, focus, labels, status/error announcement và contrast được kiểm chứng.

**Responsive**
- [ ] Launch/quota/error/readiness views dùng được trên mobile, tablet và desktop, không mất hành động chính.

**Observability**
- [ ] Correlation xuyên Hub/app/Control Plane/worker; dashboard/alert theo denial, timeout, reservation age và integration health.
- [ ] Theo dõi durable operation state/lease age/recovery outcome và reconciliation mismatch mà không log secret hoặc payload thừa.
- [ ] Log redaction và retention tuân policy đã duyệt.

**Rollback**
- [ ] Kill switch, canary stop, credential revoke/rotation và app rollback đã drill; ledger/history không bị xóa.
- [ ] Rollback/restart không làm mất operation record, reservation binding hoặc tạo side effect lần hai.

**Docs**
- [ ] Worksheet, contract version, config inventory, test evidence, runbook và external repo revision được cập nhật đúng thực tế.

## 18. Exit gate

Phase 6 chỉ đạt khi tất cả điều sau có evidence từ môi trường đã chỉ định:

- Một sample app **thật và đại diện** hoàn tất cả launch từ Hub lẫn direct URL SSO.
- Không protected route/action/worker nào trong inventory bypass authentication, domain authorization, entitlement hoặc quota cần thiết.
- Success/failure/async/timeout/retry/concurrency/revoke/outage đều cho usage và business outcome đúng semantics đã duyệt.
- Durable operation state phía sample app đã được chứng minh bằng atomic claim/transitions, persisted reservation ID, lease/recovery khi cần và side-effect idempotency; concurrent duplicate execution tạo nhiều nhất một irreversible effect.
- Crash injection ở đủ ba cửa sổ phục hồi bằng approved evidence, giữ business outcome và quota nhất quán; chỉ test redelivery tuần tự không đủ evidence.
- Exact scopes và unique M2M identity được chứng minh; secret không xuất hiện trong repo/log/evidence.
- Kill switch và rollback drill thành công mà không xóa history hoặc làm phát sinh double count.
- QA PASS và reviewer không còn mục phải sửa. “Happy path chạy một lần” không đủ điều kiện thoát.

## 19. Stop/rollback

Dừng ngay, không enable/canary tiếp khi: Phase 5 chưa PASS; chưa duyệt sample/runtime/framework; metric/counting còn mơ hồ; async/side-effect path thiếu durable operation state; atomic claim, reservation persistence, lease/recovery hoặc side-effect idempotency chưa chứng minh; crash window không có approved evidence; contract drift; có bypass; wrong-audience/scope được chấp nhận; double-spend/double-count/double-effect; secret lộ; không truy vết được unknown outcome; hoặc cùng lỗi lặp lại lần hai.

Rollback theo thứ tự đã duyệt: tắt feature/app integration bằng kill switch → ngừng nhận business action mới → bảo toàn trạng thái reservation/ledger → revoke/rotate credential nếu liên quan → rollback app/config tương thích → đối soát reservation và audit → chỉ re-enable sau root-cause, test lại và sign-off. Không rollback bằng xóa usage/audit, sửa published snapshot hoặc chèn quota bù không audit.

## 20. QA/reviewer sign-off

- QA phải độc lập chạy/đối chiếu contract, E2E, security, bypass, revoke, concurrency, timeout, outage, accessibility, responsive và rollback evidence; nếu lệnh thật chưa tồn tại thì báo đúng sự thật, không bịa lệnh.
- Reviewer kiểm tra inventory coverage, boundary Control/Data Plane, OpenAPI compatibility, token/scope order, phân biệt quota idempotency với side-effect idempotency, durable operation atomicity, ba crash windows, fail-closed, data minimization và external repo references.
- Mỗi finding có severity, owner, evidence và trạng thái. Mục “phải sửa” quay về đúng lane; không sửa test để pass.
- Tối đa ba vòng làm → kiểm → sửa → kiểm; chỉ tại bước verification mới kết luận **ĐẠT**, **TẮC** hoặc **CẠN LƯỢT** theo `AGENTS.md`.
- Phase-level sign-off chỉ được ghi sau QA PASS và reviewer hết mục phải sửa; tài liệu này tự thân không phải bằng chứng implementation.
