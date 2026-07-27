import type { Metadata } from 'next';
import { localeAlternates, type PageLocaleParams, resolvePageI18n } from '../../../../i18n/params';
import { ComingSoon } from '../coming-soon';

export async function generateMetadata({ params }: PageLocaleParams): Promise<Metadata> {
  const { locale, t } = await resolvePageI18n(params);
  return { title: t.meta.contact, alternates: localeAlternates(locale, '/contact') };
}

export default async function ContactPage({ params }: PageLocaleParams) {
  const { locale, t } = await resolvePageI18n(params);

  return (
    <ComingSoon
      locale={locale}
      title={t.comingSoon.contactTitle}
      description={t.comingSoon.contactDescription}
    />
  );
}
