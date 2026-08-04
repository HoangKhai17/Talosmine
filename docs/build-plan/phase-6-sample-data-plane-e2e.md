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
4. ~~Chứng minh Hub chỉ launch và quản lý, không proxy business traffic của sample app.~~
   **SỬA 2026-07-31 theo DEC-B17 (đã duyệt):** nguyên tắc này chỉ còn áp cho ứng dụng kiểu
   **`external_link`**. Ứng dụng kiểu **`hosted`** thì Hub CHÍNH LÀ nơi chạy: giao diện nằm
   trong Talosmine và backend Talosmine gọi API nhà cung cấp thứ ba. Mục tiêu đúng của P6 là
   chứng minh hợp đồng Control Plane–Data Plane cho **loại `external_link`**; loại `hosted`
   không có data plane riêng nên không thuộc phạm vi này.
5. Tạo mẫu onboarding có thể kiểm chứng cho Phase 7 mà không nhúng plan name, quota cục bộ hoặc policy thương mại vào app.

## 3. Prerequisites và human decisions

**Approver duy nhất cho mọi quyết định nghiệp vụ/bảo mật/vận hành dưới đây là chủ dự án** (`./decision-register.md`, DEC-G01). Dự án là solo dev + AI agents; không có product owner, app owner, security owner hay operations team tách biệt ký duyệt chéo. Agent không tự approve thay con người, kể cả khi đề xuất do agent soạn.

Việc gộp vai **không** làm giảm yêu cầu kiểm chứng: `qa` và `reviewer` vẫn tách khỏi lane viết code và giữ `edit: deny` theo `../../AGENTS.md` mục 4b, vì agent viết code không được tự tuyên bố code mình đạt chuẩn.

- [ ] Có biên bản Phase 5 QA PASS và reviewer không còn mục phải sửa.
- [ ] Chủ dự án phê duyệt sample app dựa trên mức đại diện, mức rủi ro và khả năng dựng môi trường; ghi rõ app repo nằm trong hay ngoài monorepo.
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
- ~~Bắt buộc API gateway hoặc chuyển business traffic qua Hub.~~
  **SỬA 2026-07-31 theo DEC-B17 (đã duyệt).** Câu này vẫn đúng cho ứng dụng `external_link`:
  KHÔNG bắt buộc app bên ngoài đi qua Hub. Nhưng nó KHÔNG còn là lệnh cấm tuyệt đối —
  ứng dụng `hosted` đi qua Hub theo đúng thiết kế. Phân biệt: cấm ở đây là cấm **ép** app có
  hạ tầng riêng phải proxy qua Hub, không phải cấm Hub tự vận hành công cụ của chính nó.
  Hiện thực đã có: migration 0017, `POST /v1/catalog/applications/{key}/run`.
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

Runbook thực thi tuần tự theo mạch **cổng vào P5 → decisions → Auth0 → contract freeze → cấu hình dữ liệu → tích hợp → test → canary/rollback → QA/reviewer**. Mỗi bước có ID `P6.n` và ghi đủ năm thành phần: **Hành động**, **Sản phẩm**, **Phụ thuộc**, **Verify**, **Lane** (khớp mục 16).

Tên lệnh lấy từ **DEC-T15** của `./decision-register.md`; version/package lấy từ **bảng D** cùng file. Script chỉ tồn tại thật sau `P1.7`, nên trước đó lệnh có tên nhưng chưa chạy được — không bước nào dưới đây được đánh dấu “đã chạy”.

**Ràng buộc chi phối toàn phase:** `DEC-B01` (danh sách ứng dụng của Hub) và `DEC-B02` (sample app) đang `open`. Không có tên app, metric key, quota number hay owner nào tồn tại trong repo. Cấu trúc và cơ chế của runbook là bắt buộc và cụ thể; **giá trị nghiệp vụ để trống có chủ đích** dưới dạng `‹cần chốt: …›` và là blocker cứng của bước tương ứng. Không điền default, không suy ra từ ví dụ, không dùng fixture giả để vượt gate. Approver duy nhất cho mọi quyết định nghiệp vụ/bảo mật/vận hành là **chủ dự án** (`DEC-G01`).

### Nhóm A — Cổng vào và decisions

1. **P6.1 — Xác nhận cổng vào Phase 5**
   - **Hành động:** Đối chiếu bảng gate mục 20 của `./phase-5-hard-quota-reconciliation.md`: mọi QA gate PASS, reviewer không còn mục “phải sửa”, mọi mục phải sửa của P5 đã đóng. Lập danh sách blocker còn lại của P6 kèm decision ID tương ứng ở `./decision-register.md`.
   - **Sản phẩm:** Danh sách blocker P6 (ghi vào mục 3 của file này, dạng checkbox có decision ID).
   - **Phụ thuộc:** Phase 5 `verified`.
   - **Verify:** Mọi dòng “Kết quả” trong bảng mục 20 của P5 là PASS và trạng thái P5 tại `./README.md` là `verified`. Còn bất kỳ dòng “Chưa đánh giá” nào → P6 giữ `blocked`, dừng tại đây.
   - **Lane:** `orchestrator`.

2. **P6.2 — Decision gate sample app (blocker lớn nhất)**
   - **Hành động:** Trình chủ dự án chốt: danh sách ứng dụng của Hub; sample app nào được chọn và nó đại diện cho path/loại rủi ro nào; runtime/language/framework của sample app (phê duyệt stack Control Plane **không** mặc nhiên phê duyệt stack Data Plane); app repo nằm trong hay ngoài monorepo kèm URL/revision/owner; cơ chế phân phối tích hợp (adapter trong app repo, package qua registry đã duyệt, hay generated client từ OpenAPI). Ghi kết quả thành record mới trong `./decision-register.md`, không sửa tại chỗ record `open`.
   - **Sản phẩm:** Record `DEC-B01`/`DEC-B02` chuyển `approved` tại `./decision-register.md`; worksheet sample app (owner, repo, revision, topology).
   - **Phụ thuộc:** P6.1. **Blocker:** `‹cần chốt: DEC-B01 danh sách ứng dụng của Hub + owner từng app›`; `‹cần chốt: DEC-B02 sample app và path nó đại diện›`; `‹cần chốt: runtime/language/framework của sample app›`; `‹cần chốt: repo sample app trong hay ngoài monorepo (URL/revision/owner)›`; `‹cần chốt: cơ chế phân phối tích hợp›`.
   - **Verify:** `./decision-register.md` mục B: `DEC-B01` và `DEC-B02` có trạng thái `approved` kèm ngày và approver là chủ dự án; bảng mục C dòng P6 đọc “Đủ”. Còn `open` → không tạo `integrations/sample-data-plane/`, không đi tiếp P6.3.
   - **Lane:** `orchestrator` điều phối; chủ dự án approve; `architect` review read-only mức đại diện/rủi ro.

3. **P6.3 — Inventory protected surface + threat model**
   - **Hành động:** Liệt kê **đầy đủ** của sample app: từng protected route, endpoint, server action, mutation, worker/job, webhook/internal trigger, domain authorization rule và đường truy cập trực tiếp (direct URL). Mỗi dòng ghi: surface ID, loại, có side effect hay không, có tính lượt hay không, feature/metric dự kiến, đường bypass giả định. Architect dựng threat model trên inventory này.
   - **Sản phẩm:** Bảng inventory trong worksheet sample app (một dòng cho mỗi surface); ghi chú threat model read-only.
   - **Phụ thuộc:** P6.2 (`approved`). **Blocker:** `‹cần chốt: domain authorization mapping của sample app›`.
   - **Verify:** Đếm số surface trong inventory bằng số route/action/worker liệt kê được từ source thật của sample app repo tại revision đã ghi; mỗi dòng có cột feature/metric và cột test ID không để trống. Inventory thiếu một loại surface (đặc biệt worker/webhook) → dừng, không freeze contract.
   - **Lane:** `architect` (read-only) + `orchestrator`.

4. **P6.4 — Chốt feature/metric/counting/quota semantics bằng ví dụ**
   - **Hành động:** Với **từng** surface tính lượt trong inventory P6.3, chốt: stable `applicationKey`/`featureKey`/`metricKey`, unit, `amount` cho mỗi logical operation, counting point (`start`/`milestone`/`success`), failure treatment cho lỗi user/app/dependency/timeout-cancel, window type + IANA timezone + DST, reservation TTL + late-success behavior, retry/retention semantics, revoke SLA + outage policy + kill-switch owner, và semantics durable operation phía app (state machine, atomic claim/transition, lease/recovery, bằng chứng xác nhận side effect, quy tắc reconciliation cho từng crash window). Mỗi mục phải có **ví dụ đếm cụ thể**; không còn “tùy trường hợp”.
   - **Sản phẩm:** Bảng counting example trong worksheet (một dòng cho mỗi cặp surface × outcome); các checkbox tương ứng ở mục 3 được tick kèm decision ID.
   - **Phụ thuộc:** P6.3. **Blocker:** `‹cần chốt: DEC-B05 metric/unit/amount cho từng action›`; `‹cần chốt: DEC-B06 counting point + failure treatment›`; `‹cần chốt: DEC-B07 quota window/timezone/DST›`; `‹cần chốt: DEC-B08 reservation TTL + late-success›`; `‹cần chốt: DEC-B10 revoke SLA + outage policy + kill-switch owner›`; `‹cần chốt: state machine durable operation + evidence source cho ba crash window›`.
   - **Verify:** Rà mục 3 — không còn checkbox trống áp dụng cho sample app; mỗi surface tính lượt trong inventory P6.3 có đúng một dòng counting example cho mỗi outcome (success / domain failure / user cancel / dependency failure / timeout / duplicate / late result). Thiếu metric/unit/amount, counting/failure, window/timezone/DST, TTL/late-success hoặc outage → **không được bật reserve** cho metric đó; P6 giữ `blocked`.
   - **Lane:** `orchestrator` điều phối; chủ dự án approve; `architect` review read-only.

5. **P6.5 — Provision Auth0 cho sample app**
   - **Hành động:** Theo topology `DEC-T14`: tạo trong tenant đã chốt một API resource audience của Control Plane, một Regular Web Application cho Hub BFF (nếu chưa có từ P2) và **một M2M application riêng cho backend sample app** — không dùng chung credential (`../modular.md` mục 10.4). Khai callback/logout URL **exact match**, không wildcard, riêng theo environment. Secret chỉ nằm ở Auth0/secret manager/CI protected environment; đưa vào repo dưới dạng **tên biến env rỗng**, không giá trị. Lập record rotation/revoke: ai xoay, chu kỳ, cách revoke.
   - **Sản phẩm:** Config register không chứa secret (client ID metadata, audience, exact redirects, scopes, rotation owner); biến env khai báo trong `apps/web/` và `apps/control-plane/` boundary config.
   - **Phụ thuộc:** P6.2, P6.4. **Blocker:** `‹cần chốt: DEC-B03 Auth0 tenant/environment thật, issuer, audience›` (`DEC-T14` mới là `proposed`, chưa mở gate).
   - **Verify:** `grep` toàn repo không trả về client secret, token hay cookie value nào (bao gồm fixture, log, screenshot, tài liệu); config register liệt kê đúng **một** M2M client ID cho backend sample app và client ID đó khác mọi client ID khác trong register; mọi callback/logout URI là exact string, không ký tự `*`.
   - **Lane:** `orchestrator` (sở hữu có điều kiện `infra/**` và secret reference, cần chủ dự án phê duyệt cụ thể ở đầu phase).

### Nhóm B — Contract freeze

6. **P6.6 — Architect thiết kế read-only**
   - **Hành động:** Thiết kế thứ tự enforcement (authentication → domain authorization → entitlement → reserve → business effect → commit/cancel), durable operation protocol phía app, ba crash window và evidence source cho từng window, mapping surface → feature/metric, error/reason mapping, kill-switch semantics. Đối chiếu `../modular.md` mục 9.4 (lock order, re-authorize trước identity resolution, fail-closed) và mục 10.4 (identity riêng, scope bind exact metric, không generic scope).
   - **Sản phẩm:** Ghi chú thiết kế + threat model (read-only).
   - **Phụ thuộc:** P6.3, P6.4, P6.5.
   - **Verify:** Design đối chiếu 1-1 với `../modular.md` mục 9.4 và 10.4: architect xác nhận không lệch tên port/capability/state và xác nhận thiết kế **không** coi quota idempotency là bằng chứng business effect exactly once. Lệch → không freeze.
   - **Lane:** `architect` (read-only).

7. **P6.7 — Backend ghi và freeze contract**
   - **Hành động:** Backend ghi vào `contracts/openapi/control-plane.v1.yaml` phần service API sample app dùng: entitlement decision và `reserve`/`commit`/`cancel`/`status`, kèm auth scheme + issuer/audience, `issuer + subject` binding, decimal-string quantity, machine reason, idempotency namespace + fingerprint inputs + operation reference, reservation state transitions, conflict/status. Cùng lúc freeze **integration annex** (không thuộc OpenAPI): stable application/feature/metric keys, exact capability scopes, counting example từ P6.4, durable operation state + atomic claim + reservation persistence + lease/recovery + side-effect idempotency, quy tắc và evidence source cho từng crash window, correlation fields + log redaction, revoke SLA + outage/fail-closed + kill-switch semantics, UI reason-code mapping. Architect review read-only rồi freeze; ghi revision/commit.
   - **Sản phẩm:** `contracts/openapi/control-plane.v1.yaml` (revision freeze); annex tích hợp trong worksheet sample app.
   - **Phụ thuộc:** P6.6.
   - **Verify:** `pnpm openapi:lint` trả 0 lỗi; `pnpm openapi:drift` pass (type đã commit khớp spec); rà spec: mọi quantity là decimal string (không JSON number), không có billing operation, không có endpoint proxy business traffic của app. Annex: mỗi surface trong inventory P6.3 có đúng một dòng mapping feature/metric; ba crash window đều có evidence source ghi rõ. Thiếu một crash window → không freeze.
   - **Lane:** `backend` (writer duy nhất của `contracts/openapi/**`) + `architect` (review/freeze).

### Nhóm C — Cấu hình dữ liệu (không thêm Control Plane table)

8. **P6.8 — Cấu hình catalog, redirect, feature, metric, service scope**
   - **Hành động:** Nạp bằng **controlled command quản trị đã có từ P3/P4/P5** (có permission, reason, correlation, audit), không INSERT SQL ad hoc: application record + `launch_url` (https, host trong allowlist, chặn private/link-local theo `DEC-T12`), exact redirects, feature, approved metric với semantics đầy đủ từ P6.4, service identity của sample app và scope `entitlement:decide` gắn đúng feature + `quota:reserve|commit|cancel|read` gắn đúng metric. Dữ liệu chưa duyệt giữ `draft`/inactive và không nhận traffic.
   - **Sản phẩm:** Bản ghi config trong Control Plane DB + audit rows; config inventory trong worksheet.
   - **Phụ thuộc:** P6.5, P6.7. **Blocker:** `‹cần chốt: DEC-B01/DEC-B02 applicationKey, featureKey, metricKey thật›`.
   - **Verify:** psql: mỗi mutation ở trên có đúng một audit row tương ứng (`SELECT count(*)` audit khớp số command đã chạy); `SELECT capability, feature_id, usage_metric_id FROM control_plane.service_identity_scopes WHERE service_identity_id = ‹sample app identity›` cho thấy `entitlement:decide` có feature non-null + metric null, mọi `quota:*` có metric non-null + feature null; không có row capability wildcard hay `quota:*` không gắn metric. Thử grant scope trỏ metric của application khác kỳ vọng bị composite FK reject.
   - **Lane:** `backend`.

9. **P6.9 — Cấu hình plan/version/subscription và test account**
   - **Hành động:** Tạo plan version chứa quota policy cho metric của sample app (limit, window, TTL đúng giá trị đã duyệt ở P6.4) và subscription cho các test account bằng controlled command; publish snapshot theo semantics P4. Test account/subscription dùng dữ liệu **được kiểm soát**; không đặt fake quota, fake reset window, fake TTL hay plan mặc định.
   - **Sản phẩm:** Plan version + subscription + `plan_quota_policies` rows; danh sách test account trong worksheet.
   - **Phụ thuộc:** P6.8. **Blocker:** `‹cần chốt: DEC-B04 account activation policy + default plan›`; `‹cần chốt: DEC-B05 quota limit thật cho metric sample app›`; `‹cần chốt: DEC-B09 subscription lifecycle nếu test cần upgrade/downgrade/cancel›`.
   - **Verify:** psql `SELECT limit_quantity, window_type, reservation_ttl_seconds FROM control_plane.plan_quota_policies WHERE usage_metric_id = ‹metric sample app›` trả đúng giá trị đã duyệt tại P6.4 (đối chiếu từng ô với worksheet, không có ô null); test account resolve ra đúng subscription active. Bất kỳ giá trị nào không truy được về một dòng worksheet đã duyệt → xóa config, dừng.
   - **Lane:** `backend`.

### Nhóm D — Tích hợp (song song sau freeze P6.7)

10. **P6.10 — SSO và local session validation**
    - **Hành động:** Trong sample app repo: nhận launch từ Hub **và** direct URL vào cùng đường enforcement; tạo/kiểm phiên cục bộ theo thiết kế đã duyệt; xác minh local user token/session (`issuer`, `audience`, `exp`, subject) bằng `jose@6.2.3` hoặc SDK tương đương của runtime đã chốt; bảo toàn return URL đã allowlist, chống open redirect/replay; không để token/secret trong URL hay browser storage chưa duyệt.
    - **Sản phẩm:** Thay đổi trong sample app repo (ghi external commit/revision); nếu adapter dùng chung: `integrations/data-plane/`.
    - **Phụ thuộc:** P6.7 (freeze), P6.5. **Blocker:** `‹cần chốt: runtime/framework sample app (P6.2) — quyết định thư viện verify token›`.
    - **Verify:** `tests/e2e/` — launch từ Hub và mở direct URL cùng dẫn tới backend enforcement giống nhau; `tests/security/` — token thiếu/hết hạn/sai issuer/sai audience đều deny; callback gần giống và open redirect bị chặn; không có query/header “đến từ Hub” nào làm thay đổi kết quả. Chạy bằng `pnpm test:e2e` (Playwright `1.61.1`).
    - **Lane:** `backend` (làn code sample app repo), chạy song song với P6.13/P6.14.

11. **P6.11 — Entitlement và domain authorization**
    - **Hành động:** Sau authentication, gọi entitlement decision qua contract đã freeze bằng M2M identity riêng, gửi full verified `issuer + subject` — **không** gửi/tin internal `accountId`. Độc lập với entitlement, thực thi domain authorization của app cho từng resource **trước** business effect; entitlement không thay thế ownership/role. Không cache entitlement để tự approve; không đưa plan name/policy vào app.
    - **Sản phẩm:** Thay đổi trong sample app repo (external revision).
    - **Phụ thuộc:** P6.10, P6.8.
    - **Verify:** `tests/security/` — browser-forged claim (`accountId` bịa trong payload/cookie) không đổi quyết định; caller thiếu `entitlement:decide` cho đúng feature bị deny **trước** identity resolution và không lộ user state; wrong owner/role bị domain auth deny dù entitlement allow. `grep` sample app source: không xuất hiện plan name, limit số hay quota ledger cục bộ.
    - **Lane:** `backend` (làn code sample app repo).

12. **P6.12 — Reserve / commit / cancel / status + idempotency**
    - **Hành động:** Hiện thực đúng thứ tự: reserve **trước** business effect; chỉ chạy nghiệp vụ sau reserve thành công; commit/cancel theo counting point và failure treatment đã duyệt ở P6.4. Dùng operation reference ổn định + `Idempotency-Key` theo namespace `service + operation + key`; retry cùng key/fingerprint replay outcome, khác fingerprint conflict. Timeout/unknown outcome: hỏi `status` hoặc retry **cùng key** — tuyệt đối không sinh reservation mới. Control Plane/entitlement/quota không xác minh được → **fail-closed**, không dùng remaining cũ để cho phép action.
    - **Sản phẩm:** Thay đổi trong sample app repo (external revision); adapter tại `integrations/data-plane/` nếu cơ chế phân phối đã duyệt là adapter dùng chung.
    - **Phụ thuộc:** P6.11, P6.9.
    - **Verify:** `tests/e2e/` — reserve→commit và reserve→cancel cho usage đúng semantics; thử gọi business action khi reserve fail kỳ vọng action **không** chạy. `tests/security/` — thiếu từng exact scope (`quota:reserve`/`commit`/`cancel`/`read`) đều deny; cross-binding app/feature/metric deny. Timeout mô phỏng: status/retry cùng key phục hồi, psql `SELECT count(*) FROM control_plane.usage_reservations WHERE operation_reference = ‹ref›` vẫn trả 1.
    - **Lane:** `backend` (làn code sample app repo).

13. **P6.13 — Durable operation state và crash recovery phía app**
    - **Hành động:** Trong datastore của **chính sample app** (không phải bảng Control Plane): lưu durable operation state keyed bằng unique logical operation/idempotency key; **atomic** claim và transition `pending → processing → succeeded|failed` (hoặc state machine tương đương đã duyệt); persist reservation ID + lease/recovery metadata + bằng chứng side effect trước khi retry/reconcile. Side effect bất khả nghịch phải idempotent hoặc có uniqueness guard theo logical operation. Xử lý tường minh ba crash window: **sau reserve/trước effect**, **sau effect/trước durable success**, **sau durable success/trước commit**; recovery chỉ transition/retry khi evidence đã duyệt chứng minh trạng thái business effect — **không** suy luận thành công từ quota state. Worker không nhận job thiếu verified subject, operation reference hoặc reservation ID.
    - **Sản phẩm:** Thay đổi trong sample app repo (external revision); schema/migration của app nằm trong repo app, không phải `apps/control-plane/drizzle/migrations/`.
    - **Phụ thuộc:** P6.12. **Blocker:** `‹cần chốt: state machine + evidence source cho từng crash window (P6.4)›`; `‹cần chốt: datastore/framework của sample app (P6.2)›`.
    - **Verify:** Xem P6.18 (crash injection + concurrent barrier) — bước này không tự tuyên bố đạt. Kiểm tra tĩnh trước: mỗi surface có side effect trong inventory P6.3 có đúng một durable operation key và một uniqueness guard; review xác nhận claim là một câu lệnh atomic (conditional update/insert), không phải read-then-write. Thiếu durable state cho một side-effect path → P6 giữ `blocked`.
    - **Lane:** `backend` (làn code sample app repo).

14. **P6.14 — Hub UX và admin readiness**
    - **Hành động:** Trong `apps/web/`: catalog hiển thị sample app theo metadata/status đã cho phép và launch tới exact `launch_url` (hiện card **không** cấp quyền); phân biệt rõ các trạng thái cần đăng nhập / không entitlement / hết quota / request đang xử lý / dependency unavailable-fail-closed / lỗi domain; copy **không đoán** reset time; sau timeout UI không tự submit ý định mới mà dùng operation state/status để phục hồi. Trang admin integration status/readiness **chỉ** làm nếu OpenAPI/admin contract và RBAC đã cho phép ở P6.7; nếu chưa có contract thì deliverable là worksheet/runbook, không tự thêm API.
    - **Sản phẩm:** `apps/web/` (một frontend owner cho cả user và admin).
    - **Phụ thuộc:** P6.7 (freeze). Chạy **song song** với P6.10–P6.13.
    - **Verify:** `pnpm test:e2e` — mỗi trạng thái ở trên render đúng reason code từ contract, không có chuỗi reset time hard-code; `tests/web/` a11y: keyboard order, focus, label, status/error announcement và contrast không có automated critical violation; responsive: mobile/tablet/desktop không mất hành động chính. Readiness view: `grep` output render không chứa client secret/token.
    - **Lane:** `frontend`.

15. **P6.15 — Tester dựng test matrix**
    - **Hành động:** Song song sau freeze: viết suite contract/E2E/security/bypass/revoke/concurrency/crash-injection/timeout/outage. **Test matrix phải có một dòng cho mọi protected route/action/worker** trong inventory P6.3 — một happy-path test không đại diện cho toàn inventory. Dựng barrier harness (thả đồng thời nhiều duplicate request/worker cho cùng logical operation) và crash-injection harness (cưỡng bức dừng process ở đủ ba cửa sổ, restart/redeliver **đồng thời**).
    - **Sản phẩm:** `tests/e2e/`, `tests/security/`, `tests/integration/`.
    - **Phụ thuộc:** P6.7 (freeze); P6.3 (inventory).
    - **Verify:** Đối chiếu số dòng test matrix với số surface trong inventory P6.3 — hai số phải bằng nhau và không surface nào thiếu test ID. Harness crash-injection chứng minh được nó dừng process ở đúng cửa sổ (assert bằng durable state trước/sau), không chỉ redelivery tuần tự.
    - **Lane:** `tester`.

### Nhóm E — Chạy test bằng lệnh thật

16. **P6.16 — Contract + E2E**
    - **Hành động:** Chạy contract test (OpenAPI validate, request/response, auth, reason code, idempotency replay/conflict, adapter compatibility) và E2E (launch từ Hub, direct URL, local session bootstrap, entitlement allow/deny, reserve→commit, reserve→cancel). Lỗi thuộc code — chủ lane sửa, **không** bẻ test.
    - **Sản phẩm:** Output test thật (evidence cho checklist mục 17).
    - **Phụ thuộc:** P6.10–P6.15.
    - **Verify:** `pnpm openapi:lint`, `pnpm openapi:drift`, `pnpm test`, `pnpm test:e2e` — required suite pass; dán **output thật**. Adapter/generated client khớp spec đã freeze ở revision ghi tại P6.7.
    - **Lane:** `backend` + `frontend` + `tester` (tự kiểm trước gate).

17. **P6.17 — Security, bypass, revoke**
    - **Hành động:** Chạy: token missing/expired/wrong issuer/wrong audience; callback gần giống; open redirect; cross-binding app/feature/metric; thiếu từng exact scope; browser-forged claim. **Bypass:** gọi trực tiếp **mọi** protected route/action/API và inject/trigger **mọi** protected worker path trong inventory. **Revoke:** revoke user session, account, entitlement, service identity và **từng** scope theo SLA đã duyệt; kiểm request mới deny và không lộ reservation state.
    - **Sản phẩm:** Output security/bypass/revoke thật + evidence map surface → test.
    - **Phụ thuộc:** P6.16. **Blocker:** `‹cần chốt: DEC-B10 revoke SLA›` (chưa chốt thì mặc định fail-closed).
    - **Verify:** `pnpm test`, `pnpm test:e2e` với suite `tests/security/` — mọi dòng inventory P6.3 có kết quả pass; frontend hiding chứng minh **không** phải enforcement (gọi thẳng backend khi UI ẩn nút vẫn bị deny). Một surface bypass được → dừng theo mục 19.
    - **Lane:** `tester` chạy suite; `qa` đối chiếu độc lập ở P6.21.

18. **P6.18 — Concurrency, crash injection, timeout**
    - **Hành động:** Chạy: tại remaining = 1, tổng reserve thành công tối đa 1; duplicate worker không tạo business effect/usage thứ hai; **concurrent side-effect barrier** thả đồng thời nhiều duplicate request/worker cho cùng logical operation; **crash injection** ở đủ ba cửa sổ (sau reserve/trước effect, sau effect/trước durable success, sau durable success/trước commit) với restart/redeliver **đồng thời**; timeout trước/sau response, status recovery, retry cùng key, fingerprint conflict, commit/cancel lặp và terminal conflict.
    - **Sản phẩm:** Output concurrency/crash/timeout thật + đối soát ledger.
    - **Phụ thuộc:** P6.16, P6.13.
    - **Verify:** `pnpm test:concurrency` trên PostgreSQL thật qua testcontainers (`DEC-T05`) — remaining = 1 không double-spend; barrier chứng minh **nhiều nhất một** irreversible business effect và quota cuối cùng đúng; crash injection ở cả ba cửa sổ phục hồi theo approved evidence, psql đối soát `usage_events` cho thấy không có count lần hai và không có event bị rewrite. **Sequential redelivery không đạt** — nếu harness chỉ chạy tuần tự, kết quả không tính là evidence.
    - **Lane:** `tester` chạy suite; `backend` sửa nếu fail.

19. **P6.19 — Outage và fail-closed**
    - **Hành động:** Mô phỏng Auth0 / Control Plane / database / network unavailable; kiểm hành vi fail-closed cho mọi hành động tính lượt; kiểm UX dependency-unavailable; kiểm credential rotation không làm gián đoạn ngoài cửa sổ đã duyệt.
    - **Sản phẩm:** Output outage test + ghi chú runbook outage.
    - **Phụ thuộc:** P6.17, P6.18. **Blocker:** `‹cần chốt: DEC-B10 outage policy›`.
    - **Verify:** `pnpm test:e2e` suite outage — khi dependency down, business action tính lượt **không** chạy và không có `usage_events` mới; UI hiện trạng thái fail-closed, không nói user còn quota. Bất kỳ đường fail-open nào → dừng theo mục 19.
    - **Lane:** `tester` chạy suite; `backend` sửa nếu fail.

### Nhóm F — Canary, rollback drill và gate

20. **P6.20 — Canary nội bộ + kill-switch/rollback drill**
    - **Hành động:** Bật canary nội bộ theo cohort đã duyệt trong thời gian quan sát đã duyệt. Diễn tập theo đúng thứ tự mục 19: kill switch tắt integration → ngừng nhận business action mới → bảo toàn reservation/ledger → revoke/rotate credential → rollback app/config → đối soát reservation và audit. Không rollback bằng xóa usage/audit, sửa published snapshot hay chèn quota bù không audit.
    - **Sản phẩm:** Runbook enable/disable, credential rotation/revoke, outage, reservation recovery, rollback — viết từ drill đã chạy.
    - **Phụ thuộc:** P6.19. **Blocker:** `‹cần chốt: canary cohort + thời gian quan sát›`; `‹cần chốt: DEC-B10 kill-switch owner›`.
    - **Verify:** Bật kill switch → request tính lượt mới bị deny fail-closed trong khi psql cho thấy `usage_events` count **không đổi** (không mất history) và reservation đang treo vẫn đọc được qua `status`. Sau rollback + re-enable, đối soát bucket ↔ reservation ↔ event khớp; không có double count. Correlation ID truy được xuyên Hub → app → Control Plane → worker cho một request mẫu.
    - **Lane:** `orchestrator` (canary/rollback, cần chủ dự án phê duyệt cụ thể) + `backend`.

21. **P6.21 — QA + reviewer song song**
    - **Hành động:** QA **độc lập** chạy/đối chiếu contract, E2E, security, bypass, revoke, concurrency, timeout, outage, accessibility, responsive và rollback evidence từ clean state; lệnh nào chưa tồn tại thì **báo đúng sự thật**, không bịa lệnh. Reviewer kiểm inventory coverage, boundary Control/Data Plane, OpenAPI compatibility, thứ tự token/scope check (scope trước identity resolution), **phân biệt quota idempotency với side-effect idempotency**, durable operation atomicity, ba crash window, fail-closed, data minimization và external repo reference. Lặp tối đa **ba vòng**.
    - **Sản phẩm:** Kết quả gate mục 20.
    - **Phụ thuộc:** P6.20.
    - **Verify:** QA gate PASS với evidence thật; reviewer hết mục “phải sửa”. Cùng một lỗi lặp lần thứ hai, thiếu quyết định của chủ dự án, hoặc thiếu credential/service → khai báo **TẮC**. Hết ba vòng chưa đạt → **CẠN LƯỢT**, ghi metadata `verification_outcome: exhausted`; phase status vẫn là một trong bốn giá trị canonical. “Happy path chạy một lần” không đủ điều kiện thoát.
    - **Lane:** `qa` + `reviewer` (edit deny — đây là cơ chế chống tự lừa theo `../../AGENTS.md` mục 4b; hai lane này không nằm trong lane code và không được sửa file).

22. **P6.22 — Cập nhật tài liệu sau sign-off**
    - **Hành động:** Chỉ khi **cả hai** gate đạt: cập nhật worksheet, contract version, config inventory, test evidence, runbook và external repo revision theo behavior **đã xác minh**, không theo dự định. Đề nghị exit và mở P7.
    - **Sản phẩm:** Worksheet + runbook + `./README.md` (trạng thái P6).
    - **Phụ thuộc:** P6.21 (cả hai gate đạt).
    - **Verify:** Đối chiếu docs ↔ OpenAPI ↔ config ↔ output thật; không tài liệu nào tuyên bố có billing, gateway proxy business traffic, hay local quota ledger; mọi lệnh/path khớp repo thật; external repo reference có revision immutable.
    - **Lane:** `document`.

## 16. Parallel lanes và ownership

**Mô hình phê duyệt.** Dự án là solo dev + AI agents (`DEC-G01`). **Chủ dự án là approver duy nhất** cho mọi quyết định nghiệp vụ, bảo mật, vận hành và ngân sách của phase này — không có “Product owner”, “App owner” hay “Operations” tách biệt. Agent không tự approve thay con người, kể cả khi đề xuất do agent soạn.

Điều đó **không** làm gộp `qa`/`reviewer` vào lane code. Hai lane này giữ `edit: deny` và độc lập với mọi lane viết code — đó là cơ chế chống tự lừa theo `../../AGENTS.md` mục 4b: không agent nào vừa viết code vừa tự tuyên bố code mình đạt chuẩn. Luật **3 vòng / TẮC / CẠN LƯỢT** áp dụng nguyên vẹn.

Manifest ownership cho shared path:

| Shared path | Writer duy nhất | Architect | Consumers |
|---|---|---|---|
| `contracts/openapi/control-plane.v1.yaml` | `backend` do orchestrator chỉ định | Read-only: thiết kế/review/freeze revision | `frontend`, `tester`: read-only |
| `integrations/data-plane/` | `backend` (adapter dùng chung), chỉ sau quyết định phân phối ở P6.2 | Read-only | `tester`: read-only |

Chỉ bắt đầu song song sau contract freeze (P6.7); mỗi làn có owner và file/repo boundary rõ:

| Làn | Owner/path duy nhất | Điều kiện bắt đầu | Không được làm |
|---|---|---|---|
| `architect` | Không write. Threat model, review/freeze contract (P6.6, P6.7) | Sau P6.4 | Không write file; không tự chọn sample app, metric hay quota thay chủ dự án. |
| `backend` | `contracts/openapi/**` (writer duy nhất), `apps/control-plane/**`, `integrations/data-plane/**`, và làn code trong sample app repo đã duyệt | Sau P6.7 | Không sở hữu `apps/web/**` hay `tests/**`; không đưa plan name/limit/local quota ledger vào app; không proxy business traffic qua Hub. |
| `frontend` | `apps/web/**` — **một** owner cho cả user catalog/launch và admin readiness/config/audit | Sau P6.7 | Không tách user/admin thành hai owner song song; không đổi API shape; không coi việc ẩn nút là enforcement. |
| `tester` | `tests/**` | Sau P6.7 (contract) và P6.3 (inventory) | Không sửa test để hợp thức lỗi code; không triển khai product logic. |
| `orchestrator` | Có điều kiện: `infra/**`, `.github/workflows/**`, root config; Auth0/secret-store reference, canary và rollback drill (P6.5, P6.20) | Chỉ sau khi **chủ dự án phê duyệt cụ thể** ở đầu phase | Không đưa secret vào repo/log/evidence; không bulk-enable; không bỏ qua blocker. |
| `qa` | Không write. Chạy gate thật từ clean state, lưu evidence (P6.21) | Sau khi các lane code tự kiểm xong (P6.16–P6.20) | Không sửa file; không tuyên bố pass khi lệnh chưa tồn tại hoặc chưa chạy. |
| `reviewer` | Không write. Review độc lập (P6.21) | Cùng P6.21 | Không sửa implementation rồi tự sign-off. |
| `document` | Markdown/docs (P6.22) | Sau khi cả hai gate đạt | Không sửa logic sản phẩm; không viết “đã chạy” khi chưa chạy. |

App repo ngoài monorepo: ghi URL/revision/owner làm external reference; thay đổi thực hiện tại repo đó, không giả vờ source nằm trong Talosmine.

Không song song hóa các bước selection (P6.2), metric semantics (P6.4), contract freeze (P6.7) và production enablement (P6.20).

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
