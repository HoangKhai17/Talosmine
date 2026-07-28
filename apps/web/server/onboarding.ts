import type { Locale } from '../i18n/locale';
import { callControlPlane } from './control-plane-boundary';

/**
 * Khảo sát onboarding đọc từ Control Plane, phía SERVER.
 *
 * VÌ SAO ĐỌC Ở SERVER chứ không để client gọi: màn hình khảo sát là thứ đầu tiên người dùng
 * mới thấy. Đọc ở client nghĩa là họ thấy một khung trống rồi nội dung nhảy vào — ấn tượng
 * đầu tiên tệ nhất có thể. Server đã có cookie phiên nên lấy luôn được.
 *
 * KHÔNG CACHE, khác `site-nav.ts`: kết quả phụ thuộc TỪNG account (`required`), nên một
 * cache dùng chung sẽ trả trạng thái của người này cho người khác. Đây cũng là đường chạy
 * đúng một lần cho mỗi người dùng, nên không có gì để tiết kiệm.
 */

export interface SurveyOption {
  key: string;
  label: string;
  description: string | null;
  icon: string | null;
}

export interface SurveyQuestion {
  key: string;
  kind: 'single' | 'multi';
  minSelect: number;
  title: string;
  description: string | null;
  options: SurveyOption[];
}

export interface OnboardingSurvey {
  required: boolean;
  questions: SurveyQuestion[];
}

/** Trạng thái an toàn khi không đọc được: coi như không cần khảo sát. */
const NOT_REQUIRED: OnboardingSurvey = { required: false, questions: [] };

/**
 * Đọc trạng thái onboarding của phiên hiện tại.
 *
 * FAIL-OPEN CÓ CHỦ ĐÍCH: Control Plane không trả lời được thì trả `required: false`, tức là
 * người dùng đi thẳng vào sản phẩm. Đây là màn hình thu thập dữ liệu tuỳ chọn — chặn đường
 * vào sản phẩm vì một lỗi mạng là cái giá lớn hơn nhiều so với việc mất một bản khảo sát.
 *
 * (Khác hẳn với authorization, nơi luật là fail-CLOSED — xem `decideAdminAccess`.)
 */
export async function readOnboarding(
  sessionToken: string | undefined,
  locale: Locale,
): Promise<OnboardingSurvey> {
  if (!sessionToken) return NOT_REQUIRED;

  try {
    const response = await callControlPlane({
      method: 'GET',
      path: `/v1/me/onboarding?locale=${encodeURIComponent(locale)}`,
      sessionToken,
    });

    if (!response.ok) {
      console.warn(`[onboarding] Control Plane trả ${response.status} — bỏ qua khảo sát`);
      return NOT_REQUIRED;
    }

    return parse(await response.json());
  } catch (error) {
    console.warn('[onboarding] không đọc được trạng thái khảo sát:', error);
    return NOT_REQUIRED;
  }
}

/**
 * Đọc payload phòng thủ.
 *
 * Câu hỏi thiếu trường bắt buộc bị BỎ QUA thay vì render ra `undefined` giữa màn hình. Câu
 * hỏi không có lựa chọn nào cũng bị bỏ: nó không trả lời được, nên hiển thị nó chỉ khiến
 * người dùng kẹt ở một nút "Hoàn tất" không bao giờ bật.
 */
function parse(payload: unknown): OnboardingSurvey {
  const raw = payload as { required?: unknown; questions?: unknown } | null;
  if (raw?.required !== true || !Array.isArray(raw.questions)) return NOT_REQUIRED;

  const questions: SurveyQuestion[] = [];

  for (const item of raw.questions as unknown[]) {
    const q = item as Record<string, unknown> | null;
    if (
      typeof q?.key !== 'string' ||
      (q.kind !== 'single' && q.kind !== 'multi') ||
      typeof q.minSelect !== 'number' ||
      typeof q.title !== 'string' ||
      !Array.isArray(q.options)
    ) {
      continue;
    }

    const options: SurveyOption[] = [];
    for (const rawOption of q.options as unknown[]) {
      const o = rawOption as Record<string, unknown> | null;
      if (typeof o?.key !== 'string' || typeof o.label !== 'string') continue;

      options.push({
        key: o.key,
        label: o.label,
        description: typeof o.description === 'string' ? o.description : null,
        icon: typeof o.icon === 'string' ? o.icon : null,
      });
    }

    if (options.length === 0) continue;

    questions.push({
      key: q.key,
      kind: q.kind,
      minSelect: q.minSelect,
      title: q.title,
      description: typeof q.description === 'string' ? q.description : null,
      options,
    });
  }

  // Không còn câu hỏi nào dùng được thì không có gì để hỏi.
  if (questions.length === 0) return NOT_REQUIRED;

  return { required: true, questions };
}
