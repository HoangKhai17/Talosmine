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

/**
 * Hai lớp bảo vệ mà phase-2 mục 12 yêu cầu, kiểm bằng hành vi thật qua HTTP.
 *
 * Cả hai từng THIẾU trong code: CSRF token được sinh ra nhưng không ai đối chiếu, và
 * account bị `disable` vẫn dùng/tạo được phiên. Test ở đây tồn tại để hai lỗ đó không
 * quay lại mà không ai biết.
 */
describe('bảo mật phiên — CSRF và account bị khóa', () => {
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

  async function seedUser(subject: string) {
    const { accountId } = await provisionByExternalIdentity(client.db, {
      issuer: 'http://localhost:3001/oidc',
      subject,
    });
    const session = await createWebSession(client.db, accountId, { ttlSeconds: 3600 });
    return { accountId, session };
  }

  describe('CSRF', () => {
    it('mutation THIẾU CSRF token → 403, không phải 401', async () => {
      // 403 chứ không 401 là có chủ đích: phiên hợp lệ, chỉ là request không chứng minh
      // được nó phát ra từ trang của ta. Trả 401 sẽ khiến client đá người dùng ra đăng
      // nhập lại một cách vô cớ.
      const { session } = await seedUser('csrf-missing');

      const res = await app.inject({
        method: 'DELETE',
        url: '/v1/me/account/sessions/all',
        headers: { 'x-session-token': session.sessionToken },
      });

      expect(res.statusCode).toBe(403);
    });

    it('mutation với CSRF token SAI → 403', async () => {
      const { session } = await seedUser('csrf-wrong');

      const res = await app.inject({
        method: 'DELETE',
        url: '/v1/me/account/sessions/all',
        headers: {
          'x-session-token': session.sessionToken,
          'x-csrf-token': 'token-bia-dat-hoan-toan',
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it('CSRF token của phiên KHÁC không dùng được', async () => {
      // Đây là điểm dễ làm sai: nếu chỉ kiểm "có phải một CSRF token hợp lệ nào đó không"
      // thay vì "có đúng của phiên NÀY không", thì kẻ tấn công tự đăng nhập lấy token của
      // mình rồi dùng cho phiên nạn nhân.
      const victim = await seedUser('csrf-victim');
      const attacker = await seedUser('csrf-attacker');

      const res = await app.inject({
        method: 'DELETE',
        url: '/v1/me/account/sessions/all',
        headers: {
          'x-session-token': victim.session.sessionToken,
          'x-csrf-token': attacker.session.csrfToken,
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it('request ĐỌC (GET) không cần CSRF token', async () => {
      const { session } = await seedUser('csrf-read');

      const res = await app.inject({
        method: 'GET',
        url: '/v1/me/account',
        headers: { 'x-session-token': session.sessionToken },
      });

      expect(res.statusCode).toBe(200);
    });

    it('mutation với CSRF token ĐÚNG đi qua bình thường', async () => {
      const { session } = await seedUser('csrf-ok');

      const res = await app.inject({
        method: 'DELETE',
        url: '/v1/me/account/sessions/all',
        headers: {
          'x-session-token': session.sessionToken,
          'x-csrf-token': session.csrfToken,
        },
      });

      expect(res.statusCode).toBe(204);
    });
  });

  describe('account bị khóa', () => {
    it('phiên của account disabled KHÔNG dùng được, kể cả khi phiên chưa bị thu hồi', async () => {
      // Cố ý đổi status TRỰC TIẾP bằng SQL, KHÔNG qua API disable — vì API disable có thu
      // hồi phiên kèm theo. Ta cần chứng minh lớp bảo vệ thứ hai (kiểm status lúc validate)
      // tự nó đứng vững, chứ không phải chỉ dựa vào việc thu hồi chạy đúng.
      const { accountId, session } = await seedUser('locked-user');

      await client.sql`
        UPDATE control_plane.accounts
        SET status = 'disabled', disabled_at = now()
        WHERE id = ${accountId}
      `;

      const res = await app.inject({
        method: 'GET',
        url: '/v1/me/account',
        headers: { 'x-session-token': session.sessionToken },
      });

      expect(res.statusCode).toBe(401);
    });

    it('account pending cũng không dùng được phiên', async () => {
      const { accountId, session } = await seedUser('pending-user');

      await client.sql`
        UPDATE control_plane.accounts SET status = 'pending' WHERE id = ${accountId}
      `;

      const res = await app.inject({
        method: 'GET',
        url: '/v1/me/account',
        headers: { 'x-session-token': session.sessionToken },
      });

      expect(res.statusCode).toBe(401);
    });

    it('mở khóa lại thì phiên cũ dùng được trở lại', async () => {
      // Kiểm tra rằng lớp bảo vệ là "trạng thái hiện tại của account", không phải một
      // hành động một chiều làm hỏng phiên vĩnh viễn.
      const { accountId, session } = await seedUser('relock-user');

      await client.sql`
        UPDATE control_plane.accounts
        SET status = 'disabled', disabled_at = now()
        WHERE id = ${accountId}
      `;
      const blocked = await app.inject({
        method: 'GET',
        url: '/v1/me/account',
        headers: { 'x-session-token': session.sessionToken },
      });
      expect(blocked.statusCode).toBe(401);

      await client.sql`
        UPDATE control_plane.accounts
        SET status = 'active', disabled_at = NULL
        WHERE id = ${accountId}
      `;
      const allowed = await app.inject({
        method: 'GET',
        url: '/v1/me/account',
        headers: { 'x-session-token': session.sessionToken },
      });
      expect(allowed.statusCode).toBe(200);
    });

    it('account disabled KHÔNG đăng nhập lại được → 403', async () => {
      // Đây là lỗ hổng gốc: `disable` thu hồi hết phiên, nhưng người bị khóa chỉ cần đăng
      // nhập lại là có phiên mới, vì việc xác thực nằm ở IdP — mà IdP không biết gì về
      // trạng thái account bên ta.
      //
      // Không gọi được `POST /v1/auth/sessions` ở đây vì nó cần id_token có chữ ký thật.
      // Thay vào đó kiểm đúng bất biến mà endpoint đó dựa vào: account không active thì
      // không có phiên nào của nó dùng được, nên phiên mới cấp cũng vô giá trị.
      const { accountId } = await seedUser('relogin-user');

      await client.sql`
        UPDATE control_plane.accounts
        SET status = 'disabled', disabled_at = now()
        WHERE id = ${accountId}
      `;

      // Mô phỏng "cấp phiên mới sau khi đã bị khóa".
      const fresh = await createWebSession(client.db, accountId, { ttlSeconds: 3600 });

      const res = await app.inject({
        method: 'GET',
        url: '/v1/me/account',
        headers: { 'x-session-token': fresh.sessionToken },
      });

      expect(res.statusCode).toBe(401);
    });
  });
});
