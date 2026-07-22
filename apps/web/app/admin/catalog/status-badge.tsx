import styles from './page.module.css';

/**
 * Nhãn trạng thái của ứng dụng và tính năng.
 *
 * KHÔNG dùng màu làm tín hiệu duy nhất: bảng màu của dự án chưa có token trạng thái, và màu
 * đơn độc thì người mù màu không đọc được. Chữ tiếng Việt đã nói đủ.
 *
 * Để ở file riêng thay vì export từ `page.tsx`: hai trang cùng dùng, và một `page.tsx` đi
 * import từ một `page.tsx` khác là kiểu phụ thuộc rất dễ thành vòng tròn về sau.
 */
export function StatusBadge({ status }: { status: string }) {
  const label =
    status === 'active'
      ? 'Đang hoạt động'
      : status === 'inactive'
        ? 'Đã tắt'
        : status === 'draft'
          ? 'Nháp'
          : status;

  return <span className={`typeCaption ${styles.badge}`}>{label}</span>;
}
