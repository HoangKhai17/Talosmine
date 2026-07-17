import { NextResponse } from 'next/server';
import {
  ControlPlaneBoundaryNotWiredError,
  callControlPlane,
} from '../../../../server/control-plane-boundary';

/**
 * Handler duy nhất của ranh giới BFF (phase-1 mục 10).
 *
 * Đây là bề mặt mà browser được phép gọi. Browser không bao giờ biết base URL của
 * Control Plane và không bao giờ giữ M2M credential — cả hai chỉ tồn tại trong
 * `server/control-plane-boundary.ts`, chạy trong process server này.
 *
 * P1 luôn trả 501: chưa có endpoint Control Plane đã freeze để gọi. Trả 501 là câu trả lời
 * đúng sự thật; trả dữ liệu giả sẽ vi phạm phase-1 mục 5.
 */
async function handle(request: Request, segments: string[] | undefined): Promise<Response> {
  const path = `/${(segments ?? []).join('/')}`;

  try {
    await callControlPlane({ method: request.method, path });
  } catch (error) {
    if (error instanceof ControlPlaneBoundaryNotWiredError) {
      return NextResponse.json(
        {
          code: error.code,
          message: 'BFF boundary exists but no Control Plane route is wired in P1.',
        },
        { status: 501, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    throw error;
  }

  // Không reachable: `callControlPlane` ở P1 luôn reject.
  return NextResponse.json({ code: 'UNREACHABLE', message: 'Unreachable.' }, { status: 500 });
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
