import type { Metadata } from 'next';
import { localeHref } from '../../../../i18n/locale';
import { localeAlternates, type PageLocaleParams, resolvePageI18n } from '../../../../i18n/params';
import { AccountView } from './account-view';

export async function generateMetadata({ params }: PageLocaleParams): Promise<Metadata> {
  const { locale, t } = await resolvePageI18n(params);
  return { title: t.meta.account, alternates: localeAlternates(locale, '/account') };
}

/**
 * Vỏ SERVER của trang tài khoản.
 *
 * Phần tương tác nằm ở `account-view.tsx` (client). Tách hai lớp vì client component không
 * đọc được `params` theo kiểu `async`, và cũng không nên `import` message catalog — làm vậy
 * sẽ nhét cả hai bản dịch vào bundle trình duyệt.
 *
 * Các href dựng SẴN ở đây: chúng phụ thuộc locale, và dựng ở server thì client không cần
 * biết gì về quy tắc định tuyến theo ngôn ngữ.
 */
export default async function AccountPage({ params }: PageLocaleParams) {
  const { locale, t } = await resolvePageI18n(params);

  const accountPath = localeHref(locale, '/account');

  return (
    <AccountView
      t={t.account}
      profile={t.profilePage}
      common={t.common}
      sessionsHref={localeHref(locale, '/account/sessions')}
      surveyHref={localeHref(locale, '/account/survey')}
      // `/auth` nằm ngoài vùng locale; `returnTo` thì phải mang locale để sau khi đăng nhập
      // người dùng quay lại đúng ngôn ngữ họ đang xem.
      signInHref={`/auth?returnTo=${encodeURIComponent(accountPath)}`}
    />
  );
}
