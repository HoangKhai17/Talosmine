#!/usr/bin/env node
/**
 * Đặt lại mật khẩu của một người dùng Logto — công cụ VẬN HÀNH, chạy tay trên máy chủ.
 *
 * VÌ SAO CẦN NÓ: mật khẩu trong Logto băm bằng Argon2i, không có đường đọc ngược. Khi chủ
 * tài khoản quên mật khẩu mà tài khoản lại KHÔNG gắn email/số điện thoại thì luồng "quên
 * mật khẩu" tự phục vụ không dùng được — không có nơi nào để gửi mã. Đường còn lại là một
 * người có quyền vận hành đặt lại hộ.
 *
 * VÌ SAO KHÔNG BẤM TAY TRONG ADMIN CONSOLE: vẫn bấm được, nhưng Admin Console (`:3002`)
 * đòi mật khẩu của tài khoản `admin` thuộc tenant `admin` — một tài khoản khác hoàn toàn,
 * và cũng có thể đã quên. Script này đi bằng Management API ở `:3001` với thông tin của
 * ứng dụng M2M đã có trong `.env`, nên không phụ thuộc vào việc nhớ mật khẩu đó.
 *
 * MẬT KHẨU ĐI QUA BIẾN MÔI TRƯỜNG, KHÔNG QUA THAM SỐ DÒNG LỆNH. Tham số dòng lệnh nằm lại
 * trong lịch sử shell và hiện ra trong danh sách tiến trình của mọi người dùng trên máy.
 *
 * Cách chạy (PowerShell):
 *   $env:NEW_PASSWORD = 'mat-khau-moi'
 *   node infra/scripts/reset-user-password.mjs --username nguyenhoangkhai
 *   Remove-Item Env:\NEW_PASSWORD
 *
 * Cũng nhận `--user-id <id>` nếu đã biết id trong Logto.
 */

import { api, getAccessToken, loadEnv } from './logto-api.mjs';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i + 1];
    if (argv[i] === '--username' && value) args.username = value;
    if (argv[i] === '--user-id' && value) args.userId = value;
  }
  return args;
}

function usage() {
  console.error(
    [
      'Đặt lại mật khẩu của một người dùng Logto.',
      '',
      'Cách dùng:',
      '  $env:NEW_PASSWORD = "..."; node infra/scripts/reset-user-password.mjs --username <tên>',
      '  $env:NEW_PASSWORD = "..."; node infra/scripts/reset-user-password.mjs --user-id <id>',
      '',
      'Mật khẩu lấy từ biến môi trường NEW_PASSWORD, không truyền qua tham số.',
    ].join('\n'),
  );
  process.exit(1);
}

/**
 * Tìm user theo username.
 *
 * `/api/users?search=` khớp MỜ trên nhiều trường, nên kết quả trả về có thể gồm cả những
 * người chỉ trùng một phần. Vì thao tác này đổi mật khẩu của người khác, ta lọc lại bằng
 * so sánh CHÍNH XÁC và từ chối nếu không còn đúng một kết quả — đặt nhầm mật khẩu cho
 * người khác là sự cố, không phải bất tiện.
 */
async function resolveUserId(env, token, username) {
  const found = await api(
    env,
    token,
    `/api/users?search=${encodeURIComponent(username)}&page_size=50`,
  );

  const exact = found.filter((user) => user.username === username);

  if (exact.length === 0) {
    throw new Error(`Không tìm thấy người dùng có username chính xác là "${username}".`);
  }
  if (exact.length > 1) {
    throw new Error(
      `Có ${exact.length} người dùng trùng username "${username}". Dùng --user-id để chỉ đích danh.`,
    );
  }

  return exact[0].id;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.username && !args.userId) usage();

  const password = process.env.NEW_PASSWORD;
  if (!password) {
    console.error('Thiếu biến môi trường NEW_PASSWORD.');
    usage();
  }

  const env = await loadEnv();
  const token = await getAccessToken(env);

  const userId = args.userId ?? (await resolveUserId(env, token, args.username));

  // Logto tự kiểm chính sách mật khẩu ở đây (độ dài, độ phức tạp, danh sách mật khẩu rò rỉ)
  // và trả 422 kèm lý do nếu không đạt — ta để nguyên thông báo đó nổi lên.
  await api(env, token, `/api/users/${userId}/password`, {
    method: 'PATCH',
    body: JSON.stringify({ password }),
  });

  // KHÔNG in mật khẩu ra màn hình: đầu ra của script hay bị dán vào chat hoặc log.
  console.log(`Đã đặt lại mật khẩu cho người dùng ${userId}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
