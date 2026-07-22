#!/usr/bin/env node
/**
 * Cấu hình connector gửi thư của Logto từ biến môi trường.
 *
 * VÌ SAO CÓ FILE NÀY thay vì bấm tay trong Admin Console:
 *
 * Cấu hình của Logto nằm trong DATABASE của Logto, không nằm trong git. Bấm tay thì máy
 * dev một kiểu, production một kiểu, không ai diff được, và khi có sự cố thì không ai trả
 * lời được "cấu hình đúng phải là gì". Cùng lý do dự án viết migration thay vì tạo bảng
 * bằng tay.
 *
 * File này KHÔNG chứa giá trị nào. Nó chỉ mô tả HÌNH DẠNG của cấu hình; giá trị đến từ
 * `.env`. Đổi từ Mailpit sang Gmail sang SES = đổi `.env` rồi chạy lại. Mã nguồn ứng dụng
 * không hề biết có chuyện gì xảy ra.
 *
 * CHẠY LẠI ĐƯỢC BAO NHIÊU LẦN CŨNG ĐƯỢC. Nó tra connector thư đang có; có rồi thì cập
 * nhật, chưa có thì tạo. Không nhân đôi.
 *
 * Cách chạy:
 *   node infra/scripts/configure-logto-email.mjs
 *
 * Bootstrap MỘT LẦN trước khi dùng: tạo một application Machine-to-Machine trong Logto
 * Admin Console, gán quyền Management API, rồi điền LOGTO_M2M_APP_ID và
 * LOGTO_M2M_APP_SECRET vào `.env`. Script sẽ nói rõ nếu thiếu.
 */

import { readFile } from 'node:fs/promises';

const ENV_FILE = new URL('../../.env', import.meta.url);

/**
 * Đọc `.env` thủ công thay vì thêm một package.
 *
 * Script hạ tầng chạy trước cả khi ứng dụng khởi động, và một file 40 dòng không đáng để
 * kéo thêm một phụ thuộc vào cây build.
 *
 * Biến đã có sẵn trong môi trường được ƯU TIÊN hơn `.env` — nhờ vậy CI hoặc production
 * truyền qua secret store mà không cần ghi ra đĩa.
 */
async function loadEnv() {
  let text = '';
  try {
    text = await readFile(ENV_FILE, 'utf8');
  } catch {
    // Không có `.env` không phải lỗi: môi trường có thể đã đặt sẵn biến.
  }

  const fromFile = {};
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Bỏ nháy bao ngoài nếu có — `.env` không có quy chuẩn chung, nên chấp nhận cả hai kiểu.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    fromFile[key] = value;
  }

  return { ...fromFile, ...process.env };
}

function required(env, key, hint) {
  const value = env[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Thiếu ${key}. ${hint}`);
  }
  return value.trim();
}

/** `'true'` → true. Mọi thứ khác → false. Không đoán mò `'1'`, `'yes'`… */
function bool(env, key) {
  return env[key] === 'true';
}

/**
 * Lấy access token cho Management API bằng luồng client_credentials.
 *
 * `resource` là indicator BẮT BUỘC: Logto phát token theo từng API resource, và token
 * thiếu trường này sẽ bị chính Management API từ chối dù client hợp lệ.
 */
async function getAccessToken(endpoint, appId, appSecret) {
  const response = await fetch(`${endpoint}/oidc/token`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      // Client secret đi trong header Basic, KHÔNG trong body: body có thể lọt vào log
      // truy cập của proxy, header thì thường bị lược.
      authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      resource: 'https://default.logto.app/api',
      scope: 'all',
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Không lấy được access token (${response.status}).\n` +
        `Kiểm tra LOGTO_M2M_APP_ID / LOGTO_M2M_APP_SECRET, và app đó đã được gán quyền ` +
        `Management API chưa.\n${detail}`,
    );
  }

  const data = await response.json();
  return data.access_token;
}

async function api(endpoint, token, path, init = {}) {
  const response = await fetch(`${endpoint}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new Error(
      `${init.method ?? 'GET'} ${path} → ${response.status}\n${await response.text()}`,
    );
  }

  return response.status === 204 ? undefined : response.json();
}

async function main() {
  const env = await loadEnv();

  /**
   * ENDPOINT CHÍNH (3001), KHÔNG phải admin endpoint (3002).
   *
   * Cả hai cổng đều có `/oidc/token`, nên nhầm lẫn rất dễ xảy ra — và lỗi trả về là
   * `invalid_client`, nghe như sai App ID chứ không phải sai cổng.
   *
   * Lý do: 3002 phục vụ tenant `admin` của chính Logto (Admin Console); ứng dụng ta tạo
   * nằm ở tenant `default`, do 3001 phục vụ. Xin token cho một client của tenant này ở cửa
   * của tenant kia thì đúng là không tồn tại.
   *
   * Management API cũng nằm ở 3001 (`/api/...`), cùng cổng.
   */
  const endpoint = (env.LOGTO_ENDPOINT ?? 'http://localhost:3001').replace(/\/$/, '');

  const appId = required(env, 'LOGTO_M2M_APP_ID', 'Xem hướng dẫn bootstrap ở `.env.example`.');
  const appSecret = required(env, 'LOGTO_M2M_APP_SECRET', 'Xem `.env.example`.');

  const host = required(
    env,
    'SMTP_HOST',
    'Ví dụ: `mailpit` cho dev, `smtp.gmail.com` để thử thật.',
  );
  const port = Number(required(env, 'SMTP_PORT', 'Thường là 1025 (Mailpit) hoặc 587 (SMTP thật).'));
  const fromEmail = required(env, 'SMTP_FROM_EMAIL', 'Địa chỉ hiện ở ô “Từ” của thư.');

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`SMTP_PORT không phải số cổng hợp lệ: ${env.SMTP_PORT}`);
  }

  /**
   * Cảnh báo Mailpit — đây là thứ đáng để script tự nói ra.
   *
   * Mailpit KHÔNG gửi thư đi đâu cả. Trỏ một môi trường có người dùng thật vào nó nghĩa là
   * không ai nhận được thư xác minh, và hệ thống KHÔNG báo lỗi vì Mailpit trả về "thành
   * công". Đây là loại sự cố chỉ phát hiện được khi có người phàn nàn.
   */
  if (/(^|\.)mailpit($|\.)/i.test(host) || host === 'localhost' || host === '127.0.0.1') {
    console.warn(
      '\n⚠  SMTP_HOST trỏ vào Mailpit hoặc localhost.\n' +
        '   Mailpit BẮT thư lại để xem, KHÔNG gửi tới người nhận nào.\n' +
        '   Chỉ dùng khi phát triển. Xem thư ở http://localhost:8025\n',
    );
  }

  const config = {
    host,
    port,
    // Hai cờ này hay bị lẫn: `secure` là TLS ngay từ khi mở kết nối (cổng 465),
    // `requireTLS` là mở trần rồi nâng cấp bằng STARTTLS (cổng 587). Đặt sai thì bắt tay
    // treo chứ không báo lỗi rõ ràng.
    secure: bool(env, 'SMTP_SECURE'),
    requireTLS: bool(env, 'SMTP_REQUIRE_TLS'),
    fromEmail,
    /**
     * Mẫu thư — Logto BẮT BUỘC có ít nhất mẫu cho việc đăng ký và đặt lại mật khẩu, nếu
     * không nó không gửi được gì cả.
     *
     * `{{code}}` là chỗ Logto thay bằng mã xác minh. Giữ nội dung tối giản và tiếng Việt;
     * làm đẹp bằng HTML để sau, khi đã chốt tên miền và địa chỉ người gửi.
     */
    templates: [
      {
        usageType: 'Register',
        contentType: 'text/plain',
        subject: 'Mã xác minh tài khoản Talosmine',
        content: 'Mã xác minh của bạn là {{code}}. Mã có hiệu lực trong 10 phút.',
      },
      {
        usageType: 'SignIn',
        contentType: 'text/plain',
        subject: 'Mã đăng nhập Talosmine',
        content: 'Mã đăng nhập của bạn là {{code}}. Mã có hiệu lực trong 10 phút.',
      },
      {
        usageType: 'ForgotPassword',
        contentType: 'text/plain',
        subject: 'Đặt lại mật khẩu Talosmine',
        content:
          'Mã đặt lại mật khẩu của bạn là {{code}}. Mã có hiệu lực trong 10 phút.\n' +
          'Nếu bạn không yêu cầu việc này, hãy bỏ qua thư.',
      },
      {
        usageType: 'Generic',
        contentType: 'text/plain',
        subject: 'Mã xác minh Talosmine',
        content: 'Mã xác minh của bạn là {{code}}.',
      },
    ],
  };

  /**
   * `auth` là TRƯỜNG BẮT BUỘC của connector, không phải tuỳ chọn.
   *
   * Điều đó hơi trái trực giác với Mailpit — nó không cần xác thực gì. Nhưng lược đồ của
   * Logto từ chối cấu hình thiếu `auth`, nên phải gửi một cặp giá trị.
   *
   * Với Mailpit thì gửi gì cũng được: container đặt `MP_SMTP_AUTH_ACCEPT_ANY=1`, chấp nhận
   * mọi thông tin đăng nhập. Dùng chuỗi `mailpit` cho dễ nhận ra trong log, thay vì một
   * chuỗi rỗng trông như thiếu cấu hình.
   */
  const user = env.SMTP_USER?.trim() || 'mailpit';
  const password = env.SMTP_PASSWORD?.trim() || 'mailpit';
  config.auth = { user, pass: password };

  const token = await getAccessToken(endpoint, appId, appSecret);

  const existing = await api(endpoint, token, '/api/connectors');
  const current = existing.find((c) => c.type === 'Email');

  if (current) {
    await api(endpoint, token, `/api/connectors/${current.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ config }),
    });
    console.log(`Đã cập nhật connector thư đang có (${current.connectorId}).`);
  } else {
    await api(endpoint, token, '/api/connectors', {
      method: 'POST',
      body: JSON.stringify({ connectorId: 'simple-mail-transfer-protocol', config }),
    });
    console.log('Đã tạo connector thư SMTP.');
  }

  console.log(`   host   ${host}:${port}`);
  console.log(`   secure ${config.secure}  requireTLS ${config.requireTLS}`);
  console.log(`   từ     ${fromEmail}`);
  console.log(`   tài khoản ${user}`);
}

main().catch((error) => {
  console.error(`\n${error.message}\n`);
  process.exit(1);
});
