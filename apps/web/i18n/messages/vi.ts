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
    language: 'Chọn ngôn ngữ',
    skipToContent: 'Bỏ qua tới nội dung chính',
    primaryNav: 'Điều hướng chính',
    breadcrumb: 'Đường dẫn',
    toolHighlights: 'Công cụ nổi bật',
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
    rights: '© {year} Kolo. Bảo lưu mọi quyền.',
  },

  nav: {
    resources: 'Tài nguyên',
    wallet: 'Ví Cardano',
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
    title: 'Cá nhân hóa trải nghiệm KOLO của bạn',
    lead: 'Trả lời vài câu hỏi ngắn để chúng tôi cá nhân hoá trải nghiệm và gợi ý đúng công cụ AI cho bạn.',
    duration: 'Chỉ mất khoảng một phút.',
    needHelp: 'Cần trợ giúp?',
    step: 'Bước {current} / {total}',
    progress: 'Tiến độ khảo sát: bước {current} trên {total}',
    previous: 'Quay lại',
    next: 'Tiếp theo',
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
    resources: 'Kolo — Tài nguyên',
    home: 'Kolo — Khám phá công cụ để xây dựng và phát triển',
    tools: 'Kolo — Duyệt công cụ theo danh mục',
    blog: 'Kolo — Blog',
    blogPost: 'Kolo — Bài viết',
    categories: 'Kolo — Danh mục',
    contact: 'Kolo — Liên hệ',
    submit: 'Kolo — Gửi công cụ',
    terms: 'Kolo — Điều khoản dịch vụ',
    privacy: 'Kolo — Chính sách riêng tư',
    account: 'Kolo — Tài khoản',
    sessions: 'Kolo — Phiên đăng nhập',
    surveyAnswers: 'Kolo — Câu trả lời khảo sát',
  },

  home: {
    articleTitle: 'Tiêu đề bài viết sẽ hiển thị ở đây khi có nội dung thật',
    articleLead:
      'Đoạn mở đầu của bài viết. Nội dung này đến từ hệ thống blog, sẽ được kết nối ở giai đoạn sau.',
    startTitle: 'Bắt đầu',
    startToolsTitle: 'Chạy công cụ ngay trong trình duyệt',
    startToolsLead: 'Mở một công cụ và tính ngay. Không cài đặt, không cần tạo tài khoản.',
    startWalletTitle: 'Kết nối ví Cardano',
    startWalletLead: 'Kết nối ví CIP-30 và thử một giao dịch trên mạng Preprod.',
    startBrowseTitle: 'Duyệt theo danh mục',
    startBrowseLead: 'Lọc theo nhóm công việc hoặc tìm bằng từ khoá, ngay trên trang.',
    faqAnswer1:
      'Kolo là nơi tập hợp những công cụ nhỏ mà người bán hàng và chủ doanh nghiệp dùng hằng ngày: tính biên lợi nhuận, điểm hoà vốn, thuế, hoa hồng. Mỗi công cụ chạy thẳng trong trình duyệt, không phải cài gì.',
    faqAnswer2:
      'Phần gửi công cụ chưa mở. Hiện danh mục do đội ngũ chọn và kiểm trước khi đưa lên, để mỗi công cụ đều dùng được ngay thay vì là một danh sách link.',
    faqAnswer3:
      'Mỗi công cụ được thử tay trước khi thêm: phải chạy được, phải cho kết quả đúng, và phải thuộc quy trình thật của người bán hàng. Công cụ không đạt thì không lên danh mục.',
    faqAnswer4:
      'Không. Mọi công cụ đều mở tự do, không cần đăng nhập. Tài khoản chỉ cần khi bạn muốn lưu công cụ, tạo bộ sưu tập hoặc dùng phần thanh toán bằng ví.',
    heroTitle: 'Khám phá công cụ tốt nhất để xây dựng và phát triển',
    heroLead:
      'Danh mục được tuyển chọn gồm những công cụ và tài nguyên tốt nhất dành cho người sáng tạo, lập trình viên và đội ngũ đang tăng trưởng.',
    searchPlaceholder: 'Tìm công cụ, danh mục hoặc từ khoá…',
    searchSubmit: 'Tìm',
    popularLabel: 'Tìm nhiều:',
    popularTerm: 'Từ khoá {n}',
    statToolCount: '{count} công cụ',
    statCategoryCount: '{count} danh mục',
    statUpdated: 'Cập nhật mỗi ngày',
    toolsTitle: 'Tìm đúng công cụ cho mọi công việc',
    toolsLead:
      'Khám phá, tìm kiếm và chọn ra công cụ phù hợp cho công việc, học tập, sáng tạo và phát triển sản phẩm.',
    toolName: 'Tên công cụ',
    toolDescription: 'Mô tả ngắn về công cụ sẽ hiển thị ở đây khi danh mục được kết nối.',
    toolMeta: 'Danh mục · Lượt dùng',
    categoriesTitle: 'Khám phá danh mục',
    categoryName: 'Danh mục',
    categoryCount: '{count} công cụ',
    whatsNewTitle: 'Có gì mới',
    whatsNewLead:
      'Mỗi ngày chúng tôi bổ sung công cụ và nền tảng mới để bạn không bỏ lỡ thứ đáng thử.',
    faqTitle: 'Câu hỏi thường gặp',
    faqLead: 'Giải đáp nhanh những thắc mắc phổ biến, tập hợp ở một nơi.',
    faqAsk: 'Đặt câu hỏi',
    faqQuestion1: 'Kolo là gì và hoạt động thế nào?',
    faqQuestion2: 'Làm sao để gửi công cụ của tôi lên đây?',
    faqQuestion3: 'Danh mục được kiểm duyệt như thế nào?',
    faqQuestion4: 'Tôi có cần tài khoản để sử dụng không?',
  },

  /** Trang kết nối ví Cardano. Chuỗi sản phẩm — không phải copy marketing. */
  wallet: {
    menuConnect: 'Kết nối ví',
    menuDialogTitle: 'Chọn ví',
    menuClose: 'Đóng',
    menuManage: 'Mở trang ví',
    sendTitle: 'Gửi ADA thử',
    sendLead:
      'Dựng, ký và phát một giao dịch thật trên mạng thử nghiệm Preprod. Không có bước nào đi qua máy chủ Kolo.',
    sendRecipient: 'Địa chỉ nhận',
    sendRecipientPlaceholder: 'addr_test1...',
    sendAmount: 'Số ADA',
    sendSubmit: 'Gửi giao dịch',
    sendSubmitting: 'Đang chờ ví ký…',
    sendSuccess: 'Đã phát giao dịch.',
    sendViewOnExplorer: 'Xem trên Cardanoscan',
    errAddressEmpty: 'Nhập địa chỉ nhận.',
    errAddressNetwork:
      'Địa chỉ này không thuộc mạng thử nghiệm. Địa chỉ Preprod bắt đầu bằng addr_test.',
    errAmountInvalid: 'Số ADA không hợp lệ (tối đa 6 chữ số thập phân).',
    errAmountMin: 'Cardano yêu cầu mỗi giao dịch gửi tối thiểu 1 ADA.',
    errAmountBalance: 'Số dư không đủ.',
    errDeclined: 'Bạn đã từ chối ký trong ví.',
    errSendStale:
      'Kết nối tới ví đã ngắt (ví bị khoá hoặc extension khởi động lại). Hãy mở khoá ví, tải lại trang rồi gửi lại.',
    errSendFailed: 'Không gửi được giao dịch.',
    breadcrumb: 'Kết nối ví',
    title: 'Kết nối ví Cardano',
    lead: 'Chọn một ví đã cài trong trình duyệt để xem địa chỉ và số dư. Bản demo này chạy trên mạng thử nghiệm Preprod — hãy chuyển ví sang Preprod trước khi kết nối.',
    loadingModule: 'Đang tải phần kết nối ví…',
    searching: 'Đang tìm ví đã cài…',
    noWallet: 'Trình duyệt này chưa có ví Cardano nào.',
    connect: 'Kết nối',
    connecting: 'Đang chờ ví…',
    disconnect: 'Ngắt kết nối',
    balance: 'Số dư',
    receiveAddress: 'Địa chỉ nhận',
    fullAddress: 'địa chỉ ví đầy đủ',
    copy: 'Chép',
    copied: 'Đã chép',
    refresh: 'Đọc lại số dư',
    refreshing: 'Đang đọc lại…',
    mainnetWarning: 'Ví đang ở mainnet. Bản demo này chỉ chạy trên testnet.',
    errDeclinedConnect: 'Bạn đã từ chối yêu cầu kết nối trong cửa sổ của ví.',
    errStale:
      'Kết nối tới extension ví đã ngắt — thường là do ví bị khoá hoặc extension vừa khởi động lại. Hãy mở khoá ví rồi tải lại trang; bấm kết nối lại sẽ không có tác dụng.',
    errStaleReload: 'Tải lại trang',
    errMissing: 'Không tìm thấy ví này nữa. Hãy tải lại trang rồi thử lại.',
    errUnknown: 'Không kết nối được ví.',
    canDoTitle: 'Bản demo này làm được gì',
    canDo1: 'Nhận diện ví đã cài, kết nối và ngắt kết nối.',
    canDo2: 'Tự kết nối lại ví đã chọn khi bạn tải lại trang.',
    canDo3: 'Đọc địa chỉ nhận, số dư và mã mạng trực tiếp từ ví.',
    canDo4: 'Chặn thao tác nếu ví đang ở mainnet.',
    canDo5: 'Dựng, ký và phát một giao dịch thật trên mạng thử nghiệm Preprod.',
    cannotTitle: 'Chưa làm',
    cannotBody:
      'Đối chiếu giao dịch on-chain, đơn hàng và webhook thanh toán. Những phần đó cần backend và một indexer, nằm ngoài phạm vi bản demo — giao dịch ở trên do chính ví phát thẳng lên mạng, hệ thống không ghi nhận.',
  },

  tools: {
    embedLoading: 'Đang tải công cụ…',
    categoryAll: 'Tất cả',
    resultCount: '{count} công cụ',
    noResults: 'Không có công cụ nào khớp. Thử bỏ bớt bộ lọc hoặc đổi từ khoá.',
    filterSubmit: 'Tìm',
    filterComingSoon: 'Các bộ lọc dưới đây chưa hoạt động.',
    backToAll: 'Tất cả công cụ',
    poweredBy: 'Powered by Omni Calculator. Xem công cụ gốc:',
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
    resourcesTitle: 'Tài nguyên',
    resourcesDescription: 'Hướng dẫn, mẫu và tài liệu giúp bạn dùng công cụ hiệu quả hơn.',
    body: 'Phần này chưa được xây dựng. Danh mục ứng dụng thuộc giai đoạn sau và còn chờ chốt danh sách ứng dụng của Hub.',
    categoriesTitle: 'Danh mục',
    categoriesDescription: 'Các nhóm công cụ được phân loại theo mục đích sử dụng.',
    contactTitle: 'Liên hệ',
    contactDescription: 'Cách liên hệ với đội ngũ Kolo sẽ hiển thị tại đây.',
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
    viewSurveyAnswers: 'Xem câu trả lời khảo sát',
    editProfile: 'Sửa hồ sơ',
    displayName: 'Tên hiển thị',
    locale: 'Ngôn ngữ',
    timezone: 'Múi giờ',
    saved: 'Đã lưu thay đổi.',
    saveFailed: 'Không lưu được.',
    saving: 'Đang lưu…',
    save: 'Lưu thay đổi',
  },

  /**
   * Khung điều hướng chung của khu `/account`.
   *
   * `notReady` dùng chung cho MỌI điều khiển chưa nối backend. Một câu duy nhất, một chỗ sửa
   * — nếu mỗi trang tự viết một kiểu thì lúc tính năng chạy được sẽ sót chỗ.
   */
  accountNav: {
    sectionAccount: 'Tài khoản',
    sectionHelp: 'Trợ giúp',
    profile: 'Hồ sơ',
    savedTools: 'Công cụ đã lưu',
    notifications: 'Thông báo',
    security: 'Bảo mật',
    logout: 'Đăng xuất',
    helpCenter: 'Trung tâm trợ giúp',
    contactSupport: 'Liên hệ hỗ trợ',
    breadcrumbHome: 'Trang chủ',
    breadcrumbAccount: 'Tài khoản',
    navLabel: 'Điều hướng tài khoản',
    breadcrumbLabel: 'Đường dẫn phân cấp',
    upgradeTitle: 'Nâng cấp lên Pro',
    upgradeLead: 'Mở khoá tính năng nâng cao và bộ sưu tập không giới hạn.',
    upgradeCta: 'Nâng cấp ngay',
    /** Gói cước chưa chốt (DEC-B18) — nút để `disabled`, không dẫn đi đâu cả. */
    upgradeNotReady: 'Gói cước đang được hoàn thiện.',
    notReady: 'Tính năng này chưa hoạt động.',
  },

  profilePage: {
    title: 'Hồ sơ',
    lead: 'Quản lý thông tin cá nhân và cách người khác nhìn thấy bạn.',
    firstName: 'Tên hiển thị',
    userName: 'Tên người dùng',
    emailAddress: 'Địa chỉ email',
    bio: 'Giới thiệu',
    bioPlaceholder: 'Vài dòng về bạn…',
    changePhoto: 'Đổi ảnh',
    /** Ranh giới sở hữu dữ liệu, KHÔNG phải hạn chế tạm — xem identity-provider.md §5. */
    emailOwnedByIdp:
      'Email do hệ thống đăng nhập quản lý và không sửa được ở đây. Kolo chỉ giữ một bản sao.',
    fieldsNotReady:
      'Tên người dùng, giới thiệu và ảnh đại diện chưa lưu được — còn chờ quyết định về dữ liệu hồ sơ.',
    general: 'Chung',
    language: 'Ngôn ngữ',
    theme: 'Giao diện',
    themeLight: 'Sáng',
    /** Chỉ có bảng màu sáng (C4) — không đưa Dark/System vào để khỏi hứa suông. */
    themeNotReady: 'Hiện chỉ có giao diện sáng.',
    connectedAccount: 'Tài khoản liên kết',
    connected: 'Đã liên kết',
    notConnected: 'Chưa liên kết',
    disconnect: 'Ngắt liên kết',
    connectedNotReady: 'Chưa có đường đọc hay gỡ liên kết từ Kolo.',
  },

  savedTools: {
    title: 'Công cụ đã lưu',
    lead: 'Mọi công cụ AI bạn đã lưu, gom về một chỗ.',
    manageCollection: 'Quản lý bộ sưu tập',
    searchPlaceholder: 'Tìm trong công cụ đã lưu…',
    allCategories: 'Tất cả danh mục',
    emptyTitle: 'Chưa lưu công cụ nào',
    emptyLead:
      'Tính năng lưu công cụ chưa hoạt động. Khi có, dấu trang trên mỗi thẻ công cụ sẽ đưa nó về đây.',
    loadMore: 'Tải thêm',
  },

  notificationsPage: {
    title: 'Thông báo',
    lead: 'Quản lý cách bạn nhận cập nhật từ Kolo.',
    preferences: 'Tuỳ chọn thông báo',
    channels: 'Kênh nhận',
    recommended: 'Nên bật',
    verified: 'Đã xác minh',
    newToolsTitle: 'Công cụ AI mới',
    newToolsLead: 'Báo khi có công cụ AI mới được thêm vào.',
    digestTitle: 'Bản tin hằng tuần',
    digestLead: 'Tóm tắt công cụ và bài viết nổi bật mỗi tuần.',
    productTitle: 'Cập nhật sản phẩm',
    productLead: 'Thông tin về tính năng mới và cải tiến nền tảng.',
    tipsTitle: 'Mẹo & hướng dẫn',
    tipsLead: 'Hướng dẫn thực hành, kinh nghiệm và mẹo quy trình AI.',
    marketingTitle: 'Email tiếp thị',
    marketingLead: 'Khuyến mãi, ưu đãi và thông báo sản phẩm.',
    channelEmail: 'Email',
    channelBrowser: 'Thông báo trên trình duyệt',
    channelBrowserLead: 'Nhận thông báo trực tiếp trên trình duyệt.',
    alwaysOn: 'Thông báo về tài khoản và bảo mật luôn được gửi.',
    notReady: 'Chưa lưu được tuỳ chọn — phần này còn chờ backend.',
  },

  security: {
    title: 'Bảo mật',
    lead: 'Giữ tài khoản của bạn an toàn.',
    currentPassword: 'Mật khẩu hiện tại',
    currentPasswordPlaceholder: 'Nhập mật khẩu hiện tại…',
    newPassword: 'Mật khẩu mới',
    newPasswordPlaceholder: 'Nhập mật khẩu mới…',
    confirmPassword: 'Xác nhận mật khẩu mới',
    confirmPasswordPlaceholder: 'Nhập lại mật khẩu mới…',
    minLength: 'Tối thiểu 8 ký tự',
    show: 'Hiện mật khẩu',
    hide: 'Ẩn mật khẩu',
    update: 'Đổi mật khẩu',
    mismatch: 'Hai mật khẩu mới không khớp.',
    tooShort: 'Mật khẩu mới phải có ít nhất 8 ký tự.',
    /**
     * Nói rõ mật khẩu KHÔNG đi qua máy chủ Kolo — đó là lời hứa kiến trúc (C5), và
     * người dùng có quyền biết.
     */
    notReady:
      'Chưa nối được đổi mật khẩu. Khi hoàn tất, mật khẩu sẽ gửi thẳng từ trình duyệt tới hệ thống đăng nhập, không đi qua máy chủ Kolo.',
  },

  helpCenter: {
    title: 'Trung tâm trợ giúp',
    lead: 'Giải đáp những câu hỏi thường gặp và cách dùng Kolo hiệu quả.',
    faqTitle: 'Câu hỏi thường gặp',
    faqLead: 'Câu trả lời nhanh cho các thắc mắc phổ biến, gom về một chỗ.',
    contactLead: 'Không tìm thấy điều bạn cần? Chúng tôi sẵn sàng hỗ trợ.',
    contactCta: 'Liên hệ hỗ trợ',
    q1: 'Làm sao để lưu một công cụ?',
    a1: 'Bấm biểu tượng dấu trang trên thẻ của công cụ. Công cụ đã lưu sẽ nằm ở trang Công cụ đã lưu.',
    q2: 'Làm sao để đổi mật khẩu?',
    a2: 'Vào Tài khoản → Bảo mật, nhập mật khẩu hiện tại, đặt mật khẩu mới rồi xác nhận.',
    q3: 'Làm sao để cập nhật thông tin hồ sơ?',
    a3: 'Vào Tài khoản → Hồ sơ. Lưu ý email do hệ thống đăng nhập quản lý nên không sửa tại đây.',
    q4: 'Làm sao để gửi công cụ AI của tôi?',
    a4: 'Dùng trang Gửi công cụ. Mỗi đề xuất được xem xét trước khi xuất hiện trong danh mục.',
    q5: 'Kolo có miễn phí không?',
    a5: 'Các tính năng hiện có đang miễn phí. Gói trả phí còn đang được hoàn thiện.',
    q6: 'Làm sao để bỏ một công cụ đã lưu?',
    a6: 'Bấm lại biểu tượng dấu trang trên thẻ công cụ để gỡ khỏi bộ sưu tập.',
    q7: 'Làm sao để báo một mục sai thông tin?',
    a7: 'Dùng trang Liên hệ và nêu rõ tên công cụ cùng thông tin cần sửa.',
    q8: 'Tôi đề xuất một công cụ mới được không?',
    a8: 'Được. Gửi qua trang Gửi công cụ, kèm đường dẫn và mô tả ngắn.',
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

  surveyAnswers: {
    title: 'Câu trả lời khảo sát',
    lead: 'Nội dung bạn đã trả lời (hoặc bỏ qua) trong khảo sát lúc đăng ký. Bạn có thể xoá câu trả lời này bất kỳ lúc nào.',
    loadFailed: 'Không tải được câu trả lời khảo sát.',
    empty: 'Bạn chưa trả lời khảo sát này.',
    skippedNotice: 'Bạn đã chọn bỏ qua khảo sát này.',
    answeredAt: 'Trả lời lúc {when}',
    skippedAt: 'Bỏ qua lúc {when}',
    deleteButton: 'Xoá câu trả lời',
    deleting: 'Đang xoá…',
    confirmDelete:
      'Xoá câu trả lời khảo sát này? Bạn sẽ được hỏi lại ở lần đăng nhập kế tiếp, và thao tác này không hoàn tác được.',
    deleted: 'Đã xoá câu trả lời khảo sát.',
    deleteFailed: 'Không xoá được câu trả lời khảo sát.',
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
