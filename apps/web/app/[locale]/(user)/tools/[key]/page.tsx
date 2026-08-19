import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import OmniEmbed from '../../../../../components/tools/omni-embed';
import { localeHref } from '../../../../../i18n/locale';
import {
  localeAlternates,
  type PageLocaleParams,
  resolvePageI18n,
} from '../../../../../i18n/params';
import { DEMO_PRODUCTS, findDemoProduct, pick } from '../../../../../lib/demo-products';
import styles from './page.module.css';

type Params = PageLocaleParams & { params: Promise<{ locale: string; key: string }> };

/**
 * Khoá danh mục vào đúng danh sách `DEMO_PRODUCTS` — Next chỉ dựng sẵn bấy nhiêu đường dẫn.
 *
 * KHÔNG SỬA ĐƯỢC MÃ TRẠNG THÁI, ĐÃ ĐO: `/vi/tools/khong-co-that` vẫn trả **200 kèm nội dung
 * trang 404** trên cả bản dev lẫn bản production build. Nội dung người dùng thấy là đúng
 * (trang "không tìm thấy"), chỉ có mã HTTP sai.
 *
 * Nguyên nhân chưa xác định — nghi là middleware `proxy.ts` xử lý định tuyến locale trước khi
 * router kịp đặt 404, cùng lớp vấn đề đã ghi ở đó cho `redirect()`. Với bản demo Catalyst thì
 * đây là lỗi hình thức (người chấm vẫn thấy đúng trang), nhưng phải sửa trước khi phát hành
 * thật vì công cụ tìm kiếm đọc mã trạng thái chứ không đọc nội dung.
 *
 * Giữ dòng này vì nó vẫn đúng việc của nó: danh mục cố định thì dựng tĩnh toàn bộ, không có
 * truy vấn lúc chạy.
 */
export const dynamicParams = false;

/**
 * Sinh sẵn đường dẫn tĩnh cho mọi sản phẩm demo.
 *
 * Danh sách là hằng số nên Next dựng sẵn được toàn bộ lúc build — không có truy vấn nào lúc
 * chạy. Đây cũng là lý do bản demo deploy được mà không cần database.
 */
export function generateStaticParams() {
  return DEMO_PRODUCTS.map((product) => ({ key: product.key }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await resolvePageI18n(params);
  const { key } = await params;
  const product = findDemoProduct(key);

  if (!product) return { title: 'Không tìm thấy công cụ' };

  return {
    title: pick(product.title, locale),
    description: pick(product.description, locale),
    alternates: localeAlternates(locale, `/tools/${product.key}`),
  };
}

/**
 * Trang chạy một công cụ demo.
 *
 * CÔNG CỤ CHẠY TRONG IFRAME. BA điều kiện phải đúng cùng lúc, thiếu một là khung trắng:
 *   1. Nguồn phải là dạng `/embed/<slug>` — URL thường của Omni trả `x-frame-options:
 *      SAMEORIGIN` và bị trình duyệt từ chối.
 *   2. CSP của ta phải có `frame-src` chứa origin đó — xem `proxy.ts`, giá trị suy ra từ
 *      chính `DEMO_PRODUCTS` nên không lệch được.
 *   3. Trang cha phải BẮT TAY với iframe qua `postMessage`. Đây là điều kiện đã làm mất
 *      nhiều thời gian nhất, vì thiếu nó thì mọi phép kiểm phía máy chủ đều báo "ổn": 200,
 *      không header chặn, script tải đủ, console sạch — mà khung vẫn trắng. Toàn bộ phần
 *      bắt tay nằm trong `components/tools/omni-embed.tsx`, đọc ghi chú ở đó trước khi sửa.
 *
 * `sandbox` được siết ở mức hẹp nhất mà công cụ vẫn chạy — xem ghi chú trong `OmniEmbed`.
 *
 * KHÔNG yêu cầu đăng nhập: bản demo Catalyst cố ý để công khai để người chấm bấm thử được
 * ngay, không phải tạo tài khoản.
 */
export default async function ToolDetailPage({ params }: Params) {
  const { locale, t } = await resolvePageI18n(params);
  const { key } = await params;
  const product = findDemoProduct(key);

  if (!product) notFound();

  return (
    <div className="container section">
      <p className={`typeBodySmall ${styles.back}`}>
        <Link href={localeHref(locale, '/tools')}>← {t.tools.backToAll}</Link>
      </p>

      <div className={styles.header}>
        <p className={`typeCaption ${styles.category}`}>{pick(product.category, locale)}</p>
        <h1 className="typeH2">{pick(product.title, locale)}</h1>
        <p className={`typeBody ${styles.lead}`}>{pick(product.description, locale)}</p>
      </div>

      <OmniEmbed
        src={product.iframeSrc}
        title={pick(product.title, locale)}
        loadingLabel={t.tools.embedLoading}
      />
    </div>
  );
}
