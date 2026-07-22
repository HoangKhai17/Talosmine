#!/usr/bin/env node
/**
 * Cấu hình trải nghiệm đăng nhập của Logto: định danh, thương hiệu, ngôn ngữ.
 *
 * Cùng lý do với `configure-logto-email.mjs`: những giá trị này nằm trong DATABASE của
 * Logto, không nằm trong git. Bấm tay trong Admin Console thì máy dev một kiểu, production
 * một kiểu, và không ai review được.
 *
 * CHẠY LẠI BAO NHIÊU LẦN CŨNG ĐƯỢC — nó PATCH, không tạo mới.
 *
 * Cách chạy:
 *   node infra/scripts/configure-logto-sign-in.mjs
 */

import { api, getAccessToken, loadEnv } from './logto-api.mjs';

/**
 * ĐỊNH DANH — quyết định quan trọng nhất trong file này.
 *
 * ĐĂNG KÝ bằng EMAIL, có xác minh (`verify: true`). Xác minh cần gửi thư, nên bước này chỉ
 * hoạt động sau khi `configure-logto-email.mjs` đã chạy. Không có connector thư thì Logto
 * tự ẩn luôn lựa chọn đăng ký bằng email — im lặng, không báo lỗi.
 *
 * ĐĂNG NHẬP chấp nhận CẢ HAI: email và tên đăng nhập.
 *
 * Vì sao giữ username ở đường đăng nhập dù đăng ký đã chuyển sang email: các tài khoản tạo
 * trước thời điểm này chỉ có username và cột email rỗng. Bỏ username khỏi `signIn.methods`
 * sẽ khoá họ ra ngoài chính hệ thống của mình — trong đó có tài khoản quản trị.
 *
 * `verificationCode: false` ở cả hai: đăng nhập bằng mã gửi qua thư là một luồng riêng,
 * chưa dựng màn hình cho nó trong `apps/logto-ui`. Bật ở đây mà thiếu màn hình thì người
 * dùng rơi vào màn hình dự phòng.
 */
const SIGN_UP = {
  identifiers: ['email'],
  password: true,
  verify: true,
};

const SIGN_IN = {
  methods: [
    { identifier: 'email', password: true, verificationCode: false, isPasswordPrimary: true },
    { identifier: 'username', password: true, verificationCode: false, isPasswordPrimary: true },
  ],
};

/**
 * Thương hiệu và ngôn ngữ.
 *
 * `branding: {}` XOÁ ô logo. Mặc định của Logto trỏ vào `https://logto.io/logo.svg` —
 * nghĩa là trang đăng nhập của ta tải một ảnh TỪ MÁY CHỦ CỦA LOGTO, gửi IP và Referer của
 * người dùng sang bên thứ ba ngay tại trang nhạy cảm nhất, và vỡ ảnh nếu bên đó không truy
 * cập được. Giao diện tuỳ chỉnh của ta không dùng ô logo này, nên bỏ hẳn.
 *
 * Phải là object RỖNG, không phải chuỗi rỗng: lược đồ đòi `logoUrl` là URL hợp lệ, nên
 * `logoUrl: ''` bị từ chối.
 *
 * `autoDetect: false`: mặc định của Logto là đoán theo `Accept-Language`, nên cùng một
 * trang hiện tiếng Pháp với người này và tiếng Anh với người kia — đúng thứ đã thấy khi
 * mở `/sign-in` lần đầu.
 *
 * `fallbackLanguage: 'en'` chứ KHÔNG phải `'vi'`: Logto 1.41 không có gói tiếng Việt, và
 * lược đồ từ chối thẳng mã đó (đã đo: `?lng=vi` rơi về tiếng Anh). Giao diện của ta viết
 * cứng tiếng Việt nên phần lớn chữ không phụ thuộc thiết lập này; nó chỉ chi phối vài
 * chuỗi do chính Logto sinh. Cố định `en` cho ra kết quả GIỐNG NHAU với mọi người dùng,
 * thay vì ngẫu nhiên theo trình duyệt. Muốn tiếng Việt thật thì phải thêm Custom Phrases.
 */
const BRANDING = {
  branding: {},
  languageInfo: { autoDetect: false, fallbackLanguage: 'en' },
};

/*
 * KHÔNG đặt `hideLogtoBranding`.
 *
 * Bản OSS từ chối thẳng: "Hide Logto branding is not supported in this environment" — đó
 * là tính năng của bản trả phí.
 *
 * Và ta KHÔNG CẦN nó: dòng "Powered by Logto" nằm trong giao diện mặc định của Logto, mà
 * `apps/logto-ui` đã thay thế toàn bộ. HTML của ta đơn giản không có dòng đó.
 */

async function main() {
  const env = await loadEnv();
  const token = await getAccessToken(env);

  // Không có connector thư thì `verify: true` là lời hứa suông: Logto sẽ không gửi được mã
  // nào, và người dùng kẹt ở màn hình nhập mã vĩnh viễn. Dừng sớm và nói rõ.
  const connectors = await api(env, token, '/api/connectors');
  if (!connectors.some((c) => c.type === 'Email')) {
    throw new Error(
      'Chưa có connector thư. Đăng ký bằng email cần gửi mã xác minh.\n' +
        'Chạy `node infra/scripts/configure-logto-email.mjs` trước.',
    );
  }

  const before = await api(env, token, '/api/sign-in-exp');

  await api(env, token, '/api/sign-in-exp', {
    method: 'PATCH',
    body: JSON.stringify({ signUp: SIGN_UP, signIn: SIGN_IN, ...BRANDING }),
  });

  const after = await api(env, token, '/api/sign-in-exp');

  const show = (exp) =>
    `đăng ký: ${exp.signUp.identifiers.join('+') || '(không)'}` +
    `${exp.signUp.verify ? ' (có xác minh)' : ''}` +
    `  ·  đăng nhập: ${exp.signIn.methods.map((m) => m.identifier).join('+')}`;

  console.log(`trước: ${show(before)}`);
  console.log(`sau  : ${show(after)}`);
  console.log(`logo : ${after.branding.logoUrl || '(trống — không tải ảnh từ bên ngoài)'}`);
  console.log(
    `ngôn ngữ: ${after.languageInfo.fallbackLanguage}` +
      `${after.languageInfo.autoDetect ? ' (tự đoán)' : ' (cố định)'}`,
  );
}

main().catch((error) => {
  console.error(`\n${error.message}\n`);
  process.exit(1);
});
