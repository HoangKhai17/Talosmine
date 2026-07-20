-- Database riêng cho Logto (DEC-T22).
--
-- VÌ SAO DATABASE RIÊNG chứ không phải schema trong `postgres`:
--   • Logto tự quản schema của nó (tự migrate khi nâng version). Để nó dùng chung
--     database với `control_plane` là mời một hệ thống ngoài vào cùng không gian với
--     dữ liệu nghiệp vụ của ta.
--   • Tách database = tách quyền: role `logto` không thấy `control_plane`, và
--     `talosmine_runtime` không thấy bảng của Logto.
--   • Backup/restore độc lập được.
--
-- Vẫn dùng CHUNG một PostgreSQL server (service `db`) để không phải vận hành thêm
-- một database server nữa — đủ tách biệt mà không tốn thêm hạ tầng.

\set logto_pw `echo "$LOGTO_DB_PASSWORD"`

-- Role riêng của Logto.
--
-- CREATEROLE là YÊU CẦU CỦA LOGTO, không phải lựa chọn của ta: `logto db seed` tạo role
-- riêng để phân tách tenant bên trong database của nó. Thiếu quyền này seed chết với
--   ERROR 42501: Only roles with the CREATEROLE attribute may create roles.
--
-- Vì sao chấp nhận được: từ PostgreSQL 16, role có CREATEROLE chỉ quản được những role
-- do CHÍNH NÓ tạo — không sửa được role khác, không tự nâng mình lên superuser. Cộng với
-- NOSUPERUSER và database riêng, phạm vi ảnh hưởng của `logto` bị giới hạn trong
-- database `logto`. Nó KHÔNG chạm được `control_plane`.
--
-- NOSUPERUSER, NOCREATEDB ghi tường minh thay vì dựa mặc định — quyền là thứ phải đọc
-- được, không phải đoán.
CREATE ROLE logto LOGIN PASSWORD :'logto_pw'
  NOSUPERUSER CREATEROLE NOCREATEDB;

-- Logto cần quyền tạo schema/bảng TRONG database của nó (nó tự chạy migration),
-- nên nó là OWNER của database này — nhưng chỉ database này.
CREATE DATABASE logto WITH OWNER logto;

GRANT CONNECT ON DATABASE logto TO logto;

-- CỐ Ý KHÔNG chạy `REVOKE CONNECT ON DATABASE logto FROM PUBLIC`.
--
-- Đã thử và nó làm Logto chết:
--   FATAL 42501: permission denied for database "logto"
--   detail: User does not have CONNECT privilege.
--
-- Nguyên nhân: Logto TỰ TẠO role động cho từng tenant lúc chạy. Role mới thừa hưởng
-- CONNECT qua pseudo-role PUBLIC; revoke PUBLIC là cắt luôn đường của chúng. Và không
-- thể grant trước cho những role chưa tồn tại và không biết tên.
--
-- (Đây là cùng một lớp bẫy với schema `public`: REVOKE ... FROM <role> không chạm grant
-- của PUBLIC, còn REVOKE FROM PUBLIC thì ảnh hưởng mọi role kể cả role sinh sau.)
--
-- Vì sao vẫn an toàn: CONNECT vào database KHÔNG đồng nghĩa đọc được dữ liệu — muốn đọc
-- vẫn cần quyền trên schema/table. Ranh giới thật giữa Logto và Talosmine là:
--   • Logto có database RIÊNG; `talosmine_runtime`/`talosmine_migration` không có quyền
--     trên bảng nào của nó.
--   • Role `logto` là NOSUPERUSER và không có quyền gì trong schema `control_plane`.
