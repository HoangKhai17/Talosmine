import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { BRAND_NAME } from '../../lib/brand';
import { decideAdminAccess } from '../../server/admin-authorization';
import { callControlPlane } from '../../server/control-plane-boundary';
import { AdminNav } from './admin-nav';
import styles from './layout.module.css';

/**
 * Shell khu quản trị.
 *
 * Đây là lớp chặn admin thứ hai, chạy phía server trong React Server Component.
 *
 * Vì sao có hai lớp: `proxy.ts` chặn trước khi route render và là câu trả lời client nhìn
 * thấy. Nhưng proxy có thể bị bỏ qua nếu matcher cấu hình sai — nên authorization không
 * được chỉ dựa vào nó. Guard này là hợp đồng cuối cùng ở tầng frontend: mọi thứ dưới
 * `/admin` render qua đây.
 *
 * `notFound()` chạy trên server và trả 404 thật. Nó cũng không xác nhận sự tồn tại của
 * khu vực quản trị cho người không có quyền.
 *
 * Lớp thứ ba và là lớp quyết định: `AdminPermissionGuard` ở Control Plane. Kể cả khi hai
 * lớp trên thủng, không dữ liệu nào rời khỏi server mà thiếu permission.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('__Host-talos_session')?.value;

  const decision = await decideAdminAccess(sessionToken);
  if (!decision.allowed) {
    notFound();
  }

  const who = await readIdentityLabel(sessionToken);

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.bar}>
          <div className={styles.brandGroup}>
            <Link className={`typeCardTitle ${styles.brand}`} href="/admin">
              {BRAND_NAME}
            </Link>
            <span className={`typeCaption ${styles.badge}`}>Quản trị</span>
          </div>

          <div className={styles.identity}>
            {/*
              Hiện danh tính người đang thao tác. Không phải trang trí: mọi hành động ở
              đây đều ghi audit dưới tên tài khoản này, nên người vận hành cần thấy rõ
              mình đang là ai — nhất là khi có nhiều tài khoản trên cùng máy.
            */}
            {who ? (
              <span className={`typeBodySmall ${styles.who}`} title={who}>
                {who}
              </span>
            ) : null}
            <Link className={`typeBodySmall ${styles.exitLink}`} href="/">
              Thoát khu quản trị
            </Link>
          </div>
        </div>
      </header>

      <div className={styles.body}>
        <aside className={styles.sidebar}>
          <AdminNav permissions={decision.permissions} />
        </aside>

        <main id="main" className={styles.content}>
          {children}
        </main>
      </div>
    </div>
  );
}

/**
 * Nhãn nhận dạng người đang đăng nhập: tên hiển thị, hoặc email, hoặc không gì cả.
 *
 * Lỗi ở đây KHÔNG được làm sập khu quản trị — nó chỉ là nhãn hiển thị. Quyền truy cập đã
 * được quyết định ở trên bằng `decideAdminAccess`.
 */
async function readIdentityLabel(sessionToken: string | undefined): Promise<string | null> {
  if (!sessionToken) return null;

  try {
    const response = await callControlPlane({
      method: 'GET',
      path: '/v1/me/account',
      sessionToken,
    });
    if (!response.ok) return null;

    const account = (await response.json()) as { displayName?: unknown; email?: unknown };
    if (typeof account.displayName === 'string' && account.displayName !== '') {
      return account.displayName;
    }
    if (typeof account.email === 'string' && account.email !== '') return account.email;
    return null;
  } catch {
    return null;
  }
}
