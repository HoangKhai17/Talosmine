import type { Metadata, Viewport } from 'next';
import { Inter, Montserrat } from 'next/font/google';
import type { ReactNode } from 'react';
import { getMessages } from '../i18n/messages';
import { localeFromHeaders } from '../i18n/params';
import './globals.css';

/**
 * Font theo quy chuẩn UI: Montserrat chính, Inter dự phòng.
 *
 * `next/font/google` SELF-HOST font lúc build — không gọi Google CDN ở runtime. Nhờ vậy
 * CSP `font-src 'self'` (DEC-T12) không phải nới, và không rò referrer sang Google.
 * `display: swap` để chữ hiện ngay bằng font hệ thống thay vì màn hình trắng.
 */
const montserrat = Montserrat({
  subsets: ['latin', 'vietnamese'],
  // 700 dùng cho menu header (yêu cầu chủ dự án 2026-07-28). PHẢI nạp ở đây: thiếu weight
  // này thì trình duyệt tự bôi đậm nét chữ 600 (synthetic bold) — nét méo và khác Figma.
  weight: ['400', '500', '600', '700'],
  variable: '--font-montserrat',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin', 'vietnamese'],
  // 700 dùng cho menu header (yêu cầu chủ dự án 2026-07-28). PHẢI nạp ở đây: thiếu weight
  // này thì trình duyệt tự bôi đậm nét chữ 600 (synthetic bold) — nét méo và khác Figma.
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

/**
 * `metadataBase` biến `alternates` tương đối (`/vi/tools`) thành URL tuyệt đối trong thẻ
 * `<link rel="alternate" hreflang>` — hreflang tương đối bị công cụ tìm kiếm bỏ qua.
 *
 * Đọc từ `APP_BASE_URL`, và biến này là TUỲ CHỌN (xem `server/env.ts`) nên phải chịu được
 * việc nó vắng mặt: thiếu thì Next chỉ cảnh báo lúc build và phát hreflang tương đối, chứ
 * không được làm sập trang. Dev/CI không phải cấu hình thêm gì.
 */
function readMetadataBase(): URL | null {
  const raw = process.env.APP_BASE_URL;
  if (!raw) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

const metadataBase = readMetadataBase();

export const metadata: Metadata = {
  title: 'Talosmine',
  description: 'Talosmine web shell',
  ...(metadataBase ? { metadataBase } : {}),
};

/**
 * KHÔNG TRANG NÀO ĐƯỢC PRERENDER TĨNH. Đây là hệ quả bắt buộc của cách đặt CSP, không phải
 * một lựa chọn về hiệu năng.
 *
 * `proxy.ts` sinh một nonce MỚI cho mỗi request rồi đưa vào `script-src`. HTML dựng sẵn lúc
 * build mang nonce của lúc build — nonce đó không bao giờ khớp nonce trong header của
 * request, nên trình duyệt chặn TOÀN BỘ script của trang. Trang vẫn hiện ra và trông bình
 * thường, chỉ là React không bao giờ chạy: không nút nào bấm được, không form nào tương tác
 * được, và console đầy lỗi mà không ai nhìn.
 *
 * Đây là lỗi ĐÃ CÓ SẴN, phát hiện 2026-07-22: trang 404 là trang tĩnh duy nhất còn lại và
 * nó có 16 vi phạm CSP. Các trang khác thoát nạn nhờ tình cờ — layout `(user)` đọc cookie
 * nên cả nhánh đó đã động sẵn.
 *
 * Khai ở ROOT vì đây là tính chất của TOÀN ỨNG DỤNG: hễ còn dùng nonce theo request thì
 * không trang nào được dựng trước. Đặt rải rác ở từng nhánh chỉ là chờ tới lần quên tiếp
 * theo. Chi phí gần bằng không — trước thay đổi này chỉ có đúng một route là tĩnh.
 */
export const dynamic = 'force-dynamic';

export const viewport: Viewport = {
  // Một codebase cho desktop/tablet/mobile: layout co theo viewport, không có bản riêng.
  // Không đặt maximumScale/userScalable — chặn zoom là một lỗi accessibility.
  width: 'device-width',
  initialScale: 1,
};

/**
 * Root layout. Skip link ở đây trỏ tới `#main`; mọi layout con và mọi file
 * loading/error/not-found đều phải render đúng một `<main id="main">` để link này luôn có đích.
 *
 * LOCALE LẤY TỪ HEADER `x-locale` do `proxy.ts` đặt, không phải từ `params`.
 *
 * Lý do: root layout phủ CẢ vùng có locale (`/[locale]/…`) lẫn vùng không có (`/admin`,
 * `/auth`), nên nó không có `params.locale` để đọc. Cách còn lại là tách thành hai root
 * layout — nghĩa là hai bản khai `<html>`, hai chỗ nạp font, và hai chỗ phải nhớ sửa mỗi khi
 * đổi một thứ chung. Header rẻ hơn nhiều.
 *
 * `<html lang>` không phải chi tiết vụn: trình đọc màn hình chọn giọng đọc theo nó, và
 * trình duyệt dựa vào nó để gợi ý dịch trang.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await localeFromHeaders();
  const t = getMessages(locale);

  return (
    <html lang={locale} className={`${montserrat.variable} ${inter.variable}`}>
      <body>
        <a className="skipLink" href="#main">
          {t.a11y.skipToContent}
        </a>
        {children}
      </body>
    </html>
  );
}
