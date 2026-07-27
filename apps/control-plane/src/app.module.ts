import { Module } from '@nestjs/common';
import { AccountModule } from './modules/account/account.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { CatalogModule } from './modules/application-catalog/catalog.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { SiteContentModule } from './modules/site-content/site-content.module.js';
import { DatabaseModule } from './shared/database.module.js';

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
 * P2 thêm DatabaseModule (@Global, cung cấp connection pool dùng chung) và AccountModule
 * (API tài khoản của user, bảo vệ bằng WebSessionGuard).
 */
@Module({
  imports: [
    DatabaseModule,
    HealthModule,
    IdentityModule,
    AccountModule,
    AdminModule,
    CatalogModule,
    SiteContentModule,
  ],
})
export class AppModule {}
