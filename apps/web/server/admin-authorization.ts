import { callControlPlane } from './control-plane-boundary';

/**
 * Hợp đồng authorization cho khu vực admin.
 *
 * Nguồn sự thật DUY NHẤT là RBAC ở Control Plane. Module này không tự quyết định gì — nó
 * hỏi và chuyển tiếp câu trả lời. Không có env flag "cho tiện dev", không có super-admin
 * mặc định: cả hai đều là đường vòng qua authorization.
 *
 * QUAN TRỌNG — ĐÂY KHÔNG PHẢI LỚP BẢO VỆ CUỐI: mọi endpoint `/v1/admin/*` đều tự kiểm
 * permission phía server bằng `AdminPermissionGuard`. Nếu module này sai và cho một người
 * không đủ quyền vào `/admin`, họ chỉ thấy một khung trang rỗng — mọi lời gọi dữ liệu
 * đằng sau đều bị Control Plane từ chối. Đây là lớp UX + phòng thủ chiều sâu.
 */

export const ADMIN_PATH_PREFIX = '/admin';

export type AdminAccessDecision =
  | { readonly allowed: true; readonly permissions: readonly string[] }
  | { readonly allowed: false; readonly reason: string };

/** Route nào thuộc khu vực admin. Dùng chung giữa proxy và guard phía RSC. */
export function isAdminPath(pathname: string): boolean {
  return pathname === ADMIN_PATH_PREFIX || pathname.startsWith(`${ADMIN_PATH_PREFIX}/`);
}

/**
 * Hỏi Control Plane xem phiên hiện tại có quyền quản trị nào.
 *
 * `sessionToken` truyền vào chứ không tự đọc: hàm này chạy ở cả proxy (đọc cookie từ
 * `NextRequest`) lẫn React Server Component (đọc qua `next/headers`), hai nơi có API khác
 * nhau. Nhận token làm tham số giữ module này không phụ thuộc `next`.
 *
 * Mọi lỗi đều dẫn tới DENY. Control Plane không trả lời được thì câu trả lời an toàn là
 * "không có quyền", không phải "cứ cho vào".
 */
export async function decideAdminAccess(
  sessionToken: string | undefined,
  correlationId?: string,
): Promise<AdminAccessDecision> {
  if (!sessionToken) {
    return { allowed: false, reason: 'NO_SESSION' };
  }

  try {
    const response = await callControlPlane({
      method: 'GET',
      path: '/v1/me/permissions',
      sessionToken,
      correlationId,
    });

    if (!response.ok) {
      return { allowed: false, reason: `CONTROL_PLANE_${response.status}` };
    }

    const data = (await response.json()) as { permissions?: unknown };
    const permissions = Array.isArray(data.permissions)
      ? data.permissions.filter((p): p is string => typeof p === 'string')
      : [];

    // Có BẤT KỲ permission quản trị nào là đủ để vào khu vực admin. Từng màn hình bên
    // trong tự ẩn/hiện theo permission cụ thể, và mỗi API vẫn tự kiểm lại.
    if (permissions.length === 0) {
      return { allowed: false, reason: 'NO_ADMIN_PERMISSION' };
    }

    return { allowed: true, permissions };
  } catch {
    return { allowed: false, reason: 'CONTROL_PLANE_UNREACHABLE' };
  }
}
