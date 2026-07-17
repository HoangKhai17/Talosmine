# Phase 9 — Billing deferred

Tài liệu này định nghĩa cổng quyết định và kế hoạch tái nhập cho billing. Nó không chọn payment provider, không đặc tả endpoint/bảng giả và không tuyên bố billing đã được triển khai.

## 1. Trạng thái

`blocked` — đây là canonical phase status. `TẮC`/`CẠN LƯỢT`, nếu phát sinh, chỉ là verification outcome metadata.

`deferred: true` — metadata riêng cho biết billing không nằm trên critical path P1–P8 và chưa được phép implementation.

Phase 9 không được mở chỉ vì Phase 8 hoàn tất. Billing phải tiếp tục cô lập hoàn toàn khỏi P1–P8 cho tới khi có ADR riêng được phê duyệt cùng đầy đủ quyết định ở mục 3.

Khi chưa qua cổng:

- không tạo provider adapter thật, checkout, webhook/callback endpoint, billing worker hoặc UI;
- không tạo bảng `billing_*`, provider event hay outbox;
- không thêm dependency, secret, workflow hoặc test fixture khiến hệ thống trông như đã chọn provider;
- không để client success page, query parameter hoặc callback chưa xác minh thay đổi subscription/entitlement.

## 2. Mục tiêu

- Giữ một ranh giới **Billing Adapter** độc lập với Subscription, Entitlement và Quota.
- Sau phê duyệt, chuyển **provider event đã xác minh và xử lý idempotent** thành mutation qua `SubscriptionMutationPort` duy nhất.
- Bảo đảm quyền chỉ dẫn xuất từ subscription hợp lệ theo effective timing đã duyệt; client success không bao giờ cấp quyền.
- Hỗ trợ user/admin billing UX, audit, reconciliation và xử lý bất thường mà không rò provider semantics vào P1–P8.
- Chỉ mở rộng schema/API sau ADR, architecture/schema/privacy/PCI review; không bịa physical columns hoặc provider payload trước thời điểm đó.

## 3. Prerequisites và human decisions

### Cổng điều kiện

- [ ] Phase 8 đã PASS, production foundation/DR/revoke/observability có bằng chứng phù hợp.
- [ ] ADR billing riêng được **chủ dự án** ký về provider, trust boundary, data flow, lifecycle, schema và vận hành.

### Mô hình vận hành: solo

Dự án là một người + các AI agent (DEC-G01 tại `./decision-register.md`). Không có product owner, finance/tax owner, security/privacy owner, support/refund owner hay engineering owner tách biệt — **mọi vai đó là chủ dự án**, và điều đó làm P9 nặng hơn chứ không nhẹ hơn: billing kéo theo nghĩa vụ thuế, hoàn tiền, hỗ trợ khách hàng và PCI mà một người phải gánh hết, liên tục, sau khi code đã xong. Đó là một lý do độc lập để billing tiếp tục deferred, ngoài việc chưa chọn provider (DEC-B13, `open`).

`qa` và `reviewer` vẫn là lane tách biệt read-only theo `AGENTS.md` mục 4b; luật ba vòng, `TẮC` và `CẠN LƯỢT` giữ nguyên. Chủ dự án tự đề xuất rồi tự phê duyệt là điểm yếu cố hữu của mô hình solo, nên reviewer gate không được bỏ qua.

### Decision gates bắt buộc

- [ ] **Provider** (DEC-B13, `open`)**:** provider/account/region, API/version, availability, sandbox, rate limit, data residency, contract và ownership credential.
- [ ] **Giá/currency/tax:** catalog giá, currency được hỗ trợ, rounding, inclusive/exclusive tax, invoice/receipt, jurisdiction và nguồn sự thật.
- [ ] **Checkout:** hosted/embedded/custom model, server-created intent/session, return URL allowlist, expiry/retry, abandoned checkout và accessibility.
- [ ] **Webhook signature:** thuật toán/cơ chế chính thức của provider, raw-body requirement, key rotation, timestamp/tolerance, replay defense và response/retry protocol.
- [ ] **Customer mapping:** quan hệ account ↔ provider customer, uniqueness, merge/link policy, email không làm identity key và quy trình orphan/conflict.
- [ ] **Upgrade/downgrade/cancel/refund:** immediate hay cuối kỳ, terminal state, restore/reactivate, partial/full refund, usage/data khi mất feature.
- [ ] **Proration:** có/không, provider hay Talosmine tính, preview, rounding, credit/debit và trạng thái khi tính/thu tiền thất bại.
- [ ] **Payment failure:** grace/suspend/cancel/retry/dunning, thông báo, support path và tác động entitlement.
- [ ] **Entitlement effective timing:** event/provider time/database time nào được tin, biên inclusive/exclusive, revoke SLA, pending/late/out-of-order event.
- [ ] **Retention/reconciliation:** dữ liệu billing/event/idempotency giữ bao lâu, legal/accounting hold, PII deletion, reconciliation source/cadence/tolerance/escalation.
- [ ] **PII/PCI scope:** dữ liệu nào được phép đi qua/lưu/log, hosted fields/tokenization, SAQ/compliance ownership và incident obligations.
- [ ] **Outbox:** có thực sự cần hay không; nếu có, semantics/owner/retention/delivery và thay đổi baseline “MVP không outbox” phải được duyệt trong ADR/schema review.

Mỗi quyết định phải có ví dụ timeline và expected subscription/entitlement outcome có thể kiểm thử. Thiếu một gate thì trạng thái Phase 9 vẫn là `blocked`; không chọn default kỹ thuật hoặc nghiệp vụ thay con người. Toàn bộ các gate trên do **chủ dự án** ký; không có finance/tax hay legal team để ủy thác phần thuế, hoàn tiền và PII/PCI.

## 4. Phạm vi

Chỉ **sau phê duyệt**, phạm vi khái niệm gồm:

- Billing Adapter boundary trong Control Plane, cô lập SDK/payload/status/provider identifier.
- Ingress event/webhook được xác minh theo provider contract, chống replay, deduplicate và xử lý out-of-order.
- Mapping customer/subscription/provider reference theo policy đã duyệt.
- Chuyển event hợp lệ thành command qua `SubscriptionMutationPort`; Billing không ghi trực tiếp bảng Subscription/Entitlement/Quota.
- User billing UI cho checkout/manage/status/history ở phạm vi sản phẩm đã duyệt.
- Admin billing UI cho support, event status, reconciliation/refund/cancel theo permission deny-by-default. Separation of duties **không** khả thi khi chỉ có một admin: bù lại bằng reason bắt buộc, confirmation, idempotency và audit trail đầy đủ — chốt chặn là dấu vết không xóa được, không phải người thứ hai duyệt.
- Audit, reconciliation, alert, runbook, privacy/PCI controls và provider outage behavior.
- Schema delta `billing_*`, provider events và outbox **chỉ nếu** architecture/schema review duyệt.

## 5. Ngoài phạm vi

- Billing trong P1–P8 hoặc thay đổi quyền hiện tại chỉ để chuẩn bị sẵn provider.
- Tự chọn provider, price, currency, tax engine, checkout model, refund/proration/dunning behavior hay entitlement timing.
- Thu thập/lưu card number, CVV hoặc payment credential khi chưa có thiết kế PCI được duyệt; ưu tiên không mở rộng PCI scope nhưng tài liệu không tự chọn tích hợp.
- Client success page/callback làm nguồn sự thật cho payment hoặc quyền.
- Provider webhook chưa xác minh, email/customer-supplied account ID hoặc browser claim làm trusted identity.
- Billing Adapter đọc/ghi trực tiếp repository/table của Subscription, Entitlement, Quota, Account hoặc Audit.
- Bịa exact endpoint, payload, event type, table/column/index/retention trước ADR và provider contract.
- Dùng generic quota idempotency table cho billing; ownership/idempotency cần thiết kế riêng sau review.

## 6. Deliverables

Khi và chỉ khi cổng được mở, deliverables dự kiến ở mức khái niệm:

- ADR billing được ký, data-flow/threat model/trust boundary và decision table lifecycle hoàn chỉnh.
- Billing Adapter interface không làm rò provider semantics sang domain cốt lõi.
- Provider ingress xác minh signature/authenticity trước xử lý; event store/idempotency/replay và out-of-order policy đã review.
- Mapping từ verified provider facts sang **subscription mutation only**, có effective time, trusted source, idempotency và audit context.
- User/admin billing UX theo contract, không cấp quyền từ trạng thái client.
- Reconciliation job/process, exception queue/manual path, audit trail, alert và runbook support/incident.
- Schema/migration/OpenAPI delta đã review cùng privacy/PCI/retention assessment.
- Test evidence cho webhook, lifecycle, timing, reconciliation, security và accessibility/responsive.
- QA PASS và reviewer hết mục phải sửa.

Danh sách trên không phải mô tả thành phần đang tồn tại.

## 7. Target paths

Các path sau chỉ được mở **sau ADR approval** và phải khớp cấu trúc thật tại thời điểm tái nhập:

- `apps/control-plane/**/billing/**` hoặc billing module boundary tương đương trong contract được architect/product xác nhận freeze ở vai trò read-only: adapter, verification, event handling, mapping và reconciliation; không import repository domain khác.
- `apps/web/**/billing/**`: user/admin billing UI và BFF routes theo contract đã duyệt.
- `infra/**`: provider secret references, private operational jobs/runbooks và cấu hình liên quan; không ghi secret/value thật.
- `.github/workflows/**`: billing-specific contract/security/test/deploy gates nếu thật sự cần và đã duyệt.
- `docs/**`: ADR, index, modular boundaries, database schema delta, OpenAPI, privacy/PCI assessment và runbook.

Trong trạng thái deferred hiện tại, không tạo bất kỳ path implementation nào nói trên. Tài liệu phase này là ngoại lệ kế hoạch duy nhất được tạo.

## 8. DB/migration

### Khi đang deferred

- Giữ nguyên canonical 25 domain tables; billing, outbox và provider-specific data chưa có trong schema.
- Không tạo migration rỗng/placeholder, enum/provider status, fake customer ID hoặc cột nullable “để dành”.
- Không dùng `subscriptions.source_reference` như một schema billing đầy đủ khi semantics chưa được review.

### Sau phê duyệt

- Architecture/schema review trước tiên phải xác định owner và invariant cho `billing_*`, verified provider event, idempotency/deduplication và outbox nếu được duyệt.
- Tài liệu này **không quy định exact columns**. Physical types, keys, constraints, indexes, partition/retention và encryption chỉ được chốt từ provider contract, query model và privacy/PCI review.
- Provider event phải giữ payload tối thiểu cần thiết; raw payload/signature retention, redaction, encryption, access và deletion/legal hold phải được quyết định rõ.
- Mapping customer/account không được dùng email làm identity key; uniqueness/conflict/orphan handling cần transaction và audit design.
- Migration dùng forward strategy, version bất biến, staging validation, backup/PITR checkpoint và expand/backfill/validate/contract nếu đụng dữ liệu hiện hữu.
- Billing mutation không được phá canonical subscription timeline, trusted-source idempotency, finite terminal time, append-only usage/audit hoặc hard quota invariant.
- Nếu thêm outbox, phải cập nhật kiến trúc baseline, owner, atomic write boundary, delivery/idempotency, cleanup/retention và duplicate/out-of-order tests trước migration.

## 9. Backend API

Không freeze path/payload cụ thể trước khi chọn provider. Sau approval, contract tối thiểu phải phân tách:

- browser/BFF operation để server tạo checkout/manage intent theo user session đã xác thực;
- provider ingress xác minh trên raw request/official mechanism trước parse/trust, có kích thước/rate/time/replay controls;
- user query chỉ trả billing/subscription status được phép, không trả provider secret hoặc dữ liệu payment nhạy cảm;
- admin operations có permission riêng, reason, idempotency, audit và separation of duties cho refund/cancel/replay/reconcile;
- internal handler nhận **verified event envelope**, deduplicate, áp dụng ordering policy và chỉ gọi `SubscriptionMutationPort`;
- reconciliation query provider theo credential tối thiểu, so sánh nguồn đã duyệt và đưa mismatch không suy ra được vào manual path.

Client success redirect chỉ dùng để điều hướng/hiển thị trạng thái đang xác minh. Nó phải query server state; không gửi lệnh “grant”, không tự đánh dấu paid và không mutate entitlement.

## 10. User web

Chỉ sau approval, user UX cần:

- hiển thị price/currency/tax/proration đúng nguồn và thời điểm; không tính lại bằng logic client không được duyệt;
- bắt đầu checkout từ BFF authenticated operation, chống CSRF và exact return URL; không để browser tự khai account/customer/plan version đáng tin cậy;
- trạng thái pending/succeeded/failed/canceled/refunded lấy từ server reconciliation/subscription state, không từ query string success;
- giải thích rõ effective timing của upgrade/downgrade/cancel/refund/payment failure và đường support;
- retry an toàn, không tạo nhiều checkout/mutation do double-click/timeout; không hiển thị quyền mới trước khi subscription có hiệu lực;
- accessibility cho form/status/error/redirect, keyboard/focus/screen reader; responsive desktop/mobile/tablet;
- analytics/log không thu payment credential, provider token, invoice PII hoặc URL chứa secret.

Không tạo nút “Upgrade” giả hoặc flow mock kết nối endpoint không tồn tại khi phase còn deferred.

## 11. Admin web

Chỉ sau approval, admin UX cần:

- permission tách biệt cho read billing, reconcile, cancel, refund và sensitive export; deny-by-default và không có super-admin mặc định không kiểm soát;
- hiển thị provider/subscription correlation ở dạng tối thiểu/redacted, cùng event verification/reconciliation status và audit link;
- reason, confirmation, idempotency và step-up/re-auth theo policy cho refund/cancel/replay/manual correction;
- không có nút “force entitlement”. Admin billing chỉ yêu cầu subscription mutation hợp lệ qua domain port;
- manual resolution không sửa/xóa provider event/audit lịch sử; ghi corrective record/action mới có actor và correlation;
- chống duplicate action sau timeout bằng status/retry cùng key; preview tác động và effective time trước xác nhận;
- accessibility/responsive cho bảng, timeline, diff, dialog và bulk state; export/PII theo retention/PCI policy.

## 12. Integration/security

- Credential/provider key tách theo environment, lưu bằng cơ chế đã duyệt, không vào source/image/log; rotation và revoke drill bắt buộc.
- Xác minh webhook/event dùng đúng official provider protocol đã phê duyệt, bao gồm raw-body canonicalization, timestamp/key version nếu provider yêu cầu. Không tự thiết kế crypto.
- Reject forged, expired hoặc replayed callback trước mutation; response không làm lộ customer/account tồn tại.
- Event hợp lệ vẫn phải qua deduplication, ordering/effective-time policy và Subscription invariants. “Verified” không đồng nghĩa “được phép cấp quyền”.
- Egress tới provider giới hạn endpoint cần thiết; timeout/retry/backoff/rate-limit/circuit behavior theo contract. Outage không được tự fail-open entitlement.
- Logs/metrics/traces chỉ dùng tooling đã duyệt, correlation không chứa PII; không ghi authorization header, signature secret, raw card/payment credential hoặc payload dư thừa.
- Metrics/alerts khái niệm: verification failure, duplicate/replay, event lag, handler/reconciliation error, mismatch, subscription mutation conflict, provider latency/rate limit và entitlement convergence theo SLO đã duyệt.
- Runbook bao phủ provider outage, leaked key, signature rotation, event backlog, duplicate/out-of-order, reconciliation mismatch, refund dispute và privacy/PCI incident.

## 13. Contract freeze

Implementation chỉ được mở sau separate billing approval và ADR được duyệt. Architect/product chỉ đưa ra quyết định, review và xác nhận contract freeze ở vai trò read-only; không viết implementation, migration, OpenAPI, workflow hay test. Contract freeze phải lập file-level ownership manifest trước khi mở parallel lanes, chỉ rõ một writer cho mỗi file và bằng chứng explicit user approval cho mọi path mà `orchestrator` dự kiến sửa.

Contract phải freeze:

- ADR/provider/API version và trust boundary;
- product catalog price/currency/tax cùng lifecycle/effective-time decision tables;
- checkout, customer mapping, verified event envelope, signature/replay/ordering/idempotency semantics;
- Billing Adapter → `SubscriptionMutationPort` mapping và danh sách event nào tạo command nào;
- OpenAPI/browser/admin/provider ingress contract, auth, errors, retries và redaction;
- conceptual-to-physical schema mapping, ownership, migration, retention, PII/PCI và outbox decision;
- reconciliation source/cadence/tolerance/manual path;
- user/admin UX states, support messaging, accessibility/responsive criteria;
- security, observability, rollout/rollback và provider sandbox/production promotion gates.

Không đưa provider-specific identifier vào core Subscription/Entitlement/Quota contract nếu adapter-owned mapping có thể cô lập nó. Contract change phải cập nhật ADR/schema/OpenAPI/test trước code.

## 14. Tests

Sau approval, test matrix bắt buộc gồm:

- **Duplicate:** cùng verified event giao nhiều lần chỉ có một logical subscription outcome/audit sequence phù hợp.
- **Out-of-order:** event mới/cũ đảo thứ tự hội tụ theo decision table, không làm sống lại canceled/refunded subscription trái policy.
- **Replay:** event chữ ký hợp lệ nhưng ngoài tolerance/đã xử lý bị chặn hoặc replay outcome an toàn theo provider contract.
- **Forged callback:** sai/mất signature, sai key/version/timestamp/raw-body, client success giả và account/customer giả không mutation.
- **Refund/cancel:** partial/full, immediate/end-of-period, duplicate và conflict theo policy; quyền đổi đúng effective time.
- **Timeout:** provider timeout, webhook response timeout, handler crash giữa các bước và Subscription mutation outcome không rõ được retry/status an toàn.
- **Reconciliation:** missing event, provider/local mismatch, orphan customer/subscription, pagination/rate limit và manual resolution có audit.
- **Entitlement timing:** upgrade, downgrade, payment failure, grace/suspend, cancel/refund và late event tại chính xác các biên thời gian đã duyệt.
- **Concurrency:** hai checkout/event/admin action cạnh tranh không tạo overlap/duplicate mutation; idempotency namespace/fingerprint được giữ.
- **Security/privacy/PCI:** permission/CSRF/SSRF/redirect, secret/log leakage, payload size/rate, data minimization, retention/deletion/legal hold.
- **Web:** user/admin accessibility, desktop/mobile/tablet, pending/error/retry, currency/tax display và không grant từ client.
- **Contract:** provider fixture lấy từ tài liệu/sandbox đã duyệt, OpenAPI 3.1, adapter port và Subscription invariant.

Không tạo fake provider fixture trước provider approval. Test phải dùng sandbox/official samples hoặc contract fixture đã review, có bằng chứng command/environment thật.

## 15. Ordered steps

Runbook này là **chuẩn bị deferred**, không phải lệnh khởi công. Phase giữ canonical status `blocked` với metadata `deferred: true`. Các bước sau **separate billing approval** chỉ được bắt đầu khi cổng mục 3 đã mở; trước thời điểm đó, mọi bước implementation ở trạng thái chờ và không được tạo bất kỳ artifact billing thật nào (provider adapter, checkout, webhook/callback endpoint, billing worker, UI, bảng `billing_*`, dependency, secret, workflow hay test fixture). Mỗi bước mô tả theo năm thành phần: **Hành động**, **Sản phẩm**, **Phụ thuộc**, **Verify** và **Lane** (khớp mục 16). Trong giai đoạn deferred, **Verify chủ đạo là ADR/decision record được phê duyệt** — không phải code chạy được. Payment provider là decision gate ‹cần chốt: provider/account/region, API version, sandbox, credential ownership›; deployment/infra impact kế thừa quyết định của Phase 8.

### Trong trạng thái deferred (đang áp dụng)

#### Bước 1 — Giữ cô lập và không tạo artifact billing

- **Hành động:** Giữ phase `blocked` + `deferred: true`; xác nhận P1–P8 không phụ thuộc provider/billing; không tạo code/schema/API/UI/dependency/secret/workflow/test fixture billing.
- **Sản phẩm:** Không có artifact mới. Chỉ tài liệu phase này (ngoại lệ kế hoạch duy nhất được phép tồn tại).
- **Phụ thuộc:** Không.
- **Verify:** Rà soát repo xác nhận **không có** provider adapter, `billing_*` table, checkout/webhook endpoint, billing dependency/secret/workflow; canonical 25 domain tables giữ nguyên; `subscriptions.source_reference` không bị dùng như schema billing đầy đủ.
- **Lane:** `subagent/document` (chỉ ghi nhận); `subagent/qa` verify read-only theo mục 20.

#### Bước 2 — Thu thập yêu cầu cho decision gate

- **Hành động:** Thu thập business case và các lựa chọn cần chủ dự án quyết định ở mục 3; ghi rõ mỗi decision gate còn ‹cần chốt›. Không lập bảng owner nhiều vai: theo DEC-G01 mọi gate đều thuộc chủ dự án. Ghi kèm **chi phí vận hành liên tục** mà một người phải gánh sau khi bật billing — hỗ trợ, hoàn tiền, đối soát, nghĩa vụ thuế — vì đó là dữ liệu đầu vào cho quyết định có nên mở P9 hay không.
- **Sản phẩm:** `docs/**` (bảng decision gate mục 3 với trạng thái từng mục).
- **Phụ thuộc:** Bước 1.
- **Verify:** Mỗi decision gate mục 3 ghi rõ đang mở hay đã chốt; không mục nào bị điền default kỹ thuật/nghiệp vụ thay con người. DEC-B13 tại `./decision-register.md` vẫn `open` thì P9 vẫn đóng.
- **Lane:** `subagent/document` (ghi record). Quyết định thuộc chủ dự án; không agent nào tự chọn provider.

#### Bước 3 — Cổng tái nhập

- **Hành động:** Khi có nhu cầu kinh doanh chính thức, thực hiện re-entry checklist mục 19 trước mọi implementation; không mở lane nào cho tới khi checklist hoàn tất.
- **Sản phẩm:** `docs/**` (re-entry checklist đã đánh dấu, liên kết bằng chứng approval).
- **Phụ thuộc:** Bước 2; Phase 8 PASS; **separate billing approval của chủ dự án.**
- **Verify:** Re-entry checklist mục 19 đủ điều kiện; ADR billing riêng được chủ dự án ký; mọi decision gate mục 3 có expected outcome kiểm thử được. Thiếu bất kỳ mục nào → phase vẫn `blocked`/`deferred`, dừng tại đây.
- **Lane:** `subagent/document` ghi checklist; approval là hành động của chủ dự án.

### Sau khi được phê duyệt tái nhập (chưa kích hoạt)

#### Bước 4 — ADR provider và quyết định lifecycle

- **Hành động:** Chọn provider ‹cần chốt: provider/account/region, API version, sandbox, credential ownership› và chốt toàn bộ price/currency/tax, checkout, webhook signature, customer mapping, upgrade/downgrade/cancel/refund, proration, payment failure, entitlement effective timing, retention/reconciliation, PII/PCI scope và outbox decision bằng ADR.
- **Sản phẩm:** `docs/**` (ADR billing được ký + decision tables lifecycle, mỗi quyết định có timeline example và expected subscription/entitlement outcome).
- **Phụ thuộc:** Bước 3.
- **Verify:** **ADR được chủ dự án ký** với mọi decision gate mục 3 đã đóng và DEC-B13 chuyển `approved` tại `./decision-register.md`; mỗi quyết định có ví dụ timeline kiểm thử được. Đây là verify dạng decision record, chưa có code.
- **Lane:** `subagent/document` ghi ADR; quyết định thuộc chủ dự án; `subagent/architect` review read-only.

#### Bước 5 — Threat model, data flow và schema review read-only

- **Hành động:** Architect/product lập trust boundary, data flow, threat/failure/reconciliation model và review architecture/schema ở vai trò read-only; xác định owner/invariant cho `billing_*`, verified provider event, idempotency/dedup và outbox nếu ADR duyệt. Không viết implementation, không bịa exact column.
- **Sản phẩm:** `docs/**` (threat model, data-flow, schema review notes; privacy/PCI assessment nháp).
- **Phụ thuộc:** Bước 4.
- **Verify:** Review được ký; không quyết định exact physical column trước provider contract; email không được dùng làm identity key; outbox chỉ xuất hiện nếu ADR/schema review duyệt.
- **Lane:** `subagent/architect` + `subagent/document` (read-only decision/review + ghi record).

#### Bước 6 — Freeze contract

- **Hành động:** Freeze Billing Adapter boundary, verified event envelope, `SubscriptionMutationPort` mapping (event → command), OpenAPI/browser/admin/provider ingress contract, UX states và security/observability/rollout gates.
- **Sản phẩm:** `docs/**` (contract freeze record); `contracts/openapi/control-plane.v1.yaml` delta chỉ do writer được chỉ định chạm sau manifest.
- **Phụ thuộc:** Bước 5.
- **Verify:** Contract không đưa provider-specific identifier vào core Subscription/Entitlement/Quota nếu adapter-owned mapping cô lập được; contract change kéo theo cập nhật ADR/schema/OpenAPI/test trước code.
- **Lane:** `subagent/architect` review/freeze read-only; `orchestrator` + owner điều phối; `subagent/document` ghi record.

#### Bước 7 — File-level ownership manifest

- **Hành động:** Lập manifest tới cấp file trước khi mở parallel lanes: migrations + `apps/control-plane/**` thuộc backend; toàn bộ `apps/web/**` (user + admin) thuộc một frontend owner; `tests/**` thuộc tester; `docs/**` thuộc document; `infra/**`, `.github/workflows/**` và root/shared chỉ có writer sau approval tương ứng; OpenAPI chỉ backend viết nếu orchestrator giao rõ.
- **Sản phẩm:** `docs/**` (ownership manifest với đúng một writer/file + bằng chứng approval).
- **Phụ thuộc:** Bước 6.
- **Verify:** Mỗi file có đúng một writer; không chia sẻ write ownership; không tạo file ngoài manifest; không mở lane `Infrastructure`.
- **Lane:** `orchestrator` + owner đã phê duyệt điều phối; `subagent/document` ghi manifest.

#### Bước 8 — Schema delta và migration (không bịa cột)

- **Hành động:** Backend thiết kế/viết schema delta `billing_*` và migration forward chỉ từ provider contract/query model đã duyệt; migration qua privacy/PCI/retention/outbox review; giữ canonical subscription timeline/idempotency/append-only/hard quota invariant. Backend là writer OpenAPI duy nhất chỉ khi manifest giao rõ.
- **Sản phẩm:** `apps/control-plane/drizzle/migrations/`, `apps/control-plane/**/billing/**`; `contracts/openapi/control-plane.v1.yaml` nếu được giao.
- **Phụ thuộc:** Bước 7. **Cần user approval trước khi chạm `infra/**`/`.github/workflows/**` liên quan.**
- **Verify:** Migration staging + backup/PITR checkpoint đạt; không exact column nào từ phỏng đoán; outbox chỉ tồn tại nếu ADR duyệt; expand/backfill/validate/contract nếu đụng dữ liệu hiện hữu.
- **Lane:** `subagent/backend`.

#### Bước 9 — Provider verification/idempotency/ordering/reconcile trước mutation

- **Hành động:** Triển khai provider ingress xác minh signature/authenticity trên raw body theo official protocol, chống replay, deduplicate, áp ordering/effective-time policy; reconciliation query provider theo credential tối thiểu; chỉ sau đó nối `SubscriptionMutationPort`. Tester viết test từ contract song song.
- **Sản phẩm:** `apps/control-plane/**/billing/**` (verify/dedupe/order/reconcile, mapping); `tests/**` (contract/security/lifecycle/reconciliation/concurrency).
- **Phụ thuộc:** Bước 8; provider sandbox/official fixture ‹cần chốt›. `orchestrator` chỉ viết infra/workflow/root/shared **sau explicit user approval**; không mở lane `Infrastructure`.
- **Verify:** Test duplicate/out-of-order/replay/forged callback dùng sandbox/official fixture đã duyệt; "verified" không tự cấp quyền; Billing không ghi trực tiếp table domain khác.
- **Lane:** `subagent/backend` (implementation); `subagent/tester` (`tests/**`); `orchestrator` **sau approval** cho infra/workflow.

#### Bước 10 — User/admin billing UI (không grant từ client)

- **Hành động:** Một frontend owner triển khai cả user và admin billing UI + BFF theo contract; trạng thái lấy từ server reconciliation/subscription state; client success chỉ điều hướng/hiển thị trạng thái đang xác minh, không gửi lệnh grant.
- **Sản phẩm:** `apps/web/**/billing/**` (user + admin UI, BFF routes).
- **Phụ thuộc:** Bước 6 (UX contract), Bước 9 (server state).
- **Verify:** Không nút "force entitlement"/"Upgrade" giả; checkout từ BFF authenticated + CSRF + exact return URL; accessibility (keyboard/focus/screen reader/contrast) và responsive desktop/mobile/tablet cho pending/error/retry; analytics/log không thu payment credential/token/invoice PII.
- **Lane:** `subagent/frontend`.

#### Bước 11 — Test suite đầy đủ và staging drill

- **Hành động:** Chạy sandbox contract, security/privacy/PCI, duplicate/out-of-order/replay, forged callback, refund/cancel, timeout, reconciliation, lifecycle/timing, concurrency và web tests; chạy migration/rollout/rollback drill ở staging; đối chiếu P8 DR/revoke/observability không suy giảm.
- **Sản phẩm:** `tests/**` (evidence đầy đủ); `docs/**` (staging drill report).
- **Phụ thuộc:** Bước 9, Bước 10. Phần drill hạ tầng **cần user approval trước khi chạm `infra/**`/`.github/workflows/**`.**
- **Verify:** Mỗi test lưu command/version/environment/timestamp/expected/actual/artifact; entitlement timing đúng decision table tại các biên; rollback/forward-fix không xóa provider/audit history; P8 capacity/DR/observability được đánh giá lại cho billing workload.
- **Lane:** `subagent/tester`; `orchestrator` **sau approval** cho drill hạ tầng; `subagent/document` ghi report.

#### Bước 12 — Cập nhật tài liệu nguồn sự thật

- **Hành động:** Cập nhật `docs/index.md`, `docs/modular.md`, `docs/database-schema.md`, OpenAPI và runbook vận hành/support qua đúng owner trong manifest; không còn mô tả billing là deferred sai với trạng thái thực.
- **Sản phẩm:** `docs/**` (index/modular/schema/runbook đồng bộ); OpenAPI qua owner được giao.
- **Phụ thuộc:** Bước 11.
- **Verify:** ADR, index, modular, schema, OpenAPI nhất quán; P1–P8 vẫn không phụ thuộc provider/billing module; không tài liệu nào tuyên bố billing đã triển khai trước bằng chứng.
- **Lane:** `subagent/document` (docs); owner được giao cho OpenAPI.

#### Bước 13 — QA/reviewer độc lập và go/no-go riêng

- **Hành động:** Chạy QA và reviewer read-only; tối đa ba vòng theo `AGENTS.md`; chỉ mở production khi exit gate mục 18 đạt và có go/no-go riêng cho billing. QA/reviewer không sửa implementation.
- **Sản phẩm:** `docs/**` (QA report, reviewer report, go/no-go record billing).
- **Phụ thuộc:** Bước 1–12.
- **Verify:** QA PASS và reviewer hết mục "phải sửa"; ADR approval chỉ mở phase, không tự đáp ứng exit gate; kết quả `PASS`/`FAIL`/`TẮC`/`CẠN LƯỢT` là verification metadata, không thay canonical status `blocked`/`deferred` trong tài liệu kế hoạch.
- **Lane:** `subagent/qa` và `subagent/reviewer` (read-only, `edit: deny`); go/no-go thuộc người có thẩm quyền.

## 16. Parallel lanes và ownership

P9 vẫn `blocked` với `deferred: true`. Không implementation lane nào được mở trước **separate billing approval**, ADR approval, contract freeze và file-level ownership manifest. Architect/product chỉ decision/review/freeze read-only, không phải implementation writer.

Manifest phải liệt kê từng file hiện hữu/dự kiến được chạm, đúng một writer và approval cần thiết. Không tạo file ngoài manifest, không chia sẻ write ownership và không mở lane chưa có approval.

| Owner hiện hữu | Path sở hữu sau approval | Trách nhiệm | Cấm |
|---|---|---|---|
| `subagent/backend` | toàn bộ `apps/control-plane/**`, gồm migration root `apps/control-plane/drizzle/migrations/` | Billing Adapter, verify/dedupe/order/reconcile, `SubscriptionMutationPort`, schema và migrations | Ghi trực tiếp table của module khác; sửa web/tests/docs/infra |
| `subagent/backend`, **chỉ khi orchestrator giao trong manifest** | `contracts/openapi/control-plane.v1.yaml` | Writer OpenAPI duy nhất cho phase | Chia sẻ OpenAPI write với agent khác hoặc tự nhận path khi chưa được giao |
| `subagent/frontend` | toàn bộ `apps/web/**`, gồm cả user và admin billing surface | Checkout/manage/status/support UI và BFF surface theo contract | Tách user/admin thành hai writers; đổi backend/schema ngầm |
| `subagent/tester` | `tests/**` | Contract/security/lifecycle/reconciliation/concurrency/web tests | Sửa implementation hoặc test để hợp thức hóa lỗi |
| `subagent/document` | chỉ `docs/**` | ADR/documentation, index/modular/schema docs, runbook và evidence index | Sửa code, migration, OpenAPI, infra, workflow hoặc tests |
| `orchestrator`, **chỉ sau explicit user approval** | `infra/**`, `.github/workflows/**` và từng root/shared file được phê duyệt, trừ OpenAPI nếu đã giao backend | Secret references, egress, operational jobs/workflows và integration file được duyệt | Ghi trước approval, tự tạo lane `Infrastructure`, hoặc chạm path đã có writer khác |

Không có lane `Infrastructure` hay lane `Database` trong roster. Migrations thuộc backend. Architect/product, QA và reviewer đều read-only; QA/reviewer chỉ vào sau khi các owner implementation hội tụ. Parallel work chỉ bắt đầu sau khi manifest khóa file-level ownership.

## 17. Checklist

### Functional
- [ ] Provider/customer/checkout/lifecycle/tax decisions đúng ADR; adapter chỉ tạo subscription mutation.
- [ ] Duplicate/out-of-order/reconciliation hội tụ; client success không cấp quyền.
- [ ] Separate billing approval, ADR, contract freeze và file-level ownership manifest hoàn tất trước khi mở implementation lanes.

### Security
- [ ] Signature/authenticity/replay/CSRF/redirect/RBAC/secret rotation được kiểm thử.
- [ ] Forged callback, browser claim và unverified event không thể mutation hoặc lộ existence.

### Database
- [ ] Schema delta có owner/invariant/retention review; không exact column nào xuất phát từ phỏng đoán.
- [ ] Migration staging/backup/PITR/compatibility đạt; outbox chỉ tồn tại nếu ADR duyệt.
- [ ] Không có Database lane riêng; backend sở hữu `apps/control-plane/drizzle/migrations/` và là writer OpenAPI duy nhất nếu được orchestrator giao.

### Concurrency
- [ ] Event/checkout/admin action cạnh tranh không duplicate/overlap; idempotency và ordering giữ đúng outcome.

### Accessibility
- [ ] Checkout/status/error và admin timeline/dialog dùng được bằng keyboard, screen reader, focus/contrast đạt tiêu chí.

### Responsive
- [ ] User/admin billing UI hoạt động trên desktop, điện thoại, máy tính bảng, kể cả pending/error/long-value state.

### Observability
- [ ] Verification, lag, mismatch, mutation conflict và reconciliation alert có owner/runbook; telemetry không chứa PII/token/secret.

### Rollback
- [ ] Disable/rollback adapter/UI không revoke hoặc grant quyền tùy tiện; event backlog được giữ và reconcile theo runbook.
- [ ] Migration rollback/forward-fix không xóa provider/audit history hoặc phá subscription timeline.

### Documentation
- [ ] ADR, `docs/index.md`, `docs/modular.md`, `docs/database-schema.md`, OpenAPI, privacy/PCI và runbook được cập nhật sau approval.
- [ ] P1–P8 vẫn không phụ thuộc provider/billing module; không tài liệu nào tuyên bố billing trước bằng chứng.
- [ ] Một frontend owner sở hữu toàn bộ `apps/web/**`; tester chỉ `tests/**`; document chỉ `docs/**`; orchestrator chỉ ghi infra/workflow/root/shared sau explicit user approval.

## 18. Exit gate

Phase 9 chỉ có thể chuyển từ deferred sang hoàn tất khi:

- ADR riêng được phê duyệt và mọi decision gate mục 3 có expected outcome kiểm thử được;
- provider verification/idempotency/order/replay/reconciliation cùng adapter boundary đạt test;
- mọi quyền thay đổi chỉ từ subscription mutation hợp lệ; client success/unverified event không cấp quyền;
- schema/migration/privacy/PCI/outbox review đạt và staging rollout/rollback/restore evidence đầy đủ;
- user/admin UI đạt security, accessibility, responsive và lifecycle messaging;
- refund/cancel/payment failure/entitlement timing/concurrency tests đạt đúng decision table;
- audit/observability/runbook/support ownership sẵn sàng;
- `docs/index.md`, `docs/modular.md`, `docs/database-schema.md` và OpenAPI đã được cập nhật, review và không còn mô tả billing là deferred sai với trạng thái thực;
- QA PASS và reviewer hết mục “phải sửa”.

ADR approval chỉ mở phase, không tự đáp ứng exit gate hay chứng minh billing đã triển khai.

## 19. Stop/rollback

### Stop conditions

Dừng implementation và giữ trạng thái `blocked` cùng metadata `deferred: true` nếu:

- chưa chọn/duyệt provider hoặc bất kỳ price/currency/tax/checkout/signature/mapping/lifecycle/proration/failure/timing/retention decision nào còn mở;
- chưa có PII/PCI scope owner hoặc provider contract/sandbox/credential/quyền truy cập cần thiết;
- có yêu cầu cấp entitlement từ client success, webhook chưa xác minh hoặc Billing ghi trực tiếp domain table;
- schema review yêu cầu bịa exact column, dùng email làm identity, dùng generic quota idempotency hoặc thêm outbox không ADR;
- P1–P8 phải thay đổi provider-specific để billing hoạt động, hoặc security/DR/revoke invariant bị suy giảm;
- cùng một lỗi lặp lại lần thứ hai hoặc QA/reviewer phát hiện blocker không thể sửa trong phạm vi đã duyệt.

### Re-entry checklist

- [ ] Business case và owner được xác nhận.
- [ ] Provider cùng sandbox/official contract được duyệt.
- [ ] Toàn bộ decision gates mục 3 có quyết định và timeline examples.
- [ ] ADR, threat model, data flow, privacy/PCI và schema review đã ký.
- [ ] Adapter/Subscription/OpenAPI/UX/test contract freeze hoàn tất.
- [ ] Target paths/file ownership và migration/rollout/rollback plan được duyệt.
- [ ] P8 capacity/DR/observability được đánh giá lại cho billing workload.

### Rollback sau khi đã mở phase

- Chặn checkout/ingress theo runbook nhưng bảo toàn verified event/audit và correlation để reconcile; không xóa backlog cho “sạch”.
- Rollback image khi schema compatible; sau migration nhận write, ưu tiên forward-fix và không down-migrate destructive.
- Khi outcome payment/subscription không rõ, không grant/revoke theo phỏng đoán; query/reconcile và đưa vào manual path có audit.
- Secret leak: revoke/rotate, giới hạn ingress/egress, bảo toàn evidence và chạy reconciliation theo incident plan.

## 20. QA/reviewer sign-off

### QA bắt buộc

- Trước approval, xác minh **không có** provider selection, billing endpoint/table/UI/dependency/secret/workflow giả trong P1–P8.
- Sau approval, chạy contract bằng sandbox/official fixture đã duyệt; kiểm tra duplicate, out-of-order, replay, forged callback, refund/cancel, timeout, reconciliation, concurrency và entitlement timing.
- Đối chiếu user/admin UI, security/privacy/PCI controls, migration/rollback, telemetry/redaction và tài liệu cập nhật.
- Ghi output/evidence thật và kết quả verification (`PASS`, `FAIL`, hoặc `TẮC`/`CẠN LƯỢT` khi đúng điều kiện); đây không phải trường trạng thái phase. QA không sửa implementation.

### Reviewer bắt buộc

- Review isolation boundary, provider verification, idempotency/ordering, Subscription-only mutation, schema ownership, outbox rationale, privacy/PCI và rollback.
- Tìm provider leakage vào core, client-granted rights, direct table access, fake endpoint/column, email identity, event replay/out-of-order gap và admin bypass.
- Xác minh ADR cùng index/modular/schema/OpenAPI nhất quán trước exit; phân loại “phải sửa” và “khuyến nghị”. Reviewer không sửa implementation.

Phase 9 không được báo đạt nếu thiếu **QA PASS** hoặc reviewer còn mục **phải sửa**. Tối đa ba vòng theo `AGENTS.md`; `TẮC`/`CẠN LƯỢT` chỉ là kết quả verification, không thay trạng thái phase `blocked` trong tài liệu kế hoạch.
