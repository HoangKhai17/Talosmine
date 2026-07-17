# Phase 7 — Onboarding các ứng dụng còn lại

> Tài liệu này là kế hoạch rollout, không xác nhận bất kỳ app, adapter, credential, API, migration, dashboard hay test nào đã tồn tại.

## 1. Trạng thái

- **Trạng thái:** `blocked`
- **Cổng vào:** Phase 6 đã QA PASS, reviewer hết mục phải sửa và sample app có evidence end-to-end cùng rollback drill.
- **Mô hình rollout:** onboard từng app một theo thứ tự rủi ro được phê duyệt; không bulk-enable nếu chưa có sign-off riêng.
- **Đơn vị nghiệm thu:** từng app có QA/reviewer gate riêng; phase chỉ hoàn tất sau khi mọi app trong phạm vi đều đạt hoặc được loại khỏi scope bằng quyết định có owner.

## 2. Mục tiêu

1. Đưa các app còn lại vào SSO, entitlement và hard quota nhất quán mà vẫn deploy độc lập.
2. Dùng bài học và contract đã chứng minh ở Phase 6 nhưng không giả định mọi app có cùng runtime, framework, route model hoặc metric.
3. Loại mọi đường bypass, kể cả direct URL, backend action và worker, trước khi enable từng app.
4. Cung cấp catalog Hub đầy đủ và năng lực admin theo dõi onboarding/config/audit có kiểm soát.
5. Bảo đảm từng app có canary, feature flag/disable switch, observability, credential lifecycle và rollback độc lập.

## 3. Prerequisites và human decisions

- [ ] Phase 6 có biên bản PASS và adapter/contract limitations đã được ghi lại.
- [ ] Trước Phase 7 contract freeze, phê duyệt **mandatory onboarding roster** liệt kê mọi app bắt buộc và mọi environment bắt buộc của từng app, cùng business owner, engineering owner, security owner, repo URL, deploy target và support contact.
- [ ] Liệt kê optional/future apps riêng; các app này không được tính vào số lượng mandatory đã hoàn tất.
- [ ] Mọi việc loại một app/environment khỏi mandatory roster phải có product-scope decision/ADR được phê duyệt. Báo cáo phải ghi **scope changed**, không gọi app đó là deferred để coi phase hoàn tất.
- [ ] Có risk rubric và thứ tự rollout; exception thay đổi thứ tự cần sign-off.
- [ ] Với từng app, chốt runtime/language/framework hiện có, integration mechanism, Auth0 user client/API/M2M, exact redirects/audience/scopes và local-session model.
- [ ] Với từng feature/metric, chốt stable keys, domain authorization mapping, unit/quantity/counting/failure/window/TTL/late-result semantics và quota giá trị thật.
- [ ] Chốt revoke SLA, outage policy, credential rotation cadence, canary cohort, success/error budgets, rollback owner và thời gian quan sát.
- [ ] Nếu package shared adapter/SDK, cơ chế distribution, ownership, versioning, support languages và compatibility policy phải được duyệt trước.

Không dùng sample app làm “mặc định ngầm” cho quyết định chưa được từng app xác nhận.

## 4. Phạm vi

- Lập inventory và onboarding worksheet riêng cho từng app, gồm direct URL, routes/actions/workers, domain auth, data sensitivity, async behavior và dependencies.
- Rollout từng app theo thứ tự rủi ro, từ canary đến enabled, với sign-off ở mỗi cổng.
- Auth0 client/M2M riêng từng app/backend; exact redirect, issuer, audience và feature/metric capability scopes.
- Tích hợp contract OpenAPI qua adapter/generated client đã được phê duyệt, hỗ trợ app backend nhiều ngôn ngữ.
- User Hub catalog/launch UX cho mọi app trong scope; admin onboarding/status/config/audit views theo contract/RBAC.
- Per-app E2E, security, bypass, worker, entitlement, quota, timeout, duplicate, revoke, outage, observability và rollback.
- Rotation/revoke credential, correlation xuyên hệ thống và runbook vận hành riêng từng app.
- Completion matrix đối chiếu từng app × required environment trong mandatory roster với inventory, config, tests, canary, rollback và per-app sign-off.

## 5. Ngoài phạm vi

- Billing, payment, giá, refund hoặc tự động hóa paid subscription.
- Bắt buộc API gateway; không chuyển business traffic của app qua Hub nếu không có quyết định kiến trúc mới.
- Bulk-enable, shared credential, wildcard redirect/scope hoặc một kill switch chung không cô lập được app.
- Chuyển mọi app repo vào monorepo; repo ngoài chỉ được tham chiếu đúng URL/revision/owner.
- Shared SDK chứa policy logic, plan names, local quota ledger hoặc hard-coded limit.
- Ép mọi backend dùng cùng runtime/language; shared boundary phải dựa trên OpenAPI và hành vi, không dựa vào một framework duy nhất.

## 6. Deliverables

- Master rollout register và worksheet đã duyệt cho từng app.
- Mandatory onboarding roster đã duyệt, optional/future list tách biệt và completion matrix theo từng app × required environment.
- OpenAPI compatibility matrix và distribution/version matrix cho adapter/generated clients.
- Auth0/config register không chứa secret: user client, API audience, M2M client ID metadata, exact redirects/scopes và rotation owner.
- Per-app integration change tại đúng app repo, kèm external commit/release/deployment reference.
- Hub catalog coverage cho tất cả app trong scope; admin onboarding/readiness/config/audit capabilities được contract cho phép.
- Per-app test matrix, evidence, dashboards/alerts, canary/disable/rollback runbook và sign-off record.
- Phase summary về mandatory app/environment đã đạt, mục chưa đạt, approved scope changes/ADR, optional/future apps, residual risk và contract/SDK versions đang được hỗ trợ.

Completion matrix bắt buộc dùng ít nhất cấu trúc sau; mỗi dòng là một cặp mandatory app × required environment đã có trong roster, không gộp nhiều environment vào một ô:

| Mandatory app key | Required environment | Inventory/annex | Auth0/config/scopes | Direct URL/bypass/workers | Entitlement/quota/concurrency/crash | Canary/observability/rollback | QA | Reviewer | Kết quả |
|---|---|---|---|---|---|---|---|---|---|
| _Điền từ mandatory roster đã duyệt_ | _Điền từng environment bắt buộc_ | `blocked` | `blocked` | `blocked` | `blocked` | `blocked` | Chưa sign-off | Chưa sign-off | `blocked` |

Hàng mẫu không phải app thật và không được tính vào completion. Khi roster được duyệt, thay hàng mẫu bằng toàn bộ dòng bắt buộc. Optional/future apps nằm ở danh sách riêng, không được thêm vào matrix để làm tăng số hoàn tất mandatory.

## 7. Target paths

- `contracts/openapi/`: nguồn contract OpenAPI 3.1 và compatibility artifacts.
- `integrations/data-plane/`: shared boundary, templates hoặc generated-client metadata, chỉ theo distribution mechanism đã duyệt.
- `apps/web/`: một frontend owner duy nhất chịu trách nhiệm mọi thay đổi user và admin của Hub.
- `apps/control-plane/drizzle/migrations/`: target duy nhất nếu một forward migration Control Plane được phê duyệt là cần thiết.
- `apps/control-plane/src/main-worker.*`: entrypoint worker Control Plane nếu onboarding cần thay đổi orchestration/reconciliation; worker Data Plane thuộc app repo tương ứng.
- `tests/e2e/`: scenarios liên hệ thống theo app và phase regression.
- `tests/security/`: suites bypass/token/scope/revoke theo app.
- `integrations/sample-data-plane/`: chỉ là reference của Phase 6 nếu path đó đã được quyết định/tạo; không copy nguyên xi vào app khác.
- App repos: external references gồm repository URL, immutable revision/release, owner và CI evidence; không tạo thư mục giả trong monorepo để đại diện source bên ngoài.

Target path cụ thể phải được kiểm tra ở thời điểm thực hiện. Tài liệu không quy định cấu trúc bên trong repo app chưa được duyệt.

## 8. DB/migration

- Onboarding app thông thường dùng các bảng Control Plane hiện có; không tạo table per-app chỉ để lưu integration status hoặc quota cục bộ.
- Application, redirect, feature, approved metric, plan snapshot, subscription và service scopes được cấu hình bằng controlled commands/migrations đã review, có audit theo domain contract.
- Mỗi metric chỉ active sau khi semantics đầy đủ; không seed quota giả, không publish policy thiếu window/timezone/TTL đã duyệt.
- Kiểm tra composite binding application–feature–metric–scope và uniqueness trước canary; không tái sử dụng key của app khác.
- Migration/config rollout phải tách từng app, có dry-run/validation và khả năng disable app mà không ảnh hưởng app đã onboard.
- Nhu cầu schema Control Plane mới phải dừng lane của app đó, qua architect/DB review và test migration/backup/PITR tại `apps/control-plane/drizzle/migrations/`; app độc lập khác chỉ tiếp tục nếu không phụ thuộc và ownership rõ.

## 9. Backend API

- Mọi app dùng OpenAPI version được hỗ trợ cho entitlement decision và quota reserve/commit/cancel/status; contract drift phải bị CI/contract test phát hiện.
- Data Plane xác minh user token/session cục bộ và gửi verified full `issuer + subject`; không truyền internal `accountId` như danh tính.
- Backend gọi bằng M2M identity riêng, audience chính xác và resource-specific scopes; mỗi operation được re-authorize trước khi lộ state.
- Domain authorization mapping là riêng từng app và chạy trước business effect; entitlement/quota không thay thế quyền sở hữu/role domain.
- Hành động tính lượt reserve trước action; commit/cancel đúng metric; worker lưu reservation ID/operation reference và retry cùng idempotency key sau timeout.
- Adapter/client mapping lỗi nhất quán nhưng không che machine reason, không tự retry non-idempotent business action và không fail-open.
- Direct URL và launch từ Hub đi vào cùng backend controls; Hub không proxy request nghiệp vụ.

## 10. User web

- Hub catalog bao phủ mọi app trong rollout register với display metadata, launch URL và trạng thái đã duyệt; app chưa ready/disabled không được trình bày như đang khả dụng.
- Launch không hàm ý entitlement; app vẫn xác thực, authorize và reserve tại backend.
- UX nhất quán cho login required, access denied, quota exhausted, dependency unavailable, processing/unknown outcome và app disabled; không hiển thị reset/quota suy đoán.
- Catalog hỗ trợ tìm/nhận diện app trong phạm vi sản phẩm đã duyệt mà không lộ metadata quản trị hoặc app draft.
- Luồng keyboard, screen reader, focus, loading và error được kiểm chứng; layout usable trên mobile, tablet và desktop.
- Link direct/return URL được allowlist; không đưa token hoặc secret vào query string.

## 11. Admin web

- Cung cấp onboarding worksheet/status/readiness cho từng app: owners, contract/client version, redirects, scopes, metric approval, test/sign-off và rollout state.
- Config mutation chỉ qua admin contract có permission, reason, correlation và transactional audit; không có table editor hoặc secret viewer.
- Audit view cho phép truy vết app/config/scope/revoke/canary action theo permission, có pagination và redaction.
- Không có bulk-enable mặc định. Nếu tính năng bulk được đề xuất sau này, cần threat model và human sign-off riêng; Phase 7 vẫn require per-app gate.
- Status phải phân biệt draft, blocked, ready, canary, enabled, disabled, rolled back; tên state cuối cùng phải freeze trong contract trước implementation.
- Admin view responsive/accessibility tương đương user web, đặc biệt bảng scope/readiness phải dùng được bằng keyboard và màn hình nhỏ.

## 12. Integration/security

- Mỗi app/backend có Auth0 client/M2M credential riêng; không chia sẻ secret giữa app hoặc environment. Secret chỉ ở Auth0/secret manager/CI protected environment.
- Exact callback/logout URL, audience, issuer và resource scopes được review hai người; không wildcard hoặc generic `quota:*` không gắn metric.
- Shared adapter/SDK, nếu được đóng gói, chỉ cung cấp protocol/auth/idempotency/correlation/error primitives dựa trên OpenAPI; không chứa plan name, limit, local quota, entitlement cache policy chưa duyệt hoặc domain auth.
- Distribution phải hỗ trợ nhiều backend language qua generated clients/spec hoặc implementation riêng tương thích; package cho một ngôn ngữ không được gọi là giải pháp chung cho mọi app.
- Rotation tạo identity/credential mới theo runbook, canary, rồi revoke identity cũ; kiểm tra request mới deny sau revoke SLA.
- Per-app disable switch phải cô lập được app, giữ ledger/audit và fail-closed cho action tính lượt.
- Correlation ID xuyên Hub/app/Control Plane/worker; logs/traces/metrics redact token, cookie, secret và PII không cần thiết.

## 13. Contract freeze

Có hai tầng freeze:

1. **Phase contract:** OpenAPI version, auth schemes, reason codes, idempotency/status semantics, compatibility/deprecation và distribution mechanism.
2. **Per-app annex:** exact identity/audience/redirect/scopes, stable feature/metric keys, domain auth mapping, counting examples, async workflow, outage/revoke/rollback và UI mapping.

Không freeze Phase 7 khi mandatory onboarding roster chưa được phê duyệt đủ app và required environments. Mỗi annex phải được app owner, Control Plane owner, security, tester và product owner ký trước implementation. Breaking change phải cập nhật OpenAPI/annex, regenerate hoặc nâng adapter/client, chạy lại provider/consumer contract tests và rollout theo version; không ép mọi app nâng đồng thời nếu compatibility policy chưa cho phép.

Với app có side effect hoặc worker/redelivery, annex phải kế thừa requirement Phase 6 về durable logical operation state trong datastore app, atomic claim/transition, reservation persistence, lease/recovery, side-effect idempotency và approved crash-window evidence; Quota idempotency không bảo đảm business effect exactly once.

## 14. Tests

Mỗi app bắt buộc có checklist test độc lập:

- **Direct URL/Hub launch:** local SSO, exact callback/return URL và cùng backend enforcement.
- **Bypass:** gọi trực tiếp từng protected route/action/API và trigger từng worker/job; browser flags không cấp quyền.
- **Authentication/scope:** missing/expired/wrong issuer/audience token; app/feature/metric cross-binding; thiếu từng capability.
- **Domain authorization/entitlement:** wrong owner/role, no subscription, deny/revoke override, disabled account và app disabled.
- **Quota:** reserve trước action, exhaustion, quantity boundary, commit/cancel/failure treatment và không local approval.
- **Concurrency/duplicate:** last unit, simultaneous calls, duplicated delivery/job và same/different idempotency fingerprint.
- **Concurrent/crash side effect:** barrier cho duplicate request/worker cùng logical operation và crash injection ở ba cửa sổ Phase 6; chứng minh nhiều nhất một irreversible effect và quota đúng. Sequential redelivery không đủ.
- **Timeout:** reserve/commit/cancel response loss, status lookup, retry cùng key, unknown outcome và late result theo policy.
- **Revoke/rotation:** user session/account/entitlement/M2M/từng scope revoke; overlap rotation và old credential denial.
- **Outage:** Auth0/Control Plane/database/network unavailable; policy fail-closed hoặc approved low-risk behavior chính xác.
- **Rollback:** canary disable, app/config/client rollback, pending reservation reconciliation và re-enable gate.

Phase regression phải chạy lại contract và critical security/concurrency scenarios của các app đã enable khi shared contract/adapter thay đổi.

## 15. Ordered steps

1. Xác minh Phase 6 PASS; phê duyệt mandatory onboarding roster theo app × required environment, tách optional/future list, rồi chốt risk rubric, owners và rollout order.
2. Lập master register và completion matrix; với từng mandatory app/environment, hoàn thành inventory route/action/worker/direct URL/domain auth/repo/deploy.
3. Chốt metric/counting/quota/outage/revoke/async semantics và per-app annex; blocker giữ app ở `blocked`.
4. Freeze phase contract/distribution/version policy; xác nhận ngôn ngữ nào có adapter/client được hỗ trợ thật.
5. Provision Auth0 user client/API/M2M riêng và secret-store references; review exact redirects/audience/scopes.
6. Cấu hình catalog/feature/metric/plan/subscription/scope bằng controlled commands; validate không fake/default.
7. Tích hợp tại app repo, Hub và admin lanes; thêm observability, canary flag và disable switch.
8. Chạy per-app contract/E2E/security/bypass/worker/quota/concurrency/timeout/revoke/outage/accessibility/responsive/rollback tests.
9. QA và reviewer sign-off app; canary cohort theo thời gian quan sát đã duyệt.
10. Đối soát usage/audit/error budget; enable app hoặc rollback. Chỉ sau đó mới bắt đầu enable app kế tiếp, trừ lanes thực sự độc lập.
11. Sau mọi mandatory app/environment, chạy phase regression, credential inventory/rotation review, catalog coverage audit và đối chiếu completion matrix không còn ô bắt buộc thiếu.
12. QA/reviewer phase sign-off; scope removal chỉ hợp lệ khi có approved product-scope decision/ADR và phase report ghi `scope changed`. Optional/future apps được báo riêng.

## 16. Parallel lanes và ownership

- Có thể song song **inventory/implementation/test preparation** cho nhiều app khi không dùng chung file, environment, credential, migration, rollout window và có owner rõ.
- Không song song production enablement nếu shared Control Plane capacity, incident response hoặc canary observation không đủ cô lập.
- Một app còn `blocked` không buộc implementation lane của app độc lập khác dừng nếu contract đã freeze, không có dependency và architect xác nhận không ảnh hưởng; tuy nhiên Phase 7 và Phase 8 vẫn `blocked` cho tới khi app mandatory đó đạt hoặc roster thay đổi bằng approved product-scope ADR.
- Trong mỗi app, lanes Control Plane config, app repo, frontend, tester và ops/security chỉ chạy song song sau per-app annex freeze.
- Một frontend owner duy nhất sở hữu toàn bộ `apps/web/**`, gồm cả user catalog/launch và admin onboarding/status/config/audit; không tách Hub user/Admin thành hai simultaneous owners.
- Một owner OpenAPI/shared duy nhất sở hữu `contracts/openapi/`, shared adapter/generated clients và compatibility artifacts; consumer apps pin version. Không sửa package chung giữa lúc canary nếu chưa có compatibility/retest plan.
- QA và reviewer độc lập với implementation lanes; ownership file/repo phải rõ trước khi giao việc.

## 17. Checklist

**Functional**
- [ ] Mandatory onboarding roster đã duyệt liệt kê mọi app × required environment; optional/future list tách riêng.
- [ ] Completion matrix có một dòng cho từng mandatory app/environment và không có ô sign-off bắt buộc bị bỏ trống.
- [ ] Mỗi app có worksheet/inventory đầy đủ và cả Hub launch/direct URL hoạt động theo contract.
- [ ] Mọi protected route/action/worker có authz/feature/metric mapping và evidence.
- [ ] Catalog bao phủ tất cả mandatory app; disabled hiển thị đúng policy. Scope removal có approved product-scope ADR và được báo là `scope changed`.

**Security**
- [ ] Unique Auth0 clients/M2M, exact redirects/audiences/scopes và no-secret-in-repo được xác nhận từng app.
- [ ] Bypass, cross-app binding, revoke, rotation và domain authorization tests pass từng app.

**Database**
- [ ] Không table per-app không cần thiết; config qua controlled commands và audit.
- [ ] Không fake quota; metric approved trước policy; bindings/immutable ledger/history được validate.

**Concurrency**
- [ ] Last-unit, duplicate worker, retry/fingerprint conflict và terminal transition tests pass từng metric.
- [ ] Shared adapter không tạo key/reservation mới sau timeout.
- [ ] App có side effect vượt concurrent barrier và crash injection; nhiều nhất một irreversible effect, quota đúng và không dùng sequential redelivery thay evidence.

**Accessibility**
- [ ] Catalog, app launch/error/quota và admin readiness/audit dùng được bằng keyboard/screen reader, focus/announcement đúng.

**Responsive**
- [ ] User/admin surfaces được kiểm chứng trên mobile, tablet, desktop; bảng/readiness có responsive alternative.

**Observability**
- [ ] Correlation, dashboard, alert và owner/runbook riêng từng app; đo denial, timeout, reservation age, error budget và revoke.
- [ ] Log/trace redaction và retention đúng policy.

**Rollback**
- [ ] Canary, disable switch, credential revoke/rotation, config/app rollback và reconciliation đã drill từng app.
- [ ] Rollback app A không làm gián đoạn app B và không xóa ledger/audit.

**Docs**
- [ ] Roster, optional/future list, completion matrix, scope-change ADR, annex, contract/client versions, external repo revisions, test evidence, runbooks và sign-offs cập nhật đúng thực tế.

## 18. Exit gate

- Mọi app × required environment trong mandatory onboarding roster đã qua per-app QA PASS và reviewer không còn mục phải sửa.
- Không app mandatory nào được “deferred” để đạt gate. Việc loại khỏi roster chỉ hợp lệ qua approved product-scope decision/ADR; completion matrix và phase report phải ghi `scope changed`.
- Optional/future apps được liệt kê riêng và không được dùng để thay thế hoặc làm đủ số lượng mandatory.
- Hub catalog phản ánh đầy đủ trạng thái thực; admin có onboarding/status/config/audit views đúng contract và RBAC.
- Mỗi app chứng minh direct URL, bypass protection, worker enforcement, entitlement, quota, timeout, duplicate, revoke, outage và rollback.
- Không app dùng shared credential, wildcard scope, policy/plan name/local quota trong adapter hoặc business traffic proxy qua Hub.
- Canary/disable/rollback và credential rotation/revoke có evidence từng app; correlation/alerts có owner.
- Phase regression pass trên contract và critical flows của app đã enable; QA/reviewer phase sign-off hoàn tất.
- Phase 8 tiếp tục `blocked` nếu còn bất kỳ mandatory app/environment nào chưa hoàn tất hoặc thiếu per-app sign-off.

## 19. Stop/rollback

Dừng lane/rollout của app khi: inventory thiếu; metric/counting chưa duyệt; repo/owner không rõ; exact identity/scope không xác nhận; contract/client incompatibility; bypass; wrong audience/scope được chấp nhận; double-spend/double-count; secret lộ; outage behavior sai; rollback không cô lập; hoặc cùng lỗi lặp lần hai.

Dừng phase sign-off và giữ Phase 8 ở `blocked` khi mandatory roster chưa được duyệt, completion matrix thiếu app/environment, có mandatory app chưa pass, hoặc một app bị loại mà không có approved product-scope decision/ADR. Không đổi nhãn thành deferred để né gate.

Rollback riêng app: disable switch → dừng canary/action mới → bảo toàn và đối soát reservations → revoke/rotate credential nếu cần → rollback app/config/client version tương thích → kiểm tra catalog/admin state → rerun mandatory tests → QA/reviewer re-sign trước enable. Nếu lỗi nằm ở shared contract/adapter, đóng băng rollout app khác, đánh giá blast radius và rollback/pin version theo compatibility plan; không xóa usage/audit hoặc sửa published snapshot.

## 20. QA/reviewer sign-off

- **Per app:** QA chạy checklist direct URL, bypass, workers, entitlement, quota, timeout, duplicate, revoke, outage, accessibility/responsive và rollback; reviewer kiểm tra inventory coverage, scopes, authz order, idempotency, SDK boundaries, observability và repo evidence.
- **Per phase:** QA đối chiếu mandatory roster với completion matrix, regression/cross-app isolation/catalog coverage/credential inventory; reviewer kiểm tra mọi mandatory app/environment có sign-off, mọi scope removal có approved ADR, không bulk-enable và không gateway/billing scope creep.
- Mỗi app cần hai sign-off độc lập trước enable; sign-off phase không thay sign-off app và ngược lại.
- Finding phải có owner/evidence; implementation lane sửa code/config, không sửa test để che lỗi. Nếu lệnh chưa tồn tại, QA báo đúng sự thật.
- Tối đa ba vòng theo `AGENTS.md`; chỉ tại bước verification mới kết luận **ĐẠT**, **TẮC** hoặc **CẠN LƯỢT**. Kế hoạch này không tự chứng minh implementation đã tồn tại.
