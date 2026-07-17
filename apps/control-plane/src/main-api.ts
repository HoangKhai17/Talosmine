import 'reflect-metadata';

import { Logger, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './shared/all-exceptions.filter.js';
import {
  CORRELATION_HEADER,
  resolveCorrelationId,
  runWithCorrelationId,
} from './shared/correlation.js';
import { loadEnv } from './shared/env.js';

/**
 * API entrypoint canonical (phase-1 mục 7).
 * Dùng chung AppModule với main-worker.ts — cùng codebase, khác deployment role.
 */
async function bootstrap(): Promise<void> {
  // Fail fast TRƯỚC khi dựng app: cấu hình sai thì dừng, không chạy với default ngầm.
  const env = loadEnv();

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      // Fastify tự sinh request id; ta dùng correlation ID riêng để truyền xuyên hệ thống.
      genReqId: () => resolveCorrelationId(undefined),
      trustProxy: true,
    }),
    { logger: logLevelsFor(env.LOG_LEVEL) },
  );

  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalFilters(new AllExceptionsFilter());

  // Correlation hook: nhận X-Correlation-Id từ client hoặc sinh mới, đưa vào
  // AsyncLocalStorage để mọi log/lỗi phía dưới thấy được, và trả lại trong response header.
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onRequest', (request, reply, done) => {
      const correlationId = resolveCorrelationId(request.headers[CORRELATION_HEADER]);
      void reply.header(CORRELATION_HEADER, correlationId);
      runWithCorrelationId(correlationId, done);
    });

  await app.listen({ port: env.API_PORT, host: env.API_HOST });

  new Logger('main-api').log(`Control Plane API nghe tại ${env.API_HOST}:${env.API_PORT}`);
}

function logLevelsFor(level: string): ('error' | 'warn' | 'log' | 'debug' | 'verbose')[] {
  switch (level) {
    case 'fatal':
    case 'error':
      return ['error'];
    case 'warn':
      return ['error', 'warn'];
    case 'debug':
      return ['error', 'warn', 'log', 'debug'];
    case 'trace':
      return ['error', 'warn', 'log', 'debug', 'verbose'];
    default:
      return ['error', 'warn', 'log'];
  }
}

bootstrap().catch((err) => {
  // Lỗi lúc khởi động: in ra rồi thoát khác 0. Không cố chạy tiếp trong trạng thái nửa vời.
  new Logger('main-api').error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
