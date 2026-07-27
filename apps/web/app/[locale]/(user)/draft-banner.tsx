import styles from './draft-banner.module.css';

/**
 * Dải thông báo "đây là bản dựng bố cục, dữ liệu là mẫu".
 *
 * Tách ra dùng chung vì mọi trang dựng theo wireframe đều cần nó, và một dòng chữ nói dối
 * (hoặc biến mất ở trang này mà còn ở trang kia) thì tệ hơn không có.
 *
 * XOÁ TOÀN BỘ component này khi danh mục thật đã nối — lúc đó tìm chỗ dùng bằng cách xoá
 * file và để trình biên dịch chỉ ra.
 */
export function DraftBanner({ children }: { children: string }) {
  return (
    <div className={styles.banner}>
      <p className="container typeBodySmall">{children}</p>
    </div>
  );
}
