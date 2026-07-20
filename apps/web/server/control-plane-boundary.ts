import { readServerEnv } from './env';

/**
 * Ranh giới BFF: browser ↔ BFF ↔ Control Plane (modular.md mục 1.1).
 *
 * Luật của ranh giới này:
 * 1. Browser KHÔNG BAO GIỜ giữ session token của Control Plane. Nó chỉ có cookie
 *    `HttpOnly` do BFF phát; BFF là nơi duy nhất đổi cookie thành header `x-session-token`.
 * 2. Chỉ module server (`apps/web/server/**`) được đọc env và gắn credential.
 * 3. Base URL của Control Plane là chi tiết nội bộ, không bao giờ trả về client.
 */

export class ControlPlaneBoundaryNotWiredError extends Error {
  public readonly code = 'CONTROL_PLANE_BOUNDARY_NOT_WIRED';

  constructor(target: string) {
    super(`Chưa cấu hình CONTROL_PLANE_BASE_URL. Không gọi được: ${target}`);
    this.name = 'ControlPlaneBoundaryNotWiredError';
  }
}

export interface ControlPlaneRequest {
  readonly method: string;
  readonly path: string;
  /** Session token lấy từ cookie. Thiếu thì request đi tiếp và Control Plane trả 401. */
  readonly sessionToken?: string | undefined;
  /** CSRF token — chỉ gắn cho request ghi dữ liệu, sau khi BFF đã đối chiếu xong. */
  readonly csrfToken?: string | undefined;
  readonly body?: BodyInit | undefined;
  readonly contentType?: string | undefined;
}

/**
 * Điểm ra duy nhất từ web sang Control Plane.
 *
 * Chỉ forward những header ta CHỦ ĐỘNG chọn. Forward nguyên header của browser sẽ mang
 * theo cookie, `origin`, `referer` sang một service tin cậy — Control Plane không được
 * nhìn thấy cookie của browser, đó là toàn bộ điểm của mẫu BFF.
 */
export async function callControlPlane(request: ControlPlaneRequest): Promise<Response> {
  const env = readServerEnv();
  const baseUrl = env.CONTROL_PLANE_BASE_URL;

  if (!baseUrl) {
    throw new ControlPlaneBoundaryNotWiredError(`${request.method} ${request.path}`);
  }

  const headers = new Headers();
  if (request.sessionToken) headers.set('x-session-token', request.sessionToken);
  if (request.csrfToken) headers.set('x-csrf-token', request.csrfToken);
  if (request.contentType) headers.set('content-type', request.contentType);

  return fetch(new URL(request.path, baseUrl), {
    method: request.method,
    headers,
    ...(request.body !== undefined ? { body: request.body } : {}),
    cache: 'no-store',
  });
}
