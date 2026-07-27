import type { Locale } from '../i18n/locale';
import { getMessages } from '../i18n/messages';
import { callControlPlane } from './control-plane-boundary';

/**
 * Điều hướng header/footer đọc từ Control Plane, có cache và có đường lui.
 *
 * BA RÀNG BUỘC ĐỊNH HÌNH FILE NÀY:
 *
 * 1. **Fallback là BẮT BUỘC (DEC-T26).** Header và footer nằm trên MỌI trang. Nếu chúng phụ
 *    thuộc một lời gọi mạng không có đường lui thì một sự cố Control Plane làm trắng toàn bộ
 *    trang marketing — đổi một lỗi cục bộ thành sự cố toàn site.
 *
 * 2. **Cache là BẮT BUỘC.** Toàn site chạy `force-dynamic`, nên không cache nghĩa là mỗi
 *    lượt xem trang cộng thêm một round-trip tới Control Plane. TTL 60 giây (DEC-T26).
 *
 * 3. **Không dựa vào cache `fetch` của Next.** Dưới `force-dynamic`, mặc định là không cache;
 *    và dựa vào một hành vi framework có thể đổi giữa hai bản minor là chỗ dễ vỡ âm thầm.
 *    Cache ở đây là một `Map` tường minh, đọc được, test được.
 */

export interface NavItem {
  id: string;
  label: string;
  href: string;
}

export type NavMenuKey = 'header.primary' | 'footer.explore' | 'footer.about' | 'footer.resources';

export type SiteNav = Record<NavMenuKey, NavItem[]>;

/** Nguồn dữ liệu đã dùng để render — hữu ích khi gỡ lỗi "sao menu không đổi". */
export type NavSource = 'control-plane' | 'fallback';

export interface SiteNavResult {
  nav: SiteNav;
  source: NavSource;
}

const TTL_MS = 60_000;

interface CacheEntry {
  result: SiteNavResult;
  expiresAt: number;
}

/**
 * Cache theo tiến trình, khoá theo locale.
 *
 * PHẠM VI LÀ MỘT TIẾN TRÌNH: nhiều instance web sẽ hết hạn lệch nhau, nên trong vòng 60
 * giây sau khi publish, hai người dùng có thể thấy hai phiên bản menu. Chấp nhận được cho
 * nội dung điều hướng; vô hiệu hoá xuyên tiến trình cần pub/sub và chưa làm (DEC-T26).
 */
const cache = new Map<Locale, CacheEntry>();

/** Chỉ dùng trong test — xoá cache để mỗi ca chạy trên trạng thái sạch. */
export function clearSiteNavCache(): void {
  cache.clear();
}

/**
 * Hình dạng Control Plane trả về. Khai tại chỗ thay vì import type sinh từ OpenAPI: file này
 * phải xử lý được cả trường hợp payload KHÔNG khớp hợp đồng (phiên bản lệch, proxy chen
 * giữa), nên nó coi dữ liệu vào là `unknown` rồi tự kiểm.
 */
interface RawNavResponse {
  menus?: Array<{ key?: unknown; items?: unknown }>;
}

export async function getSiteNav(locale: Locale): Promise<SiteNavResult> {
  const now = Date.now();
  const cached = cache.get(locale);
  if (cached && cached.expiresAt > now) return cached.result;

  const result = await load(locale);

  // Cache CẢ kết quả fallback, nhưng ngắn hơn nhiều: nếu Control Plane đang chết, ta không
  // muốn nện nó mỗi request — nhưng cũng không muốn giữ menu dự phòng suốt một phút sau khi
  // nó đã sống lại.
  cache.set(locale, {
    result,
    expiresAt: now + (result.source === 'control-plane' ? TTL_MS : TTL_MS / 6),
  });

  return result;
}

async function load(locale: Locale): Promise<SiteNavResult> {
  try {
    const response = await callControlPlane({
      method: 'GET',
      path: `/v1/site/nav?locale=${encodeURIComponent(locale)}`,
    });

    if (!response.ok) {
      console.warn(`[site-nav] Control Plane trả ${response.status} — dùng menu dự phòng`);
      return { nav: fallbackNav(locale), source: 'fallback' };
    }

    const parsed = parseNav(await response.json());

    // Payload hợp lệ nhưng RỖNG (chưa ai nhập mục nào) vẫn là fallback: một header không có
    // menu nào trông như trang hỏng, và ở giai đoạn này bảng gần như chắc chắn còn trống.
    if (isEmpty(parsed)) {
      return { nav: fallbackNav(locale), source: 'fallback' };
    }

    return { nav: parsed, source: 'control-plane' };
  } catch (error) {
    // Gồm cả `ControlPlaneBoundaryNotWiredError` (chưa cấu hình env) — dev chưa dựng
    // Control Plane vẫn phải mở được trang chủ.
    console.warn('[site-nav] không đọc được điều hướng, dùng menu dự phòng:', error);
    return { nav: fallbackNav(locale), source: 'fallback' };
  }
}

const MENU_KEYS: NavMenuKey[] = [
  'header.primary',
  'footer.explore',
  'footer.about',
  'footer.resources',
];

function emptyNav(): SiteNav {
  return {
    'header.primary': [],
    'footer.explore': [],
    'footer.about': [],
    'footer.resources': [],
  };
}

/**
 * Đọc payload một cách phòng thủ.
 *
 * Mục nào thiếu `label` hoặc `href` bị BỎ QUA thay vì render ra `undefined` giữa header.
 * Một mục menu vắng mặt là chuyện nhỏ; chữ `undefined` trên mọi trang thì không.
 */
function parseNav(payload: unknown): SiteNav {
  const nav = emptyNav();
  const menus = (payload as RawNavResponse | null)?.menus;
  if (!Array.isArray(menus)) return nav;

  for (const menu of menus) {
    const key = menu?.key;
    if (typeof key !== 'string' || !MENU_KEYS.includes(key as NavMenuKey)) continue;
    if (!Array.isArray(menu.items)) continue;

    const items: NavItem[] = [];
    for (const item of menu.items as unknown[]) {
      const record = item as Record<string, unknown> | null;
      if (
        typeof record?.id === 'string' &&
        typeof record.label === 'string' &&
        typeof record.href === 'string'
      ) {
        items.push({ id: record.id, label: record.label, href: record.href });
      }
    }
    nav[key as NavMenuKey] = items;
  }

  return nav;
}

function isEmpty(nav: SiteNav): boolean {
  return MENU_KEYS.every((key) => nav[key].length === 0);
}

/**
 * Menu dự phòng — chính là những gì đã hardcode trong `layout.tsx` trước khi có CMS.
 *
 * Nhãn lấy từ message catalog nên nó tự đúng ngôn ngữ, và không có chuỗi nào bị khai hai
 * lần. Đây đúng là đường di cư mà DEC-T26 mô tả: chữ cũ KHÔNG bị xoá, nó trở thành lớp lui.
 *
 * `id` mang tiền tố `fallback-` để nhìn DOM là biết trang đang chạy bằng dữ liệu nào.
 */
export function fallbackNav(locale: Locale): SiteNav {
  const t = getMessages(locale);

  return {
    'header.primary': [
      { id: 'fallback-tools', label: t.nav.tools, href: '/tools' },
      { id: 'fallback-blog', label: t.nav.blog, href: '/blog' },
      { id: 'fallback-contact', label: t.nav.contact, href: '/contact' },
    ],
    'footer.explore': [
      { id: 'fallback-all-tools', label: t.footer.allTools, href: '/tools' },
      { id: 'fallback-categories', label: t.footer.categories, href: '/categories' },
      { id: 'fallback-submit', label: t.footer.submitTool, href: '/submit' },
    ],
    'footer.about': [
      { id: 'fallback-footer-blog', label: t.footer.blog, href: '/blog' },
      { id: 'fallback-footer-contact', label: t.footer.contact, href: '/contact' },
    ],
    // Cột "Tài nguyên" chưa có trang nào — xem `footerPending` trong layout.
    'footer.resources': [],
  };
}
