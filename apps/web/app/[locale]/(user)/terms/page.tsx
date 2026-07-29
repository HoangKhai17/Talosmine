import type { Metadata } from 'next';
import { localeAlternates, type PageLocaleParams } from '../../../../i18n/params';
import { resolvePageContent } from '../../../../server/site-content';
import { LegalDocument } from '../legal/legal-document';

export async function generateMetadata({ params }: PageLocaleParams): Promise<Metadata> {
  const { locale, t } = await resolvePageContent(params);
  return { title: t.meta.terms, alternates: localeAlternates(locale, '/terms') };
}

/** Điều khoản dịch vụ. Thân văn bản là khe `legal.terms`, soạn trong `/admin/content/pages`. */
export default async function TermsPage({ params }: PageLocaleParams) {
  const { t, slots } = await resolvePageContent(params);

  return (
    <LegalDocument
      title={t.legal.termsTitle}
      body={slots['legal.terms']}
      updatingNote={t.legal.updating}
    />
  );
}
