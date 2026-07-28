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
 * Quản trị khảo sát (`/v1/admin/survey/*`).
 *
 * TRỌNG TÂM NĂM THỨ — mỗi thứ là một chỗ hỏng lặng lẽ:
 *
 *   1. **Hai permission tách hẳn nhau.** `content:*` sửa được câu hỏi nhưng KHÔNG đọc được
 *      câu trả lời; `survey_response:read` thì ngược lại. Đây là ranh giới quan trọng nhất
 *      của cả nhóm endpoint — gộp nhầm là mở dữ liệu cá nhân cho người biên tập nội dung.
 *   2. **`minSelect` không bao giờ vượt số lựa chọn `active`.** Cả hai đường đều phải chặn:
 *      nâng `minSelect` lên, và gỡ lựa chọn xuống. Lọt một đường là khảo sát không ai nộp nổi.
 *   3. **Lựa chọn đã có người trả lời thì không xoá được** — 409, không phải 500.
 *   4. **Sắp xếp lại chạy được nhờ unique DEFERRABLE.** Nếu ai đó "dọn dẹp" migration bằng
 *      `CREATE UNIQUE INDEX`, mọi thứ khác vẫn xanh và chỉ nút đổi thứ tự chết.
 *   5. **Tổng hợp đếm đúng**: `respondentCount` là số NGƯỜI, khác tổng lượt chọn ở câu multi.
 */
describe('/v1/admin/survey', () => {
  let container: StartedPostgreSqlContainer;
  let client: DatabaseClient;
  let app: NestFastifyApplication;

  /**
   * Ảnh chụp nội dung do migration seed.
   *
   * Câu hỏi và lựa chọn KHÔNG phải dữ liệu test — chúng do migration tạo. Nhưng test có sửa
   * chúng, nên phải khôi phục trước mỗi ca thay vì truncate (truncate sẽ xoá luôn seed và
   * mọi ca sau chạy trên bảng rỗng, xanh một cách vô nghĩa).
   */
  let seedOptions: { id: string; sort_order: number; status: string }[] = [];
  let seedQuestions: { id: string; key: string; min_select: number }[] = [];

  beforeAll(async () => {
    container = await startPostgres();
    client = createDatabaseClient(container.getConnectionUri());
    await applyAllMigrations(client.sql);

    process.env.DATABASE_URL = container.getConnectionUri();
    process.env.NODE_ENV = 'test';
    resetEnvCache();

    seedOptions = await client.sql<{ id: string; sort_order: number; status: string }[]>`
      SELECT id, sort_order, status FROM control_plane.survey_options
    `;
    seedQuestions = await client.sql<{ id: string; key: string; min_select: number }[]>`
      SELECT id, key, min_select FROM control_plane.survey_questions
    `;

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
    await client.sql`TRUNCATE control_plane.survey_answers, control_plane.survey_responses`;
    await client.sql`TRUNCATE control_plane.admin_role_assignments, control_plane.admin_role_permissions, control_plane.admin_roles`;
    await client.sql`TRUNCATE control_plane.accounts CASCADE`;

    const seedIds = seedOptions.map((o) => o.id);
    await client.sql`
      DELETE FROM control_plane.survey_options WHERE NOT (id = ANY(${seedIds}::uuid[]))
    `;

    // MỘT transaction cho cả vòng lặp, không phải mỗi câu một transaction: ca "sắp xếp lại"
    // đã đảo hai `sort_order`, nên khôi phục từng hàng sẽ chạm ràng buộc UNIQUE ở hàng đầu
    // tiên. Ràng buộc là DEFERRABLE INITIALLY DEFERRED — nó chỉ dời được tới COMMIT khi mọi
    // câu UPDATE nằm chung MỘT transaction.
    await client.sql.begin(async (tx) => {
      for (const option of seedOptions) {
        await tx`
          UPDATE control_plane.survey_options
          SET sort_order = ${option.sort_order}, status = ${option.status}
          WHERE id = ${option.id}
        `;
      }
      for (const question of seedQuestions) {
        await tx`
          UPDATE control_plane.survey_questions
          SET min_select = ${question.min_select}
          WHERE id = ${question.id}
        `;
      }
    });
  });

  async function createUser(subject: string, permissions: string[] = []) {
    const { accountId } = await provisionByExternalIdentity(client.db, {
      issuer: 'http://localhost:3001/oidc',
      subject,
    });

    if (permissions.length > 0) {
      const roleId = crypto.randomUUID();
      await client.sql`
        INSERT INTO control_plane.admin_roles (id, key, display_name, status)
        VALUES (${roleId}, ${`r-${subject}`}, ${subject}, 'active')
      `;
      for (const permission of permissions) {
        await client.sql`
          INSERT INTO control_plane.admin_role_permissions (id, admin_role_id, permission)
          VALUES (${crypto.randomUUID()}, ${roleId}, ${permission})
        `;
      }
      await client.sql`
        INSERT INTO control_plane.admin_role_assignments
          (id, admin_role_id, account_id, valid_from, reason, assigned_by_account_id)
        VALUES (${crypto.randomUUID()}, ${roleId}, ${accountId}, now(), 'test', ${accountId})
      `;
    }

    const session = await createWebSession(client.db, accountId, { ttlSeconds: 3600 });
    return {
      accountId,
      headers: {
        'x-session-token': session.sessionToken,
        'x-csrf-token': session.csrfToken,
      },
    };
  }

  const CONTENT = ['content:read', 'content:manage', 'content:publish'];

  interface AdminOption {
    id: string;
    key: string;
    status: string;
    sortOrder: number;
    icon: string | null;
    labels: { vi?: string | null; en?: string | null };
    descriptions: { vi?: string | null; en?: string | null };
  }
  interface AdminQuestion {
    id: string;
    key: string;
    kind: string;
    minSelect: number;
    titles: { vi?: string | null; en?: string | null };
    options: AdminOption[];
  }

  async function listQuestions(headers: Record<string, string>): Promise<AdminQuestion[]> {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/survey/questions',
      headers,
    });
    return res.json() as AdminQuestion[];
  }

  async function questionByKey(
    headers: Record<string, string>,
    key: string,
  ): Promise<AdminQuestion> {
    const questions = await listQuestions(headers);
    const found = questions.find((q) => q.key === key);
    if (!found) throw new Error(`Seed thiếu câu hỏi \`${key}\``);
    return found;
  }

  function createOption(headers: Record<string, string>, body: Record<string, unknown>) {
    return app.inject({
      method: 'POST',
      url: '/v1/admin/survey/options',
      headers,
      payload: { questionKey: 'categories', reason: 'test', ...body },
    });
  }

  function setStatus(headers: Record<string, string>, id: string, status: string) {
    return app.inject({
      method: 'POST',
      url: `/v1/admin/survey/options/${id}/status`,
      headers,
      payload: { status, reason: 'test' },
    });
  }

  // ── 1. Ranh giới permission ─────────────────────────────────────────────────

  describe('permission nội dung và permission dữ liệu TÁCH HẲN nhau', () => {
    it('`content:*` KHÔNG đọc được câu trả lời', async () => {
      const editor = await createUser('editor-only', CONTENT);

      for (const url of ['/v1/admin/survey/responses', '/v1/admin/survey/summary?locale=vi']) {
        const res = await app.inject({ method: 'GET', url, headers: editor.headers });
        expect(res.statusCode, url).toBe(403);
      }
    });

    it('`survey_response:read` KHÔNG sửa được nội dung', async () => {
      const analyst = await createUser('analyst', ['survey_response:read']);

      expect((await listQuestionsRaw(analyst.headers)).statusCode).toBe(403);
      expect(
        (await createOption(analyst.headers, { key: 'x', labels: { vi: 'X' } })).statusCode,
      ).toBe(403);
    });

    it('`survey_response:read` đọc được cả hai báo cáo', async () => {
      const analyst = await createUser('analyst-ok', ['survey_response:read']);

      for (const url of ['/v1/admin/survey/responses', '/v1/admin/survey/summary?locale=vi']) {
        const res = await app.inject({ method: 'GET', url, headers: analyst.headers });
        expect(res.statusCode, url).toBe(200);
      }
    });

    /** Đưa lựa chọn ra trước người dùng là hành động riêng — cùng lập luận với catalog và nav. */
    it('`content:manage` KHÔNG phát hành được lựa chọn', async () => {
      const manager = await createUser('manager', ['content:read', 'content:manage']);
      const created = await createOption(manager.headers, {
        key: 'moi_them',
        labels: { vi: 'Mới thêm' },
      });
      const id = (created.json() as { id: string }).id;

      expect((await setStatus(manager.headers, id, 'active')).statusCode).toBe(403);
    });

    it('không có phiên → 401', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/admin/survey/questions' });
      expect(res.statusCode).toBe(401);
    });
  });

  function listQuestionsRaw(headers: Record<string, string>) {
    return app.inject({ method: 'GET', url: '/v1/admin/survey/questions', headers });
  }

  // ── 2. Đường đọc quản trị ───────────────────────────────────────────────────

  describe('view quản trị thấy nhiều hơn view người dùng', () => {
    it('trả cả hai ngôn ngữ trong MỘT lần gọi', async () => {
      const admin = await createUser('reader', CONTENT);
      const question = await questionByKey(admin.headers, 'categories');

      expect(question.titles.vi).toBeTruthy();
      expect(question.titles.en).toBeTruthy();
      expect(question.titles.vi).not.toBe(question.titles.en);
    });

    it('trả cả lựa chọn `draft` mà người dùng KHÔNG thấy', async () => {
      const admin = await createUser('draft-visible', CONTENT);
      await createOption(admin.headers, { key: 'chua_hien', labels: { vi: 'Chưa hiện' } });

      const question = await questionByKey(admin.headers, 'categories');
      const draft = question.options.find((o) => o.key === 'chua_hien');
      expect(draft?.status).toBe('draft');

      // Cùng lúc đó, đường của người dùng cuối không thấy nó.
      const user = await createUser('end-user');
      const survey = (
        await app.inject({
          method: 'GET',
          url: '/v1/me/onboarding?locale=vi',
          headers: user.headers,
        })
      ).json() as { questions: { key: string; options: { key: string }[] }[] };

      const publicKeys = survey.questions[0]?.options.map((o) => o.key) ?? [];
      expect(publicKeys).not.toContain('chua_hien');
    });
  });

  // ── 3. Tạo và sửa lựa chọn ──────────────────────────────────────────────────

  describe('lựa chọn', () => {
    it('tạo mới LUÔN ở `draft`, kể cả khi có quyền publish', async () => {
      const admin = await createUser('creator', CONTENT);
      const res = await createOption(admin.headers, { key: 'moi', labels: { vi: 'Mới' } });

      expect(res.statusCode).toBe(201);
      const question = await questionByKey(admin.headers, 'categories');
      expect(question.options.find((o) => o.key === 'moi')?.status).toBe('draft');
    });

    it('trùng `key` trong cùng câu hỏi → 409', async () => {
      const admin = await createUser('dup', CONTENT);
      await createOption(admin.headers, { key: 'trung', labels: { vi: 'A' } });
      const second = await createOption(admin.headers, { key: 'trung', labels: { vi: 'B' } });

      expect(second.statusCode).toBe(409);
    });

    it('TỪ CHỐI `key` sai định dạng và icon ngoài danh mục', async () => {
      const admin = await createUser('bad-input', CONTENT);

      expect(
        (await createOption(admin.headers, { key: 'Có Dấu', labels: { vi: 'A' } })).statusCode,
      ).toBe(400);
      expect(
        (await createOption(admin.headers, { key: 'ok', labels: { vi: 'A' }, icon: 'khong-co' }))
          .statusCode,
      ).toBe(400);
    });

    it('TỪ CHỐI tạo mà không có nhãn nào', async () => {
      const admin = await createUser('no-label', CONTENT);
      expect((await createOption(admin.headers, { key: 'trong', labels: {} })).statusCode).toBe(
        400,
      );
    });

    it('thiếu `reason` → 400', async () => {
      const admin = await createUser('no-reason', CONTENT);
      const res = await app.inject({
        method: 'POST',
        url: '/v1/admin/survey/options',
        headers: admin.headers,
        payload: { questionKey: 'categories', key: 'x', labels: { vi: 'X' } },
      });
      expect(res.statusCode).toBe(400);
    });

    it('sửa nhãn và icon, KHÔNG đụng tới `key`', async () => {
      const admin = await createUser('editor', CONTENT);
      const created = await createOption(admin.headers, {
        key: 'giu_khoa',
        labels: { vi: 'Cũ' },
      });
      const id = (created.json() as { id: string }).id;

      const res = await app.inject({
        method: 'PATCH',
        url: `/v1/admin/survey/options/${id}`,
        headers: admin.headers,
        // `key` gửi lên nhưng phải bị BỎ QUA im lặng, giống PATCH của account và catalog.
        payload: { key: 'khoa-moi', labels: { vi: 'Mới', en: 'New' }, icon: 'rocket', reason: 't' },
      });
      expect(res.statusCode).toBe(204);

      const option = (await questionByKey(admin.headers, 'categories')).options.find(
        (o) => o.id === id,
      );
      expect(option?.key).toBe('giu_khoa');
      expect(option?.labels.vi).toBe('Mới');
      expect(option?.labels.en).toBe('New');
      expect(option?.icon).toBe('rocket');
    });

    /**
     * `label` là NOT NULL, nên không thể chèn một hàng chỉ có mô tả. Chỗ này dễ bị "sửa" thành
     * chèn nhãn rỗng để lách — và chuỗi rỗng đó sẽ đi thẳng ra giao diện người dùng.
     */
    it('TỪ CHỐI đặt mô tả cho ngôn ngữ chưa có nhãn', async () => {
      const admin = await createUser('desc-only', CONTENT);
      const created = await createOption(admin.headers, {
        key: 'chi_vi',
        labels: { vi: 'Chỉ VI' },
      });
      const id = (created.json() as { id: string }).id;

      const res = await app.inject({
        method: 'PATCH',
        url: `/v1/admin/survey/options/${id}`,
        headers: admin.headers,
        payload: { descriptions: { en: 'English note' }, reason: 't' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('xoá nhãn của một ngôn ngữ thì mục biến mất khỏi ngôn ngữ đó ở đường công khai', async () => {
      const admin = await createUser('drop-en', CONTENT);
      const question = await questionByKey(admin.headers, 'categories');
      const target = question.options.find((o) => o.status === 'active');
      if (!target) throw new Error('Seed phải có lựa chọn `active`');

      await app.inject({
        method: 'PATCH',
        url: `/v1/admin/survey/options/${target.id}`,
        headers: admin.headers,
        payload: { labels: { en: null }, reason: 't' },
      });

      const user = await createUser('viewer-en');
      const en = (
        await app.inject({
          method: 'GET',
          url: '/v1/me/onboarding?locale=en',
          headers: user.headers,
        })
      ).json() as { questions: { options: { key: string }[] }[] };

      expect(en.questions[0]?.options.map((o) => o.key)).not.toContain(target.key);
    });
  });

  // ── 4. `minSelect` không bao giờ vượt số lựa chọn đang hiển thị ─────────────

  describe('bảo vệ `minSelect`', () => {
    it('TỪ CHỐI `minSelect` lớn hơn số lựa chọn `active`', async () => {
      const admin = await createUser('min-too-big', CONTENT);
      const question = await questionByKey(admin.headers, 'categories');
      const activeCount = question.options.filter((o) => o.status === 'active').length;

      const res = await app.inject({
        method: 'PATCH',
        url: `/v1/admin/survey/questions/${question.id}`,
        headers: admin.headers,
        payload: { minSelect: activeCount + 1, reason: 't' },
      });
      expect(res.statusCode).toBe(400);
    });

    /**
     * Ca then chốt: mỗi thao tác gỡ đều hợp lệ khi nhìn riêng lẻ, nhưng gỡ tới ngưỡng thì
     * khảo sát thành bất khả thi. Không ai phát hiện cho tới khi người dùng thật kẹt lại.
     */
    it('TỪ CHỐI gỡ lựa chọn khi phần còn lại không đủ cho `minSelect`', async () => {
      const admin = await createUser('unpublish-guard', CONTENT);
      const question = await questionByKey(admin.headers, 'categories');
      const active = question.options.filter((o) => o.status === 'active');

      // Gỡ dần xuống đúng `minSelect` — tới đây vẫn hợp lệ.
      const removable = active.length - question.minSelect;
      for (let i = 0; i < removable; i += 1) {
        const option = active[i];
        if (!option) throw new Error('thiếu lựa chọn để gỡ');
        expect((await setStatus(admin.headers, option.id, 'inactive')).statusCode).toBe(204);
      }

      // Cái tiếp theo phá vỡ ràng buộc.
      const last = active[removable];
      if (!last) throw new Error('thiếu lựa chọn để gỡ');
      const res = await setStatus(admin.headers, last.id, 'inactive');
      expect(res.statusCode).toBe(400);
    });

    it('câu `single` chỉ nhận `minSelect` bằng 1', async () => {
      const admin = await createUser('single-min', CONTENT);
      const question = await questionByKey(admin.headers, 'primary_use');
      expect(question.kind).toBe('single');

      const res = await app.inject({
        method: 'PATCH',
        url: `/v1/admin/survey/questions/${question.id}`,
        headers: admin.headers,
        payload: { minSelect: 2, reason: 't' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── 5. Xoá và trạng thái ────────────────────────────────────────────────────

  describe('xoá lựa chọn', () => {
    it('xoá được lựa chọn chưa ai chọn', async () => {
      const admin = await createUser('delete-ok', CONTENT);
      const created = await createOption(admin.headers, { key: 'xoa_duoc', labels: { vi: 'X' } });
      const id = (created.json() as { id: string }).id;

      const res = await app.inject({
        method: 'DELETE',
        url: `/v1/admin/survey/options/${id}`,
        headers: admin.headers,
        payload: { reason: 't' },
      });
      expect(res.statusCode).toBe(204);
    });

    /**
     * `ON DELETE RESTRICT` ở `survey_answers` là chốt chặn thật. API phải dịch nó thành 409
     * kèm lời khuyên dùng `inactive` — trả 500 ở đây nghĩa là người vận hành thấy "hệ thống
     * lỗi" thay vì "không được phép, hãy làm cách khác".
     */
    it('lựa chọn ĐÃ CÓ NGƯỜI TRẢ LỜI → 409, không phải 500', async () => {
      const admin = await createUser('delete-blocked', CONTENT);

      // Một người dùng thật trả lời khảo sát — đi qua đúng đường ghi của sản phẩm.
      const user = await createUser('respondent');
      const survey = (
        await app.inject({
          method: 'GET',
          url: '/v1/me/onboarding?locale=vi',
          headers: user.headers,
        })
      ).json() as {
        questions: { key: string; minSelect: number; options: { key: string }[] }[];
      };

      const answers = survey.questions.map((q) => ({
        questionKey: q.key,
        optionKeys: q.options.slice(0, q.minSelect).map((o) => o.key),
      }));
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/v1/me/onboarding',
            headers: user.headers,
            payload: { status: 'completed', locale: 'vi', answers },
          })
        ).statusCode,
      ).toBe(204);

      const chosenKey = survey.questions[0]?.options[0]?.key;
      const question = await questionByKey(admin.headers, 'categories');
      const chosen = question.options.find((o) => o.key === chosenKey);
      if (!chosen) throw new Error('không tìm thấy lựa chọn vừa được chọn');

      const res = await app.inject({
        method: 'DELETE',
        url: `/v1/admin/survey/options/${chosen.id}`,
        headers: admin.headers,
        payload: { reason: 't' },
      });
      expect(res.statusCode).toBe(409);
    });

    it('quay lại `draft` KHÔNG phải chuyển tiếp hợp lệ', async () => {
      const admin = await createUser('no-back-to-draft', CONTENT);
      const question = await questionByKey(admin.headers, 'categories');
      const active = question.options.find((o) => o.status === 'active');
      if (!active) throw new Error('Seed phải có lựa chọn `active`');

      expect((await setStatus(admin.headers, active.id, 'draft')).statusCode).toBe(400);
    });
  });

  // ── 6. Sắp xếp lại ──────────────────────────────────────────────────────────

  describe('sắp xếp lại', () => {
    /**
     * Ca này chứng minh `survey_options_question_sort_key` thật sự là
     * `DEFERRABLE INITIALLY DEFERRED`: đảo hai mục làm hai hàng tạm thời trùng `sort_order`
     * giữa transaction. Với unique thường, câu UPDATE thứ hai đã fail dù trạng thái cuối hợp lệ.
     */
    it('đảo hai lựa chọn liền kề chạy được (unique DEFERRABLE)', async () => {
      const admin = await createUser('reorder', CONTENT);
      const before = await questionByKey(admin.headers, 'categories');
      const ids = before.options.map((o) => o.id);
      const swapped = [...ids];
      const [a, b] = [swapped[0], swapped[1]];
      if (!a || !b) throw new Error('Seed phải có ít nhất hai lựa chọn');
      swapped[0] = b;
      swapped[1] = a;

      const res = await app.inject({
        method: 'POST',
        url: '/v1/admin/survey/options/reorder',
        headers: admin.headers,
        payload: { questionKey: 'categories', optionIds: swapped, reason: 't' },
      });
      expect(res.statusCode).toBe(204);

      const after = await questionByKey(admin.headers, 'categories');
      expect(after.options.map((o) => o.id)).toEqual(swapped);
    });

    it('TỪ CHỐI danh sách thiếu mục', async () => {
      const admin = await createUser('reorder-partial', CONTENT);
      const question = await questionByKey(admin.headers, 'categories');

      const res = await app.inject({
        method: 'POST',
        url: '/v1/admin/survey/options/reorder',
        headers: admin.headers,
        payload: {
          questionKey: 'categories',
          optionIds: question.options.slice(0, 2).map((o) => o.id),
          reason: 't',
        },
      });
      expect(res.statusCode).toBe(400);
    });

    /** `/reorder` phải khớp trước `:optionId`, nếu không nó bị nuốt thành một id hỏng. */
    it('`/reorder` không bị route `:optionId` nuốt mất', async () => {
      const admin = await createUser('reorder-route', CONTENT);
      const res = await app.inject({
        method: 'POST',
        url: '/v1/admin/survey/options/reorder',
        headers: admin.headers,
        payload: { questionKey: 'categories', optionIds: ['khong-phai-uuid'], reason: 't' },
      });
      // 400 vì id không thuộc câu hỏi — KHÔNG phải 404 của route không tồn tại.
      expect(res.statusCode).toBe(400);
    });
  });

  // ── 7. Báo cáo ──────────────────────────────────────────────────────────────

  describe('tổng hợp và danh sách', () => {
    async function answerAs(subject: string) {
      const user = await createUser(subject);
      const survey = (
        await app.inject({
          method: 'GET',
          url: '/v1/me/onboarding?locale=vi',
          headers: user.headers,
        })
      ).json() as {
        questions: { key: string; minSelect: number; options: { key: string }[] }[];
      };

      await app.inject({
        method: 'POST',
        url: '/v1/me/onboarding',
        headers: user.headers,
        payload: {
          status: 'completed',
          locale: 'vi',
          answers: survey.questions.map((q) => ({
            questionKey: q.key,
            optionKeys: q.options.slice(0, q.minSelect).map((o) => o.key),
          })),
        },
      });

      return { user, survey };
    }

    /**
     * `respondentCount` là số NGƯỜI, không phải số lượt chọn. Ở câu `multi` một người tick
     * nhiều ô, nên hai con số này khác nhau — và nếu lẫn lộn thì mọi phần trăm trong báo cáo
     * đều sai mà vẫn trông hợp lý.
     */
    it('đếm người khác đếm lượt chọn ở câu `multi`', async () => {
      const { survey } = await answerAs('counter-1');
      const analyst = await createUser('summary-reader', ['survey_response:read']);

      const summary = (
        await app.inject({
          method: 'GET',
          url: '/v1/admin/survey/summary?locale=vi',
          headers: analyst.headers,
        })
      ).json() as {
        totalResponses: number;
        completedCount: number;
        skippedCount: number;
        questions: { key: string; respondentCount: number; options: { count: number }[] }[];
      };

      const categories = summary.questions.find((q) => q.key === 'categories');
      const minSelect = survey.questions.find((q) => q.key === 'categories')?.minSelect ?? 0;
      expect(minSelect).toBeGreaterThan(1);

      expect(categories?.respondentCount).toBe(1);
      const totalPicks = (categories?.options ?? []).reduce((sum, o) => sum + o.count, 0);
      expect(totalPicks).toBe(minSelect);

      expect(summary.completedCount).toBe(1);
      expect(summary.totalResponses).toBe(1);
    });

    it('bỏ qua vào `skippedCount`, KHÔNG vào `completedCount`', async () => {
      const user = await createUser('skipper');
      await app.inject({
        method: 'POST',
        url: '/v1/me/onboarding',
        headers: user.headers,
        payload: { status: 'skipped', locale: 'vi' },
      });

      const analyst = await createUser('skip-reader', ['survey_response:read']);
      const summary = (
        await app.inject({
          method: 'GET',
          url: '/v1/admin/survey/summary?locale=vi',
          headers: analyst.headers,
        })
      ).json() as { totalResponses: number; completedCount: number; skippedCount: number };

      expect(summary.skippedCount).toBe(1);
      expect(summary.completedCount).toBe(0);
      expect(summary.totalResponses).toBe(1);
    });

    /** Số đếm lịch sử KHÔNG được biến mất chỉ vì lựa chọn đã bị gỡ khỏi khảo sát. */
    it('lựa chọn đã gỡ vẫn giữ số đếm, kèm trạng thái để giải thích', async () => {
      const { survey } = await answerAs('historic');
      const admin = await createUser('unpublisher', CONTENT);
      const chosenKey = survey.questions[0]?.options[0]?.key;

      const question = await questionByKey(admin.headers, 'categories');
      const chosen = question.options.find((o) => o.key === chosenKey);
      if (!chosen) throw new Error('không tìm thấy lựa chọn vừa được chọn');

      // Hạ `minSelect` xuống 1 trước, nếu không guard sẽ chặn đúng như thiết kế.
      await app.inject({
        method: 'PATCH',
        url: `/v1/admin/survey/questions/${question.id}`,
        headers: admin.headers,
        payload: { minSelect: 1, reason: 't' },
      });
      expect((await setStatus(admin.headers, chosen.id, 'inactive')).statusCode).toBe(204);

      const analyst = await createUser('history-reader', ['survey_response:read']);
      const summary = (
        await app.inject({
          method: 'GET',
          url: '/v1/admin/survey/summary?locale=vi',
          headers: analyst.headers,
        })
      ).json() as {
        questions: { key: string; options: { key: string; status: string; count: number }[] }[];
      };

      const row = summary.questions
        .find((q) => q.key === 'categories')
        ?.options.find((o) => o.key === chosenKey);

      expect(row?.count).toBe(1);
      expect(row?.status).toBe('inactive');
    });

    it('danh sách chi tiết trả `accountId` và khoá lựa chọn', async () => {
      const { user } = await answerAs('detail');
      const analyst = await createUser('detail-reader', ['survey_response:read']);

      const page = (
        await app.inject({
          method: 'GET',
          url: '/v1/admin/survey/responses',
          headers: analyst.headers,
        })
      ).json() as {
        items: {
          accountId: string;
          status: string;
          answers: { questionKey: string; optionKeys: string[] }[];
        }[];
        nextCursor: string | null;
      };

      expect(page.items).toHaveLength(1);
      expect(page.items[0]?.accountId).toBe(user.accountId);
      expect(page.items[0]?.status).toBe('completed');
      expect(page.items[0]?.answers.length).toBe(3);
      expect(page.nextCursor).toBeNull();
    });

    it('phân trang: `limit` nhỏ trả cursor, trang sau nối tiếp không trùng', async () => {
      await answerAs('page-1');
      await answerAs('page-2');
      await answerAs('page-3');

      const analyst = await createUser('pager', ['survey_response:read']);
      const first = (
        await app.inject({
          method: 'GET',
          url: '/v1/admin/survey/responses?limit=2',
          headers: analyst.headers,
        })
      ).json() as { items: { id: string }[]; nextCursor: string | null };

      expect(first.items).toHaveLength(2);
      expect(first.nextCursor).not.toBeNull();

      const second = (
        await app.inject({
          method: 'GET',
          url: `/v1/admin/survey/responses?limit=2&cursor=${encodeURIComponent(first.nextCursor ?? '')}`,
          headers: analyst.headers,
        })
      ).json() as { items: { id: string }[]; nextCursor: string | null };

      expect(second.items).toHaveLength(1);
      const ids = new Set([...first.items, ...second.items].map((i) => i.id));
      expect(ids.size).toBe(3);
    });

    it('`locale` ngoài danh mục → 400', async () => {
      const analyst = await createUser('bad-locale', ['survey_response:read']);
      const res = await app.inject({
        method: 'GET',
        url: '/v1/admin/survey/summary?locale=fr',
        headers: analyst.headers,
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── 8. Audit ────────────────────────────────────────────────────────────────

  it('mọi thay đổi để lại dấu vết kèm lý do', async () => {
    const admin = await createUser('auditor', CONTENT);
    await createOption(admin.headers, {
      key: 'co_dau_vet',
      labels: { vi: 'Có dấu vết' },
      reason: 'thêm lựa chọn theo yêu cầu marketing',
    });

    const rows = await client.sql<{ action: string; reason: string }[]>`
      SELECT action, reason FROM control_plane.audit_events
      WHERE target_type = 'survey_option'
    `;

    expect(rows[0]?.action).toBe('survey_option.created');
    expect(rows[0]?.reason).toBe('thêm lựa chọn theo yêu cầu marketing');
  });

  /**
   * QUYỀN CỦA ROLE RUNTIME — nhóm này tồn tại vì một bug thật ở migration 0010.
   *
   * Chỉ kiểm GRANT tường minh: ở container test migration chạy bằng superuser nên
   * `ALTER DEFAULT PRIVILEGES` không áp dụng, và SELECT/INSERT luôn `false` bất kể migration
   * viết gì. Xem `docs/coding-conventions.md` mục 6.
   */
  it('role runtime có DELETE trên bảng lựa chọn (nút xoá cần nó)', async () => {
    const rows = await client.sql<{ ok: boolean }[]>`
      SELECT has_table_privilege('talosmine_runtime', 'control_plane.survey_options', 'DELETE') AS ok
    `;
    expect(rows[0]?.ok).toBe(true);
  });
});
