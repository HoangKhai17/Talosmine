import type { Locale } from '../locale';
import { en } from './en';
import { type Messages, vi } from './vi';

export type { Messages } from './vi';

const CATALOGS: Record<Locale, Messages> = { vi, en };

/**
 * Lấy bộ chữ cho một locale.
 *
 * KHÔNG có fallback lúc chạy, và đó là chủ đích: `Record<Locale, Messages>` bắt buộc mọi
 * locale trong `LOCALES` phải có catalog, còn `en.ts` khai `satisfies Messages` nên không thể
 * thiếu khoá. Hai ràng buộc đó bắt lỗi ở TYPECHECK — sớm hơn và chắc hơn mọi fallback runtime.
 *
 * Fallback lúc chạy mà DEC-T25 nói tới dành cho nguồn chữ kiểu KHÔNG kiểm được: nội dung từ
 * CMS ở bước sau. Nó sẽ được viết cùng với nơi gọi nó, không dựng sẵn ở đây — một hàm fallback
 * chưa ai gọi là một hàm chưa ai chạy thử.
 */
export function getMessages(locale: Locale): Messages {
  return CATALOGS[locale];
}

/**
 * Thay tham số dạng `{name}` trong một chuỗi.
 *
 * Cố ý tối giản: chỉ thay khoá đúng tên, không có định dạng số/ngày (dùng `Intl.*` cho việc
 * đó) và không có pluralization. Nếu có ngày cần ICU thật thì đó là một record superseding
 * DEC-T25, không phải một hàm phình thêm ở đây.
 *
 * Tham số thiếu thì GIỮ NGUYÊN `{name}` thay vì in `undefined`: chỗ trống nhìn thấy được sẽ
 * bị phát hiện, còn `undefined` giữa câu thì trông như một lỗi ngẫu nhiên.
 */
export function format(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in params ? String(params[key]) : whole,
  );
}
