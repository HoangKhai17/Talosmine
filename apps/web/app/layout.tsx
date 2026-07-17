import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

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
    <html lang="vi">
      <body>
        <a className="skip-link" href="#main">
          Bỏ qua tới nội dung chính
        </a>
        {children}
      </body>
    </html>
  );
}
