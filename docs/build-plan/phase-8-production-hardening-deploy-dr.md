# Phase 8 — Production hardening, triển khai và disaster recovery

Tài liệu này là kế hoạch thực hiện, không phải báo cáo triển khai. Mọi ô kiểm đều để trống cho tới khi có bằng chứng từ môi trường và kết luận độc lập của QA/reviewer.

## 1. Trạng thái

`blocked` — đây là canonical phase status. `TẮC`/`CẠN LƯỢT`, nếu phát sinh, chỉ là verification outcome metadata.

Phase 8 chỉ được mở khi toàn bộ roster bắt buộc của Phase 7 đã được xác minh và Phase 7 có kết luận **PASS** từ QA/reviewer. Topology production chưa được khóa: baseline đã duyệt chỉ cam kết Docker Compose trên VPS; lựa chọn một VPS hay tách app/data VPS phải qua human decision ở mục 3.

Billing không thuộc Phase 8. Không thêm provider, checkout, webhook, bảng hoặc UI billing trừ khi Phase 9 được phê duyệt riêng.

## 2. Mục tiêu

- Đưa baseline Next.js BFF, NestJS/Fastify Control Plane, worker và Supabase self-hosted tới trạng thái sẵn sàng vận hành production có thể kiểm chứng.
- Thiết lập đường triển khai lặp lại được bằng Docker Compose trên VPS, Caddy, GHCR và GitHub Actions theo đúng stack đã duyệt.
- Bảo vệ ranh giới Internet/private network, session, M2M identity, secret, quyền database và thao tác quản trị.
- Chứng minh backup off-host, WAL/PITR và quy trình restore đáp ứng RPO/RTO đã duyệt bằng restore drill có đo thời gian và mức mất dữ liệu.
- Có health/readiness, graceful drain, quan sát, cảnh báo, runbook, capacity test, rollback/forward-fix và game day trước go-live.
- Giữ nguyên invariant của P1–P7: hard quota nguyên tử, audit/usage append-only, least privilege, fail-closed và billing bị cô lập.

## 3. Prerequisites và human decisions

### Cổng đầu vào

- [ ] Có bằng chứng Phase 7 PASS từ QA và reviewer cho **toàn bộ roster ứng dụng bắt buộc**; không còn app bắt buộc chưa onboard/chưa verify và không còn mục “phải sửa”. P7 mới chỉ đạt một phần hoặc chỉ pass một tập con không mở P8.
- [ ] OpenAPI, schema, migration chain và image build của P7 đã được đóng phiên bản ứng viên.
- [ ] Có chủ sở hữu vận hành, bảo mật, dữ liệu và incident commander; có lịch on-call/escalation được phê duyệt.
- [ ] Ngay đầu phase, user đã explicit approval cho `orchestrator` sửa `infra/**` và `.github/workflows/**`, **hoặc** đã giao từng path đó cho một agent hiện hữu có quyền sửa và phạm vi phù hợp. Nếu chưa có approval/assignment này thì không mở công việc trên hai path; không tự tạo lane `Infrastructure`.

### Quyết định phải chốt trước implementation

- [ ] **RPO/RTO:** mục tiêu cho PostgreSQL, cấu hình và secret; cách đo, phạm vi sự cố, tần suất restore drill và ngưỡng pass/fail.
- [ ] **Retention/privacy:** loại dữ liệu, mục đích, thời hạn, legal hold, anonymization/deletion, quyền đọc và tương tác với backup/PITR cho session, idempotency, usage, audit, log, trace.
- [ ] **Revoke SLA:** thời gian hội tụ tối đa cho account/session, entitlement, cache, M2M identity/scope và credential rotation/revoke.
- [ ] **Outage/last-known-good:** phân loại từng feature; TTL; trải nghiệm degraded; feature nào luôn fail-closed. Authentication, hard quota và entitlement rủi ro cao không được fail-open.
- [ ] **Capacity/SLO:** tải dự kiến, headroom, latency/error/availability objectives, budget kết nối database, concurrency worker và ngưỡng cảnh báo.
- [ ] **Deployment topology:** so sánh và phê duyệt rõ (a) một VPS chạy app + data, (b) VPS ứng dụng và VPS dữ liệu tách biệt, và (c) HA trong tương lai. Decision record phải nêu network boundary, failure domain/correlated failure, vận hành, capacity, bảo mật, chi phí, độ phức tạp, RPO/RTO và đường nâng cấp. Hai VPS có thể là target được khuyến nghị nhưng không được freeze hay yêu cầu trước approval; HA tương lai không được diễn giải là đã có.
- [ ] **Domain/network:** domain production, DNS, TLS, port/firewall, egress allowlist, nguồn IP quản trị và cách truy cập Studio theo topology đã được phê duyệt; nếu chọn hai VPS mới chốt private link/routing giữa app và data VPS.
- [ ] **Data residency:** nơi đặt host theo topology được duyệt, nơi lưu backup off-host, nơi log/trace được xử lý và giới hạn truyền dữ liệu.
- [ ] **Chấp nhận rủi ro topology:** người có thẩm quyền ký các rủi ro còn lại của lựa chọn đã duyệt. Nếu dùng single primary không automatic failover, phải nêu rõ hậu quả downtime và quy trình restore/manual recovery.
- [ ] Công cụ observability, secret handling, vulnerability scanning, SBOM và signing nếu có đã được duyệt. Phase này không tự chọn công cụ mới.

Thiếu bất kỳ quyết định bắt buộc nào thì dừng ở thiết kế/runbook tương ứng; không điền default giả để vượt cổng.

## 4. Phạm vi

- Docker Compose production trên VPS với Caddy ở biên, image lấy từ GHCR và pipeline GitHub Actions có approval.
- Triển khai topology đã được con người phê duyệt. Nếu chọn hai VPS thì tách workload ứng dụng/dữ liệu và private routing; nếu chọn một VPS thì vẫn cô lập network/container và ghi nhận shared failure domain. Trong mọi lựa chọn, chỉ bề mặt ứng dụng qua Caddy được public; endpoint Supabase và Studio phải private.
- Quyền runtime/migration tách biệt; secret injection/rotation/revoke theo công cụ đã duyệt, không đưa secret vào image, source, log hoặc workflow output.
- Migration task one-shot; rollout API, worker và web có health/readiness/drain; migration không chạy ở mỗi lần process startup.
- Backup PostgreSQL/Supabase off-host, WAL/PITR, restore drill, upgrade/version pin và staging validation.
- Capacity, connection, Supavisor, contention và degraded-mode testing theo SLO/capacity đã duyệt.
- Structured log/correlation, metrics, traces, alerts và runbook bằng tooling đã duyệt; không ghi PII/token/secret.
- Production hardening cho user web, admin web, Control Plane, worker, session/revoke và thao tác quản trị.
- Security test, deploy rollback drill, DR game day, secret rotation, M2M revoke, retention procedure cho ledger append-only và go-live checklist.

## 5. Ngoài phạm vi

- Hiện thực automatic HA, multi-primary, automatic failover hoặc cam kết zero downtime cho database. HA tương lai chỉ được đánh giá trong decision record topology, không được triển khai ngầm ở phase này.
- Chọn cloud, orchestrator, service mesh, gateway, secret manager, observability, scanner, SBOM hay signing tool mới.
- Chuyển khỏi Docker Compose/Caddy/GHCR/GitHub Actions/Supabase self-hosted đã duyệt.
- Thay đổi domain invariant, quota semantics, subscription policy hoặc hợp đồng P1–P7 ngoài một change-control riêng.
- Billing, payment provider, checkout, webhook, refund, tax, price/currency và paid entitlement; các mục này chỉ thuộc Phase 9 sau phê duyệt.
- Biến Supabase Data API hoặc Studio thành đường truy cập runtime nghiệp vụ.
- Xóa/sửa lịch sử `usage_events` hoặc `audit_events` để rollback hay thực thi retention.

## 6. Deliverables

- Bộ Compose và cấu hình môi trường production/staging đã review, kèm sơ đồ network/data flow và inventory port/endpoint.
- Caddy routing/TLS/security configuration; Supabase/Studio không public.
- GitHub Actions build/publish/deploy dùng image immutable đã pin bằng digest hoặc định danh bất biến đã duyệt; promotion có approval và provenance phù hợp khả năng tooling được duyệt.
- Runbook migration, rollout, rollback/forward-fix, drain, backup, PITR, restore, upgrade, secret rotation, M2M revoke, incident và retention.
- Bằng chứng staging deploy, rollback drill, restore drill, DR game day, capacity/Supavisor test và security test.
- Dashboard/alert catalog với owner, severity, threshold, suppression và liên kết runbook.
- Production go-live checklist, change record, danh sách known risks và văn bản chấp nhận rủi ro cho topology đã duyệt; nếu là single primary thì phải ghi rõ không automatic failover.
- Báo cáo QA và reviewer độc lập. Không deliverable nào tự thân là bằng chứng production đã chạy.

## 7. Target paths

Các path dưới đây là **đích dự kiến cho implementation sau khi P7 PASS**, không khẳng định chúng hiện tồn tại:

- `infra/**`: Docker Compose, Caddy, network theo topology được duyệt, Supabase deployment overlays, backup/restore/DR scripts và cấu hình hạ tầng telemetry.
- `.github/workflows/**`: build, publish GHCR, promotion, deploy, migration gate, rollback/drill và security checks đã được duyệt.
- `apps/control-plane/drizzle/migrations/`: forward migrations đã review; migration chỉ chạy qua one-shot task, không nằm trong startup path.
- `apps/control-plane/src/main-worker.*`: entrypoint worker canonical của cùng Control Plane modular monolith.
- `apps/control-plane/**`: health/readiness, graceful shutdown/drain, runtime configuration, application instrumentation và worker lifecycle.
- `apps/web/**`: production headers/CSP, BFF session/revoke behavior, image URL policy, health/readiness và performance/accessibility hardening.
- `tests/**`: test tích hợp, security, capacity, deploy/rollback và DR theo contract đã freeze.
- `contracts/openapi/control-plane.v1.yaml`: OpenAPI dùng chung; chỉ integration owner được chỉ định sửa trong phase.
- `docs/**`: runbook, topology, security/DR evidence và go-live record trong một lượt tài liệu riêng được cho phép.

Không tạo `apps/*/billing`, billing workflow, billing secret hoặc billing schema trong Phase 8.

## 8. DB/migration

### Quyền và kết nối

- Runtime chỉ dùng role tối thiểu cho repository của Control Plane qua Supavisor; không dùng owner/migration role.
- Migration task dùng role riêng, secret riêng, thời hạn/quyền truy cập được kiểm soát; Studio là ngoại lệ quản trị private và có audit truy cập phù hợp.
- Xác minh pool mode, transaction semantics, prepared statement behavior nếu được dùng, connection timeout, pool budget cho API/worker/migration và tổng giới hạn PostgreSQL.

### Trình tự và an toàn migration

1. Review migration ID bất biến và compatibility với image đang chạy/ảnh sắp rollout.
2. Tạo backup/PITR checkpoint theo policy đã duyệt và xác minh khả năng truy xuất.
3. Chạy migration bằng **one-shot migration task** trước rollout ứng dụng.
4. Chạy validation về constraint, trigger append-only, grants, schema version và query trọng yếu.
5. Chỉ khi migration pass mới rollout API, worker rồi web. Không chạy migration trong entrypoint chung hoặc mỗi lần replica/process startup.
6. Với thay đổi destructive/large rewrite, dùng expand → backfill → validate → contract qua các release; sau khi nhận write, ưu tiên forward-fix.

### Backup, PITR, restore và upgrade

- Backup phải rời host/failure domain chứa primary data tới vị trí off-host phù hợp data residency; chi tiết luồng mạng phụ thuộc topology đã duyệt. Mã hóa, quyền truy cập, integrity check và retention theo quyết định đã duyệt.
- WAL archive/PITR phải có monitoring cho freshness/gap và cảnh báo trước khi vi phạm RPO.
- Restore drill dùng môi trường cô lập, phục hồi cả base backup + WAL tới recovery point mục tiêu, chạy kiểm tra consistency/application smoke và đo **data loss thực tế** cùng **thời gian khôi phục thực tế** so với RPO/RTO.
- Pin version image Supabase/PostgreSQL và thành phần liên quan; upgrade trước ở staging với bản sao dữ liệu đã sanitize hoặc bộ dữ liệu đại diện, kiểm tra extension/Compose compatibility, backup và đường quay lại.
- Capacity test bao phủ connection exhaustion, Supavisor saturation/recovery, API/worker competition, quota lock contention và hành vi fail-closed.

Retention của `audit_events`/`usage_events` phải qua procedure đặc quyền, approval và audit riêng; không tắt trigger, `TRUNCATE`, sửa hay xóa lịch sử tùy tiện. Procedure chỉ được hiện thực sau khi policy, legal basis và ảnh hưởng backup/PITR được duyệt.

## 9. Backend API

- Giữ REST JSON versioned và OpenAPI 3.1 đã freeze; deploy hardening không đổi semantics ngầm.
- Cung cấp liveness chỉ chứng minh process còn sống; readiness chứng minh instance có thể nhận traffic theo dependency/policy đã duyệt. Không đưa secret hoặc chi tiết nội bộ nhạy cảm vào response.
- Khi chuyển phiên bản, ngừng nhận request mới, cho request/transaction đang chạy thời gian drain có giới hạn, dừng worker nhận job mới và xử lý outcome không rõ theo idempotency/status workflow.
- API/worker không tự migrate. Startup với schema incompatible phải fail rõ ràng và không nhận traffic.
- Truyền/khởi tạo correlation ID qua BFF, API, worker và call ra ngoài; structured log dùng field ổn định, redaction bắt buộc.
- Không log token, cookie, authorization header, client secret, session value thô, webhook giả định, PII không cần thiết hoặc payload nghiệp vụ không giới hạn.
- Revoke account/session/M2M scope phải được re-authorize theo thiết kế và đo theo SLA; cache không sống lâu hơn policy.
- Admin mutation tiếp tục permission + reason + correlation + audit đồng transaction; health/degraded path không được bypass authorization hoặc hard quota.

## 10. User web

- Cấu hình security headers ở lớp phù hợp: CSP dựa trên inventory nguồn thật, HSTS sau khi domain/TLS sẵn sàng, `frame-ancestors`, MIME sniffing, referrer và permissions policy theo threat model. Không copy CSP giả rồi nới `unsafe-*` để chữa lỗi.
- BFF cookie giữ `HttpOnly`, `Secure`, `SameSite` và CSRF protection; logout/revoke xóa cookie và vô hiệu session server-side theo contract.
- `image_url` chỉ từ allowlist đã duyệt. Nếu tối ưu/fetch server-side, kiểm tra redirect và chặn loopback/private/link-local sau DNS resolution; nếu browser tải trực tiếp, CSP phải giới hạn nguồn.
- Trang lỗi/degraded không lộ stack trace, topology, token hoặc quyết định bảo mật; không tuyên bố hành động đã hoàn tất khi backend outcome chưa rõ.
- Kiểm tra keyboard, focus, screen reader, contrast, reduced motion và thông báo trạng thái; kiểm tra desktop/mobile/tablet ở viewport đã duyệt.
- Đặt performance budget đã được con người phê duyệt; đo asset size, render/navigation và ảnh hưởng của auth/catalog, không tự bịa ngưỡng.

## 11. Admin web

- Route hiding chỉ là UX; BFF/API luôn kiểm tra admin permission deny-by-default.
- Mutation nhạy cảm yêu cầu re-auth/step-up nếu policy đã duyệt, CSRF protection, reason bắt buộc, confirmation chống nhầm target và correlation/audit.
- Không cho bulk operation vượt scope; preview/summary phải chỉ ra target và tác động. Retry dùng idempotency contract, không lặp mutation mù sau timeout.
- Session admin, revoke và timeout phải tuân SLA/chính sách riêng; không lưu token/secret trong browser storage hoặc analytics.
- Audit/search/export được scope, phân trang, redact và retention đúng policy; export dữ liệu nhạy cảm cần kiểm soát riêng.
- Giữ accessibility, responsive và performance ở mức tương đương user web; bảng/diff/dialog phải dùng được bằng bàn phím và màn hình nhỏ.

## 12. Integration/security

### Network và secret

- Internet → Caddy → web/API được phép theo route. Kết nối app → data chỉ qua endpoint/port tối thiểu theo topology đã duyệt; nếu tách hai VPS thì bắt buộc dùng private routing đã phê duyệt. Supabase API, database, Supavisor quản trị và Studio không public trong mọi topology.
- Firewall deny-by-default; SSH/admin access giới hạn nguồn/phương thức đã duyệt. Không dùng shared M2M credential giữa backend.
- Thực hiện rotation drill cho deploy/runtime/database/Auth0 secret theo khả năng hệ thống đã duyệt; xác nhận credential cũ bị vô hiệu và request mới bị deny trong SLA.

### Supply chain

- Pin base/runtime/Supabase/Caddy/application image theo policy đã duyệt; không dùng floating tag để promotion production.
- Nếu công cụ SBOM/signing/provenance/scanning đã được phê duyệt, thêm gate và xác minh ở deploy. Nếu chưa được duyệt, ghi blocker/risk; **không tự chọn công cụ** hoặc tuyên bố kiểm soát đã có.

### Observability

- Chỉ dùng tooling đã phê duyệt. Structured logs mang timestamp, service/version/environment, severity, operation và correlation; không mang PII/token/secret.
- Metrics bao phủ request/error/latency, readiness, worker lag/outcome, DB/Supavisor connections, lock contention, backup/WAL freshness, restore status và revoke propagation theo quyết định đã duyệt.
- Trace sampling/retention/redaction phải theo privacy policy; propagation không biến user identifier thành dữ liệu công khai.
- Mỗi alert có owner, severity, điều kiện, cửa sổ, runbook và kiểm thử phát hiện/khôi phục; tránh alert không hành động được.

## 13. Contract freeze

Trước khi mở implementation, architect read-only review/đề xuất contract; orchestrator cùng các owner đã được phê duyệt mới điều phối việc freeze. Architect không ghi file, không sở hữu lane và không được dùng làm integration owner. Contract freeze phải tạo manifest ownership tới cấp file trước khi mở bất kỳ lane nào, gồm owner đã được user phê duyệt cho `infra/**`, `.github/workflows/**`, OpenAPI và mọi root/shared file.

Release contract gồm:

- deployment topology đã có human approval, image/version matrix, Compose project, domain/DNS/TLS và network allowlist tương ứng;
- biến cấu hình và secret reference theo environment, không ghi giá trị secret;
- API/OpenAPI compatibility, schema version/migration order và minimum compatible application version;
- liveness/readiness/drain semantics, timeout và rollout ordering;
- backup/WAL/PITR format, encryption, retention, restore target và tiêu chí RPO/RTO;
- SLO/capacity budget, telemetry field/redaction, alert thresholds và runbook owner;
- revoke/outage/last-known-good policy, session lifetime và admin-operation protection;
- rollback/forward-fix decision tree cùng tiêu chí go/no-go.

Mọi thay đổi contract sau freeze phải qua change review và cập nhật test/runbook trước deploy. Contract này không được thêm billing capability.

## 14. Tests

- **Build/supply chain:** image reproducibility ở mức tooling cho phép, immutable reference, dependency/vulnerability gate đã duyệt, secret scan và không rò secret vào layer/artifact/log.
- **Deployment:** fresh staging deploy, repeat deploy, migration failure, API/worker/web partial rollout, readiness removal, graceful drain và promotion approval.
- **Rollback/forward-fix:** rollback image khi schema còn compatible; forward-fix sau migration nhận write; kiểm chứng không xóa ledger/published snapshot.
- **Security:** TLS/header/CSP/CSRF/cookie, direct endpoint/admin bypass, private Supabase/Studio exposure, SSRF qua image URL, log/token/PII leakage, least-privilege role và forged health/admin requests.
- **Identity:** session revoke/logout, secret rotation, M2M identity/scope revoke, credential cũ và race giữa revoke với quota operation; đo theo revoke SLA.
- **Database:** migration grants/constraints/triggers, backup integrity, WAL continuity, PITR target, restore consistency, version upgrade staging và append-only retention procedure.
- **Concurrency/capacity:** remaining=1 hard quota, API/worker contention, duplicate reconciliation, connection storm, Supavisor saturation/recovery, worker drain/restart và DB unavailable fail-closed.
- **DR game day:** giả lập mất host/container/failure domain theo topology đã duyệt (bao gồm mất riêng app/data VPS nếu topology hai VPS được chọn) hoặc lỗi release; dùng runbook, đo phát hiện/điều phối/recovery/data loss, ghi gap và rerun sau sửa.
- **Web:** accessibility tự động + thủ công, desktop/mobile/tablet, CSP/image allowlist, session expiry/revoke, error/degraded UX và performance budget.
- **Observability:** correlation xuyên tầng, redaction, dashboard signal, synthetic alert và runbook link; không đánh dấu pass chỉ vì dashboard tồn tại.

Mỗi test phải lưu command/version/environment, timestamp, expected/actual, artifact và người xác minh. Không có lệnh thật thì báo blocker; không bịa output.

## 15. Ordered steps

Runbook thực thi dưới đây giữ nguyên mạch logic của phase và mô tả mỗi bước theo năm thành phần: **Hành động**, **Sản phẩm** (path/artifact), **Phụ thuộc**, **Verify** (drill + kết quả đo được) và **Lane** (khớp mục 16). Các bước chạm `infra/**` và `.github/workflows/**` chỉ do `orchestrator` thực hiện **sau explicit user approval** (hoặc agent hiện hữu được user giao path); trước approval các bước đó giữ trạng thái chờ và không được mở. Runbook này không tuyên bố bất kỳ deploy/drill nào đã chạy hay đã go-live; ô Verify chỉ đạt khi có evidence thật từ môi trường và kết luận độc lập của QA/reviewer.

Mọi mục tiêu định lượng (RPO/RTO, capacity/SLO budget, revoke SLA, drain timeout) là ‹cần chốt: quyết định mục 3›; runbook mô tả cách đo, không tự đặt ngưỡng. Deployment topology là decision gate ‹cần chốt: một VPS / hai VPS app-data / HA tương lai›; mọi bước topology-specific chỉ áp dụng theo phương án đã được con người phê duyệt.

### Bước 1 — Xác nhận cổng đầu vào và approval sở hữu hạ tầng

- **Hành động:** Thu thập bằng chứng Phase 7 PASS cho toàn bộ mandatory roster; xin explicit user approval cho owner của `infra/**` và `.github/workflows/**`; lập change owner/RACI, incident commander và lịch on-call/escalation.
- **Sản phẩm:** `docs/**` change record (RACI, approval log, roster P7 evidence index).
- **Phụ thuộc:** Phase 7 PASS từ QA/reviewer; approval người dùng cho hai path hạ tầng. Không có approval → giữ phase `blocked`, không mở lane hạ tầng/workflow.
- **Verify:** Đối chiếu QA/reviewer sign-off P7 không còn mục "phải sửa" và không còn app bắt buộc chưa verify; approval được ghi văn bản với named authority.
- **Lane:** `subagent/document` (ghi record). Approval là hành động của người dùng; không agent nào tự cấp.

### Bước 2 — Chốt deployment topology và các human decision mục 3

- **Hành động:** So sánh ‹cần chốt: một VPS / hai VPS app-data / HA tương lai› với network boundary, failure domain, capacity, bảo mật, chi phí, RPO/RTO và đường nâng cấp; phê duyệt topology cùng risk acceptance. Hoàn tất các quyết định còn lại mục 3: RPO/RTO, retention/privacy, revoke SLA, outage/last-known-good, capacity/SLO, domain/network, data residency, observability/secret/scanning tooling.
- **Sản phẩm:** `docs/**` topology decision record + bảng quyết định mục 3 (mỗi mục có owner/approval).
- **Phụ thuộc:** Bước 1.
- **Verify:** Mỗi quyết định bắt buộc có named authority ký; thiếu bất kỳ quyết định nào → dừng tại thiết kế, không điền default giả. Nếu chọn single primary không automatic failover, decision record ghi rõ hậu quả downtime và quy trình manual recovery.
- **Lane:** Quyết định thuộc người dùng/owner được phê duyệt; `subagent/document` ghi record; `subagent/architect` chỉ review read-only.

### Bước 3 — Freeze contract, version matrix và ownership manifest

- **Hành động:** Sau approval, freeze topology, release contract (image/version matrix, Compose project, domain/DNS/TLS, network allowlist), threat model production; lập file-level ownership manifest tới cấp file trước khi mở bất kỳ lane nào.
- **Sản phẩm:** `docs/**` release contract + ownership manifest; `contracts/openapi/control-plane.v1.yaml` chỉ do integration owner được chỉ định chạm.
- **Phụ thuộc:** Bước 2 (topology approved).
- **Verify:** Manifest gán đúng một owner cho mỗi file, gồm bằng chứng approval cho `infra/**`, `.github/workflows/**`, OpenAPI và mọi root/shared file; không file nào chia sẻ write ownership.
- **Lane:** `subagent/architect` review/đề xuất read-only; `orchestrator` cùng owner đã phê duyệt điều phối freeze; `subagent/document` ghi manifest.

### Bước 4 — Chuẩn bị staging tương đồng topology

- **Hành động:** Dựng staging khớp topology đã duyệt (chỉ tách app/data VPS nếu decision record chọn phương án đó); khóa Supabase API/database/Supavisor quản trị/Studio khỏi Internet; chỉ expose bề mặt ứng dụng qua Caddy.
- **Sản phẩm:** `infra/**` (Compose staging, Caddy, network overlays theo topology).
- **Phụ thuộc:** Bước 3. **Cần user approval trước khi chạm `infra/**`.**
- **Verify:** Probe từ Internet xác nhận endpoint Supabase/Studio không truy cập được; chỉ route ứng dụng qua Caddy phản hồi; ghi lại kết quả scan port/endpoint.
- **Lane:** `orchestrator` **sau explicit user approval** (hoặc agent hiện hữu được giao path).

### Bước 5 — Thiết lập role, secret, firewall, Caddy/TLS và image pin

- **Hành động:** Cấu hình role runtime tối thiểu qua Supavisor và role migration riêng; secret reference theo công cụ đã duyệt (không đưa secret vào image/source/log); firewall deny-by-default; Caddy/TLS; pin image bằng digest/định danh bất biến.
- **Sản phẩm:** `infra/**` (secret reference config, firewall rules, Caddy config, image pin manifest).
- **Phụ thuộc:** Bước 4; công cụ secret handling đã duyệt ở mục 3. **Cần user approval trước khi chạm `infra/**`.**
- **Verify:** Secret scan trên repo/artifact/layer/log không phát hiện credential; xác minh runtime role không có quyền owner/migration; image reference là immutable digest, không floating tag.
- **Lane:** `orchestrator` **sau explicit user approval**.

### Bước 6 — Xây pipeline CI/CD build → test → publish → promotion

- **Hành động:** Dựng GitHub Actions build → test → publish GHCR → approve promotion với provenance phù hợp; chỉ thêm SBOM/signing/scanning nếu ‹cần chốt: tooling supply-chain đã duyệt›; nếu chưa duyệt thì ghi blocker/risk, không tự chọn công cụ.
- **Sản phẩm:** `.github/workflows/**` (build/publish/promotion/migration gate/security checks).
- **Phụ thuộc:** Bước 5. **Cần user approval trước khi chạm `.github/workflows/**`.**
- **Verify:** Pipeline chạy trên staging tạo image immutable đã pin; promotion yêu cầu approval; secret scan gate chặn khi có secret; ghi command/version/run link thật.
- **Lane:** `orchestrator` **sau explicit user approval**.

### Bước 7 — Hiện thực migration one-shot và release order

- **Hành động:** Triển khai release order **backup/checkpoint → migration task (one-shot) → validation → API → worker → web**; migration không nằm trong startup path của bất kỳ process nào.
- **Sản phẩm:** `apps/control-plane/drizzle/migrations/` (forward migrations), `apps/control-plane/**` (worker entrypoint không tự migrate); orchestration deploy thuộc `infra/**`/`.github/workflows/**`.
- **Phụ thuộc:** Bước 6; migration chain P7 đã đóng phiên bản. Phần deploy orchestration **cần user approval trước khi chạm `infra/**`/`.github/workflows/**`.**
- **Verify:** Staging deploy theo đúng order: backup/checkpoint tạo trước, migration task chạy một lần và pass validation (constraint, trigger append-only, grants, schema version) trước khi rollout API → worker → web; startup với schema incompatible fail rõ ràng và không nhận traffic.
- **Lane:** `subagent/backend` (migrations, worker/API); `orchestrator` **sau approval** cho deploy orchestration.

### Bước 8 — health/readiness/drain và rollback/forward-fix decision tree

- **Hành động:** Thêm/kiểm chứng liveness, readiness (theo dependency/policy đã duyệt), graceful drain có giới hạn thời gian ‹cần chốt: drain timeout›, schema compatibility check và rollback/forward-fix decision tree.
- **Sản phẩm:** `apps/control-plane/**` (health/readiness/drain, schema check); `docs/**` (rollback/forward-fix decision tree).
- **Phụ thuộc:** Bước 7.
- **Verify:** Drill removal khỏi readiness → instance ngừng nhận traffic mới; drain cho request/transaction đang chạy hoàn tất trong timeout đo được; liveness không lộ secret/chi tiết nội bộ; rollback image khi schema backward-compatible drill thành công.
- **Lane:** `subagent/backend`; `subagent/document` ghi decision tree.

### Bước 9 — Backup off-host, WAL/PITR monitoring và restore drill đầu tiên

- **Hành động:** Thiết lập backup rời host/failure domain primary tới vị trí off-host phù hợp data residency (mã hóa, integrity check, retention theo quyết định); WAL archive/PITR monitoring cho freshness/gap; runbook restore/upgrade; chạy restore drill #1.
- **Sản phẩm:** `infra/**` (backup/restore/DR scripts, WAL/PITR monitoring config); `docs/**` (runbook restore/upgrade + kết quả drill).
- **Phụ thuộc:** Bước 5; RPO/RTO ‹cần chốt: mục 3›; data residency ‹cần chốt: mục 3›. **Cần user approval trước khi chạm `infra/**`.**
- **Verify:** Restore drill trong môi trường cô lập phục hồi base backup + WAL tới recovery point mục tiêu; đo **data loss thực tế** so với RPO và **thời gian khôi phục thực tế** so với RTO; chạy consistency/application smoke; WAL freshness alert fire trước khi vi phạm RPO. Drill pass chỉ khi số đo nằm trong ngưỡng đã duyệt.
- **Lane:** `orchestrator` **sau explicit user approval** (scripts/config); `subagent/document` ghi kết quả đo.

### Bước 10 — Observability: telemetry, dashboard, alert, runbook

- **Hành động:** Thêm structured log/correlation, metrics (request/error/latency, readiness, worker lag, DB/Supavisor connections, lock contention, backup/WAL freshness, restore status, revoke propagation), trace sampling/redaction, dashboard và alert bằng ‹cần chốt: observability tooling đã duyệt›; không ghi PII/token/secret.
- **Sản phẩm:** `apps/control-plane/**` và `apps/web/**` (application instrumentation); `infra/**` (telemetry infrastructure config); `docs/**` (alert catalog + runbook link).
- **Phụ thuộc:** Bước 8, Bước 9; tooling observability đã duyệt mục 3. Phần infra **cần user approval trước khi chạm `infra/**`.**
- **Verify:** Synthetic alert fire-test cho từng alert (owner/severity/threshold/runbook link); correlation ID xuyên BFF → API → worker; kiểm tra log/trace không chứa PII/token/secret; không đánh dấu pass chỉ vì dashboard tồn tại.
- **Lane:** `subagent/backend` + `subagent/frontend` (instrumentation theo path); `orchestrator` **sau approval** (telemetry infra); `subagent/document` ghi catalog.

### Bước 11 — Harden user/admin web

- **Hành động:** Cấu hình CSP dựa trên inventory nguồn thật, HSTS sau khi domain/TLS sẵn sàng, `frame-ancestors`, MIME/referrer/permissions policy; BFF cookie `HttpOnly`/`Secure`/`SameSite` + CSRF; `image_url` allowlist với chặn loopback/private/link-local sau DNS resolution; logout/revoke xóa cookie và vô hiệu session server-side; admin re-auth/step-up/reason/confirmation/audit.
- **Sản phẩm:** `apps/web/**` (headers/CSP, BFF session/revoke, image URL policy, admin protections).
- **Phụ thuộc:** Bước 3 (domain/TLS contract); performance budget ‹cần chốt: mục 10›.
- **Verify:** Test TLS/header/CSP/CSRF/cookie; SSRF qua image URL bị chặn; logout vô hiệu session server-side; accessibility (keyboard/focus/screen reader/contrast/reduced motion) và responsive desktop/mobile/tablet đạt tiêu chí đã duyệt; đo performance budget với ngưỡng đã phê duyệt.
- **Lane:** `subagent/frontend`.

### Bước 12 — Security, concurrency, capacity và Supavisor tests

- **Hành động:** Chạy security test (direct endpoint/admin bypass, private Supabase/Studio exposure, log/token/PII leakage, least-privilege, forged health/admin requests); concurrency (remaining=1 hard quota, duplicate reconciliation); capacity/connection storm; Supavisor saturation/recovery; DB unavailable fail-closed; xử lý finding theo severity gate.
- **Sản phẩm:** `tests/**` (security/concurrency/capacity/Supavisor tests + evidence).
- **Phụ thuộc:** Bước 7–11; capacity/SLO budget ‹cần chốt: mục 3›.
- **Verify:** remaining=1 dưới tải chỉ cho tối đa một reserve thành công; connection/Supavisor test đáp ứng connection budget/SLO đã duyệt mà không phá fail-closed invariant; mọi test lưu command/version/environment/timestamp/expected/actual/artifact/người xác minh. Finding **Critical** phải đóng, không waiver.
- **Lane:** `subagent/tester`.

### Bước 13 — Deploy rollback drill, secret rotation, M2M revoke, retention procedure và DR game day

- **Hành động:** Chạy deploy rollback/forward-fix drill; secret rotation drill (deploy/runtime/database/Auth0) xác nhận credential cũ bị vô hiệu trong revoke SLA; M2M identity/scope revoke test; append-only retention procedure test (không tắt trigger, không `TRUNCATE`/rewrite lịch sử); DR game day giả lập mất host/container/failure domain theo topology đã duyệt (gồm mất riêng app/data VPS nếu chọn hai VPS).
- **Sản phẩm:** `tests/**` (rollback/DR/rotation/retention evidence); `infra/**`/`.github/workflows/**` phần drill script/gate; `docs/**` (DR game day report, gap list, remediation).
- **Phụ thuộc:** Bước 9 (restore/backup), Bước 12; revoke SLA ‹cần chốt: mục 3›. Phần script/gate **cần user approval trước khi chạm `infra/**`/`.github/workflows/**`.**
- **Verify:** DR game day dùng runbook, đo thời gian phát hiện/điều phối/recovery và data loss thực tế so với RPO/RTO; ghi gap và rerun sau sửa; secret rotation xác nhận request bằng credential cũ bị deny trong SLA; retention procedure không xóa/sửa lịch sử `usage_events`/`audit_events`. Mọi gap **Critical** phải đóng, không waiver/risk acceptance.
- **Lane:** `subagent/tester` (test/evidence); `orchestrator` **sau approval** (drill script/gate hạ tầng); `subagent/document` ghi report.

### Bước 14 — QA và reviewer độc lập

- **Hành động:** Chạy QA và reviewer read-only; tối đa ba vòng làm → kiểm → sửa → kiểm lại theo `AGENTS.md`. QA/reviewer không sửa implementation.
- **Sản phẩm:** `docs/**` (QA report, reviewer report — do owner tài liệu tổng hợp; QA/reviewer tự ghi kết luận theo quyền của họ).
- **Phụ thuộc:** Bước 1–13.
- **Verify:** QA verify command/path/config từ repo và môi trường thật, không chấp nhận output mô phỏng; reviewer phân loại "phải sửa"/"khuyến nghị". Kết quả `PASS`/`FAIL`/`TẮC`/`CẠN LƯỢT` là verification metadata, không thay canonical status `blocked`.
- **Lane:** `subagent/qa` và `subagent/reviewer` (read-only, `edit: deny`).

### Bước 15 — Go-live review (không tự tuyên bố go-live)

- **Hành động:** Hoàn tất go-live checklist (DNS/TLS, version, migration, smoke, owner, communications) và risk acceptance topology đã duyệt; trình hồ sơ readiness để người có thẩm quyền ký go/no-go.
- **Sản phẩm:** `docs/**` (go-live checklist, known risks, go/no-go record).
- **Phụ thuộc:** Bước 14 (QA PASS + reviewer hết mục "phải sửa"); mọi exit gate mục 18 đạt.
- **Verify:** Checklist hoàn chỉnh và đồng bộ cấu hình thật; nếu single primary thì ghi rõ không automatic failover; risk acceptance không override Critical gap/QA PASS/reviewer gate. **Kế hoạch này không tự tuyên bố production đã bật traffic**; go-live chỉ xảy ra sau chữ ký go/no-go của người có thẩm quyền.
- **Lane:** `subagent/document` (ghi checklist/record). Quyết định go/no-go thuộc người có thẩm quyền, không phải agent.

## 16. Parallel lanes và ownership

Contract freeze phải lập manifest ownership **tới cấp file** cho mọi file hiện hữu hoặc dự kiến được chạm trước khi bắt đầu song song. Mỗi file chỉ có một owner; file mới ngoài glob đã giao và mọi root/shared file phải được chỉ định owner trước khi tạo. Manifest phải ghi bằng chứng explicit user approval/assignment cho path ngoài phạm vi mặc định. Không được mở lane chưa có approval và không được dùng “cùng sửa rồi resolve conflict” làm quy trình.

| Lane/owner duy nhất | Path sở hữu | Trách nhiệm | Không được chạm |
|---|---|---|---|
| `subagent/backend` | `apps/control-plane/**`, gồm `apps/control-plane/drizzle/migrations/` và `apps/control-plane/src/main-worker.*` | API/worker health-readiness-drain, application instrumentation, runtime config và migrations | `apps/web/**`, `infra/**`, `.github/workflows/**`, `tests/**`, docs |
| `subagent/frontend` | toàn bộ `apps/web/**` | User/admin/BFF headers, CSP, session/revoke, responsive/accessibility/performance | Control Plane, infra/workflows, tests, docs |
| `orchestrator` **chỉ sau explicit user approval**, hoặc agent hiện hữu được user giao path phù hợp | `infra/**` và `.github/workflows/**` | Compose/Caddy/network, GHCR/deploy, backup/restore/DR scripts và telemetry **infrastructure configuration** | Không sửa trước approval; không chạm application instrumentation, tests hoặc docs ngoài assignment |
| `subagent/tester` | `tests/**` | Contract/integration/security/capacity/deploy/rollback/DR tests và evidence test | Logic sản phẩm, migration, infra/workflows, docs |
| `subagent/document` | chỉ `docs/**` | Runbook, topology decision, evidence index, go-live/rollback documentation | Mọi code, migration, infra, workflow, contract và test |
| Một agent hiện hữu được giao làm integration owner, hoặc `orchestrator` sau explicit user approval | `contracts/openapi/control-plane.v1.yaml` và từng root/shared file được liệt kê đích danh trong manifest | Tích hợp OpenAPI/root artifact sau contract freeze | Không chia sẻ write ownership; architect không thể làm owner vì read-only |

Không có lane `Infrastructure` trong roster `AGENTS.md`; tên này không được dùng như một agent/owner. Không tạo lane Database/DR hoặc Observability riêng có quyền ghi chồng lên các path trên. Architect, chuyên gia DB/DR và observability chỉ review/tư vấn theo quyền; thay đổi phải do owner path đã được phê duyệt thực hiện. Sau khi các lane hội tụ mới chạy deploy/restore/DR drill tích hợp; QA và reviewer chạy độc lập, read-only.

## 17. Checklist

### Functional
- [ ] Deploy order luôn là migration task → API → worker → web và có gate giữa từng bước.
- [ ] Health/readiness/drain phản ánh đúng trạng thái; migration không chạy ở startup.
- [ ] Go-live checklist bao phủ DNS/TLS, version, migration, smoke, owner và communications.
- [ ] Topology được human approval sau khi so sánh một VPS, hai VPS và HA tương lai; mọi task topology-specific chỉ áp dụng theo lựa chọn đó.

### Security
- [ ] Supabase endpoints và Studio private; firewall/Caddy/headers/CSP/cookie/CSRF được kiểm thử.
- [ ] Runtime/migration role và secret tách biệt; rotation cùng M2M revoke đáp ứng SLA.
- [ ] Không PII/token/secret trong log, trace, image, artifact hoặc workflow output.

### Database
- [ ] Backup off-host, WAL/PITR, integrity/freshness alert và restore drill đạt RPO/RTO đã duyệt.
- [ ] Version pin/upgrade được staging validate; migration grants/triggers/constraints đạt.
- [ ] Retention append-only dùng procedure đặc quyền có approval/audit, không rewrite lịch sử.

### Concurrency
- [ ] Hard quota và duplicate reconciliation vẫn an toàn dưới tải/connection pressure.
- [ ] Revoke race, worker restart/drain và Supavisor saturation không tạo bypass/double-spend.

### Accessibility
- [ ] User/admin flow dùng được bằng keyboard, screen reader; focus, contrast và status announcement đạt tiêu chí đã duyệt.

### Responsive
- [ ] User/admin web được kiểm tra trên desktop, điện thoại, máy tính bảng; bảng/dialog/error state không mất chức năng.

### Observability
- [ ] Log/metric/trace/correlation/redaction đúng contract; alert có owner và runbook đã được fire-test.
- [ ] Backup/WAL, connections, worker, revoke và SLO có tín hiệu đủ để điều tra.

### Rollback và DR
- [ ] Image rollback và migration forward-fix được drill; không dùng xóa ledger để quay lại.
- [ ] DR game day đo recovery/data loss và có remediation; risk của topology được ký chấp nhận, gồm single-primary/no-auto-failover nếu áp dụng.
- [ ] Không còn gap **Critical**; Critical không được waiver/risk acceptance để qua exit gate.
- [ ] Mọi gap **High** còn mở chỉ có exception khi loại rủi ro được policy cho phép waive, có named authority phê duyệt, compensating controls đã được kiểm chứng, expiry và remediation deadline, tracking owner, đồng thời reviewer xác nhận finding không còn là mục “phải sửa”.
- [ ] Risk acceptance/exception không override QA PASS hoặc reviewer gate.

### Documentation
- [ ] Topology, inventory, contract, runbook, evidence, known risks và go/no-go record đồng bộ với cấu hình thật.
- [ ] Không tài liệu nào tuyên bố HA, billing hoặc triển khai thành công khi chưa có bằng chứng.

## 18. Exit gate

Phase 8 chỉ đủ điều kiện kết thúc khi:

- mọi quyết định mục 3 có owner/phê duyệt; toàn bộ mandatory roster P7 đã được verify và P7 vẫn PASS trên release candidate, không chấp nhận partial P7;
- staging deploy theo đúng order thành công, rollback/forward-fix drill đạt và production migration plan được review;
- restore drill cùng DR game day đạt RPO/RTO đã duyệt; mọi gap **Critical** đã đóng, không chấp nhận waiver. Gap **High** phải đóng, trừ exception mà loại rủi ro được policy cho phép waive, có named authority, compensating controls đã được kiểm chứng, expiry/remediation deadline, tracking owner và reviewer xác nhận finding không còn là mục “phải sửa”;
- capacity/connection/Supavisor test đáp ứng capacity/SLO gate; fail-closed invariant không bị phá;
- private network, role/secret, security headers/CSP/image URL, session/M2M revoke và admin protection đều có test evidence;
- observability/alert/runbook được kiểm thử, không chứa PII/token/secret;
- go-live checklist hoàn chỉnh và rủi ro topology đã duyệt được ký rõ; nếu dùng single primary phải ghi rõ không automatic failover. Risk acceptance không được dùng để bỏ qua Critical gap, QA PASS hoặc reviewer gate;
- QA PASS và reviewer không còn mục “phải sửa”.

Exit của phase là kết luận readiness theo bằng chứng, không tự động có nghĩa production đã được bật traffic.

## 19. Stop/rollback

### Dừng ngay khi

- P7 không còn PASS, contract/schema/image không xác định được hoặc migration không tương thích.
- Thiếu RPO/RTO, retention/privacy, revoke, outage, SLO/capacity, deployment-topology approval, domain/network, residency hoặc risk acceptance; P7 partial cũng phải dừng.
- Backup/WAL không xác minh được, restore vượt gate, data loss không đo được hoặc Studio/Supabase bị public.
- Phát hiện secret/PII/token trong artifact/log, quyền runtime quá rộng, bypass admin/auth/quota hoặc append-only bị phá.
- Readiness/drain không đáng tin, Supavisor/connection test làm mất invariant, hoặc cùng lỗi lặp lại lần hai.
- Còn bất kỳ gap Critical nào, hoặc có đề xuất waiver/risk acceptance cho Critical.
- Còn gap High không đủ toàn bộ điều kiện exception: loại rủi ro được policy cho waive, named authority, compensating controls đã kiểm chứng, expiry/remediation deadline, tracking owner và reviewer xác nhận không còn là mục “phải sửa”.
- Có ý định dùng risk acceptance/exception để override QA FAIL, thiếu QA PASS hoặc reviewer vẫn còn mục “phải sửa”.

### Quy tắc rollback/forward-fix

- Trước migration: dừng promotion, giữ release last-known-good và điều tra.
- Migration thất bại trước khi nhận traffic/write: chạy rollback script **chỉ nếu** đã review/test và có checkpoint hợp lệ; nếu không, restore theo runbook.
- Migration đã nhận write: không down-migrate bằng cách xóa lịch sử; cô lập traffic theo runbook và ưu tiên forward-fix tương thích.
- Rollout ứng dụng lỗi nhưng schema backward-compatible: bỏ instance khỏi readiness, drain và quay image last-known-good đã pin.
- Sự cố dữ liệu: đóng write theo incident authority, bảo toàn evidence, chọn PITR target được duyệt và ghi rõ data-loss/recovery thực tế.

Nếu rollback có thể vi phạm RPO/RTO hoặc invariant, incident commander phải dừng và xin quyết định; không ứng biến destructive action.

## 20. QA/reviewer sign-off

### QA bắt buộc

- Xác minh command/path/config từ repo và môi trường thật; không chấp nhận output mô phỏng.
- Đối chiếu toàn bộ checklist, test evidence, staging/deploy/rollback, restore/DR, capacity/Supavisor, security/revoke/rotation và observability.
- Ghi kết quả verification theo quy trình (`PASS`, `FAIL`, hoặc `TẮC`/`CẠN LƯỢT` khi đúng điều kiện), finding, severity, evidence link và bước tái hiện. Đây không phải trường trạng thái phase; QA không sửa implementation.

### Reviewer bắt buộc

- Review kiến trúc/topology, least privilege, migration compatibility, rollback/forward-fix, RPO/RTO evidence, privacy/redaction và topology risk statement, gồm single-primary/no-auto-failover nếu áp dụng.
- Tìm thay đổi stack/tooling không được duyệt, claim HA sai, migration-on-startup, public Supabase/Studio, billing bị kéo vào P8 và đường bypass invariant.
- Phân loại rõ “phải sửa” và “khuyến nghị”. Reviewer không sửa implementation.

Chỉ báo Phase 8 đạt khi **QA PASS** và reviewer hết mục **phải sửa**. Tối đa ba vòng; `TẮC`/`CẠN LƯỢT` chỉ là kết quả verification theo `AGENTS.md`, không thay giá trị trạng thái phase.
