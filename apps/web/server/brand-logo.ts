import { callControlPlane } from './control-plane-boundary';
import { getSiteSettings } from './site-settings';

/**
 * Logo thương hiệu — hợp nhất HAI nguồn theo thứ tự ưu tiên:
 *
 *   1. File TẢI LÊN trong `/admin` (bảng `site_assets`, migration 0015) — đường chính.
 *   2. `site_settings.logo.url` (URL ảnh host ngoài) — đường thay thế còn giữ lại.
 *   3. Không có gì → logo chữ.
 *
 * Cùng ba ràng buộc với `site-nav.ts`: cache 60s theo tiến trình, fail-open, không dựa
 * cache `fetch` của Next. Bytes logo tối đa 512KB nên giữ trong RAM là không đáng kể.
 */

export interface UploadedLogo {
  mime: string;
  data: Buffer;
}

const TTL_MS = 60_000;
const ERROR_TTL_MS = TTL_MS / 6;

let cached: { file: UploadedLogo | null; expiresAt: number } | undefined;

/** Chỉ dùng trong test. */
export function clearBrandLogoCache(): void {
  cached = undefined;
}

/** File logo đã tải lên, hoặc `null` (chưa tải / Control Plane không trả lời). */
export async function getUploadedLogo(): Promise<UploadedLogo | null> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.file;

  let file: UploadedLogo | null = null;
  let ok = false;
  try {
    const response = await callControlPlane({ method: 'GET', path: '/v1/site/logo' });
    if (response.status === 404) {
      ok = true; // "chưa tải logo" là câu trả lời thật, cache đủ 60s
    } else if (response.ok) {
      const mime = response.headers.get('content-type') ?? 'application/octet-stream';
      file = { mime, data: Buffer.from(await response.arrayBuffer()) };
      ok = true;
    }
  } catch (error) {
    console.warn('[brand-logo] không đọc được logo tải lên, dùng đường thay thế:', error);
  }

  cached = { file, expiresAt: now + (ok ? TTL_MS : ERROR_TTL_MS) };
  return file;
}

/**
 * `src` cho thẻ `<img>` logo, hoặc `null` để render logo chữ.
 *
 * File tải lên phục vụ qua `/api/brand/logo` — CÙNG ORIGIN nên luôn nằm trong
 * `img-src 'self'`, không phụ thuộc allowlist nào.
 */
export async function getBrandLogoSrc(): Promise<string | null> {
  if ((await getUploadedLogo()) !== null) return '/api/brand/logo';
  return (await getSiteSettings()).logoUrl;
}
