import Link from 'next/link';
import styles from './article-card.module.css';
import { ImageIcon } from './icons';

/**
 * Thẻ bài viết — dùng ở danh sách blog và ở khối "Bài viết liên quan" của trang chi tiết.
 *
 * KHÔNG tự khai số cột. Bề ngang đến từ ô lưới bọc ngoài (`<li>`), nên cùng một thẻ dùng
 * được cho cả nhịp xen kẽ 3/6 cột ở trang blog lẫn ba cột đều nhau ở trang chi tiết.
 * `height: 100%` để mọi thẻ trong một hàng cao bằng nhau.
 *
 * CÁCH ĐẶT LINK: chỉ TIÊU ĐỀ là link, rồi một lớp phủ trong suốt (`::after`) mở rộng vùng
 * bấm ra cả thẻ. Nhờ vậy trình đọc màn hình nghe đúng MỘT link mang tên bài viết, thay vì
 * nghe lặp cả ảnh, ngày đăng và tiêu đề như khi bọc `<Link>` quanh toàn bộ thẻ.
 */
export function ArticleCard({ href }: { href: string }) {
  return (
    <article className={styles.card}>
      <div className={styles.thumb}>
        <ImageIcon />
        <span className={`typeCaption ${styles.thumbTag}`}>Nhãn</span>
      </div>

      <div className={styles.body}>
        <p className={`typeCaption ${styles.meta}`}>
          {/* `<time>` mang giá trị máy đọc được — ngày hiển thị cho người, `dateTime` cho
              trình duyệt và công cụ tìm kiếm. */}
          <time dateTime="2026-05-15">15/05/2026</time>
          <span>30 phút đọc</span>
        </p>

        <h3 className="typeCardTitle">
          <Link className={styles.titleLink} href={href}>
            Tiêu đề bài viết sẽ hiển thị ở đây khi có nội dung thật
          </Link>
        </h3>

        <p className="typeBodySmall textSecondary">
          Đoạn mở đầu của bài viết. Nội dung này đến từ hệ thống blog, sẽ được kết nối ở giai đoạn
          sau.
        </p>
      </div>
    </article>
  );
}
