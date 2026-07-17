import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  ServiceUnavailableException,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { HealthService } from './health.service.js';

/**
 * Health endpoints — phase-1 mục 9.
 *
 * `VERSION_NEUTRAL`: health nằm ngoài versioning `/v1` vì nó là endpoint hạ tầng
 * (orchestrator/Caddy gọi), không phải API nghiệp vụ có contract với client.
 *
 * Ràng buộc bảo mật: response KHÔNG lộ config, secret hay topology nội bộ —
 * không trả host DB, version, connection string hay chi tiết dependency.
 */
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /**
   * Liveness: process/event loop còn đáp ứng hay không. KHÔNG chạm DB.
   *
   * Vì sao không chạm DB: liveness quyết định việc RESTART container. Nếu nó phụ thuộc
   * DB thì một sự cố DB sẽ làm restart hàng loạt app vốn đang khoẻ — biến sự cố một
   * thành phần thành sự cố toàn hệ thống.
   */
  @Get('live')
  @HttpCode(HttpStatus.OK)
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /**
   * Readiness: có nên nhận traffic không. CÓ kiểm tra dependency bắt buộc.
   * DB chết -> không sẵn sàng -> ngừng nhận traffic, nhưng KHÔNG bị restart.
   *
   * Dùng exception thay vì `@Res()` để trả 503: `@Res()` sẽ opt-out khỏi response
   * pipeline của Nest, khiến interceptor/filter không còn áp dụng cho route này.
   * Ném exception giữ 503 đi qua AllExceptionsFilter nên vẫn có đúng error envelope
   * và correlation ID.
   */
  @Get('ready')
  @HttpCode(HttpStatus.OK)
  async ready(): Promise<{ status: 'ready' }> {
    const ok = await this.health.checkDependencies();
    if (!ok) {
      throw new ServiceUnavailableException('Dependency chưa sẵn sàng.');
    }
    return { status: 'ready' };
  }
}
