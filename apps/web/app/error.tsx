'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_LOCALE, isLocale, type Locale } from '../i18n/locale';
import { getMessages } from '../i18n/messages';

/**
 * Error boundary foundation.
 *
 * Không render `error.message` ra UI: message có thể chứa chi tiết nội bộ. Chỉ hiện
 * `error.digest` — Next sinh sẵn để đối chiếu với log phía server.
 * `role="alert"` để screen reader thông báo lỗi ngay, không cần người dùng đi tìm.
 *
 * LOCALE ĐỌC TỪ `<html lang>` SAU KHI MOUNT, không phải từ header.
 *
 * Đây là Client Component và là file GỐC, nên nó không có `params` lẫn `headers()`. Root
 * layout đã đặt `lang` đúng cho mọi request, nên thuộc tính đó là nguồn locale duy nhất
 * client đọc được mà không cần thêm cơ chế nào.
 *
 * Đánh đổi đã biết: lần vẽ đầu tiên dùng locale mặc định rồi mới đổi sau khi mount. Chấp
 * nhận được vì đây là trang lỗi. Đọc trong `useEffect` chứ không trong khởi tạo state để
 * server render và client render khớp nhau — lệch nhau sẽ thành hydration error, tức là một
 * lỗi nữa chồng lên trang đang báo lỗi.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const lang = document.documentElement.lang;
    if (isLocale(lang)) setLocale(lang);
  }, []);

  useEffect(() => {
    // Log phía client chỉ giữ digest; không log token/PII.
    console.error('Unhandled error rendering route', error.digest);
  }, [error.digest]);

  const t = getMessages(locale);

  return (
    <main id="main" className="container section">
      <div className="stack" role="alert">
        <h1>{t.system.errorTitle}</h1>
        <p>{t.system.errorBody}</p>
        {error.digest !== undefined ? (
          <p className="typeBody textSecondary">
            {t.system.errorReference} <code>{error.digest}</code>
          </p>
        ) : null}
        <p>
          <button type="button" className="typeBody" onClick={reset}>
            {t.common.retry}
          </button>
        </p>
      </div>
    </main>
  );
}
