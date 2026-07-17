-- ĐÃ SỬA so với bản gốc của Supabase (v1.26.07 docker/volumes/db/roles.sql).
--
-- Bản gốc có thêm một dòng:
--     ALTER USER supabase_functions_admin WITH PASSWORD :'pgpass';
--
-- Role `supabase_functions_admin` do `webhooks.sql` tạo, mà file đó chỉ được mount
-- khi service `functions` (Edge Functions) tồn tại. DEC-T10 loại `functions`, nên
-- role đó không bao giờ được tạo, và `ALTER USER` trên role không tồn tại là lỗi.
--
-- Vì migrate.sh chạy với `ON_ERROR_STOP=1`, lỗi đó giết cả script: init-scripts dừng
-- giữa chừng và toàn bộ `migrations/` (gồm _supabase.sql, pooler.sql và role Talosmine)
-- KHÔNG BAO GIỜ chạy. Container vẫn báo `healthy` nên hỏng hóc này hoàn toàn im lặng —
-- triệu chứng duy nhất là Supavisor không khởi động được vì thiếu database `_supabase`.
--
-- Bài học cho các lần cắt service sau: init script của Supabase phụ thuộc chéo nhau.
-- Bỏ một service thì phải rà cả các file SQL còn lại có tham chiếu tới nó không.

\set pgpass `echo "$POSTGRES_PASSWORD"`

ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER pgbouncer WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_storage_admin WITH PASSWORD :'pgpass';
