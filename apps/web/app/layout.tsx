import type { Metadata, Viewport } from 'next';
import { Inter, Montserrat } from 'next/font/google';
import type { ReactNode } from 'react';
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
  weight: ['400', '500', '600'],
  variable: '--font-montserrat',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Talosmine',
  description: 'Talosmine web shell',
};

export const viewport: Viewport = {
  // Một codebase cho desktop/tablet/mobile: layout co theo viewport, không có bản riêng.
  // Không đặt maximumScale/userScalable — chặn zoom là một lỗi accessibility.
  width: 'device-width',
  initialScale: 1,
};

/**
 * Root layout. Skip link ở đây trỏ tới `#main`; mọi layout con và mọi file
 * loading/error/not-found đều phải render đúng một `<main id="main">` để link này luôn có đích.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" className={`${montserrat.variable} ${inter.variable}`}>
      <body>
        <a className="skipLink" href="#main">
          Bỏ qua tới nội dung chính
        </a>
        {children}
      </body>
    </html>
  );
}
