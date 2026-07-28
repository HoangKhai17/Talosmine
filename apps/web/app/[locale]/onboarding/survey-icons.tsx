import type { ReactNode } from 'react';

/**
 * Danh mục icon ĐÓNG cho lựa chọn khảo sát.
 *
 * Khoá phải khớp CHECK constraint ở migration `0012_survey`. Quản trị viên chọn khoá từ danh
 * sách thả; code render SVG tương ứng.
 *
 * VÌ SAO KHÔNG NHẬN SVG HAY URL TỪ NGƯỜI DÙNG:
 *   - SVG tự nhập là markup chạy được — CSP theo nonce (DEC-T20) sẽ chặn, và nới CSP để
 *     chiều một ô nhập icon là đánh đổi tệ nhất trong kiến trúc này.
 *   - URL ảnh thì vướng đúng hai ràng buộc của logo: host phải nằm trong allowlist VÀ trong
 *     `img-src`. Với một icon 20px thì cái giá đó không đáng.
 *
 * MỘT thẻ `<svg>` duy nhất ở `Glyph`, còn `ICONS` chỉ giữ phần hình. Mười lăm thẻ `<svg>`
 * giống hệt nhau là mười lăm chỗ để `aria-hidden` hoặc `viewBox` lệch đi mà không ai thấy.
 */

/**
 * Khung SVG dùng chung.
 *
 * `aria-hidden` vì nhãn văn bản bên cạnh đã mô tả lựa chọn — icon được đọc nữa thì trình đọc
 * màn hình loan báo hai lần cho một thứ.
 */
function Glyph({ className, children }: { className?: string | undefined; children: ReactNode }) {
  return (
    <svg
      className={className}
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const ICONS: Record<string, ReactNode> = {
  writing: (
    <>
      <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
      <path d="M13.5 6.5l4 4" />
    </>
  ),
  design: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="9" cy="9.5" r="1.2" />
      <circle cx="15" cy="9.5" r="1.2" />
      <path d="M12 21a3 3 0 0 0 0-6 2 2 0 0 1 0-4" />
    </>
  ),
  code: (
    <>
      <path d="M9 17 4 12l5-5" />
      <path d="m15 7 5 5-5 5" />
    </>
  ),
  video: (
    <>
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="m16 11 5-3v8l-5-3z" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="m4 17 5-5 4 4 3-2 4 4" />
    </>
  ),
  automation: (
    <>
      <rect x="4" y="8" width="16" height="12" rx="2" />
      <path d="M12 8V4" />
      <circle cx="9" cy="14" r="1" />
      <circle cx="15" cy="14" r="1" />
    </>
  ),
  research: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4.5-4.5" />
    </>
  ),
  business: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </>
  ),
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  chat: <path d="M21 12a8 8 0 0 1-8 8H7l-4 3v-5.6A8 8 0 0 1 13 4a8 8 0 0 1 8 8Z" />,
  cloud: <path d="M7 18a4 4 0 0 1 .6-8A6 6 0 0 1 19 11a3.5 3.5 0 0 1-.5 7H7Z" />,
  shield: <path d="M12 3l7 3v6c0 4.4-3 8-7 9-4-1-7-4.6-7-9V6l7-3Z" />,
  sparkle: (
    <>
      <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
      <path d="m6.5 6.5 3 3M14.5 14.5l3 3M17.5 6.5l-3 3M9.5 14.5l-3 3" />
    </>
  ),
  rocket: (
    <>
      <path d="M12 3c3.5 2 5.5 5.5 5.5 9L12 17l-5.5-5c0-3.5 2-7 5.5-9Z" />
      <circle cx="12" cy="10" r="1.6" />
      <path d="M9 17l-2 4 4-2M15 17l2 4-4-2" />
    </>
  ),
  book: (
    <>
      <path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2V5Z" />
      <path d="M8 3v18" />
    </>
  ),
};

/**
 * Danh sách khoá để màn hình quản trị dựng ô chọn icon.
 *
 * Suy ra TỪ CHÍNH `ICONS` chứ không viết tay lần nữa: thêm một hình mà quên cập nhật danh
 * sách sẽ khiến icon tồn tại nhưng không ai chọn được, và không có gì báo.
 */
export const SURVEY_ICON_KEYS: readonly string[] = Object.keys(ICONS);

/**
 * Khoá lạ trả `null` — ô lựa chọn vẫn render, chỉ thiếu icon.
 *
 * Trường hợp này xảy ra thật khi migration thêm một khoá icon mà code chưa có hình. Không
 * bao giờ để một khoá không nhận ra làm vỡ cả màn hình khảo sát.
 */
export function SurveyIcon({
  name,
  className,
}: {
  name: string | null;
  className?: string | undefined;
}) {
  if (name === null) return null;

  const glyph = ICONS[name];
  if (glyph === undefined) return null;

  return <Glyph className={className}>{glyph}</Glyph>;
}
