import type { Metadata } from 'next';
import { localeHref } from '../../../../../i18n/locale';
import {
  localeAlternates,
  type PageLocaleParams,
  resolvePageI18n,
} from '../../../../../i18n/params';
import { SessionsView } from './sessions-view';

export async function generateMetadata({ params }: PageLocaleParams): Promise<Metadata> {
  const { locale, t } = await resolvePageI18n(params);
  return { title: t.meta.sessions, alternates: localeAlternates(locale, '/account/sessions') };
}

/** Vỏ SERVER — xem ghi chú ở `../page.tsx`. */
export default async function SessionsPage({ params }: PageLocaleParams) {
  const { locale, t } = await resolvePageI18n(params);

  const sessionsPath = localeHref(locale, '/account/sessions');

  return (
    <SessionsView
      t={t.sessions}
      common={t.common}
      actionsLabel={t.a11y.actions}
      accountHref={localeHref(locale, '/account')}
      signInHref={`/auth?returnTo=${encodeURIComponent(sessionsPath)}`}
      signInPlainHref="/auth"
    />
  );
}
