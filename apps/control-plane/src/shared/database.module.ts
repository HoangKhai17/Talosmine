import { Global, Module } from '@nestjs/common';
import { createDatabaseClient, type DatabaseClient } from './database.js';
import { loadEnv } from './env.js';

/**
 * Token DI cho database client dùng chung toàn app.
 *
 * Trước module này, HealthService tự tạo client riêng. Từ đây mọi module inject CÙNG một
 * client (một connection pool) qua token này — không mỗi module một pool.
 */
export const DATABASE_CLIENT = Symbol('DATABASE_CLIENT');

/**
 * `@Global`: client là hạ tầng dùng chung, không cần import DatabaseModule ở từng feature
 * module. Factory chạy một lần (singleton) khi app khởi động; `loadEnv` fail-fast nếu thiếu
 * DATABASE_URL nên cấu hình sai làm app dừng ngay, không chạy với pool nửa vời.
 */
@Global()
@Module({
  providers: [
    {
      provide: DATABASE_CLIENT,
      useFactory: (): DatabaseClient => {
        const env = loadEnv();
        return createDatabaseClient(env.DATABASE_URL);
      },
    },
  ],
  exports: [DATABASE_CLIENT],
})
export class DatabaseModule {}
