'use client';

import { useEffect, useId, useRef, useState } from 'react';
import styles from './omni-embed.module.css';

/**
 * Khung nhúng công cụ Omni Calculator.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * VÌ SAO CẦN COMPONENT NÀY THAY VÌ MỘT THẺ `<iframe>` THƯỜNG
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * Trỏ `<iframe src="…/embed/finance/discount">` trần sẽ cho một KHUNG TRẮNG HOÀN TOÀN: máy
 * chủ trả 200, không có `x-frame-options`, không có `frame-ancestors`, script tải về đủ, và
 * KHÔNG có lỗi nào ở console. Nhưng `<div id="app">` bên trong không bao giờ được lấp đầy.
 *
 * Đã đo bằng trình duyệt thật: hiện tượng này xảy ra CẢ KHI mở thẳng URL embed ngoài site
 * này, nên nó không liên quan gì tới CSP, `sandbox` hay tên miền.
 *
 * Nguyên nhân nằm trong `https://cdn.omnicalculator.com/sdk.js`: ứng dụng nhúng chỉ render
 * sau khi BẮT TAY xong với trang cha.
 *
 *   1. iframe phải mang hash `#id=<n>&hasLink=<bool>&withLogo=<bool>&version=<n>`
 *   2. iframe gửi `{type:'LOADED', calculatorId}` lên trang cha
 *   3. trang cha PHẢI trả lời `{type:'CONFIG', …}` — thiếu bước này là đứng im vĩnh viễn
 *   4. iframe gửi `READY` rồi mới vẽ nội dung
 *   5. iframe gửi `CHANGE_HEIGHT` mỗi khi nội dung đổi chiều cao
 *
 * VÌ SAO KHÔNG NẠP THẲNG `sdk.js` CỦA HỌ: CSP của dự án dùng nonce + `strict-dynamic`, nên
 * thêm một script bên thứ ba là phải mở `script-src` cho một host ngoài — nới đúng cái hàng
 * rào đắt nhất của hệ thống, để đổi lấy khoảng ba mươi dòng mã. Ở đây ta nói đúng giao thức
 * đó bằng mã của mình, và `frame-src` vốn đã cho phép origin này rồi.
 *
 * `version=2`: bản 1 vẫn chạy nhưng chèn thêm dòng "Dear webmaster: … re-download the widget
 * code" ngay trong khung — người dùng cuối đọc được. Đã đo, bản 2 không có dòng đó.
 *
 * GIẤY PHÉP — ĐỌC TRƯỚC KHI PHÁT HÀNH CÔNG KHAI: điều khoản nhúng của Omni đòi xin duyệt kèm
 * tên miền, và đòi trang cha có logo, dòng "Powered by Omni Calculator" và link về trang gốc.
 * Dòng ghi nguồn và link ĐÃ ĐƯỢC GỠ theo yêu cầu chủ dự án ngày 2026-08-19, nên bản nhúng
 * hiện tại KHÔNG đạt điều kiện của họ. Xem `docs/build-plan/catalyst-demo.md` mục 7.
 */

const OMNI_ORIGIN = 'https://www.omnicalculator.com';

/** Chiều cao ban đầu trước khi iframe tự báo số thật. Đủ để không giật một nhịp lớn. */
const INITIAL_HEIGHT_PX = 520;

type OmniMessage =
  | { type: 'LOADED'; calculatorId: string }
  | { type: 'READY'; calculatorId: string }
  | { type: 'CHANGE_HEIGHT'; calculatorId: string; value: number };

/** Thu hẹp `unknown` từ `postMessage` — dữ liệu qua ranh giới origin luôn phải coi là lạ. */
function parseMessage(data: unknown): OmniMessage | null {
  if (typeof data !== 'object' || data === null) return null;
  const record = data as Record<string, unknown>;
  if (typeof record.type !== 'string' || typeof record.calculatorId === 'undefined') return null;

  if (record.type === 'CHANGE_HEIGHT') {
    return typeof record.value === 'number'
      ? { type: 'CHANGE_HEIGHT', calculatorId: String(record.calculatorId), value: record.value }
      : null;
  }
  if (record.type === 'LOADED' || record.type === 'READY') {
    return { type: record.type, calculatorId: String(record.calculatorId) };
  }
  return null;
}

export default function OmniEmbed({
  /** Đường `…/embed/<slug>` KHÔNG kèm hash — hash do component này gắn. */
  src,
  title,
  loadingLabel,
}: {
  src: string;
  title: string;
  loadingLabel: string;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(INITIAL_HEIGHT_PX);
  const [ready, setReady] = useState(false);

  /**
   * Mã định danh khung, do React sinh nên duy nhất trong một trang.
   *
   * Cần thiết vì mọi thông điệp đều kèm `calculatorId`: nếu một trang có hai khung Omni mà
   * không phân biệt được, khung này sẽ nhận chiều cao của khung kia.
   */
  const calculatorId = useId();

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      /**
       * KIỂM ORIGIN TRƯỚC MỌI THỨ KHÁC.
       *
       * Không có dòng này thì bất kỳ trang nào nhúng được ta — hoặc bất kỳ iframe nào khác
       * trong trang — đều gửi được thông điệp giả vào đây. Đó là lỗ hổng kinh điển của
       * `postMessage`, và nó im lặng cho tới lúc bị khai thác.
       */
      if (event.origin !== OMNI_ORIGIN) return;

      const message = parseMessage(event.data);
      if (message === null || message.calculatorId !== calculatorId) return;

      switch (message.type) {
        case 'LOADED':
          // Bước bắt buộc: thiếu câu trả lời này thì khung đứng trắng mãi mãi.
          frameRef.current?.contentWindow?.postMessage(
            { type: 'CONFIG', config: {}, currency: null, showRowControls: 'true' },
            OMNI_ORIGIN,
          );
          break;
        case 'READY':
          setReady(true);
          break;
        case 'CHANGE_HEIGHT':
          // Chặn số vô lý: một giá trị 0 hoặc âm sẽ làm khung biến mất.
          if (message.value > 0) setHeight(message.value);
          break;
      }
    }

    window.addEventListener('message', onMessage);

    /**
     * GỬI LẠI `CONFIG` NẾU SAU 2,5 GIÂY VẪN CHƯA `READY`.
     *
     * Toàn bộ cuộc bắt tay treo trên MỘT thông điệp `LOADED` duy nhất. Lỡ nó — vì effect vừa
     * gắn lại listener (StrictMode gắn hai lần trong dev), vì tab bị treo, vì bất cứ lý do
     * nào — thì khung đứng trắng vĩnh viễn và KHÔNG có lỗi nào báo ra. Đã gặp thật: cùng một
     * công cụ, chạy lại thì lúc hiện lúc trắng.
     *
     * Gửi lại `CONFIG` là thao tác vô hại nếu khung đã nhận rồi, nên không cần biết vì sao
     * lỡ — cứ hỏi lại một lần là xong.
     */
    const retry = setTimeout(() => {
      frameRef.current?.contentWindow?.postMessage(
        { type: 'CONFIG', config: {}, currency: null, showRowControls: 'true' },
        OMNI_ORIGIN,
      );
    }, 2_500);

    return () => {
      window.removeEventListener('message', onMessage);
      clearTimeout(retry);
    };
  }, [calculatorId]);

  /**
   * HAI CỜ NÀY ĐIỀU KHIỂN NỘI DUNG BÊN TRONG KHUNG — đây là đòn bẩy DUY NHẤT ta có.
   *
   * Nội dung khung nằm ở origin khác, nên CSS và JavaScript của trang này KHÔNG với tới được
   * (chính sách same-origin). Muốn đổi thứ gì bên trong thì chỉ còn cách nói với ứng dụng của
   * họ qua hash và qua `CONFIG` — ngoài hai đường đó thì không có đường nào khác.
   *
   * `withLogo=false` — ĐÃ ĐO: bỏ đúng logo "omni calculator" ở góc dưới phải khung. Phần còn
   * lại (banner "Try the new version now!") là nội dung của chính họ, không cờ nào tắt được.
   *
   * `hasLink=false` — khai đúng sự thật rằng trang cha KHÔNG có link về Omni. Dòng ghi nguồn
   * đã gỡ theo yêu cầu chủ dự án 2026-08-19. Đã đo: cờ này không đổi hiển thị, nên không có
   * lý do gì để khai sai.
   *
   * LƯU Ý KHI XIN DUYỆT: điều khoản nhúng của Omni đòi CẢ logo LẪN link. Hai cờ `false` ở đây
   * nghĩa là bản nhúng hiện tại không đạt hai trong bốn điều kiện của họ. Muốn được duyệt thì
   * phải bật cả hai lại và đặt lại dòng ghi nguồn. Xem `docs/build-plan/catalyst-demo.md` §8.
   */
  const frameSrc = `${src}#id=${encodeURIComponent(calculatorId)}&hasLink=false&withLogo=false&version=2`;

  return (
    <div className={styles.wrap}>
      {/* Chữ chờ nằm DƯỚI iframe và bị nó che khi vẽ xong — không tháo iframe ra khỏi DOM,
          vì tháo ra là mất luôn cuộc bắt tay đang diễn ra. */}
      {!ready && <p className={`typeBodySmall textSecondary ${styles.loading}`}>{loadingLabel}</p>}

      <iframe
        ref={frameRef}
        className={styles.frame}
        src={frameSrc}
        title={title}
        height={height}
        /**
         * `allow-same-origin` là BẮT BUỘC, không phải nới lỏng tuỳ tiện: thiếu nó thì khung
         * nhận một origin mờ, `localStorage` ném lỗi ngay ở script khởi tạo của họ, và
         * `postMessage` không còn kiểm được `event.origin` ở phía ta. Khung vẫn là origin
         * KHÁC với ta, nên nó không đọc được gì của Talosmine.
         *
         * KHÔNG có `allow-top-navigation`: nếu không, trang nhúng tự điều hướng được cả tab
         * của người dùng đi nơi khác.
         */
        sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
      />
    </div>
  );
}
