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

  async function logout() {
    setPending(true);
    try {
      const response = await fetch('/auth/logout', {
        method: 'POST',
        headers: { 'x-csrf-token': readCsrfToken() ?? '' },
        credentials: 'same-origin',
        redirect: 'follow',
      });
      // BFF trả 303 về trang chủ; dùng URL cuối cùng để không hardcode đích ở hai nơi.
      window.location.href = response.url || '/';
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
