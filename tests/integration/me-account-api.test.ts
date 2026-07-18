import 'reflect-metadata';
import { VersioningType } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../apps/control-plane/src/app.module';
import { provisionByExternalIdentity } from '../../apps/control-plane/src/modules/identity/account-provisioning';
import {
  createWebSession,
  revokeAllAccountSessions,
} from '../../apps/control-plane/src/modules/identity/web-session';
import {
  createDatabaseClient,
  type DatabaseClient,
} from '../../apps/control-plane/src/shared/database';
import { DATABASE_CLIENT } from '../../apps/control-plane/src/shared/database.module';
import { applyAllMigrations, startPostgres } from '../support/postgres';

/**
 * E2E HTTP cho `/v1/me/account` — chứng minh CẢ CHAIN wiring: request thật đi qua
 * FastifyAdapter -> WebSessionGuard -> AccountService -> DB -> response.
 *
 * Dùng `app.inject()` (light-my-request) thay vì chạy server + curl: nó đi qua đúng
 * pipeline NestJS/Fastify nhưng không phụ thuộc port/timing/process — test tất định.
 *
 * DATABASE_CLIENT của AppModule bị override sang client trỏ testcontainers, nên app thật
 * chạy trên DB test thật (DEC-T05, không mock).
 */
describe('GET /v1/me/account', () => {
  let container: StartedPostgreSqlContainer;
  let client: DatabaseClient;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    container = await startPostgres();
    client = createDatabaseClient(container.getConnectionUri());
    await applyAllMigrations(client.sql);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DATABASE_CLIENT)
      .useValue(client)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await client?.sql.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await client.sql`TRUNCATE control_plane.accounts CASCADE`;
  });

  async function seedSession(): Promise<{ accountId: string; token: string }> {
    const { accountId } = await provisionByExternalIdentity(
      client.db,
      { issuer: 'https://t.auth0.com/', subject: 'auth0|api-user' },
      { displayName: 'Api User', email: 'api@example.com', emailVerified: true },
    );
    const session = await createWebSession(client.db, accountId, { ttlSeconds: 3600 });
    return { accountId, token: session.sessionToken };
  }

  it('phiên hợp lệ → 200 và trả đúng account của mình', async () => {
    const { accountId, token } = await seedSession();

    const res = await app.inject({
      method: 'GET',
      url: '/v1/me/account',
      headers: { 'x-session-token': token },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(accountId);
    expect(body.status).toBe('active');
    expect(body.email).toBe('api@example.com');
    // KHÔNG lộ trường quản trị nội bộ.
    expect(body).not.toHaveProperty('disabledAt');
    expect(body).not.toHaveProperty('updatedAt');
  });

  it('không có session token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/me/account' });
    expect(res.statusCode).toBe(401);
  });

  it('session token bịa → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/me/account',
      headers: { 'x-session-token': 'khong-phai-token-that' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('phiên đã thu hồi → 401 (guard resolve accountId từ server, không tin client)', async () => {
    const { accountId, token } = await seedSession();
    // Thu hồi qua chính logic session (mô phỏng logout ở nơi khác), không tự tính hash
    // trong SQL — tránh phụ thuộc pgcrypto và dùng đúng đường mà code nghiệp vụ đi.
    await revokeAllAccountSessions(client.db, accountId, 'test revoke');

    const res = await app.inject({
      method: 'GET',
      url: '/v1/me/account',
      headers: { 'x-session-token': token },
    });
    expect(res.statusCode).toBe(401);
  });
});
