import type { Metadata } from 'next';
import {
  localeAlternates,
  type PageLocaleParams,
  resolvePageI18n,
} from '../../../../../i18n/params';
import styles from '../shared.module.css';
import { PasswordForm } from './password-form';

export async function generateMetadata({ params }: PageLocaleParams): Promise<Metadata> {
  const { locale, t } = await resolvePageI18n(params);
  return {
    title: t.security.title,
    alternates: localeAlternates(locale, '/account/security'),
    // Màn hình riêng tư của một tài khoản cụ thể — không có gì để index.
    robots: { index: false, follow: false },
  };
}

/** Vỏ SERVER; phần tương tác nằm ở `password-form.tsx`. Xem ghi chú dài ở file đó. */
export default async function SecurityPage({ params }: PageLocaleParams) {
  const { t } = await resolvePageI18n(params);

  return (
    <div>
      <div className={styles.header}>
        <h1 className="typeH2">{t.security.title}</h1>
        <p className={`typeBody ${styles.lead}`}>{t.security.lead}</p>
      </div>

      <PasswordForm labels={t.security} />
    </div>
  );
}
