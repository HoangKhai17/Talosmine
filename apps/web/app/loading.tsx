import { getMessages } from '../i18n/messages';
import { localeFromHeaders } from '../i18n/params';

/**
 * Loading foundation. `aria-live="polite"` + `role="status"` để screen reader thông báo
 * trạng thái tải mà không cắt ngang người dùng.
 *
 * Locale đến từ header `x-locale` — file này nằm ngoài `[locale]` nên không có `params`.
 */
export default async function Loading() {
  const t = getMessages(await localeFromHeaders());

  return (
    <main id="main" className="container section">
      <p role="status" aria-live="polite">
        {t.system.loading}
      </p>
    </main>
  );
}
