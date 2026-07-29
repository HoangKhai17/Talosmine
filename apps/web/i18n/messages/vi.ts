/**
 * Bản tiếng Việt — NGUỒN của bộ khoá (DEC-T25).
 *
 * File này định nghĩa hình dạng; `en.ts` khai `satisfies Messages` nên thiếu một khoá là lỗi
 * TYPECHECK, không phải lỗi ai đó tình cờ thấy trên trang thật.
 *
 * QUY ƯỚC ĐẶT KHOÁ: nhóm theo NƠI XUẤT HIỆN (`header`, `home`, `tools`…), không nhóm theo
 * loại từ. Người sửa chữ luôn xuất phát từ "dòng này nằm ở đâu trên trang".
 *
 * HAI LOẠI CHỮ ĐANG NẰM CHUNG Ở ĐÂY — biết để không ngạc nhiên khi làm CMS:
 *
 *   1. Chuỗi SẢN PHẨM (nhãn nút, `aria-label`, thông báo lỗi). Ở lại đây vĩnh viễn.
 *   2. Copy MARKETING (tiêu đề section, đoạn dẫn). Sẽ chuyển sang CMS; lúc đó các khoá này
 *      trở thành GIÁ TRỊ DỰ PHÒNG khi Control Plane không trả lời được (DEC-T26), chứ không
 *      bị xoá.
 *
 * Chữ mang `{n}`, `{year}`… là tham số, thay bằng `format()`. Giữ nguyên dấu ngoặc khi dịch.
 */
export const vi = {
  /** Chuỗi chỉ dành cho công nghệ trợ năng — không hiển thị trên màn hình. */
  a11y: {
    skipToContent: 'Bỏ qua tới nội dung chính',
    primaryNav: 'Điều hướng chính',
    breadcrumb: 'Đường dẫn',
    partners: 'Đối tác',
    results: 'Kết quả',
    filters: 'Bộ lọc',
    searchTools: 'Tìm kiếm công cụ',
    prevCategory: 'Danh mục trước',
    nextCategory: 'Danh mục sau',
    actions: 'Hành động',
    openMenu: 'Mở menu',
    closeMenu: 'Đóng menu',
  },

  /** Dùng lại ở nhiều trang. Sửa ở đây là sửa mọi nơi — đó là điểm của nhóm này. */
  common: {
    loading: 'Đang tải…',
    retry: 'Thử lại',
    home: 'Trang chủ',
    backToHome: 'Về trang chủ',
    viewAll: 'Xem tất cả →',
    loadMore: 'Xem thêm',
    tag: 'Nhãn',
    publishDate: 'Ngày đăng',
    readTime: '{minutes} phút đọc',
    sampleDate: '15/05/2026',
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
    rights: '© {year} Talosmine. Bảo lưu mọi quyền.',
  },

  nav: {
    tools: 'Công cụ',
    blog: 'Blog',
    contact: 'Liên hệ',
  },

  /**
   * Trang hệ thống: `loading.tsx`, `not-found.tsx`, `error.tsx`.
   *
   * Chúng nằm ở GỐC `app/`, ngoài `[locale]`, nên không có `params` để đọc — locale lấy từ
   * header `x-locale` do proxy đặt (xem `i18n/params.ts`).
   */
  system: {
    loading: 'Đang tải…',
    notFoundTitle: 'Không tìm thấy trang',
    notFoundBody: 'Địa chỉ bạn mở không tồn tại hoặc không khả dụng.',
    backToSite: 'Về trang chính',
    errorTitle: 'Đã xảy ra lỗi',
    errorBody: 'Không hiển thị được nội dung này. Bạn có thể thử lại.',
    errorReference: 'Mã tham chiếu:',
  },

  /** `<title>` của từng trang. Đọc bởi `generateMetadata`. */
  /**
   * Màn hình khảo sát onboarding. NỘI DUNG CÂU HỎI không nằm ở đây — nó đến từ database và
   * sửa được trong `/admin`. Chỉ khung màn hình (tiêu đề, nút) là chuỗi sản phẩm.
   */
  onboarding: {
    title: 'Thiết lập Talosmine của bạn',
    lead: 'Trả lời vài câu hỏi ngắn để chúng tôi cá nhân hoá trải nghiệm và gợi ý đúng công cụ AI cho bạn.',
    duration: 'Chỉ mất khoảng một phút.',
    needHelp: 'Cần trợ giúp?',
    complete: 'Hoàn tất thiết lập',
    submitting: 'Đang lưu…',
    skip: 'Bỏ qua bước này',
    submitFailed: 'Không lưu được khảo sát. Vui lòng thử lại.',
    /** `{count}` là số lựa chọn tối thiểu còn thiếu. */
    needMore: 'Chọn thêm {count} mục nữa',
  },

  /**
   * Trang văn bản pháp lý (`/terms`, `/privacy`). THÂN VĂN BẢN không nằm ở đây — nó là khe
   * `legal.*` soạn trong `/admin/content/pages`; ở đây chỉ có khung trang.
   */
  legal: {
    termsTitle: 'Điều khoản dịch vụ',
    privacyTitle: 'Chính sách riêng tư',
    updating: 'Nội dung đang được biên soạn và sẽ sớm được cập nhật tại đây.',
  },

  meta: {
    home: 'Talosmine — Khám phá công cụ để xây dựng và phát triển',
    tools: 'Talosmine — Duyệt công cụ theo danh mục',
    blog: 'Talosmine — Blog',
    blogPost: 'Talosmine — Bài viết',
    categories: 'Talosmine — Danh mục',
    contact: 'Talosmine — Liên hệ',
    submit: 'Talosmine — Gửi công cụ',
    terms: 'Talosmine — Điều khoản dịch vụ',
    privacy: 'Talosmine — Chính sách riêng tư',
    account: 'Talosmine — Tài khoản',
    sessions: 'Talosmine — Phiên đăng nhập',
  },

  home: {
    heroTitle: 'Khám phá công cụ tốt nhất để xây dựng và phát triển',
    heroLead:
      'Danh mục được tuyển chọn gồm những công cụ và tài nguyên tốt nhất dành cho người sáng tạo, lập trình viên và đội ngũ đang tăng trưởng.',
    searchPlaceholder: 'Tìm công cụ, danh mục hoặc từ khoá…',
    searchSubmit: 'Tìm',
    popularLabel: 'Tìm nhiều:',
    popularTerm: 'Từ khoá {n}',
    partnerName: 'Logo',
    partnerText: 'Mô tả ngắn về đối tác sẽ hiển thị ở đây khi có nội dung thật.',
    statToolCount: '10.000+ công cụ',
    statCategoryCount: '500+ danh mục',
    statUpdated: 'Cập nhật mỗi ngày',
    toolsTitle: 'Tìm đúng công cụ cho mọi công việc',
    toolsLead:
      'Khám phá, tìm kiếm và chọn ra công cụ phù hợp cho công việc, học tập, sáng tạo và phát triển sản phẩm.',
    toolName: 'Tên công cụ',
    toolDescription: 'Mô tả ngắn về công cụ sẽ hiển thị ở đây khi danh mục được kết nối.',
    toolMeta: 'Danh mục · Lượt dùng',
    categoriesTitle: 'Khám phá danh mục',
    categoryName: 'Danh mục',
    whatsNewTitle: 'Có gì mới',
    whatsNewLead:
      'Mỗi ngày chúng tôi bổ sung công cụ và nền tảng mới để bạn không bỏ lỡ thứ đáng thử.',
    articleTitle: 'Tiêu đề bài viết sẽ hiển thị ở đây khi có nội dung thật',
    articleMeta: 'Ngày đăng · Tác giả',
    blogTitle: 'Blog',
    featuredArticleTitle: 'Tiêu đề bài viết nổi bật sẽ hiển thị ở đây khi có nội dung thật',
    articleLead:
      'Đoạn mở đầu của bài viết. Nội dung này đến từ hệ thống blog, sẽ được kết nối ở giai đoạn sau.',
    articleLeadShort: 'Đoạn mở đầu của bài viết sẽ hiển thị ở đây.',
    faqTitle: 'Câu hỏi thường gặp',
    faqLead: 'Giải đáp nhanh những thắc mắc phổ biến, tập hợp ở một nơi.',
    faqAsk: 'Đặt câu hỏi',
    faqQuestion1: 'Talosmine là gì và hoạt động thế nào?',
    faqQuestion2: 'Làm sao để gửi công cụ của tôi lên đây?',
    faqQuestion3: 'Danh mục được kiểm duyệt như thế nào?',
    faqQuestion4: 'Tôi có cần tài khoản để sử dụng không?',
    faqAnswer:
      'Nội dung trả lời sẽ được biên soạn khi hệ thống có đủ tính năng. Phần này hiện chỉ minh hoạ bố cục.',
  },

  tools: {
    breadcrumb: 'Công cụ',
    title: 'Duyệt công cụ AI theo danh mục',
    lead: 'Khám phá bộ sưu tập công cụ AI đang lớn dần, so sánh khả năng và tìm đúng giải pháp cho từng dự án, từng quy trình làm việc.',
    categoryTab: 'Danh mục {n}',
    filterNameLabel: 'Tên công cụ',
    filterSearchPlaceholder: 'Tìm kiếm…',
    filterPriceLabel: 'Giá',
    priceAll: 'Tất cả',
    priceFree: 'Miễn phí',
    pricePaid: 'Trả phí',
    priceFreePaid: 'Miễn phí + Trả phí',
    featureLegend: 'Tính năng',
    featureApi: 'Có API',
    featureNoCode: 'Không cần code',
    featureOpenSource: 'Mã nguồn mở',
    featureExtension: 'Tiện ích trình duyệt',
    modelLegend: 'Mô hình',
    modelName: 'Mô hình {n}',
    sortLegend: 'Sắp xếp theo',
    sortPopular: 'Phổ biến nhất',
    sortNewest: 'Mới nhất',
    sortTopRated: 'Đánh giá cao nhất',
    cardTitle: 'Tên công cụ',
    cardDescription: 'Mô tả ngắn về công cụ sẽ hiển thị ở đây khi danh mục được kết nối.',
    cardDescriptionSecond:
      'Đoạn thứ hai giữ chỗ để thấy chiều cao thật của thẻ khi mô tả dài hơn một dòng.',
    cardTag: 'Nhãn {n}',
  },

  blog: {
    breadcrumb: 'Blog',
    title: 'Khám phá. Học hỏi. Mọi thứ bạn cần ở một nơi.',
    lead: 'Góc nhìn thực tế, kinh nghiệm từ người làm nghề và những cách làm đã được kiểm chứng — gom lại trong một mạch đọc liền.',
    searchLabel: 'Tìm bài viết',
    topicAll: 'Tất cả',
    topicGuide: 'Hướng dẫn',
    topicLesson: 'Bài học',
    topicCompare: 'So sánh',
    topicProcess: 'Quy trình',
    topicNews: 'Tin tức',
    topicReview: 'Đánh giá',
    topicPrompt: 'Prompt',
    latestTitle: 'Khám phá tin mới nhất',
    featuredTitle: 'Bài viết nổi bật',
    trendingTitle: 'Chủ đề thịnh hành',
    trendingTopic: '#ChuDe{n}',
  },

  blogPost: {
    topic: 'Chủ đề',
    breadcrumbTitle: 'Tiêu đề bài viết',
    title: 'Tiêu đề bài viết sẽ hiển thị ở đây khi hệ thống blog được kết nối',
    lead: 'Đoạn tóm tắt ngắn nằm ngay dưới tiêu đề, nói cho người đọc biết bài này giải quyết chuyện gì trước khi họ quyết định đọc tiếp.',
    heading1: 'Tiêu đề phụ thứ nhất',
    heading2: 'Tiêu đề phụ thứ hai',
    heading3: 'Tiêu đề phụ thứ ba',
    heading4: 'Tiêu đề phụ thứ tư',
    paragraphLong:
      'Đây là đoạn văn mẫu để thấy nhịp dòng và độ dài dòng đọc của thân bài. Nội dung thật sẽ đến từ hệ thống blog ở giai đoạn sau, nên phần chữ ở đây chỉ có nhiệm vụ chiếm đúng chỗ mà một đoạn văn thật sẽ chiếm, không nhiều hơn cũng không ít hơn.',
    paragraphShort:
      'Đoạn tiếp theo ngắn hơn, để thấy khoảng cách giữa hai đoạn liền nhau và giữa một đoạn với tiêu đề phụ ngay dưới nó.',
    quote:
      'Một câu trích dẫn nổi bật trong bài. Khối này có vạch đậm bên trái và nền phụ để tách khỏi mạch đọc chính.',
    listItem1: 'Ý thứ nhất trong danh sách gạch đầu dòng.',
    listItem2: 'Ý thứ hai, dài hơn một chút để thấy dòng thứ hai thụt vào đúng chỗ.',
    listItem3: 'Ý thứ ba.',
    listItem4: 'Ý thứ tư.',
    relatedTitle: 'Bài viết liên quan',
  },

  newsletter: {
    title: 'Đăng ký bản tin và cập nhật mỗi tuần',
    text: 'Nhận tổng hợp công cụ mới, bài viết đáng đọc và thay đổi đáng chú ý của nền tảng — mỗi tuần một lần, không spam.',
    emailLabel: 'Địa chỉ thư điện tử',
    emailPlaceholder: 'Địa chỉ thư điện tử của bạn…',
    submit: 'Đăng ký',
  },

  comingSoon: {
    body: 'Phần này chưa được xây dựng. Danh mục ứng dụng thuộc giai đoạn sau và còn chờ chốt danh sách ứng dụng của Hub.',
    categoriesTitle: 'Danh mục',
    categoriesDescription: 'Các nhóm công cụ được phân loại theo mục đích sử dụng.',
    contactTitle: 'Liên hệ',
    contactDescription: 'Cách liên hệ với đội ngũ Talosmine sẽ hiển thị tại đây.',
    submitTitle: 'Gửi công cụ',
    submitDescription: 'Biểu mẫu đề xuất công cụ mới để đưa vào danh mục.',
  },

  account: {
    title: 'Tài khoản',
    loadFailed: 'Không tải được thông tin tài khoản.',
    email: 'Email',
    emailEmpty: 'Chưa có',
    emailVerification: 'Xác minh email',
    verified: 'Đã xác minh',
    unverified: 'Chưa xác minh',
    status: 'Trạng thái',
    statusActive: 'Đang hoạt động',
    statusPending: 'Chờ kích hoạt',
    statusDisabled: 'Đã khóa',
    createdAt: 'Ngày tạo',
    idpNote:
      'Email và mật khẩu do hệ thống đăng nhập quản lý, không chỉnh sửa tại đây. Tài khoản của bạn được nhận dạng bằng danh tính đăng nhập, không phải bằng email.',
    viewSessions: 'Xem các phiên đăng nhập',
    editProfile: 'Sửa hồ sơ',
    displayName: 'Tên hiển thị',
    locale: 'Ngôn ngữ',
    timezone: 'Múi giờ',
    saved: 'Đã lưu thay đổi.',
    saveFailed: 'Không lưu được.',
    saving: 'Đang lưu…',
    save: 'Lưu thay đổi',
  },

  sessions: {
    title: 'Phiên đăng nhập',
    lead: 'Danh sách thiết bị đang đăng nhập vào tài khoản của bạn. Nếu thấy phiên lạ, hãy thu hồi ngay.',
    loadFailed: 'Không tải được danh sách phiên.',
    empty: 'Chưa có phiên nào.',
    caption: '{active} phiên còn hiệu lực trên tổng số {total}',
    colCreatedAt: 'Đăng nhập lúc',
    colLastSeen: 'Hoạt động gần nhất',
    colExpires: 'Hết hạn',
    colStatus: 'Trạng thái',
    revoked: 'Đã thu hồi',
    thisDevice: 'Thiết bị này',
    active: 'Đang hoạt động',
    revoke: 'Thu hồi',
    revoking: 'Đang thu hồi…',
    confirmRevokeOne: 'Thu hồi phiên này? Thiết bị đó sẽ bị đăng xuất ngay.',
    revokedOne: 'Đã thu hồi phiên.',
    revokeFailed: 'Không thu hồi được phiên.',
    confirmRevokeAll: 'Đăng xuất khỏi MỌI thiết bị, kể cả thiết bị này? Bạn sẽ phải đăng nhập lại.',
    revokeAll: 'Đăng xuất khỏi mọi thiết bị',
    revokingAll: 'Đang đăng xuất…',
    revokeAllFailed: 'Không đăng xuất được.',
    revokeAllNote: 'Bao gồm cả thiết bị này — bạn sẽ phải đăng nhập lại.',
    backToAccount: 'Về trang tài khoản',
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
