/**
 * Icon dùng chung cho các trang công khai.
 *
 * SVG viết thẳng tại chỗ thay vì cài thư viện: chỉ cần vài hình, và mọi thư viện icon đều
 * nằm ngoài bảng D của decision register.
 *
 * Tất cả dùng `currentColor` để ăn theo màu chữ của phần tử cha — đổi token màu là icon
 * đổi theo, không phải sửa file này.
 *
 * Mọi icon nhận `className` để chỗ dùng tự lo kích cỡ/màu qua CSS Module, và mang
 * `aria-hidden` vì chúng luôn đi kèm chữ; icon đứng một mình phải có nhãn riêng ở nút bọc
 * ngoài (xem nút chuyển dải danh mục ở `/tools`).
 */

type IconProps = { className?: string | undefined };

export function SearchIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

/** Chỗ giữ chỗ cho ảnh chưa có. Thay bằng <img> thật khi danh mục được nối. */
export function ImageIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="m4 17 5-5 4 4 3-2 4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Mũi tên chỉ xuống. Xoay bằng CSS (`transform`) ở chỗ dùng, không bằng inline style —
 * inline style vi phạm CSP `style-src` và sẽ không có tác dụng trên production.
 */
/**
 * Ba gạch ngang — nút mở menu ở mobile.
 *
 * `aria-hidden` vì nút bọc ngoài đã mang nhãn văn bản; nếu icon cũng được đọc thì trình đọc
 * màn hình loan báo hai lần cho một điều khiển.
 */
export function MenuIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

/** Dấu X — cùng nút, trạng thái đang mở. */
export function CloseIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function ChevronIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Ngôi nhà — thay chữ "Trang chủ" trên menu chính.
 *
 * Icon này ĐỨNG MỘT MÌNH, khác mọi icon trên trong file: nó không đi kèm chữ. Vì vậy nhãn
 * cho trình đọc màn hình phải nằm ở thẻ `<a>` bọc ngoài (`aria-label`), lấy từ chính nhãn
 * mà người biên tập đặt trong CMS — xem `header-nav.tsx`. Bỏ `aria-hidden` ở đây thì trình
 * đọc màn hình sẽ đọc hai lần.
 */
export function HomeIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M3 10.5 12 3l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 9.5V20h13V9.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.75 20v-5.5h4.5V20" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
