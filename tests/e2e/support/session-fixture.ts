import './env';
import type { BrowserContext } from '@playwright/test';

// NHẬP TỪ `dist/`, KHÔNG PHẢI `src/` — khác với `tests/unit`/`tests/integration` (chạy qua
// Vite/vitest, tự bỏ qua đuôi `.js` khi resolve sang `.ts`), bộ nạp TypeScript của Playwright
// đòi đúng file `.js` tồn tại thật, đúng convention NodeNext mà `apps/control-plane` dùng.
// Các file `.ts` gốc không tồn tại dưới `dist` nên import thẳng chúng sẽ vỡ ngay ở
// `Cannot find module`. Build một lần (`pnpm --filter @talosmine/control-plane run build`)
// trước khi chạy nhóm e2e này — cùng tinh thần với `webServer` của web app vốn đã đòi
// `next build` trước `next start`.
//
// `apps/control-plane` build với `declaration: false` (chấp nhận được cho một app đầu cuối,
// không phải thư viện) nên `dist/` không có `.d.ts` — import thẳng chỉ ra kiểu `any`
// (TS7016). `@ts-expect-error` nén đúng lỗi đó (không phải tắt kiểm kiểu nói chung), rồi ép
// kiểu lại bằng chữ ký thật đọc từ `src/` (`import type * as …Types`) ngay bên dưới — dist là
// bản build TRỰC TIẾP của src nên chữ ký khớp tuyệt đối. Nhờ vậy lời gọi ở dưới vẫn được
// kiểm tra kiểu đầy đủ, không rơi về `any` chỉ vì thiếu `.d.ts` ở bản build.
// @ts-expect-error - dist không có .d.ts (declaration:false); kiểu thật lấy từ src bên dưới.
import { provisionByExternalIdentity as provisionByExternalIdentityImpl } from '../../../apps/control-plane/dist/modules/identity/account-provisioning.js';
// @ts-expect-error - dist không có .d.ts (declaration:false); kiểu thật lấy từ src bên dưới.
import { createWebSession as createWebSessionImpl } from '../../../apps/control-plane/dist/modules/identity/web-session.js';
// @ts-expect-error - dist không có .d.ts (declaration:false); kiểu thật lấy từ src bên dưới.
import { createDatabaseClient as createDatabaseClientImpl } from '../../../apps/control-plane/dist/shared/database.js';
// Loại type-only, KHÔNG dist: `import type` bị xoá HOÀN TOÀN trước khi chạy nên không có
// runtime require nào chạm tới đường dẫn `src` không tồn tại trong `dist`.
import type * as AccountProvisioningTypes from '../../../apps/control-plane/src/modules/identity/account-provisioning';
import type * as WebSessionTypes from '../../../apps/control-plane/src/modules/identity/web-session';
import type * as DatabaseTypes from '../../../apps/control-plane/src/shared/database';
import type { DatabaseClient } from '../../../apps/control-plane/src/shared/database';
import { CSRF_COOKIE, SESSION_COOKIE } from '../../../apps/web/server/oidc';

const provisionByExternalIdentity =
  provisionByExternalIdentityImpl as typeof AccountProvisioningTypes.provisionByExternalIdentity;
const createWebSession = createWebSessionImpl as typeof WebSessionTypes.createWebSession;
const createDatabaseClient = createDatabaseClientImpl as typeof DatabaseTypes.createDatabaseClient;

/**
 * Fixture phiên đăng nhập cho e2e — B2 của pending-work.md.
 *
 * VẤN ĐỀ ĐANG GIẢI: mọi màn hình sau đăng nhập (`/account`, `/admin`, `/admin/audit`…) đều
 * ngoài tầm phủ e2e vì không có cách dựng một phiên hợp lệ trong Playwright — và KHÔNG THỂ
 * đi qua luồng OIDC thật (Google/Logto chặn automation, đã ghi ở pending-work A9).
 *
 * ĐƯỜNG VÒNG QUA ĐÚNG CHỖ: `apps/web/app/auth/callback/route.ts` chỉ làm MỘT việc sau khi
 * OIDC xong — đổi `id_token` lấy phiên của TA qua `POST /v1/auth/sessions`. Việc phiên tồn
 * tại trong `web_sessions` với cookie hợp lệ mới là thứ mọi trang sau đăng nhập thật sự kiểm
 * tra (`WebSessionGuard`, `decideAdminAccess`) — KHÔNG kiểm "bạn có vừa đi qua Google không".
 * Nên fixture này ghi thẳng vào `web_sessions` bằng đúng hàm Control Plane dùng
 * (`createWebSession`), bỏ qua OIDC hoàn toàn — không phải giả một phiên, mà là tạo một
 * phiên THẬT bằng con đường thật, chỉ bỏ qua bước "gõ mật khẩu trên trang của Google".
 *
 * NỐI DATABASE TRỰC TIẾP, không qua HTTP `/v1/auth/sessions`: endpoint đó đòi một id_token
 * đã ký bởi Logto thật — dựng được (xem `tests/unit/oidc-verifier.test.ts`) nhưng Control
 * Plane e2e đang trỏ `OIDC_ISSUER_URL` vào Logto THẬT, không phải một JWKS server ta tự
 * dựng. Ghi thẳng DB là cách duy nhất tạo phiên hợp lệ mà không cần một IdP hợp tác.
 *
 * YÊU CẦU MÔI TRƯỜNG: `DATABASE_URL` phải trỏ ĐÚNG database mà Control Plane (chạy dưới
 * `webServer` của `playwright.config.ts`) đang dùng — nếu không, phiên ghi ở đây và phiên
 * Control Plane đọc là hai thế giới khác nhau và mọi trang sẽ báo 401.
 */

let client: DatabaseClient | undefined;

/** Một kết nối DB dùng chung cho cả file test — không mở lại mỗi lần gọi fixture. */
function db(): DatabaseClient {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'Thiếu DATABASE_URL cho e2e fixture. Cần trỏ ĐÚNG database mà Control Plane e2e ' +
        'đang dùng — xem tests/e2e/support/env.ts và playwright.config.ts.',
    );
  }
  // Không dùng `client ??= …; return client;`: TS không giữ được narrowing qua `??=` cho một
  // biến khai ở module scope đọc lại trong cùng hàm — `client` vẫn suy ra kiểu
  // `DatabaseClient | undefined` ở dòng `return`. Gán qua biến cục bộ tránh vấn đề đó.
  const instance = client ?? createDatabaseClient(url);
  client = instance;
  return instance;
}

/** Đóng kết nối — gọi ở `globalTeardown` để tiến trình Playwright thoát sạch. */
export async function closeSessionFixtureDb(): Promise<void> {
  await client?.sql.end();
  client = undefined;
}

export interface LoggedInSession {
  accountId: string;
  sessionToken: string;
  csrfToken: string;
}

/**
 * Tạo một account "đã đăng nhập" — KHÔNG có quyền quản trị nào.
 *
 * `subject` PHẢI DUY NHẤT giữa các test chạy song song (Playwright mặc định
 * `fullyParallel: true`): dùng `crypto.randomUUID()` ở nơi gọi, không dùng chuỗi cố định.
 */
export async function createLoggedInSession(subject: string): Promise<LoggedInSession> {
  const { accountId } = await provisionByExternalIdentity(db().db, {
    issuer: 'https://e2e-fixture.invalid/oidc',
    subject,
  });

  const session = await createWebSession(db().db, accountId, { ttlSeconds: 3600 });
  return { accountId, sessionToken: session.sessionToken, csrfToken: session.csrfToken };
}

/**
 * Tạo account đã đăng nhập KÈM một vai trò quản trị mang đúng permission yêu cầu.
 *
 * Vai trò được đặt tên duy nhất theo `subject` — chạy song song nhiều test admin không đụng
 * hàng của nhau, và không cần dọn dẹp giữa các lần chạy (test khác nhau, vai trò khác nhau).
 */
export async function createAdminSession(
  subject: string,
  permissions: readonly string[],
): Promise<LoggedInSession> {
  const session = await createLoggedInSession(subject);
  const { sql } = db();

  const roleId = crypto.randomUUID();
  await sql`
    INSERT INTO control_plane.admin_roles (id, key, display_name, status)
    VALUES (${roleId}, ${`e2e-${subject}`}, ${`E2E — ${subject}`}, 'active')
  `;
  for (const permission of permissions) {
    await sql`
      INSERT INTO control_plane.admin_role_permissions (id, admin_role_id, permission)
      VALUES (${crypto.randomUUID()}, ${roleId}, ${permission})
    `;
  }
  await sql`
    INSERT INTO control_plane.admin_role_assignments
      (id, admin_role_id, account_id, valid_from, reason, assigned_by_account_id)
    VALUES (${crypto.randomUUID()}, ${roleId}, ${session.accountId}, now(), 'e2e fixture', ${session.accountId})
  `;

  return session;
}

/**
 * Ghi thẳng một lần "bỏ qua khảo sát" cho account — dùng cho B2 mở rộng (2026-07-30):
 * `/account/survey`. Raw SQL thay vì nhập schema từ `dist/`: chỉ hai bảng, không cần thêm
 * một vòng `@ts-expect-error`/`import type` nữa cho một lần ghi đơn giản.
 */
export async function createSkippedSurveyResponse(accountId: string): Promise<void> {
  const { sql } = db();
  await sql`
    INSERT INTO control_plane.survey_responses (id, account_id, status, locale)
    VALUES (${crypto.randomUUID()}, ${accountId}, 'skipped', 'vi')
  `;
}

/**
 * Ghi thẳng một lần "đã hoàn tất khảo sát" cho account, chọn `minSelect` lựa chọn đầu tiên
 * (theo `sort_order`) của MỖI câu hỏi `active` — không viết cứng khoá câu hỏi/lựa chọn nào,
 * cùng tinh thần `validAnswers()` ở `tests/integration/survey-api.test.ts` (dựng từ seed
 * thật, không đoán nội dung).
 */
export async function createCompletedSurveyResponse(accountId: string): Promise<void> {
  const { sql } = db();
  const responseId = crypto.randomUUID();
  await sql`
    INSERT INTO control_plane.survey_responses (id, account_id, status, locale)
    VALUES (${responseId}, ${accountId}, 'completed', 'vi')
  `;

  const questions = await sql<{ id: string; minSelect: number }[]>`
    SELECT id, min_select AS "minSelect"
    FROM control_plane.survey_questions
    WHERE status = 'active'
    ORDER BY sort_order
  `;

  for (const question of questions) {
    const options = await sql<{ id: string }[]>`
      SELECT id FROM control_plane.survey_options
      WHERE question_id = ${question.id} AND status = 'active'
      ORDER BY sort_order
      LIMIT ${question.minSelect}
    `;
    for (const option of options) {
      await sql`
        INSERT INTO control_plane.survey_answers (id, response_id, question_id, option_id)
        VALUES (${crypto.randomUUID()}, ${responseId}, ${question.id}, ${option.id})
      `;
    }
  }
}

/**
 * Đặt MỘT cookie qua một response HTTP THẬT (bị chặn và tự trả lời bởi `context.route`),
 * không qua `context.addCookies`.
 *
 * VÌ SAO KHÔNG DÙNG `context.addCookies`: đó là đường đi qua CDP `Storage.setCookies`, và
 * đây là bug đã biết của Playwright/Chromium — cookie tên bắt đầu bằng `__Host-`/`__Secure-`
 * bị từ chối thẳng ở tầng CDP với thông điệp chung chung "Protocol error (Storage.setCookies):
 * Invalid cookie fields" (microsoft/playwright#11372, #27473), dù mọi field (path, secure,
 * sameSite…) đều đúng — đã xác nhận bằng debug log trước khi tìm ra đây là giới hạn của
 * chính Playwright chứ không phải sai sót ở phía ta. Route thẳng qua `url` (bỏ `path`) chỉ
 * đổi từ lỗi này sang lỗi khác, không giải quyết được gốc rễ.
 *
 * ĐƯỜNG VÒNG: `route.fulfill` tạo một response THẬT ở tầng network mà Chromium xử lý y hệt
 * một response từ server — kể cả việc đọc và áp dụng header `Set-Cookie`, đúng đường mà
 * `setSessionCookies` (apps/web/server/session.ts) dùng khi đăng nhập thật. Vì đây là cùng
 * một cơ chế trình duyệt xử lý, các ràng buộc của tiền tố `__Host-` (Secure, Path=`/`, không
 * Domain) được kiểm và chấp nhận đúng như luồng thật — không phải một cơ chế giả lập riêng.
 *
 * URL đích không cần tồn tại thật trên server: `route.fulfill` chặn request TRƯỚC khi nó rời
 * tiến trình trình duyệt, nên server (Control Plane/Next) không bao giờ thấy request này.
 */
async function setRealCookie(
  context: BrowserContext,
  baseURL: string,
  cookieHeaderValue: string,
): Promise<void> {
  const url = `${baseURL}/__e2e_cookie_bootstrap__/${crypto.randomUUID()}`;
  await context.route(url, async (route) => {
    // `status: 204` khiến Chromium huỷ điều hướng NGAY (không có tài liệu nào để "load"),
    // nên `page.goto` báo `net::ERR_ABORTED` trước khi ta kịp biết cookie đã áp dụng hay
    // chưa — dùng `200` + một tài liệu HTML rỗng để điều hướng thật sự hoàn tất.
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><title>e2e cookie bootstrap</title>',
      headers: { 'set-cookie': cookieHeaderValue },
    });
  });

  const page = await context.newPage();
  await page.goto(url);
  await page.close();
  await context.unroute(url);
}

/**
 * Gắn cookie phiên vào context TRƯỚC khi mở trang bất kỳ.
 *
 * Phải KHỚP TUYỆT ĐỐI cách `setSessionCookies` (apps/web/server/session.ts) đặt cookie thật:
 * `Secure` dù chạy `http://127.0.0.1` — trình duyệt coi loopback là ngữ cảnh bảo mật nên cờ
 * `secure` vẫn nhận, đúng comment gốc ở `session.ts`. Sai một thuộc tính (path, sameSite…) là
 * cookie `__Host-` bị trình duyệt lặng lẽ từ chối, và trang xử sự y hệt "chưa đăng nhập" —
 * không có lỗi nào để thấy, chỉ có 401/404 khó hiểu.
 *
 * Hai lần gọi `setRealCookie` riêng (không gộp hai `Set-Cookie` vào một response): mỗi
 * response chỉ khai được MỘT giá trị header qua field `headers` dạng object của Playwright —
 * gộp hai dòng `Set-Cookie` vào một chuỗi (nối bằng `\n`) là hành vi không được đặc tả, dễ vỡ
 * âm thầm hơn là hai round-trip tường minh.
 */
export async function attachSession(
  context: BrowserContext,
  session: LoggedInSession,
  baseURL: string,
): Promise<void> {
  await setRealCookie(
    context,
    baseURL,
    `${SESSION_COOKIE}=${session.sessionToken}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=3600`,
  );
  await setRealCookie(
    context,
    baseURL,
    `${CSRF_COOKIE}=${session.csrfToken}; Path=/; Secure; SameSite=Lax; Max-Age=3600`,
  );
}
