import type { Locale } from '../../../i18n/locale';
import { getMessages } from '../../../i18n/messages';
import styles from './newsletter.module.css';

/**
 * Khối "Đăng ký bản tin" — dùng lại ở cuối HẦU HẾT các trang công khai.
 *
 * VÌ SAO LÀ COMPONENT CHỨ KHÔNG NẰM TRONG `layout.tsx`: layout áp cho MỌI trang trong nhóm
 * `(user)`, kể cả `/account` và `/account/sessions`. Chèn lời mời đăng ký bản tin vào giữa
 * màn hình quản lý phiên đăng nhập là sai chỗ. Để từng trang tự khai `<Newsletter />` thì
 * nơi nào cần mới có, và đọc file trang là biết ngay trang đó kết thúc bằng gì.
 *
 * Component TỰ MANG khung `section > container grid` của nó. Nhờ vậy chỗ dùng chỉ cần một
 * dòng, và không trang nào tự bịa lại bề ngang hay khoảng cách của khối này.
 *
 * Khối chỉ xuất hiện MỘT LẦN trên một trang — `id` của ô nhập là hằng số nên hai khối trên
 * cùng trang sẽ trùng `id`. Nếu sau này cần đặt hai lần, đổi sang `useId()` (và khi đó
 * component thành client component).
 */
export function Newsletter({ locale }: { locale: Locale }) {
  const t = getMessages(locale);

  return (
    <section className="section">
      <div className="container grid">
        <div className={styles.newsletter}>
          <EnvelopeIcon />

          <h2 className={`typeH2 ${styles.newsletterTitle}`}>{t.newsletter.title}</h2>

          <p className={`typeBodySmall ${styles.newsletterText}`}>{t.newsletter.text}</p>

          {/*
            Chưa có đích đến: hệ thống bản tin thuộc giai đoạn sau. Không đặt `action` thì
            trình duyệt gửi về chính trang này thay vì báo lỗi.
          */}
          <form className={styles.newsletterForm}>
            <label className="visuallyHidden" htmlFor="newsletter-email">
              {t.newsletter.emailLabel}
            </label>
            <input
              id="newsletter-email"
              className={`typeBody ${styles.newsletterInput}`}
              type="email"
              name="email"
              placeholder={t.newsletter.emailPlaceholder}
              autoComplete="email"
            />
            <button type="submit" className={`typeBodySmall ${styles.newsletterSubmit}`}>
              {t.newsletter.submit}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}

/* SVG viết thẳng tại chỗ — thư viện icon nằm ngoài bảng D của decision register. */
function EnvelopeIcon() {
  return (
    <svg
      className={styles.newsletterIcon}
      width="64"
      height="48"
      viewBox="0 0 64 48"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M4 0h56a4 4 0 0 1 4 4v40a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4V4a4 4 0 0 1 4-4Zm28 27.5L5.6 6.2A2 2 0 0 0 4 6v1.3l26.7 21.6a2 2 0 0 0 2.6 0L60 7.3V6a2 2 0 0 0-1.6.2L32 27.5Z" />
    </svg>
  );
}
