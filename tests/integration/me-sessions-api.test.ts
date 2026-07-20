import 'reflect-metadata';
import { VersioningType } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../apps/control-plane/src/app.module';
import { provisionByExternalIdentity } from '../../apps/control-plane/src/modules/identity/account-provisioning';
import { createWebSession } from '../../apps/control-plane/src/modules/identity/web-session';
import {
  createDatabaseClient,
  type DatabaseClient,
} from '../../apps/control-plane/src/shared/database';
import { DATABASE_CLIENT } from '../../apps/control-plane/src/shared/database.module';
import { applyAllMigrations, startPostgres } from '../support/postgres';

describe('/v1/me/account/sessions', () => {
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

  /** Tạo một user kèm N phiên; trả token của phiên đầu (dùng làm phiên "hiện tại"). */
  async function seedUser(subject: string, sessionCount = 1) {
    const { accountId } = await provisionByExternalIdentity(client.db, {
      issuer: 'http://localhost:3001/oidc',
      subject,
    });
    const sessions = [];
    for (let i = 0; i < sessionCount; i++) {
      sessions.push(await createWebSession(client.db, accountId, { ttlSeconds: 3600 }));
    }
    return { accountId, sessions };
  }

  /**
   * Header cho request GHI dữ liệu: session token + CSRF token.
   *
   * Request đọc chỉ cần session token; request ghi bắt buộc có cả hai (WebSessionGuard).
   */
  function writeHeaders(session: { sessionToken: string; csrfToken: string } | undefined) {
    return {
      'x-session-token': session?.sessionToken ?? '',
      'x-csrf-token': session?.csrfToken ?? '',
    };
  }

  it('liệt kê phiên của mình, đánh dấu đúng phiên hiện tại, KHÔNG lộ hash', async () => {
    const { sessions } = await seedUser('list-user', 3);
    const current = sessions[0];

    const res = await app.inject({
      method: 'GET',
      url: '/v1/me/account/sessions',
      headers: { 'x-session-token': current?.sessionToken ?? '' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as Array<Record<string, unknown>>;
    expect(body).toHaveLength(3);

    // Đúng một phiên được đánh dấu `current` — chính phiên đang gọi request.
    const currents = body.filter((s) => s.current === true);
    expect(currents).toHaveLength(1);
    expect(currents[0]?.id).toBe(current?.sessionId);

    // Không rò hash token dưới bất kỳ tên trường nào.
    for (const item of body) {
      expect(Object.keys(item)).toEqual([
        'id',
        'createdAt',
        'lastSeenAt',
        'expiresAt',
        'revokedAt',
        'current',
      ]);
    }
  });

  it('thu hồi một phiên của mình → 204, phiên đó hết dùng được', async () => {
    const { sessions } = await seedUser('revoke-user', 2);
    const current = sessions[0];
    const other = sessions[1];

    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/me/account/sessions/${other?.sessionId}`,
      headers: writeHeaders(current),
    });
    expect(res.statusCode).toBe(204);

    // Phiên bị thu hồi không còn xác thực được.
    const usingRevoked = await app.inject({
      method: 'GET',
      url: '/v1/me/account',
      headers: { 'x-session-token': other?.sessionToken ?? '' },
    });
    expect(usingRevoked.statusCode).toBe(401);

    // Phiên hiện tại vẫn dùng được bình thường.
    const usingCurrent = await app.inject({
      method: 'GET',
      url: '/v1/me/account',
      headers: { 'x-session-token': current?.sessionToken ?? '' },
    });
    expect(usingCurrent.statusCode).toBe(200);
  });

  it('KHÔNG thu hồi được phiên của người khác → 404 (không tiết lộ phiên có thật)', async () => {
    const alice = await seedUser('alice-sessions', 1);
    const bob = await seedUser('bob-sessions', 1);

    // Alice biết đúng sessionId của Bob nhưng vẫn không được phép.
    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/me/account/sessions/${bob.sessions[0]?.sessionId}`,
      headers: writeHeaders(alice.sessions[0]),
    });
    expect(res.statusCode).toBe(404);

    // Phiên của Bob KHÔNG bị đụng tới.
    const bobStill = await app.inject({
      method: 'GET',
      url: '/v1/me/account',
      headers: { 'x-session-token': bob.sessions[0]?.sessionToken ?? '' },
    });
    expect(bobStill.statusCode).toBe(200);
  });

  it('đăng xuất mọi nơi → 204, mọi phiên đều hết dùng được', async () => {
    const { sessions } = await seedUser('logout-all', 3);
    const current = sessions[0];

    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/me/account/sessions/all',
      headers: writeHeaders(current),
    });
    expect(res.statusCode).toBe(204);

    for (const session of sessions) {
      const check = await app.inject({
        method: 'GET',
        url: '/v1/me/account',
        headers: { 'x-session-token': session.sessionToken },
      });
      expect(check.statusCode).toBe(401);
    }
  });

  it('không có phiên → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/me/account/sessions' });
    expect(res.statusCode).toBe(401);
  });

  it('sessionId không phải UUID → 400 (validate đầu vào)', async () => {
    const { sessions } = await seedUser('bad-uuid', 1);
    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/me/account/sessions/khong-phai-uuid',
      headers: writeHeaders(sessions[0]),
    });
    expect(res.statusCode).toBe(400);
  });
});
