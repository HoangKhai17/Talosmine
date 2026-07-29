-- Logo tải LÊN thay vì dán URL (yêu cầu chủ dự án 2026-07-29).
--
-- VÌ SAO LƯU TRONG POSTGRESQL dù DEC-T12 chốt ảnh nằm trên object storage: storage CHƯA
-- được dựng, và đây là MỘT file nhỏ (trần 512KB, CHECK bên dưới) đọc qua cache 60 giây —
-- không phải thư viện media. Bytea cho một tài sản thương hiệu duy nhất là cái giá nhỏ hơn
-- nhiều so với dựng cả một hệ storage; khi storage ra đời (ảnh catalog sẽ cần thật), logo
-- di cư sang bằng một migration.
--
-- BẢNG RIÊNG chứ không nhét bytea vào `site_settings`: bảng đó là key–value CHỮ, mọi chỗ
-- đọc đều SELECT cả hàng — một cột bytea nửa MB sẽ đi lạc vào những truy vấn chỉ cần URL.
--
-- `site_settings.logo.url` GIỮ NGUYÊN làm đường thay thế (ảnh host ngoài): thứ tự ưu tiên
-- khi phục vụ là ảnh tải lên trước, URL sau — xử lý ở application.

--> statement-breakpoint
CREATE TABLE control_plane.site_assets (
  -- id do APPLICATION sinh (UUIDv7 — DEC-T06).
  id uuid PRIMARY KEY,

  key text NOT NULL,

  -- Danh mục MIME ĐÓNG. KHÔNG có SVG dù nó là định dạng logo phổ biến: SVG là XML chạy
  -- được (script, ngoại tuyến tới URL ngoài); phục vụ SVG do người dùng tải lên từ origin
  -- của chính mình là mở một đường XSS mà không CSP nào của trang nhúng cứu được hết.
  mime text NOT NULL,

  data bytea NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT site_assets_key_check CHECK (key IN ('logo.image')),

  CONSTRAINT site_assets_mime_check CHECK (mime IN ('image/png', 'image/jpeg', 'image/webp')),

  -- 512KB — trần thật ở TẦNG DATABASE, không chỉ ở application: một logo hợp lý nặng vài
  -- chục KB; nửa MB đã là rất rộng, còn một file vài MB trong bảng này là dấu hiệu có gì
  -- đó dùng sai chỗ.
  CONSTRAINT site_assets_size_check CHECK (octet_length(data) <= 524288)
);

--> statement-breakpoint
CREATE UNIQUE INDEX site_assets_key_key ON control_plane.site_assets (key);

--> statement-breakpoint
-- QUYỀN CHO ROLE RUNTIME: default privileges chỉ cho SELECT + INSERT (bug 0010 đã dạy).
-- Cần UPDATE (thay logo = upsert) và DELETE (gỡ logo là thao tác biên tập bình thường).
GRANT UPDATE, DELETE ON control_plane.site_assets TO talosmine_runtime;
