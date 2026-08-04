import {
  OutboundError,
  type OutboundFetchOptions,
  outboundFetch,
} from '../../../shared/outbound-fetch.js';

/**
 * Adapter HuggingFace — nhà cung cấp `hosted` đầu tiên (DEC-B17).
 *
 * BỀ MẶT CỐ Ý HẸP: một hàm, vào chuỗi, ra chuỗi. Thêm nhà cung cấp thứ hai = thêm một file
 * cùng chữ ký, KHÔNG sửa controller hay service. Nếu adapter bắt đầu phải biết về
 * `applications`, audit hay phiên đăng nhập thì ranh giới đã bị phá.
 *
 * KHOÁ API KHÔNG NẰM Ở ĐÂY. Nó được truyền vào; ai đọc nó từ đâu là việc của caller. Nhờ
 * vậy khi DEC-T27 thay env bằng bảng credential mã hoá thì file này không đổi một dòng.
 */

export interface HuggingFaceRunInput {
  endpointUrl: string;
  model: string | null;
  input: string;
  apiToken: string;
  timeoutMs: number;
}

/**
 * Gọi HuggingFace Inference API.
 *
 * Hợp đồng phản hồi của HuggingFace không đồng nhất giữa các loại model (mảng, object,
 * chuỗi), nên KHÔNG cố phân tích thành một cấu trúc cố định — trả về dạng chuỗi và để tầng
 * trên quyết định. Ép một lược đồ chung lên đây sẽ vỡ ngay khi đổi model, và vỡ ở chỗ khó
 * hiểu (giữa luồng chạy) thay vì ở chỗ dễ thấy.
 */
export async function runHuggingFace(
  params: HuggingFaceRunInput,
  policy: Omit<OutboundFetchOptions, 'timeoutMs'>,
): Promise<string> {
  const payload: Record<string, unknown> = { inputs: params.input };
  if (params.model) payload.model = params.model;

  const result = await outboundFetch(
    params.endpointUrl,
    {
      method: 'POST',
      headers: {
        // Khoá đi trong header Authorization và KHÔNG bao giờ xuất hiện trong URL: URL bị
        // ghi vào log truy cập của mọi proxy trên đường đi, header thì không.
        authorization: `Bearer ${params.apiToken}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(payload),
    },
    { ...policy, timeoutMs: params.timeoutMs },
  );

  if (result.status < 200 || result.status >= 300) {
    // KHÔNG vọng nguyên văn thân lỗi ra ngoài: phản hồi lỗi của nhà cung cấp có thể chứa
    // tên model nội bộ, cấu hình, hoặc chính chuỗi request kèm khoá nếu ta lỡ gửi sai chỗ.
    // Chỉ giữ lại mã trạng thái — đủ để chẩn đoán, không đủ để rò.
    throw new OutboundError('NETWORK_ERROR', `Nhà cung cấp trả về mã ${result.status}.`);
  }

  return result.body;
}
