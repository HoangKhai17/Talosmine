/**
 * Vòng đời phát hành dùng chung cho mọi thứ quản trị viên soạn rồi mới đưa ra công khai:
 * ứng dụng trong catalog, mục điều hướng site, lựa chọn khảo sát.
 *
 *     draft ──▶ active ⇄ inactive
 *
 * KHÔNG CÓ ĐƯỜNG VỀ `draft`. Thứ đã từng hiển thị công khai không thể trở lại trạng thái
 * "chưa từng phát hành" — dấu vết lịch sử sẽ nói dối. Muốn gỡ xuống thì dùng `inactive`.
 *
 * VÌ SAO Ở `shared/` CHỨ KHÔNG PHẢI TRONG TỪNG MODULE: đây là bản thứ ba của cùng một hàm
 * (catalog và site-content đã có hai bản giống hệt). Ba bản nghĩa là ba chỗ để một luật
 * chung lệch đi mà không ai thấy. Đây là hằng số miền, không phải bảng hay dữ liệu — nên
 * chia sẻ nó KHÔNG vi phạm ranh giới module ở `modular.md` mục 1.2, thứ chỉ cấm module này
 * đọc/ghi bảng của module kia.
 *
 * Hàm thuần, không chạm database — test được mà không cần container.
 */

export const CONTENT_STATUSES = ['draft', 'active', 'inactive'] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

/** Đích hợp lệ của một lần đổi trạng thái. `draft` vắng mặt là có chủ đích. */
export const PUBLISHABLE_STATUSES = ['active', 'inactive'] as const;
export type PublishableStatus = (typeof PUBLISHABLE_STATUSES)[number];

export function isValidContentTransition(from: string, to: string): boolean {
  if (from === to) return false; // đổi sang chính nó là lệnh vô nghĩa, không phải no-op
  if (to === 'draft') return false;
  if (from === 'draft') return to === 'active';
  if (from === 'active') return to === 'inactive';
  if (from === 'inactive') return to === 'active';
  return false;
}
