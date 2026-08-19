'use client';

import dynamic from 'next/dynamic';
import type { WalletLabels } from '../../../../components/wallet/wallet-connect';

/**
 * Ranh giới server → client của trang `/wallet`. File này tồn tại CHỈ để gọi được
 * `dynamic(..., { ssr: false })`.
 *
 * VÌ SAO CẦN MỘT FILE RIÊNG: `ssr: false` không dùng được trong Server Component — Next từ
 * chối ngay lúc build. Mà `page.tsx` phải là Server Component để có `generateMetadata` và
 * `params`. Nên phần `dynamic` nằm ở đây, trong một client component mỏng.
 *
 * VÌ SAO PHẢI `ssr: false` chứ `'use client'` là chưa đủ: `'use client'` không có nghĩa là
 * "chỉ chạy ở trình duyệt". Next vẫn render client component một lần ở server để dựng HTML
 * ban đầu. `@meshsdk/core` đọc `window` ngay lúc nạp module, nên lượt render đó ném
 * `window is not defined` và làm HỎNG CẢ BƯỚC BUILD, không phải chỉ một trang.
 *
 * Hệ quả cần biết: trang này không có nội dung trong HTML đầu tiên. Chấp nhận được — kết nối
 * ví vốn không thể xảy ra nếu không có JavaScript, nên chẳng có gì để render trước cả. Vì
 * vậy `loading` phải là một câu tử tế chứ không phải khoảng trắng.
 */
let loadingText = '';

const WalletConnect = dynamic(() => import('../../../../components/wallet/wallet-connect'), {
  ssr: false,
  // Chữ loading truyền qua module-scope vì `dynamic()` chạy một lần lúc nạp module, không
  // nhận được prop. Gán ở `WalletClient` trước khi render.
  loading: () => <p className="typeBodySmall textSecondary">{loadingText}</p>,
});

export function WalletClient({ labels, loading }: { labels: WalletLabels; loading: string }) {
  loadingText = loading;
  return <WalletConnect labels={labels} />;
}
