import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Talosmine — Đăng nhập',
};

/**
 * Trang bắt đầu đăng nhập.
 *
 * Nút là thẻ `<a>` thường chứ KHÔNG phải `<Link>` của Next: `/auth/login` là route
 * handler trả redirect 307 sang IdP, không phải trang React. Client-side navigation của
 * Next sẽ cố fetch nó như một payload RSC và không đi tới đâu.
 */
export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; returnTo?: string }>;
}) {
  const { error, returnTo } = await searchParams;

  const loginHref = returnTo
    ? `/auth/login?returnTo=${encodeURIComponent(returnTo)}`
    : '/auth/login';

  return (
    <div className="stack">
      <h1>Đăng nhập</h1>

      {error ? (
        <div className="notice" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      <p className="typeBody">
        Bạn sẽ được chuyển sang trang đăng nhập an toàn, rồi quay lại đây sau khi xác thực xong.
      </p>

      <p>
        <a className="typeBody" href={loginHref}>
          Tiếp tục đăng nhập
        </a>
      </p>

      <p>
        <Link href="/">Về trang chính</Link>
      </p>
    </div>
  );
}
