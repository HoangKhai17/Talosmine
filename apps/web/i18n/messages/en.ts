import type { Messages } from './vi';

/**
 * Bản tiếng Anh.
 *
 * `satisfies Messages` là toàn bộ lưới an toàn của cơ chế i18n này: thiếu một khoá, hoặc gõ
 * sai tên khoá, là lỗi `pnpm typecheck` — không phải một dòng chữ tiếng Việt lọt ra trang
 * tiếng Anh rồi chờ người dùng báo.
 *
 * Dùng `satisfies` chứ không phải `: Messages` để TypeScript vẫn giữ literal type của từng
 * giá trị, đồng thời vẫn kiểm đủ khoá.
 */
export const en = {
  a11y: {
    skipToContent: 'Skip to main content',
    primaryNav: 'Main navigation',
    breadcrumb: 'Breadcrumb',
    partners: 'Partners',
    results: 'Results',
    filters: 'Filters',
    searchTools: 'Search tools',
    prevCategory: 'Previous categories',
    nextCategory: 'Next categories',
    actions: 'Actions',
  },

  common: {
    loading: 'Loading…',
    retry: 'Try again',
    home: 'Home',
    backToHome: 'Back to home',
    viewAll: 'View all →',
    loadMore: 'Load more',
    tag: 'Tag',
    publishDate: 'Published',
    readTime: '{minutes} min read',
    // Ngày mẫu — định dạng theo quy ước Anh–Mỹ, khớp `dateTime="2026-05-15"` trong markup.
    sampleDate: 'May 15, 2026',
  },

  header: {
    account: 'Account',
    signIn: 'Sign in',
    signOut: 'Sign out',
    signingOut: 'Signing out…',
    signOutFailed: 'Could not sign out. Please try again.',
    submitTool: 'Submit a tool',
  },

  footer: {
    tagline: 'Tools, resources and know-how in one place, so you can build and grow.',
    explore: 'Explore',
    allTools: 'All tools',
    categories: 'Categories',
    submitTool: 'Submit a tool',
    about: 'About',
    aboutUs: 'About us',
    blog: 'Blog',
    contact: 'Contact',
    privacy: 'Privacy policy',
    resources: 'Resources',
    guides: 'Guides',
    newsletter: 'Newsletter',
    faq: 'FAQ',
    rights: '© {year} Talosmine. All rights reserved.',
  },

  nav: {
    tools: 'Tools',
    blog: 'Blog',
    contact: 'Contact',
  },

  system: {
    loading: 'Loading…',
    notFoundTitle: 'Page not found',
    notFoundBody: 'The address you opened does not exist or is unavailable.',
    backToSite: 'Back to the site',
    errorTitle: 'Something went wrong',
    errorBody: 'This content could not be displayed. You can try again.',
    errorReference: 'Reference code:',
  },

  draft: {
    home: 'Layout preview — the content in these grids is sample data, not the real catalogue.',
    tools: 'Layout preview — filters and tool listings are sample data, not the real catalogue.',
    blog: 'Layout preview — articles are sample data. The blog system is not part of any phase yet.',
    blogPost: 'Layout preview — the entire article body is sample text.',
  },

  meta: {
    home: 'Talosmine — Discover tools to build and grow',
    tools: 'Talosmine — Browse tools by category',
    blog: 'Talosmine — Blog',
    blogPost: 'Talosmine — Article',
    categories: 'Talosmine — Categories',
    contact: 'Talosmine — Contact',
    submit: 'Talosmine — Submit a tool',
    account: 'Talosmine — Account',
    sessions: 'Talosmine — Sessions',
  },

  home: {
    heroTitle: 'Discover the best tools to build and grow',
    heroLead:
      'A curated catalogue of the best tools and resources for creators, developers and growing teams.',
    searchPlaceholder: 'Search tools, categories or keywords…',
    searchSubmit: 'Search',
    popularLabel: 'Popular:',
    popularTerm: 'Keyword {n}',
    partnerName: 'Logo',
    partnerText: 'A short partner description will appear here once there is real content.',
    statToolCount: '10,000+ tools',
    statCategoryCount: '500+ categories',
    statUpdated: 'Updated daily',
    toolsTitle: 'Find the right tool for every job',
    toolsLead:
      'Browse, search and pick the right tool for work, study, creative projects and product development.',
    toolName: 'Tool name',
    toolDescription: 'A short tool description will appear here once the catalogue is connected.',
    toolMeta: 'Category · Usage',
    categoriesTitle: 'Explore categories',
    categoryName: 'Category',
    whatsNewTitle: "What's new",
    whatsNewLead:
      'We add new tools and platforms every day so you never miss something worth trying.',
    articleTitle: 'The article title will appear here once there is real content',
    articleMeta: 'Published · Author',
    blogTitle: 'Blog',
    featuredArticleTitle: 'The featured article title will appear here once there is real content',
    articleLead:
      'The opening paragraph of the article. This content comes from the blog system and will be connected in a later stage.',
    articleLeadShort: 'The opening paragraph of the article will appear here.',
    faqTitle: 'Frequently asked questions',
    faqLead: 'Quick answers to common questions, gathered in one place.',
    faqAsk: 'Ask a question',
    faqQuestion1: 'What is Talosmine and how does it work?',
    faqQuestion2: 'How do I submit my own tool?',
    faqQuestion3: 'How is the catalogue reviewed?',
    faqQuestion4: 'Do I need an account to use it?',
    faqAnswer:
      'Answers will be written once the platform has enough features. This section only illustrates the layout for now.',
  },

  tools: {
    breadcrumb: 'Tools',
    title: 'Browse AI tools by category',
    lead: 'Explore a growing collection of AI tools, compare capabilities and find the right fit for each project and workflow.',
    categoryTab: 'Category {n}',
    filterNameLabel: 'Tool name',
    filterSearchPlaceholder: 'Search…',
    filterPriceLabel: 'Price',
    priceAll: 'All',
    priceFree: 'Free',
    pricePaid: 'Paid',
    priceFreePaid: 'Free + Paid',
    featureLegend: 'Features',
    featureApi: 'Has an API',
    featureNoCode: 'No-code',
    featureOpenSource: 'Open source',
    featureExtension: 'Browser extension',
    modelLegend: 'Models',
    modelName: 'Model {n}',
    sortLegend: 'Sort by',
    sortPopular: 'Most popular',
    sortNewest: 'Newest',
    sortTopRated: 'Highest rated',
    cardTitle: 'Tool name',
    cardDescription: 'A short tool description will appear here once the catalogue is connected.',
    cardDescriptionSecond:
      'A second paragraph holds space so the card shows its real height when the description runs past one line.',
    cardTag: 'Tag {n}',
  },

  blog: {
    breadcrumb: 'Blog',
    title: 'Discover. Learn. Everything you need in one place.',
    lead: 'Practical perspectives, hard-won experience and approaches that have been proven in the field — gathered into one continuous read.',
    searchLabel: 'Search articles',
    topicAll: 'All',
    topicGuide: 'Guides',
    topicLesson: 'Lessons',
    topicCompare: 'Comparisons',
    topicProcess: 'Workflows',
    topicNews: 'News',
    topicReview: 'Reviews',
    topicPrompt: 'Prompts',
    latestTitle: 'Explore the latest',
    featuredTitle: 'Featured articles',
    trendingTitle: 'Trending topics',
    trendingTopic: '#Topic{n}',
  },

  blogPost: {
    topic: 'Topic',
    breadcrumbTitle: 'Article title',
    title: 'The article title will appear here once the blog system is connected',
    lead: 'A short summary sits right under the title, telling readers what this article solves before they decide to read on.',
    heading1: 'First subheading',
    heading2: 'Second subheading',
    heading3: 'Third subheading',
    heading4: 'Fourth subheading',
    paragraphLong:
      'This is a sample paragraph that shows the line rhythm and reading measure of the article body. Real content will come from the blog system in a later stage, so the text here only needs to occupy exactly the space a real paragraph would — no more, no less.',
    paragraphShort:
      'The next paragraph is shorter, to show the spacing between two adjacent paragraphs and between a paragraph and the subheading right below it.',
    quote:
      'A pull quote from the article. This block has a heavy rule on the left and a secondary background to set it apart from the main reading flow.',
    listItem1: 'The first point in a bulleted list.',
    listItem2: 'The second point, a little longer so the second line indents correctly.',
    listItem3: 'The third point.',
    listItem4: 'The fourth point.',
    relatedTitle: 'Related articles',
  },

  newsletter: {
    title: 'Subscribe for weekly updates',
    text: 'Get a round-up of new tools, articles worth reading and notable platform changes — once a week, no spam.',
    emailLabel: 'Email address',
    emailPlaceholder: 'Your email address…',
    submit: 'Subscribe',
  },

  comingSoon: {
    body: 'This section has not been built yet. The application catalogue belongs to a later stage and still depends on the Hub application list being decided.',
    categoriesTitle: 'Categories',
    categoriesDescription: 'Groups of tools organised by what you use them for.',
    contactTitle: 'Contact',
    contactDescription: 'Ways to reach the Talosmine team will appear here.',
    submitTitle: 'Submit a tool',
    submitDescription: 'A form for proposing a new tool to add to the catalogue.',
  },

  account: {
    title: 'Account',
    loadFailed: 'Could not load your account details.',
    email: 'Email',
    emailEmpty: 'Not set',
    emailVerification: 'Email verification',
    verified: 'Verified',
    unverified: 'Not verified',
    status: 'Status',
    statusActive: 'Active',
    statusPending: 'Pending activation',
    statusDisabled: 'Disabled',
    createdAt: 'Created',
    idpNote:
      'Your email and password are managed by the sign-in system and cannot be edited here. Your account is identified by your sign-in identity, not by your email address.',
    viewSessions: 'View sign-in sessions',
    editProfile: 'Edit profile',
    displayName: 'Display name',
    locale: 'Language',
    timezone: 'Time zone',
    saved: 'Changes saved.',
    saveFailed: 'Could not save.',
    saving: 'Saving…',
    save: 'Save changes',
  },

  sessions: {
    title: 'Sign-in sessions',
    lead: 'Devices currently signed in to your account. If you see a session you do not recognise, revoke it right away.',
    loadFailed: 'Could not load your sessions.',
    empty: 'No sessions yet.',
    caption: '{active} active out of {total} sessions',
    colCreatedAt: 'Signed in',
    colLastSeen: 'Last active',
    colExpires: 'Expires',
    colStatus: 'Status',
    revoked: 'Revoked',
    thisDevice: 'This device',
    active: 'Active',
    revoke: 'Revoke',
    revoking: 'Revoking…',
    confirmRevokeOne: 'Revoke this session? That device will be signed out immediately.',
    revokedOne: 'Session revoked.',
    revokeFailed: 'Could not revoke the session.',
    confirmRevokeAll:
      'Sign out of EVERY device, including this one? You will have to sign in again.',
    revokeAll: 'Sign out of all devices',
    revokingAll: 'Signing out…',
    revokeAllFailed: 'Could not sign out.',
    revokeAllNote: 'This includes the device you are using — you will have to sign in again.',
    backToAccount: 'Back to account',
  },
} as const satisfies Messages;
