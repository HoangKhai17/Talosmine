import type { Metadata } from 'next';
import Link from 'next/link';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Talosmine — Kiểm tra hộp thư',
};

/**
 * Màn hình "đã gửi thư xác minh" — theo wireframe Figma của chủ dự án.
 *
 * KHÁC hai trang kia: không có cột giới thiệu. Đây là màn hình một việc duy nhất — người
 * dùng vừa đăng ký xong và chỉ cần biết phải làm gì tiếp. Thêm nội dung quảng bá vào đây
 * là kéo họ ra khỏi việc đó.
 *
 * ⚠ TRẠNG THÁI NÀY HỆ THỐNG CHƯA TẠO RA ĐƯỢC. Logto chưa cấu hình SMTP nên chưa gửi được
 * thư xác minh nào — đó chính là lý do luồng khôi phục đã bị dời lại (DEC-B14). Trang dựng
 * trước, hạ tầng theo sau.
 *
 * ĐỊA CHỈ THƯ LÀ CHỮ CỐ ĐỊNH, KHÔNG ĐỌC TỪ QUERY STRING — và điều đó là có chủ đích.
 *
 * Cách làm dễ nhất là `?email=...` rồi in ra. Nhưng khi đó bất kỳ ai cũng dựng được đường
 * dẫn `/auth/check-email?email=nan-nhan@ngan-hang.com`, và trang của CHÚNG TA sẽ khẳng định
 * đã gửi thư tới địa chỉ đó. Đó là một trang lừa đảo có sẵn, ký tên bằng tên miền thật của
 * mình. Khi nối luồng thật, địa chỉ phải đến từ kết quả đăng ký phía SERVER (phiên hoặc
 * cookie một lần), không bao giờ từ URL.
 */
export default function CheckEmailPage() {
  return (
    <div className={styles.page}>
      <header className={styles.topBar}>
        <Link className={`typeCardTitle ${styles.brand}`} href="/">
          Talosmine
        </Link>
        <Link className={`typeBodySmall ${styles.backLink}`} href="/">
          Về trang chủ
        </Link>
      </header>

      {/* `<div>` chứ không phải `<main>`: layout của khu vực xác thực đã có `<main id="main">`
          bọc ngoài. Lồng hai `<main>` là HTML sai và làm hỏng landmark cho trình đọc màn
          hình — có test đếm số `<main>` để bắt đúng chuyện này. */}
      <div className={styles.content}>
        <EnvelopeIcon />

        <h1 className={`typeH2 ${styles.heading}`}>Kiểm tra hộp thư của bạn</h1>

        <p className={`typeBodySmall textSecondary ${styles.sentTo}`}>
          Chúng tôi đã gửi một liên kết xác minh tới{' '}
          <span className={styles.email}>địa chỉ thư bạn vừa đăng ký</span>
        </p>

        <p className={`typeBodySmall textTertiary ${styles.instruction}`}>
          Bấm vào liên kết trong thư để kích hoạt tài khoản và bắt đầu khám phá.
        </p>

        {/*
          "Mở ứng dụng thư" chưa nối, và nó không đơn giản như trông thấy: muốn mở đúng hộp
          thư thì phải đoán nhà cung cấp từ tên miền của địa chỉ — mà đoán sai sẽ đưa người
          dùng tới một trang đăng nhập của dịch vụ họ không dùng. Để `disabled` cho tới khi
          có luồng thật, thay vì bấm vào rồi không xảy ra gì.
        */}
        <button type="button" className={`typeBody ${styles.primaryButton}`} disabled>
          Mở ứng dụng thư
        </button>

        <p className={`typeBodySmall ${styles.resendRow}`}>
          <span className="textTertiary">Không nhận được thư?</span>{' '}
          <span className={styles.resendPending}>Gửi lại</span>
        </p>

        <p className={`typeCaption ${styles.draftNote}`} role="note">
          Bản dựng bố cục — hệ thống chưa cấu hình gửi thư, nên chưa có thư nào được gửi đi.
        </p>
      </div>
    </div>
  );
}

/**
 * Phong bì có ba vạch chuyển động bên trái — theo thiết kế.
 *
 * `fill="currentColor"` để icon ăn theo màu chữ; đổi token màu là icon đổi theo.
 */
function EnvelopeIcon() {
  return (
    <svg
      className={styles.icon}
      width="120"
      height="88"
      viewBox="0 0 120 88"
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="0" y="18" width="26" height="11" rx="5.5" />
      <rect x="4" y="39" width="22" height="11" rx="5.5" />
      <rect x="0" y="60" width="26" height="11" rx="5.5" />
      <path d="M38 8h78a4 4 0 0 1 4 4v64a4 4 0 0 1-4 4H38a4 4 0 0 1-4-4V12a4 4 0 0 1 4-4Zm39 41.5L38.6 14.3A2 2 0 0 0 38 14v3l36.7 30.4a2 2 0 0 0 2.6 0L116 17v-3a2 2 0 0 0-.6.3L77 49.5Z" />
    </svg>
  );
}
