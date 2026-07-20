import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { AccountController } from './account.controller.js';
import { AccountService } from './account.service.js';

/**
 * Module Account — sở hữu bảng `accounts` và API tài khoản của user.
 *
 * Import IdentityModule để dùng WebSessionGuard mà Identity export — guard là capability
 * của Identity, Account chỉ tiêu thụ. Đây là ranh giới module theo modular.md: không tự
 * khai lại provider của module khác.
 *
 * DatabaseModule là @Global nên không cần import; DATABASE_CLIENT có sẵn để inject.
 */
@Module({
  imports: [IdentityModule],
  controllers: [AccountController],
  providers: [AccountService],
})
export class AccountModule {}
