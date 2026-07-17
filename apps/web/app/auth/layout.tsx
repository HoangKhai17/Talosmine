import type { ReactNode } from 'react';

/**
 * Boundary placeholder cho P2.
 *
 * `@auth0/nextjs-auth0` đã là dependency (DEC-T08) nhưng CỐ Ý chưa được import ở đâu:
 * DEC-B03 (tenant/issuer/audience) còn `open`, nên P1 không wiring Auth0 thật và không
 * dùng credential mẫu. Không có route `/auth/login`, `/auth/callback`, `/auth/logout` —
 * tạo chúng bây giờ sẽ là tuyên bố login hoạt động trong khi nó không hoạt động.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="shell-main">
      {children}
    </main>
  );
}
