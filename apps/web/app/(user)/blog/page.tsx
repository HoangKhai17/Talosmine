import type { Metadata } from 'next';
import { ComingSoon } from '../coming-soon';

export const metadata: Metadata = { title: 'Talosmine — Blog' };

export default function BlogPage() {
  return (
    <ComingSoon
      title="Blog"
      description="Bài viết, hướng dẫn và tin tức về các công cụ trong hệ thống."
    />
  );
}
