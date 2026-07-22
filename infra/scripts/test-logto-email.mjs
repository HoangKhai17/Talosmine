#!/usr/bin/env node
/**
 * Gửi một thư thử qua connector đang cấu hình, rồi kiểm chứng nó thật sự tới nơi.
 *
 * VÌ SAO CẦN: `configure-logto-email.mjs` chỉ chứng minh Logto CHẤP NHẬN cấu hình. Nó không
 * chứng minh thư đi được — sai cổng, sai cờ TLS hay sai mật khẩu đều chỉ lộ ra lúc gửi thật.
 *
 * Khi trỏ vào Mailpit, script còn đọc lại hộp thư của Mailpit để xác nhận thư đã tới. Với
 * SMTP thật thì không đọc được, nên chỉ báo Logto nhận lệnh gửi thành công.
 *
 * Cách chạy:
 *   node infra/scripts/test-logto-email.mjs [dia-chi-nhan]
 */

import { readFile } from 'node:fs/promises';

const ENV_FILE = new URL('../../.env', import.meta.url);
const MAILPIT_API = process.env.MAILPIT_API ?? 'http://localhost:8025';

async function loadEnv() {
  let text = '';
  try {
    text = await readFile(ENV_FILE, 'utf8');
  } catch {
    // Không có `.env` cũng được: môi trường có thể đã đặt sẵn biến.
  }

  const fromFile = {};
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    fromFile[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return { ...fromFile, ...process.env };
}

async function main() {
  const env = await loadEnv();
  const endpoint = (env.LOGTO_ENDPOINT ?? 'http://localhost:3001').replace(/\/$/, '');
  const to = process.argv[2] ?? 'kiem-thu@talosmine.local';

  const appId = env.LOGTO_M2M_APP_ID;
  const appSecret = env.LOGTO_M2M_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error('Thiếu LOGTO_M2M_APP_ID / LOGTO_M2M_APP_SECRET trong `.env`.');
  }

  const tokenResponse = await fetch(`${endpoint}/oidc/token`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      resource: 'https://default.logto.app/api',
      scope: 'all',
    }),
  });
  if (!tokenResponse.ok) {
    throw new Error(
      `Không lấy được token (${tokenResponse.status}): ${await tokenResponse.text()}`,
    );
  }
  const { access_token: token } = await tokenResponse.json();

  // Số thư trong Mailpit TRƯỚC khi gửi — để biết chắc thư mới là do lần chạy này tạo ra,
  // không phải một thư cũ còn sót.
  let before = null;
  try {
    const info = await fetch(`${MAILPIT_API}/api/v1/messages?limit=1`);
    if (info.ok) before = (await info.json()).messages_count;
  } catch {
    // Không có Mailpit là bình thường khi trỏ vào SMTP thật.
  }

  /**
   * Đọc cấu hình ĐANG LƯU rồi gửi chính nó đi test.
   *
   * `/api/connectors/{factoryId}/test` nhận `config` trong body và dùng ĐÚNG cái đó, không
   * tự đọc cấu hình đã lưu. Nếu ta tự dựng lại config từ `.env` ở đây thì bài test chứng
   * minh một thứ khác với thứ Logto thật sự dùng — đúng loại test cho cảm giác an toàn giả.
   */
  const connectors = await (
    await fetch(`${endpoint}/api/connectors`, { headers: { authorization: `Bearer ${token}` } })
  ).json();

  const emailConnector = connectors.find((c) => c.type === 'Email');
  if (!emailConnector) {
    throw new Error('Chưa có connector thư nào. Chạy `configure-logto-email.mjs` trước.');
  }

  const response = await fetch(`${endpoint}/api/connectors/simple-mail-transfer-protocol/test`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    // Trường là `email`, không phải `to`.
    body: JSON.stringify({ email: to, config: emailConnector.config }),
  });

  if (!response.ok) {
    throw new Error(
      `Logto KHÔNG gửi được thư (${response.status}).\n${await response.text()}\n\n` +
        'Kiểm tra host/port, và hai cờ SMTP_SECURE / SMTP_REQUIRE_TLS — đặt sai thì bắt tay ' +
        'treo chứ không báo lỗi rõ ràng.',
    );
  }

  console.log(`Logto đã nhận lệnh gửi tới ${to}.`);

  if (before === null) {
    console.log('Không đọc được Mailpit — nếu đang dùng SMTP thật thì hãy tự kiểm hộp thư.');
    return;
  }

  // Mailpit ghi thư gần như tức thời, nhưng chờ một nhịp cho chắc.
  await new Promise((resolve) => setTimeout(resolve, 800));

  const after = await (await fetch(`${MAILPIT_API}/api/v1/messages?limit=1`)).json();
  if (after.messages_count <= before) {
    throw new Error(
      `Logto báo thành công nhưng Mailpit KHÔNG nhận được thư nào (${before} → ${after.messages_count}).\n` +
        'Đây đúng là loại lỗi im lặng mà script này sinh ra để bắt.',
    );
  }

  const latest = after.messages[0];
  console.log(`Mailpit đã nhận: "${latest.Subject}"`);
  console.log(`   từ    ${latest.From.Address}`);
  console.log(`   tới   ${latest.To.map((t) => t.Address).join(', ')}`);
  console.log(`\nXem toàn văn ở ${MAILPIT_API}`);
}

main().catch((error) => {
  console.error(`\n${error.message}\n`);
  process.exit(1);
});
