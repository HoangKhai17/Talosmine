-- Migration Site Content — khe nội dung (content slots) cho các trang tĩnh.
--
-- VẤN ĐỀ ĐANG GIẢI: tiêu đề, đoạn dẫn và chữ SEO của các trang (home, tools, blog, liên hệ…)
-- đang viết cứng trong message catalog của web. Đổi một câu tiêu đề phải sửa code và deploy.
-- Bảng này đưa PHẦN CHỮ ra CMS, còn BỐ CỤC vẫn nằm trong code — cùng nguyên tắc đã ghi ở
-- `nav_items` (0010): "Code giữ BỐ CỤC, dữ liệu giữ NỘI DUNG".
--
-- CÁCH VẬN HÀNH — ba điểm quyết định hình dạng bảng:
--
--   1. KHOÁ LÀ ĐƯỜNG DẪN TRONG MESSAGE CATALOG (`home.heroTitle`, `meta.tools`…). Web merge
--      giá trị DB đè lên catalog trước khi render, nên khoá nào KHÔNG có hàng thì trang dùng
--      chữ hiện tại trong code. Bảng rỗng = trang y nguyên hôm nay; xoá hàng = quay về mặc
--      định. Không tồn tại trạng thái "ô trống trên production".
--
--   2. DANH MỤC KHOÁ ĐÓNG bằng CHECK. Một khe không có chỗ render trong code là dữ liệu
--      chết, nên thêm khe = migration + code đọc nó — cùng lập luận với `nav_menus` và
--      `survey_questions`. Admin sửa GIÁ TRỊ, không tạo khoá.
--
--   3. MỖI (khoá, ngôn ngữ) MỘT HÀNG, không tách bảng bản dịch như nav/survey: khe không có
--      thuộc tính nào ngoài giá trị chữ (không status, không sort_order, không href), nên
--      bảng cha chỉ còn mỗi cột `key` — một JOIN để đọc một cột là cái giá vô nghĩa.
--
-- KHÔNG SEED: khác `site_settings` (một hàng cố định, chỉ UPDATE), số khe × ngôn ngữ lớn và
-- "chưa đặt" là trạng thái mặc định hợp lệ. Đường ghi cần INSERT (đã có từ default
-- privileges) + UPDATE/DELETE (cấp dưới đây).
--
-- CHỮ THUẦN, KHÔNG HTML: giá trị render qua JSX nên markup không bao giờ chạy, nhưng luật
-- này ghi ở đây để không ai "nâng cấp" thành ô nhập HTML — CSP theo nonce (DEC-T20) là ranh
-- giới không thương lượng.

--> statement-breakpoint
CREATE TABLE control_plane.content_slots (
  -- id do APPLICATION sinh (UUIDv7 — DEC-T06).
  id uuid PRIMARY KEY,

  key text NOT NULL,

  locale text NOT NULL,

  -- KHÔNG cho NULL và KHÔNG cho chuỗi rỗng: "chưa đặt" biểu diễn bằng VIỆC KHÔNG CÓ HÀNG.
  -- Cho phép hàng rỗng là tạo cách biểu diễn thứ hai cho cùng một trạng thái, và mọi chỗ
  -- đọc phải kiểm cả hai.
  value text NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT content_slots_locale_check CHECK (locale IN ('vi', 'en')),

  CONSTRAINT content_slots_value_check CHECK (length(btrim(value)) > 0),

  -- Danh mục ĐÓNG — khớp `CONTENT_SLOT_KEYS` ở schema.ts và danh mục hiển thị của
  -- `/admin/content/pages`. Nhóm theo TRANG như cách người biên tập nghĩ ("dòng này nằm ở
  -- đâu"), không theo loại từ.
  CONSTRAINT content_slots_key_check CHECK (
    key IN (
      -- Trang chủ: hero, dải số liệu, tiêu đề + đoạn dẫn của từng section
      'home.heroTitle',
      'home.heroLead',
      'home.statToolCount',
      'home.statCategoryCount',
      'home.statUpdated',
      'home.toolsTitle',
      'home.toolsLead',
      'home.categoriesTitle',
      'home.whatsNewTitle',
      'home.whatsNewLead',
      'home.blogTitle',
      'home.faqTitle',
      'home.faqLead',
      -- Trang Tools (post type — chỉ phần "khung" quanh danh sách, không phải dữ liệu list)
      'tools.title',
      'tools.lead',
      -- Trang Blog (post type — như trên)
      'blog.title',
      'blog.lead',
      'blog.latestTitle',
      'blog.featuredTitle',
      'blog.trendingTitle',
      -- Ba trang giữ chỗ: Danh mục, Liên hệ, Gửi công cụ
      'comingSoon.categoriesTitle',
      'comingSoon.categoriesDescription',
      'comingSoon.contactTitle',
      'comingSoon.contactDescription',
      'comingSoon.submitTitle',
      'comingSoon.submitDescription',
      -- Thành phần dùng chung trên nhiều trang
      'footer.tagline',
      'newsletter.title',
      'newsletter.text',
      -- SEO: <title> từng trang (khoá trùng đường dẫn catalog `meta.*`)
      'meta.home',
      'meta.tools',
      'meta.blog',
      'meta.categories',
      'meta.contact',
      'meta.submit',
      -- SEO: <meta description> từng trang. KHÔNG có bản dự phòng trong catalog — chưa đặt
      -- thì trang không phát thẻ description, đúng hành vi hiện tại.
      'seo.description.home',
      'seo.description.tools',
      'seo.description.blog',
      'seo.description.categories',
      'seo.description.contact',
      'seo.description.submit'
    )
  )
);

--> statement-breakpoint
CREATE UNIQUE INDEX content_slots_key_locale_key ON control_plane.content_slots (key, locale);

--> statement-breakpoint
-- QUYỀN CHO ROLE RUNTIME.
--
-- `ALTER DEFAULT PRIVILEGES` (migration 0000) chỉ cho SELECT + INSERT. Thiếu dòng này thì
-- mọi test vẫn xanh (testcontainers nối bằng superuser) nhưng dev/production chết với
-- `permission denied` — bug đã xảy ra ở 0010, có test `has_table_privilege` canh ở 0012.
--
-- Cần cả UPDATE (sửa giá trị) lẫn DELETE (xoá override = quay về chữ mặc định trong code —
-- đó là một thao tác biên tập bình thường, không phải huỷ dữ liệu lịch sử).
GRANT UPDATE, DELETE ON control_plane.content_slots TO talosmine_runtime;
