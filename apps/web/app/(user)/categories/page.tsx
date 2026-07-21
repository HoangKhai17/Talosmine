import type { Metadata } from 'next';
import { ComingSoon } from '../coming-soon';

export const metadata: Metadata = { title: 'Talosmine — Danh mục' };

export default function CategoriesPage() {
  return (
    <ComingSoon
      title="Danh mục"
      description="Các nhóm công cụ được phân loại theo mục đích sử dụng."
    />
  );
}
