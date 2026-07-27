import type { Metadata } from 'next';
import { ComingSoon } from '../coming-soon';

export const metadata: Metadata = { title: 'Talosmine — Gửi công cụ' };

export default function SubmitPage() {
  return (
    <ComingSoon
      title="Gửi công cụ"
      description="Biểu mẫu đề xuất công cụ mới để đưa vào danh mục."
    />
  );
}
