import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { getCorrelationId } from '../../shared/correlation.js';
import { type AuthenticatedRequest, WebSessionGuard } from '../identity/web-session.guard.js';
import { HostedRunError, HostedRunService } from './hosted-run.service.js';

/** Trần độ dài đầu vào — khớp `maxLength` của `HostedRunRequest` trong OpenAPI. */
const MAX_INPUT_LENGTH = 10_000;

interface RunBody {
  input?: unknown;
}

/**
 * Chạy ứng dụng `hosted` (DEC-B17).
 *
 * Tách khỏi `CatalogController` dù cùng tiền tố đường dẫn: controller kia CHỈ ĐỌC danh mục,
 * còn đây là đường duy nhất khiến Control Plane gọi ra Internet và tiêu tài nguyên thật.
 * Trộn hai thứ vào một file sẽ làm ranh giới đó biến mất khỏi tầm mắt người đọc.
 */
@Controller({ path: 'catalog/applications', version: '1' })
@UseGuards(WebSessionGuard)
export class HostedRunController {
  // Token tường minh: dev runner (tsx/esbuild) không sinh `emitDecoratorMetadata`.
  constructor(@Inject(HostedRunService) private readonly hostedRun: HostedRunService) {}

  /**
   * `HttpCode(OK)` là BẮT BUỘC: NestJS mặc định trả 201 cho `@Post`, mà 201 nghĩa là "đã
   * tạo một tài nguyên mới ở đâu đó" — sai hẳn với ngữ nghĩa ở đây (chạy một phép tính rồi
   * trả kết quả, không tạo gì). OpenAPI khai 200, và hai bên phải khớp nhau.
   */
  @Post(':key/run')
  @HttpCode(HttpStatus.OK)
  async run(
    @Req() request: AuthenticatedRequest,
    @Param('key') key: string,
    @Body() body: RunBody,
  ): Promise<{ output: string }> {
    const input = body?.input;

    // Kiểm ở controller vì đây là biên với thế giới ngoài. Service nhận `string` đã sạch và
    // không phải tự hỏi lại — cùng cách các controller khác trong repo đang làm.
    if (typeof input !== 'string' || input.trim() === '') {
      throw new BadRequestException('`input` phải là chuỗi không rỗng.');
    }
    if (input.length > MAX_INPUT_LENGTH) {
      throw new BadRequestException(`\`input\` vượt quá ${MAX_INPUT_LENGTH} ký tự.`);
    }

    const accountId = request.auth?.accountId;
    if (!accountId) throw new UnauthorizedException('Thiếu phiên đăng nhập.');

    try {
      const output = await this.hostedRun.run(key.toLowerCase(), input, {
        accountId,
        correlationId: getCorrelationId(),
      });
      return { output };
    } catch (error) {
      throw toHttp(error);
    }
  }
}

/**
 * Map lỗi nghiệp vụ sang HTTP.
 *
 * Ba mã, ba ý nghĩa khác nhau — gộp lại thành một mã chung sẽ khiến người vận hành không
 * biết lỗi thuộc về ai:
 *   NOT_FOUND       → 404, lỗi của người gọi (hoặc app chưa phát hành)
 *   NOT_CONFIGURED  → 503, lỗi CẤU HÌNH của người vận hành, không phải của người dùng
 *   PROVIDER_FAILED → 502, lỗi ở phía nhà cung cấp bên ngoài
 */
function toHttp(error: unknown): Error {
  if (!(error instanceof HostedRunError)) return error as Error;

  if (error.code === 'NOT_FOUND') return new NotFoundException(error.message);
  if (error.code === 'NOT_CONFIGURED') return new ServiceUnavailableException(error.message);
  return new BadGatewayException(error.message);
}
