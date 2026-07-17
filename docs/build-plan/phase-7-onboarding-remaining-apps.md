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

**Approver duy nhất cho mọi quyết định nghiệp vụ/bảo mật/vận hành dưới đây là chủ dự án** (`./decision-register.md`, DEC-G01). Dự án là solo dev + AI agents; không có business owner, engineering owner, security owner, product owner hay operations team tách biệt ký duyệt chéo. Agent không tự approve thay con người, kể cả khi đề xuất do agent soạn.

Roster vẫn giữ **các cột owner** cho từng app — chúng ghi ai chịu trách nhiệm cho app đó, không phải một chuỗi phê duyệt nhiều người. Với dự án solo, các cột này cùng trỏ về chủ dự án nhưng **vẫn phải điền tường minh** cho từng app; để trống là blocker, không phải mặc định.

Việc gộp vai **không** làm giảm yêu cầu kiểm chứng: `qa` và `reviewer` vẫn tách khỏi lane viết code và giữ `edit: deny` theo `../../AGENTS.md` mục 4b. Yêu cầu “hai sign-off độc lập trước enable” ở mục 20 nghĩa là `qa` **và** `reviewer`, không phải hai con người.

- [ ] Phase 6 có biên bản PASS và adapter/contract limitations đã được ghi lại.
- [ ] Trước Phase 7 contract freeze, chủ dự án phê duyệt **mandatory onboarding roster** liệt kê mọi app bắt buộc và mọi environment bắt buộc của từng app, cùng owner nghiệp vụ, owner kỹ thuật, owner bảo mật, repo URL, deploy target và support contact.
- [ ] Liệt kê optional/future apps riêng; các app này không được tính vào số lượng mandatory đã hoàn tất.
- [ ] Mọi việc loại một app/environment khỏi mandatory roster phải có product-scope decision/ADR được **chủ dự án** phê duyệt. Báo cáo phải ghi **scope changed**, không gọi app đó là deferred để coi phase hoàn tất.
- [ ] Có risk rubric và thứ tự rollout; exception thay đổi thứ tự cần chủ dự án sign-off.
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

Không freeze Phase 7 khi mandatory onboarding roster chưa được phê duyệt đủ app và required environments. Mỗi annex phải được **chủ dự án** ký trước implementation (DEC-G01) — đây là một người ký, không phải chuỗi phê duyệt nhiều vai. `architect` review read-only trước khi ký và `tester` xác nhận annex đủ để viết test; cả hai là lane kỹ thuật, **không phải** approver, và không thay thế chữ ký của chủ dự án. Breaking change phải cập nhật OpenAPI/annex, regenerate hoặc nâng adapter/client, chạy lại provider/consumer contract tests và rollout theo version; không ép mọi app nâng đồng thời nếu compatibility policy chưa cho phép.

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

Runbook thực thi theo mạch **cổng vào P6 → roster + rollout order → phase contract freeze → vòng lặp per-app (annex → Auth0 → config → tích hợp → test → gate → canary → enable) → phase regression → phase sign-off**. Mỗi bước có ID `P7.n` và ghi đủ năm thành phần: **Hành động**, **Sản phẩm**, **Phụ thuộc**, **Verify**, **Lane** (khớp mục 16).

Tên lệnh lấy từ **DEC-T15** của `./decision-register.md`; version/package lấy từ **bảng D** cùng file. Script chỉ tồn tại thật sau `P1.7`; không bước nào dưới đây được đánh dấu “đã chạy”.

**Ràng buộc chi phối toàn phase:** `DEC-B01` (danh sách ứng dụng của Hub) đang `open` — **không có app nào tồn tại trong repo**. Số bước `P7.8`–`P7.16` lặp **một lần cho mỗi cặp mandatory app × required environment** trong roster; số vòng lặp chỉ biết được sau `P7.2`. Không tên app, metric key, quota number, owner hay môi trường nào được điền trước khi chủ dự án chốt; mọi ô như vậy ghi `‹cần chốt: …›` và là blocker cứng. Approver duy nhất là **chủ dự án** (`DEC-G01`). Không dùng sample app của P6 làm “mặc định ngầm” cho quyết định mà từng app chưa xác nhận.

### Nhóm A — Cổng vào và roster

1. **P7.1 — Xác nhận cổng vào Phase 6**
   - **Hành động:** Đối chiếu bảng gate mục 20 của `./phase-6-sample-data-plane-e2e.md`: QA PASS, reviewer hết mục phải sửa, sample app có evidence end-to-end **và** rollback drill. Ghi lại các limitation của adapter/contract phát hiện ở P6 — chúng là input bắt buộc cho annex từng app.
   - **Sản phẩm:** Danh sách limitation adapter/contract (ghi vào mục 3 của file này).
   - **Phụ thuộc:** Phase 6 `verified`.
   - **Verify:** Mọi dòng “Kết quả” trong bảng mục 20 của P6 là PASS và trạng thái P6 tại `./README.md` là `verified`; evidence rollback drill P6 tồn tại và truy được. Thiếu bất kỳ mục nào → P7 giữ `blocked`.
   - **Lane:** `orchestrator`.

2. **P7.2 — Phê duyệt mandatory onboarding roster (blocker lớn nhất)**
   - **Hành động:** Trình chủ dự án chốt **mandatory onboarding roster**: mọi app bắt buộc × mọi environment bắt buộc của từng app, kèm owner nghiệp vụ, owner kỹ thuật, owner bảo mật, repo URL, deploy target và support contact. Liệt kê optional/future apps thành **danh sách riêng** — không tính vào số mandatory đã hoàn tất. Với dự án solo, các cột owner cùng trỏ về chủ dự án (DEC-G01), nhưng **vẫn phải điền tường minh** cho từng app — để trống là blocker, không phải mặc định.
   - **Sản phẩm:** `DEC-B01` chuyển `approved` tại `./decision-register.md`; mandatory roster + optional/future list trong master register.
   - **Phụ thuộc:** P7.1. **Blocker:** `‹cần chốt: DEC-B01 danh sách ứng dụng của Hub — app nào mandatory, app nào optional/future›`; `‹cần chốt: required environment cho từng app›`; `‹cần chốt: repo URL / deploy target / owner từng app›`.
   - **Verify:** `./decision-register.md` mục B: `DEC-B01` là `approved` kèm ngày và approver là chủ dự án; roster không còn ô owner/repo/environment trống; mỗi app trong roster có nhãn `mandatory` hoặc `optional/future`, không có app nào không nhãn. Còn `open` → không freeze phase contract, dừng tại đây.
   - **Lane:** `orchestrator` điều phối; chủ dự án approve.

3. **P7.3 — Risk rubric và rollout order**
   - **Hành động:** Chốt risk rubric (tiêu chí chấm: data sensitivity, số side-effect path, có worker/async hay không, số user, khả năng rollback) và xếp thứ tự rollout **từ rủi ro thấp lên cao**. Mọi exception đổi thứ tự cần sign-off riêng của chủ dự án.
   - **Sản phẩm:** Risk rubric + rollout order trong master register.
   - **Phụ thuộc:** P7.2. **Blocker:** `‹cần chốt: risk rubric và thứ tự rollout đã duyệt›`.
   - **Verify:** Mỗi app mandatory có đúng một điểm rủi ro tính từ rubric và đúng một vị trí trong thứ tự; thứ tự là sắp xếp đơn điệu theo điểm, hoặc lệch có sign-off ghi rõ lý do. Hai app cùng vị trí → sửa trước khi đi tiếp.
   - **Lane:** `orchestrator`; chủ dự án approve.

4. **P7.4 — Master register và completion matrix**
   - **Hành động:** Thay hàng mẫu của completion matrix ở mục 6 bằng **toàn bộ** dòng bắt buộc: một dòng cho mỗi cặp mandatory app × required environment, không gộp nhiều environment vào một ô. Khởi tạo mọi ô trạng thái là `blocked`, mọi ô sign-off là “Chưa sign-off”. Optional/future apps giữ ở danh sách riêng, **không** được thêm vào matrix.
   - **Sản phẩm:** Completion matrix tại mục 6 của file này.
   - **Phụ thuộc:** P7.2, P7.3.
   - **Verify:** Đếm số dòng matrix = tổng số cặp (app mandatory × required environment) trong roster P7.2 — hai số phải bằng nhau; hàng mẫu đã bị thay, không còn dòng `_Điền từ mandatory roster đã duyệt_`; không dòng nào thuộc optional/future list.
   - **Lane:** `document` (viết matrix theo roster đã duyệt); `orchestrator` đối chiếu.

### Nhóm B — Phase contract freeze

5. **P7.5 — Freeze phase contract, distribution và version policy**
   - **Hành động:** Freeze tầng 1 (phase contract): OpenAPI version dùng cho entitlement decision và `reserve`/`commit`/`cancel`/`status`, auth scheme, reason code, idempotency/status semantics, compatibility/deprecation policy và **cơ chế distribution**. Xác nhận **ngôn ngữ nào thật sự có adapter/generated client được hỗ trợ** — package cho một ngôn ngữ không được gọi là giải pháp chung cho mọi app. Shared adapter chỉ chứa protocol/auth/idempotency/correlation/error primitives; **không** plan name, limit, local quota, entitlement cache policy chưa duyệt hay domain auth.
   - **Sản phẩm:** `contracts/openapi/control-plane.v1.yaml` (revision freeze, ghi commit); `integrations/data-plane/` distribution/version matrix.
   - **Phụ thuộc:** P7.4. **Blocker:** `‹cần chốt: runtime/language của từng backend trong roster›` (quyết định ngôn ngữ nào cần client); `‹cần chốt: cơ chế distribution + versioning + compatibility policy›`.
   - **Verify:** `pnpm openapi:lint` trả 0 lỗi; `pnpm openapi:drift` pass. `grep` `integrations/data-plane/`: không xuất hiện plan name, limit số, ledger cục bộ hay domain auth rule. Distribution matrix có một dòng cho mỗi ngôn ngữ trong roster và ghi rõ dòng nào **chưa** được hỗ trợ — không để trống ngụ ý “có”. Roster chưa `approved` → **không freeze** (mục 13).
   - **Lane:** `backend` (writer duy nhất của `contracts/openapi/**`) + `architect` (review/freeze read-only).

### Nhóm C — Vòng lặp per-app (P7.6–P7.14 lặp cho **mỗi** cặp app × environment, theo thứ tự P7.3)

> Một app còn `blocked` không buộc lane của app độc lập khác dừng, nếu contract đã freeze, không có dependency chung (file, environment, credential, migration, rollout window) và architect xác nhận không ảnh hưởng. Nhưng **production enablement không song song** (P7.15).

6. **P7.6 — Inventory protected surface của app**
   - **Hành động:** Với app đang xét: liệt kê đầy đủ direct URL, route, action, endpoint, worker/job, webhook, domain auth rule, data sensitivity, async behavior và dependency. Mỗi dòng ghi: surface ID, có side effect hay không, có tính lượt hay không, feature/metric dự kiến, test ID.
   - **Sản phẩm:** Onboarding worksheet của app (bảng inventory).
   - **Phụ thuộc:** P7.5. **Blocker:** `‹cần chốt: repo URL + revision của app (P7.2)›`.
   - **Verify:** Số dòng inventory bằng số surface đếm được từ source thật của app repo tại revision đã ghi; không dòng nào trống cột feature/metric hoặc test ID; ô “Inventory/annex” của app trong completion matrix chỉ rời `blocked` sau khi bảng này đầy đủ.
   - **Lane:** `architect` (read-only) + `orchestrator`.

7. **P7.7 — Chốt semantics và freeze per-app annex**
   - **Hành động:** Freeze tầng 2 (per-app annex): exact identity/audience/redirect/scopes; stable `applicationKey`/`featureKey`/`metricKey`; domain auth mapping riêng của app; unit/quantity/counting point/failure treatment/window/timezone/TTL/late-result và **quota giá trị thật**; async workflow; outage/revoke/rollback; UI reason-code mapping. Nếu app có side effect hoặc worker/redelivery, annex **kế thừa nguyên requirement P6**: durable logical operation state trong datastore app, atomic claim/transition, reservation persistence, lease/recovery, side-effect idempotency và approved evidence cho ba crash window — quota idempotency **không** bảo đảm business effect exactly once.
   - **Sản phẩm:** Per-app annex trong worksheet (đã ký freeze).
   - **Phụ thuộc:** P7.6. **Blocker:** `‹cần chốt: DEC-B05 metric/unit/amount của app này›`; `‹cần chốt: DEC-B06 counting point + failure treatment›`; `‹cần chốt: DEC-B07 window/timezone/DST›`; `‹cần chốt: DEC-B08 TTL + late-result›`; `‹cần chốt: DEC-B10 revoke SLA + outage policy›`; `‹cần chốt: quota limit thật của từng metric›`; `‹cần chốt: crash-window evidence source nếu app có side effect›`.
   - **Verify:** Mỗi surface tính lượt ở P7.6 có đúng một dòng counting example cho mỗi outcome (success / domain failure / user cancel / dependency failure / timeout / duplicate / late result); không ô nào ghi “giống sample app” mà không có xác nhận riêng của app này; annex có chữ ký freeze của chủ dự án + architect review read-only. Còn blocker → app giữ `blocked`, các app khác vẫn chạy được.
   - **Lane:** `architect` (review/freeze) + `orchestrator`; chủ dự án approve.

8. **P7.8 — Provision Auth0 riêng cho app**
   - **Hành động:** Theo `DEC-T14`: tạo **riêng** cho app này user client (nếu app có user flow), API audience đúng và **một M2M application riêng** cho backend. Không dùng chung secret giữa app hoặc environment. Exact callback/logout URL, issuer, audience và **resource-specific scopes** — không wildcard, không `quota:*` không gắn metric. Secret chỉ ở Auth0/secret manager/CI protected environment. Ghi rotation owner và cadence.
   - **Sản phẩm:** Auth0/config register (client ID metadata, audience, exact redirects/scopes, rotation owner) — **không chứa secret**.
   - **Phụ thuộc:** P7.7. **Blocker:** `‹cần chốt: DEC-B03 Auth0 tenant/environment thật, issuer, audience›`; `‹cần chốt: DEC-B10 credential rotation cadence›`.
   - **Verify:** Register cho thấy client ID của app này **khác** mọi client ID đã có (so từng cặp, không trùng); mọi redirect là exact string không chứa `*`; `grep` toàn repo không trả secret/token/cookie value. Review hai bước: `architect` đọc lại scope list và xác nhận mỗi scope gắn đúng một feature hoặc một metric.
   - **Lane:** `orchestrator` (cần chủ dự án phê duyệt cụ thể) + `architect` (review read-only).

9. **P7.9 — Cấu hình catalog/feature/metric/plan/subscription/scope cho app**
   - **Hành động:** Nạp bằng **controlled command đã có từ P3/P4/P5** (permission, reason, correlation, audit), không SQL ad hoc: application + `launch_url` (https, host allowlist, chặn private/link-local theo `DEC-T12`), exact redirects, feature, metric (chỉ active sau khi semantics đầy đủ ở P7.7), plan snapshot, subscription, service identity + scope `entitlement:decide` gắn feature và `quota:*` gắn metric. Rollout config **tách từng app**, có dry-run/validation và khả năng disable app này mà không ảnh hưởng app đã onboard. Không seed quota giả, không publish policy thiếu window/timezone/TTL.
   - **Sản phẩm:** Config rows + audit rows trong Control Plane DB; config inventory trong worksheet.
   - **Phụ thuộc:** P7.8. **Blocker:** `‹cần chốt: DEC-B04 account activation + default plan›`; `‹cần chốt: applicationKey/featureKey/metricKey thật của app›`.
   - **Verify:** psql: mỗi mutation có đúng một audit row; `SELECT capability, feature_id, usage_metric_id FROM control_plane.service_identity_scopes WHERE service_identity_id = ‹identity app này›` cho thấy `entitlement:decide` có feature non-null + metric null và mọi `quota:*` có metric non-null + feature null; thử grant scope trỏ metric của app khác kỳ vọng bị composite FK reject; `SELECT limit_quantity, window_type, reservation_ttl_seconds FROM control_plane.plan_quota_policies WHERE usage_metric_id = ‹metric app này›` khớp từng ô với annex P7.7, không ô null. Key trùng key của app khác → dừng, không tái sử dụng.
   - **Lane:** `backend`.

10. **P7.10 — Tích hợp tại app repo**
    - **Hành động:** Trong repo của app: local SSO + verify token/session (`issuer`/`audience`/`exp`/subject) và gửi full verified `issuer + subject` — **không** truyền internal `accountId` như danh tính; domain authorization chạy trước business effect; reserve trước hành động tính lượt, commit/cancel đúng metric; worker lưu reservation ID + operation reference và retry **cùng** idempotency key sau timeout; direct URL và launch từ Hub vào **cùng** backend controls. Nếu app có side effect: durable operation state + atomic claim + lease/recovery + side-effect uniqueness guard theo annex P7.7. Adapter map lỗi nhất quán nhưng **không** che machine reason, không tự retry non-idempotent business action, không fail-open.
    - **Sản phẩm:** Thay đổi tại app repo (ghi external commit/release/deployment reference vào worksheet).
    - **Phụ thuộc:** P7.9. **Blocker:** `‹cần chốt: runtime/framework/datastore của app này›`.
    - **Verify:** Xem P7.13 — bước này không tự tuyên bố đạt. Kiểm tra tĩnh trước: `grep` app source không chứa plan name, limit số hay quota ledger cục bộ; mỗi surface có side effect trong inventory P7.6 có đúng một durable operation key và một uniqueness guard; claim là câu lệnh atomic, không phải read-then-write.
    - **Lane:** `backend` (làn code app repo).

11. **P7.11 — Observability, canary flag và disable switch**
    - **Hành động:** Thêm cho app này: correlation ID xuyên Hub/app/Control Plane/worker; dashboard/alert đo denial, timeout, reservation age, error budget và revoke, có owner/runbook riêng; **canary flag** và **per-app disable switch** cô lập được app — tắt app A không ảnh hưởng app B, giữ ledger/audit và fail-closed cho action tính lượt. Log/trace/metric redact token, cookie, secret và PII không cần thiết.
    - **Sản phẩm:** Config observability + runbook vận hành riêng của app.
    - **Phụ thuộc:** P7.10. **Blocker:** `‹cần chốt: DEC-B10 outage policy + rollback owner›`; `‹cần chốt: DEC-B11 log retention/redaction policy›`; `‹cần chốt: success/error budget của app›`.
    - **Verify:** Bật disable switch của app này → request tính lượt của app này deny fail-closed, trong khi request của một app đã enable khác vẫn pass (test cô lập); psql cho thấy `usage_events` count **không đổi** khi disable. Truy một correlation ID mẫu xuyên Hub → app → Control Plane → worker. Log mẫu không chứa token/cookie/secret.
    - **Lane:** `orchestrator` (infra/CI, cần chủ dự án phê duyệt) + `backend`.

12. **P7.12 — Hub catalog và admin onboarding view cho app**
    - **Hành động:** Trong `apps/web/`: thêm app vào catalog với display metadata/launch URL/trạng thái đã duyệt — app chưa ready/disabled **không** được trình bày như đang khả dụng và launch **không** hàm ý entitlement. UX nhất quán cho login required / access denied / quota exhausted / dependency unavailable / processing-unknown outcome / app disabled; không hiển thị reset/quota suy đoán. Admin: onboarding worksheet/status/readiness (owners, contract/client version, redirects, scopes, metric approval, test/sign-off, rollout state); state phân biệt draft/blocked/ready/canary/enabled/disabled/rolled back theo tên đã freeze ở contract; **không** bulk-enable, không table editor, không secret viewer.
    - **Sản phẩm:** `apps/web/`.
    - **Phụ thuộc:** P7.9. Chạy **song song** với P7.10/P7.11.
    - **Verify:** `pnpm test:e2e` — app ở trạng thái draft/disabled không render như khả dụng; mỗi reason code render đúng chuỗi từ contract, không hard-code reset time; không tồn tại control bulk-enable trong DOM. `tests/web/` a11y: catalog + launch/error/quota + admin readiness/audit dùng được bằng keyboard/screen reader, focus/announcement đúng; responsive: bảng scope/readiness có alternative trên màn hình nhỏ. Render admin không chứa secret.
    - **Lane:** `frontend` (một owner duy nhất cho `apps/web/**`).

13. **P7.13 — Chạy per-app test suite**
    - **Hành động:** Chạy đủ checklist mục 14 cho app này: direct URL/Hub launch; bypass **từng** protected route/action/API và trigger **từng** worker/job; authentication/scope (missing/expired/wrong issuer/audience, cross-binding, thiếu từng capability); domain authorization/entitlement (wrong owner/role, no subscription, deny/revoke override, disabled account, app disabled); quota (reserve trước action, exhaustion, quantity boundary, commit/cancel/failure treatment, không local approval); concurrency/duplicate (last unit, simultaneous, duplicated delivery, same/different fingerprint); concurrent barrier + crash injection ba cửa sổ nếu app có side effect; timeout; revoke/rotation; outage; rollback. Lỗi thuộc code — chủ lane sửa, **không** bẻ test.
    - **Sản phẩm:** Output test thật + per-app test matrix có evidence.
    - **Phụ thuộc:** P7.10, P7.11, P7.12.
    - **Verify:** `pnpm test`, `pnpm test:e2e`, `pnpm test:concurrency` (testcontainers, PostgreSQL thật — `DEC-T05`); dán **output thật**. Đối chiếu số dòng test matrix với số surface ở P7.6 — bằng nhau, không surface nào thiếu. Last-unit không double-spend; barrier chứng minh nhiều nhất một irreversible effect; crash injection ở cả ba cửa sổ phục hồi theo approved evidence — **sequential redelivery không đủ**; shared adapter **không** tạo key/reservation mới sau timeout (psql: `count(*)` reservation theo operation reference vẫn là 1).
    - **Lane:** `tester` chạy suite; `backend`/`frontend` sửa nếu fail.

14. **P7.14 — Per-app QA + reviewer sign-off**
    - **Hành động:** QA độc lập chạy/đối chiếu checklist direct URL, bypass, worker, entitlement, quota, timeout, duplicate, revoke, outage, accessibility/responsive và rollback; lệnh chưa tồn tại thì **báo đúng sự thật**. Reviewer kiểm inventory coverage, scopes, thứ tự authz (scope trước identity resolution), idempotency, SDK boundary (không policy/plan/limit trong adapter), observability và repo evidence. **Hai sign-off độc lập** là bắt buộc trước enable. Lặp tối đa ba vòng.
    - **Sản phẩm:** Cập nhật dòng của app trong completion matrix (mục 6).
    - **Phụ thuộc:** P7.13.
    - **Verify:** QA gate PASS với evidence thật và reviewer hết mục “phải sửa” → các ô của app trong completion matrix rời `blocked`. Cùng lỗi lặp lần thứ hai / thiếu quyết định chủ dự án / thiếu credential → **TẮC**. Hết ba vòng → **CẠN LƯỢT**, ghi metadata `verification_outcome: exhausted`, app giữ `blocked`.
    - **Lane:** `qa` + `reviewer` (edit deny — độc lập với lane code theo `../../AGENTS.md` mục 4b).

15. **P7.15 — Canary rồi enable hoặc rollback (không song song)**
    - **Hành động:** Bật canary cohort đã duyệt trong thời gian quan sát đã duyệt; đối soát usage/audit/error budget. Trong budget → enable app. Ngoài budget hoặc có incident → rollback theo mục 19: disable switch → dừng action mới → bảo toàn/đối soát reservation → revoke/rotate credential nếu cần → rollback app/config/client → kiểm catalog/admin state → rerun mandatory tests → QA/reviewer re-sign. **Chỉ sau khi app này enable hoặc rollback xong** mới bắt đầu enablement của app kế tiếp theo thứ tự P7.3.
    - **Sản phẩm:** Canary/rollback evidence; trạng thái rollout của app trong master register.
    - **Phụ thuộc:** P7.14 (cả hai sign-off). **Blocker:** `‹cần chốt: canary cohort + thời gian quan sát + error budget›`.
    - **Verify:** Trong cửa sổ quan sát, dashboard cho thấy denial/timeout/reservation age/error budget nằm trong ngưỡng đã duyệt; đối soát psql bucket ↔ reservation ↔ event khớp, không double count. Rollback drill: disable app này → app đã enable khác **không** gián đoạn (đo bằng request thật), `usage_events` không bị xóa. Không xóa usage/audit và không sửa published snapshot.
    - **Lane:** `orchestrator` (canary/enable, cần chủ dự án phê duyệt cụ thể) + `backend`.

16. **P7.16 — Quay lại P7.6 cho app kế tiếp**
    - **Hành động:** Lặp P7.6–P7.15 cho cặp app × environment kế tiếp theo thứ tự P7.3, cho tới khi mọi dòng mandatory trong completion matrix đã đạt hoặc bị loại bằng **approved product-scope decision/ADR**.
    - **Sản phẩm:** Completion matrix được cập nhật dần.
    - **Phụ thuộc:** P7.15 của app trước.
    - **Verify:** Sau mỗi vòng, đếm số dòng matrix đã đạt và số dòng còn `blocked`; con số phải cộng đúng tổng dòng mandatory. App bị loại phải có ADR truy được và matrix ghi `scope changed` — **không** đổi nhãn thành “deferred” để né gate.
    - **Lane:** `orchestrator`.

### Nhóm D — Đóng phase

17. **P7.17 — Phase regression**
    - **Hành động:** Sau khi mọi mandatory app × environment đã xử lý xong: chạy lại contract test và critical security/concurrency scenario của **tất cả** app đã enable — bắt buộc khi shared contract/adapter đã thay đổi trong quá trình rollout.
    - **Sản phẩm:** Output regression thật.
    - **Phụ thuộc:** P7.16 (mọi dòng mandatory đã đạt hoặc `scope changed`).
    - **Verify:** `pnpm openapi:drift`, `pnpm test`, `pnpm test:e2e`, `pnpm test:concurrency` — pass cho mọi app đã enable; dán output thật. Một app fail regression → dừng phase sign-off, rollback/pin version theo compatibility plan, đóng băng rollout khác.
    - **Lane:** `tester` chạy suite; `backend`/`frontend` sửa nếu fail.

18. **P7.18 — Credential inventory và catalog coverage audit**
    - **Hành động:** Rà toàn bộ Auth0/config register: mỗi app/backend có credential riêng, không shared, không wildcard scope, không `quota:*` không gắn metric; rotation owner và cadence có mặt cho từng credential. Audit catalog: mọi mandatory app hiển thị đúng trạng thái thật; app disabled hiển thị đúng policy; không app draft nào lộ ra user.
    - **Sản phẩm:** Credential inventory + catalog coverage report.
    - **Phụ thuộc:** P7.17. **Blocker:** `‹cần chốt: DEC-B10 rotation cadence›`.
    - **Verify:** So từng cặp client ID trong register — không cặp nào trùng; psql `SELECT capability, usage_metric_id FROM control_plane.service_identity_scopes WHERE status = 'active' AND capability LIKE 'quota:%' AND usage_metric_id IS NULL` kỳ vọng trả **0 dòng**. Số app hiển thị trong catalog = số app mandatory `enabled` trong matrix; `grep` toàn repo không trả secret.
    - **Lane:** `qa` (đọc/đối chiếu) + `architect` (review read-only).

19. **P7.19 — Phase QA + reviewer sign-off**
    - **Hành động:** QA đối chiếu mandatory roster ↔ completion matrix, regression, cross-app isolation, catalog coverage và credential inventory. Reviewer kiểm: **mọi** mandatory app × environment có sign-off; mọi scope removal có approved ADR; không bulk-enable; không scope creep sang gateway/billing. Sign-off phase **không** thay sign-off app và ngược lại.
    - **Sản phẩm:** Kết quả gate mục 20; phase summary (mandatory đã đạt, mục chưa đạt, approved scope changes/ADR, optional/future apps, residual risk, contract/SDK version đang hỗ trợ).
    - **Phụ thuộc:** P7.17, P7.18.
    - **Verify:** Completion matrix không còn ô bắt buộc trống và không dòng mandatory nào ở `blocked`; mỗi dòng `scope changed` có link tới ADR đã duyệt. Còn bất kỳ mandatory app/environment nào chưa hoàn tất → P7 **và** P8 giữ `blocked`. Cùng lỗi lặp lần hai → **TẮC**; hết ba vòng → **CẠN LƯỢT**.
    - **Lane:** `qa` + `reviewer` (edit deny).

20. **P7.20 — Cập nhật tài liệu sau sign-off**
    - **Hành động:** Chỉ khi cả hai gate đạt: cập nhật roster, optional/future list, completion matrix, scope-change ADR, annex, contract/client version, external repo revision, test evidence, runbook và sign-off record theo behavior **đã xác minh**. Đề nghị exit và mở P8.
    - **Sản phẩm:** Master register + worksheet + runbook + `./README.md` (trạng thái P7).
    - **Phụ thuộc:** P7.19 (cả hai gate đạt).
    - **Verify:** Đối chiếu docs ↔ OpenAPI ↔ config ↔ output thật; optional/future apps được báo **riêng**, không dùng để làm đủ số mandatory; không tài liệu nào tuyên bố có billing, gateway bắt buộc, shared credential hay local quota; mọi external reference có revision immutable.
    - **Lane:** `document`.

## 16. Parallel lanes và ownership

**Mô hình phê duyệt.** Dự án là solo dev + AI agents (`DEC-G01`). **Chủ dự án là approver duy nhất** cho roster, risk rubric, annex từng app, scope-change ADR, canary và enable — không có “Product owner”, “App owner”, “Security owner” hay “Operations” tách biệt. Các cột owner trong roster vẫn phải điền tường minh cho từng app kể cả khi cùng trỏ về chủ dự án; agent không tự approve thay con người.

Điều đó **không** làm gộp `qa`/`reviewer` vào lane code. Hai lane này giữ `edit: deny` và độc lập với mọi lane viết code — cơ chế chống tự lừa theo `../../AGENTS.md` mục 4b. Yêu cầu “hai sign-off độc lập trước enable” (P7.14) được hiểu là `qa` **và** `reviewer`, không phải hai con người. Luật **3 vòng / TẮC / CẠN LƯỢT** áp dụng nguyên vẹn.

Manifest ownership cho shared path:

| Shared path | Writer duy nhất | Architect | Consumers |
|---|---|---|---|
| `contracts/openapi/control-plane.v1.yaml` | `backend` do orchestrator chỉ định | Read-only: review/freeze revision (P7.5) | `frontend`, `tester`, app repos: read-only, pin version |
| `integrations/data-plane/` | `backend` (shared adapter/generated client, compatibility artifacts) | Read-only | App repos: pin version |

| Làn | Owner/path duy nhất | Điều kiện bắt đầu | Không được làm |
|---|---|---|---|
| `architect` | Không write. Threat model, inventory review, freeze phase contract (P7.5) và per-app annex (P7.7) | Sau P7.4 | Không write file; không chốt roster/metric/quota thay chủ dự án; không coi sample app P6 là default cho app khác. |
| `backend` | `contracts/openapi/**` (writer duy nhất), `integrations/data-plane/**`, `apps/control-plane/**` (gồm `drizzle/migrations/` và `src/main-worker.*`), và làn code trong từng app repo đã duyệt | Sau per-app annex freeze (P7.7) | Không sở hữu `apps/web/**` hay `tests/**`; không đưa plan name/limit/local quota/domain auth vào shared adapter; không sửa package chung giữa lúc canary nếu chưa có compatibility/retest plan. |
| `frontend` | `apps/web/**` — **một** owner cho cả user catalog/launch và admin onboarding/status/config/audit | Sau P7.5 và P7.9 của app đang xét | Không tách Hub user/admin thành hai owner song song; không thêm bulk-enable; không đổi API shape. |
| `tester` | `tests/**` | Sau P7.5 (contract) và P7.6 (inventory) | Không giảm assertion để code pass; không dùng sequential redelivery thay crash-injection evidence. |
| `orchestrator` | Có điều kiện: `infra/**`, `.github/workflows/**`, root config; Auth0/secret-store reference (P7.8), observability/canary/disable switch (P7.11), enable/rollback (P7.15) | Chỉ sau khi **chủ dự án phê duyệt cụ thể** ở đầu phase | Không đưa secret vào repo/log; không bulk-enable; không song song production enablement; không bỏ qua blocker. |
| `qa` | Không write. Per-app gate (P7.14), credential/catalog audit (P7.18), phase gate (P7.19) | Sau khi lane code tự kiểm xong | Không sửa file; không tuyên bố pass khi lệnh chưa tồn tại hoặc chưa chạy. |
| `reviewer` | Không write. Per-app review (P7.14), phase review (P7.19) | Cùng P7.14 / P7.19 | Không sửa implementation rồi tự sign-off. |
| `document` | Markdown/docs: completion matrix (P7.4), tài liệu đóng phase (P7.20) | P7.4 sau khi roster `approved` | Không sửa logic sản phẩm; không thêm optional/future app vào matrix; không viết “đã chạy” khi chưa chạy. |

Quy tắc song song:

- Có thể song song **inventory/implementation/test preparation** cho nhiều app khi không dùng chung file, environment, credential, migration, rollout window và có owner rõ.
- **Không song song production enablement** (P7.15) nếu shared Control Plane capacity, incident response hoặc canary observation không đủ cô lập.
- Một app còn `blocked` không buộc implementation lane của app độc lập khác dừng nếu contract đã freeze, không có dependency và architect xác nhận không ảnh hưởng; tuy nhiên Phase 7 và Phase 8 vẫn `blocked` cho tới khi app mandatory đó đạt hoặc roster thay đổi bằng approved product-scope ADR.
- Trong mỗi app, các lane chỉ chạy song song **sau per-app annex freeze** (P7.7).
- App repo ngoài monorepo: ghi URL/immutable revision/owner/CI evidence; không tạo thư mục giả trong monorepo để đại diện source bên ngoài.

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
