/**
 * Phần dùng chung của các script cấu hình Logto: đọc `.env` và gọi Management API.
 *
 * Tách ra vì đã có hai script cần đúng những việc này, và bản sao thứ ba là lúc chúng bắt
 * đầu lệch nhau — nhất là ở chỗ CỔNG NÀO (xem `logtoEndpoint`), thứ đã làm mất một vòng
 * gỡ lỗi.
 */

import { readFile } from 'node:fs/promises';

const ENV_FILE = new URL('../../.env', import.meta.url);

/**
 * Đọc `.env` thủ công thay vì thêm một package.
 *
 * Script hạ tầng chạy trước cả khi ứng dụng khởi động; một hàm 20 dòng không đáng để kéo
 * thêm phụ thuộc vào cây build.
 *
 * Biến có sẵn trong môi trường ĐƯỢC ƯU TIÊN hơn `.env` — nhờ vậy CI hoặc production truyền
 * qua secret store mà không cần ghi ra đĩa.
 */
export async function loadEnv() {
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

/**
 * ENDPOINT CHÍNH (3001), KHÔNG phải admin endpoint (3002).
 *
 * Cả hai cổng đều có `/oidc/token`, nên nhầm lẫn rất dễ xảy ra — và lỗi trả về là
 * `invalid_client`, nghe như sai App ID chứ không phải sai cổng.
 *
 * Lý do: 3002 phục vụ tenant `admin` của chính Logto (Admin Console); ứng dụng M2M ta tạo
 * nằm ở tenant `default`, do 3001 phục vụ. Management API cũng ở 3001 (`/api/...`).
 */
export function logtoEndpoint(env) {
  return (env.LOGTO_ENDPOINT ?? 'http://localhost:3001').replace(/\/$/, '');
}

export async function getAccessToken(env) {
  const endpoint = logtoEndpoint(env);
  const appId = env.LOGTO_M2M_APP_ID?.trim();
  const appSecret = env.LOGTO_M2M_APP_SECRET?.trim();

  if (!appId || !appSecret) {
    throw new Error(
      'Thiếu LOGTO_M2M_APP_ID / LOGTO_M2M_APP_SECRET trong `.env`.\n' +
        'Xem hướng dẫn bootstrap ở `.env.example`.',
    );
  }

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
      // Indicator BẮT BUỘC: Logto phát token theo từng API resource, và token thiếu trường
      // này bị chính Management API từ chối dù client hợp lệ.
      resource: 'https://default.logto.app/api',
      scope: 'all',
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Không lấy được access token (${response.status}).\n` +
        'Kiểm tra LOGTO_M2M_APP_ID / LOGTO_M2M_APP_SECRET, và app đó đã được gán quyền ' +
        `Management API chưa.\n${await response.text()}`,
    );
  }

  return (await response.json()).access_token;
}

export async function api(env, token, path, init = {}) {
  const response = await fetch(`${logtoEndpoint(env)}${path}`, {
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
