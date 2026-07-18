import { Module } from '@nestjs/common';
import { WebSessionGuard } from '../identity/web-session.guard.js';
import { AccountController } from './account.controller.js';
import { AccountService } from './account.service.js';

/**
 * Module Account — sở hữu bảng `accounts` và API tài khoản của user.
 *
 * WebSessionGuard đăng ký ở đây (nó thuộc Identity nhưng được Account dùng làm guard).
 * DatabaseModule là @Global nên không cần import; DATABASE_CLIENT có sẵn để inject.
 */
@Module({
  controllers: [AccountController],
  providers: [AccountService, WebSessionGuard],
})
export class AccountModule {}
