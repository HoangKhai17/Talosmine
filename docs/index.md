# Kiến trúc đề xuất cho Talosmine

> **Trạng thái:** Kiến trúc logic làm đường cơ sở để triển khai theo từng giai đoạn. Tech stack đã được phê duyệt riêng tại [`stack-tech.md`](./stack-tech.md); tài liệu này không mô tả một hệ thống đã được triển khai.

## 1. Bài toán

Talosmine là một Hub tập trung để người dùng khám phá và truy cập khoảng 10 ứng dụng hữu ích trở lên. Mỗi ứng dụng có source code và server do cùng chủ dự án kiểm soát, nhưng được build, deploy và vận hành độc lập trên server hoặc domain riêng.

Các ứng dụng cần dùng chung một tài khoản trung tâm, đồng thời áp dụng nhất quán quyền sử dụng và giới hạn lượt dùng. Người dùng có thể mở URL của ứng dụng trực tiếp, vì vậy việc kiểm soát truy cập không thể chỉ dựa vào giao diện Hub hoặc frontend của từng ứng dụng.

### 1.1. Mục tiêu

- Một tài khoản cho Hub và mọi ứng dụng thông qua đăng nhập một lần (Single Sign-On, viết tắt là SSO).
- Quản lý tập trung subscription, entitlement và quota, trong khi từng ứng dụng vẫn deploy độc lập.
- Chặn ngay hành động khi người dùng không có quyền hoặc đã hết quota.
- Ngăn tiêu vượt quota khi nhiều yêu cầu chạy đồng thời.
- Cho phép thêm ứng dụng mà không sao chép logic plan và quota vào từng codebase.
- Chuẩn bị ranh giới tích hợp ổn định để bổ sung thanh toán sau này.
- Duy trì khả năng audit, thu hồi quyền và xử lý sự cố xuyên ứng dụng.

### 1.2. Phạm vi

Tài liệu này mô tả kiến trúc logic cho:

- danh tính và SSO xuyên domain;
- danh mục ứng dụng và tính năng;
- plan, subscription, entitlement và quota theo lượt;
- hợp đồng tích hợp giữa Hub và các ứng dụng;
- luồng kiểm tra quyền, ghi nhận usage và giới hạn cứng;
- nguyên tắc bảo mật, khả dụng, cache và lộ trình triển khai.

Ngoài phạm vi hiện tại:

- lựa chọn framework, ngôn ngữ, database, cloud, CI hoặc payment provider;
- physical schema, kiểu dữ liệu và giao thức truyền cụ thể;
- thiết kế giao diện chi tiết;
- giá bán, số quota và metric cụ thể của từng ứng dụng;
- subscription cho tổ chức, đội nhóm hoặc chia sẻ quota giữa nhiều người dùng.

### 1.3. Các quyết định đã xác nhận

1. Talosmine là Hub chứa hoặc dẫn tới khoảng 10 ứng dụng trở lên.
2. Mỗi ứng dụng build và deploy độc lập trên server hoặc domain khác nhau.
3. Chủ dự án kiểm soát source code và server của tất cả ứng dụng.
4. Người dùng đăng ký một tài khoản trung tâm.
5. MVP dùng mô hình cá nhân: subscription và quota thuộc về user.
6. Giới hạn chủ yếu theo lượt sử dụng.
7. Hết quota phải chặn ngay theo cơ chế giới hạn cứng (`hard limit`).
8. Thanh toán được triển khai sau khi SSO, entitlement và quota đã ổn định.
9. Kiến trúc dùng **Control Plane tại Hub** và **Data Plane tại từng ứng dụng**. Các ứng dụng tích hợp trực tiếp qua hợp đồng API hoặc middleware dùng chung. Gateway chỉ được bổ sung khi có nhu cầu rõ ràng; traffic nghiệp vụ không bắt buộc đi qua Hub.

## 2. Kết luận kiến trúc

Talosmine tách trách nhiệm thành hai mặt phẳng:

- **Control Plane (mặt phẳng điều khiển) tại Hub:** là nguồn sự thật trung tâm về danh tính, ứng dụng, plan/version, subscription, entitlement, quota, usage tổng hợp, quản trị và audit. Control Plane trả lời người dùng là ai, được dùng tính năng nào và còn quyền tiêu bao nhiêu lượt.
- **Data Plane (mặt phẳng xử lý dữ liệu) tại mỗi ứng dụng:** xử lý nghiệp vụ thực tế, dữ liệu domain và authorization đặc thù của ứng dụng. Data Plane xác thực token, yêu cầu quyết định entitlement, giữ quota trước khi thực hiện hành động và ghi nhận kết quả.

Sự phân tách này giữ cho ứng dụng deploy độc lập mà vẫn có chính sách thương mại nhất quán. Hub không trở thành reverse proxy bắt buộc và không xử lý toàn bộ traffic hoặc dữ liệu nghiệp vụ của ứng dụng.

### 2.1. Sơ đồ tổng quan

```text
                         +--------------------------------------+
                         |             TALOSMINE HUB            |
                         |            CONTROL PLANE             |
                         |                                      |
                         | Identity/SSO | Account | App Catalog |
                         | Plan/Version | Subscription          |
                         | Entitlement  | Quota/Metering         |
                         | Audit/Admin  | Billing Adapter (sau)  |
                         +----------+---------------------------+
                                    ^
                     đăng nhập/      | quyết định quyền,
                     quản lý tài khoản| reserve/commit/cancel
                                    |
+--------+   mở app/redirect   +-----+--------------------------------------+
|  User  |-------------------->|                                            |
+---+----+                     |                                            |
    |                          |                                            |
    | truy cập trực tiếp       v                                            v
    |                  +------------------+                        +------------------+
    +----------------->| App A / Server A |        ...             | App N / Server N |
                       |    DATA PLANE     |                        |    DATA PLANE     |
                       | domain + API riêng|                        | domain + API riêng|
                       +------------------+                        +------------------+
```

Các mũi tên giữa app và Hub biểu thị hợp đồng logic. Giao thức và topology triển khai cụ thể sẽ được quyết định sau.

## 3. Thành phần của Hub

### 3.1. Identity và SSO

- Đăng ký, đăng nhập, đăng xuất và khôi phục quyền truy cập của tài khoản trung tâm.
- Phát hành phiên hoặc token để ứng dụng xác minh danh tính người dùng.
- Quản lý vòng đời credential, khóa tài khoản, thu hồi phiên và các tín hiệu bảo mật.
- Cung cấp luồng chuyển hướng đăng nhập an toàn giữa các domain.

### 3.2. Account

- Quản lý hồ sơ và trạng thái tài khoản.
- Là điểm gắn subscription và quota trong mô hình cá nhân của MVP.
- Cung cấp cho người dùng khả năng xem quyền và usage của chính mình ở mức phù hợp.

### 3.3. Application Catalog

- Đăng ký danh tính logic, tên hiển thị, URL và trạng thái của từng ứng dụng.
- Khai báo feature và usage metric mà ứng dụng hỗ trợ.
- Lưu cấu hình tích hợp cần thiết để Hub nhận diện đúng ứng dụng gọi đến.
- Không chứa dữ liệu nghiệp vụ riêng của ứng dụng.

### 3.4. Plan và Plan Version

- Mô tả gói sản phẩm và các phiên bản bất biến của cấu hình gói.
- Gắn feature, quyền và quota policy với từng phiên bản.
- Cho phép thay đổi gói cho khách hàng mới mà không âm thầm sửa quyền của subscription cũ.

### 3.5. Subscription

- Gắn một user với một phiên bản plan trong một khoảng hiệu lực.
- Theo dõi trạng thái khái niệm như đang hiệu lực, chờ hiệu lực, hết hạn hoặc đã hủy.
- Trong MVP, không thuộc organization và không chia sẻ giữa nhiều user.

### 3.6. Entitlement

- Tính quyền hiệu lực từ subscription, plan version, ngoại lệ quản trị và trạng thái tài khoản.
- Trả lời một user có được phép dùng feature của một application trong ngữ cảnh hiện tại hay không.
- Tách quyết định quyền khỏi tên plan để ứng dụng không cần hiểu mô hình thương mại.

### 3.7. Quota và Metering

- Quản lý hạn mức theo metric và cửa sổ reset.
- Cung cấp thao tác `reserve`, `commit` và `cancel` để giữ rồi quyết toán lượt dùng.
- Tổng hợp usage và từ chối atomically khi không còn đủ quota.
- Duy trì dữ liệu đối soát và khả năng điều chỉnh có audit.

### 3.8. Billing Adapter trong tương lai

- Cô lập tích hợp với hệ thống thanh toán khỏi domain entitlement cốt lõi.
- Chuyển sự kiện thanh toán đã được xác minh thành thay đổi subscription có tính idempotent.
- Không để webhook hoặc trạng thái của payment provider tự động trở thành quyền truy cập nếu chưa qua quy tắc subscription.
- Thành phần này chưa thuộc giai đoạn đầu và chưa có provider được chọn.

### 3.9. Audit và Admin

- Ghi lại thay đổi nhạy cảm đối với user, subscription, entitlement, quota và service identity.
- Cung cấp thao tác quản trị có kiểm soát cho hỗ trợ, điều chỉnh và điều tra sự cố.
- Phân quyền quản trị theo nguyên tắc đặc quyền tối thiểu; thao tác điều chỉnh không được xóa dấu vết lịch sử.

## 4. Thành phần bắt buộc tại mỗi ứng dụng

Mỗi ứng dụng tích hợp qua một adapter hoặc middleware có hành vi nhất quán, nhưng vẫn giữ authorization và nghiệp vụ domain của riêng mình.

### 4.1. Token validation

- Kiểm tra chữ ký, issuer, audience, thời hạn và các ràng buộc cần thiết của token.
- Từ chối token thiếu, sai đối tượng nhận, hết hạn hoặc đã bị vô hiệu theo chính sách thu hồi.
- Không tin dữ liệu nhận trực tiếp từ frontend nếu chưa được backend xác minh.

### 4.2. Policy enforcement

- Ánh xạ hành động nghiệp vụ sang `application`, `feature` và `usage metric` đã đăng ký.
- Yêu cầu quyết định entitlement trước khi cho phép hành động được bảo vệ.
- Chuyển các lý do từ chối thành phản hồi nhất quán nhưng không làm lộ thông tin nhạy cảm.

### 4.3. Domain authorization

- Kiểm tra quyền trên tài nguyên cụ thể của ứng dụng sau bước xác thực và entitlement.
- Ví dụ khái niệm: user có sở hữu hoặc được phép thao tác tài nguyên đang yêu cầu hay không.
- Entitlement thương mại không thay thế authorization nghiệp vụ; có entitlement không đồng nghĩa được truy cập mọi dữ liệu.

### 4.4. Usage reserve, commit và cancel

- `reserve` trước hành động có quota để giữ trước số lượt cần thiết.
- `commit` khi đạt mốc được tính lượt theo chính sách metric.
- `cancel` khi hành động không đạt mốc tính lượt và policy cho phép hoàn lại phần đã giữ.
- Truyền cùng định danh idempotency và reservation xuyên suốt một lần thực hiện.

### 4.5. Service identity

- Mỗi ứng dụng dùng danh tính máy riêng để gọi Control Plane.
- Credential không dùng chung giữa các ứng dụng, có phạm vi hẹp và có thể xoay vòng hoặc thu hồi độc lập.
- Hub phải xác minh service identity được phép hỏi application, feature hoặc metric tương ứng; không chỉ tin `application_id` trong payload.

## 5. SSO xuyên domain

Cookie của một domain không nên được chia sẻ tùy tiện cho các domain ứng dụng. Luồng SSO dựa trên chuyển hướng và bằng chứng có thời hạn ngắn:

1. User mở ứng dụng từ Hub hoặc nhập URL ứng dụng trực tiếp.
2. Nếu chưa có phiên hợp lệ tại app, app chuyển user tới dịch vụ Identity kèm đích quay lại và dữ liệu chống giả mạo yêu cầu.
3. Identity dùng phiên trung tâm hiện có hoặc yêu cầu đăng nhập.
4. Identity trả về một bằng chứng dùng một lần, thời hạn ngắn cho đúng ứng dụng và đúng đích quay lại.
5. Backend của app xác minh hoặc đổi bằng chứng theo kênh tin cậy, sau đó tạo phiên cục bộ an toàn.
6. Đăng xuất hoặc thu hồi được truyền theo SLA đã định; các phiên cục bộ không được tồn tại vô hạn.

Luồng cụ thể phải chống open redirect, giả mạo yêu cầu đăng nhập, replay và đánh cắp bằng chứng. URL quay lại phải nằm trong allowlist đã đăng ký.

### 5.1. Token nên chứa gì

Token chỉ nên chứa các claim ổn định, tối thiểu và cần cho xác thực, chẳng hạn:

- định danh subject không đổi dùng để liên kết user;
- issuer và audience;
- thời điểm phát hành, hết hạn và định danh token hoặc phiên khi cần;
- mức bảo đảm xác thực hoặc phạm vi kỹ thuật tối thiểu nếu có nhu cầu đã xác nhận.

### 5.2. Token không nên chứa gì

- Tên plan hoặc logic kiểu `is_premium` để app hard-code.
- Số quota còn lại, vì dữ liệu này biến đổi nhanh và dễ bị tiêu đồng thời.
- Toàn bộ entitlement dài hạn nếu việc thay đổi phải có hiệu lực trước khi token hết hạn.
- Dữ liệu cá nhân hoặc dữ liệu nghiệp vụ không cần thiết.
- Secret, credential của service hoặc thông tin thanh toán.

Nếu token mang một phần entitlement để giảm độ trễ, đó chỉ là snapshot ngắn hạn có version và chính sách thu hồi rõ ràng; hard quota vẫn phải được quyết định tại nguồn có khả năng phối hợp đồng thời.

## 6. Mô hình quyền và mức sử dụng

### 6.1. Phân biệt các khái niệm

| Khái niệm | Ý nghĩa | Ví dụ khái niệm, không phải cấu hình thật |
|---|---|---|
| **Plan** | Sản phẩm thương mại được đặt tên và giới thiệu cho người dùng. | Một gói miễn phí hoặc trả phí. |
| **Subscription** | Quan hệ theo thời gian giữa user và một phiên bản plan. | User đang hưởng một plan version đến ngày hiệu lực nhất định. |
| **Entitlement** | Quyền hiệu lực để dùng một feature, được tính từ subscription và policy. | Được phép gọi một nhóm tính năng của app. |
| **Consumable Usage** | Tài nguyên bị tiêu hao khi thực hiện hành động được đo bằng metric. | Một lượt xử lý được reserve rồi commit. |

Entitlement trả lời **có được phép hay không**; quota trả lời **còn được dùng bao nhiêu trong cửa sổ hiện tại**. Một user có entitlement nhưng vẫn có thể bị từ chối do hết quota.

Ứng dụng chỉ hỏi bằng định danh ổn định của feature/metric và nhận quyết định. Ứng dụng **không được hard-code tên plan**, giá, thứ tự gói hoặc suy luận quyền từ tên gói. Việc đổi tên, thêm plan hoặc chuyển user giữa các plan không được yêu cầu deploy lại ứng dụng.

### 6.2. Plan version

Plan là danh tính sản phẩm; PlanVersion là snapshot bất biến của quyền và quota tại một thời điểm. Subscription phải tham chiếu phiên bản có hiệu lực để thay đổi cấu hình tương lai không làm biến đổi ngầm cam kết hiện tại. Cách migrate subscription giữa các phiên bản là quyết định nghiệp vụ riêng, có thời điểm hiệu lực và audit.

## 7. Các luồng chính

### 7.1. Đăng ký

1. User tạo tài khoản tại Identity của Hub.
2. Hub tạo Account tương ứng và thiết lập trạng thái ban đầu theo policy đã được phê duyệt.
3. Nếu có quyền mặc định, Hub tạo hoặc kích hoạt subscription/entitlement tương ứng bằng thao tác idempotent.
4. User có thể xem application catalog và mở các ứng dụng được phép.

Việc gán plan mặc định, xác minh liên hệ và quy tắc chống lạm dụng vẫn là quyết định chi tiết cần chốt; tài liệu không giả định giá hoặc quota.

### 7.2. Mở ứng dụng

1. User chọn app tại Hub hoặc truy cập URL app trực tiếp.
2. App xác minh phiên cục bộ; nếu chưa có thì bắt đầu luồng SSO.
3. Backend app xác thực token và lấy định danh user trung tâm.
4. App kiểm tra entitlement cho feature cần thiết tại thời điểm phù hợp.
5. App chỉ trả dữ liệu hoặc cho phép hành động sau cả entitlement và domain authorization.

### 7.3. Thực hiện hành động có quota

1. Backend app xác thực user, service identity và domain authorization.
2. App tạo idempotency key duy nhất cho lần thực hiện logic.
3. App yêu cầu `reserve` cho user, application, metric và số lượng cần giữ.
4. Hub kiểm tra entitlement, cửa sổ quota, usage đã commit và đang reserve trong một quyết định nguyên tử.
5. Nếu được chấp thuận, app thực hiện nghiệp vụ.
6. Khi đạt mốc tính lượt, app gọi `commit`; nếu không đạt mốc và policy cho phép, app gọi `cancel`.
7. Nếu kết quả commit/cancel không rõ do timeout, app retry với cùng idempotency key; không tạo reservation mới.

### 7.4. Hết quota

- Hub từ chối `reserve` trước khi app thực hiện hành động tốn lượt.
- App không chạy nghiệp vụ được bảo vệ và trả trạng thái có thể hiểu được cho frontend.
- Giao diện có thể hướng dẫn user xem usage hoặc lựa chọn nâng cấp trong tương lai, nhưng không được tự bỏ qua kiểm tra.
- Admin override, nếu có, phải rõ phạm vi, thời hạn và được audit.

### 7.5. Nâng cấp trong tương lai

1. User chọn thay đổi plan tại Hub.
2. Billing Adapter xử lý tương tác với payment provider đã chọn trong tương lai.
3. Chỉ sự kiện đã xác minh và xử lý idempotent mới tạo hoặc cập nhật subscription.
4. Hub tính lại EffectiveEntitlement và quota policy tại thời điểm hiệu lực.
5. App nhận quyền mới qua lần kiểm tra tiếp theo hoặc cơ chế invalidation phù hợp với SLA.

Không cấp quyền chỉ dựa trên trang frontend báo thanh toán thành công.

### 7.6. Hạ cấp, hết hạn, hủy và refund

- **Hạ cấp:** xác định trước thời điểm hiệu lực, cách xử lý feature bị mất và usage vượt hạn mức mới. Không xóa dữ liệu của user một cách ngầm định.
- **Hết hạn:** subscription ngừng tạo entitlement tại thời điểm quy định; phiên và cache phải hội tụ theo revoke SLA.
- **Hủy:** cần phân biệt hủy ngay với hủy cuối kỳ. Trạng thái hiển thị và EffectiveEntitlement phải phản ánh thời điểm hiệu lực thực tế.
- **Refund:** hoàn tiền và thu hồi quyền là hai quyết định liên quan nhưng không đồng nhất. Policy phải nêu refund có chấm dứt quyền, khôi phục usage hay giữ quyền đến cuối kỳ hay không.

Mọi chuyển trạng thái phải idempotent, có nguồn sự kiện, thời điểm hiệu lực và audit. Hành vi chi tiết của các trường hợp này còn cần quyết định nghiệp vụ.

## 8. Quota an toàn khi xử lý đồng thời

### 8.1. Reserve, commit và cancel

- **Reserve:** giữ tạm một lượng quota trước khi chạy hành động. Reservation có định danh, metric, lượng giữ, trạng thái và hạn sử dụng khái niệm.
- **Commit:** chuyển phần đã giữ thành usage đã tiêu khi hành động đạt mốc tính lượt. Commit lặp lại không được tính thêm.
- **Cancel:** giải phóng phần giữ khi hành động không được tính lượt. Cancel lặp lại không làm tăng quota nhiều lần.

Reservation hết hạn cần được giải phóng hoặc đối soát theo policy. Hết hạn không thay thế cho việc app gửi kết quả rõ ràng. Chính sách phải quy định cách xử lý khi nghiệp vụ đã thành công nhưng commit bị trễ.

### 8.2. Idempotency

Mỗi yêu cầu thay đổi usage phải có idempotency key ổn định trong phạm vi service và thao tác logic. Hub lưu kết quả đầu tiên đủ lâu theo retry window và trả lại cùng kết quả cho yêu cầu lặp tương đương. Nếu cùng key nhưng nội dung khác, Hub phải từ chối thay vì đoán ý định.

Idempotency phải áp dụng cho:

- tạo reservation;
- commit hoặc cancel;
- xử lý sự kiện subscription và thanh toán trong tương lai;
- các retry sau timeout hoặc mất kết nối.

### 8.3. Chống concurrent double-spend

Quyết định reserve phải bảo đảm nguyên tử trên cùng chủ thể, metric và cửa sổ quota:

```text
khả dụng = hạn mức - usage đã commit - reservation còn hiệu lực
```

Chỉ chấp thuận nếu `khả dụng` đủ cho lượng yêu cầu, đồng thời ghi nhận reservation trong cùng ranh giới nhất quán. Không triển khai theo mẫu đọc số dư rồi ghi ở hai bước độc lập. Hai yêu cầu đồng thời không được cùng nhìn thấy một lượt cuối cùng là còn trống.

Cơ chế kỹ thuật cụ thể theo stack đã phê duyệt và được chi tiết tại [`database-schema.md`](./database-schema.md); hợp đồng hành vi ở trên là bắt buộc.

## 9. Chống bypass khi truy cập app trực tiếp

Hub là điểm khám phá, không phải hàng rào bảo mật duy nhất. Mọi URL, API và background action được bảo vệ tại app phải thực thi các lớp sau trên backend:

1. xác thực token hoặc phiên;
2. kiểm tra audience và service/application binding;
3. kiểm tra entitlement;
4. kiểm tra domain authorization;
5. reserve quota trước hành động có tính lượt;
6. commit/cancel theo kết quả.

Ẩn nút, khóa route frontend hoặc chỉ kiểm tra khi đi từ Hub không phải kiểm soát bảo mật. API không được tin cờ như `isAllowed`, tên plan hoặc số quota do browser gửi lên. Worker và job bất đồng bộ phải mang ngữ cảnh ủy quyền và reservation hợp lệ, không trở thành đường vòng bỏ qua policy.

## 10. Đánh giá API Gateway

### 10.1. Lợi ích khi có nhu cầu phù hợp

- Chuẩn hóa xác thực service, rate limit kỹ thuật, routing và quan sát traffic tại một điểm.
- Hỗ trợ policy nhất quán cho API công khai hoặc nhiều backend có cùng bề mặt truy cập.
- Đơn giản hóa một số yêu cầu về domain, chứng thư và bảo vệ biên.

### 10.2. Hạn chế và chi phí

- Tạo thêm một hop, độ trễ, chi phí vận hành và điểm lỗi diện rộng.
- Có nguy cơ biến Hub thành nút cổ chai cho traffic và dữ liệu nghiệp vụ vốn độc lập.
- Không tự giải quyết domain authorization, entitlement theo ngữ cảnh hoặc transaction quota trong app.
- Làm tăng coupling giữa lịch deploy/routing của các ứng dụng nếu dùng như cổng bắt buộc.
- Traffic nội bộ, upload lớn, streaming hoặc workload đặc thù có thể không phù hợp một đường đi chung.

### 10.3. Quyết định hiện tại

Không bắt buộc mọi traffic đi qua gateway hoặc Hub. Từng app gọi trực tiếp các capability của Control Plane qua hợp đồng chuẩn và tự enforce tại backend. Có thể bổ sung gateway sau cho một phạm vi cụ thể khi lợi ích được đo lường rõ, nhưng gateway không thay thế middleware enforcement trong app và không trở thành nguồn sự thật về entitlement/quota.

## 11. Cache và chính sách khi phụ thuộc gặp lỗi

### 11.1. Nguyên tắc chung

Cache phải có key bao gồm đủ user, application, feature/metric, policy/version và ngữ cảnh ảnh hưởng quyết định. TTL phải ngắn theo mức rủi ro; thay đổi quan trọng nên có cơ chế invalidation. Cache không được dùng để cộng trừ hard quota cục bộ giữa nhiều app nếu không có cơ chế phối hợp nhất quán.

### 11.2. Fail-open và fail-closed

| Kiểm tra | Chính sách mặc định khi không xác minh được | Lý do |
|---|---|---|
| Authentication | **Fail-closed**: từ chối | Không được cho người chưa xác minh danh tính truy cập. |
| Hard quota/reservation | **Fail-closed**: không chạy hành động tốn lượt | Fail-open có thể làm vượt quota và double-spend. |
| Entitlement rủi ro cao | **Fail-closed** | Hậu quả cấp quyền sai lớn hơn gián đoạn tạm thời. |
| Entitlement rủi ro thấp, chỉ đọc | Có thể dùng **last-known-good** với TTL giới hạn nếu policy cho phép | Cân bằng khả dụng với revoke SLA; phải quan sát và audit. |

`Last-known-good` là quyết định hợp lệ gần nhất được cache, không phải mặc định cho phép. Mỗi feature cần phân loại rủi ro trước khi áp dụng. Khi TTL hết hoặc dữ liệu không đủ tin cậy, hệ thống phải từ chối. Chính sách outage cụ thể là một quyết định còn mở.

## 12. Mô hình dữ liệu khái niệm

Phần này mô tả thực thể và quan hệ logic, không quy định bảng, collection, physical schema hoặc kiểu dữ liệu.

| Thực thể | Trách nhiệm khái niệm |
|---|---|
| **User** | Danh tính trung tâm của một cá nhân; chủ thể của subscription và quota trong MVP. |
| **Application** | Một app được đăng ký, có danh tính và ranh giới tích hợp riêng. |
| **Feature** | Khả năng có thể cấp hoặc thu hồi quyền trong một Application. |
| **UsageMetric** | Định nghĩa thứ được đếm, đơn vị logic và quy tắc ghi nhận usage của một hành động. |
| **Plan** | Danh tính sản phẩm thương mại, độc lập với cấu hình từng phiên bản. |
| **PlanVersion** | Snapshot bất biến của cấu hình plan có thời điểm hiệu lực. |
| **PlanEntitlement** | Quyền và policy mà một PlanVersion cấp cho Feature hoặc UsageMetric. |
| **Subscription** | Quan hệ có vòng đời giữa User và PlanVersion. |
| **EffectiveEntitlement** | Kết quả quyền đã tính cho User, Application và Feature tại một thời điểm/ngữ cảnh. Có thể là dữ liệu dẫn xuất thay vì bản ghi vật lý. |
| **QuotaPolicy** | Hạn mức, cửa sổ reset và hành vi áp dụng cho một UsageMetric. |
| **UsageReservation** | Phần quota đang được giữ cho một hành động, cùng trạng thái reserve/commit/cancel/hết hạn ở mức khái niệm. |
| **UsageEvent** | Sự kiện bất biến mô tả thay đổi usage để audit và đối soát. |
| **UsageAggregate** | Tổng hợp usage theo User, metric và cửa sổ nhằm phục vụ quyết định hiệu quả. |
| **ServiceIdentity** | Danh tính máy của app hoặc service, với phạm vi và vòng đời credential riêng. |
| **IdempotencyRecord** | Liên kết idempotency key, fingerprint yêu cầu và kết quả đã chốt để retry an toàn. |
| **AuditEvent** | Dấu vết bất biến của thao tác bảo mật, quản trị và thay đổi chính sách quan trọng. |

### 12.1. Quan hệ chính

- Application có nhiều Feature và UsageMetric.
- Plan có nhiều PlanVersion; PlanVersion có nhiều PlanEntitlement.
- User có Subscription tham chiếu PlanVersion theo thời gian.
- EffectiveEntitlement được tính từ Subscription, PlanEntitlement, trạng thái và override có kiểm soát.
- QuotaPolicy áp dụng cho UsageMetric trong phạm vi entitlement phù hợp.
- UsageReservation và UsageEvent thuộc User, Application, UsageMetric và cửa sổ tính quota.
- UsageAggregate là dữ liệu dẫn xuất từ các sự kiện/quyết toán, nhưng phải nhất quán với reservation đang hiệu lực khi quyết định hard quota.
- ServiceIdentity được giới hạn vào các Application và capability mà nó được phép gọi.

## 13. Hợp đồng logic giữa app và Control Plane

Các hợp đồng dưới đây mô tả ý nghĩa request/decision, không khóa kiến trúc vào REST, RPC, message bus hay định dạng serialization cụ thể.

### 13.1. Entitlement decision

**Ý định:** hỏi liệu một subject có được dùng một feature của application hay không.

Thông tin đầu vào khái niệm:

- subject/user đã xác thực;
- application và feature ổn định;
- service identity của bên gọi;
- ngữ cảnh cần thiết cho policy, không gửi dữ liệu thừa;
- định danh correlation để truy vết.

Kết quả khái niệm:

- `allow` hoặc `deny`;
- mã lý do máy có thể xử lý, không phụ thuộc câu chữ giao diện;
- policy/version và thời điểm quyết định;
- thời hạn cache hoặc yêu cầu không cache;
- dữ liệu nghĩa vụ tối thiểu mà app phải thực thi, nếu có.

Control Plane phải từ chối khi service không có quyền hỏi cho application/feature đó. App phải coi quyết định là ràng buộc nhưng vẫn thực hiện domain authorization riêng.

### 13.2. Usage reservation

**Ý định:** giữ quota trước khi thực hiện một hành động có tính lượt.

Thông tin đầu vào khái niệm:

- subject/user, application và usage metric;
- lượng cần reserve;
- service identity;
- idempotency key và fingerprint của thao tác logic;
- correlation với hành động nghiệp vụ;
- ngữ cảnh policy tối thiểu nếu metric yêu cầu.

Kết quả khi chấp thuận:

- định danh reservation;
- lượng đã giữ và trạng thái;
- cửa sổ quota áp dụng và thời điểm reservation hết hiệu lực;
- thông tin usage còn lại chỉ để hiển thị/tham khảo, không phải quyền cho lần gọi sau.

Kết quả khi từ chối:

- mã lý do như không có entitlement, hết quota, yêu cầu không hợp lệ hoặc service không được phép;
- thời điểm có thể thử lại nếu policy xác định được, nhưng không bịa thời gian reset.

Các thao tác tiếp theo:

- `commit(reservation, idempotency, lượng/kết quả phù hợp)`;
- `cancel(reservation, idempotency, lý do)`;
- truy vấn trạng thái để phục hồi sau kết quả không rõ.

Hợp đồng phải bảo đảm retry cùng ý định trả cùng kết quả, transition trạng thái hợp lệ và không commit vượt phần đã reserve trừ khi có một policy mở rộng được phê duyệt rõ ràng.

## 14. Nguyên tắc bảo mật

1. **Xác minh ở mọi ranh giới tin cậy:** app xác minh user token; Hub xác minh service identity; không tin claim do client tự khai.
2. **Đặc quyền tối thiểu:** mỗi app chỉ được hỏi hoặc thay đổi dữ liệu thuộc application/metric đã cấp.
3. **Credential riêng và có vòng đời:** không chia sẻ secret giữa app; hỗ trợ rotation, revoke và theo dõi sử dụng.
4. **Token ngắn hạn, audience cụ thể:** giảm phạm vi ảnh hưởng nếu token bị lộ.
5. **Bảo vệ redirect và phiên:** allowlist đích quay lại, chống request forgery/replay, cookie phiên an toàn và không đưa token nhạy cảm vào URL lâu dài hoặc log.
6. **Server-side enforcement:** entitlement, quota và domain authorization được kiểm tra tại backend/API hoặc worker đáng tin cậy.
7. **Nguyên tử và idempotent:** mọi thay đổi usage/subscription chịu retry và concurrency mà không cấp hoặc trừ hai lần.
8. **Audit có kiểm soát truy cập:** ghi đủ để điều tra nhưng không lưu secret hoặc dữ liệu cá nhân không cần thiết.
9. **Giảm thiểu dữ liệu:** chỉ trao đổi claim và ngữ cảnh cần thiết; xác định retention trước khi thu thập usage chi tiết.
10. **Phòng thủ nhiều lớp:** rate limit chống lạm dụng kỹ thuật không thay thế quota thương mại, và ngược lại.

### 14.1. Anti-pattern không được vi phạm

- Hard-code tên plan, giá hoặc cờ `premium` trong app.
- Chỉ ẩn chức năng ở frontend mà không chặn backend.
- Tin số quota hoặc entitlement do browser gửi lên.
- Nhúng quota còn lại dài hạn trong token rồi dùng làm nguồn sự thật.
- Đọc số dư và trừ quota ở hai bước không nguyên tử.
- Tạo reservation mới mỗi lần retry sau timeout.
- Dùng chung service credential cho nhiều app hoặc lưu secret trong source code.
- Cho phép mặc định khi authentication hoặc hard-quota service không phản hồi.
- Buộc mọi traffic nghiệp vụ đi qua Hub mà không có nhu cầu và đánh giá vận hành rõ ràng.
- Để gateway thay thế domain authorization trong app.
- Cấp quyền trực tiếp từ callback phía client hoặc webhook chưa xác minh.
- Sửa/xóa lịch sử usage để điều chỉnh số dư mà không có adjustment event và audit.
- Thu thập usage, log hoặc dữ liệu cá nhân vô thời hạn mà chưa có retention policy.

## 15. Lộ trình triển khai

### Phase 0 — Quyết định và inventory

- Lập inventory cho từng app, feature, hành động tính lượt và luồng truy cập trực tiếp.
- Chốt semantics của metric, mốc tính lượt, reset window/timezone và lỗi có tính lượt hay không.
- Xác định revoke SLA, outage policy, privacy/retention và hành vi downgrade.
- Chốt hợp đồng logic, threat model, tiêu chí quan sát và kế hoạch migration.
- Không âm thầm thay đổi stack đã phê duyệt chỉ để bắt đầu nhanh; mọi thay đổi kỹ thuật cần quyết định riêng.

**Điều kiện hoàn tất:** inventory đủ cho app mẫu và không còn mơ hồ về một lượt được tính khi nào.

### Phase 1 — SSO với một app mẫu

- Xây dựng đăng ký/đăng nhập trung tâm và luồng cross-domain cho một app đại diện.
- Xác minh token, service identity, redirect và phiên cục bộ.
- Kiểm thử truy cập từ Hub, URL trực tiếp, logout/revoke và các trường hợp token lỗi.

**Điều kiện hoàn tất:** app mẫu không có đường backend được bảo vệ nào bỏ qua xác thực.

### Phase 2 — Entitlement

- Đăng ký Application, Feature, Plan/PlanVersion và Subscription ở mức cần thiết.
- Triển khai entitlement decision và middleware enforcement trong app mẫu.
- Loại bỏ mọi suy luận quyền từ tên plan; bổ sung audit và quan sát quyết định.

**Điều kiện hoàn tất:** thay đổi entitlement có hiệu lực theo SLA mà không deploy lại app.

### Phase 3 — Hard quota

- Định nghĩa UsageMetric và QuotaPolicy đã được inventory xác nhận.
- Triển khai reserve/commit/cancel, idempotency, expiration và đối soát.
- Kiểm thử concurrency, retry, timeout, duplicate và đường thất bại nghiệp vụ.

**Điều kiện hoàn tất:** không double-spend khi có yêu cầu đồng thời và hệ thống fail-closed khi không thể reserve.

### Phase 4 — Onboard các ứng dụng còn lại

- Chuẩn hóa middleware/adapter và checklist tích hợp.
- Onboard từng app dựa trên inventory, bắt đầu từ app ít rủi ro.
- Xác nhận domain authorization, metric, quan sát, runbook và rollback riêng cho mỗi app.

**Điều kiện hoàn tất:** mỗi app qua kiểm tra bypass, quota và revoke trước khi bật cho user.

### Phase 5 — Paid subscription và hardening

- Chọn payment provider sau một quyết định riêng và triển khai Billing Adapter.
- Xử lý webhook idempotent, nâng/hạ cấp, hết hạn, hủy, refund và đối soát.
- Tăng cường bảo mật, khả dụng, disaster recovery, rotation, audit, cảnh báo và capacity planning.
- Đánh giá lại nhu cầu gateway dựa trên số liệu vận hành thực tế.

**Điều kiện hoàn tất:** quyền trả phí chỉ thay đổi từ sự kiện đã xác minh, có thể đối soát và phục hồi.

## 16. Inventory cần điền cho từng ứng dụng

Không điền số giả định. Mỗi dòng cần được chủ sản phẩm và chủ ứng dụng xác nhận trước khi triển khai quota.

| App | Hành động tính lượt | Thời điểm tính | Free quota | Chu kỳ reset | Thất bại có tính lượt không? |
|---|---|---|---|---|---|
| _Chưa xác định_ | _Chưa xác định_ | _Bắt đầu / đạt mốc / thành công — cần chốt_ | _Chưa xác định_ | _Chưa xác định_ | _Có / không / theo loại lỗi — cần chốt_ |
| _Chưa xác định_ | _Chưa xác định_ | _Chưa xác định_ | _Chưa xác định_ | _Chưa xác định_ | _Chưa xác định_ |
| _Chưa xác định_ | _Chưa xác định_ | _Chưa xác định_ | _Chưa xác định_ | _Chưa xác định_ | _Chưa xác định_ |

Ngoài bảng tối thiểu, mỗi app nên ghi thêm feature liên quan, định danh metric ổn định, lượng reserve cho một hành động, tác vụ bất đồng bộ, điểm commit/cancel, dữ liệu cần audit, mức rủi ro và chủ sở hữu vận hành.

## 17. Rủi ro chính

| Rủi ro | Hậu quả | Hướng kiểm soát |
|---|---|---|
| Metric hoặc mốc tính lượt mơ hồ | Khiếu nại, đếm thiếu/thừa và app triển khai khác nhau | Inventory và test ví dụ nghiệp vụ trước khi code. |
| Race condition khi trừ quota | Vượt hard limit | Reserve nguyên tử, tính cả reservation đang hiệu lực và kiểm thử concurrency. |
| Retry không idempotent | Trừ quota hoặc thay đổi subscription nhiều lần | Idempotency key, fingerprint và state transition rõ ràng. |
| Control Plane outage | App gián đoạn hoặc cấp quyền sai | Policy fail-closed, cache theo rủi ro, quan sát và runbook. |
| Thu hồi quyền chậm | User tiếp tục truy cập sau hủy/khóa | Token ngắn hạn, invalidation và revoke SLA đo được. |
| App có đường bypass | Truy cập hoặc sử dụng miễn phí trái phép | Enforcement backend, kiểm kê route/worker và kiểm thử URL trực tiếp. |
| Credential service bị lộ | Giả mạo app và thao tác usage | Phạm vi hẹp, rotation, revoke, lưu trữ an toàn và audit. |
| Coupling vào tên plan/provider | Khó thay đổi sản phẩm hoặc thanh toán | Hợp đồng feature/metric ổn định và Billing Adapter. |
| Usage event chứa quá nhiều dữ liệu | Rủi ro privacy và retention | Giảm thiểu dữ liệu, phân quyền, mã hóa và policy lưu giữ. |
| Reservation treo hoặc commit không rõ | Giữ quota sai hoặc đối soát lệch | Expiry, truy vấn trạng thái, retry cùng key và quy trình reconciliation. |

## 18. Các quyết định còn mở

Các mục sau phải được chốt trước giai đoạn liên quan; tài liệu không tự chọn mặc định:

1. **Reset window và timezone:** cửa sổ theo lịch hay rolling, mốc thời gian và cách xử lý thay đổi múi giờ.
2. **Thời điểm tính usage:** khi bắt đầu, khi đạt một mốc không thể đảo ngược hay chỉ khi thành công.
3. **Metric của từng app:** hành động nào tiêu lượt, đơn vị và trường hợp một hành động tiêu nhiều hơn một lượt.
4. **Xử lý thất bại:** lỗi do user, lỗi app, timeout hoặc lỗi phụ thuộc có commit usage hay cancel.
5. **Revoke SLA:** thời gian tối đa để khóa tài khoản, hủy hoặc hạ cấp có hiệu lực trên mọi app.
6. **Outage policy:** feature nào được dùng last-known-good, TTL bao lâu và trải nghiệm khi fail-closed.
7. **Privacy và retention:** dữ liệu usage/audit nào được lưu, mục đích, thời hạn, quyền truy cập và xóa/ẩn danh.
8. **Downgrade behavior:** hiệu lực ngay hay cuối kỳ, xử lý usage vượt quota mới và dữ liệu của feature bị mất quyền.
9. **Reservation timeout/reconciliation:** thời hạn giữ, cách xử lý công việc dài và nguồn xác nhận kết quả cuối.
10. **Mô hình entitlement ban đầu:** quyền mặc định khi đăng ký và cách version/migrate subscription.
11. **Trải nghiệm logout/revoke:** phạm vi đăng xuất toàn hệ thống, session lifetime và cơ chế invalidation.

## 19. Giới hạn của tài liệu

Tài liệu này không phải nguồn quyết định tech stack hoặc physical schema. Các quyết định đã phê duyệt nằm tại [`stack-tech.md`](./stack-tech.md), đặc tả module tại [`modular.md`](./modular.md), và thiết kế PostgreSQL tại [`database-schema.md`](./database-schema.md). Payment provider cùng các quyết định nghiệp vụ còn mở vẫn cần được phê duyệt riêng.

Tài liệu mô tả **kiến trúc đề xuất**, không tuyên bố Identity/SSO, entitlement, quota, subscription, billing adapter, gateway, middleware, API, datastore hay bất kỳ implementation nào đã tồn tại hoặc đang chạy. Mọi trạng thái triển khai phải được xác minh từ source code, cấu hình và môi trường thực tế ở các giai đoạn sau.
