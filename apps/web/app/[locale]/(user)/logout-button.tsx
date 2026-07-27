'use client';

import { useState } from 'react';

/**
 * Nút đăng xuất.
 *
 * Là FORM POST chứ không phải link: một request GET có thể bị kích hoạt bằng thẻ `<img>`
 * trên trang khác, biến thành đăng xuất cưỡng bức.
 *
 * Gửi kèm CSRF token từ cookie — cùng cơ chế double-submit như mọi mutation khác. Không
 * dùng `<form action>` thuần vì form HTML không đặt được header tùy ý, mà chính việc
 * "đặt được header" là thứ chứng minh request đến từ trang của ta.
 */
/**
 * Nhãn TRUYỀN TỪ SERVER xuống, không tự đọc catalog.
 *
 * Đây là Client Component: nếu nó `import` message catalog thì cả hai bản dịch sẽ nằm trong
 * bundle gửi về trình duyệt, và bundle đó lớn dần theo số ngôn ngữ. Server đã biết locale
 * rồi, nên nó gửi xuống đúng ba chuỗi cần dùng.
 */
export function LogoutButton({
  className,
  labels,
}: {
  className?: string;
  labels: { signOut: string; signingOut: string; failed: string };
}) {
  const [pending, setPending] = useState(false);

  /**
   * Hai chặng, và chặng hai BẮT BUỘC là điều hướng cấp cao nhất chứ không phải `fetch`.
   *
   *   1. `POST /auth/logout` — thu hồi phiên Talosmine, xoá cookie, trả về `next`.
   *   2. `window.location` tới `next` (trang kết thúc phiên của IdP).
   *
   * Vì sao không để `fetch` tự đi theo redirect sang IdP: đó là request xuyên origin, vừa
   * dính `connect-src 'self'` vừa vô ích — `fetch` không chạy JavaScript, mà trang của IdP
   * tự submit form bằng JavaScript rồi mới quay về đây.
   */
  async function logout() {
    setPending(true);
    try {
      const response = await fetch('/auth/logout', {
        method: 'POST',
        headers: { 'x-csrf-token': readCsrfToken() ?? '' },
        credentials: 'same-origin',
      });

      if (!response.ok) throw new Error(`logout failed: ${response.status}`);

      const body = (await response.json()) as { next?: unknown };
      // Phiên Talosmine đã bị thu hồi ở bước 1 rồi, nên kể cả khi `next` hỏng thì về trang
      // chủ vẫn là trạng thái đúng — chỉ là phiên IdP còn sống.
      window.location.href = typeof body.next === 'string' ? body.next : '/';
    } catch {
      setPending(false);
      window.alert(labels.failed);
    }
  }

  return (
    <button type="button" className={className} onClick={() => void logout()} disabled={pending}>
      {pending ? labels.signingOut : labels.signOut}
    </button>
  );
}

function readCsrfToken(): string | undefined {
  for (const part of document.cookie.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === '__Host-talos_csrf') {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
}
