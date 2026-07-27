import Link from 'next/link';
import { type Locale, localeHref } from '../../../i18n/locale';
import { getMessages } from '../../../i18n/messages';

/**
 * Trang cho route đã có trong điều hướng nhưng CHƯA có nội dung.
 *
 * Vì sao tồn tại: header dựng theo wireframe nên có sẵn mục Công cụ / Danh mục / Blog.
 * Không có trang tương ứng thì các mục đó trả 404 — trông như hệ thống hỏng. Trang này
 * nói thẳng "chưa có", đúng sự thật và không giả vờ có tính năng.
 *
 * Khi trang thật ra đời thì xoá file tương ứng, không phải sửa header.
 */
export function ComingSoon({
  title,
  description,
  locale,
}: {
  title: string;
  description: string;
  locale: Locale;
}) {
  const t = getMessages(locale);

  return (
    <div className="container section stack">
      <h1 className="typeH1">{title}</h1>
      <p className="typeBodyLarge textSecondary">{description}</p>
      <div className="notice">
        <p className="typeBody">{t.comingSoon.body}</p>
      </div>
      <p>
        <Link className="typeBody" href={localeHref(locale, '/')}>
          {t.common.backToHome}
        </Link>
      </p>
    </div>
  );
}
