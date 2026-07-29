# Rollback migration — mọi thứ sau P2

## Đây là gì

Tám file `.down.sql` gỡ đúng những gì migration `0007`–`0014` đã tạo, **theo thứ tự ngược**.

Yêu cầu gốc đến từ [phase-3 §8 và §17](../../../../docs/build-plan/phase-3-application-catalog.md):
rollback phải bỏ khoá ngoại service của audit và **phục hồi ràng buộc actor của P2 trước**,
rồi mới bỏ bảng service identity và các bảng catalog.

## Thứ tự bắt buộc

```
0014_legal_slots.down.sql           ← xoá khe pháp lý, thu hẹp CHECK về bộ 41
0013_content_slots.down.sql         ← bỏ bảng khe nội dung (web quay về chữ trong code)
0012_survey.down.sql                ← thu hẹp permission survey, rồi bỏ 6 bảng khảo sát
0011_site_settings.down.sql        ← bỏ bảng cài đặt site
0010_site_nav.down.sql              ← thu hẹp permission content, rồi bỏ 3 bảng nav
0009_catalog_permissions.down.sql   ← thu hẹp permission catalog
0008_service_identities.down.sql    ← bỏ FK + phục hồi actor check P2, rồi bỏ bảng
0007_catalog.down.sql               ← bỏ 4 bảng catalog
```

Thứ tự này được mã hoá ở `ROLLBACK_ORDER` trong `tests/support/postgres.ts`. **Thêm migration
mới thì thêm vào đầu danh sách đó** — bỏ sót không làm test đỏ ngay, nhưng bài diễn tập sẽ
lặng lẽ ngừng kiểm file `.down.sql` mới, và đó chính là cách chúng mục nát.

Chạy sai thứ tự sẽ hỏng: bỏ `service_identities` trước khi bỏ khoá ngoại trỏ tới nó thì
PostgreSQL từ chối, và bỏ `applications` trước `service_identities` cũng vậy. Đó là điều
tốt — database không cho phép ta tự bắn vào chân mình ở đây.

## KHI NÀO ĐƯỢC DÙNG

**Chỉ khi chưa có dữ liệu thật.** Cụ thể: trước khi phát hành, hoặc trên môi trường thử.

Sau khi đã có ứng dụng thật trong danh mục, **không dùng những file này**. Lý do:

- `DROP TABLE applications` xoá vĩnh viễn mọi ứng dụng đã đăng ký.
- `audit_events` có thể đã chứa dòng với `actor_type = 'service'`. Phục hồi ràng buộc actor
  của P2 sẽ **thất bại** vì dữ liệu hiện có vi phạm nó — và đó đúng là điều nên xảy ra. Nhật
  ký kiểm toán không được sửa để chiều một lần rollback.

Sau khi có dữ liệu, cách đúng là **forward fix**: viết migration mới đi tới, và vô hiệu hoá
tài nguyên bằng `status` thay vì xoá.

## Vì sao không đưa vào `meta/_journal.json`

Drizzle chỉ chạy migration đi tới. Các file này KHÔNG nằm trong journal và sẽ không bao giờ
tự chạy — chúng được gọi thủ công, hoặc bởi bài diễn tập tự động ở
`tests/integration/migration-rollback.test.ts`.

Bài diễn tập đó là lý do những file này không mục nát: mỗi lần CI chạy, nó dựng schema đầy
đủ rồi gỡ ngược lại và kiểm chứng schema quay về đúng trạng thái P2.
