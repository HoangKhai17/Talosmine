import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { getCorrelationId } from './correlation.js';
import { buildErrorEnvelope, ErrorCode } from './error-envelope.js';

/**
 * Bắt MỌI exception và trả về đúng error envelope.
 *
 * Ràng buộc bảo mật (phase-1 mục 9 + 14): response KHÔNG BAO GIỜ chứa stack trace,
 * secret, hay chi tiết nội bộ. Chi tiết thật chỉ đi vào log phía server.
 * Đây là lý do filter này bắt `unknown` chứ không chỉ HttpException — một lỗi
 * không lường trước mà lọt ra nguyên trạng chính là đường rò thông tin.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const correlationId = getCorrelationId() ?? 'unknown';

    const { status, code, message } = this.classify(exception);

    // MỨC LOG THEO LOẠI LỖI, không phải "mọi exception đều là error".
    //
    // 4xx là KẾT QUẢ BÌNH THƯỜNG của một API, không phải sự cố: tra một `key` không tồn tại,
    // hỏi logo khi chưa ai tải lên, gửi thiếu trường. Chính `site-logo.controller.ts` ghi rõ
    // "404 là tín hiệu cho BFF rơi về logo chữ — không phải lỗi", vậy mà trước đây nó vẫn in
    // ra mức ERROR kèm stack trace.
    //
    // Hệ quả không phải chỉ xấu mắt: một log đầy ERROR giả khiến ERROR thật chìm nghỉm, và
    // người trực đêm sự cố mất thời gian loại trừ những dòng vốn vô hại. Đây là lý do duy
    // nhất đáng để phân biệt hai mức.
    //
    // 5xx GIỮ NGUYÊN `error` KÈM STACK — đó là lỗi của chính ta, và đây vẫn là nơi DUY NHẤT
    // stack được phép tồn tại (response không bao giờ chứa nó).
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        { correlationId, status, code, err: exception },
        `Request thất bại: ${message}`,
      );
    } else {
      // KHÔNG kèm `err`: stack của một `NotFoundException` không nói thêm được gì ngoài
      // đường gọi mà `status` + `code` đã đủ chỉ ra.
      //
      // Vẫn ở mức `warn` chứ không phải `debug`: 401/403 là 4xx nhưng đáng nhìn thấy khi rà
      // soát bảo mật — một chuỗi 403 liên tiếp là tín hiệu cần biết.
      this.logger.warn({ correlationId, status, code }, `Request bị từ chối: ${message}`);
    }

    void reply.status(status).send(buildErrorEnvelope(code, message, correlationId));
  }

  private classify(exception: unknown): { status: number; code: string; message: string } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();

      // HttpException có thể mang message chi tiết do dev đặt. Chỉ tin nó khi
      // đây là lỗi client (4xx) — 5xx luôn bị thay bằng thông điệp chung.
      if (status < HttpStatus.INTERNAL_SERVER_ERROR) {
        const message =
          typeof response === 'string'
            ? response
            : ((response as { message?: unknown }).message ?? exception.message);

        return {
          status,
          code: this.codeForStatus(status),
          message: Array.isArray(message) ? message.join('; ') : String(message),
        };
      }
    }

    // Mọi thứ còn lại — kể cả lỗi lập trình — trở thành 500 với thông điệp chung.
    // Không lộ `exception.message` vì nó có thể chứa connection string, tên bảng...
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Đã xảy ra lỗi nội bộ.',
    };
  }

  private codeForStatus(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCode.VALIDATION_FAILED;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.NOT_FOUND;
      case HttpStatus.SERVICE_UNAVAILABLE:
        return ErrorCode.SERVICE_UNAVAILABLE;
      default:
        return ErrorCode.INTERNAL_ERROR;
    }
  }
}
