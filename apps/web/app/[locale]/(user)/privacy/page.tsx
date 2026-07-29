import type { Metadata } from 'next';
import { localeAlternates, type PageLocaleParams } from '../../../../i18n/params';
import { resolvePageContent } from '../../../../server/site-content';
import { LegalDocument } from '../legal/legal-document';

export async function generateMetadata({ params }: PageLocaleParams): Promise<Metadata> {
  const { locale, t } = await resolvePageContent(params);
  return { title: t.meta.privacy, alternates: localeAlternates(locale, '/privacy') };
}

/** Chính sách riêng tư. Thân văn bản là khe `legal.privacy`, soạn trong `/admin/content/pages`. */
export default async function PrivacyPage({ params }: PageLocaleParams) {
  const { t, slots } = await resolvePageContent(params);

  return (
    <LegalDocument
      title={t.legal.privacyTitle}
      body={slots['legal.privacy']}
      updatingNote={t.legal.updating}
    />
  );
}
