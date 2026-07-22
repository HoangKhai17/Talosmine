import type { ReactNode } from 'react';

/**
 * MỌI trang dưới `/auth` phải render ĐỘNG. Đây không phải tối ưu, đây là điều kiện đúng/sai.
 *
 * `proxy.ts` sinh một nonce MỚI cho mỗi request rồi đặt vào `script-src` của CSP. Một trang
 * được prerender lúc build sẽ mang nonce của lúc build trong HTML — nonce đó không bao giờ
 * khớp nonce trong header của request, nên trình duyệt chặn TOÀN BỘ script của trang. Trang
 * vẫn hiện ra và trông bình thường, chỉ là không có React: không nút nào bấm được.
 *
 * Chuyện này đã xảy ra thật ngay khi thêm `/auth/sign-up` và `/auth/check-email` — hai trang
 * không đọc dữ liệu động nào nên Next prerender tĩnh, và cả hai đỏ ở test CSP với hơn 18 vi
 * phạm mỗi trang.
 *
 * Các trang khác của site không dính vì layout `(user)` đọc cookie nên đã động sẵn. Khu vực
 * này thì không, nên phải khai rõ. Đặt ở LAYOUT chứ không phải từng trang: nó áp cho cả
 * nhánh, nên trang mới thêm vào sau cũng an toàn.
 */
export const dynamic = 'force-dynamic';

/**
 * Layout cho khu vực xác thực.
 *
 * Các route thật nằm cạnh page này: `/auth/login` (bắt đầu OIDC), `/auth/callback`
 * (nhận code, đổi lấy phiên của Talosmine), `/auth/logout` (thu hồi phiên).
 * Xem `server/oidc.ts` để hiểu vì sao ta không dùng session của SDK IdP.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  // KHÔNG bọc `container section`: trang đăng nhập là bố cục TRÀN VIỀN hai cột, nền của cột
  // trái phải chạy sát mép màn hình. Trang tự lo bề ngang và khoảng đệm của nó.
  return <main id="main">{children}</main>;
}
