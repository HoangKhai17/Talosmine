import type { Metadata } from 'next';
import Link from 'next/link';
import { localeHref } from '../../../../../i18n/locale';
import {
  localeAlternates,
  type PageLocaleParams,
  resolvePageI18n,
} from '../../../../../i18n/params';
import shared from '../shared.module.css';
import styles from './page.module.css';

export async function generateMetadata({ params }: PageLocaleParams): Promise<Metadata> {
  const { locale, t } = await resolvePageI18n(params);
  return {
    title: t.helpCenter.title,
    alternates: localeAlternates(locale, '/account/help'),
  };
}

/**
 * Trung tâm trợ giúp — danh sách câu hỏi thường gặp.
 *
 * DÙNG `<details>/<summary>`, KHÔNG DỰNG ACCORDION BẰNG JAVASCRIPT. Ba lý do, mỗi lý do tự nó
 * đã đủ:
 *   1. Mở/đóng chạy được kể cả khi JavaScript hỏng hoặc chưa tải xong.
 *   2. Trình đọc màn hình đã hiểu sẵn ngữ nghĩa "đóng/mở" — không phải mô phỏng bằng
 *      `aria-expanded` rồi quên cập nhật.
 *   3. `Ctrl+F` của trình duyệt tìm được chữ bên trong phần đang đóng ở các trình duyệt hiện
 *      đại; một accordion tự viết thường tháo nội dung khỏi DOM và mất khả năng đó.
 *
 * NỘI DUNG NẰM TRONG CATALOG i18n, CHƯA ĐƯA VÀO CMS: `pending-work.md` D0 mục 2 ghi rõ FAQ
 * cần một cấu trúc Q&A riêng chứ không phải khe chữ đơn. Dựng vội mỗi câu một khe nội dung
 * sẽ phải làm lại toàn bộ khi cấu trúc thật ra đời.
 */
export default async function HelpCenterPage({ params }: PageLocaleParams) {
  const { locale, t } = await resolvePageI18n(params);
  const page = t.helpCenter;

  const faqs = [
    { q: page.q1, a: page.a1 },
    { q: page.q2, a: page.a2 },
    { q: page.q3, a: page.a3 },
    { q: page.q4, a: page.a4 },
    { q: page.q5, a: page.a5 },
    { q: page.q6, a: page.a6 },
    { q: page.q7, a: page.a7 },
    { q: page.q8, a: page.a8 },
  ];

  return (
    <div>
      <div className={shared.header}>
        <h1 className="typeH2">{page.title}</h1>
        <p className={`typeBody ${shared.lead}`}>{page.lead}</p>
      </div>

      <section className={shared.card} aria-labelledby="faq-heading">
        <div>
          <h2 className="typeH3" id="faq-heading">
            {page.faqTitle}
          </h2>
          <p className={`typeBodySmall ${shared.lead}`}>{page.faqLead}</p>
        </div>

        <div className={styles.list}>
          {faqs.map((faq) => (
            <details className={styles.item} key={faq.q}>
              <summary className={`typeBody ${styles.question}`}>{faq.q}</summary>
              <p className={`typeBodySmall ${styles.answer}`}>{faq.a}</p>
            </details>
          ))}
        </div>
      </section>

      <p className={`typeBodySmall ${styles.contact}`}>
        {page.contactLead} <Link href={localeHref(locale, '/contact')}>{page.contactCta}</Link>
      </p>
    </div>
  );
}
