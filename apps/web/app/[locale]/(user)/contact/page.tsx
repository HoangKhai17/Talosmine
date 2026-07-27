import type { Metadata } from 'next';
import { ComingSoon } from '../coming-soon';

export const metadata: Metadata = { title: 'Talosmine — Liên hệ' };

export default function ContactPage() {
  return (
    <ComingSoon
      title="Liên hệ"
      description="Cách liên hệ với đội ngũ Talosmine sẽ hiển thị tại đây."
    />
  );
}
