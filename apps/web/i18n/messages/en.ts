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
} as const satisfies Messages;
