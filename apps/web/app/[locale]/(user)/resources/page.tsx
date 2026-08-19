import type { Metadata } from 'next';
import { localeAlternates, type PageLocaleParams } from '../../../../i18n/params';
import { resolvePageContent } from '../../../../server/site-content';
import { ComingSoon } from '../coming-soon';

export async function generateMetadata({ params }: PageLocaleParams): Promise<Metadata> {
  const { locale, t } = await resolvePageContent(params);
  return {
    title: t.meta.resources,
    alternates: localeAlternates(locale, '/resources'),
  };
}

/**
 * Tài nguyên — mục menu do chủ dự án yêu cầu ngày 2026-08-19.
 *
 * TRANG PHẢI TỒN TẠI TRƯỚC KHI THÊM MỤC MENU. Một mục menu trỏ vào route chưa có sẽ trả 404
 * — với người xem thì đó là hệ thống hỏng, tệ hơn hẳn một trang nói thẳng "chưa có nội dung".
 *
 * Dùng `ComingSoon` như `/contact` và `/categories`: nói đúng sự thật thay vì dựng nội dung
 * giả. Khi có nội dung thật thì thay thân trang này, KHÔNG phải sửa header — menu đã trỏ
 * đúng chỗ rồi.
 *
 * Không khai `seo.description.resources`: khe nội dung đó chưa tồn tại trong CMS. Thêm một
 * khe rỗng chỉ để đọc ra `undefined` thì không được gì.
 */
export default async function ResourcesPage({ params }: PageLocaleParams) {
  const { locale, t } = await resolvePageContent(params);

  return (
    <ComingSoon
      locale={locale}
      title={t.comingSoon.resourcesTitle}
      description={t.comingSoon.resourcesDescription}
    />
  );
}
