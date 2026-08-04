-- Ứng dụng kiểu `hosted` — DEC-B17 và DEC-T27 (chủ dự án duyệt 2026-07-31).
--
-- Tới migration 0016, `applications` chỉ biết MỘT loại ứng dụng: app chạy ở hạ tầng riêng,
-- Hub mở ra qua `launch_url`. DEC-B17 thêm loại thứ hai — giao diện nằm trong Talosmine,
-- backend Talosmine gọi API nhà cung cấp thứ ba rồi trả kết quả.
--
-- VÌ SAO PHÂN LOẠI Ở TẦNG DỮ LIỆU chứ không suy ra từ việc có/không có binding: một cột
-- `kind` tường minh cho phép database TỰ kiểm tính nhất quán (xem CHECK về launch_url bên
-- dưới). Suy ra từ sự tồn tại của một hàng ở bảng khác thì database không kiểm hộ được, và
-- mọi phép kiểm rơi hết về phía code — đúng chỗ dễ quên nhất.
--
-- KHÔNG có cột nào chứa secret ở đây, cùng nguyên tắc `service_identities` (migration 0008).
-- Khoá API của nhà cung cấp lượt này đọc từ biến môi trường; bảng credential mã hoá là việc
-- riêng, đã ghi ở DEC-T27.

--> statement-breakpoint
-- DEFAULT 'external_link' để mọi hàng đã có vẫn hợp lệ mà không cần backfill: tới thời điểm
-- migration này chạy, MỌI app đang tồn tại đều là loại cũ theo đúng định nghĩa.
ALTER TABLE control_plane.applications
  ADD COLUMN kind text NOT NULL DEFAULT 'external_link';

--> statement-breakpoint
-- Danh mục ĐÓNG, cùng tinh thần `applications_status_check`. Thêm loại mới = migration mới.
ALTER TABLE control_plane.applications
  ADD CONSTRAINT applications_kind_check
    CHECK (kind IN ('external_link', 'hosted'));

--> statement-breakpoint
-- App `hosted` KHÔNG có URL ra ngoài để mà lưu. Nới `launch_url` thành nullable.
--
-- Đây là ràng buộc ĐÃ TỒN TẠI duy nhất mà DEC-B17 buộc phải sửa; mọi thứ còn lại của
-- migration này là cộng thêm.
ALTER TABLE control_plane.applications
  ALTER COLUMN launch_url DROP NOT NULL;

--> statement-breakpoint
-- CHECK cũ giả định `launch_url` không bao giờ NULL nên `length(btrim(NULL)) > 0` trả NULL,
-- và CHECK coi NULL là ĐẠT — tức là sau khi nới NOT NULL ở trên, ràng buộc cũ vẫn "đúng"
-- nhưng vì lý do sai. Viết lại tường minh để ý định đọc được: NULL hợp lệ, chuỗi rỗng không.
ALTER TABLE control_plane.applications
  DROP CONSTRAINT applications_launch_url_check;

--> statement-breakpoint
ALTER TABLE control_plane.applications
  ADD CONSTRAINT applications_launch_url_check
    CHECK (launch_url IS NULL OR length(btrim(launch_url)) > 0);

--> statement-breakpoint
-- Ràng buộc THẬT SỰ giữ tính đúng đắn: app `external_link` BẮT BUỘC có launch_url.
-- Nới NOT NULL mà không có dòng này là mở đường cho một app external không mở được từ đâu cả.
ALTER TABLE control_plane.applications
  ADD CONSTRAINT applications_launch_url_required_for_external_check
    CHECK (kind <> 'external_link' OR launch_url IS NOT NULL);

--> statement-breakpoint
-- Cấu hình nhà cung cấp cho app `hosted`. Quan hệ 1–1: `application_id` vừa là khoá chính
-- vừa là khoá ngoại, nên database tự bảo đảm một app không thể có hai binding mâu thuẫn.
CREATE TABLE control_plane.application_hosted_bindings (
  application_id uuid PRIMARY KEY
    REFERENCES control_plane.applications (id) ON DELETE RESTRICT,

  -- Danh mục ĐÓNG. Thêm nhà cung cấp là một migration, KHÔNG phải một dòng cấu hình —
  -- khớp câu 1 còn `open` của DEC-B17 ("nhà cung cấp nào được duyệt"): việc mở rộng danh
  -- sách này phải đi qua chủ dự án, không để agent hay biến môi trường tự thêm.
  provider text NOT NULL,

  -- Đi qua url-policy trước khi tới đây: https, không userinfo, host nằm trong
  -- CATALOG_ALLOWED_HOSTS. Database KHÔNG kiểm được những điều đó (cần DNS và một danh
  -- sách cấu hình) nên chỉ kiểm phần nó kiểm được — xem docs/url-policy.md.
  endpoint_url text NOT NULL,

  -- Nullable: có nhà cung cấp mã hoá model ngay trong đường dẫn endpoint, lúc đó cột này
  -- thừa. Chuỗi rỗng thì không hợp lệ — tránh hai cách biểu diễn cho "không có model".
  model text,

  -- Trần thời gian chờ một lượt gọi. Có giá trị mặc định vì bỏ trống là để ngỏ khả năng
  -- một request treo vô hạn giữ kết nối database.
  timeout_ms integer NOT NULL DEFAULT 60000,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT application_hosted_bindings_provider_check
    CHECK (provider IN ('huggingface')),

  CONSTRAINT application_hosted_bindings_endpoint_url_check
    CHECK (length(btrim(endpoint_url)) > 0),

  CONSTRAINT application_hosted_bindings_model_check
    CHECK (model IS NULL OR length(btrim(model)) > 0),

  -- Trần trên 300s: dài hơn thế thì đó là tác vụ cần hàng đợi, không phải một request HTTP.
  CONSTRAINT application_hosted_bindings_timeout_check
    CHECK (timeout_ms BETWEEN 1000 AND 300000)
);

--> statement-breakpoint
-- `SELECT, INSERT` đã có sẵn qua ALTER DEFAULT PRIVILEGES ở migration 0000. Chỉ cấp thêm
-- hai quyền mà quản trị viên thật sự cần: sửa cấu hình và gỡ binding khi đổi app về
-- external_link. Cấp thừa quyền cho runtime role là đi ngược mục 8 của phase-1.
GRANT UPDATE, DELETE ON control_plane.application_hosted_bindings TO talosmine_runtime;
