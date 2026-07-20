import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { decideAdminAccess } from '../../server/admin-authorization';
import styles from '../(user)/layout.module.css';

/**
 * Lớp chặn admin thứ hai, chạy phía server trong React Server Component.
 *
 * Vì sao có hai lớp: `proxy.ts` trả 403 trước khi route render và là câu trả lời mà client
 * nhìn thấy. Nhưng proxy là một lớp có thể bị bỏ qua nếu cấu hình matcher sai hoặc runtime
 * có lỗi — nên authorization không được chỉ dựa vào nó. Guard này là hợp đồng cuối cùng:
 * mọi thứ dưới `/admin` render qua đây, và ở P1 không nhánh nào dẫn tới render được.
 *
 * `notFound()` chạy trên server và trả 404 thật, không phải redirect phía client.
 * Nó cũng không xác nhận sự tồn tại của khu vực admin cho người không có quyền.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const decision = decideAdminAccess();
  if (!decision.allowed) {
    notFound();
  }

  return (
    <>
      <header className={styles.header}>
        <div className={`container ${styles.bar}`}>
          <p className="typeCardTitle">Talosmine — Quản trị</p>
        </div>
      </header>
      <main id="main" className="container section">
        {children}
      </main>
    </>
  );
}
