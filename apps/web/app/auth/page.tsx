import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Talosmine — Tài khoản',
};

export default function AuthPlaceholderPage() {
  return (
    <div className="stack">
      <h1>Tài khoản</h1>
      <div className="notice">
        <p>
          Đăng nhập chưa được hiện thực. Đây là chỗ dành sẵn cho luồng xác thực ở giai đoạn sau.
        </p>
      </div>
      <p>
        <Link href="/">Về trang chính</Link>
      </p>
    </div>
  );
}
