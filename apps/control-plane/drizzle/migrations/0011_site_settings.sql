-- Migration Site Content — cài đặt chung của site (hiện tại: logo).
--
-- VẤN ĐỀ ĐANG GIẢI: logo đang là chữ "Talosmine" viết cứng trong JSX. Đổi logo phải sửa code
-- và deploy. Bảng này đưa nó ra khỏi code, cùng lý do và cùng khuôn với `nav_items` (0010).
--
-- CHỈ LƯU URL, KHÔNG LƯU BINARY (DEC-T12) — giống `applications.image_url`. Object storage
-- CHƯA được dựng ở thời điểm migration này, nên trước mắt quản trị viên dán URL của ảnh đã
-- host sẵn. Khi có storage thì thêm nút upload ghi vào ĐÚNG cột này; schema không phải đổi.
--
-- VÌ SAO LÀ BẢNG KEY–VALUE chứ không phải mỗi cài đặt một cột: các cài đặt kiểu này xuất hiện
-- lẻ tẻ theo thời gian (favicon, ảnh OG, mã theo dõi…) và mỗi lần thêm một cột là một
-- migration đổi cấu trúc bảng. Danh mục khoá vẫn ĐÓNG bằng CHECK, nên nó không trượt thành
-- một cái sọt chứa mọi thứ.

--> statement-breakpoint
CREATE TABLE control_plane.site_settings (
  -- id do APPLICATION sinh (UUIDv7 — DEC-T06) ở đường ghi; hàng seed dưới đây dùng
  -- `gen_random_uuid()` vì migration không chạy qua application layer.
  id uuid PRIMARY KEY,

  key text NOT NULL,

  -- NULL = chưa đặt. Đó là trạng thái hợp lệ và là giá trị khởi đầu: web rơi về logo chữ.
  value text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Danh mục ĐÓNG. Thêm một cài đặt = migration mới, không phải việc code tự làm được.
  CONSTRAINT site_settings_key_check CHECK (key IN ('logo.url')),

  -- Chuỗi rỗng bị cấm: nếu không, database có HAI cách biểu diễn "chưa đặt" và mọi chỗ đọc
  -- đều phải kiểm cả hai.
  CONSTRAINT site_settings_value_check CHECK (value IS NULL OR length(btrim(value)) > 0)
);

--> statement-breakpoint
CREATE UNIQUE INDEX site_settings_key_key ON control_plane.site_settings (key);

--> statement-breakpoint
-- Seed hàng trống. Có sẵn hàng thì đường ghi chỉ cần UPDATE — không phải upsert, và không
-- cần cấp INSERT cho runtime.
INSERT INTO control_plane.site_settings (id, key, value)
VALUES (gen_random_uuid(), 'logo.url', NULL);

--> statement-breakpoint
-- QUYỀN CHO ROLE RUNTIME.
--
-- `ALTER DEFAULT PRIVILEGES` (migration 0000) chỉ cho SELECT + INSERT. Thiếu dòng này thì
-- lưu logo chạy được ở test (testcontainers nối bằng superuser) nhưng chết ở dev và
-- production với `permission denied` — đúng bug đã xảy ra với migration 0010.
--
-- CHỈ UPDATE: hàng đã được seed ở trên và không bao giờ bị xoá. Không cấp DELETE nghĩa là
-- một lỗi lập trình cũng không thể làm mất hàng cài đặt.
GRANT UPDATE ON control_plane.site_settings TO talosmine_runtime;
