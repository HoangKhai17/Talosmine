/*
 * Giao diện đăng nhập / đăng ký của Talosmine, chạy TRONG Logto.
 *
 * Logto phục vụ file này thay cho giao diện mặc định của nó. Toàn bộ việc xác thực vẫn do
 * Logto làm: file này chỉ vẽ màn hình và gọi Experience API của chính Logto, cùng origin.
 *
 * VÌ SAO CÁCH NÀY: mật khẩu người dùng đi thẳng từ trình duyệt tới Logto, KHÔNG đi qua web
 * app của Talosmine. Nếu dựng biểu mẫu này trong Next.js thì mọi lỗ XSS và mọi thư viện
 * trong cây phụ thuộc của web app đều trở thành rủi ro lộ mật khẩu. Ở đây bề mặt rủi ro
 * đúng bằng ba file tĩnh không phụ thuộc gì.
 *
 * KHÔNG CÓ THƯ VIỆN NÀO. Không React, không bundler, không package. Đây là trang người dùng
 * gõ mật khẩu — mỗi phụ thuộc thêm vào là một cửa nữa cho tấn công chuỗi cung ứng.
 *
 * ⚠ FILE NÀY THAY THẾ TOÀN BỘ GIAO DIỆN CỦA LOGTO, không chỉ vài màn hình. Đã dựng: đăng
 * nhập, đăng ký, quên mật khẩu. Mọi đường dẫn khác (MFA, đăng nhập mạng xã hội, màn hình
 * đồng ý) rơi vào nhánh dự phòng ở cuối file — hiện không đường nào tới được, vì cấu hình
 * Logto chưa bật thứ nào trong số đó.
 *
 * BẬT THÊM BẤT KỲ THỨ GÌ Ở LOGTO THÌ PHẢI DỰNG THÊM MÀN HÌNH Ở ĐÂY TRƯỚC.
 */

'use strict';

/** Đường dẫn Logto dùng cho từng màn hình. */
const ROUTES = {
  signIn: '/sign-in',
  register: '/register',
  forgotPassword: '/forgot-password',
  /*
    Logto tự đá tới đây khi KHÔNG CÓ PHIÊN TƯƠNG TÁC.

    Xảy ra mỗi lần ai đó gõ thẳng `localhost:3001/sign-in` vào thanh địa chỉ, hoặc mở lại
    một tab cũ. Phiên tương tác được tạo ở `/oidc/auth`, tức là khi web app khởi động luồng
    đăng nhập — không có bước đó thì Logto không biết đang đăng nhập vào ứng dụng nào, với
    `redirect_uri` nào, `state` nào.
  */
  unknownSession: '/unknown-session',
  /*
    Google chuyển người dùng VỀ đây sau khi cấp quyền, dạng `/callback/<connectorId>?code=…&state=…`.
    Đây là URL đã đăng ký trong Google Cloud, và Logto phục vụ giao diện của ta ở mọi đường
    dẫn nên app.js phải tự xử lý nó. Không dựng màn hình này thì người dùng cấp quyền xong
    rơi vào màn hình dự phòng — ngay lúc tệ nhất.
  */
  socialCallback: '/callback/',
};

/** Khoá lưu trạng thái luồng Google giữa hai lần tải trang (trước và sau chuyến đi Google). */
const SOCIAL_STORAGE_KEY = 'talosmine.social';

/**
 * Connector Google, đọc từ Logto lúc khởi động — hoặc `null` nếu chưa bật.
 *
 * Đọc từ `/api/.well-known/experience` (`socialConnectors[]`) thay vì viết cứng ID: connector
 * ID do Logto sinh và khác nhau giữa các máy. Nút "Tiếp tục với Google" TỰ kích hoạt khi giá
 * trị này khác `null`, và tự về trạng thái `disabled` khi connector chưa bật — không cần sửa
 * code hai nơi.
 */
let googleConnector = null;

/**
 * Kiểm địa chỉ thư — CỐ Ý LỎNG, lấy đúng biểu thức mà Experience API dùng
 * (`/^\S+@\S+\.\S+$/`).
 *
 * Không dùng một biểu thức "chuẩn RFC" phức tạp hơn: mọi biểu thức như vậy đều từ chối
 * nhầm những địa chỉ hợp lệ nhưng lạ mắt, và thứ duy nhất chứng minh một hộp thư có thật
 * là GỬI THƯ TỚI ĐÓ — mà luồng này làm đúng việc đó ở bước sau.
 *
 * Chép luật của máy chủ để người dùng biết ngay lúc gõ, không phải gửi đi rồi nhận lỗi khó
 * hiểu. Máy chủ vẫn kiểm lại.
 */
/**
 * Tên thương hiệu hiển thị.
 *
 * Gói này KHÔNG import được từ `apps/web/lib/brand.ts`: nó là JavaScript thuần chạy trong
 * Logto, không qua bundler nào. Hai hằng số vì thế phải khớp bằng tay — đổi tên thương hiệu
 * là phải sửa CẢ HAI. Ghi ra đây để lần sau không ai sửa một bên rồi tưởng xong.
 */
const BRAND_NAME = 'Kolo';

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

/* ── Gọi API ────────────────────────────────────────────────────────────────── */

class ExperienceError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * Gọi Experience API.
 *
 * `credentials: 'same-origin'` là bắt buộc: phiên tương tác nằm trong cookie do Logto đặt
 * lúc `/oidc/auth` chuyển hướng tới đây. Thiếu nó thì mọi lời gọi đều 401 dù mật khẩu đúng.
 */
async function callExperience(method, path, body) {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
    cache: 'no-store',
  });

  if (response.status === 204) return undefined;

  const text = await response.text();
  let data;
  try {
    data = text === '' ? undefined : JSON.parse(text);
  } catch {
    data = undefined;
  }

  if (!response.ok) {
    throw new ExperienceError(
      response.status,
      data && typeof data.code === 'string' ? data.code : 'unknown',
      data && typeof data.message === 'string' ? data.message : 'Something went wrong.',
    );
  }

  return data;
}

/**
 * Đoán người dùng vừa gõ TÊN ĐĂNG NHẬP hay ĐỊA CHỈ THƯ.
 *
 * Chỉ dựa vào dấu `@`: tên đăng nhập hợp lệ của Logto không bao giờ chứa nó (xem
 * `USERNAME_PATTERN`), nên một ký tự đủ phân biệt hai loại mà không cần luật phức tạp.
 *
 * KHÔNG kiểm địa chỉ thư có đúng định dạng hay không — máy chủ mới là nơi quyết định. Việc
 * ở đây chỉ là gửi đúng `type` để máy chủ tra đúng cột.
 *
 * Thư điện tử viết thường: địa chỉ thư không phân biệt hoa thường trên thực tế, và Logto
 * lưu ở dạng thường. Không hạ chữ thì người gõ "Ten@Vidu.com" sẽ tra không ra.
 */
function identifierFor(value) {
  return value.includes('@')
    ? { type: 'email', value: value.toLowerCase() }
    : { type: 'username', value };
}

/**
 * Đăng nhập bằng tên đăng nhập (hoặc địa chỉ thư, khi Logto bật) + mật khẩu.
 *
 * Bốn chặng, đúng theo Experience API. Không rút gọn được: mỗi chặng tạo ra thứ mà chặng
 * sau cần, và Logto giữ trạng thái giữa các chặng trong cookie phiên tương tác.
 */
async function signIn(username, password) {
  await callExperience('PUT', '/api/experience', { interactionEvent: 'SignIn' });

  const verification = await callExperience('POST', '/api/experience/verification/password', {
    identifier: identifierFor(username),
    password,
  });

  await callExperience('POST', '/api/experience/identification', {
    verificationId: verification.verificationId,
  });

  const result = await callExperience('POST', '/api/experience/submit');
  return result.redirectTo;
}

/**
 * Đăng ký — CHẶNG 1: gửi mã xác minh tới địa chỉ thư.
 *
 * Đăng ký bằng email là luồng HAI BƯỚC, khác hẳn đăng nhập. Logto phải chắc chắn người
 * đăng ký thật sự sở hữu hộp thư đó trước khi tạo tài khoản — nếu không, ai cũng đăng ký
 * được bằng địa chỉ của người khác rồi chiếm luôn đường khôi phục mật khẩu của họ.
 *
 * Trả về `verificationId` để chặng 2 dùng.
 */
async function sendRegistrationCode(email) {
  await callExperience('PUT', '/api/experience', { interactionEvent: 'Register' });

  const verification = await callExperience(
    'POST',
    '/api/experience/verification/verification-code',
    {
      identifier: { type: 'email', value: email },
      interactionEvent: 'Register',
    },
  );

  return verification.verificationId;
}

/**
 * Đăng ký — CHẶNG 2: xác minh mã rồi tạo tài khoản.
 *
 * Thứ tự các lời gọi KHÔNG đổi được:
 *   1. verify   — đổi mã lấy một `verificationId` MỚI (cái cũ chỉ chứng minh "đã gửi")
 *   2. profile  — gắn email đã xác minh, rồi mật khẩu, rồi tên hiển thị
 *   3. identification — chính bước này kích hoạt việc TẠO tài khoản
 *   4. submit   — kết thúc phiên tương tác, trả về nơi cần chuyển hướng tới
 *
 * Gắn hồ sơ SAU bước định danh thì dữ liệu không đi vào tài khoản vừa tạo.
 *
 * TÊN VÀ HỌ LÀ TUỲ CHỌN, và lỗi ở bước đó KHÔNG chặn việc tạo tài khoản: mất một tên hiển
 * thị thì sửa được sau trong trang tài khoản, còn chặn người dùng tạo tài khoản vì một
 * trường trang trí thì không sửa được — họ bỏ đi. Lỗi vẫn ghi ra console cho người vận
 * hành thấy, không nuốt im lặng.
 */
async function completeRegistration({ email, code, verificationId, password, profile }) {
  const verified = await callExperience(
    'POST',
    '/api/experience/verification/verification-code/verify',
    {
      identifier: { type: 'email', value: email },
      verificationId,
      code,
    },
  );

  await callExperience('POST', '/api/experience/profile', {
    type: 'email',
    verificationId: verified.verificationId,
  });

  await callExperience('POST', '/api/experience/profile', {
    type: 'password',
    value: password,
  });

  const values = {};
  if (profile.givenName) values.givenName = profile.givenName;
  if (profile.familyName) values.familyName = profile.familyName;
  if (profile.givenName || profile.familyName) {
    values.name = [profile.givenName, profile.familyName].filter(Boolean).join(' ');
    try {
      await callExperience('POST', '/api/experience/profile', {
        type: 'extraProfile',
        values,
      });
    } catch (error) {
      console.warn('Could not save your display name, but your account was still created.', error);
    }
  }

  await callExperience('POST', '/api/experience/identification', {});

  const result = await callExperience('POST', '/api/experience/submit');
  return result.redirectTo;
}

/**
 * Quên mật khẩu — CHẶNG 1: gửi mã tới địa chỉ thư.
 *
 * `interactionEvent: 'ForgotPassword'` phải xuất hiện ở CẢ HAI lời gọi. Ở `PUT /api/experience`
 * nó đặt loại phiên tương tác; ở lời gọi gửi mã nó chọn MẪU THƯ. Đặt lệch nhau thì người dùng
 * nhận một lá thư nói về việc đăng ký trong lúc họ đang khôi phục mật khẩu.
 */
async function sendPasswordResetCode(email) {
  await callExperience('PUT', '/api/experience', { interactionEvent: 'ForgotPassword' });

  const verification = await callExperience(
    'POST',
    '/api/experience/verification/verification-code',
    {
      identifier: { type: 'email', value: email },
      interactionEvent: 'ForgotPassword',
    },
  );

  return verification.verificationId;
}

/**
 * Quên mật khẩu — CHẶNG 2: đổi mã lấy quyền đặt lại mật khẩu.
 *
 * Tách khỏi chặng 3 CÓ CHỦ ĐÍCH. Gộp "xác minh mã" và "đặt mật khẩu mới" vào một lần gửi thì
 * mật khẩu bị chính sách từ chối sẽ TIÊU LUÔN cái mã — người dùng phải quay lại hộp thư xin
 * mã mới chỉ vì gõ mật khẩu quá ngắn. Tách ra thì họ sửa mật khẩu và gửi lại ngay.
 *
 * `identification` là BẮT BUỘC, giống hai luồng kia: `PUT /api/experience/profile/password`
 * trả 404 `session.identifier_not_found` nếu phiên chưa biết đang đổi mật khẩu cho ai.
 *
 * ⚠ BƯỚC NÀY PHỤ THUỘC MỘT THIẾT LẬP Ở LOGTO. Nếu `forgotPasswordMethods` trong sign-in
 * experience KHÔNG chứa `EmailVerificationCode`, lời gọi này trả:
 *
 *     HTTP 422  session.not_supported_for_forgot_password
 *
 * Mặc định của Logto là MẢNG RỖNG, tức luồng khôi phục tắt. Đã mất một vòng gỡ lỗi vì thông
 * điệp nghe như "Logto không hỗ trợ khôi phục mật khẩu" trong khi thật ra là "chưa ai bật".
 * `infra/scripts/configure-logto-sign-in.mjs` bật nó, và có chốt chặn báo lỗi nếu thiếu.
 */
async function verifyPasswordResetCode({ email, code, verificationId }) {
  const verified = await callExperience(
    'POST',
    '/api/experience/verification/verification-code/verify',
    {
      identifier: { type: 'email', value: email },
      verificationId,
      code,
    },
  );

  await callExperience('POST', '/api/experience/identification', {
    verificationId: verified.verificationId,
  });
}

/**
 * Quên mật khẩu — CHẶNG 3: đặt mật khẩu mới.
 *
 * `PUT` chứ không `POST` (đã đọc từ swagger của chính Logto đang chạy), và đường dẫn là
 * `/profile/password` — KHÁC với `/profile` mà luồng đăng ký dùng. Hai đường dẫn khác nhau vì
 * việc chúng làm khác nhau: một cái gắn hồ sơ cho tài khoản đang tạo, một cái ghi đè mật khẩu
 * của tài khoản đã có.
 *
 * `submit` mới là chỗ mật khẩu THẬT SỰ được ghi và mọi bản ghi tương tác bị xoá.
 *
 * ⚠ `submit` TRẢ 204, KHÔNG PHẢI 200 — khác với luồng đăng nhập và đăng ký.
 *
 * Swagger của Logto 1.41 khai một kiểu trả về duy nhất cho endpoint này: 200 kèm `redirectTo`
 * bắt buộc. Với `ForgotPassword` thì thực tế là 204 rỗng — hợp lý, vì đổi mật khẩu xong KHÔNG
 * đăng nhập người dùng vào, nên chẳng có đâu để chuyển tới.
 *
 * Đọc `result.redirectTo` từ `undefined` ném TypeError, và `describeError` không nhận ra nó
 * là lỗi API nên hiện "Không kết nối được tới máy chủ" — NGAY SAU KHI mật khẩu đã đổi thành
 * công. Người dùng được báo là hỏng trong khi mọi thứ đã xong, và họ sẽ thử lại bằng mật khẩu
 * cũ. Đã đo đúng tình huống này bằng luồng thật trước khi sửa.
 *
 * Trả `undefined` một cách có chủ đích. `?.` để nếu bản Logto sau này đổi sang 200 kèm
 * `redirectTo` thì màn hình tự dùng, không phải sửa lại.
 */
async function resetPassword(password) {
  await callExperience('PUT', '/api/experience/profile/password', { password });

  const result = await callExperience('POST', '/api/experience/submit');
  return result?.redirectTo;
}

/* ── Đăng nhập bằng Google ─────────────────────────────────────────────────────
 *
 * KHÁC HẲN mọi luồng trên: nó RỜI TRANG. Người dùng đi sang Google, cấp quyền, rồi Google
 * đưa họ về `/callback/<connectorId>`. Vì trang bị tải lại ở giữa chừng, mọi thứ cần giữ
 * (verificationId, state) phải nằm ở `sessionStorage` chứ không phải biến JS.
 */

/**
 * Đọc connector Google từ Logto. Trả `null` nếu chưa bật.
 *
 * `socialConnectors[]` ở well-known endpoint là danh sách công khai, đọc được không cần
 * phiên. Mỗi mục có `id` (dùng cho callback URI) và `target` ('google'). Không viết cứng ID
 * vì Logto sinh ID khác nhau giữa các máy.
 */
async function fetchGoogleConnector() {
  try {
    const response = await fetch('/api/.well-known/experience', {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const data = await response.json();
    const list = Array.isArray(data.socialConnectors) ? data.socialConnectors : [];
    return list.find((c) => c.target === 'google') ?? null;
  } catch {
    // Mất mạng lúc khởi động: coi như chưa có Google, nút để disabled. Đăng nhập mật khẩu
    // vẫn dùng được.
    return null;
  }
}

/**
 * Sinh `state` ngẫu nhiên — chốt chặn CSRF cho luồng OAuth.
 *
 * Google trả lại đúng `state` ta gửi đi. Lúc quay về, ta đối chiếu: khác nghĩa là phản hồi
 * không thuộc phiên ta khởi tạo (có thể là đòn CSRF), phải từ chối. `crypto.getRandomValues`
 * chứ không `Math.random`: giá trị này phải không đoán trước được.
 */
function randomState() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Google — CHẶNG 1: xin URL cấp quyền rồi RỜI TRANG sang Google.
 *
 * `redirectUri` phải TRÙNG KHỚP hai nơi: (a) URL đã đăng ký trong Google Cloud, và (b) chuỗi
 * ta gửi ở bước verify lúc quay về — Google đối chiếu nó khi đổi code lấy token, lệch một ký
 * tự là `redirect_uri_mismatch`. Vì vậy dựng nó MỘT lần ở đây rồi cất đi dùng lại.
 */
async function startGoogleSignIn(connector) {
  const redirectUri = `${window.location.origin}/callback/${connector.id}`;
  const state = randomState();

  await callExperience('PUT', '/api/experience', { interactionEvent: 'SignIn' });

  const { authorizationUri, verificationId } = await callExperience(
    'POST',
    `/api/experience/verification/social/${connector.id}/authorization-uri`,
    { state, redirectUri },
  );

  sessionStorage.setItem(
    SOCIAL_STORAGE_KEY,
    JSON.stringify({ state, verificationId, connectorId: connector.id, redirectUri }),
  );

  // `assign` chứ không `replace`: người dùng bấm Back ở màn hình Google sẽ quay lại được
  // trang đăng nhập của ta.
  window.location.assign(authorizationUri);
}

/**
 * Google — CHẶNG 2: đổi `code` lấy phiên đăng nhập, chạy khi Google đưa người dùng về.
 *
 * `connectorData: { code, redirectUri }` là shape mà connector Google của Logto đòi đúng
 * (đã đọc từ mã nguồn connector trong container, không đoán). `redirectUri` phải y hệt chuỗi
 * ở chặng 1.
 *
 * `linkSocialIdentity: true` — nếu email Google (đã xác minh) này đã có tài khoản, GỘP Google
 * vào tài khoản đó thay vì tạo tài khoản thứ hai. Quyết định của chủ dự án (2026-07-22): tự
 * liên kết, và CHỈ cho Google, vì Google đảm bảo `email_verified`. Bật auto-link cho một IdP
 * không đảm bảo điều đó là mở đường chiếm tài khoản — nên luồng này chỉ dùng cho Google.
 *
 * ĐĂNG NHẬP HAY ĐĂNG KÝ — QUYẾT ĐỊNH KHI QUAY VỀ, BA TẦNG.
 *
 * Một người bấm "Tiếp tục với Google" có thể rơi vào một trong ba tình huống, và ta KHÔNG
 * biết trước là cái nào. `linkSocialIdentity` cùng `interactionEvent` phải khớp đúng từng
 * tình huống — sai là hỏng ở bước submit chứ không phải identification, nên khó thấy:
 *
 *   (1) Đã đăng nhập Google trước đó → social ĐÃ liên kết. Định danh THẲNG, KHÔNG kèm
 *       `linkSocialIdentity`. Kèm cờ đó cho tài khoản đã liên kết → submit trả
 *       `user.identity_already_in_use` (đã đo trong audit log Logto — chính là lỗi lần này).
 *
 *   (2) Lần đầu dùng Google, nhưng email Google (đã xác minh) TRÙNG một tài khoản email+mật
 *       khẩu đã có → GỘP vào đó bằng `linkSocialIdentity: true`. Đây là quyết định auto-link
 *       của chủ dự án, chỉ áp cho Google.
 *
 *   (3) Email Google chưa gắn với tài khoản nào → ĐĂNG KÝ mới. `POST identification` phân
 *       nhánh theo `interactionEvent` (đọc từ mã core): SignIn chỉ TÌM, Register mới TẠO. Nên
 *       phải chuyển interaction sang Register rồi định danh lại.
 *
 * ⚠ CHUYỂN EVENT BẰNG `PUT /api/experience/interaction-event`, KHÔNG PHẢI `PUT /api/experience`.
 *   Hai endpoint nghe giống nhau nhưng làm ngược nhau (đọc thẳng từ swagger của instance):
 *     - `PUT /api/experience`                → "Init a NEW interaction. Any existing
 *                                               interaction data will be CLEARED."  ← XOÁ verification
 *     - `PUT /api/experience/interaction-event` → "switch event between SignIn and Register,
 *                                               KEEPING all the verification records data."  ← GIỮ
 *   Bản trước dùng cái đầu, nên tài khoản Google MỚI báo `session.verification_session_not_found`
 *   ở bước định danh Register (đã đo trong audit log Logto). Dùng cái sau thì social verification
 *   sống sót, dùng lại đúng vid.
 *
 * Thử lần lượt 1 → 2 → 3, mỗi lần thất bại vì "social chưa liên kết" thì xuống tầng sau. Một
 * identification thất bại là assert ném TRƯỚC khi đổi trạng thái, nên interaction vẫn dùng lại được.
 */
async function completeGoogleSignIn({ connectorId, code, redirectUri, verificationId }) {
  const verified = await callExperience(
    'POST',
    `/api/experience/verification/social/${connectorId}/verify`,
    { connectorData: { code, redirectUri }, verificationId },
  );
  const vid = verified.verificationId;

  // "Social này chưa gắn với tài khoản nào" — tín hiệu để thử tầng tiếp theo. Cả hai mã đều
  // có nghĩa đó tuỳ ngữ cảnh: `identity_not_exist` (định danh thẳng), `user_not_exist` (gộp email).
  const notLinkedYet = (e) =>
    e instanceof ExperienceError &&
    (e.code === 'user.identity_not_exist' || e.code === 'user.user_not_exist');

  try {
    // (1) Đã liên kết → đăng nhập thẳng.
    await callExperience('POST', '/api/experience/identification', { verificationId: vid });
  } catch (error1) {
    if (!notLinkedYet(error1)) throw error1;
    try {
      // (2) Chưa liên kết, email trùng tài khoản cũ → gộp.
      await callExperience('POST', '/api/experience/identification', {
        verificationId: vid,
        linkSocialIdentity: true,
      });
    } catch (error2) {
      if (!notLinkedYet(error2)) throw error2;
      // (3) Không tài khoản nào khớp → đăng ký mới. Chuyển event bằng interaction-event
      // (GIỮ verification), KHÔNG phải PUT /api/experience (XOÁ verification).
      await callExperience('PUT', '/api/experience/interaction-event', {
        interactionEvent: 'Register',
      });
      await callExperience('POST', '/api/experience/identification', { verificationId: vid });
    }
  }

  const result = await callExperience('POST', '/api/experience/submit');
  return result.redirectTo;
}

/**
 * Đổi lỗi của máy chủ thành câu người dùng đọc được.
 *
 * KHÔNG NÓI TÀI KHOẢN CÓ TỒN TẠI HAY KHÔNG khi đăng nhập thất bại. Phân biệt "sai mật khẩu"
 * với "không có tài khoản này" cho phép người lạ dò xem ai đã đăng ký — và danh sách đó là
 * thứ đầu tiên một cuộc tấn công nhồi mật khẩu cần.
 *
 * Ở luồng ĐĂNG KÝ thì ngược lại: phải nói thẳng "tên này đã có người dùng", vì không nói
 * thì người dùng không biết phải sửa gì. Thông tin đó dù sao cũng lộ ra qua chính việc đăng
 * ký thất bại.
 */
function describeError(error, mode) {
  if (!(error instanceof ExperienceError)) {
    return 'Could not reach the server. Check your connection and try again.';
  }

  if (mode === 'signIn' && (error.status === 401 || error.status === 422)) {
    return 'Those sign-in details are not correct.';
  }

  /*
    KHÔI PHỤC MẬT KHẨU: không xác nhận địa chỉ thư này có tài khoản hay không.

    Biểu mẫu quên mật khẩu là chỗ dò danh sách người dùng dễ nhất trên cả site — nó nhận địa
    chỉ thư từ người lạ và không đòi hỏi gì. Trả lời "không có tài khoản nào dùng địa chỉ này"
    biến nó thành công cụ kiểm tra hàng loạt: ai đã đăng ký, ai chưa.

    Câu trả lời ở đây cố ý MƠ HỒ và giống hệt nhau cho cả hai trường hợp. Người dùng thật vẫn
    đi tiếp được vì họ có mã trong hộp thư; người dò thì không rút ra được thông tin gì.

    Đây là ĐÁNH ĐỔI có ý thức: người gõ nhầm địa chỉ sẽ ngồi chờ một lá thư không tới. Dòng
    hướng dẫn ở màn hình nhập mã có hiện lại địa chỉ vừa gõ để họ tự phát hiện.
  */
  if (mode === 'forgotPassword' && (error.code === 'user.user_not_exist' || error.status === 404)) {
    return 'If an account exists for this address, a verification code has been sent. Please check your inbox.';
  }

  if (error.code === 'user.email_already_in_use') {
    return 'An account already exists for this email address. Try signing in instead.';
  }

  if (error.code === 'user.username_already_in_use') {
    return 'That username is taken. Please choose another one.';
  }

  // Mã sai hoặc hết hạn — nói rõ để người dùng biết là bấm "Gửi lại mã", chứ không phải
  // quay lại sửa địa chỉ thư.
  if (error.code?.startsWith('verification_code.')) {
    return 'That verification code is wrong or has expired. Press "Resend code" to get a new one.';
  }

  if (error.code.startsWith('password.')) {
    // Thông điệp về độ mạnh mật khẩu đến từ chính sách của Logto — hiện nguyên văn, vì nó
    // nói cụ thể cần sửa gì.
    return error.message;
  }

  if (error.status === 429) {
    return 'Too many attempts. Please wait a moment and try again.';
  }

  return error.message;
}

/* ── Dựng DOM ───────────────────────────────────────────────────────────────── */

/**
 * Tạo phần tử.
 *
 * Chữ luôn đi qua `textContent`, KHÔNG BAO GIỜ qua `innerHTML`. Thông điệp lỗi đến từ máy
 * chủ, và `innerHTML` sẽ biến một thông điệp chứa thẻ thành mã chạy được ngay trên trang
 * đăng nhập.
 */
function el(tag, props, children) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props || {})) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value !== undefined && value !== null) node.setAttribute(key, value);
  }

  for (const child of children || []) {
    if (child) node.append(child);
  }

  return node;
}

function icon(paths, size) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('aria-hidden', 'true');

  for (const d of paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }

  return svg;
}

function googleButton(showError) {
  if (!googleConnector) {
    return [
      el('button', { type: 'button', class: 'typeBody socialButton', disabled: '' }, [
        googleIcon(),
        el('span', { text: 'Continue with Google' }),
      ]),
      el('p', {
        class: 'typeCaption textTertiary socialNote',
        text: 'The Google connector is not configured',
      }),
    ];
  }

  const button = el('button', { type: 'button', class: 'typeBody socialButton' }, [
    googleIcon(),
    el('span', { text: 'Continue with Google' }),
  ]);

  button.addEventListener('click', async () => {
    // Khoá nút trước khi gọi: một cú bấm đúp tạo hai phiên tương tác, cái sau đè cái trước.
    button.disabled = true;
    try {
      await startGoogleSignIn(googleConnector);
      // Không mở khoá nút: trang đang rời sang Google.
    } catch (error) {
      button.disabled = false;
      const message =
        error instanceof ExperienceError
          ? 'Could not open Google sign-in. Please try again.'
          : 'Could not reach the server. Check your connection and try again.';
      if (showError) showError(message);
    }
  });

  return [button];
}

/**
 * Logo Google — vẽ nội tuyến, KHÔNG tải từ máy chủ của Google.
 *
 * Tải từ ngoài sẽ gửi IP của người dùng sang Google ngay tại trang đăng nhập. Bốn màu là
 * cố định theo quy định nhận diện của Google, nên KHÔNG dùng `currentColor`.
 */
function googleIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('aria-hidden', 'true');

  const parts = [
    [
      '#4285F4',
      'M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.1Z',
    ],
    [
      '#34A853',
      'M24 46c5.9 0 10.9-2 14.5-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.6-3.9-12.3-9.1H4.3v5.7C7.9 41.1 15.4 46 24 46Z',
    ],
    [
      '#FBBC05',
      'M11.7 28.1c-.4-1.3-.7-2.7-.7-4.1s.3-2.8.7-4.1v-5.7H4.3A22 22 0 0 0 2 24c0 3.6.9 6.9 2.3 9.8l7.4-5.7Z',
    ],
    [
      '#EA4335',
      'M24 10.8c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.3 29.9 2 24 2 15.4 2 7.9 6.9 4.3 14.2l7.4 5.7c1.7-5.2 6.6-9.1 12.3-9.1Z',
    ],
  ];

  for (const [fill, d] of parts) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill', fill);
    path.setAttribute('d', d);
    svg.append(path);
  }

  return svg;
}

/** Chỉ dùng địa chỉ web app khi đó là URL HTTP(S) tuyệt đối. */
function configuredAppUrl() {
  const value = window.TALOSMINE_APP_URL;
  if (typeof value !== 'string' || value === '') return null;

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/** Header chung của khung xác thực: thương hiệu bên trái, lối về ứng dụng bên phải. */
function formHeader() {
  const appUrl = configuredAppUrl();
  const brand = appUrl
    ? el('a', { class: 'typeBody brandLink', href: appUrl, text: BRAND_NAME })
    : el('span', { class: 'typeBody brandLabel', text: BRAND_NAME });
  const home = appUrl
    ? el('a', { class: 'typeBodySmall backLink', href: appUrl }, [
        icon(['M19 12H5', 'm12 19-7-7 7-7'], 16),
        el('span', { text: 'Back to home' }),
      ])
    : null;

  return el('header', { class: 'formHeader' }, [brand, home]);
}

/**
 * Link tới văn bản pháp lý trên web app (`/terms`, `/privacy` — nội dung soạn trong
 * `/admin/content/pages`).
 *
 * MỞ TAB MỚI có chủ đích: người dùng đang điền dở form đăng ký; điều hướng cùng tab sẽ xoá
 * những gì họ vừa gõ. `rel="noopener"` để trang mở ra không cầm được `window.opener` của
 * trang đăng nhập.
 *
 * Chưa cấu hình APP_URL thì rơi về chữ nhấn không bấm được — một link 404 ngay chỗ người
 * dùng đang cam kết điều gì đó thì tệ hơn hẳn một dòng chữ.
 */
function legalLink(label, path) {
  const appUrl = configuredAppUrl();
  if (!appUrl) return el('span', { class: 'accent', text: label });

  // KHÔNG mang class `accent`: chữ gradient là cho từ nhấn trang trí; link pháp lý dùng màu
  // đặc (chủ dự án chốt 2026-07-29) — `.legalLink` tự lo màu và độ đậm của nó.
  return el('a', {
    class: 'legalLink',
    href: appUrl + path,
    target: '_blank',
    rel: 'noopener',
    text: label,
  });
}

/** Ô mật khẩu có nút hiện/ẩn. Nút làm thật — một nút không làm gì là nói dối người dùng. */
function passwordField(id, label, hint) {
  const input = el('input', {
    id,
    class: 'typeBody input',
    type: 'password',
    name: 'password',
    // `new-password` cho MỌI ô đặt mật khẩu mới, kể cả ô nhập lại. Đặt `current-password`
    // cho ô nhập lại thì trình quản lý mật khẩu điền mật khẩu CŨ vào đó, và người dùng bị
    // báo "hai lần nhập chưa khớp" mà không hiểu vì sao.
    autocomplete: id.startsWith('password-') ? 'new-password' : 'current-password',
    required: '',
  });

  const toggle = el('button', {
    type: 'button',
    class: 'inputToggle',
    'aria-label': 'Show password',
    'aria-pressed': 'false',
  });

  const eye = icon(
    ['M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z', 'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z'],
    18,
  );
  const eyeOff = icon(
    ['M2 12s3.5-6 10-6c2 0 3.7.6 5.1 1.4M22 12s-3.5 6-10 6c-2 0-3.7-.6-5.1-1.4', 'm4 4 16 16'],
    18,
  );

  toggle.append(eye);
  toggle.addEventListener('click', () => {
    const visible = input.type === 'text';
    input.type = visible ? 'password' : 'text';
    toggle.setAttribute('aria-pressed', String(!visible));
    toggle.setAttribute('aria-label', visible ? 'Show password' : 'Hide password');
    toggle.replaceChildren(visible ? eye : eyeOff);
  });

  return {
    input,
    node: el('div', { class: 'field' }, [
      el('label', { class: 'typeBodySmall', for: id, text: label }),
      el('div', { class: 'inputWrap' }, [input, toggle]),
      hint ? el('p', { class: 'typeCaption textTertiary', text: hint }) : null,
    ]),
  };
}

/**
 * Ô nhập chữ có nhãn.
 *
 * `autocomplete` phải ĐÚNG CHUẨN (`username`, `given-name`, `family-name`) thì trình duyệt
 * và trình quản lý mật khẩu mới điền hộ được. Đặt sai thì ô nào cũng nhận nhầm dữ liệu, và
 * người dùng phải xoá đi gõ lại mỗi lần.
 *
 * `required` chỉ đặt cho ô bắt buộc: tên và họ là tuỳ chọn.
 */
function textField(id, label, placeholder, hint, autocomplete, required, type = 'text') {
  const input = el('input', {
    id,
    class: 'typeBody input',
    // `type="email"` bật bàn phím có `@` trên di động và cảnh báo sớm của trình duyệt.
    // KHÔNG thay cho kiểm tra ở máy chủ — nó chỉ giúp người dùng gõ đỡ vất vả.
    type,
    name: id,
    placeholder,
    autocomplete,
    autocapitalize: 'none',
    autocorrect: 'off',
    spellcheck: 'false',
    ...(required ? { required: '' } : {}),
  });

  return {
    input,
    node: el('div', { class: 'field' }, [
      el('label', { class: 'typeBodySmall', for: id, text: label }),
      input,
      hint ? el('p', { class: 'typeCaption textTertiary', text: hint }) : null,
    ]),
  };
}

/**
 * Dòng "Quên mật khẩu?".
 *
 * Đã có connector thư nên luồng khôi phục của Logto hoạt động được. Đây là link THẬT tới
 * màn hình của Logto, không còn là chữ chết như trước.
 */
function forgotPasswordRow() {
  return el('p', { class: 'typeBodySmall forgotRow' }, [
    el('a', { class: 'switchLink', href: ROUTES.forgotPassword, text: 'Forgot your password?' }),
  ]);
}

/**
 * Màn hình nhập mã xác minh — DÙNG CHUNG cho đăng ký và khôi phục mật khẩu.
 *
 * Hai luồng cùng cần đúng một thứ: một ô mã, một nút gửi lại, một đường lùi. Chép thành hai
 * bản là cách chắc chắn để sau này sửa lỗi ở một bên rồi quên bên kia — nên phần khác nhau
 * (chữ hiển thị, việc làm khi gửi) đi vào tham số.
 *
 * Trả về MẢNG phần tử chứ không phải một khối bọc, để nó thay thẳng nội dung `.formArea` và
 * giữ nguyên bố cục cột như màn hình trước.
 */
function codeStep({ pending, errorBox, showError, onBack, mode, labels, sendCode, onSubmit }) {
  const code = el('input', {
    id: 'verification-code',
    class: 'typeBody input',
    // `inputmode="numeric"` bật bàn phím số trên di động; `autocomplete="one-time-code"` cho
    // phép iOS/Android gợi ý mã vừa nhận được trong tin nhắn hoặc thư.
    type: 'text',
    inputmode: 'numeric',
    autocomplete: 'one-time-code',
    maxlength: '6',
    placeholder: '••••••',
    required: '',
  });

  const submit = el('button', {
    type: 'submit',
    class: 'typeBody submitButton',
    text: labels.submit,
  });

  const resend = el('button', {
    type: 'button',
    class: 'typeBodySmall linkButton',
    text: 'Resend code',
  });

  resend.addEventListener('click', async () => {
    resend.disabled = true;
    resend.textContent = 'Sending…';
    errorBox.hidden = true;
    try {
      // Gửi lại tạo ra một `verificationId` MỚI. Giữ cái cũ thì mã mới sẽ bị coi là sai.
      pending.verificationId = await sendCode(pending.email);
      resend.textContent = 'Code resent';
    } catch (error) {
      showError(describeError(error, mode));
      resend.textContent = 'Resend code';
    } finally {
      resend.disabled = false;
    }
  });

  const form = el(
    'form',
    {
      class: 'form',
      novalidate: '',
      onSubmit: async (event) => {
        event.preventDefault();
        if (submit.disabled) return;

        const value = code.value.trim();
        if (value === '') {
          showError('Enter the verification code you just received.');
          return;
        }

        submit.disabled = true;
        submit.textContent = labels.pending;
        errorBox.hidden = true;

        try {
          await onSubmit(value);
        } catch (error) {
          showError(describeError(error, mode));
          submit.disabled = false;
          submit.textContent = labels.submit;
        }
      },
    },
    [
      el('div', { class: 'field' }, [
        el('label', {
          class: 'typeBodySmall',
          for: 'verification-code',
          text: 'Verification code',
        }),
        code,
      ]),
      submit,
    ],
  );

  // Đưa con trỏ vào ô mã ngay: người dùng vừa chuyển từ hộp thư sang, việc duy nhất họ cần
  // làm là dán mã vào.
  queueMicrotask(() => code.focus());

  return [
    el('h1', { class: 'typeH2', text: 'Check your inbox' }),
    el('p', { class: 'typeBodySmall textSecondary lead' }, [
      document.createTextNode('We sent a verification code to '),
      // Hiện lại địa chỉ để người dùng phát hiện ngay nếu vừa gõ nhầm, thay vì ngồi chờ một
      // thư không bao giờ tới.
      el('span', { class: 'accent', text: pending.email }),
    ]),
    errorBox,
    form,
    el('p', { class: 'typeBodySmall textSecondary switchRow' }, [
      el('span', { text: 'Did not get the email? ' }),
      resend,
    ]),
    el('p', { class: 'typeBodySmall switchRow' }, [
      el('button', {
        type: 'button',
        class: 'typeBodySmall linkButton',
        text: labels.back,
        onClick: onBack,
      }),
    ]),
  ];
}

/**
 * Dựng một màn hình xác thực.
 *
 * Hai màn hình khác nhau đủ ít để dùng chung một hàm: khác tiêu đề, khác chữ, khác hàm gọi
 * API. Tách thành hai bản sao sẽ dẫn tới việc sửa một bên quên bên kia.
 */
function authScreen(config) {
  const isRegister = config.mode === 'register';

  const errorBox = el('div', { class: 'error', role: 'alert', tabindex: '-1' }, []);
  errorBox.hidden = true;

  // KHÔNG placeholder ở Tên/Họ/Email (chủ dự án yêu cầu 2026-07-28): tên riêng làm ví dụ
  // trông như form đã điền sẵn, và nhãn đã nói đủ ô này nhận gì.
  const givenName = isRegister
    ? textField('given-name', 'First name', undefined, undefined, 'given-name', false)
    : null;
  const familyName = isRegister
    ? textField('family-name', 'Last name', undefined, undefined, 'family-name', false)
    : null;

  /*
    ĐĂNG KÝ chỉ nhận ĐỊA CHỈ THƯ; ĐĂNG NHẬP nhận cả hai.

    Khớp đúng cấu hình Logto do `infra/scripts/configure-logto-sign-in.mjs` đặt:
      signUp.identifiers  = ['email']
      signIn.methods      = email + username

    Vì sao đăng nhập vẫn nhận tên đăng nhập: các tài khoản tạo trước khi bật email chỉ có
    username và cột email rỗng. Bỏ nó đi là khoá họ ra ngoài — trong đó có tài khoản quản trị.

    Nhãn phải nói đúng thứ ô đó nhận. Ghi "Email" cho một ô cũng nhận username, hay ngược
    lại, đều khiến người dùng gõ sai rồi không hiểu vì sao.
  */
  const identifier = isRegister
    ? textField(
        'email',
        'Email address',
        undefined,
        'We will send a verification code to this address.',
        'email',
        true,
        'email',
      )
    : // KHÔNG có placeholder. Ô này nhận CẢ tên đăng nhập LẪN địa chỉ thư, nên mọi ví dụ đặt
      // vào đây đều gợi ý sai một nửa: thấy `ten_dang_nhap` thì người có email tưởng phải
      // tạo username, thấy `ban@vidu.com` thì người dùng username tưởng mình không vào được.
      // Nhãn đã nói đủ.
      textField('username', 'Username or email address', undefined, undefined, 'username', true);

  const password = passwordField(
    isRegister ? 'password-new' : 'password',
    'Password',
    isRegister ? 'At least 8 characters' : undefined,
  );

  const consentInput = isRegister
    ? // `required` là THẬT, không phải trang trí. Đây là ràng buộc pháp lý và nó phải đúng
      // ngay cả khi hai văn bản kia chưa được soạn.
      el('input', { type: 'checkbox', name: 'consent', required: '' })
    : null;

  const consent = isRegister
    ? el('label', { class: 'typeBodySmall textSecondary consentRow' }, [
        consentInput,
        el('span', {}, [
          document.createTextNode('I agree to the '),
          legalLink('Terms of Service', '/terms'),
          document.createTextNode(' and '),
          legalLink('Privacy Policy', '/privacy'),
        ]),
      ])
    : null;

  const submit = el('button', {
    type: 'submit',
    class: 'typeBody submitButton',
    text: config.submitLabel,
  });

  function showError(message) {
    errorBox.replaceChildren(el('p', { class: 'typeBodySmall', text: message }));
    errorBox.hidden = false;
    // Đưa focus về khối lỗi để trình đọc màn hình đọc nó ngay, thay vì để người dùng tự
    // đi tìm xem có gì thay đổi.
    errorBox.focus();
  }

  const form = el(
    'form',
    {
      class: 'form',
      // `novalidate` để dùng thông điệp lỗi tiếng Việt của mình thay vì bong bóng mặc định
      // của trình duyệt (ngôn ngữ theo hệ điều hành, không theo trang).
      novalidate: '',
      onSubmit: async (event) => {
        event.preventDefault();
        if (submit.disabled) return;

        const identifierValue = identifier.input.value.trim();
        const passwordValue = password.input.value;

        if (identifierValue === '' || passwordValue === '') {
          showError(
            isRegister
              ? 'Enter both your email address and password.'
              : 'Enter both your username (or email address) and password.',
          );
          return;
        }

        if (isRegister && !EMAIL_PATTERN.test(identifierValue)) {
          showError('That email address is not valid.');
          return;
        }

        if (isRegister && passwordValue.length < 8) {
          // Máy chủ cũng kiểm, nhưng bắt sớm ở đây thì người dùng không phải chờ hết một
          // vòng gửi mã rồi mới biết mật khẩu chưa đạt.
          showError('Your password needs at least 8 characters.');
          return;
        }

        if (isRegister && !consentInput.checked) {
          showError('You need to accept the Terms of Service and Privacy Policy to continue.');
          return;
        }

        // Khoá nút TRƯỚC khi gọi: không có bước này thì một cú bấm đúp gửi hai request, và
        // với luồng đăng ký sẽ là hai lần tạo tài khoản chạy song song.
        submit.disabled = true;
        submit.textContent = config.pendingLabel;
        errorBox.hidden = true;

        try {
          if (isRegister) {
            // Đăng ký DỪNG ở đây: chỉ mới gửi mã. Việc tạo tài khoản nằm ở màn hình sau.
            const verificationId = await sendRegistrationCode(identifierValue);
            showCodeStep({
              email: identifierValue,
              password: passwordValue,
              verificationId,
              profile: {
                givenName: givenName.input.value.trim(),
                familyName: familyName.input.value.trim(),
              },
            });
            return;
          }

          const redirectTo = await signIn(identifierValue, passwordValue);
          // `replace` chứ không `assign`: người dùng bấm Back sẽ không quay lại trang đăng
          // nhập đã dùng xong.
          window.location.replace(redirectTo);
        } catch (error) {
          showError(describeError(error, config.mode));
          submit.disabled = false;
          submit.textContent = config.submitLabel;
        }
      },
    },
    [
      isRegister ? el('div', { class: 'nameRow' }, [givenName.node, familyName.node]) : null,
      identifier.node,
      password.node,
      consent,
      submit,
    ],
  );

  const formArea = el('div', { class: 'formArea' }, [
    el('h1', { class: 'typeH2 authTitle', text: config.title }),
    el('p', { class: 'typeBodySmall textSecondary lead authLead', text: config.lead }),
    errorBox,
    ...googleButton(showError),
    el('div', { class: 'divider' }, [
      el('span', { class: 'typeBodySmall textTertiary', text: config.dividerLabel }),
    ]),
    form,
    isRegister ? null : forgotPasswordRow(),
    el('p', { class: 'typeBodySmall textSecondary switchRow' }, [
      el('span', { text: `${config.switchPrompt} ` }),
      el('a', { class: 'switchLink', href: config.switchHref, text: config.switchLabel }),
    ]),
  ]);

  /**
   * Đổi sang màn hình nhập mã xác minh — THAY NỘI DUNG, KHÔNG chuyển trang.
   *
   * Phải làm vậy: phiên tương tác đang mở nằm trong cookie phía máy chủ, và mã vừa gửi gắn
   * với chính phiên đó. Chuyển sang một URL khác sẽ khởi tạo lại phiên và mã trở thành vô
   * dụng — người dùng nhận thư, gõ mã đúng, và bị báo sai.
   */
  function showCodeStep(pending) {
    formArea.replaceChildren(
      ...codeStep({
        pending,
        errorBox,
        showError,
        mode: 'register',
        labels: {
          submit: 'Verify and create account',
          pending: 'Creating your account…',
          back: '← Use a different email',
        },
        sendCode: sendRegistrationCode,
        onSubmit: async (value) => {
          const redirectTo = await completeRegistration({ ...pending, code: value });
          window.location.replace(redirectTo);
        },
        onBack: () => {
          // Quay lại biểu mẫu: dựng LẠI cả màn hình thay vì khôi phục trạng thái cũ, vì
          // phiên tương tác ở máy chủ cũng phải bắt đầu lại từ đầu.
          document.getElementById('root').replaceChildren(authScreen(config));
        },
      }),
    );
  }

  return el('div', { class: 'page' }, [
    el('main', { class: 'formPanel' }, [formHeader(), formArea]),
  ]);
}

/**
 * Màn hình quên mật khẩu — BA BƯỚC trong CÙNG MỘT TRANG.
 *
 * Không chuyển URL giữa các bước, cùng lý do với màn hình nhập mã của đăng ký: phiên tương
 * tác nằm trong cookie phía máy chủ và gắn với `interactionEvent: 'ForgotPassword'` do bước 1
 * đặt. Điều hướng sang địa chỉ khác sẽ khởi tạo lại phiên, và mã người dùng vừa nhận được
 * trở thành vô dụng dù họ gõ đúng.
 *
 *   1. nhập địa chỉ thư   → gửi mã
 *   2. nhập mã            → xác minh + định danh
 *   3. đặt mật khẩu mới   → ghi và kết thúc
 */
function forgotPasswordScreen() {
  const errorBox = el('div', { class: 'error', role: 'alert', tabindex: '-1' }, []);
  errorBox.hidden = true;

  function showError(message) {
    errorBox.replaceChildren(el('p', { class: 'typeBodySmall', text: message }));
    errorBox.hidden = false;
    errorBox.focus();
  }

  const formArea = el('div', { class: 'formArea' }, []);

  /* ── Bước 1: địa chỉ thư ─────────────────────────────────────────────────── */
  function showEmailStep(prefill) {
    const email = textField(
      'email',
      'Email address',
      'ban@vidu.com',
      'We will send a verification code to this address.',
      'email',
      true,
      'email',
    );
    email.input.value = prefill || '';

    const submit = el('button', {
      type: 'submit',
      class: 'typeBody submitButton',
      text: 'Send verification code',
    });

    const form = el(
      'form',
      {
        class: 'form',
        novalidate: '',
        onSubmit: async (event) => {
          event.preventDefault();
          if (submit.disabled) return;

          const value = email.input.value.trim().toLowerCase();
          if (value === '') {
            showError('Enter the email address for your account.');
            return;
          }
          if (!EMAIL_PATTERN.test(value)) {
            showError('That email address is not valid.');
            return;
          }

          submit.disabled = true;
          submit.textContent = 'Sending…';
          errorBox.hidden = true;

          try {
            const verificationId = await sendPasswordResetCode(value);
            showCodeStep({ email: value, verificationId });
          } catch (error) {
            showError(describeError(error, 'forgotPassword'));
            submit.disabled = false;
            submit.textContent = 'Send verification code';
          }
        },
      },
      [email.node, submit],
    );

    formArea.replaceChildren(
      el('h1', { class: 'typeH2', text: 'Forgot password' }),
      el('p', {
        class: 'typeBodySmall textSecondary lead',
        text: 'Enter the email address for your account. We will send you a code to reset your password.',
      }),
      errorBox,
      form,
      el('p', { class: 'typeBodySmall switchRow' }, [
        el('a', { class: 'switchLink', href: ROUTES.signIn, text: '← Back to sign in' }),
      ]),
    );
  }

  /* ── Bước 2: mã xác minh ─────────────────────────────────────────────────── */
  function showCodeStep(pending) {
    formArea.replaceChildren(
      ...codeStep({
        pending,
        errorBox,
        showError,
        mode: 'forgotPassword',
        labels: {
          submit: 'Verify code',
          pending: 'Verifying…',
          back: '← Use a different email',
        },
        sendCode: sendPasswordResetCode,
        onSubmit: async (value) => {
          await verifyPasswordResetCode({ ...pending, code: value });
          showPasswordStep(pending.email);
        },
        // Đổi địa chỉ thư = làm lại từ đầu, kể cả ở phía máy chủ: bước 1 sẽ gọi lại
        // `PUT /api/experience` và đặt lại phiên tương tác.
        onBack: () => showEmailStep(pending.email),
      }),
    );
  }

  /* ── Bước 3: mật khẩu mới ────────────────────────────────────────────────── */
  function showPasswordStep(email) {
    const password = passwordField('password-new', 'New password', 'At least 8 characters');
    const confirm = passwordField('password-confirm', 'Confirm new password');

    const submit = el('button', {
      type: 'submit',
      class: 'typeBody submitButton',
      text: 'Reset password',
    });

    const form = el(
      'form',
      {
        class: 'form',
        novalidate: '',
        onSubmit: async (event) => {
          event.preventDefault();
          if (submit.disabled) return;

          const value = password.input.value;

          if (value.length < 8) {
            showError('Your password needs at least 8 characters.');
            return;
          }

          /*
            Ô nhập lại là THẬT SỰ CẦN ở màn hình này, khác với lúc đăng ký.
            Gõ sai mật khẩu lúc đăng ký thì người dùng phát hiện ngay ở lần đăng nhập kế tiếp
            và vẫn còn đường khôi phục. Gõ sai ở ĐÂY thì đường khôi phục vừa dùng xong: mã đã
            tiêu, và họ bị khoá ra khỏi tài khoản cho tới khi xin mã mới.
          */
          if (value !== confirm.input.value) {
            showError('The two passwords do not match.');
            return;
          }

          submit.disabled = true;
          submit.textContent = 'Resetting…';
          errorBox.hidden = true;

          try {
            const redirectTo = await resetPassword(value);

            // Bản Logto hiện tại trả 204 nên `redirectTo` là `undefined` — xem `resetPassword`.
            // Nhánh chuyển hướng giữ lại phòng khi bản sau đổi hành vi.
            if (redirectTo) {
              window.location.replace(redirectTo);
              return;
            }

            showDoneStep(email);
          } catch (error) {
            showError(describeError(error, 'forgotPassword'));
            submit.disabled = false;
            submit.textContent = 'Reset password';
          }
        },
      },
      [password.node, confirm.node, submit],
    );

    queueMicrotask(() => password.input.focus());

    formArea.replaceChildren(
      el('h1', { class: 'typeH2', text: 'Set a new password' }),
      el('p', { class: 'typeBodySmall textSecondary lead' }, [
        document.createTextNode('New password for '),
        el('span', { class: 'accent', text: email }),
      ]),
      errorBox,
      form,
    );
  }

  /* ── Bước 4: báo đã xong ─────────────────────────────────────────────────── */
  /*
   * Màn hình này BẮT BUỘC PHẢI CÓ, không phải trang trí.
   *
   * `submit` trả 204 và không đăng nhập người dùng vào, nên không có chuyển hướng nào tự xảy
   * ra. Thiếu màn hình này thì biểu mẫu đứng im sau khi bấm, và người dùng không có cách nào
   * biết mật khẩu đã đổi hay chưa — họ sẽ bấm lại, hoặc bỏ đi rồi thử đăng nhập bằng mật khẩu
   * cũ.
   *
   * Đường đi tiếp là `ROUTES.signIn` chứ không phải web app: phiên tương tác OIDC vẫn đang mở,
   * nên `/sign-in` dựng lại được màn hình đăng nhập ngay trong phiên đó.
   */
  function showDoneStep(email) {
    formArea.replaceChildren(
      el('h1', { class: 'typeH2', text: 'Password changed' }),
      el('p', { class: 'typeBodySmall textSecondary lead' }, [
        document.createTextNode('The password for '),
        el('span', { class: 'accent', text: email }),
        document.createTextNode(' has been reset. Sign in with the new password to continue.'),
      ]),
      el('a', { class: 'typeBody submitButton doneLink', href: ROUTES.signIn, text: 'Sign in' }),
    );
  }

  showEmailStep('');

  return el('div', { class: 'page' }, [
    el('main', { class: 'formPanel' }, [formHeader(), formArea]),
  ]);
}

/**
 * Màn hình cho `/unknown-session`.
 *
 * TÁCH RIÊNG khỏi màn hình dự phòng, vì hai tình huống khác hẳn nhau và gộp lại thì thông
 * điệp thành sai. Màn hình dự phòng nói "chưa dựng" — nhưng `/sign-in` ĐÃ dựng; thứ thiếu là
 * phiên tương tác. Nói nhầm ở đây khiến người đọc đi tìm lỗi trong giao diện, trong khi việc
 * cần làm chỉ là vào bằng đúng cửa.
 */
function unknownSessionScreen() {
  const appUrl = configuredAppUrl();

  return el('div', { class: 'page' }, [
    el('main', { class: 'formPanel' }, [
      formHeader(),
      el('div', { class: 'formArea' }, [
        el('h1', { class: 'typeH2', text: 'Your sign-in session has expired' }),
        el('p', {
          class: 'typeBodySmall textSecondary lead',
          text:
            'The sign-in page has to be opened from Kolo itself. Opening this address directly, or leaving the tab ' +
            'open for too long, means the session is gone — so we do not know what you are signing in to.',
        }),
        // Chỉ hiện nút khi biết địa chỉ web app. Đoán bừa một địa chỉ ở trang đăng nhập là
        // đúng cái dấu hiệu của lừa đảo mà người dùng được dạy phải cảnh giác.
        appUrl === null
          ? el('p', {
              class: 'typeBodySmall textTertiary',
              text: 'Go back to Kolo and press Sign in to start again.',
            })
          : el('a', {
              class: 'typeBody submitButton doneLink',
              href: `${appUrl}/auth`,
              text: 'Start again from Kolo',
            }),
      ]),
    ]),
  ]);
}

/**
 * Màn hình Google đưa người dùng VỀ — xử lý phần còn lại của luồng rồi chuyển tiếp.
 *
 * Chạy tại `/callback/<connectorId>`. Không có ô nhập nào: nó đọc `code` + `state` từ URL,
 * đối chiếu `state`, đổi lấy phiên, rồi đi tới `redirectTo`. Người dùng chỉ thấy một dòng
 * "đang hoàn tất" thoáng qua — trừ khi có lỗi thì dừng lại và nói rõ.
 */
function socialCallbackScreen() {
  const formArea = el('div', { class: 'formArea' }, [
    el('h1', { class: 'typeH2', text: 'Finishing sign-in…' }),
    el('p', {
      class: 'typeBodySmall textSecondary lead',
      text: 'Verifying with Google, one moment please.',
    }),
  ]);

  function fail(message) {
    formArea.replaceChildren(
      el('h1', { class: 'typeH2', text: 'Could not sign in with Google' }),
      el('p', { class: 'typeBodySmall textSecondary lead', text: message }),
      el('a', { class: 'typeBody submitButton doneLink', href: ROUTES.signIn, text: 'Try again' }),
    );
  }

  (async () => {
    const params = new URLSearchParams(window.location.search);
    const raw = sessionStorage.getItem(SOCIAL_STORAGE_KEY);
    // Dùng MỘT LẦN: xoá ngay để một lần quay về không thể phát lại (và tab cũ không dùng lại).
    sessionStorage.removeItem(SOCIAL_STORAGE_KEY);

    // Google trả `error` khi người dùng bấm Huỷ hoặc từ chối cấp quyền.
    if (params.get('error')) {
      fail(
        'You cancelled, or Google declined the request. You can try again or sign in with a password.',
      );
      return;
    }

    let pending = null;
    try {
      pending = raw ? JSON.parse(raw) : null;
    } catch {
      pending = null;
    }

    const code = params.get('code');
    const state = params.get('state');

    if (!pending || !code || !state) {
      fail(
        'The Google sign-in session expired or was incomplete. Start again from the sign-in page.',
      );
      return;
    }

    // CHỐT CHẶN CSRF: state trả về phải khớp state đã gửi đi. Khác nghĩa là phản hồi này
    // không thuộc phiên ta khởi tạo — dừng, không đổi lấy phiên.
    if (state !== pending.state) {
      fail(
        'The response from Google did not match this sign-in session. Stopped for safety — please try again.',
      );
      return;
    }

    try {
      const redirectTo = await completeGoogleSignIn({
        connectorId: pending.connectorId,
        code,
        redirectUri: pending.redirectUri,
        verificationId: pending.verificationId,
      });
      window.location.replace(redirectTo);
    } catch (error) {
      // Ghi lỗi thật (kèm code) cho người vận hành; hiện cho người dùng câu ngắn gọn.
      console.error('Google sign-in failed:', error);
      let message = 'Could not complete Google sign-in. Please try again.';
      if (error instanceof ExperienceError) {
        if (error.status === 403) {
          message = 'Google sign-in is not enabled for this application.';
        } else if (error.code === 'user.missing_profile') {
          // Tài khoản Google mới nhưng Logto còn đòi thêm hồ sơ để đăng ký. Nói rõ để người
          // vận hành biết cần chỉnh cấu hình đăng ký, không phải lỗi phía người dùng.
          message =
            'That Google account is missing information required to register. Contact an administrator.';
        } else if (error.code === 'user.identity_already_in_use') {
          message = 'This Google account is already linked to a different user.';
        }
        // Kèm mã lỗi vào console để gỡ nhanh; audit log của Logto (`/api/logs`) giữ chi tiết đầy đủ.
        console.error('  code:', error.code, '| status:', error.status);
      }
      fail(message);
    }
  })();

  return el('div', { class: 'page' }, [
    el('main', { class: 'formPanel' }, [formHeader(), formArea]),
  ]);
}

/**
 * Màn hình dự phòng cho mọi đường dẫn chưa dựng.
 *
 * Nói thẳng là chưa hỗ trợ, thay vì để trang trắng. Trang trắng khiến người dùng bấm lại
 * nhiều lần và khiến người vận hành mất nửa ngày để hiểu chuyện gì.
 */
function fallbackScreen(pathname) {
  return el('div', { class: 'page' }, [
    el('main', { class: 'formPanel' }, [
      formHeader(),
      el('div', { class: 'formArea' }, [
        el('h1', { class: 'typeH2', text: 'This screen has not been built' }),
        el('p', {
          class: 'typeBodySmall textSecondary lead',
          text: `The custom Kolo experience only implements the sign-in and sign-up screens. The path "${pathname}" needs a screen that does not exist yet.`,
        }),
        el('p', { class: 'typeBodySmall switchRow' }, [
          el('a', { class: 'switchLink', href: ROUTES.signIn, text: 'Back to sign in' }),
        ]),
      ]),
    ]),
  ]);
}

/* ── Khởi động ──────────────────────────────────────────────────────────────── */

function render() {
  const root = document.getElementById('root');
  const pathname = window.location.pathname;

  let screen;

  if (pathname.startsWith(ROUTES.socialCallback)) {
    document.title = 'Kolo — Signing in';
    screen = socialCallbackScreen();
  } else if (pathname.startsWith(ROUTES.unknownSession)) {
    document.title = 'Kolo — Sign-in session expired';
    screen = unknownSessionScreen();
  } else if (pathname.startsWith(ROUTES.register)) {
    document.title = 'Kolo — Create account';
    screen = authScreen({
      mode: 'register',
      title: 'Create account',
      lead: 'Join Kolo to save tools, build collections and keep up with the latest updates.',
      // Nhãn phải nói đúng thứ ô bên dưới nhận. Trước đây ghi "hoặc dùng tên đăng nhập" —
      // đúng khi đăng ký còn dùng username, và SAI kể từ lúc chuyển sang email. Đã thấy trên
      // ảnh render: vạch ngăn nói tên đăng nhập trong khi ô ngay dưới ghi "Địa chỉ thư".
      dividerLabel: 'or use your email address',
      submitLabel: 'Create account',
      pendingLabel: 'Creating…',
      switchPrompt: 'Already have an account?',
      switchHref: ROUTES.signIn,
      switchLabel: 'Sign in',
    });
  } else if (pathname.startsWith(ROUTES.forgotPassword)) {
    document.title = 'Kolo — Forgot password';
    screen = forgotPasswordScreen();
  } else if (pathname.startsWith(ROUTES.signIn)) {
    document.title = 'Kolo — Sign in';
    screen = authScreen({
      mode: 'signIn',
      title: 'Sign in',
      lead: 'Sign in to save tools, build collections and keep up with the latest updates.',
      dividerLabel: 'or',
      submitLabel: 'Sign in',
      pendingLabel: 'Signing in…',
      switchPrompt: 'Do not have an account?',
      switchHref: ROUTES.register,
      switchLabel: 'Sign up',
    });
  } else {
    screen = fallbackScreen(pathname);
  }

  root.replaceChildren(screen);
}

/**
 * Chuyển màn hình bằng điều hướng THẬT, không phải router phía client.
 *
 * Logto giữ trạng thái phiên tương tác ở phía máy chủ theo từng bước. Nhảy giữa `/sign-in`
 * và `/register` bằng `history.pushState` sẽ đổi giao diện mà không đổi trạng thái ở máy
 * chủ — rồi bước gọi API tiếp theo sẽ chạy trên một phiên tương tác sai loại.
 *
 * Vì thế các link chuyển màn hình là `<a href>` bình thường: trình duyệt tải lại trang, và
 * `PUT /api/experience` ở lần gửi tiếp theo sẽ đặt lại đúng `interactionEvent`.
 */

/**
 * Khởi động: đọc connector Google TRƯỚC rồi mới vẽ, để nút "Tiếp tục với Google" biết mình
 * nên bật hay tắt ngay từ lần vẽ đầu — không nhấp nháy từ disabled sang enabled.
 *
 * Một lượt fetch cùng origin, rất nhanh. Nếu hỏng, `googleConnector` giữ `null` và nút để
 * disabled — đăng nhập bằng mật khẩu vẫn chạy bình thường.
 */
async function bootstrap() {
  googleConnector = await fetchGoogleConnector();
  render();
}

bootstrap();
