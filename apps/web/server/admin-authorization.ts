/**
 * Hợp đồng authorization cho khu vực admin (phase-1 mục 11).
 *
 * Vì sao mọi thứ ở đây trả về "deny": P1 chưa có identity và chưa có RBAC — cả hai
 * thuộc P2 (DEC-B03 còn `open`). Không có nguồn sự thật nào để nói một request là admin,
 * nên phase này KHÔNG cấp quyền admin và KHÔNG tạo bypass/dev super-admin.
 * Một env flag "cho tiện dev" ở đây sẽ là một đường vòng qua authorization — cấm.
 *
 * Module này cố ý không import gì từ `next` để nó dùng được ở cả proxy lẫn RSC,
 * và để nó là điểm duy nhất mà mọi route/action/handler admin phải đi qua.
 */

export const ADMIN_PATH_PREFIX = '/admin';

export type AdminAccessDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: string };

/** Route nào thuộc khu vực admin. Dùng chung giữa proxy và guard phía RSC. */
export function isAdminPath(pathname: string): boolean {
  return pathname === ADMIN_PATH_PREFIX || pathname.startsWith(`${ADMIN_PATH_PREFIX}/`);
}

/**
 * Deny mặc định. Ở P2, đây là nơi duy nhất được đổi để đọc session/RBAC thật.
 * Chữ ký trả về decision (không throw) để proxy và RSC map sang response khác nhau.
 */
export function decideAdminAccess(): AdminAccessDecision {
  return { allowed: false, reason: 'ADMIN_ACCESS_REQUIRES_IDENTITY_AND_RBAC_FROM_P2' };
}
