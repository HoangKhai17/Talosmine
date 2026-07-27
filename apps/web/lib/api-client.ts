'use client';

/**
 * Client gọi API qua ranh giới BFF.
 *
 * Browser CHỈ được gọi `/api/bff/*`. Nó không biết base URL của Control Plane và không
 * bao giờ giữ session token — token nằm trong cookie `HttpOnly` mà JavaScript không đọc
 * được, và BFF là nơi duy nhất đổi cookie đó thành header.
 */

/** Tên cookie CSRF. Cố ý đọc được từ JS — đó là điều kiện của mẫu double-submit. */
const CSRF_COOKIE = '__Host-talos_csrf';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Phiên hết hạn hoặc bị thu hồi — UI nên đưa người dùng về trang đăng nhập. */
  get isUnauthenticated(): boolean {
    return this.status === 401;
  }
}

function readCsrfToken(): string | undefined {
  for (const part of document.cookie.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === CSRF_COOKIE) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};

  if (method !== 'GET') {
    const csrf = readCsrfToken();
    if (!csrf) {
      // Không có cookie CSRF nghĩa là chưa đăng nhập hoặc phiên đã bị xoá. Dừng tại đây
      // với thông điệp đúng, thay vì gửi đi để nhận 403 khó hiểu.
      throw new ApiError(401, 'Phiên đăng nhập không còn hiệu lực. Vui lòng đăng nhập lại.');
    }
    headers['x-csrf-token'] = csrf;
  }

  if (body !== undefined) headers['content-type'] = 'application/json';

  const response = await fetch(`/api/bff${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    // Cookie phải đi kèm; đây là cách BFF nhận ra phiên.
    credentials: 'same-origin',
    cache: 'no-store',
  });

  if (response.status === 204) return undefined as T;

  if (!response.ok) {
    throw new ApiError(response.status, await errorMessage(response));
  }

  return (await response.json()) as T;
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { message?: unknown };
    if (typeof data.message === 'string') return data.message;
  } catch {
    // Body không phải JSON — dùng thông điệp mặc định bên dưới.
  }

  if (response.status === 401) return 'Phiên đăng nhập đã hết hạn.';
  if (response.status === 403) return 'Bạn không có quyền thực hiện thao tác này.';
  return 'Không thực hiện được. Vui lòng thử lại.';
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  // DELETE có body: thu hồi phân quyền bắt buộc kèm `reason` cho nhật ký kiểm toán.
  delete: <T>(path: string, body?: unknown) => request<T>('DELETE', path, body),
};

/** Khớp `AdminNavItemView` của Control Plane (modules/site-content/site-nav.service.ts). */
export interface AdminNavItemView {
  id: string;
  menuKey: 'header.primary' | 'footer.explore' | 'footer.about' | 'footer.resources';
  sortOrder: number;
  href: string;
  status: 'draft' | 'active' | 'inactive';
  labels: { vi?: string | null; en?: string | null };
  createdAt: string;
  updatedAt: string;
}

/** Khớp `OwnAccountView` của Control Plane (apps/control-plane/.../account.service.ts). */
export interface AccountView {
  id: string;
  status: 'pending' | 'active' | 'disabled';
  displayName: string | null;
  email: string | null;
  emailVerified: boolean;
  locale: string | null;
  timezone: string | null;
  createdAt: string;
}

export interface SessionView {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt: string | null;
  current: boolean;
}

/** View admin — nhiều trường hơn view của user (có `disabledAt`). */
export interface AdminAccountView {
  id: string;
  status: string;
  displayName: string | null;
  email: string | null;
  emailVerified: boolean;
  disabledAt: string | null;
  createdAt: string;
}

/**
 * Phiên nhìn từ phía admin — KHÔNG có cờ `current`: phiên "hiện tại" là khái niệm của
 * chính chủ tài khoản, admin đang xem thiết bị của người khác.
 */
export interface AdminSessionView {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

/** Một dòng nhật ký kiểm toán. Khớp `AuditEventView` của Control Plane. */
export interface AuditEventView {
  id: string;
  action: string;
  actorType: string;
  actorAccountId: string | null;
  targetType: string;
  targetId: string | null;
  reason: string | null;
  createdAt: string;
}

export interface AdminRoleView {
  id: string;
  key: string;
  displayName: string;
  description: string | null;
  status: string;
  permissions: string[];
}

/* ── Catalog (P3) ─────────────────────────────────────────────────────────────
 * Khớp view của `apps/control-plane/src/modules/application-catalog`. */

/** Ứng dụng nhìn từ phía admin — thấy MỌI trạng thái, kể cả `draft`. */
export interface AdminApplicationView {
  id: string;
  key: string;
  displayName: string;
  description: string | null;
  imageUrl: string | null;
  launchUrl: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Một entry trong allowlist redirect.
 *
 * `uri` đã được CHUẨN HOÁ ở server. Hiển thị đúng chuỗi này chứ không phải chuỗi người dùng
 * vừa gõ — nó mới là giá trị mà IdP sẽ đem đi so khớp từng ký tự.
 */
export interface RedirectUriView {
  id: string;
  purpose: 'login' | 'logout';
  uri: string;
  createdAt: string;
}

export interface FeatureView {
  id: string;
  key: string;
  displayName: string;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminAssignmentView {
  id: string;
  accountId: string;
  accountEmail: string | null;
  accountDisplayName: string | null;
  roleId: string;
  roleKey: string;
  validFrom: string;
  validUntil: string | null;
  reason: string;
  revokedAt: string | null;
}
