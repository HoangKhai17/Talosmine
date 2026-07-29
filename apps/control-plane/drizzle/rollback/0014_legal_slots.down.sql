-- Gỡ migration 0014 — thu hẹp danh mục khe về bộ 41 của 0013.
--
-- Xoá các hàng `legal.*` TRƯỚC khi thu hẹp CHECK, nếu không `ADD CONSTRAINT` bị chính dữ
-- liệu đang có từ chối — cùng bẫy đã ghi ở 0009/0010/0012.
--
-- MẤT DỮ LIỆU: nội dung Điều khoản và Chính sách đã soạn biến mất; trang `/terms`/`/privacy`
-- quay về thông báo "đang cập nhật". Xem `README.md` mục "KHI NÀO ĐƯỢC DÙNG".

--> statement-breakpoint
DELETE FROM control_plane.content_slots
WHERE key IN ('legal.terms', 'legal.privacy');

--> statement-breakpoint
ALTER TABLE control_plane.content_slots
  DROP CONSTRAINT content_slots_key_check;

--> statement-breakpoint
ALTER TABLE control_plane.content_slots
  ADD CONSTRAINT content_slots_key_check CHECK (
    key IN (
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
      'tools.title',
      'tools.lead',
      'blog.title',
      'blog.lead',
      'blog.latestTitle',
      'blog.featuredTitle',
      'blog.trendingTitle',
      'comingSoon.categoriesTitle',
      'comingSoon.categoriesDescription',
      'comingSoon.contactTitle',
      'comingSoon.contactDescription',
      'comingSoon.submitTitle',
      'comingSoon.submitDescription',
      'footer.tagline',
      'newsletter.title',
      'newsletter.text',
      'meta.home',
      'meta.tools',
      'meta.blog',
      'meta.categories',
      'meta.contact',
      'meta.submit',
      'seo.description.home',
      'seo.description.tools',
      'seo.description.blog',
      'seo.description.categories',
      'seo.description.contact',
      'seo.description.submit'
    )
  );
