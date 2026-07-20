'use client';

import { useEffect } from 'react';

/**
 * Error boundary foundation.
 *
 * Không render `error.message` ra UI: message có thể chứa chi tiết nội bộ. Chỉ hiện
 * `error.digest` — Next sinh sẵn để đối chiếu với log phía server.
 * `role="alert"` để screen reader thông báo lỗi ngay, không cần người dùng đi tìm.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log phía client chỉ giữ digest; không log token/PII.
    console.error('Unhandled error rendering route', error.digest);
  }, [error.digest]);

  return (
    <main id="main" className="container section">
      <div className="stack" role="alert">
        <h1>Đã xảy ra lỗi</h1>
        <p>Không hiển thị được nội dung này. Bạn có thể thử lại.</p>
        {error.digest !== undefined ? (
          <p className="typeBody textSecondary">
            Mã tham chiếu: <code>{error.digest}</code>
          </p>
        ) : null}
        <p>
          <button type="button" className="typeBody" onClick={reset}>
            Thử lại
          </button>
        </p>
      </div>
    </main>
  );
}
