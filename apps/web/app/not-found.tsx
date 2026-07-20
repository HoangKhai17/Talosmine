import Link from 'next/link';

export default function NotFound() {
  return (
    <main id="main" className="container section">
      <div className="stack">
        <h1>Không tìm thấy trang</h1>
        <p>Địa chỉ bạn mở không tồn tại hoặc không khả dụng.</p>
        <p>
          <Link href="/">Về trang chính</Link>
        </p>
      </div>
    </main>
  );
}
