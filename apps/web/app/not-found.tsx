import Link from 'next/link';
import { localeHref } from '../i18n/locale';
import { getMessages } from '../i18n/messages';
import { localeFromHeaders } from '../i18n/params';

/**
 * Trang 404 GỐC — phục vụ cả vùng có locale lẫn `/admin`, `/auth`.
 *
 * Không nhận `params` (file này nằm ngoài `[locale]`), nên locale đến từ header `x-locale`.
 */
export default async function NotFound() {
  const locale = await localeFromHeaders();
  const t = getMessages(locale);

  return (
    <main id="main" className="container section">
      <div className="stack">
        <h1>{t.system.notFoundTitle}</h1>
        <p>{t.system.notFoundBody}</p>
        <p>
          <Link href={localeHref(locale, '/')}>{t.system.backToSite}</Link>
        </p>
      </div>
    </main>
  );
}
