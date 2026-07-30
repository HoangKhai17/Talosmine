import type { Metadata } from 'next';
import { localeHref } from '../../../../../i18n/locale';
import {
  localeAlternates,
  type PageLocaleParams,
  resolvePageI18n,
} from '../../../../../i18n/params';
import { SurveyAnswersView } from './survey-answers-view';

export async function generateMetadata({ params }: PageLocaleParams): Promise<Metadata> {
  const { locale, t } = await resolvePageI18n(params);
  return {
    title: t.meta.surveyAnswers,
    alternates: localeAlternates(locale, '/account/survey'),
  };
}

/** Vỏ SERVER — xem ghi chú ở `../page.tsx`. */
export default async function SurveyAnswersPage({ params }: PageLocaleParams) {
  const { locale, t } = await resolvePageI18n(params);

  const surveyPath = localeHref(locale, '/account/survey');

  return (
    <SurveyAnswersView
      t={t.surveyAnswers}
      common={t.common}
      locale={locale}
      accountHref={localeHref(locale, '/account')}
      signInHref={`/auth?returnTo=${encodeURIComponent(surveyPath)}`}
    />
  );
}
