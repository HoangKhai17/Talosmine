import { notFound } from 'next/navigation';
import { isLocale, type Locale } from '../i18n/locale';
import { getMessages, type Messages } from '../i18n/messages';
import { callControlPlane } from './control-plane-boundary';

/**
 * Khe nội dung (content slots) đọc từ Control Plane, merge đè lên message catalog.
 *
 * ĐÂY CHÍNH LÀ "fallback lúc chạy" mà ghi chú ở `i18n/messages/index.ts` hẹn viết khi CMS ra
 * đời: chữ trong code KHÔNG bị xoá — nó là lớp lui cho mọi khoá chưa được đặt trong CMS, và
 * cho cả trường hợp Control Plane không trả lời.
 *
 * CÙNG BA RÀNG BUỘC với `site-nav.ts` (DEC-T26):
 *   1. Fail-open BẮT BUỘC — lỗi mạng cho ra trang với chữ mặc định, không bao giờ trang trắng.
 *   2. Cache 60 giây theo tiến trình, khoá theo locale.
 *   3. Cache là `Map` tường minh, không dựa vào cache `fetch` của Next dưới `force-dynamic`.
 */

const TTL_MS = 60_000;
/** Lỗi thì cache NGẮN — không nện Control Plane mỗi request, nhưng cũng hồi phục nhanh. */
const ERROR_TTL_MS = TTL_MS / 6;

interface CacheEntry {
  overrides: Record<string, string>;
  expiresAt: number;
}

const cache = new Map<Locale, CacheEntry>();

/** Chỉ dùng trong test — xoá cache để mỗi ca chạy trên trạng thái sạch. */
export function clearSiteContentCache(): void {
  cache.clear();
}

/**
 * Toàn bộ khe ĐÃ ĐẶT của một ngôn ngữ. Khoá vắng mặt = dùng chữ trong code.
 *
 * Trả map phẳng thay vì merge sẵn vào catalog: `generateMetadata` cần đọc cả nhóm
 * `seo.description.*` — những khoá KHÔNG có trong catalog nên không thể hiện diện trong một
 * `Messages` đã merge.
 */
export async function getContentOverrides(locale: Locale): Promise<Record<string, string>> {
  const now = Date.now();
  const cached = cache.get(locale);
  if (cached && cached.expiresAt > now) return cached.overrides;

  const { overrides, ok } = await load(locale);
  cache.set(locale, { overrides, expiresAt: now + (ok ? TTL_MS : ERROR_TTL_MS) });
  return overrides;
}

async function load(locale: Locale): Promise<{ overrides: Record<string, string>; ok: boolean }> {
  try {
    const response = await callControlPlane({
      method: 'GET',
      path: `/v1/site/content?locale=${encodeURIComponent(locale)}`,
    });

    if (!response.ok) {
      console.warn(`[site-content] Control Plane trả ${response.status} — dùng chữ trong code`);
      return { overrides: {}, ok: false };
    }

    return { overrides: parseValues(await response.json()), ok: true };
  } catch (error) {
    // Gồm cả `ControlPlaneBoundaryNotWiredError` — dev chưa dựng Control Plane vẫn phải mở
    // được trang chủ.
    console.warn('[site-content] không đọc được khe nội dung, dùng chữ trong code:', error);
    return { overrides: {}, ok: false };
  }
}

/** Đọc payload phòng thủ: mục nào không phải chuỗi có chữ thì BỎ QUA, không đè chữ dự phòng. */
function parseValues(payload: unknown): Record<string, string> {
  const values = (payload as { values?: unknown } | null)?.values;
  if (typeof values !== 'object' || values === null) return {};

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === 'string' && value.trim() !== '') out[key] = value;
  }
  return out;
}

/**
 * Merge override đè lên message catalog.
 *
 * Khoá là đường dẫn hai đoạn `section.field` (`home.heroTitle`). Chỉ thay khi catalog THẬT SỰ
 * có khoá đó và giá trị là chuỗi — khoá ba đoạn (`seo.description.home`) hay khoá lạ từ một
 * phiên bản lệch đều rơi qua vô hại. Component nhận `Messages` như cũ, không biết chữ đến từ
 * đâu — đó là điểm khiến các trang gần như không phải sửa.
 */
export function mergeContent(t: Messages, overrides: Record<string, string>): Messages {
  const entries = Object.entries(overrides);
  if (entries.length === 0) return t;

  // Copy nông từng section bị đụng — section không có override giữ nguyên tham chiếu.
  const out = { ...(t as Record<string, Record<string, string>>) };
  for (const [key, value] of entries) {
    const dot = key.indexOf('.');
    if (dot === -1) continue;
    const section = key.slice(0, dot);
    const field = key.slice(dot + 1);

    const sectionValues = out[section];
    if (sectionValues === undefined || typeof sectionValues[field] !== 'string') continue;

    out[section] = { ...sectionValues, [field]: value };
  }

  return out as unknown as Messages;
}

/**
 * Bộ chữ ĐÃ MERGE cho một locale — điểm vào chính của các trang.
 *
 * `slots` trả kèm cho những khoá ngoài catalog (nhóm `seo.description.*`).
 */
export async function getContentMessages(
  locale: Locale,
): Promise<{ t: Messages; slots: Record<string, string> }> {
  const overrides = await getContentOverrides(locale);
  return { t: mergeContent(getMessages(locale), overrides), slots: overrides };
}

/**
 * Biến thể của `resolvePageI18n` cho trang có nội dung CMS: kiểm locale từ params rồi trả bộ
 * chữ đã merge. Trang đổi đúng MỘT dòng import để nhận chữ từ CMS.
 */
export async function resolvePageContent(params: Promise<{ locale: string }>): Promise<{
  locale: Locale;
  t: Messages;
  slots: Record<string, string>;
}> {
  const { locale } = await params;
  // Cùng hành vi với `resolveLocaleParam`: segment lạ là 404, không phải trang mặc định.
  if (!isLocale(locale)) notFound();
  const { t, slots } = await getContentMessages(locale);
  return { locale, t, slots };
}
