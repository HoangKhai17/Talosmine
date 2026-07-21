import type { Metadata } from 'next';
import { ComingSoon } from '../coming-soon';

export const metadata: Metadata = { title: 'Talosmine — Công cụ' };

export default function ToolsPage() {
  return (
    <ComingSoon
      title="Công cụ"
      description="Danh sách đầy đủ các công cụ trong hệ thống sẽ hiển thị tại đây."
    />
  );
}
