-- P3 migration — Catalog: applications, redirect URI, features, usage metrics.
--
-- Khớp database-schema.md mục 5. Thứ tự bảng theo phụ thuộc FK:
--   applications → application_redirect_uris
--                → features → usage_metrics
--
-- NGUYÊN TẮC XUYÊN FILE: DB kiểm những gì DB kiểm được (danh mục đóng, non-empty,
-- quan hệ). Cú pháp URL, scheme HTTPS, host allowlist và chống SSRF kiểm ở APPLICATION
-- LAYER (modular.md mục 5.4) — vì chúng cần DNS resolution và danh sách cấu hình, hai thứ
-- CHECK constraint không làm được.

--> statement-breakpoint
CREATE TABLE control_plane.applications (
  -- id do APPLICATION sinh (UUIDv7 — DEC-T06), không có DB default.
  id uuid PRIMARY KEY,

  -- `key` là machine key ỔN ĐỊNH: code và policy request tham chiếu nó, không tham chiếu
  -- display_name. Bất biến sau khi được tham chiếu, và KHÔNG tái sử dụng — một key đã dùng
  -- rồi mà cấp lại cho app khác sẽ làm mọi dữ liệu lịch sử trỏ sai đối tượng.
  key text NOT NULL,

  display_name text NOT NULL,
  description text,

  -- Chỉ lưu URL, KHÔNG lưu binary/base64. Ảnh nằm trên object storage (DEC-T12).
  image_url text,

  launch_url text NOT NULL,

  status text NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Danh mục ĐÓNG. Thêm trạng thái = migration mới, không phải việc code tự làm được.
  CONSTRAINT applications_status_check
    CHECK (status IN ('draft', 'active', 'inactive')),

  CONSTRAINT applications_key_check CHECK (length(btrim(key)) > 0),
  CONSTRAINT applications_display_name_check CHECK (length(btrim(display_name)) > 0),
  CONSTRAINT applications_launch_url_check CHECK (length(btrim(launch_url)) > 0),

  -- image_url: NULL là hợp lệ (app chưa có ảnh), nhưng chuỗi rỗng thì không — nếu không
  -- database sẽ có hai cách biểu diễn cho "không có ảnh".
  CONSTRAINT applications_image_url_check
    CHECK (image_url IS NULL OR length(btrim(image_url)) > 0)
);

--> statement-breakpoint
CREATE UNIQUE INDEX applications_key_key ON control_plane.applications (key);

--> statement-breakpoint
CREATE INDEX applications_status_idx ON control_plane.applications (status);

--> statement-breakpoint
-- Allowlist redirect. KHÔNG hỗ trợ wildcard: một wildcard trong allowlist redirect là lỗ
-- hổng chiếm tài khoản kinh điển — kẻ tấn công đăng ký subdomain khớp mẫu rồi nhận
-- authorization code của nạn nhân.
CREATE TABLE control_plane.application_redirect_uris (
  id uuid PRIMARY KEY,

  application_id uuid NOT NULL
    REFERENCES control_plane.applications (id) ON DELETE RESTRICT,

  purpose text NOT NULL,

  -- URI đã canonicalize, so khớp CHÍNH XÁC từng ký tự.
  uri text NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT application_redirect_uris_purpose_check
    CHECK (purpose IN ('login', 'logout')),

  CONSTRAINT application_redirect_uris_uri_check CHECK (length(btrim(uri)) > 0)
);

--> statement-breakpoint
-- Unique bắt đầu bằng application_id: vừa chặn trùng, vừa phục vụ tra cứu theo app.
-- Không tạo thêm index riêng cho application_id (sẽ trùng lặp).
CREATE UNIQUE INDEX application_redirect_uris_exact_key
  ON control_plane.application_redirect_uris (application_id, purpose, uri);

--> statement-breakpoint
CREATE TABLE control_plane.features (
  id uuid PRIMARY KEY,

  application_id uuid NOT NULL
    REFERENCES control_plane.applications (id) ON DELETE RESTRICT,

  -- Ổn định TRONG PHẠM VI app. Hai app khác nhau được phép có cùng feature key.
  key text NOT NULL,

  display_name text NOT NULL,
  description text,
  status text NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT features_status_check CHECK (status IN ('draft', 'active', 'inactive')),
  CONSTRAINT features_key_check CHECK (length(btrim(key)) > 0),
  CONSTRAINT features_display_name_check CHECK (length(btrim(display_name)) > 0)
);

--> statement-breakpoint
CREATE UNIQUE INDEX features_application_key_key
  ON control_plane.features (application_id, key);

--> statement-breakpoint
-- Unique "thừa" về mặt logic (id đã là PK) nhưng BẮT BUỘC về mặt kỹ thuật: PostgreSQL chỉ
-- cho composite FK trỏ tới một unique constraint. Đây là đích của
-- `usage_metrics_feature_application_fk` — cơ chế bảo đảm metric và feature cùng một app.
CREATE UNIQUE INDEX features_id_application_key
  ON control_plane.features (id, application_id);

--> statement-breakpoint
CREATE INDEX features_application_status_idx
  ON control_plane.features (application_id, status);

--> statement-breakpoint
CREATE TABLE control_plane.usage_metrics (
  id uuid PRIMARY KEY,

  application_id uuid NOT NULL
    REFERENCES control_plane.applications (id) ON DELETE RESTRICT,

  feature_id uuid NOT NULL,

  key text NOT NULL,
  display_name text NOT NULL,

  -- `unit` là NOT NULL và giá trị cụ thể CẦN CHỦ DỰ ÁN DUYỆT (DEC-B05). Không tạo row
  -- usage_metrics nào trước khi có quyết định đó — cột này không cho phép để trống rồi
  -- điền sau.
  unit text NOT NULL,

  -- Hai cột dưới CỐ Ý nullable: chúng thuộc quyết định của P5. Metric thiếu chúng vẫn tồn
  -- tại được ở trạng thái draft, nhưng KHÔNG được dùng cho quota.
  counting_point text,
  failure_treatment text,

  status text NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT usage_metrics_counting_point_check
    CHECK (counting_point IS NULL OR counting_point IN ('start', 'milestone', 'success')),

  CONSTRAINT usage_metrics_failure_treatment_check
    CHECK (failure_treatment IS NULL
           OR failure_treatment IN ('commit', 'cancel', 'policy_defined')),

  CONSTRAINT usage_metrics_status_check CHECK (status IN ('draft', 'active', 'inactive')),
  CONSTRAINT usage_metrics_key_check CHECK (length(btrim(key)) > 0),
  CONSTRAINT usage_metrics_display_name_check CHECK (length(btrim(display_name)) > 0),
  CONSTRAINT usage_metrics_unit_check CHECK (length(btrim(unit)) > 0),

  -- COMPOSITE FK: metric phải trỏ tới feature THUỘC CÙNG application.
  --
  -- Nếu chỉ FK đơn `feature_id -> features(id)`, database sẽ chấp nhận một metric của app A
  -- trỏ tới feature của app B. Lúc tính quota, hệ thống sẽ đếm lượt dùng của app này vào
  -- hạn mức của app kia — sai lệch tiền bạc mà không lỗi ở đâu cả.
  CONSTRAINT usage_metrics_feature_application_fk
    FOREIGN KEY (feature_id, application_id)
    REFERENCES control_plane.features (id, application_id) ON DELETE RESTRICT
);

--> statement-breakpoint
CREATE UNIQUE INDEX usage_metrics_application_key_key
  ON control_plane.usage_metrics (application_id, key);

--> statement-breakpoint
-- Hai unique dưới là đích cho composite FK của các phase sau (plan grants, quota policy).
CREATE UNIQUE INDEX usage_metrics_id_application_key
  ON control_plane.usage_metrics (id, application_id);

--> statement-breakpoint
CREATE UNIQUE INDEX usage_metrics_id_feature_application_key
  ON control_plane.usage_metrics (id, feature_id, application_id);

--> statement-breakpoint
CREATE INDEX usage_metrics_feature_idx ON control_plane.usage_metrics (feature_id);

--> statement-breakpoint
CREATE INDEX usage_metrics_application_status_idx
  ON control_plane.usage_metrics (application_id, status);
