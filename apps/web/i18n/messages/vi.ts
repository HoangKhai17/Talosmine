/**
 * Bản tiếng Việt — NGUỒN của bộ khoá (DEC-T25).
 *
 * File này định nghĩa hình dạng; `en.ts` khai `satisfies Messages` nên thiếu một khoá là lỗi
 * TYPECHECK, không phải lỗi ai đó tình cờ thấy trên trang thật.
 *
 * PHẠM VI: chỉ chuỗi thuộc về SẢN PHẨM (nhãn nút, tiêu đề mục, thông báo lỗi, `aria-label`).
 * Nhãn menu và nội dung marketing sẽ đến từ CMS — đừng thêm chúng vào đây, nếu không sẽ có
 * hai nguồn sự thật cho cùng một dòng chữ.
 *
 * QUY ƯỚC ĐẶT KHOÁ: nhóm theo NƠI XUẤT HIỆN (`header`, `footer`, `a11y`), không nhóm theo
 * loại từ. Người sửa chữ luôn xuất phát từ "dòng này nằm ở đâu trên trang".
 */
export const vi = {
  /** Chuỗi chỉ dành cho công nghệ trợ năng — không hiển thị trên màn hình. */
  a11y: {
    skipToContent: 'Bỏ qua tới nội dung chính',
    primaryNav: 'Điều hướng chính',
  },

  header: {
    account: 'Tài khoản',
    signIn: 'Đăng nhập',
    signOut: 'Đăng xuất',
    signingOut: 'Đang đăng xuất…',
    signOutFailed: 'Không đăng xuất được. Vui lòng thử lại.',
    submitTool: 'Gửi công cụ',
  },

  footer: {
    tagline: 'Nơi tập hợp công cụ, tài nguyên và thông tin để bạn xây dựng và phát triển.',
    explore: 'Khám phá',
    allTools: 'Tất cả công cụ',
    categories: 'Danh mục',
    submitTool: 'Gửi công cụ',
    about: 'Về chúng tôi',
    aboutUs: 'Giới thiệu',
    blog: 'Blog',
    contact: 'Liên hệ',
    privacy: 'Chính sách riêng tư',
    resources: 'Tài nguyên',
    guides: 'Hướng dẫn',
    newsletter: 'Bản tin',
    faq: 'Câu hỏi thường gặp',
    /** `{year}` được thay lúc render. Giữ dấu ngoặc nhọn khi dịch. */
    rights: '© {year} Talosmine. Bảo lưu mọi quyền.',
  },

  nav: {
    tools: 'Công cụ',
    blog: 'Blog',
    contact: 'Liên hệ',
  },
} as const;

/**
 * Hình dạng bắt buộc của MỌI bản dịch.
 *
 * Suy ra từ `vi` thay vì khai tay: khai tay thì mỗi lần thêm khoá phải sửa hai chỗ, và chỗ
 * thứ hai sẽ có ngày bị quên.
 *
 * Kiểu là `string` (không phải literal của bản tiếng Việt) — nếu không, `en.ts` sẽ buộc phải
 * chứa đúng chữ tiếng Việt mới qua được typecheck.
 */
export type Messages = {
  readonly [Section in keyof typeof vi]: {
    readonly [Key in keyof (typeof vi)[Section]]: string;
  };
};
