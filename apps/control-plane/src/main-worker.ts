import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { loadEnv } from './shared/env.js';

/**
 * Worker entrypoint canonical (phase-1 mục 7).
 *
 * Ràng buộc (phase-1 mục 9 + docs/modular.md mục 12):
 *   - Dùng CHUNG AppModule với main-api.ts. Không phải microservice riêng,
 *     không có domain riêng, không có schema riêng.
 *   - KHÔNG expose public API. Dựng bằng createApplicationContext() chứ không phải
 *     create() — nên nó không hề mở HTTP server. Test P1.11 kiểm đúng điều này.
 *   - KHÔNG đọc table trực tiếp. Worker chỉ gọi public application port của module
 *     sở hữu. P1 chưa có job nào; P5 mới thêm reconciliation.
 */
async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const logger = new Logger('main-worker');

  // createApplicationContext: nạp DI container nhưng KHÔNG mở HTTP listener.
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger:
      env.LOG_LEVEL === 'debug' ? ['error', 'warn', 'log', 'debug'] : ['error', 'warn', 'log'],
  });

  app.enableShutdownHooks();

  logger.log('Control Plane worker đã khởi động (chưa có job nào — job đầu tiên ở P5).');

  const shutdown = async (signal: string): Promise<void> => {
    logger.log(`Nhận ${signal}, đang tắt worker...`);
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  new Logger('main-worker').error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
