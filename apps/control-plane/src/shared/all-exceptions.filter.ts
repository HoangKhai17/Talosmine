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

    // Log đầy đủ phía server — bao gồm stack. Đây là nơi DUY NHẤT stack được phép tồn tại.
    this.logger.error(
      { correlationId, status, code, err: exception },
      `Request thất bại: ${message}`,
    );

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
