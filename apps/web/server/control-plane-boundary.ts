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

/**
 * Tên header khớp CHÍNH XÁC `CORRELATION_HEADER` ở `apps/control-plane/src/shared/correlation.ts`
 * — không import chéo giữa hai app (mỗi app build/deploy độc lập), nên khai lại như một
 * hằng số cục bộ có comment neo về nguồn sự thật bên kia.
 */
const CORRELATION_HEADER = 'x-correlation-id';

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
  /**
   * Truyền vào khi caller cần TỰ log lời gọi này (đối chiếu với log/audit của Control
   * Plane) — không truyền thì hàm tự sinh một ID mới cho lời gọi đó. Không bắt buộc:
   * phần lớn lời gọi qua ranh giới này (trang admin đọc dữ liệu…) không cần theo dõi riêng.
   */
  readonly correlationId?: string | undefined;

  /**
   * Ghi đè tín hiệu huỷ. Bỏ trống thì dùng trần thời gian mặc định.
   *
   * Có mặt để lời gọi nào thật sự cần chờ lâu hơn (tải file lớn) tự khai, thay vì phải nới
   * trần chung cho mọi lời gọi.
   */
  readonly signal?: AbortSignal | undefined;
}

/**
 * Điểm ra duy nhất từ web sang Control Plane.
 *
 * Chỉ forward những header ta CHỦ ĐỘNG chọn. Forward nguyên header của browser sẽ mang
 * theo cookie, `origin`, `referer` sang một service tin cậy — Control Plane không được
 * nhìn thấy cookie của browser, đó là toàn bộ điểm của mẫu BFF.
 *
 * LUÔN gắn `x-correlation-id` — B3 (`pending-work.md`): correlation ID phải xuyên được từ
 * BFF sang Control Plane rồi vào audit event, và Control Plane đã đọc đúng header này
 * (`shared/correlation.ts`). Không có nó thì mọi audit event do lời gọi qua ranh giới này
 * tạo ra chỉ có một ID tự sinh ở phía Control Plane, không nối lại được với log phía BFF.
 */
/** Trần thời gian cho MỌI lời gọi sang Control Plane. Xem ghi chú trong `callControlPlane`. */
const CONTROL_PLANE_TIMEOUT_MS = 5_000;

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
  headers.set(CORRELATION_HEADER, request.correlationId ?? crypto.randomUUID());

  return fetch(new URL(request.path, baseUrl), {
    method: request.method,
    headers,
    ...(request.body !== undefined ? { body: request.body } : {}),
    cache: 'no-store',
    // TIMEOUT BẮT BUỘC — `fetch` không có `signal` sẽ chờ tới hạn của hệ điều hành, tính bằng
    // phút.
    //
    // Vì sao nó quan trọng hơn vẻ ngoài: bốn thứ render ở MỌI trang công khai (menu, cấu hình
    // site, logo, khe nội dung) đều đi qua đây và đều có đường rơi về giá trị mặc định. Nhưng
    // đường rơi đó chỉ chạy SAU khi fetch kết thúc — nên Control Plane chết thì trang không
    // hỏng, nó chỉ TREO. Đo được trên máy dev lúc Control Plane tắt: `GET /en 200 in 24.8s`.
    //
    // Trên hạ tầng serverless, 24 giây vượt trần thời gian của function → người dùng nhận 500
    // thay vì trang có menu mặc định. Chặn nhanh rồi rơi về mặc định luôn tốt hơn chờ lâu rồi
    // rơi về đúng chỗ đó.
    //
    // 5 giây: đủ rộng cho một lời gọi nội mạng chậm, đủ hẹp để người dùng không bỏ đi.
    signal: request.signal ?? AbortSignal.timeout(CONTROL_PLANE_TIMEOUT_MS),
  });
}
