import { readServerEnv } from './env';

/**
 * Ranh giới BFF: browser ↔ BFF ↔ Control Plane (modular.md mục 1.1).
 *
 * Luật của ranh giới này:
 * 1. Browser KHÔNG BAO GIỜ giữ M2M credential hay session token của Control Plane.
 *    Browser chỉ nói chuyện với route handler của Next bằng cookie `HttpOnly` do BFF phát.
 * 2. Chỉ module server (`apps/web/server/**`) được đọc env và gắn credential.
 *    Client component không import được file này vì nó chạm `process.env` phía server.
 * 3. Base URL của Control Plane là chi tiết nội bộ, không trả về client.
 *
 * P1 cố ý CHƯA gọi Control Plane thật (phase-1 mục 10): chưa có endpoint đã freeze để gọi
 * và DEC-B03 chưa chốt. Boundary tồn tại để P2 chỉ phải điền phần fetch + attach token,
 * không phải dựng lại cấu trúc.
 */

export class ControlPlaneBoundaryNotWiredError extends Error {
  public readonly code = 'CONTROL_PLANE_BOUNDARY_NOT_WIRED';

  constructor(target: string) {
    super(`Control Plane boundary is not wired yet (P1 scaffold). Requested target: ${target}`);
    this.name = 'ControlPlaneBoundaryNotWiredError';
  }
}

export interface ControlPlaneRequest {
  readonly method: string;
  readonly path: string;
}

/**
 * Điểm ra duy nhất từ web sang Control Plane. P1 luôn từ chối thay vì trả dữ liệu giả —
 * một shell trả fake data sẽ vi phạm phase-1 mục 5 và che mất việc chưa có backend contract.
 */
export async function callControlPlane(request: ControlPlaneRequest): Promise<never> {
  // Đọc env ở đây để chứng minh credential được resolve phía server, không phải phía client.
  readServerEnv();
  return Promise.reject(new ControlPlaneBoundaryNotWiredError(`${request.method} ${request.path}`));
}
