import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright — E2E/smoke cho apps/web (DEC-T05, phase-1 mục 14).
 *
 * Phạm vi P1 cố ý hẹp: shell chưa có business feature nào, nên test ở đây chỉ chứng minh
 * ba thứ mà exit gate P1 yêu cầu:
 *   1. `(user)` render được;
 *   2. `/admin` bị deny NGAY TẠI SERVER (không phải redirect phía client);
 *   3. shell dùng được ở ba viewport và bằng bàn phím.
 *
 * `webServer[1]` (web): Playwright tự build + start Next rồi tự tắt. Dùng `next start`
 * (production build) chứ không phải `next dev`, vì CSP ở dev có nới thêm
 * `'unsafe-eval'`/`'unsafe-inline'` cho React Refresh — test trên dev sẽ đo nhầm một CSP
 * không tồn tại ở production.
 *
 * `webServer[0]` (control-plane) — THÊM 2026-07-30, cho B2 của pending-work.md: các trang
 * cần đăng nhập (`/account`, `/admin/*`) gọi qua BFF tới Control Plane thật, nên nó phải
 * sống trong lúc chạy e2e. Chạy bằng `dev:api` (tsx watch), KHÔNG build production: khác
 * với web, CSP không liên quan tới Control Plane — nó chỉ trả JSON, không có gì để "đo
 * nhầm dev/production" như HTML của Next.
 *
 * YÊU CẦU HẠ TẦNG (giống hệt tiền đề của `scripts/dev.ps1`, không phải cơ chế riêng):
 * Docker (`talosmine-db`, `talosmine-pooler`) đã bật, và `.env.dev` + `apps/web/.env.local`
 * đã có `OIDC_*`/`CONTROL_PLANE_BASE_URL`. `reuseExistingServer` (bật khi không phải CI) có
 * nghĩa nếu Control Plane đã chạy sẵn (ví dụ qua `scripts/dev.ps1`), Playwright dùng lại
 * chính tiến trình đó thay vì mở thêm một bản trên cùng cổng.
 */
const PORT = 3123;
/**
 * Export tường minh cho `tests/e2e/support/session-fixture.ts`: cookie `__Host-*` cần một
 * URL/origin CHÍNH XÁC để gắn vào context TRƯỚC khi mở trang, và fixture `{ baseURL }` của
 * Playwright build một `BrowserContext` MỚI (`browser.newContext()`) không phải lúc nào
 * cũng mang theo giá trị này một cách đáng tin cậy — đo được thật (2026-07-30): rỗng dẫn
 * tới lỗi `Cookie should have either url or path`. Hằng số ở đây là nguồn sự thật duy nhất.
 */
export const BASE_URL = `http://127.0.0.1:${PORT}`;

/** Khớp `API_PORT` trong `.env.dev` (mặc định schema là 3001, nhưng dev đặt 3100). */
const CONTROL_PLANE_PORT = 3100;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // `exactOptionalPropertyTypes`: gán tường minh `undefined` khác với KHÔNG khai thuộc tính
  // — phải loại hẳn `workers` khỏi object khi không phải CI, không gán `undefined` vào nó.
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },

  projects: [
    // Ba viewport: phase-1 mục 10 yêu cầu MỘT codebase chạy được ở desktop,
    // máy tính bảng và điện thoại. Test chạy trên cả ba để "responsive" là điều
    // đo được, không phải lời hứa.
    //
    // Cả ba đều chạy trên CHROMIUM, chỉ khác `viewport`. Ở P1 ta kiểm KÍCH THƯỚC
    // MÀN HÌNH (responsive layout), không kiểm khác biệt engine — nên một engine là đủ
    // và tránh phải cài WebKit/Firefox. Kiểm đa engine (iPad=WebKit, Pixel=Chromium thật)
    // để dành một lượt riêng khi cần.
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'tablet',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } },
    },
    {
      name: 'mobile',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } },
    },
  ],

  webServer: [
    {
      command: 'pnpm --filter @talosmine/control-plane run dev:api',
      url: `http://127.0.0.1:${CONTROL_PLANE_PORT}/health/ready`,
      reuseExistingServer: !process.env.CI,
      // `/health/ready` chỉ xanh sau khi nối được database — timeout phải chừa chỗ cho cả
      // việc Docker/Postgres đã sẵn sàng, không chỉ cho tiến trình Node khởi động.
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @talosmine/web run build && pnpm --filter @talosmine/web run start',
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        PORT: String(PORT),
        NODE_ENV: 'production',
      },
    },
  ],
});
