import type { Metadata } from 'next';
import { localeAlternates, type PageLocaleParams, resolvePageI18n } from '../../../../i18n/params';
import { Breadcrumb } from '../breadcrumb';
import styles from './page.module.css';
import { WalletClient } from './wallet-client';

/**
 * Trang kết nối ví Cardano — phần demo Catalyst (kế hoạch mục 3).
 *
 * PHÂN VAI TRÒ trong trang này:
 *
 *   • File này (Server Component) lo phần TĨNH: metadata, breadcrumb, tiêu đề, phần giải
 *     thích. Chúng nằm trong HTML đầu tiên nên đọc được ngay cả khi JavaScript chưa tải.
 *   • `WalletClient` lo phần ĐỘNG, và chỉ chạy ở trình duyệt — xem `wallet-client.tsx`.
 *
 * Ranh giới này không phải để cho gọn: nó là lý do `@meshsdk/core` không lọt vào bundle
 * server. Kéo bất cứ phần nào của Mesh lên file này là làm hỏng bước build.
 *
 * CHỮ GÕ THẲNG TIẾNG VIỆT, không qua `i18n/messages` — theo kế hoạch demo (mục 0). Ba tab
 * cùng sửa catalog i18n là xung đột chắc chắn, nên hôm nay không ai đụng vào nó.
 *
 * PHẠM VI HÔM NAY: chỉ KẾT NỐI và ĐỌC. Không ký giao dịch, không thanh toán, không gọi
 * Blockfrost. CIP-30 chạy trọn vẹn trong extension nên trang này KHÔNG phát ra request nào
 * ra ngoài — `connect-src 'self'` giữ nguyên, không cần nới.
 *
 * NHƯNG `script-src` THÌ CẦN — và đây là chỗ dễ mất cả buổi nếu không biết trước:
 *
 *   `@meshsdk/core` kéo theo libsodium và blake2b-wasm, và cả hai gọi `WebAssembly.compile()`
 *   NGAY LÚC NẠP MODULE, trước bất kỳ thao tác ví nào. Thiếu `'wasm-unsafe-eval'` trong
 *   `script-src` thì lời gọi đó ném `CompileError`, cả chunk chết, và trang đứng mãi ở dòng
 *   "Đang tải phần kết nối ví…". Không có đường lui về JS thuần — đã thử, nó ném thẳng.
 *
 *   Bẫy nằm ở chỗ: `proxy.ts` thêm `'unsafe-eval'` cho riêng môi trường dev (React Refresh
 *   cần), mà `'unsafe-eval'` cũng cho phép biên dịch WASM. Nên ở `next dev` mọi thứ chạy
 *   ngon, và lỗi CHỈ xuất hiện trên bản production.
 *
 *   `proxy.ts` thuộc Tab 1 — đã báo, không tự sửa.
 */
export async function generateMetadata({ params }: PageLocaleParams): Promise<Metadata> {
  const { locale, t } = await resolvePageI18n(params);
  return {
    title: t.wallet.title,
    description: t.wallet.lead,
    alternates: localeAlternates(locale, '/wallet'),
  };
}

export default async function WalletPage({ params }: PageLocaleParams) {
  const { locale, t } = await resolvePageI18n(params);

  return (
    <section className={styles.section}>
      <div className="container grid">
        <Breadcrumb locale={locale} trail={[{ label: t.wallet.breadcrumb }]} />

        <h1 className={`typeH1 ${styles.title}`}>{t.wallet.title}</h1>

        <p className={`typeBody textSecondary ${styles.lead}`}>{t.wallet.lead}</p>

        <div className={styles.panelSlot}>
          <WalletClient labels={t.wallet} loading={t.wallet.loadingModule} />
        </div>

        {/*
          Nói trước giới hạn ngay trên trang, không giấu trong tài liệu: người xem hồ sơ
          Catalyst sẽ bấm thử và cần biết ngay đâu là ranh giới của bản demo.
        */}
        <aside className={styles.aside}>
          <h2 className="typeCardTitle">{t.wallet.canDoTitle}</h2>
          <ul className={`typeBodySmall textSecondary ${styles.asideList}`}>
            <li>{t.wallet.canDo1}</li>
            <li>{t.wallet.canDo2}</li>
            <li>{t.wallet.canDo3}</li>
            <li>{t.wallet.canDo4}</li>
            <li>{t.wallet.canDo5}</li>
          </ul>

          <h2 className={`typeCardTitle ${styles.asideHeading}`}>{t.wallet.cannotTitle}</h2>
          <p className={`typeBodySmall textSecondary ${styles.asideNote}`}>{t.wallet.cannotBody}</p>
        </aside>
      </div>
    </section>
  );
}
