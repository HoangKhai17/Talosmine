import { callControlPlane } from './control-plane-boundary';

/**
 * Cài đặt chung của site (logo) đọc từ Control Plane.
 *
 * Cùng ba ràng buộc với `site-nav.ts` — fallback bắt buộc, cache bắt buộc, không dựa vào
 * cache `fetch` của Next. Xem file đó để hiểu lý do đầy đủ.
 *
 * TÁCH KHỎI `site-nav.ts` vì hai lý do:
 *   1. Cài đặt KHÔNG phụ thuộc ngôn ngữ, còn nav thì có. Gộp chung sẽ khiến cùng một URL logo
 *      bị lưu lặp trong cache của mỗi locale.
 *   2. Hai bề mặt tách nhau ở Control Plane (`/v1/site/settings` và `/v1/site/nav`).
 *
 * Layout gọi hai hàm SONG SONG bằng `Promise.all`, nên hai lời gọi mạng chỉ tốn độ trễ của
 * một lời gọi.
 */

export interface SiteSettings {
  /** `null` = chưa đặt logo. Header rơi về hiển thị tên thương hiệu bằng chữ. */
  logoUrl: string | null;
}

const TTL_MS = 60_000;

/** Cache một ô: cài đặt không phụ thuộc locale nên không cần khoá. */
let cached: { value: SiteSettings; expiresAt: number } | undefined;

/** Chỉ dùng trong test — xoá cache để mỗi ca chạy trên trạng thái sạch. */
export function clearSiteSettingsCache(): void {
  cached = undefined;
}

const EMPTY: SiteSettings = { logoUrl: null };

export async function getSiteSettings(): Promise<SiteSettings> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;

  const { value, ok } = await load();

  // Kết quả dự phòng cache ngắn hơn nhiều: Control Plane chết thì không nện nó mỗi request,
  // nhưng cũng không giữ trạng thái "chưa có logo" suốt một phút sau khi nó sống lại.
  cached = { value, expiresAt: now + (ok ? TTL_MS : TTL_MS / 6) };
  return value;
}

async function load(): Promise<{ value: SiteSettings; ok: boolean }> {
  try {
    const response = await callControlPlane({ method: 'GET', path: '/v1/site/settings' });

    if (!response.ok) {
      console.warn(`[site-settings] Control Plane trả ${response.status} — dùng mặc định`);
      return { value: EMPTY, ok: false };
    }

    const payload = (await response.json()) as { logoUrl?: unknown };

    // Đọc phòng thủ: chỉ nhận chuỗi. Payload lệch hợp đồng thì coi như chưa đặt logo, chứ
    // không đẩy một giá trị lạ vào thuộc tính `src` trên mọi trang.
    return {
      value: { logoUrl: typeof payload.logoUrl === 'string' ? payload.logoUrl : null },
      ok: true,
    };
  } catch (error) {
    // Gồm cả `ControlPlaneBoundaryNotWiredError` — dev chưa dựng Control Plane vẫn phải mở
    // được trang chủ.
    console.warn('[site-settings] không đọc được cài đặt, dùng mặc định:', error);
    return { value: EMPTY, ok: false };
  }
}
