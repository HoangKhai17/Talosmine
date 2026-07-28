import type { Metadata } from 'next';
import { localeAlternates, type PageLocaleParams } from '../../../../i18n/params';
import { resolvePageContent } from '../../../../server/site-content';
import { ComingSoon } from '../coming-soon';

export async function generateMetadata({ params }: PageLocaleParams): Promise<Metadata> {
  const { locale, t, slots } = await resolvePageContent(params);
  const description = slots['seo.description.submit'];
  return {
    title: t.meta.submit,
    ...(description !== undefined ? { description } : {}),
    alternates: localeAlternates(locale, '/submit'),
  };
}

export default async function SubmitPage({ params }: PageLocaleParams) {
  const { locale, t } = await resolvePageContent(params);

  return (
    <ComingSoon
      locale={locale}
      title={t.comingSoon.submitTitle}
      description={t.comingSoon.submitDescription}
    />
  );
}
