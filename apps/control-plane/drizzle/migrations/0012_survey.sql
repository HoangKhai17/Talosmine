-- Migration Survey — khảo sát onboarding sau khi đăng ký.
--
-- VẤN ĐỀ ĐANG GIẢI: người mới đăng ký đi thẳng vào trang chủ, hệ thống không biết gì về nhu
-- cầu của họ. Màn hình khảo sát ngắn (bỏ qua được) thu thập thông tin đó, và nội dung câu hỏi
-- phải sửa được trong `/admin` chứ không nằm cứng trong code.
--
-- CẤU TRÚC CỐ ĐỊNH, NỘI DUNG MỞ (chủ dự án chốt 2026-07-28): ba câu hỏi được seed ở đây và
-- KHÔNG tạo thêm được từ giao diện — code biết trước có ba câu nên layout luôn render đúng.
-- Quản trị viên sửa tiêu đề, mô tả, và thêm/bớt/sắp xếp LỰA CHỌN.
--
-- VÌ SAO SÁU BẢNG: song ngữ và dữ liệu trả lời là hai trục độc lập.
--   nội dung  = questions + options, mỗi cái kèm một bảng bản dịch (cùng lý do đã ghi ở
--               `nav_item_translations` migration 0010: một câu hỏi có MỘT thứ tự nhưng HAI
--               tiêu đề; nhét `locale` vào hàng chính sẽ nhân đôi mọi cột không phải chữ)
--   trả lời   = responses + answers

--> statement-breakpoint
CREATE TABLE control_plane.survey_questions (
  id uuid PRIMARY KEY,

  -- Khoá máy ỔN ĐỊNH. Code tham chiếu key này để biết câu nào render kiểu nào.
  -- Danh mục ĐÓNG: thêm câu hỏi đòi code phải có chỗ render, tức là một migration.
  key text NOT NULL,

  kind text NOT NULL,

  -- Số lựa chọn tối thiểu. Câu `single` luôn là 1; câu `multi` do người biên tập đặt.
  min_select integer NOT NULL DEFAULT 1,

  sort_order integer NOT NULL,

  -- KHÔNG có `draft` (khác `nav_items`): hàng do migration seed, không ai tạo mới, nên
  -- `draft` là trạng thái không bao giờ đạt tới. Thêm một giá trị không dùng được vào danh
  -- mục chỉ khiến người đọc phải tự hỏi khi nào nó xảy ra.
  status text NOT NULL DEFAULT 'active',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT survey_questions_key_check
    CHECK (key IN ('categories', 'primary_use', 'discover_first')),
  CONSTRAINT survey_questions_kind_check CHECK (kind IN ('single', 'multi')),
  CONSTRAINT survey_questions_status_check CHECK (status IN ('active', 'inactive')),
  CONSTRAINT survey_questions_min_select_check CHECK (min_select >= 1),
  CONSTRAINT survey_questions_sort_order_check CHECK (sort_order >= 0)
);

--> statement-breakpoint
CREATE UNIQUE INDEX survey_questions_key_key ON control_plane.survey_questions (key);

--> statement-breakpoint
CREATE TABLE control_plane.survey_question_translations (
  id uuid PRIMARY KEY,

  -- CASCADE: bản dịch không có nghĩa độc lập với câu hỏi. Cùng lập luận với
  -- `nav_item_translations`.
  question_id uuid NOT NULL
    REFERENCES control_plane.survey_questions (id) ON DELETE CASCADE,

  locale text NOT NULL,
  title text NOT NULL,
  description text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT survey_question_translations_locale_check CHECK (locale IN ('vi', 'en')),
  CONSTRAINT survey_question_translations_title_check CHECK (length(btrim(title)) > 0),
  CONSTRAINT survey_question_translations_description_check
    CHECK (description IS NULL OR length(btrim(description)) > 0)
);

--> statement-breakpoint
CREATE UNIQUE INDEX survey_question_translations_question_locale_key
  ON control_plane.survey_question_translations (question_id, locale);

--> statement-breakpoint
CREATE TABLE control_plane.survey_options (
  id uuid PRIMARY KEY,

  question_id uuid NOT NULL
    REFERENCES control_plane.survey_questions (id) ON DELETE RESTRICT,

  -- Ổn định TRONG PHẠM VI câu hỏi. Câu trả lời trỏ tới `id`, nhưng `key` là thứ đọc log mà
  -- hiểu ngay đang nói về lựa chọn nào mà không phải tra bảng.
  key text NOT NULL,

  -- Danh mục ĐÓNG. Code render SVG theo key này.
  --
  -- KHÔNG nhận SVG/HTML tự nhập: CSP theo nonce (DEC-T20) sẽ chặn script inline, và nới CSP
  -- để chiều một ô nhập icon là đánh đổi tệ nhất trong kiến trúc này.
  icon text,

  sort_order integer NOT NULL,

  -- CÓ `draft` ở đây (khác `survey_questions`): quản trị viên tạo lựa chọn mới được, nên nó
  -- cần một trạng thái để soạn trước khi đưa ra trước người dùng.
  status text NOT NULL DEFAULT 'draft',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT survey_options_key_check CHECK (length(btrim(key)) > 0),
  CONSTRAINT survey_options_status_check CHECK (status IN ('draft', 'active', 'inactive')),
  CONSTRAINT survey_options_sort_order_check CHECK (sort_order >= 0),
  CONSTRAINT survey_options_icon_check CHECK (
    icon IS NULL OR icon IN (
      'writing', 'design', 'code', 'video', 'image', 'automation', 'research', 'business',
      'chart', 'chat', 'cloud', 'shield', 'sparkle', 'rocket', 'book'
    )
  ),

  CONSTRAINT survey_options_question_key_key UNIQUE (question_id, key),

  -- DEFERRABLE vì lý do y hệt `nav_items_menu_sort_key`: sắp xếp lại là nhiều câu UPDATE, và
  -- giữa chúng hai hàng tạm trùng `sort_order` dù trạng thái cuối transaction hợp lệ.
  -- `CREATE UNIQUE INDEX` KHÔNG hoãn được — phải khai bằng CONSTRAINT.
  CONSTRAINT survey_options_question_sort_key UNIQUE (question_id, sort_order)
    DEFERRABLE INITIALLY DEFERRED
);

--> statement-breakpoint
-- Đường đọc nóng nhất: "lấy lựa chọn `active` của một câu, theo thứ tự".
CREATE INDEX survey_options_question_status_sort_idx
  ON control_plane.survey_options (question_id, status, sort_order);

--> statement-breakpoint
CREATE TABLE control_plane.survey_option_translations (
  id uuid PRIMARY KEY,

  option_id uuid NOT NULL
    REFERENCES control_plane.survey_options (id) ON DELETE CASCADE,

  locale text NOT NULL,
  label text NOT NULL,
  -- Câu 1 chỉ có nhãn; câu 2 và 3 có thêm một dòng mô tả trong ô. Nullable vì thế.
  description text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT survey_option_translations_locale_check CHECK (locale IN ('vi', 'en')),
  CONSTRAINT survey_option_translations_label_check CHECK (length(btrim(label)) > 0),
  CONSTRAINT survey_option_translations_description_check
    CHECK (description IS NULL OR length(btrim(description)) > 0)
);

--> statement-breakpoint
CREATE UNIQUE INDEX survey_option_translations_option_locale_key
  ON control_plane.survey_option_translations (option_id, locale);

--> statement-breakpoint
-- ── Dữ liệu trả lời ─────────────────────────────────────────────────────────
--
-- ĐÂY LÀ DỮ LIỆU CÁ NHÂN. Thời hạn lưu và chính sách ẩn danh hoá thuộc DEC-B11 (đang `open`)
-- và CHỈ chủ dự án chốt được. Migration này cố ý KHÔNG ghi thời hạn nào vào schema.
CREATE TABLE control_plane.survey_responses (
  id uuid PRIMARY KEY,

  -- RESTRICT chứ không CASCADE: xoá account mà cuốn theo dữ liệu khảo sát là một quyết định
  -- về quyền riêng tư, chưa được chốt (DEC-B11 câu 3). RESTRICT là lựa chọn an toàn — nó
  -- BUỘC phải xử lý tường minh thay vì âm thầm mất dữ liệu.
  account_id uuid NOT NULL
    REFERENCES control_plane.accounts (id) ON DELETE RESTRICT,

  -- `skipped` KHÔNG phải "không có gì": thiếu nó thì hệ thống không phân biệt được "chưa
  -- từng hỏi" với "đã hỏi và họ từ chối", nên sẽ hỏi lại mãi. Tỉ lệ bỏ qua cũng là số liệu.
  status text NOT NULL,

  -- Ngôn ngữ lúc trả lời. Hữu ích khi đọc lại dữ liệu: nhãn lựa chọn có thể đã đổi từ đó.
  locale text NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT survey_responses_status_check CHECK (status IN ('completed', 'skipped')),
  CONSTRAINT survey_responses_locale_check CHECK (locale IN ('vi', 'en'))
);

--> statement-breakpoint
-- MỘT account trả lời MỘT lần. Đây cũng chính là cờ "đã onboard": có hàng nghĩa là đã hỏi.
--
-- Cố ý KHÔNG thêm cột `onboarded_at` vào `accounts`: module Survey ghi vào bảng của module
-- Account sẽ vi phạm luật ranh giới ở `modular.md` mục 1.2.
CREATE UNIQUE INDEX survey_responses_account_key
  ON control_plane.survey_responses (account_id);

--> statement-breakpoint
CREATE TABLE control_plane.survey_answers (
  id uuid PRIMARY KEY,

  -- CASCADE: một câu trả lời lẻ không có nghĩa nếu bản ghi khảo sát đã biến mất.
  response_id uuid NOT NULL
    REFERENCES control_plane.survey_responses (id) ON DELETE CASCADE,

  -- RESTRICT: không cho xoá câu hỏi/lựa chọn đã có người trả lời. Xoá chúng sẽ làm mọi số
  -- liệu lịch sử trỏ vào hư không.
  question_id uuid NOT NULL
    REFERENCES control_plane.survey_questions (id) ON DELETE RESTRICT,
  option_id uuid NOT NULL
    REFERENCES control_plane.survey_options (id) ON DELETE RESTRICT,

  created_at timestamptz NOT NULL DEFAULT now(),

  -- Cùng một lựa chọn không được ghi hai lần trong một lần trả lời.
  CONSTRAINT survey_answers_unique UNIQUE (response_id, question_id, option_id)
);

--> statement-breakpoint
-- Đích của truy vấn tổng hợp "mỗi lựa chọn được chọn bao nhiêu lần".
CREATE INDEX survey_answers_option_idx ON control_plane.survey_answers (option_id);

--> statement-breakpoint
-- ── Quyền cho role runtime ──────────────────────────────────────────────────
--
-- BẮT BUỘC. `ALTER DEFAULT PRIVILEGES` (migration 0000) chỉ cấp SELECT + INSERT. Thiếu khối
-- này thì mọi test vẫn XANH (testcontainers nối bằng superuser) nhưng dev và production chết
-- với `permission denied` — đúng bug đã xảy ra ở migration 0010.
--
-- Bảng NỘI DUNG cần UPDATE (sửa nhãn, đổi thứ tự, đổi trạng thái) và DELETE (xoá lựa chọn).
GRANT UPDATE, DELETE ON control_plane.survey_options TO talosmine_runtime;

--> statement-breakpoint
GRANT UPDATE, DELETE ON control_plane.survey_option_translations TO talosmine_runtime;

--> statement-breakpoint
GRANT UPDATE ON control_plane.survey_questions TO talosmine_runtime;

--> statement-breakpoint
GRANT UPDATE, DELETE ON control_plane.survey_question_translations TO talosmine_runtime;

--> statement-breakpoint
-- Bảng TRẢ LỜI chỉ cần INSERT (đã có từ default privileges). KHÔNG cấp UPDATE/DELETE: câu
-- trả lời đã nộp là dữ liệu lịch sử, không có đường sửa từ ứng dụng.

--> statement-breakpoint
-- ── Permission mới ──────────────────────────────────────────────────────────
--
-- `survey_response:read` TÁCH KHỎI `content:*` là có chủ đích và quan trọng: sửa câu hỏi là
-- việc BIÊN TẬP, còn đọc câu trả lời là TRUY CẬP DỮ LIỆU CÁ NHÂN của mọi người dùng. Gộp
-- chung nghĩa là ai sửa được một dòng chữ cũng đọc được toàn bộ dữ liệu thu thập.
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
      -- Site content — điều hướng header/footer, cài đặt site
      'content:read',
      'content:manage',
      'content:publish',
      -- Survey — đọc dữ liệu khảo sát của người dùng
      'survey_response:read'
    )
  );

--> statement-breakpoint
-- Cấp cho `platform_admin` nếu role đó đã tồn tại — xem lập luận ở migration 0009: không có
-- bước này, admin đầu tiên thiếu đúng quyền vừa thêm và KHÔNG AI cấp được cho họ.
INSERT INTO control_plane.admin_role_permissions (id, admin_role_id, permission)
SELECT gen_random_uuid(), r.id, 'survey_response:read'
FROM control_plane.admin_roles r
WHERE r.key = 'platform_admin'
  AND NOT EXISTS (
    SELECT 1 FROM control_plane.admin_role_permissions existing
    WHERE existing.admin_role_id = r.id AND existing.permission = 'survey_response:read'
  );

--> statement-breakpoint
-- ── Seed ba câu hỏi ─────────────────────────────────────────────────────────
--
-- Đây là CẤU TRÚC (code phải có chỗ render), không phải nội dung người biên tập tạo — nên nó
-- thuộc migration. Chữ thì sửa được trong `/admin`.
INSERT INTO control_plane.survey_questions (id, key, kind, min_select, sort_order) VALUES
  (gen_random_uuid(), 'categories',     'multi',  3, 0),
  (gen_random_uuid(), 'primary_use',    'single', 1, 1),
  (gen_random_uuid(), 'discover_first', 'single', 1, 2);

--> statement-breakpoint
INSERT INTO control_plane.survey_question_translations (id, question_id, locale, title, description)
SELECT gen_random_uuid(), q.id, t.locale, t.title, t.description
FROM control_plane.survey_questions q
JOIN (VALUES
  ('categories', 'vi', 'Bạn quan tâm nhất tới nhóm AI nào?',
   'Chọn ít nhất 3 nhóm bạn muốn khám phá. Chúng tôi dùng lựa chọn này để gợi ý công cụ, hướng dẫn và tài nguyên phù hợp hơn.'),
  ('categories', 'en', 'Which AI categories interest you most?',
   'Select at least 3 categories you''d like to explore. We''ll use your interests to recommend better tools, guides, and resources.'),
  ('primary_use', 'vi', 'Bạn dùng AI chủ yếu để làm gì?',
   'Chọn phương án mô tả đúng nhất cách bạn dự định dùng AI trong công việc hằng ngày.'),
  ('primary_use', 'en', 'How do you primarily use AI?',
   'Choose the option that best describes how you plan to use AI in your daily work.'),
  ('discover_first', 'vi', 'Bạn muốn khám phá điều gì trước?',
   'Chọn loại nội dung bạn muốn Talosmine gợi ý.'),
  ('discover_first', 'en', 'What would you like to discover first?',
   'Choose the type of content you''d like Talosmine to recommend.')
) AS t(qkey, locale, title, description) ON t.qkey = q.key;

--> statement-breakpoint
-- Lựa chọn câu 1. Mockup có "Coding" lặp ba lần — hiểu là chỗ giữ chỗ chưa thay, nên seed
-- tám nhóm KHÔNG TRÙNG. Quản trị viên thêm/bớt sau.
INSERT INTO control_plane.survey_options (id, question_id, key, icon, sort_order, status)
SELECT gen_random_uuid(), q.id, o.key, o.icon, o.sort_order, 'active'
FROM control_plane.survey_questions q
JOIN (VALUES
  ('writing',    'writing',    0),
  ('design',     'design',     1),
  ('coding',     'code',       2),
  ('video',      'video',      3),
  ('image',      'image',      4),
  ('automation', 'automation', 5),
  ('research',   'research',   6),
  ('business',   'business',   7)
) AS o(key, icon, sort_order) ON true
WHERE q.key = 'categories';

--> statement-breakpoint
INSERT INTO control_plane.survey_option_translations (id, option_id, locale, label)
SELECT gen_random_uuid(), o.id, t.locale, t.label
FROM control_plane.survey_options o
JOIN control_plane.survey_questions q ON q.id = o.question_id AND q.key = 'categories'
JOIN (VALUES
  ('writing',    'vi', 'Viết lách'),      ('writing',    'en', 'Writing'),
  ('design',     'vi', 'Thiết kế'),       ('design',     'en', 'Design'),
  ('coding',     'vi', 'Lập trình'),      ('coding',     'en', 'Coding'),
  ('video',      'vi', 'Video'),          ('video',      'en', 'Video'),
  ('image',      'vi', 'Hình ảnh'),       ('image',      'en', 'Image'),
  ('automation', 'vi', 'Tự động hoá'),    ('automation', 'en', 'Automation'),
  ('research',   'vi', 'Nghiên cứu'),     ('research',   'en', 'Research'),
  ('business',   'vi', 'Kinh doanh'),     ('business',   'en', 'Business')
) AS t(okey, locale, label) ON t.okey = o.key;

--> statement-breakpoint
INSERT INTO control_plane.survey_options (id, question_id, key, sort_order, status)
SELECT gen_random_uuid(), q.id, o.key, o.sort_order, 'active'
FROM control_plane.survey_questions q
JOIN (VALUES
  ('personal_productivity', 0),
  ('business_marketing',    1),
  ('learning_research',     2),
  ('content_creation',      3),
  ('software_development',  4)
) AS o(key, sort_order) ON true
WHERE q.key = 'primary_use';

--> statement-breakpoint
INSERT INTO control_plane.survey_option_translations (id, option_id, locale, label, description)
SELECT gen_random_uuid(), o.id, t.locale, t.label, t.description
FROM control_plane.survey_options o
JOIN control_plane.survey_questions q ON q.id = o.question_id AND q.key = 'primary_use'
JOIN (VALUES
  ('personal_productivity', 'vi', 'Năng suất cá nhân', 'Quản lý công việc hằng ngày và làm việc hiệu quả hơn.'),
  ('personal_productivity', 'en', 'Personal Productivity', 'Manage daily tasks and improve efficiency.'),
  ('business_marketing', 'vi', 'Kinh doanh & Marketing', 'Phát triển kinh doanh, tự động hoá quy trình và cải thiện hiệu quả marketing.'),
  ('business_marketing', 'en', 'Business & Marketing', 'Grow your business, automate workflows, and improve marketing performance.'),
  ('learning_research', 'vi', 'Học tập & Nghiên cứu', 'Học, nghiên cứu và khám phá kiến thức mới cùng AI.'),
  ('learning_research', 'en', 'Learning & Research', 'Study, research, and discover new knowledge with AI.'),
  ('content_creation', 'vi', 'Sáng tạo nội dung', 'Tạo bài viết, video, hình ảnh và nội dung mạng xã hội nhanh hơn.'),
  ('content_creation', 'en', 'Content Creation', 'Create articles, videos, images, and social media content faster.'),
  ('software_development', 'vi', 'Phát triển phần mềm', 'Xây dựng ứng dụng, viết mã, gỡ lỗi và tự động hoá quy trình phát triển.'),
  ('software_development', 'en', 'Software Development', 'Build applications, write code, debug, and automate development.')
) AS t(okey, locale, label, description) ON t.okey = o.key;

--> statement-breakpoint
INSERT INTO control_plane.survey_options (id, question_id, key, sort_order, status)
SELECT gen_random_uuid(), q.id, o.key, o.sort_order, 'active'
FROM control_plane.survey_questions q
JOIN (VALUES
  ('new_tools',        0),
  ('expert_guides',    1),
  ('tool_comparisons', 2),
  ('industry_news',    3),
  ('workflow_ideas',   4)
) AS o(key, sort_order) ON true
WHERE q.key = 'discover_first';

--> statement-breakpoint
INSERT INTO control_plane.survey_option_translations (id, option_id, locale, label, description)
SELECT gen_random_uuid(), o.id, t.locale, t.label, t.description
FROM control_plane.survey_options o
JOIN control_plane.survey_questions q ON q.id = o.question_id AND q.key = 'discover_first'
JOIN (VALUES
  ('new_tools', 'vi', 'Công cụ AI mới', 'Khám phá sản phẩm và nền tảng AI vừa ra mắt.'),
  ('new_tools', 'en', 'New AI Tools', 'Discover newly released AI products and platforms.'),
  ('expert_guides', 'vi', 'Hướng dẫn chuyên sâu', 'Học qua hướng dẫn thực hành và tài liệu từng bước.'),
  ('expert_guides', 'en', 'Expert Guides', 'Learn through practical tutorials and step-by-step guides.'),
  ('tool_comparisons', 'vi', 'So sánh công cụ', 'So sánh các công cụ AI trước khi quyết định.'),
  ('tool_comparisons', 'en', 'Tool Comparisons', 'Compare AI tools before making a decision.'),
  ('industry_news', 'vi', 'Tin ngành', 'Cập nhật những bản phát hành và xu hướng AI mới nhất.'),
  ('industry_news', 'en', 'Industry News', 'Stay updated with the latest AI releases and trends.'),
  ('workflow_ideas', 'vi', 'Ý tưởng quy trình', 'Khám phá quy trình AI thực tế mà người làm nghề đang dùng.'),
  ('workflow_ideas', 'en', 'Workflow Ideas', 'Explore real-world AI workflows used by professionals.')
) AS t(okey, locale, label, description) ON t.okey = o.key;
