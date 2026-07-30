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

  describe('/v1/me/onboarding/response — xem/xoá câu trả lời của chính mình (DEC-B11 câu 2)', () => {
    const getResponse = (headers: Record<string, string>, locale = 'vi') =>
      app.inject({
        method: 'GET',
        url: `/v1/me/onboarding/response?locale=${locale}`,
        headers,
      });

    const deleteResponse = (headers: Record<string, string>) =>
      app.inject({ method: 'DELETE', url: '/v1/me/onboarding/response', headers });

    it('404 khi account chưa từng trả lời/bỏ qua', async () => {
      const user = await createUser('response-none');
      expect((await getResponse(user.headers)).statusCode).toBe(404);
    });

    it('thiếu phiên → 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/me/onboarding/response?locale=vi',
      });
      expect(res.statusCode).toBe(401);
    });

    it('TỪ CHỐI locale ngoài danh mục', async () => {
      const user = await createUser('response-bad-locale');
      expect((await getResponse(user.headers, 'fr')).statusCode).toBe(400);
    });

    it('trả nội dung ĐỌC ĐƯỢC (câu hỏi + lựa chọn) cho lần trả lời đã hoàn tất', async () => {
      const user = await createUser('response-completed');
      const answers = await validAnswers(user.headers);
      await post(user.headers, { status: 'completed', locale: 'vi', answers });

      const body = (await getResponse(user.headers)).json();
      expect(body.status).toBe('completed');
      expect(body.locale).toBe('vi');
      expect(body.answers).toHaveLength(answers.length);

      // Khoá phải khớp với những gì vừa nộp, và mỗi câu phải có tiêu đề + nhãn ĐỌC ĐƯỢC
      // (không phải khoá thô như `SurveyResponseRecord` của admin).
      const categoriesAnswer = body.answers.find(
        (a: { questionKey: string }) => a.questionKey === 'categories',
      );
      expect(categoriesAnswer.questionTitle).toEqual(expect.any(String));
      expect(categoriesAnswer.questionTitle.length).toBeGreaterThan(0);
      expect(categoriesAnswer.selectedOptions.length).toBeGreaterThan(0);
      for (const option of categoriesAnswer.selectedOptions) {
        expect(option.key).toEqual(expect.any(String));
        expect(option.label).toEqual(expect.any(String));
        expect(option.label.length).toBeGreaterThan(0);
      }
    });

    it('trả tiêu đề/nhãn KHÁC NHAU theo locale, cùng một lần trả lời', async () => {
      const user = await createUser('response-locale');
      const answers = await validAnswers(user.headers);
      await post(user.headers, { status: 'completed', locale: 'vi', answers });

      const vi = (await getResponse(user.headers, 'vi')).json();
      const en = (await getResponse(user.headers, 'en')).json();

      expect(vi.answers[0].questionTitle).not.toBe(en.answers[0].questionTitle);
      expect(vi.answers[0].selectedOptions[0].label).not.toBe(
        en.answers[0].selectedOptions[0].label,
      );
      // Khoá (key) phải giữ nguyên bất kể locale — chỉ nhãn hiển thị đổi.
      expect(vi.answers[0].questionKey).toBe(en.answers[0].questionKey);
      expect(vi.answers[0].selectedOptions[0].key).toBe(en.answers[0].selectedOptions[0].key);
    });

    it('trả `answers` rỗng cho lần bỏ qua', async () => {
      const user = await createUser('response-skipped');
      await post(user.headers, { status: 'skipped', locale: 'vi' });

      const body = (await getResponse(user.headers)).json();
      expect(body.status).toBe('skipped');
      expect(body.answers).toEqual([]);
    });

    it('vẫn hiển thị lựa chọn đã bị admin đổi trạng thái SAU khi trả lời', async () => {
      const user = await createUser('response-inactive-option');
      const answers = await validAnswers(user.headers);
      await post(user.headers, { status: 'completed', locale: 'vi', answers });

      // Tắt MỌI lựa chọn `active` — mô phỏng admin đổi trạng thái sau khi người dùng đã trả
      // lời. `survey_options` là dữ liệu SEED, KHÔNG bị `beforeEach` truncate/reset — đổi
      // trạng thái ở đây rò rỉ sang MỌI test chạy sau trong file này nếu không tự phục hồi.
      // `try/finally` đảm bảo phục hồi kể cả khi assertion bên dưới thất bại.
      try {
        await client.sql`UPDATE control_plane.survey_options SET status = 'inactive'`;

        const body = (await getResponse(user.headers)).json();
        // Lịch sử câu trả lời KHÔNG được biến mất chỉ vì lựa chọn đó không còn `active` —
        // khác `GET /v1/me/onboarding`, endpoint này không lọc theo status.
        expect(body.answers).toHaveLength(answers.length);
      } finally {
        await client.sql`UPDATE control_plane.survey_options SET status = 'active'`;
      }
    });

    it('xoá thành công → 204, tự xoá theo tầng cả answers, và required bật lại true', async () => {
      const user = await createUser('response-delete');
      const answers = await validAnswers(user.headers);
      await post(user.headers, { status: 'completed', locale: 'vi', answers });

      expect((await deleteResponse(user.headers)).statusCode).toBe(204);

      const responseRows = await client.sql`
        SELECT 1 FROM control_plane.survey_responses WHERE account_id = ${user.accountId}
      `;
      expect(responseRows).toHaveLength(0);

      const answerRows = await client.sql`
        SELECT 1 FROM control_plane.survey_answers a
        JOIN control_plane.survey_responses r ON r.id = a.response_id
        WHERE r.account_id = ${user.accountId}
      `;
      expect(answerRows).toHaveLength(0);

      expect((await get(user.headers)).json().required).toBe(true);
    });

    it('xoá khi chưa có gì để xoá → 404', async () => {
      const user = await createUser('response-delete-none');
      expect((await deleteResponse(user.headers)).statusCode).toBe(404);
    });

    it('xoá thiếu phiên → 401', async () => {
      const res = await app.inject({ method: 'DELETE', url: '/v1/me/onboarding/response' });
      expect(res.statusCode).toBe(401);
    });

    it('KHÔNG đọc/xoá được câu trả lời của account KHÁC', async () => {
      const owner = await createUser('response-owner');
      const stranger = await createUser('response-stranger');
      await post(owner.headers, { status: 'skipped', locale: 'vi' });

      // Stranger chưa có response của CHÍNH họ — accountId luôn đến từ phiên, không có cách
      // nào truyền id của owner vào request để dò/xoá hộ.
      expect((await getResponse(stranger.headers)).statusCode).toBe(404);
      expect((await deleteResponse(stranger.headers)).statusCode).toBe(404);

      // Response của owner vẫn còn nguyên sau khi stranger cố xoá.
      const rows = await client.sql`
        SELECT 1 FROM control_plane.survey_responses WHERE account_id = ${owner.accountId}
      `;
      expect(rows).toHaveLength(1);
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
     * Câu trả lời đã nộp là dữ liệu lịch sử — ứng dụng không có đường SỬA. Cấp UPDATE ở đây
     * nghĩa là một lỗi lập trình cũng làm hỏng được dữ liệu thu thập.
     */
    it('bảng TRẢ LỜI KHÔNG có UPDATE', async () => {
      for (const table of ['survey_responses', 'survey_answers']) {
        expect(await can(table, 'UPDATE'), `${table} KHÔNG được có UPDATE`).toBe(false);
      }
    });

    /**
     * `survey_answers` KHÔNG có DELETE trực tiếp — migration 0016 (DEC-B11 câu 2) chỉ cấp
     * DELETE trên `survey_responses`. Xoá answers CHỈ xảy ra như hệ quả của xoá đúng MỘT
     * response (`ON DELETE CASCADE`) — đã kiểm chứng thật rằng cascade KHÔNG đòi role phải
     * có DELETE trên bảng con, nên không cần cấp thêm ở đây. Có DELETE trực tiếp trên
     * `survey_answers` sẽ mở một đường xoá lẻ từng câu trả lời mà không qua response.
     */
    it('`survey_answers` KHÔNG có DELETE trực tiếp', async () => {
      expect(await can('survey_answers', 'DELETE')).toBe(false);
    });

    /**
     * `survey_responses` CÓ DELETE — DEC-B11 câu 2 (2026-07-30): người dùng được tự xoá câu
     * trả lời khảo sát của chính mình (`DELETE /v1/me/onboarding/response`).
     */
    it('`survey_responses` CÓ DELETE (DEC-B11 câu 2 — tự xoá dữ liệu của chính mình)', async () => {
      expect(await can('survey_responses', 'DELETE')).toBe(true);
    });
  });
});
