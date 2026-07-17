import { Module } from '@nestjs/common';
import { HealthModule } from './modules/health/health.module.js';

/**
 * Root module của Control Plane — modular monolith (docs/modular.md mục 1.1).
 *
 * API và worker dùng CHUNG module tree này. Chúng là hai entrypoint/deployment role
 * của cùng một codebase, KHÔNG phải hai microservice.
 *
 * Luật ranh giới (docs/modular.md mục 1.2) mà mọi module thêm vào đây phải tuân:
 *   1. Module chỉ đọc/ghi bảng mình sở hữu.
 *   2. Nhu cầu dữ liệu xuyên module đi qua public application port, không import
 *      repository/entity của module khác, không HTTP loopback nội bộ.
 *   3. Controller chỉ điều phối use case công khai, không gọi thẳng repository.
 *
 * P1 chỉ có HealthModule. Các module nghiệp vụ được thêm ở P2+.
 */
@Module({
  imports: [HealthModule],
})
export class AppModule {}
