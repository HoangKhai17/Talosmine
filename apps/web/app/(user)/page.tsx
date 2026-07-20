import type { Metadata } from 'next';
import Link from 'next/link';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Talosmine — Trang chính',
};

/**
 * Trang chính — DEMO layout theo quy chuẩn UI (docs/frontend-css-rules.md).
 *
 * Nội dung cố ý chỉ mô tả những capability ĐÃ TỒN TẠI THẬT trong hệ thống. Không dựng
 * danh sách ứng dụng giả: danh sách app là dữ liệu của Catalog (chưa được implement), và
 * dữ liệu giả ở đây sẽ che mất việc backend chưa có contract.
 *
 * Chủ dự án sẽ thay layout này bằng thiết kế Figma. Vì mọi giá trị đều là token nên
 * việc thay layout không kéo theo viết lại hệ thống CSS.
 */
export default function UserHomePage() {
  return (
    <>
      <section className="section">
        <div className="container">
          <div className={styles.hero}>
            <span className={`typeCaption ${styles.tag}`}>Bản dựng nền tảng</span>
            <h1 className="typeHero">Một tài khoản cho mọi công cụ</h1>
            <p className="typeBodyLarge textSecondary">
              Talosmine là điểm truy cập tập trung: đăng nhập một lần, quản lý tài khoản và phiên
              làm việc ở một nơi, rồi mở các công cụ được cấp quyền.
            </p>
            <div className={styles.heroActions}>
              <Link className={`typeBody ${styles.buttonPrimary}`} href="/auth">
                Đăng nhập
              </Link>
              <Link className={`typeBody ${styles.buttonSecondary}`} href="/">
                Tìm hiểu thêm
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className={styles.sectionHeader}>
            <h2 className="typeH2">Nền tảng đã sẵn sàng</h2>
            <p className="typeBody textSecondary">
              Những phần dưới đây đã được xây và kiểm chứng. Các tính năng còn lại sẽ bổ sung theo
              từng giai đoạn.
            </p>
          </div>

          <ul className={styles.cardGrid}>
            <li className={styles.card}>
              <h3 className="typeCardTitle">Tài khoản tập trung</h3>
              <p className="typeBodySmall textSecondary">
                Mỗi người dùng có một hồ sơ duy nhất, liên kết an toàn với nhà cung cấp danh tính.
                Không ghép tài khoản theo địa chỉ thư điện tử.
              </p>
              <p className={`typeCaption textTertiary ${styles.cardMeta}`}>Đã hoàn thành</p>
            </li>

            <li className={styles.card}>
              <h3 className="typeCardTitle">Phiên làm việc</h3>
              <p className="typeBodySmall textSecondary">
                Xem các thiết bị đang đăng nhập và thu hồi bất kỳ phiên nào. Máy chủ chỉ lưu dấu vân
                của phiên, không lưu mã phiên.
              </p>
              <p className={`typeCaption textTertiary ${styles.cardMeta}`}>Đã hoàn thành</p>
            </li>

            <li className={styles.card}>
              <h3 className="typeCardTitle">Quản trị và nhật ký</h3>
              <p className="typeBodySmall textSecondary">
                Phân quyền theo vai trò, mặc định từ chối. Mọi thao tác quản trị đều cần lý do và
                được ghi lại để đối soát.
              </p>
              <p className={`typeCaption textTertiary ${styles.cardMeta}`}>Đã hoàn thành</p>
            </li>
          </ul>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className={styles.callout}>
            <h2 className="typeH3">Đang trong quá trình xây dựng</h2>
            <p className="typeBody textSecondary">
              Giao diện này là bản dựng để kiểm chứng hệ thống thiết kế. Bố cục sẽ được thay bằng
              thiết kế chính thức.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
