-- Thêm hai khe VĂN BẢN PHÁP LÝ vào danh mục khe nội dung: Điều khoản dịch vụ và Chính sách
-- riêng tư (yêu cầu chủ dự án 2026-07-28 — form đăng ký cần hai link đọc được).
--
-- Vẫn là khe chữ thuần trong `content_slots`, KHÔNG phải hệ soạn thảo văn bản: nội dung
-- pháp lý ở giai đoạn này là chữ dài có xuống dòng, web render đoạn theo dòng trống. Khi cần
-- định dạng thật (mục lục, đề mục đánh số) thì đó là một quyết định riêng, không phải nới
-- dần khe chữ thành trang HTML.
--
-- CHECK không sửa tại chỗ được trong PostgreSQL — bỏ rồi thêm lại, cùng khuôn với 0009/0012
-- khi nới danh mục permission.

--> statement-breakpoint
ALTER TABLE control_plane.content_slots
  DROP CONSTRAINT content_slots_key_check;

--> statement-breakpoint
ALTER TABLE control_plane.content_slots
  ADD CONSTRAINT content_slots_key_check CHECK (
    key IN (
      -- Trang chủ
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
      -- Trang Tools
      'tools.title',
      'tools.lead',
      -- Trang Blog
      'blog.title',
      'blog.lead',
      'blog.latestTitle',
      'blog.featuredTitle',
      'blog.trendingTitle',
      -- Ba trang giữ chỗ
      'comingSoon.categoriesTitle',
      'comingSoon.categoriesDescription',
      'comingSoon.contactTitle',
      'comingSoon.contactDescription',
      'comingSoon.submitTitle',
      'comingSoon.submitDescription',
      -- Dùng chung
      'footer.tagline',
      'newsletter.title',
      'newsletter.text',
      -- SEO <title>
      'meta.home',
      'meta.tools',
      'meta.blog',
      'meta.categories',
      'meta.contact',
      'meta.submit',
      -- SEO description
      'seo.description.home',
      'seo.description.tools',
      'seo.description.blog',
      'seo.description.categories',
      'seo.description.contact',
      'seo.description.submit',
      -- Văn bản pháp lý (0014) — thân trang `/terms` và `/privacy`
      'legal.terms',
      'legal.privacy'
    )
  );
