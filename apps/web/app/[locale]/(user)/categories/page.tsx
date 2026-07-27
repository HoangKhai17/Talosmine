import type { Metadata } from 'next';
import { localeAlternates, type PageLocaleParams, resolvePageI18n } from '../../../../i18n/params';
import { ComingSoon } from '../coming-soon';

export async function generateMetadata({ params }: PageLocaleParams): Promise<Metadata> {
  const { locale, t } = await resolvePageI18n(params);
  return { title: t.meta.categories, alternates: localeAlternates(locale, '/categories') };
}

export default async function CategoriesPage({ params }: PageLocaleParams) {
  const { locale, t } = await resolvePageI18n(params);

  return (
    <ComingSoon
      locale={locale}
      title={t.comingSoon.categoriesTitle}
      description={t.comingSoon.categoriesDescription}
    />
  );
}
