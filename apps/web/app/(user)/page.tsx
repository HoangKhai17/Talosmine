import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Talosmine — Trang chính',
};

/**
 * Shell rỗng, không phải demo. P1 cố ý không render catalog, plan, usage hay account
 * (phase-1 mục 5 và 10): dữ liệu giả ở đây sẽ che mất việc backend chưa có contract.
 */
export default function UserHomePage() {
  return (
    <div className="stack">
      <h1>Talosmine</h1>
      <p className="muted">Bản dựng nền tảng (P1).</p>
      <div className="notice">
        <p>
          Đây là khung ứng dụng. Các tính năng nghiệp vụ — danh mục ứng dụng, gói dịch vụ, hạn mức
          sử dụng và quản lý tài khoản — chưa được hiện thực.
        </p>
      </div>
    </div>
  );
}
