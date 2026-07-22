import type { ReactNode } from 'react';

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
