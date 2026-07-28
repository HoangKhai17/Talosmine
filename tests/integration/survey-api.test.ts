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
import { resetEnvCache } from '../../apps/control-plane/src/shared/env';
import { applyAllMigrations, startPostgres } from '../support/postgres';

/**
 * Khảo sát onboarding (`/v1/me/onboarding`).
 *
 * TRỌNG TÂM BỐN THỨ — mỗi thứ là một chỗ hỏng lặng lẽ:
 *   1. Seed của migration thật sự dùng được (đủ ba câu, đủ hai ngôn ngữ).
 *   2. Một account trả lời ĐÚNG MỘT LẦN — kể cả khi gọi thẳng API.
 *   3. `skipped` cũng tắt `required`, nếu không hệ thống hỏi lại mãi.
 *   4. Server kiểm câu trả lời thật, không tin client.
 */
describe('/v1/me/onboarding', () => {
  let container: StartedPostgreSqlContainer;
  let client: DatabaseClient;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    container = await startPostgres();
    client = createDatabaseClient(container.getConnectionUri());
    await applyAllMigrations(client.sql);

    process.env.DATABASE_URL = container.getConnectionUri();
    process.env.NODE_ENV = 'test';
    resetEnvCache();

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
    resetEnvCache();
  });

  beforeEach(async () => {
    // KHÔNG truncate bảng câu hỏi/lựa chọn: chúng do migration seed, không phải dữ liệu test.
    await client.sql`TRUNCATE control_plane.survey_answers, control_plane.survey_responses`;
    await client.sql`TRUNCATE control_plane.accounts CASCADE`;
  });

  async function createUser(subject: string) {
    const { accountId } = await provisionByExternalIdentity(client.db, {
      issuer: 'http://localhost:3001/oidc',
      subject,
    });
    const session = await createWebSession(client.db, accountId, { ttlSeconds: 3600 });
    return {
      accountId,
      headers: {
        'x-session-token': session.sessionToken,
        'x-csrf-token': session.csrfToken,
      },
    };
  }

  const get = (headers: Record<string, string>, locale = 'vi') =>
    app.inject({ method: 'GET', url: `/v1/me/onboarding?locale=${locale}`, headers });

  const post = (headers: Record<string, string>, payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: '/v1/me/onboarding', headers, payload });

  /** Bộ trả lời hợp lệ dựng từ chính seed — không viết cứng khoá vào test. */
  async function validAnswers(headers: Record<string, string>) {
    const body = get(headers);
    const questions = (await body).json().questions as {
      key: string;
      minSelect: number;
      options: { key: string }[];
    }[];

    return questions.map((q) => ({
      questionKey: q.key,
      optionKeys: q.options.slice(0, q.minSelect).map((o) => o.key),
    }));
  }

  describe('seed của migration dùng được', () => {
    it('trả đủ ba câu hỏi, đúng thứ tự, kèm lựa chọn', async () => {
      const user = await createUser('seed-vi');
      const body = (await get(user.headers)).json();

      expect(body.required).toBe(true);
      expect(body.questions.map((q: { key: string }) => q.key)).toEqual([
        'categories',
        'primary_use',
        'discover_first',
      ]);

      const categories = body.questions[0];
      expect(categories.kind).toBe('multi');
      expect(categories.minSelect).toBe(3);
      expect(categories.options.length).toBeGreaterThanOrEqual(3);

      // Câu 1 có icon; câu 2 và 3 có mô tả trong ô — hai hình dạng ô khác nhau của layout.
      expect(categories.options[0].icon).not.toBeNull();
      expect(body.questions[1].options[0].description).not.toBeNull();
    });

    it('có đủ bản dịch cho cả hai ngôn ngữ', async () => {
      const user = await createUser('seed-en');
      const vi = (await get(user.headers, 'vi')).json();
      const en = (await get(user.headers, 'en')).json();

      expect(vi.questions).toHaveLength(3);
      expect(en.questions).toHaveLength(3);
      // Cùng một câu hỏi, hai tiêu đề khác nhau — chứng minh join theo locale hoạt động.
      expect(vi.questions[0].title).not.toBe(en.questions[0].title);
    });

    it('TỪ CHỐI locale ngoài danh mục', async () => {
      const user = await createUser('seed-locale');
      expect((await get(user.headers, 'fr')).statusCode).toBe(400);
    });

    it('thiếu phiên → 401', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/me/onboarding?locale=vi' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('hoàn tất và bỏ qua', () => {
    it('hoàn tất thì ghi câu trả lời và tắt `required`', async () => {
      const user = await createUser('done');
      const answers = await validAnswers(user.headers);

      expect(
        (await post(user.headers, { status: 'completed', locale: 'vi', answers })).statusCode,
      ).toBe(204);

      expect((await get(user.headers)).json().required).toBe(false);

      const rows = await client.sql<{ n: number }[]>`
        SELECT count(*)::int AS n
        FROM control_plane.survey_answers a
        JOIN control_plane.survey_responses r ON r.id = a.response_id
        WHERE r.account_id = ${user.accountId}
      `;
      // 3 (categories) + 1 + 1
      expect(rows[0]?.n).toBe(5);
    });

    /**
     * Bỏ qua PHẢI tạo một hàng. Thiếu nó thì hệ thống không phân biệt được "chưa từng hỏi"
     * với "đã hỏi và họ từ chối", nên sẽ hỏi lại mỗi lần đăng nhập.
     */
    it('bỏ qua cũng tạo bản ghi và tắt `required`', async () => {
      const user = await createUser('skip');
      expect((await post(user.headers, { status: 'skipped', locale: 'vi' })).statusCode).toBe(204);

      expect((await get(user.headers)).json().required).toBe(false);

      const rows = await client.sql<{ status: string }[]>`
        SELECT status FROM control_plane.survey_responses WHERE account_id = ${user.accountId}
      `;
      expect(rows[0]?.status).toBe('skipped');
    });

    it('bỏ qua KHÔNG ghi câu trả lời nào', async () => {
      const user = await createUser('skip-empty');
      await post(user.headers, { status: 'skipped', locale: 'vi' });

      const rows = await client.sql`
        SELECT 1 FROM control_plane.survey_answers a
        JOIN control_plane.survey_responses r ON r.id = a.response_id
        WHERE r.account_id = ${user.accountId}
      `;
      expect(rows).toHaveLength(0);
    });

    it('nộp lần thứ hai → 409', async () => {
      const user = await createUser('twice');
      const answers = await validAnswers(user.headers);

      await post(user.headers, { status: 'completed', locale: 'vi', answers });
      const second = await post(user.headers, { status: 'skipped', locale: 'vi' });

      expect(second.statusCode).toBe(409);
    });
  });

  describe('server kiểm lại, không tin client', () => {
    it('TỪ CHỐI khi câu multi chưa đủ minSelect', async () => {
      const user = await createUser('too-few');
      const answers = await validAnswers(user.headers);
      const first = answers[0] as { questionKey: string; optionKeys: string[] };
      first.optionKeys = first.optionKeys.slice(0, 1);

      expect(
        (await post(user.headers, { status: 'completed', locale: 'vi', answers })).statusCode,
      ).toBe(400);
    });

    it('TỪ CHỐI lựa chọn của câu hỏi KHÁC', async () => {
      const user = await createUser('cross');
      const answers = await validAnswers(user.headers);
      const body = (await get(user.headers)).json();
      const foreignKey = body.questions[1].options[0].key as string;

      const first = answers[0] as { questionKey: string; optionKeys: string[] };
      first.optionKeys = [...first.optionKeys.slice(0, 2), foreignKey];

      expect(
        (await post(user.headers, { status: 'completed', locale: 'vi', answers })).statusCode,
      ).toBe(400);
    });

    it('TỪ CHỐI khi thiếu một câu hỏi', async () => {
      const user = await createUser('missing');
      const answers = (await validAnswers(user.headers)).slice(0, 2);

      expect(
        (await post(user.headers, { status: 'completed', locale: 'vi', answers })).statusCode,
      ).toBe(400);
    });

    it('KHÔNG ghi gì khi câu trả lời bị từ chối', async () => {
      const user = await createUser('rollback');
      const answers = await validAnswers(user.headers);
      const first = answers[0] as { questionKey: string; optionKeys: string[] };
      first.optionKeys = ['khong-co-that'];

      await post(user.headers, { status: 'completed', locale: 'vi', answers });

      // Bản ghi khảo sát được tạo TRƯỚC khi kiểm câu trả lời, nên nếu transaction không
      // rollback thì account này sẽ mắc kẹt: `required` là false mà không có dữ liệu nào.
      const rows = await client.sql`
        SELECT 1 FROM control_plane.survey_responses WHERE account_id = ${user.accountId}
      `;
      expect(rows).toHaveLength(0);
      expect((await get(user.headers)).json().required).toBe(true);
    });

    it('TỪ CHỐI status lạ', async () => {
      const user = await createUser('bad-status');
      expect((await post(user.headers, { status: 'maybe', locale: 'vi' })).statusCode).toBe(400);
    });
  });

  /**
   * Quyền của role runtime — bài này bắt đúng lỗi đã xảy ra ở migration 0010.
   *
   * Chỉ kiểm GRANT tường minh: ở container test migration chạy bằng superuser nên
   * `ALTER DEFAULT PRIVILEGES` không áp dụng, và SELECT/INSERT luôn `false` bất kể migration
   * viết gì. Xem `docs/coding-conventions.md` mục 6.
   */
  describe('quyền của role runtime', () => {
    async function can(table: string, privilege: string): Promise<boolean> {
      const rows = await client.sql<{ ok: boolean }[]>`
        SELECT has_table_privilege('talosmine_runtime', ${`control_plane.${table}`}, ${privilege}) AS ok
      `;
      return rows[0]?.ok === true;
    }

    it('bảng NỘI DUNG có UPDATE tường minh', async () => {
      for (const table of ['survey_questions', 'survey_options', 'survey_option_translations']) {
        expect(await can(table, 'UPDATE'), `${table} cần UPDATE`).toBe(true);
      }
    });

    /**
     * Câu trả lời đã nộp là dữ liệu lịch sử — ứng dụng không có đường sửa hay xoá. Cấp
     * UPDATE/DELETE ở đây nghĩa là một lỗi lập trình cũng làm hỏng được dữ liệu thu thập.
     */
    it('bảng TRẢ LỜI KHÔNG có UPDATE/DELETE', async () => {
      for (const table of ['survey_responses', 'survey_answers']) {
        for (const privilege of ['UPDATE', 'DELETE']) {
          expect(await can(table, privilege), `${table} KHÔNG được có ${privilege}`).toBe(false);
        }
      }
    });
  });
});
