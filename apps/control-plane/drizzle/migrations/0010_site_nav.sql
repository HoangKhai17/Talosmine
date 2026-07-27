-- Migration Site Content — điều hướng (header + footer) quản trị được từ `/admin`.
--
-- VẤN ĐỀ ĐANG GIẢI: nhãn menu và cột footer đang hardcode trong JSX. Đổi một mục menu phải
-- sửa code và deploy. Bảng dưới đây đưa phần NỘI DUNG ra khỏi code; phần BỐ CỤC (số cột,
-- thứ tự section, cấu trúc HTML) vẫn nằm trong code và đi qua review.
--
-- VÌ SAO TÁCH BẢN DỊCH RA BẢNG RIÊNG (DEC-T25, DEC-B15):
--
-- Một mục menu có MỘT `href` và MỘT thứ tự, nhưng HAI nhãn (vi/en). Nếu nhét `locale` vào
-- chính hàng `nav_items` thì `href` và `sort_order` bị nhân đôi, và sớm muộn bản `vi` với
-- bản `en` trỏ đi hai nơi khác nhau mà không ai phát hiện. Đây đúng là loại lỗi mà composite
-- FK ở migration 0007 (`usage_metrics_feature_application_fk`) sinh ra để chặn.
--
-- NGUYÊN TẮC XUYÊN FILE, giống 0007: DB kiểm những gì DB kiểm được (danh mục đóng, non-empty,
-- quan hệ). Cú pháp `href` — scheme, chống open redirect — kiểm ở APPLICATION LAYER, vì nó
-- cần danh sách cấu hình và luật `//` mà CHECK constraint không diễn đạt nổi.

--> statement-breakpoint
-- Vị trí đặt menu trên giao diện. Danh mục ĐÓNG: thêm một vị trí nghĩa là code phải có chỗ
-- render nó, nên đó là một thay đổi có migration chứ không phải dữ liệu người biên tập tạo.
CREATE TABLE control_plane.nav_menus (
  -- id do APPLICATION sinh (UUIDv7 — DEC-T06), không có DB default.
  id uuid PRIMARY KEY,

  key text NOT NULL,
  display_name text NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT nav_menus_key_check CHECK (
    key IN (
      'header.primary',
      'footer.explore',
      'footer.about',
      'footer.resources'
    )
  ),
  CONSTRAINT nav_menus_display_name_check CHECK (length(btrim(display_name)) > 0)
);

--> statement-breakpoint
CREATE UNIQUE INDEX nav_menus_key_key ON control_plane.nav_menus (key);

--> statement-breakpoint
-- Phần KHÔNG phụ thuộc ngôn ngữ của một mục điều hướng.
CREATE TABLE control_plane.nav_items (
  id uuid PRIMARY KEY,

  menu_key text NOT NULL
    REFERENCES control_plane.nav_menus (key) ON DELETE RESTRICT,

  sort_order integer NOT NULL,

  -- Đường dẫn nội bộ (`/tools`) hoặc URL ngoài (`https://…`). KHÔNG lưu prefix locale:
  -- prefix do web dựng lúc render theo ngôn ngữ đang xem.
  href text NOT NULL,

  status text NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Danh mục ĐÓNG, giống catalog. Mục mới luôn bắt đầu ở `draft`.
  CONSTRAINT nav_items_status_check CHECK (status IN ('draft', 'active', 'inactive')),

  CONSTRAINT nav_items_href_check CHECK (length(btrim(href)) > 0),

  -- Số âm không mang nghĩa gì ở đây và chỉ tạo ra hai cách biểu diễn cho cùng một thứ tự.
  CONSTRAINT nav_items_sort_order_check CHECK (sort_order >= 0),

  -- THỨ TỰ XÁC ĐỊNH, và ràng buộc này BẮT BUỘC phải hoãn được.
  --
  -- Đổi chỗ hai mục là hai câu UPDATE. Unique kiểm ngay theo từng câu lệnh sẽ vỡ ở câu đầu
  -- (hai hàng cùng sort_order trong khoảnh khắc giữa hai lệnh) dù trạng thái CUỐI transaction
  -- hoàn toàn hợp lệ. `DEFERRABLE INITIALLY DEFERRED` dời phép kiểm về lúc COMMIT.
  --
  -- Phải khai bằng CONSTRAINT trong bảng — `CREATE UNIQUE INDEX` (kiểu dùng ở 0007) KHÔNG
  -- hoãn được.
  CONSTRAINT nav_items_menu_sort_key UNIQUE (menu_key, sort_order)
    DEFERRABLE INITIALLY DEFERRED
);

--> statement-breakpoint
-- Đường đọc nóng nhất: "lấy các mục `active` của một menu, theo thứ tự". Header và footer
-- xuất hiện trên MỌI trang nên truy vấn này chạy nhiều hơn mọi truy vấn khác của module.
CREATE INDEX nav_items_menu_status_sort_idx
  ON control_plane.nav_items (menu_key, status, sort_order);

--> statement-breakpoint
CREATE TABLE control_plane.nav_item_translations (
  id uuid PRIMARY KEY,

  -- CASCADE ở đây là ngoại lệ có chủ đích so với RESTRICT của catalog: một bản dịch không có
  -- nghĩa độc lập với mục menu của nó, và không bảng lịch sử nào tham chiếu nó. Xoá mục menu
  -- mà để lại bản dịch mồ côi mới là trạng thái sai.
  nav_item_id uuid NOT NULL
    REFERENCES control_plane.nav_items (id) ON DELETE CASCADE,

  -- Danh mục ĐÓNG (DEC-B15). Thêm ngôn ngữ = migration mới + file message đầy đủ phía web.
  locale text NOT NULL,

  label text NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT nav_item_translations_locale_check CHECK (locale IN ('vi', 'en')),
  CONSTRAINT nav_item_translations_label_check CHECK (length(btrim(label)) > 0)
);

--> statement-breakpoint
-- Một mục có ĐÚNG MỘT nhãn cho mỗi ngôn ngữ.
CREATE UNIQUE INDEX nav_item_translations_item_locale_key
  ON control_plane.nav_item_translations (nav_item_id, locale);

--> statement-breakpoint
-- Bốn vị trí menu, seed sẵn. Đây là DANH MỤC (code phải có chỗ render), không phải nội dung
-- người biên tập tạo — nên nó thuộc migration.
INSERT INTO control_plane.nav_menus (id, key, display_name) VALUES
  (gen_random_uuid(), 'header.primary',   'Menu chính (header)'),
  (gen_random_uuid(), 'footer.explore',   'Footer — Khám phá'),
  (gen_random_uuid(), 'footer.about',     'Footer — Về chúng tôi'),
  (gen_random_uuid(), 'footer.resources', 'Footer — Tài nguyên');

--> statement-breakpoint
-- QUYỀN CHO ROLE RUNTIME — bắt buộc, không phải tuỳ chọn.
--
-- `ALTER DEFAULT PRIVILEGES` ở migration 0000 chỉ cấp SELECT + INSERT cho `talosmine_runtime`.
-- Bảng mới thừa hưởng đúng chừng đó, nên nếu thiếu khối này thì mọi đường GHI của module
-- chạy được ở test (testcontainers nối bằng superuser) nhưng chết ở dev và production với
-- `permission denied`. Migration 0008 đã cấp UPDATE/DELETE theo đúng cách này.
--
-- `nav_items` cần UPDATE: sửa href, đổi status, và sắp xếp lại thứ tự.
-- `nav_items` cần DELETE: mục menu KHÔNG được entitlement/quota nào tham chiếu nên xoá thật
--   được — khác catalog, nơi chỉ đổi `status`.
-- `nav_item_translations` cần cả hai: sửa nhãn, và xoá bản dịch của một ngôn ngữ.
--
-- `nav_menus` CỐ Ý không có GRANT nào ở đây: nó chỉ nhận SELECT + INSERT từ default
-- privileges, và runtime không bao giờ cần sửa hay xoá một vị trí menu — thêm một vị trí đòi
-- code phải có chỗ render nó, tức là một migration.
GRANT UPDATE, DELETE ON control_plane.nav_items TO talosmine_runtime;

--> statement-breakpoint
GRANT UPDATE, DELETE ON control_plane.nav_item_translations TO talosmine_runtime;

--> statement-breakpoint
-- Mở rộng danh mục permission. Cùng lý do và cùng cách làm như migration 0009: danh sách là
-- CHECK đóng nên thêm quyền phải có migration.
--
-- BA MỨC, tách `publish` khỏi `manage` theo đúng lập luận đã ghi ở 0009: đổi một mục nav sang
-- `active` là đưa nó lên header/footer của MỌI trang cho MỌI khách. Đó là hành động có hệ quả
-- bên ngoài, khác hẳn việc sửa nhãn ở trạng thái nháp.
ALTER TABLE control_plane.admin_role_permissions
  DROP CONSTRAINT admin_role_permissions_permission_check;

--> statement-breakpoint
ALTER TABLE control_plane.admin_role_permissions
  ADD CONSTRAINT admin_role_permissions_permission_check CHECK (
    permission IN (
      -- P2 — identity, account, phiên, phân quyền, audit
      'account:read',
      'account:disable',
      'account:enable',
      'session:revoke',
      'admin_role:manage',
      'audit:read',
      -- P3 — catalog
      'catalog:read',
      'catalog:manage',
      'catalog:publish',
      -- Site content — điều hướng header/footer
      'content:read',
      'content:manage',
      'content:publish'
    )
  );

--> statement-breakpoint
-- Cấp ba quyền mới cho `platform_admin` nếu role đó đã tồn tại — xem lập luận ở 0009:
-- không có bước này, admin đầu tiên thiếu đúng ba quyền vừa thêm và KHÔNG AI cấp được cho
-- họ, vì chốt chặn leo thang đặc quyền yêu cầu người cấp phải tự có quyền đó.
INSERT INTO control_plane.admin_role_permissions (id, admin_role_id, permission)
SELECT gen_random_uuid(), r.id, p.permission
FROM control_plane.admin_roles r
CROSS JOIN (VALUES ('content:read'), ('content:manage'), ('content:publish')) AS p(permission)
WHERE r.key = 'platform_admin'
  AND NOT EXISTS (
    SELECT 1 FROM control_plane.admin_role_permissions existing
    WHERE existing.admin_role_id = r.id AND existing.permission = p.permission
  );
