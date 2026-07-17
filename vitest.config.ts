import { defineConfig } from 'vitest/config';

/**
 * Wiring project cho Vitest (DEC-T05: vitest 4.1.10; DEC-T15: `pnpm test`, `pnpm test:concurrency`).
 *
 * LỆCH KHỎI PLAN — CẦN RECORD, chưa tự coi là đã duyệt:
 * phase-1 mục 7 và P1.11 ghi sản phẩm là `vitest.workspace.ts`. File đó KHÔNG dùng được với
 * Vitest 4: workspace file bị gỡ và `test.workspace` bị ném lỗi tường minh
 * ("The `test.workspace` option was removed in Vitest 4. Please, migrate to `test.projects`").
 * Kiểm chứng thật: với `vitest.workspace.ts` ở root, `pnpm test:concurrency` báo
 * "No projects matched the filter \"concurrency\"" — file bị bỏ qua HOÀN TOÀN, không cảnh báo.
 * Đây là kiểu hỏng im lặng: `pnpm test` vẫn chạy (vitest rơi về default include) nên nhìn qua
 * tưởng đã wiring xong, trong khi project không tồn tại.
 * `vitest.config.ts` + `test.projects` là cơ chế thay thế 1-1 của Vitest 4, không đổi tên lệnh
 * nào ở DEC-T15. Sửa tên file trong plan là việc của orchestrator/architect.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        // `pnpm test` (DEC-T15) = "Vitest unit + integration" nên project này phải nằm trong
        // lần chạy mặc định. Nó dựng PostgreSQL thật qua testcontainers — DEC-T05 cấm mock
        // cho phần DB.
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          // Container nặng: chạy tuần tự để không dựng nhiều cluster cùng lúc.
          fileParallelism: false,
          testTimeout: 120_000,
          hookTimeout: 240_000,
        },
      },
      {
        // `pnpm test:concurrency` = `vitest run --project concurrency` (DEC-T15).
        test: {
          name: 'concurrency',
          include: ['tests/concurrency/**/*.test.ts'],
          environment: 'node',
          // DEC-T05: pool `threads` cho concurrency test.
          pool: 'threads',
          fileParallelism: false,
          testTimeout: 120_000,
          hookTimeout: 240_000,
        },
      },
    ],
  },
});
