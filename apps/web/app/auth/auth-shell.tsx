import type { ReactNode } from 'react';
import styles from './auth-shell.module.css';

/** Khung một cột cho trạng thái lỗi OIDC tại `/auth`. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <div className={styles.formPanel}>
        <div className={styles.formArea}>{children}</div>
      </div>
    </div>
  );
}
