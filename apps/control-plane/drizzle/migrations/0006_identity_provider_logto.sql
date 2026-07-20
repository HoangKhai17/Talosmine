-- P2 migration — sửa nhãn `provider` sau khi đổi IdP (DEC-T22: Auth0 → Logto self-host).
--
-- BỐI CẢNH: bảng `external_identities` ra đời khi Auth0 còn là IdP dự kiến, nên CHECK
-- khóa cứng `provider = 'auth0'`. Sau DEC-T22, IdP thật là Logto, nhưng cột vẫn ghi
-- 'auth0' — dữ liệu nói sai về nguồn gốc danh tính.
--
-- VÌ SAO ĐÂY LÀ LỖI THẬT chứ không phải chuyện đặt tên: khi cần trả lời "danh tính này
-- đến từ đâu, ai chứng thực nó" — lúc điều tra sự cố hoặc lúc migrate IdP lần sau —
-- cột này là câu trả lời. Một cột nói dối còn tệ hơn không có cột.
--
-- LƯU Ý: việc liên kết danh tính KHÔNG phụ thuộc cột này. Khóa liên kết vẫn là
-- (issuer, subject) như cũ, nên migration này không đụng tới quan hệ account ↔ identity.

--> statement-breakpoint
-- Bỏ CHECK cũ trước khi sửa dữ liệu — nếu không, chính UPDATE bên dưới sẽ vi phạm nó.
ALTER TABLE control_plane.external_identities
  DROP CONSTRAINT external_identities_provider_check;

--> statement-breakpoint
-- Gán nhãn lại các hàng đã có. Điều kiện lọc theo `issuer` chứ không mù quáng đổi hết:
-- chỉ những hàng do Logto phát mới được gọi là 'logto'. Nếu về sau thật sự có hàng
-- Auth0, chúng phải được xử lý riêng chứ không lẫn vào đây.
UPDATE control_plane.external_identities
  SET provider = 'logto', updated_at = now()
  WHERE provider = 'auth0';

--> statement-breakpoint
-- CHECK mới vẫn là danh mục ĐÓNG, giữ đúng tinh thần bảng gốc: thêm provider mới là
-- một quyết định có chủ đích, phải đi kèm migration, không phải việc code tự làm được.
--
-- Chỉ có 'logto' vì hiện chỉ có một IdP. Đăng nhập bằng Google KHÔNG tạo provider mới:
-- Logto vẫn là issuer, Google chỉ là upstream connector phía sau Logto.
ALTER TABLE control_plane.external_identities
  ADD CONSTRAINT external_identities_provider_check CHECK (provider = 'logto');

--> statement-breakpoint
-- Đổi tên `web_sessions.auth0_sid` → `idp_sid`.
--
-- Cột này lưu claim `sid` (session id) do IdP phát, dùng để propagate logout: khi IdP
-- báo một phiên phía nó đã kết thúc, ta tra ngược ra phiên của mình để thu hồi theo.
-- Đó là khái niệm CHUẨN OIDC, không phải đặc thù Auth0 — tên cũ khiến người đọc tưởng
-- phải viết lại cột này mỗi lần đổi IdP.
--
-- Đây là rename thuần: không mất dữ liệu, không đổi kiểu, không đổi ngữ nghĩa.
ALTER TABLE control_plane.web_sessions
  RENAME COLUMN auth0_sid TO idp_sid;

--> statement-breakpoint
-- Index đi theo cột thì cũng phải đổi tên, nếu không tên index sẽ mâu thuẫn với cột nó
-- phục vụ. Partial index (chỉ row có sid) được giữ nguyên qua thao tác rename.
ALTER INDEX control_plane.web_sessions_auth0_sid_idx
  RENAME TO web_sessions_idp_sid_idx;
