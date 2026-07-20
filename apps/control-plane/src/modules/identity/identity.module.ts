import { Module } from '@nestjs/common';
import { SessionController } from './session.controller.js';
import { SessionService } from './session.service.js';
import { WebSessionGuard } from './web-session.guard.js';

/**
 * Module Identity — sở hữu `external_identities` và `web_sessions`.
 *
 * Export WebSessionGuard để module khác (Account) dùng làm guard mà không phải tự khai
 * lại provider — guard là capability của Identity, không phải của Account.
 */
@Module({
  controllers: [SessionController],
  providers: [SessionService, WebSessionGuard],
  exports: [WebSessionGuard],
})
export class IdentityModule {}
