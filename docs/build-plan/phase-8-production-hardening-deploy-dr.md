# Phase 8 — Production hardening, triển khai và disaster recovery

Tài liệu này là kế hoạch thực hiện, không phải báo cáo triển khai. Mọi ô kiểm đều để trống cho tới khi có bằng chứng từ môi trường và kết luận độc lập của QA/reviewer.

## 1. Trạng thái

`blocked` — đây là canonical phase status. `TẮC`/`CẠN LƯỢT`, nếu phát sinh, chỉ là verification outcome metadata.

Phase 8 chỉ được mở khi toàn bộ roster bắt buộc của Phase 7 đã được xác minh và Phase 7 có kết luận **PASS** từ QA/reviewer. Topology production chưa được khóa: baseline đã duyệt chỉ cam kết Docker Compose trên VPS; lựa chọn một VPS hay tách app/data VPS phải qua human decision ở mục 3.

Billing không thuộc Phase 8. Không thêm provider, checkout, webhook, bảng hoặc UI billing trừ khi Phase 9 được phê duyệt riêng.

## 2. Mục tiêu

- Đưa baseline Next.js BFF, NestJS/Fastify Control Plane, worker và Supabase self-hosted tới trạng thái sẵn sàng vận hành production có thể kiểm chứng.
- Thiết lập đường triển khai lặp lại được bằng Docker Compose trên VPS, Caddy, GHCR và GitHub Actions theo đúng stack đã duyệt và các quyết định đã chốt tại `./decision-register.md`: compose Supabase tag **`v1.26.07`** rút gọn quanh hai service bắt buộc **`db` + `supavisor`** (DEC-T10), Caddy là proxy duy nhất expose ra Internet (DEC-T11), mọi image pin theo **digest** ghi ở `infra/compose/IMAGE-PINS.md`, CI bốn job `quality`/`test`/`db`/`build` đẩy image lên GHCR (DEC-T13).
- Kế thừa nguyên trạng lựa chọn nhánh quản trị mà **P1.10 đã chốt bằng thực nghiệm** (DEC-T10): nhánh **(a)** `db + supavisor + studio + meta + kong`, hoặc nhánh **(b)** `db + supavisor` và dùng `pnpm db:studio` (Drizzle Studio). P8 **không** chọn lại nhánh và không tự khẳng định Studio có mặt.
- Bảo vệ ranh giới Internet/private network, session, M2M identity, secret, quyền database và thao tác quản trị.
- Chứng minh backup off-host, WAL/PITR và quy trình restore đáp ứng RPO/RTO đã duyệt bằng restore drill có đo thời gian và mức mất dữ liệu.
- Có health/readiness, graceful drain, quan sát, cảnh báo, runbook, capacity test, rollback/forward-fix và game day trước go-live.
- Giữ nguyên invariant của P1–P7: hard quota nguyên tử, audit/usage append-only, least privilege, fail-closed và billing bị cô lập.

## 3. Prerequisites và human decisions

### Cổng đầu vào

- [ ] Có bằng chứng Phase 7 PASS từ QA và reviewer cho **toàn bộ roster ứng dụng bắt buộc**; không còn app bắt buộc chưa onboard/chưa verify và không còn mục “phải sửa”. P7 mới chỉ đạt một phần hoặc chỉ pass một tập con không mở P8.
- [ ] OpenAPI, schema, migration chain và image build của P7 đã được đóng phiên bản ứng viên.
- [ ] Ngay đầu phase, user đã explicit approval cho `orchestrator` sửa `infra/**` và `.github/workflows/**`, **hoặc** đã giao từng path đó cho một agent hiện hữu có quyền sửa và phạm vi phù hợp. Nếu chưa có approval/assignment này thì không mở công việc trên hai path; không tự tạo lane `Infrastructure`.

### Mô hình vận hành: solo

Dự án là **một người + các AI agent** (DEC-G01 tại `./decision-register.md`). Không có Product owner, Security owner, Legal/Privacy owner, Operations team hay incident commander tách biệt; không có RACI nhiều vai và không có on-call rotation. Mọi vai đó là **chủ dự án**.

- **Approver duy nhất:** chủ dự án ký mọi quyết định mục 3, mọi risk acceptance và go/no-go. Agent không tự approve, kể cả khi đề xuất do agent soạn.
- **Incident owner duy nhất:** khi có sự cố, chủ dự án là người quyết định đóng write, chọn PITR target và chấp nhận data loss. Không có escalation chain để leo thang — chỉ có runbook mục 19 và một người đọc nó.
- **Vẫn tách lane `qa`/`reviewer`:** đây **không phải** nghi thức tổ chức mà là luật chống tự lừa của `AGENTS.md` mục 4b. QA và reviewer `edit: deny`; agent viết code không được tự tuyên bố code mình đạt. Luật ba vòng, `TẮC` và `CẠN LƯỢT` giữ nguyên hiệu lực.

Vì chỉ có một người, thứ quyết định phase này sống hay chết không phải sơ đồ trách nhiệm mà là bốn thứ cụ thể, mỗi thứ có bước runbook riêng ở mục 15: **alert đi tới kênh chủ dự án thật sự đọc** (Bước 10), **runbook khi service chết** (Bước 8), **restore từ backup có drill đo được** (Bước 9) và **kill-switch** (Bước 8).

### Quyết định phải chốt trước implementation

- [ ] **RPO/RTO** (DEC-B12, `open`)**:** mục tiêu cho PostgreSQL, cấu hình và secret; cách đo, phạm vi sự cố, tần suất restore drill và ngưỡng pass/fail.
- [ ] **Retention/privacy** (DEC-B11, `open`)**:** loại dữ liệu, mục đích, thời hạn, legal hold, anonymization/deletion, quyền đọc và tương tác với backup/PITR cho session, idempotency, usage, audit, log, trace.
- [ ] **Revoke SLA** (DEC-B10, `open`)**:** thời gian hội tụ tối đa cho account/session, entitlement, cache, M2M identity/scope và credential rotation/revoke.
- [ ] **Kênh nhận alert:** ‹cần chốt: kênh cụ thể chủ dự án thật sự đọc› và ngưỡng nào được phép đánh thức người. Một dự án solo không có ai trực thay; alert gửi vào nơi không ai đọc thì bằng không có alert. Phải chốt cả kênh lẫn danh sách alert được phép gửi tới đó.
- [ ] **Kill-switch:** ‹cần chốt: phạm vi và cách kích hoạt› — cách một người chặn traffic ở Caddy hoặc tắt một app khỏi Hub mà không cần deploy lại và không phá invariant fail-closed.
- [ ] **Outage/last-known-good:** phân loại từng feature; TTL; trải nghiệm degraded; feature nào luôn fail-closed. Authentication, hard quota và entitlement rủi ro cao không được fail-open.
- [ ] **Capacity/SLO:** tải dự kiến, headroom, latency/error/availability objectives, budget kết nối database, concurrency worker và ngưỡng cảnh báo.
- [ ] **Deployment topology:** so sánh và phê duyệt rõ (a) một VPS chạy app + data, (b) VPS ứng dụng và VPS dữ liệu tách biệt, và (c) HA trong tương lai. Decision record phải nêu network boundary, failure domain/correlated failure, vận hành, capacity, bảo mật, chi phí, độ phức tạp, RPO/RTO và đường nâng cấp. Hai VPS có thể là target được khuyến nghị nhưng không được freeze hay yêu cầu trước approval; HA tương lai không được diễn giải là đã có.
- [ ] **Domain/network:** domain production, DNS, TLS, port/firewall, egress allowlist, nguồn IP quản trị và cách truy cập Studio theo topology đã được phê duyệt; nếu chọn hai VPS mới chốt private link/routing giữa app và data VPS.
- [ ] **Data residency:** nơi đặt host theo topology được duyệt, nơi lưu backup off-host, nơi log/trace được xử lý và giới hạn truyền dữ liệu.
- [ ] **Chấp nhận rủi ro topology:** chủ dự án ký các rủi ro còn lại của lựa chọn đã duyệt (DEC-G01). Dự án solo trên VPS gần như chắc chắn là single primary không automatic failover: phải nêu rõ hậu quả downtime và quy trình restore/manual recovery do chính chủ dự án thực hiện.
- [ ] Công cụ observability, secret handling, vulnerability scanning, SBOM và signing nếu có đã được duyệt. Phase này không tự chọn công cụ mới. Load tool riêng đang giữ `open` tới P8 theo DEC-T05; concurrency test dùng `pnpm test:concurrency`.

Thiếu bất kỳ quyết định bắt buộc nào thì dừng ở thiết kế/runbook tương ứng; không điền default giả để vượt cổng.

## 4. Phạm vi

- Docker Compose production trên VPS với Caddy ở biên, image lấy từ GHCR và pipeline GitHub Actions có approval của chủ dự án.
- Nâng compose Supabase `v1.26.07` từ P1 (`infra/compose/docker-compose.yml`) lên cấu hình production, giữ nguyên scope DEC-T10. Lưu ý tên service: PostgreSQL trong compose chính thức tên là **`db`**, không phải `postgres` — mọi hostname, healthcheck, connection string và lệnh `docker compose` phải dùng `db`.

### Scope compose kế thừa từ DEC-T10 và P1.10

| Nhóm | Service | Trạng thái ở P8 |
|---|---|---|
| Bắt buộc giữ | `db`, `supavisor` | Luôn có mặt; là hai service duy nhất runtime nghiệp vụ cần. |
| Loại bỏ vô điều kiện | `auth` (GoTrue), `rest` (PostgREST), `realtime`, `storage`, `imgproxy`, `functions`, `deno-cache` | Không được có mặt ở bất kỳ nhánh nào. Service nào trong nhóm này xuất hiện lại trong compose production là **stop condition** mục 19. |
| Phụ thuộc nhánh P1.10 | `studio`, `meta`, `kong` | Có mặt **chỉ khi** P1.10 chốt nhánh (a); vắng mặt nếu chốt nhánh (b). |

- **Nhánh (a)** `db + supavisor + studio + meta + kong`: Studio đầy đủ, đổi lại kéo theo Kong. Bằng chứng từ compose thật: `studio` phụ thuộc `meta` (`STUDIO_PG_META_URL: http://meta:8080`) **và** `kong` (`SUPABASE_URL: http://kong:8000`), còn `meta` cũng `depends_on: kong` — nên **không thể** giữ Studio mà bỏ Kong. Ở nhánh này Kong là thành phần bắt buộc của Studio, không phải service thừa.
- **Nhánh (b)** `db + supavisor`: không có Studio/`meta`/`kong` trong compose; nhu cầu quản trị dùng `pnpm db:studio` (Drizzle Studio, DEC-T15) chạy cục bộ. Ở nhánh này mọi yêu cầu "Studio private access" của P8 **không áp dụng** — không có Studio để bảo vệ, và đó là một bề mặt tấn công ít hơn.
- P8 **kế thừa** nhánh P1.10 đã chốt, không chọn lại. Nếu P1.10 chưa ghi lại kết quả quan sát được thì đó là blocker: P8 không được suy đoán nhánh.
- **Loại `rest` (PostgREST) là quyết định bảo mật, không phải tối ưu dung lượng:** PostgREST mở một đường vào DB thứ hai vòng qua toàn bộ enforcement entitlement/quota của Control Plane. Control Plane là API duy nhất được phép chạm dữ liệu nghiệp vụ.
- Mọi image trong compose production tham chiếu **digest** (`image: ...@sha256:...`) khớp `infra/compose/IMAGE-PINS.md`; không tag trôi (`latest`, `nightly`, `2-alpine` trần).
- Triển khai topology đã được chủ dự án phê duyệt. Nếu chọn hai VPS thì tách workload ứng dụng/dữ liệu và private routing; nếu chọn một VPS thì vẫn cô lập network/container và ghi nhận shared failure domain. Trong mọi lựa chọn, **Caddy là container duy nhất publish port ra Internet** (DEC-T11); `db`, `supavisor` và — nếu nhánh (a) — `studio`/`meta`/`kong` nằm trên internal network và không publish port ra host.
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
- Biến Supabase Data API hoặc Studio (nếu nhánh (a)) thành đường truy cập runtime nghiệp vụ; kéo `rest` (PostgREST) trở lại để "tiện query" cũng nằm trong lệnh cấm này.
- Chọn lại nhánh (a)/(b) của DEC-T10. Nhánh do P1.10 chốt bằng thực nghiệm; đổi nhánh ở P8 phải là record superseding tại `./decision-register.md`, không phải sửa compose tiện tay.
- Xóa/sửa lịch sử `usage_events` hoặc `audit_events` để rollback hay thực thi retention.

## 6. Deliverables

- Bộ Compose production/staging (`infra/compose/**`) dẫn xuất từ compose Supabase `v1.26.07` đã rút gọn theo scope DEC-T10 và đúng nhánh P1.10 đã chốt, kèm sơ đồ network/data flow và inventory port/endpoint.
- `infra/compose/IMAGE-PINS.md` cập nhật cho mọi image production, mỗi dòng có digest và ngày ghi.
- Caddy routing/TLS/security configuration; Caddy là container duy nhất publish port; `db`/`supavisor` không public, và ở nhánh (a) thì `studio`/`meta`/`kong` cũng không public.
- GitHub Actions build/publish/deploy dùng image immutable pin bằng digest; promotion có approval của chủ dự án và provenance phù hợp khả năng tooling được duyệt.
- Runbook migration, rollout, rollback/forward-fix, drain, backup, PITR, restore, upgrade, secret rotation, M2M revoke, retention và **kill-switch** — viết cho một người đọc lúc 3 giờ sáng: lệnh copy-paste được, không phải mô tả quy trình.
- Bằng chứng staging deploy, rollback drill, restore drill, DR game day, capacity/Supavisor test và security test.
- Alert catalog: mỗi alert có severity, threshold, **kênh đích** ‹cần chốt: kênh nhận alert mục 3›, liên kết runbook và bằng chứng fire-test. Không ghi cột owner — owner luôn là chủ dự án.
- Production go-live checklist, change record, danh sách known risks và văn bản chấp nhận rủi ro topology do chủ dự án ký; nếu là single primary thì phải ghi rõ không automatic failover.
- Báo cáo QA và reviewer độc lập. Không deliverable nào tự thân là bằng chứng production đã chạy.

## 7. Target paths

Các path dưới đây là **đích dự kiến cho implementation sau khi P7 PASS**, không khẳng định chúng hiện tồn tại:

- `infra/compose/docker-compose.yml` và overlay production/staging: Supabase `v1.26.07` rút gọn (`db` + `supavisor`, cộng `studio`/`meta`/`kong` nếu P1.10 chốt nhánh (a)), app/worker/web và Caddy.
- `infra/compose/IMAGE-PINS.md`: bảng digest canonical, mở rộng từ bản P1.10 sang mọi image production.
- `infra/caddy/**`: Caddyfile production, TLS và security header ở biên.
- `infra/**` còn lại: network theo topology được duyệt, backup/restore/DR scripts và cấu hình hạ tầng telemetry.
- `.github/workflows/**`: mở rộng bốn job baseline `quality`/`test`/`db`/`build` của P1 (DEC-T13) thêm publish GHCR, promotion, deploy, migration gate, rollback/drill và security checks đã được duyệt.
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
- Migration task chạy `pnpm db:migrate` bằng role migration riêng, **nối trực tiếp tới service `db` không qua `supavisor`** (DEC-T09/DEC-T15), secret riêng, thời hạn/quyền truy cập được kiểm soát.
- Đường quản trị DB phụ thuộc nhánh P1.10: nhánh **(a)** dùng Studio như ngoại lệ quản trị private, có audit truy cập phù hợp; nhánh **(b)** không có Studio trong compose và quản trị đi qua `pnpm db:studio` chạy cục bộ, không expose ra Internet ở bất kỳ dạng nào. Ở cả hai nhánh, đường quản trị không bao giờ là đường runtime nghiệp vụ.
- Xác minh `supavisor` ở **transaction pooling mode** và `prepare: false` của postgres.js vẫn giữ nguyên trên production (DEC-T09): prepared statement có tên sẽ vỡ khi connection bị trả về pool. Kiểm tra connection timeout, pool budget cho API/worker/migration và tổng giới hạn của `db`.
- Cấm mọi thứ phụ thuộc session state trên đường runtime — session-level advisory lock, temp table, `SET` ngoài transaction. Hard quota chỉ dùng row lock trong một transaction.

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
- Image Supabase/PostgreSQL pin theo digest tại `infra/compose/IMAGE-PINS.md`; nâng version là sửa digest trong file đó cùng một record superseding ở `./decision-register.md`, không phải đổi tag tại chỗ. Upgrade trước ở staging với bản sao dữ liệu đã sanitize hoặc bộ dữ liệu đại diện, kiểm tra extension/Compose compatibility, backup và đường quay lại. Dự án **không** cài extension DB cho UUIDv7 (DEC-T06 sinh ID ở application layer), nên đường upgrade không phải kéo theo extension đó.
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

- Internet → Caddy → web/API được phép theo route. **Caddy là container duy nhất có `ports:` publish ra host** (DEC-T11); mọi service khác chỉ nói chuyện qua internal network của compose. Kết nối app → data chỉ qua endpoint/port tối thiểu theo topology đã duyệt; nếu tách hai VPS thì bắt buộc dùng private routing đã phê duyệt. `db` và `supavisor` không public trong mọi topology và mọi nhánh.
- **Nhánh (a):** `studio`, `meta` và `kong` cũng nằm sau internal network và không public. Studio chỉ truy cập qua đường quản trị private ‹cần chốt: cách truy cập Studio, mục 3›; không đưa Studio ra sau Caddy public dù có thêm auth. Kong ở đây chỉ phục vụ Studio/`meta` — không được định tuyến bất kỳ traffic nghiệp vụ nào qua Kong, vì đó sẽ là đường vòng qua Control Plane.
- **Nhánh (b):** không có `studio`/`meta`/`kong` để bảo vệ; quản trị dùng `pnpm db:studio` cục bộ qua đường truy cập private ‹cần chốt: cách truy cập quản trị DB, mục 3›. Mọi yêu cầu "Studio private" ở trên không áp dụng.
- Ở cả hai nhánh, `rest` (PostgREST) **không tồn tại** trong compose. Đây là ràng buộc bảo mật cứng: PostgREST sẽ là đường vào `db` thứ hai, vòng qua toàn bộ enforcement entitlement/quota của Control Plane.
- Firewall deny-by-default; SSH/admin access giới hạn nguồn/phương thức đã duyệt. Không dùng shared M2M credential giữa backend.
- Thực hiện rotation drill cho deploy/runtime/database/Auth0 secret theo khả năng hệ thống đã duyệt; xác nhận credential cũ bị vô hiệu và request mới bị deny trong SLA.

### Supply chain

- Pin base/runtime/Supabase/Caddy/application image theo **digest** tại `infra/compose/IMAGE-PINS.md`; không dùng floating tag để promotion production. Base image ứng dụng là `node:24.18.0-bookworm-slim` khớp `.nvmrc` và `engines.node` (DEC-T01); Docker build dùng `--frozen-lockfile` (DEC-T02).
- Nếu công cụ SBOM/signing/provenance/scanning đã được phê duyệt, thêm gate và xác minh ở deploy. Nếu chưa được duyệt, ghi blocker/risk; **không tự chọn công cụ** hoặc tuyên bố kiểm soát đã có.

### Observability

- Chỉ dùng tooling đã phê duyệt. Structured logs mang timestamp, service/version/environment, severity, operation và correlation; không mang PII/token/secret.
- Metrics bao phủ request/error/latency, readiness, worker lag/outcome, DB/Supavisor connections, lock contention, backup/WAL freshness, restore status và revoke propagation theo quyết định đã duyệt.
- Trace sampling/retention/redaction phải theo privacy policy; propagation không biến user identifier thành dữ liệu công khai.
- Mỗi alert có severity, điều kiện, cửa sổ, **kênh đích**, runbook và kiểm thử phát hiện/khôi phục. Owner luôn là chủ dự án nên không cần trường owner; thứ phải chốt là alert nào được phép gửi tới kênh đánh thức người và alert nào chỉ nằm trên dashboard.
- Tiêu chí solo: một alert không dẫn tới hành động chủ dự án làm được một mình, lúc nửa đêm, bằng runbook có sẵn thì phải xóa hoặc hạ severity. Alert không ai đọc là nợ, không phải vùng phủ.

## 13. Contract freeze

Trước khi mở implementation, architect read-only review/đề xuất contract; orchestrator cùng các owner đã được phê duyệt mới điều phối việc freeze. Architect không ghi file, không sở hữu lane và không được dùng làm integration owner. Contract freeze phải tạo manifest ownership tới cấp file trước khi mở bất kỳ lane nào, gồm owner đã được user phê duyệt cho `infra/**`, `.github/workflows/**`, OpenAPI và mọi root/shared file.

Release contract gồm:

- deployment topology đã được chủ dự án approve, image/digest matrix chốt tại `infra/compose/IMAGE-PINS.md`, danh sách service Supabase được giữ theo nhánh P1.10 đã chốt (`db` + `supavisor`, cộng `studio`/`meta`/`kong` nếu nhánh (a)), Compose project, domain/DNS/TLS và network allowlist tương ứng;
- biến cấu hình và secret reference theo environment, không ghi giá trị secret;
- API/OpenAPI compatibility, schema version/migration order và minimum compatible application version;
- liveness/readiness/drain semantics, timeout và rollout ordering;
- backup/WAL/PITR format, encryption, retention, restore target và tiêu chí RPO/RTO;
- SLO/capacity budget, telemetry field/redaction, alert thresholds, kênh nhận alert và kill-switch scope;
- revoke/outage/last-known-good policy, session lifetime và admin-operation protection;
- rollback/forward-fix decision tree cùng tiêu chí go/no-go.

Mọi thay đổi contract sau freeze phải qua change review và cập nhật test/runbook trước deploy. Contract này không được thêm billing capability.

## 14. Tests

- **Build/supply chain:** image reproducibility ở mức tooling cho phép, immutable reference, dependency/vulnerability gate đã duyệt, secret scan và không rò secret vào layer/artifact/log.
- **Deployment:** fresh staging deploy, repeat deploy, migration failure, API/worker/web partial rollout, readiness removal, graceful drain và promotion approval.
- **Rollback/forward-fix:** rollback image khi schema còn compatible; forward-fix sau migration nhận write; kiểm chứng không xóa ledger/published snapshot.
- **Security:** TLS/header/CSP/CSRF/cookie, direct endpoint/admin bypass, SSRF qua image URL, log/token/PII leakage, least-privilege role và forged health/admin requests. Riêng về compose: xác nhận `db`/`supavisor` không reachable từ Internet; xác nhận **không có** service `rest` (PostgREST) lắng nghe ở bất kỳ đâu; nếu nhánh (a) thì thêm test `studio`/`meta`/`kong` không public.
- **Identity:** session revoke/logout, secret rotation, M2M identity/scope revoke, credential cũ và race giữa revoke với quota operation; đo theo revoke SLA.
- **Database:** migration grants/constraints/triggers, backup integrity, WAL continuity, PITR target, restore consistency, version upgrade staging và append-only retention procedure.
- **Concurrency/capacity:** remaining=1 hard quota, API/worker contention, duplicate reconciliation, connection storm, Supavisor saturation/recovery, worker drain/restart và DB unavailable fail-closed.
- **DR game day:** giả lập mất host/container/failure domain theo topology đã duyệt (bao gồm mất riêng app/data VPS nếu topology hai VPS được chọn) hoặc lỗi release; dùng runbook, đo phát hiện/điều phối/recovery/data loss, ghi gap và rerun sau sửa.
- **Web:** accessibility tự động + thủ công, desktop/mobile/tablet, CSP/image allowlist, session expiry/revoke, error/degraded UX và performance budget.
- **Observability:** correlation xuyên tầng, redaction, dashboard signal, synthetic alert và runbook link; không đánh dấu pass chỉ vì dashboard tồn tại.

Mỗi test phải lưu command/version/environment, timestamp, expected/actual, artifact và người xác minh. Không có lệnh thật thì báo blocker; không bịa output.

## 15. Ordered steps

Runbook thực thi dưới đây giữ nguyên mạch logic của phase và mô tả mỗi bước theo năm thành phần: **Hành động**, **Sản phẩm** (path/artifact), **Phụ thuộc**, **Verify** (drill + kết quả đo được) và **Lane** (khớp mục 16). Các bước chạm `infra/**` và `.github/workflows/**` chỉ do `orchestrator` thực hiện **sau explicit user approval** (hoặc agent hiện hữu được user giao path); trước approval các bước đó giữ trạng thái chờ và không được mở. Runbook này không tuyên bố bất kỳ deploy/drill nào đã chạy hay đã go-live; ô Verify chỉ đạt khi có evidence thật từ môi trường và kết luận độc lập của QA/reviewer.

Mọi mục tiêu định lượng (RPO/RTO, capacity/SLO budget, revoke SLA, drain timeout) là ‹cần chốt: quyết định mục 3›; runbook mô tả cách đo, không tự đặt ngưỡng. Deployment topology là decision gate ‹cần chốt: một VPS / hai VPS app-data / HA tương lai›; mọi bước topology-specific chỉ áp dụng theo phương án chủ dự án đã phê duyệt.

Lệnh trong ô **Verify** dùng tên canonical tại DEC-T15 (`./decision-register.md` mục E). Các lệnh này chỉ tồn tại sau khi P1.7 tạo script và P1.10 tạo compose; trước đó chúng là hợp đồng tên, **chưa chạy được** — không bước nào dưới đây được coi là đã chạy.

### Bước 1 — Xác nhận cổng đầu vào và approval sở hữu hạ tầng

- **Hành động:** Thu thập bằng chứng Phase 7 PASS cho toàn bộ mandatory roster; xin explicit approval của chủ dự án cho owner của `infra/**` và `.github/workflows/**`. Không lập RACI, không lập lịch on-call: theo DEC-G01 chủ dự án là approver và incident owner duy nhất — một bảng phân vai nhiều người sẽ mô tả một tổ chức không tồn tại.
- **Sản phẩm:** `docs/**` change record (approval log, roster P7 evidence index).
- **Phụ thuộc:** Phase 7 PASS từ QA/reviewer; approval của chủ dự án cho hai path hạ tầng. Không có approval → giữ phase `blocked`, không mở lane hạ tầng/workflow.
- **Verify:** Đối chiếu QA/reviewer sign-off P7 không còn mục "phải sửa" và không còn app bắt buộc chưa verify; approval được ghi văn bản kèm ngày.
- **Lane:** `subagent/document` (ghi record). Approval là hành động của chủ dự án; không agent nào tự cấp.

### Bước 2 — Chốt deployment topology và các human decision mục 3

- **Hành động:** So sánh ‹cần chốt: một VPS / hai VPS app-data / HA tương lai› với network boundary, failure domain, capacity, bảo mật, chi phí, RPO/RTO và đường nâng cấp; phê duyệt topology cùng risk acceptance. Hoàn tất các quyết định còn lại mục 3: RPO/RTO (DEC-B12), retention/privacy (DEC-B11), revoke SLA (DEC-B10), outage/last-known-good, capacity/SLO, kênh nhận alert, kill-switch scope, domain/network, data residency, observability/secret/scanning tooling.
- **Sản phẩm:** `docs/**` topology decision record; các quyết định nghiệp vụ được ghi ngược về `./decision-register.md` nhóm B khi chốt.
- **Phụ thuộc:** Bước 1.
- **Verify:** Mỗi quyết định bắt buộc có chữ ký chủ dự án và ngày; thiếu bất kỳ quyết định nào → dừng tại thiết kế, không điền default giả. Trạng thái DEC-B10/B11/B12 chuyển `open` → `approved` tại register; còn `open` thì P8 vẫn đóng theo bảng C. Nếu chọn single primary không automatic failover, decision record ghi rõ hậu quả downtime và quy trình manual recovery do chủ dự án tự chạy.
- **Lane:** Quyết định thuộc chủ dự án; `subagent/document` ghi record; `subagent/architect` chỉ review read-only.

### Bước 3 — Freeze contract, version matrix và ownership manifest

- **Hành động:** Sau approval, freeze topology, release contract (image/version matrix, Compose project, domain/DNS/TLS, network allowlist), threat model production; lập file-level ownership manifest tới cấp file trước khi mở bất kỳ lane nào.
- **Sản phẩm:** `docs/**` release contract + ownership manifest; `contracts/openapi/control-plane.v1.yaml` chỉ do integration owner được chỉ định chạm.
- **Phụ thuộc:** Bước 2 (topology approved).
- **Verify:** Manifest gán đúng một owner cho mỗi file, gồm bằng chứng approval cho `infra/**`, `.github/workflows/**`, OpenAPI và mọi root/shared file; không file nào chia sẻ write ownership.
- **Lane:** `subagent/architect` review/đề xuất read-only; `orchestrator` cùng owner đã phê duyệt điều phối freeze; `subagent/document` ghi manifest.

### Bước 4 — Chuẩn bị staging tương đồng topology

- **Hành động:** Dựng staging khớp topology đã duyệt (chỉ tách app/data VPS nếu decision record chọn phương án đó) từ compose Supabase `v1.26.07` rút gọn của P1.10, **đúng nhánh (a)/(b) mà P1.10 đã chốt** — P8 không chọn lại nhánh; nếu P1.10 chưa ghi kết quả thì dừng, đây là blocker. Xác nhận nhóm loại bỏ vô điều kiện (`auth`, `rest`, `realtime`, `storage`, `imgproxy`, `functions`, `deno-cache`) vẫn không có mặt (DEC-T10); bỏ mọi `ports:` trừ Caddy; khóa `db`/`supavisor` — và `studio`/`meta`/`kong` nếu nhánh (a) — khỏi Internet.
- **Sản phẩm:** `infra/compose/**` (compose staging + overlay theo topology), `infra/caddy/**` (Caddyfile staging).
- **Phụ thuộc:** Bước 3; nhánh (a)/(b) đã được P1.10 chốt và ghi lại. **Cần user approval trước khi chạm `infra/**`.**
- **Verify:** `docker compose -f infra/compose/docker-compose.yml config` render đúng danh sách service của nhánh đã chốt — nhánh (a): `db`, `supavisor`, `studio`, `meta`, `kong`, api, worker, web, caddy; nhánh (b): `db`, `supavisor`, api, worker, web, caddy — và **chỉ caddy có `ports:`**. Grep output `config` xác nhận **không có** `auth`, `rest`, `realtime`, `storage`, `imgproxy`, `functions`, `deno-cache`. `docker compose -f infra/compose/docker-compose.yml up -d` rồi probe từ Internet xác nhận `db`/`supavisor` (và Studio nếu nhánh (a)) không truy cập được; chỉ route ứng dụng qua Caddy phản hồi; ghi lại kết quả scan port/endpoint. Teardown bằng `docker compose -f infra/compose/docker-compose.yml down -v`.
- **Lane:** `orchestrator` **sau explicit user approval** (hoặc agent hiện hữu được giao path).

### Bước 5 — Thiết lập role, secret, firewall, Caddy/TLS và image pin

- **Hành động:** Cấu hình role runtime tối thiểu qua `supavisor` (transaction pooling, `prepare: false`) và role migration riêng nối trực tiếp service `db`; secret reference theo công cụ đã duyệt (không đưa secret vào image/source/log); firewall deny-by-default; Caddy/TLS cho domain production ‹cần chốt: domain/DNS, mục 3›; cập nhật `infra/compose/IMAGE-PINS.md` cho mọi image production (bao gồm `studio`/`meta`/`kong` nếu nhánh (a)).
- **Sản phẩm:** `infra/compose/IMAGE-PINS.md`, `infra/caddy/**`, `infra/**` (secret reference config, firewall rules).
- **Phụ thuộc:** Bước 4; công cụ secret handling đã duyệt ở mục 3. **Cần user approval trước khi chạm `infra/**`.**
- **Verify:** Mọi `image:` trong compose production là `...@sha256:...` khớp một dòng của `infra/compose/IMAGE-PINS.md` — grep compose không còn tag trần; secret scan trên repo/artifact/layer/log không phát hiện credential; xác minh runtime role không có quyền owner/migration (thử `CREATE TABLE` bằng role runtime phải bị từ chối). Connection string của runtime trỏ tới `supavisor`, của migration trỏ tới `db` — dùng `docker compose -f infra/compose/docker-compose.yml port db 5432` như P1.10 để xác nhận tên service là `db`, không phải `postgres`.
- **Lane:** `orchestrator` **sau explicit user approval**.

### Bước 6 — Mở rộng pipeline CI/CD sang publish → promotion

- **Hành động:** Mở rộng bốn job baseline P1 `quality`/`test`/`db`/`build` (DEC-T13) thêm publish GHCR → approve promotion với provenance phù hợp; giữ nguyên luật P1: thiếu credential GHCR thì **skip và báo skip**, không log như thành công. Chỉ thêm SBOM/signing/scanning nếu ‹cần chốt: tooling supply-chain đã duyệt›; nếu chưa duyệt thì ghi blocker/risk, không tự chọn công cụ.
- **Sản phẩm:** `.github/workflows/**` (build/publish/promotion/migration gate/security checks).
- **Phụ thuộc:** Bước 5. **Cần user approval trước khi chạm `.github/workflows/**`.**
- **Verify:** Job `quality` chạy `pnpm typecheck`, `pnpm lint`, `pnpm openapi:lint`, `pnpm openapi:drift`; job `test` chạy `pnpm test` và `pnpm test:e2e`; job `db` chạy `pnpm db:migrate` trên PostgreSQL container sạch; job `build` chạy `pnpm build` + Docker build với `--frozen-lockfile` và publish digest lên GHCR. Node version trong CI khớp `.nvmrc` (24.18.0). Pipeline trên staging tạo image immutable đã pin; promotion yêu cầu approval của chủ dự án; secret scan gate chặn khi có secret; ghi command/version/run link thật.
- **Lane:** `orchestrator` **sau explicit user approval**.

### Bước 7 — Hiện thực migration one-shot và release order

- **Hành động:** Triển khai release order **backup/checkpoint → migration task (one-shot) → validation → API → worker → web**; migration không nằm trong startup path của bất kỳ process nào.
- **Sản phẩm:** `apps/control-plane/drizzle/migrations/` (forward migrations), `apps/control-plane/**` (worker entrypoint không tự migrate); orchestration deploy thuộc `infra/**`/`.github/workflows/**`.
- **Phụ thuộc:** Bước 6; migration chain P7 đã đóng phiên bản. Phần deploy orchestration **cần user approval trước khi chạm `infra/**`/`.github/workflows/**`.**
- **Verify:** Staging deploy theo đúng order: backup/checkpoint tạo trước, migration task chạy `pnpm db:migrate` **một lần** bằng role migration nối trực tiếp service `db` (không qua `supavisor`) và pass validation (constraint, trigger append-only, grants, schema version) trước khi rollout API → worker → web; chạy lại `pnpm db:migrate` là no-op. Startup API/worker với schema incompatible fail rõ ràng và không nhận traffic; grep image/entrypoint xác nhận không process nào gọi migrate lúc khởi động.
- **Lane:** `subagent/backend` (migrations, worker/API); `orchestrator` **sau approval** cho deploy orchestration.

### Bước 8 — health/readiness/drain, runbook "service chết", kill-switch và rollback/forward-fix decision tree

- **Hành động:** Thêm/kiểm chứng liveness, readiness (theo dependency/policy đã duyệt), graceful drain có giới hạn thời gian ‹cần chốt: drain timeout›, schema compatibility check và rollback/forward-fix decision tree. Viết hai runbook cho một người:
  - **Service chết:** cây chẩn đoán từ triệu chứng tới lệnh — container nào chết (`docker compose -f infra/compose/docker-compose.yml ps`), log gần nhất (`docker compose -f infra/compose/docker-compose.yml logs --tail=200 <service>`, với `<service>` là tên thật trong compose: `db`, `supavisor`, `caddy`, api/worker/web — **không phải `postgres`**), khởi động lại một service, quay về digest last-known-good ghi ở `infra/compose/IMAGE-PINS.md`, và mốc "khi nào ngừng sửa, chuyển sang restore Bước 9". Runbook phải phân biệt `db` chết (mất dữ liệu tiềm tàng → cân nhắc Bước 9) với `supavisor` chết (đường pool gãy, `db` còn nguyên).
  - **Kill-switch** ‹cần chốt: phạm vi, mục 3›: cách chặn traffic ở Caddy hoặc gỡ một app khỏi Hub **không cần deploy lại**, cùng cách bật lại và cách xác nhận không có entitlement/quota nào bị fail-open trong lúc tắt.
- **Sản phẩm:** `apps/control-plane/**` (health/readiness/drain, schema check); `infra/caddy/**` (kill-switch tại biên); `docs/**` (runbook service-down, runbook kill-switch, rollback/forward-fix decision tree).
- **Phụ thuộc:** Bước 7.
- **Verify:** Drill removal khỏi readiness → instance ngừng nhận traffic mới; drain cho request/transaction đang chạy hoàn tất trong timeout đo được; liveness không lộ secret/chi tiết nội bộ; rollback image khi schema backward-compatible drill thành công. Runbook service-down được drill bằng cách **giết một container thật** trên staging và đi theo runbook không cần kiến thức ngoài văn bản; kill-switch drill xác nhận traffic bị chặn, hệ thống vẫn fail-closed và bật lại được. Runbook nào có bước không copy-paste chạy được là chưa đạt.
- **Lane:** `subagent/backend` (health/readiness/drain); `orchestrator` **sau approval** (kill-switch tại Caddy); `subagent/document` ghi runbook và decision tree.

### Bước 9 — Backup off-host, WAL/PITR monitoring và restore drill đầu tiên

- **Hành động:** Thiết lập backup rời host/failure domain primary tới vị trí off-host phù hợp data residency ‹cần chốt: nơi lưu backup, mục 3› (mã hóa, integrity check, retention theo DEC-B11); WAL archive/PITR monitoring cho freshness/gap; viết **runbook restore** dạng lệnh copy-paste cho một người; chạy restore drill #1.
- **Sản phẩm:** `infra/**` (backup/restore/DR scripts, WAL/PITR monitoring config); `docs/**` (runbook restore/upgrade + kết quả drill).
- **Phụ thuộc:** Bước 5; RPO/RTO ‹cần chốt: DEC-B12›; retention ‹cần chốt: DEC-B11›; data residency ‹cần chốt: mục 3›. **Cần user approval trước khi chạm `infra/**`.**
- **Verify:** Restore drill trong môi trường cô lập phục hồi base backup + WAL tới recovery point mục tiêu; đo **data loss thực tế** so với RPO và **thời gian khôi phục thực tế** so với RTO; chạy consistency check + application smoke; WAL freshness alert fire trước khi vi phạm RPO. Drill pass chỉ khi số đo nằm trong ngưỡng đã duyệt và **do chủ dự án tự chạy end-to-end chỉ bằng runbook** — đây là bài kiểm tra thật, vì trong sự cố thật cũng chỉ có một người đó. Backup chưa từng được restore không phải backup; evidence phải là số đo thật từ môi trường, không phải mô tả quy trình.
- **Lane:** `orchestrator` **sau explicit user approval** (scripts/config); `subagent/document` ghi kết quả đo.

### Bước 10 — Observability: telemetry, dashboard, alert, runbook

- **Hành động:** Thêm structured log/correlation, metrics (request/error/latency, readiness, worker lag, DB/Supavisor connections, lock contention, backup/WAL freshness, restore status, revoke propagation), trace sampling/redaction, dashboard và alert bằng ‹cần chốt: observability tooling đã duyệt›; định tuyến alert tới ‹cần chốt: kênh nhận alert, mục 3›; không ghi PII/token/secret.
- **Sản phẩm:** `apps/control-plane/**` và `apps/web/**` (application instrumentation); `infra/**` (telemetry infrastructure config); `docs/**` (alert catalog + runbook link).
- **Phụ thuộc:** Bước 8, Bước 9; tooling observability và kênh alert đã chốt mục 3. Phần infra **cần user approval trước khi chạm `infra/**`.**
- **Verify:** Synthetic alert fire-test cho **từng** alert, và bằng chứng pass là **alert thật sự đến kênh chủ dự án đọc** (ảnh chụp/log của kênh), không phải alert xuất hiện trong dashboard. Mỗi alert phải dẫn tới đúng một runbook ở Bước 8/Bước 9. Correlation ID xuyên BFF → API → worker; kiểm tra log/trace không chứa PII/token/secret; không đánh dấu pass chỉ vì dashboard tồn tại. Alert nào không có runbook hoặc không hành động được một mình → xóa hoặc hạ severity, ghi lý do.
- **Lane:** `subagent/backend` + `subagent/frontend` (instrumentation theo path); `orchestrator` **sau approval** (telemetry infra); `subagent/document` ghi catalog.

### Bước 11 — Harden user/admin web

- **Hành động:** Cấu hình CSP dựa trên inventory nguồn thật, HSTS sau khi domain/TLS sẵn sàng, `frame-ancestors`, MIME/referrer/permissions policy; BFF cookie `HttpOnly`/`Secure`/`SameSite` + CSRF; `image_url` allowlist với chặn loopback/private/link-local sau DNS resolution; logout/revoke xóa cookie và vô hiệu session server-side; admin re-auth/step-up/reason/confirmation/audit.
- **Sản phẩm:** `apps/web/**` (headers/CSP, BFF session/revoke, image URL policy, admin protections).
- **Phụ thuộc:** Bước 3 (domain/TLS contract); performance budget ‹cần chốt: mục 10›.
- **Verify:** Test TLS/header/CSP/CSRF/cookie; CSP giữ baseline DEC-T12 (`default-src 'self'`; `img-src 'self' data:`; `frame-ancestors 'none'`; `object-src 'none'`; `base-uri 'self'`) và `next.config` không khai báo `remotePatterns` mở; SSRF qua `launch_url`/image URL bị chặn cho RFC1918, `127.0.0.0/8`, `169.254.0.0/16`, `::1`, `fc00::/7` sau DNS resolution; logout vô hiệu session server-side. Accessibility (keyboard/focus/screen reader/contrast/reduced motion) và responsive desktop/mobile/tablet chạy qua `pnpm test:e2e` (Playwright, DEC-T05) đạt tiêu chí đã duyệt; đo performance budget với ngưỡng đã phê duyệt.
- **Lane:** `subagent/frontend`.

### Bước 12 — Security, concurrency, capacity và Supavisor tests

- **Hành động:** Chạy security test (direct endpoint/admin bypass; `db`/`supavisor` không lộ ra Internet; **không có PostgREST/`rest` lắng nghe ở bất kỳ đâu**; Studio/`meta`/`kong` không public nếu nhánh (a); log/token/PII leakage, least-privilege, forged health/admin requests); concurrency (remaining=1 hard quota, duplicate reconciliation); capacity/connection storm; `supavisor` saturation/recovery; `db` unavailable fail-closed; xử lý finding theo severity gate.
- **Sản phẩm:** `tests/**` (security/concurrency/capacity/Supavisor tests + evidence).
- **Phụ thuộc:** Bước 7–11; capacity/SLO budget ‹cần chốt: mục 3›.
- **Verify:** `pnpm test:concurrency` (testcontainers trên PostgreSQL thật, DEC-T05) chứng minh remaining=1 dưới tải chỉ cho tối đa một reserve thành công — mock hay in-memory DB không tính là evidence vì invariant này phụ thuộc row lock và isolation level thật. `pnpm test` cho suite còn lại. Connection/Supavisor test đáp ứng connection budget/SLO đã duyệt mà không phá fail-closed invariant; mọi test lưu command/version/environment/timestamp/expected/actual/artifact/người xác minh. Finding **Critical** phải đóng, không waiver.
- **Lane:** `subagent/tester`.

### Bước 13 — Deploy rollback drill, secret rotation, M2M revoke, retention procedure và DR game day

- **Hành động:** Chạy deploy rollback/forward-fix drill; secret rotation drill (deploy/runtime/database/Auth0) xác nhận credential cũ bị vô hiệu trong revoke SLA; M2M identity/scope revoke test; append-only retention procedure test (không tắt trigger, không `TRUNCATE`/rewrite lịch sử); DR game day giả lập mất host/container/failure domain theo topology đã duyệt (gồm mất riêng app/data VPS nếu chọn hai VPS).
- **Sản phẩm:** `tests/**` (rollback/DR/rotation/retention evidence); `infra/**`/`.github/workflows/**` phần drill script/gate; `docs/**` (DR game day report, gap list, remediation).
- **Phụ thuộc:** Bước 9 (restore/backup), Bước 12; revoke SLA ‹cần chốt: DEC-B10›; retention ‹cần chốt: DEC-B11›. Phần script/gate **cần user approval trước khi chạm `infra/**`/`.github/workflows/**`.**
- **Verify:** DR game day dùng runbook và **do chủ dự án tự chạy một mình** — không có điều phối viên, không có escalation, nên thứ được đo là thời gian phát hiện, thời gian recovery và data loss thực tế so với RPO/RTO của đúng một người cầm runbook. Ghi gap và rerun sau sửa; secret rotation xác nhận request bằng credential cũ bị deny trong SLA; retention procedure không xóa/sửa lịch sử `usage_events`/`audit_events`. Mọi gap **Critical** phải đóng, không waiver/risk acceptance.
- **Lane:** `subagent/tester` (test/evidence); `orchestrator` **sau approval** (drill script/gate hạ tầng); `subagent/document` ghi report.

### Bước 14 — QA và reviewer độc lập

- **Hành động:** Chạy QA và reviewer read-only; tối đa ba vòng làm → kiểm → sửa → kiểm lại theo `AGENTS.md`. QA/reviewer không sửa implementation.
- **Sản phẩm:** `docs/**` (QA report, reviewer report — do owner tài liệu tổng hợp; QA/reviewer tự ghi kết luận theo quyền của họ).
- **Phụ thuộc:** Bước 1–13.
- **Verify:** QA verify command/path/config từ repo và môi trường thật, không chấp nhận output mô phỏng; reviewer phân loại "phải sửa"/"khuyến nghị". Kết quả `PASS`/`FAIL`/`TẮC`/`CẠN LƯỢT` là verification metadata, không thay canonical status `blocked`.
- **Lane:** `subagent/qa` và `subagent/reviewer` (read-only, `edit: deny`).

### Bước 15 — Go-live review (không tự tuyên bố go-live)

- **Hành động:** Hoàn tất go-live checklist (DNS/TLS, digest matrix, migration, smoke, kênh alert, kill-switch đã drill) và risk acceptance topology; trình hồ sơ readiness để chủ dự án ký go/no-go.
- **Sản phẩm:** `docs/**` (go-live checklist, known risks, go/no-go record).
- **Phụ thuộc:** Bước 14 (QA PASS + reviewer hết mục "phải sửa"); mọi exit gate mục 18 đạt.
- **Verify:** Checklist hoàn chỉnh và đồng bộ cấu hình thật; nếu single primary thì ghi rõ không automatic failover; risk acceptance không override Critical gap/QA PASS/reviewer gate. **Kế hoạch này không tự tuyên bố production đã bật traffic**; go-live chỉ xảy ra sau chữ ký go/no-go của chủ dự án.
- **Lane:** `subagent/document` (ghi checklist/record). Quyết định go/no-go thuộc chủ dự án, không phải agent.

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
- [ ] Deploy order luôn là migration task (`pnpm db:migrate`) → API → worker → web và có gate giữa từng bước.
- [ ] Health/readiness/drain phản ánh đúng trạng thái; migration không chạy ở startup.
- [ ] Go-live checklist bao phủ DNS/TLS, digest matrix, migration, smoke, kênh alert và kill-switch.
- [ ] Topology được chủ dự án approve sau khi so sánh một VPS, hai VPS và HA tương lai; mọi task topology-specific chỉ áp dụng theo lựa chọn đó.
- [ ] Compose production giữ đúng scope DEC-T10: `db` + `supavisor` bắt buộc; `studio`/`meta`/`kong` chỉ có mặt nếu P1.10 chốt nhánh (a); `auth`, `rest`, `realtime`, `storage`, `imgproxy`, `functions`, `deno-cache` không quay lại.
- [ ] Nhánh (a)/(b) áp dụng ở P8 đúng bằng nhánh P1.10 đã chốt, có dẫn chiếu bằng chứng; P8 không tự chọn lại.
- [ ] Không có tham chiếu nào tới service tên `postgres`; PostgreSQL luôn là `db`.
- [ ] Runbook service-down và kill-switch đã được drill bằng sự cố thật trên staging, không chỉ tồn tại trên giấy.

### Security
- [ ] `db`/`supavisor` private (và `studio`/`meta`/`kong` private nếu nhánh (a)); chỉ Caddy publish port; firewall/Caddy/headers/CSP/cookie/CSRF được kiểm thử.
- [ ] Không tồn tại PostgREST (`rest`) trong compose — không có đường vào `db` thứ hai vòng qua enforcement của Control Plane.
- [ ] Mọi image production pin theo digest khớp `infra/compose/IMAGE-PINS.md`; không tag trôi.
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
- [ ] Log/metric/trace/correlation/redaction đúng contract; mỗi alert có runbook và đã fire-test **đến kênh chủ dự án thật sự đọc**, có bằng chứng nhận được.
- [ ] Backup/WAL, connections, worker, revoke và SLO có tín hiệu đủ để điều tra.
- [ ] Không còn alert không hành động được một mình hoặc không dẫn tới runbook nào.

### Rollback và DR
- [ ] Image rollback và migration forward-fix được drill; không dùng xóa ledger để quay lại.
- [ ] Restore drill và DR game day do chủ dự án tự chạy bằng runbook, đo recovery/data loss thật và có remediation; risk của topology được chủ dự án ký chấp nhận, gồm single-primary/no-auto-failover nếu áp dụng.
- [ ] Không còn gap **Critical**; Critical không được waiver/risk acceptance để qua exit gate.
- [ ] Mọi gap **High** còn mở chỉ có exception khi chủ dự án ký, compensating controls đã được kiểm chứng, có expiry/remediation deadline, đồng thời reviewer xác nhận finding không còn là mục “phải sửa”. Chủ dự án tự ký waiver cho chính mình là điểm yếu cố hữu của mô hình solo — vì vậy reviewer gate không được bỏ qua ở đây.
- [ ] Risk acceptance/exception không override QA PASS hoặc reviewer gate.

### Documentation
- [ ] Topology, inventory, contract, runbook, evidence, known risks và go/no-go record đồng bộ với cấu hình thật.
- [ ] Không tài liệu nào tuyên bố HA, billing hoặc triển khai thành công khi chưa có bằng chứng.

## 18. Exit gate

Phase 8 chỉ đủ điều kiện kết thúc khi:

- mọi quyết định mục 3 được chủ dự án ký, gồm DEC-B10/B11/B12 đã chuyển `approved` tại `./decision-register.md`; toàn bộ mandatory roster P7 đã được verify và P7 vẫn PASS trên release candidate, không chấp nhận partial P7;
- staging deploy theo đúng order thành công, rollback/forward-fix drill đạt và production migration plan được review;
- restore drill cùng DR game day đạt RPO/RTO đã duyệt và được chạy bằng runbook bởi chính chủ dự án; mọi gap **Critical** đã đóng, không chấp nhận waiver. Gap **High** phải đóng, trừ exception có chữ ký chủ dự án, compensating controls đã kiểm chứng, expiry/remediation deadline và reviewer xác nhận finding không còn là mục “phải sửa”;
- compose production đúng scope DEC-T10 và đúng nhánh P1.10 đã chốt (`db` + `supavisor`, cộng `studio`/`meta`/`kong` chỉ ở nhánh (a); không có `auth`/`rest`/`realtime`/`storage`/`imgproxy`/`functions`/`deno-cache`), mọi image pin digest theo `infra/compose/IMAGE-PINS.md`, chỉ Caddy expose ra Internet;
- alert đã fire-test tới kênh chủ dự án đọc; runbook service-down và kill-switch đã drill thật;
- capacity/connection/Supavisor test đáp ứng capacity/SLO gate; fail-closed invariant không bị phá;
- private network, role/secret, security headers/CSP/image URL, session/M2M revoke và admin protection đều có test evidence;
- observability/alert/runbook được kiểm thử, không chứa PII/token/secret;
- go-live checklist hoàn chỉnh và rủi ro topology được chủ dự án ký rõ; nếu dùng single primary phải ghi rõ không automatic failover. Risk acceptance không được dùng để bỏ qua Critical gap, QA PASS hoặc reviewer gate;
- QA PASS và reviewer không còn mục “phải sửa”.

Exit của phase là kết luận readiness theo bằng chứng, không tự động có nghĩa production đã được bật traffic.

## 19. Stop/rollback

### Dừng ngay khi

- P7 không còn PASS, contract/schema/image không xác định được hoặc migration không tương thích.
- Thiếu RPO/RTO (DEC-B12), retention/privacy (DEC-B11), revoke SLA (DEC-B10), outage, SLO/capacity, kênh alert, kill-switch scope, deployment-topology approval, domain/network, residency hoặc risk acceptance; P7 partial cũng phải dừng.
- Backup/WAL không xác minh được, restore vượt gate, data loss không đo được, hoặc `db`/`supavisor`/Studio bị public.
- Compose production xuất hiện service thuộc nhóm loại bỏ vô điều kiện của DEC-T10: `auth` (GoTrue), **`rest` (PostgREST)**, `realtime`, `storage`, `imgproxy`, `functions`, `deno-cache`. `rest` là trường hợp nghiêm trọng nhất — nó mở một đường vào `db` thứ hai vòng qua toàn bộ enforcement entitlement/quota của Control Plane, nên sự có mặt của nó là stop condition ngay cả khi chưa lộ ra Internet.
- P8 chạy nhánh (a)/(b) khác với nhánh P1.10 đã chốt mà không có record superseding; hoặc P1.10 chưa ghi lại nhánh và P8 vẫn dựng compose theo suy đoán.
- Có container ngoài Caddy publish port ra Internet, hoặc image quay về tag trôi.
- Phát hiện secret/PII/token trong artifact/log, quyền runtime quá rộng, bypass admin/auth/quota hoặc append-only bị phá.
- Readiness/drain không đáng tin, Supavisor/connection test làm mất invariant, hoặc cùng lỗi lặp lại lần hai.
- Còn bất kỳ gap Critical nào, hoặc có đề xuất waiver/risk acceptance cho Critical.
- Còn gap High không đủ toàn bộ điều kiện exception: chữ ký chủ dự án, compensating controls đã kiểm chứng, expiry/remediation deadline và reviewer xác nhận không còn là mục “phải sửa”.
- Có ý định dùng risk acceptance/exception để override QA FAIL, thiếu QA PASS hoặc reviewer vẫn còn mục “phải sửa”.

### Quy tắc rollback/forward-fix

- Trước migration: dừng promotion, giữ release last-known-good và điều tra.
- Migration thất bại trước khi nhận traffic/write: chạy rollback script **chỉ nếu** đã review/test và có checkpoint hợp lệ; nếu không, restore theo runbook.
- Migration đã nhận write: không down-migrate bằng cách xóa lịch sử; cô lập traffic theo runbook và ưu tiên forward-fix tương thích.
- Rollout ứng dụng lỗi nhưng schema backward-compatible: bỏ instance khỏi readiness, drain và quay image last-known-good đã pin.
- Sự cố dữ liệu: chủ dự án đóng write, bảo toàn evidence, chọn PITR target và ghi rõ data-loss/recovery thực tế.

Nếu rollback có thể vi phạm RPO/RTO hoặc invariant, **dừng và để chủ dự án quyết định** — không ứng biến destructive action. Không có incident commander riêng để leo thang: chủ dự án vừa là người phát hiện vừa là người quyết định, nên runbook phải nêu sẵn ngưỡng "dừng sửa, chuyển sang restore" thay vì trông chờ một người thứ hai gọi dừng. Agent không được tự chạy destructive action thay chủ dự án.

## 20. QA/reviewer sign-off

### QA bắt buộc

- Xác minh command/path/config từ repo và môi trường thật; không chấp nhận output mô phỏng. Lệnh phải là tên canonical DEC-T15 và phải **đã tồn tại** (tạo ở P1.7/P1.10); tên lệnh trong kế hoạch không chứng minh nó chạy được.
- Đối chiếu toàn bộ checklist, test evidence, staging/deploy/rollback, restore/DR, capacity/Supavisor, security/revoke/rotation và observability.
- Kiểm chứng scope compose theo DEC-T10: `db` + `supavisor` có mặt; `studio`/`meta`/`kong` khớp đúng nhánh P1.10 đã chốt; `auth`/`rest`/`realtime`/`storage`/`imgproxy`/`functions`/`deno-cache` vắng mặt. Kiểm digest pin khớp `infra/compose/IMAGE-PINS.md`, chỉ Caddy publish port, và alert fire-test thật sự đến kênh chủ dự án đọc.
- Ghi kết quả verification theo quy trình (`PASS`, `FAIL`, hoặc `TẮC`/`CẠN LƯỢT` khi đúng điều kiện), finding, severity, evidence link và bước tái hiện. Đây không phải trường trạng thái phase; QA không sửa implementation.

### Reviewer bắt buộc

- Review kiến trúc/topology, least privilege, migration compatibility, rollback/forward-fix, RPO/RTO evidence, privacy/redaction và topology risk statement, gồm single-primary/no-auto-failover nếu áp dụng.
- Tìm thay đổi stack/tooling không được duyệt (đối chiếu bảng D của `./decision-register.md`), claim HA sai, migration-on-startup, `db`/`supavisor`/Studio bị public, service thuộc nhóm loại bỏ quay lại compose (đặc biệt `rest`/PostgREST), nhánh (a)/(b) lệch khỏi P1.10 mà không có record superseding, tham chiếu service `postgres` không tồn tại, tag trôi thay digest, billing bị kéo vào P8 và đường bypass invariant.
- Vì chủ dự án vừa đề xuất vừa phê duyệt, reviewer là đối trọng duy nhất còn lại: một quyết định được ký không có nghĩa nó đúng. Nêu thẳng nếu risk acceptance đang được dùng để lách một gap đáng lẽ phải sửa.
- Phân loại rõ “phải sửa” và “khuyến nghị”. Reviewer không sửa implementation.

Chỉ báo Phase 8 đạt khi **QA PASS** và reviewer hết mục **phải sửa**. Tối đa ba vòng; `TẮC`/`CẠN LƯỢT` chỉ là kết quả verification theo `AGENTS.md`, không thay giá trị trạng thái phase.
