import type { ReactNode } from 'react';

/**
 * Layout cho khu vực xác thực.
 *
 * Các route thật nằm cạnh page này: `/auth/login` (bắt đầu OIDC), `/auth/callback`
 * (nhận code, đổi lấy phiên của Talosmine), `/auth/logout` (thu hồi phiên).
 * Xem `server/oidc.ts` để hiểu vì sao ta không dùng session của SDK IdP.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="container section">
      {children}
    </main>
  );
}
