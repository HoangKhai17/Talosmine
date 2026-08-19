import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { BRAND_NAME } from '../../../lib/brand';

export const metadata: Metadata = {
  title: `${BRAND_NAME} — Create account`,
};

/**
 * Cửa vào đăng ký — chuyển thẳng sang màn hình đăng ký của nhà cung cấp danh tính.
 *
 * `screen=register` khiến `/auth/login` gắn `first_screen=register` vào authorization
 * request, và Logto mở `/register` thay vì `/sign-in`.
 *
 * Cùng lý do với `../page.tsx`: biểu mẫu dựng theo Figma trước đây không nối vào đâu, và
 * giao diện thật giờ nằm ở `apps/logto-ui`. Hai biểu mẫu giống hệt nhau — một chạy, một
 * không — chỉ làm người dùng gõ vào cái sai.
 *
 * Trang này KHÔNG hiển thị lỗi: mọi lỗi của luồng OIDC quay về `/auth`, nơi có sẵn màn hình
 * xử lý. Bắt lỗi ở hai chỗ nghĩa là sớm muộn hai chỗ nói hai kiểu khác nhau.
 */
export default function SignUpPage(): never {
  redirect('/auth/login?screen=register');
}
