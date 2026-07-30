import { NextResponse } from 'next/server';
import {
  ControlPlaneBoundaryNotWiredError,
  callControlPlane,
} from '../../../../server/control-plane-boundary';
import { csrfTokenFromRequest, readSessionToken } from '../../../../server/session';

/**
 * Handler duy nhất của ranh giới BFF (phase-1 mục 10).
 *
 * Đây là bề mặt mà browser được phép gọi. Browser không bao giờ biết base URL của
 * Control Plane và không bao giờ giữ session token — cả hai chỉ tồn tại trong process
 * server này.
 *
 * Vai trò cụ thể: đổi cookie `HttpOnly` thành header `x-session-token`. Cookie thì
 * browser tự gửi kèm; header thì phải chủ động đặt — nên một trang khác không thể mượn
 * phiên của người dùng bằng cách gọi thẳng Control Plane.
 */
async function handle(request: Request, segments: string[] | undefined): Promise<Response> {
  // `url.search` giữ nguyên `?locale=vi` v.v. — thiếu dòng này thì MỌI query string từ
  // browser bị bỏ rơi lặng lẽ (catch-all chỉ bắt path segments, không bắt query), và
  // endpoint nào cần tham số qua GET (ví dụ `/me/onboarding/response?locale=`) sẽ luôn nhận
  // `undefined` phía Control Plane mà không có lỗi nào để thấy.
  const url = new URL(request.url);
  const path = `/v1/${(segments ?? []).join('/')}${url.search}`;

  // DELETE không phải lúc nào cũng có body (thu hồi phân quyền kèm `reason` thì có, xoá tài
  // nguyên của chính mình như `/me/onboarding/response` thì không) — HTTP không cấm DELETE
  // mang body nhưng cũng không bắt buộc. Đọc THẬT rồi kiểm độ dài, không suy theo method: coi
  // MỌI request khác GET là "có body" từng khiến DELETE rỗng vẫn bị gắn
  // `content-type: application/json` với thân rỗng — Fastify từ chối thẳng với "Body cannot
  // be empty when content-type is set to 'application/json'". Lỗi này chưa từng lộ ra vì
  // trước đây không có luồng DELETE-không-body nào được bấm thật qua trình duyệt trong e2e.
  const rawBody = request.method !== 'GET' ? await request.text() : '';
  const hasBody = rawBody.length > 0;

  // Request ghi dữ liệu phải qua cửa CSRF trước khi chạm Control Plane.
  const isUnsafe = request.method !== 'GET';
  let csrfToken: string | undefined;

  if (isUnsafe) {
    const csrf = csrfTokenFromRequest(request);
    if (!csrf.ok) {
      return NextResponse.json(
        { code: 'CSRF_INVALID', message: 'Yêu cầu không hợp lệ. Vui lòng tải lại trang.' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    csrfToken = csrf.token;
  }

  try {
    const upstream = await callControlPlane({
      method: request.method,
      path,
      sessionToken: readSessionToken(request.headers.get('cookie')),
      csrfToken,
      body: hasBody ? rawBody : undefined,
      contentType: hasBody
        ? (request.headers.get('content-type') ?? 'application/json')
        : undefined,
    });

    // Trả nguyên status + body của Control Plane: 401 phải tới được client để UI biết
    // cần đăng nhập lại. Nuốt lỗi thành 200 sẽ làm UI hiển thị trạng thái sai.
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: {
        'Cache-Control': 'no-store',
        ...(upstream.headers.get('content-type')
          ? { 'content-type': upstream.headers.get('content-type') as string }
          : {}),
      },
    });
  } catch (error) {
    if (error instanceof ControlPlaneBoundaryNotWiredError) {
      return NextResponse.json(
        { code: error.code, message: 'Chưa cấu hình Control Plane.' },
        { status: 501, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    console.error('[bff] gọi Control Plane thất bại:', error);
    return NextResponse.json(
      { code: 'CONTROL_PLANE_UNREACHABLE', message: 'Không kết nối được máy chủ.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

type RouteContext = { params: Promise<{ segments?: string[] }> };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const { segments } = await context.params;
  return handle(request, segments);
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { segments } = await context.params;
  return handle(request, segments);
}

export async function PUT(request: Request, context: RouteContext): Promise<Response> {
  const { segments } = await context.params;
  return handle(request, segments);
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  const { segments } = await context.params;
  return handle(request, segments);
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  const { segments } = await context.params;
  return handle(request, segments);
}
