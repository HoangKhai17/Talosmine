import { en } from '../../../../i18n/messages/en';
import { vi } from '../../../../i18n/messages/vi';

/**
 * Danh mục khe nội dung cho màn hình quản trị — nhóm theo TRANG, đúng cách người biên tập
 * nghĩ ("dòng này nằm ở đâu").
 *
 * PHẢI KHỚP `CONTENT_SLOT_KEYS` của Control Plane (và CHECK ở migration 0013). Backend là
 * chốt chặn thật: một khoá thừa ở đây sẽ bị API từ chối bằng 400 chứ không lặng lẽ ghi rác.
 *
 * Nhãn và chữ mặc định nằm ở ĐÂY chứ không ở Control Plane: chỉ web biết khe nào render ở
 * đâu và chữ dự phòng của nó là gì — Control Plane chỉ giữ giá trị override.
 */

export interface SlotDef {
  key: string;
  label: string;
  /** Đoạn dẫn/mô tả dài dùng textarea; tiêu đề dùng input một dòng. */
  multiline?: boolean;
  /** Trần ký tự khác 2000 — hiện chỉ nhóm `legal.*` (50k, khớp backend). */
  maxLength?: number;
}

export interface SlotGroup {
  title: string;
  slots: SlotDef[];
}

/** Hai khoá SEO cuối mỗi nhóm — mọi trang đều có, khai một chỗ cho khỏi lệch nhãn. */
function seo(page: string): SlotDef[] {
  return [
    { key: `meta.${page}`, label: 'SEO — thẻ <title>' },
    {
      key: `seo.description.${page}`,
      label: 'SEO — thẻ mô tả (meta description)',
      multiline: true,
    },
  ];
}

export const SLOT_GROUPS: SlotGroup[] = [
  {
    title: 'Trang chủ',
    slots: [
      { key: 'home.heroTitle', label: 'Hero — tiêu đề' },
      { key: 'home.heroLead', label: 'Hero — đoạn dẫn', multiline: true },
      { key: 'home.statToolCount', label: 'Dải số liệu — số công cụ' },
      { key: 'home.statCategoryCount', label: 'Dải số liệu — số danh mục' },
      { key: 'home.statUpdated', label: 'Dải số liệu — tần suất cập nhật' },
      { key: 'home.toolsTitle', label: 'Section Công cụ — tiêu đề' },
      { key: 'home.toolsLead', label: 'Section Công cụ — đoạn dẫn', multiline: true },
      { key: 'home.categoriesTitle', label: 'Section Danh mục — tiêu đề' },
      { key: 'home.whatsNewTitle', label: 'Section Có gì mới — tiêu đề' },
      { key: 'home.whatsNewLead', label: 'Section Có gì mới — đoạn dẫn', multiline: true },
      { key: 'home.blogTitle', label: 'Section Blog — tiêu đề' },
      { key: 'home.faqTitle', label: 'Section FAQ — tiêu đề' },
      { key: 'home.faqLead', label: 'Section FAQ — đoạn dẫn', multiline: true },
      ...seo('home'),
    ],
  },
  {
    title: 'Trang Công cụ',
    slots: [
      { key: 'tools.title', label: 'Tiêu đề trang' },
      { key: 'tools.lead', label: 'Đoạn dẫn', multiline: true },
      ...seo('tools'),
    ],
  },
  {
    title: 'Trang Blog',
    slots: [
      { key: 'blog.title', label: 'Tiêu đề trang' },
      { key: 'blog.lead', label: 'Đoạn dẫn', multiline: true },
      { key: 'blog.latestTitle', label: 'Section Tin mới nhất — tiêu đề' },
      { key: 'blog.featuredTitle', label: 'Section Bài nổi bật — tiêu đề' },
      { key: 'blog.trendingTitle', label: 'Section Chủ đề thịnh hành — tiêu đề' },
      ...seo('blog'),
    ],
  },
  {
    title: 'Trang Danh mục',
    slots: [
      { key: 'comingSoon.categoriesTitle', label: 'Tiêu đề trang' },
      { key: 'comingSoon.categoriesDescription', label: 'Mô tả', multiline: true },
      ...seo('categories'),
    ],
  },
  {
    title: 'Trang Liên hệ',
    slots: [
      { key: 'comingSoon.contactTitle', label: 'Tiêu đề trang' },
      { key: 'comingSoon.contactDescription', label: 'Mô tả', multiline: true },
      ...seo('contact'),
    ],
  },
  {
    title: 'Trang Gửi công cụ',
    slots: [
      { key: 'comingSoon.submitTitle', label: 'Tiêu đề trang' },
      { key: 'comingSoon.submitDescription', label: 'Mô tả', multiline: true },
      ...seo('submit'),
    ],
  },
  {
    title: 'Dùng chung trên nhiều trang',
    slots: [
      { key: 'footer.tagline', label: 'Footer — câu giới thiệu', multiline: true },
      { key: 'newsletter.title', label: 'Khối bản tin — tiêu đề' },
      { key: 'newsletter.text', label: 'Khối bản tin — mô tả', multiline: true },
    ],
  },
  {
    title: 'Văn bản pháp lý',
    slots: [
      {
        key: 'legal.terms',
        label: 'Điều khoản dịch vụ — toàn văn (trang /terms)',
        multiline: true,
        maxLength: 50_000,
      },
      {
        key: 'legal.privacy',
        label: 'Chính sách riêng tư — toàn văn (trang /privacy)',
        multiline: true,
        maxLength: 50_000,
      },
    ],
  },
];

/**
 * Chữ mặc định trong code cho một khe — hiện làm placeholder để người biên tập thấy trang
 * đang dùng gì khi ô còn trống.
 *
 * Nhóm `seo.description.*` trả `null`: không có bản dự phòng, chưa đặt thì trang không phát
 * thẻ description.
 */
export function fallbackText(key: string, locale: 'vi' | 'en'): string | null {
  const catalog: Record<string, Record<string, unknown>> = locale === 'vi'
    ? (vi as unknown as Record<string, Record<string, unknown>>)
    : (en as unknown as Record<string, Record<string, unknown>>);

  const dot = key.indexOf('.');
  if (dot === -1) return null;
  const value = catalog[key.slice(0, dot)]?.[key.slice(dot + 1)];
  return typeof value === 'string' ? value : null;
}
