import styles from './legal-document.module.css';

/**
 * Khung trang văn bản pháp lý — dùng chung cho `/terms` và `/privacy`.
 *
 * THÂN VĂN BẢN đến từ khe `legal.*` (soạn trong `/admin/content/pages`), là CHỮ THUẦN:
 * render qua JSX nên không markup nào chạy được, và `white-space: pre-line` giữ nguyên cách
 * xuống dòng của người soạn — đoạn cách nhau bằng dòng trống hiện đúng như trong ô nhập.
 *
 * Chưa soạn nội dung thì hiện thông báo "đang cập nhật" thay vì trang trống — link từ form
 * đăng ký đã trỏ tới đây, và một trang trắng ngay chỗ người dùng tra cứu điều họ sắp cam
 * kết là tệ nhất có thể.
 */
export function LegalDocument({
  title,
  body,
  updatingNote,
}: {
  title: string;
  body: string | undefined;
  updatingNote: string;
}) {
  return (
    <section className="section">
      <div className="container">
        <div className="stack">
          <h1 className="typeH1">{title}</h1>

          {body !== undefined ? (
            <div className={`typeBody ${styles.body}`}>{body}</div>
          ) : (
            <p className="typeBody textSecondary">{updatingNote}</p>
          )}
        </div>
      </div>
    </section>
  );
}
