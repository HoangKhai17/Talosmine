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
 * ⚠ FILE NÀY THAY THẾ TOÀN BỘ GIAO DIỆN CỦA LOGTO, không chỉ hai màn hình. Mọi đường dẫn
 * khác (quên mật khẩu, MFA, đăng nhập mạng xã hội, màn hình đồng ý) sẽ rơi vào nhánh dự
 * phòng ở cuối file. Hiện không đường nào trong số đó tới được, vì cấu hình Logto chỉ bật
 * username + mật khẩu. BẬT THÊM BẤT KỲ THỨ GÌ Ở LOGTO THÌ PHẢI DỰNG THÊM MÀN HÌNH Ở ĐÂY.
 */

'use strict';

/** Đường dẫn Logto dùng cho từng màn hình. */
const ROUTES = {
  signIn: '/sign-in',
  register: '/register',
};

/**
 * Quy tắc tên đăng nhập, lấy nguyên từ hợp đồng của Experience API
 * (`/api/experience/verification/new-password-identity`): bắt đầu bằng chữ cái hoặc dấu
 * gạch dưới, sau đó là chữ/số/gạch dưới.
 *
 * Chép luật ở đây KHÔNG phải để thay máy chủ kiểm — máy chủ vẫn kiểm — mà để người dùng
 * biết ngay lúc gõ thay vì gửi đi rồi nhận lỗi khó hiểu. Luật này khớp bản 1.41; nếu Logto
 * đổi, chỗ này phải đổi theo.
 */
const USERNAME_PATTERN = /^[A-Za-z_]\w*$/;

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
      data && typeof data.message === 'string' ? data.message : 'Không thực hiện được.',
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
 * Đăng ký. Khác đăng nhập ở `interactionEvent`, endpoint tạo định danh, và bước hồ sơ.
 *
 * TÊN VÀ HỌ LÀ TUỲ CHỌN, và lỗi ở bước đó KHÔNG chặn việc tạo tài khoản. Đó là đánh đổi có
 * chủ đích: mất một tên hiển thị thì sửa được sau trong trang tài khoản, còn chặn người dùng
 * tạo tài khoản vì một trường trang trí thì không sửa được — họ bỏ đi.
 *
 * Lỗi vẫn được ghi ra console để người vận hành thấy, chứ không nuốt im lặng.
 */
async function register(username, password, profile) {
  await callExperience('PUT', '/api/experience', { interactionEvent: 'Register' });

  const verification = await callExperience(
    'POST',
    '/api/experience/verification/new-password-identity',
    {
      identifier: { type: 'username', value: username },
      password,
    },
  );

  // Hồ sơ gắn TRƯỚC bước định danh: chính bước định danh mới kích hoạt việc tạo tài khoản,
  // nên mọi dữ liệu muốn đi kèm phải có mặt trước đó.
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
      console.warn('Không lưu được tên hiển thị, vẫn tiếp tục tạo tài khoản.', error);
    }
  }

  await callExperience('POST', '/api/experience/identification', {
    verificationId: verification.verificationId,
  });

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
function describeError(error, mode, identifier) {
  if (!(error instanceof ExperienceError)) {
    return 'Không kết nối được tới máy chủ. Kiểm tra đường truyền rồi thử lại.';
  }

  if (mode === 'signIn' && (error.status === 401 || error.status === 422)) {
    /**
     * Người dùng gõ một địa chỉ thư và bị từ chối.
     *
     * Nói riêng trường hợp này KHÔNG làm rò rỉ gì: câu trả lời giống hệt nhau với mọi địa
     * chỉ thư, dù nó có tồn tại hay không. Nó chỉ nói về CẤU HÌNH của hệ thống, thứ ai cũng
     * phát hiện được sau vài lần thử.
     *
     * Còn nếu để nguyên "tên đăng nhập hoặc mật khẩu không đúng", người dùng sẽ ngồi gõ lại
     * mật khẩu năm lần trong khi vấn đề nằm ở chỗ khác hẳn.
     */
    if (identifier && identifier.type === 'email') {
      return 'Hiện chỉ đăng nhập được bằng TÊN ĐĂNG NHẬP. Đăng nhập bằng địa chỉ thư chưa được bật.';
    }

    return 'Tên đăng nhập hoặc mật khẩu không đúng.';
  }

  if (error.code === 'user.username_already_in_use') {
    return 'Tên đăng nhập này đã có người dùng. Chọn tên khác giúp bạn.';
  }

  if (error.code.startsWith('password.')) {
    // Thông điệp về độ mạnh mật khẩu đến từ chính sách của Logto — hiện nguyên văn, vì nó
    // nói cụ thể cần sửa gì.
    return error.message;
  }

  if (error.status === 429) {
    return 'Bạn thử quá nhiều lần. Đợi một lát rồi thử lại.';
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

const BENEFITS = [
  {
    title: 'Lưu công cụ yêu thích',
    note: 'Mở lại bất cứ lúc nào',
    paths: ['M6 3h12v18l-6-4.5L6 21V3Z'],
  },
  {
    title: 'Tạo bộ sưu tập',
    note: 'Gom công cụ về một chỗ',
    paths: ['M3 6h6l2 2.5h10V19H3V6Z'],
  },
  {
    title: 'Gợi ý riêng cho bạn',
    note: 'Dựa trên thứ bạn đang dùng',
    paths: [
      'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18',
    ],
  },
];

/** Cột trái. Giống hệt ở cả hai màn hình, nên dựng một lần. */
function brandPanel() {
  return el('aside', { class: 'brandPanel', 'aria-label': 'Giới thiệu' }, [
    el('div', { class: 'brandContent' }, [
      el('p', { class: 'brandLogo', text: 'Talosmine' }),
      // `<p>` mang cỡ chữ tiêu đề chứ không phải thẻ heading: mỗi màn hình chỉ có MỘT tiêu
      // đề thật, nằm ở cột phải. Biến câu quảng bá thành heading sẽ làm trình đọc màn hình
      // thông báo một mục lục sai.
      // Một phần câu mang màu nhấn, theo thiết kế. Ghép bằng `createTextNode` + `<span>`
      // chứ không phải `innerHTML` — cùng lý do với `el()`: không mở đường cho HTML.
      el('p', { class: 'brandHeading' }, [
        document.createTextNode('Tìm công cụ AI tốt hơn, '),
        el('span', { class: 'accent', text: 'nhanh hơn' }),
      ]),
      el('p', {
        class: 'brandLead',
        text: 'Cùng hàng nghìn người đang tìm đúng công cụ cho công việc của mình.',
      }),
      el(
        'ul',
        { class: 'benefitList' },
        BENEFITS.map((benefit) =>
          el('li', { class: 'benefit' }, [
            el('span', { class: 'benefitIcon' }, [icon(benefit.paths, 16)]),
            el('span', { class: 'benefitText' }, [
              el('span', { class: 'benefitTitle', text: benefit.title }),
              el('span', { class: 'benefitNote', text: benefit.note }),
            ]),
          ]),
        ),
      ),
    ]),
    el('div', { class: 'brandImage', 'aria-hidden': 'true' }, [
      icon(
        [
          'M3 5.5A1.5 1.5 0 0 1 4.5 4h15A1.5 1.5 0 0 1 21 5.5v13A1.5 1.5 0 0 1 19.5 20h-15A1.5 1.5 0 0 1 3 18.5v-13Z',
          'm4 17 5-5 4 4 3-2 4 4',
        ],
        40,
      ),
    ]),
  ]);
}

/**
 * Nút "Tiếp tục với Google".
 *
 * LUÔN `disabled`: cấu hình Logto đang chạy có `socialSignIn: {}` và
 * `socialSignInConnectorTargets: []` — chưa khai báo connector Google nào. Nút giữ đúng chỗ
 * trong bố cục nhưng không giả vờ chạy được.
 */
function googleButton() {
  return [
    el('button', { type: 'button', class: 'socialButton', disabled: '' }, [
      googleIcon(),
      el('span', { text: 'Tiếp tục với Google' }),
    ]),
    el('p', { class: 'socialNote', text: 'Chưa cấu hình connector Google' }),
  ];
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

/**
 * Link "Về trang chủ" ở góc trên phải.
 *
 * TỰ ẨN khi `config.js` chưa khai địa chỉ web app. Thà thiếu một link còn hơn có một link
 * dẫn tới máy chủ sai — ở trang đăng nhập, một địa chỉ lạ chính là dấu hiệu của lừa đảo.
 */
function backLink() {
  const url = window.TALOSMINE_APP_URL;
  if (typeof url !== 'string' || url === '') return null;
  return el('a', { class: 'backLink', href: url, text: 'Về trang chủ' });
}

/** Ô mật khẩu có nút hiện/ẩn. Nút làm thật — một nút không làm gì là nói dối người dùng. */
function passwordField(id, label, hint) {
  const input = el('input', {
    id,
    class: 'input',
    type: 'password',
    name: 'password',
    autocomplete: id === 'password-new' ? 'new-password' : 'current-password',
    required: '',
  });

  const toggle = el('button', {
    type: 'button',
    class: 'inputToggle',
    'aria-label': 'Hiện mật khẩu',
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
    toggle.setAttribute('aria-label', visible ? 'Hiện mật khẩu' : 'Ẩn mật khẩu');
    toggle.replaceChildren(visible ? eye : eyeOff);
  });

  return {
    input,
    node: el('div', { class: 'field' }, [
      el('label', { class: 'label', for: id, text: label }),
      el('div', { class: 'inputWrap' }, [input, toggle]),
      hint ? el('p', { class: 'hint', text: hint }) : null,
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
function textField(id, label, placeholder, hint, autocomplete, required) {
  const input = el('input', {
    id,
    class: 'input',
    type: 'text',
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
      el('label', { class: 'label', for: id, text: label }),
      input,
      hint ? el('p', { class: 'hint', text: hint }) : null,
    ]),
  };
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

  const givenName = isRegister
    ? textField('given-name', 'Tên', 'Khải', undefined, 'given-name', false)
    : null;
  const familyName = isRegister
    ? textField('family-name', 'Họ', 'Nguyễn', undefined, 'family-name', false)
    : null;

  /*
    THIẾT KẾ GHI "Email address", NHƯNG Ô NÀY LÀ TÊN ĐĂNG NHẬP.

    Cấu hình Logto hiện tại là `signUp.identifiers: ["username"]`, và chủ dự án đã chốt giữ
    nguyên (2026-07-22). Đặt nhãn "Email" cho một ô chỉ nhận tên đăng nhập là nói dối người
    dùng ngay ở bước đầu tiên — và họ sẽ gõ email rồi không hiểu vì sao không vào được.
  */
  const username = textField(
    'username',
    'Tên đăng nhập',
    'ten_dang_nhap',
    isRegister
      ? 'Bắt đầu bằng chữ cái hoặc dấu gạch dưới; chỉ gồm chữ, số và dấu gạch dưới.'
      : undefined,
    'username',
    true,
  );

  const password = passwordField(
    isRegister ? 'password-new' : 'password',
    'Mật khẩu',
    isRegister ? 'Ít nhất 8 ký tự' : undefined,
  );

  const consentInput = isRegister
    ? // `required` là THẬT, không phải trang trí. Đây là ràng buộc pháp lý và nó phải đúng
      // ngay cả khi hai văn bản kia chưa được soạn.
      el('input', { type: 'checkbox', name: 'consent', required: '' })
    : null;

  const consent = isRegister
    ? el('label', { class: 'consentRow' }, [
        consentInput,
        el('span', {}, [
          document.createTextNode('Tôi đồng ý với '),
          // KHÔNG phải link: hai văn bản này chưa được soạn. Một link dẫn tới 404 ngay chỗ
          // người dùng đang cam kết điều gì đó thì tệ hơn hẳn một dòng chữ.
          el('span', { class: 'consentTerm', text: 'Điều khoản dịch vụ' }),
          document.createTextNode(' và '),
          el('span', { class: 'consentTerm', text: 'Chính sách riêng tư' }),
        ]),
      ])
    : null;

  const submit = el('button', { type: 'submit', class: 'submitButton', text: config.submitLabel });

  function showError(message) {
    errorBox.replaceChildren(el('p', { text: message }));
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

        const usernameValue = username.input.value.trim();
        const passwordValue = password.input.value;

        if (usernameValue === '' || passwordValue === '') {
          showError('Nhập đủ tên đăng nhập và mật khẩu.');
          return;
        }

        if (isRegister && !USERNAME_PATTERN.test(usernameValue)) {
          showError(
            'Tên đăng nhập phải bắt đầu bằng chữ cái hoặc dấu gạch dưới, và chỉ gồm chữ, số, dấu gạch dưới.',
          );
          return;
        }

        if (isRegister && !consentInput.checked) {
          showError('Cần đồng ý với Điều khoản dịch vụ và Chính sách riêng tư để tiếp tục.');
          return;
        }

        // Khoá nút TRƯỚC khi gọi: không có bước này thì một cú bấm đúp gửi hai request, và
        // với luồng đăng ký sẽ là hai lần tạo tài khoản chạy song song.
        submit.disabled = true;
        submit.textContent = config.pendingLabel;
        errorBox.hidden = true;

        try {
          const redirectTo = isRegister
            ? await register(usernameValue, passwordValue, {
                givenName: givenName.input.value.trim(),
                familyName: familyName.input.value.trim(),
              })
            : await signIn(usernameValue, passwordValue);

          // `replace` chứ không `assign`: người dùng bấm Back sẽ không quay lại trang đăng
          // nhập đã dùng xong.
          window.location.replace(redirectTo);
        } catch (error) {
          showError(describeError(error, config.mode, identifierFor(usernameValue)));
          submit.disabled = false;
          submit.textContent = config.submitLabel;
        }
      },
    },
    [
      isRegister ? el('div', { class: 'nameRow' }, [givenName.node, familyName.node]) : null,
      username.node,
      password.node,
      consent,
      submit,
    ],
  );

  return el('div', { class: 'page' }, [
    brandPanel(),
    el('div', { class: 'formPanel' }, [
      el('div', { class: 'formTop' }, [backLink()]),
      el('div', { class: 'formArea' }, [
        el('h1', { class: 'title', text: config.title }),
        el('p', { class: 'lead', text: config.lead }),
        errorBox,
        ...googleButton(),
        el('div', { class: 'divider' }, [el('span', { text: config.dividerLabel })]),
        form,
        // "Quên mật khẩu?" KHÔNG phải link: luồng khôi phục đã bị dời lại vì Logto chưa cấu
        // hình gửi thư. Một link không làm gì ở đây sẽ khiến người dùng bấm rồi ngồi chờ.
        isRegister ? null : el('p', { class: 'forgotRow', text: 'Quên mật khẩu?' }),
        el('p', { class: 'switchRow' }, [
          el('span', { text: `${config.switchPrompt} ` }),
          el('a', { class: 'switchLink', href: config.switchHref, text: config.switchLabel }),
        ]),
      ]),
    ]),
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
    brandPanel(),
    el('div', { class: 'formPanel' }, [
      el('div', { class: 'formTop' }, [backLink()]),
      el('div', { class: 'formArea' }, [
        el('h1', { class: 'title', text: 'Màn hình chưa được dựng' }),
        el('p', {
          class: 'lead',
          text: `Giao diện tuỳ chỉnh của Talosmine hiện chỉ dựng màn hình đăng nhập và đăng ký. Đường dẫn "${pathname}" cần một màn hình chưa có.`,
        }),
        el('p', { class: 'switchRow' }, [
          el('a', { class: 'switchLink', href: ROUTES.signIn, text: 'Về trang đăng nhập' }),
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

  if (pathname.startsWith(ROUTES.register)) {
    document.title = 'Talosmine — Tạo tài khoản';
    screen = authScreen({
      mode: 'register',
      title: 'Tạo tài khoản',
      lead: 'Tham gia Talosmine để lưu công cụ, tạo bộ sưu tập và theo dõi những cập nhật mới nhất.',
      // Thiết kế ghi "or use email", nhưng ô định danh ở đây là tên đăng nhập.
      dividerLabel: 'hoặc dùng tên đăng nhập',
      submitLabel: 'Tạo tài khoản',
      pendingLabel: 'Đang tạo…',
      switchPrompt: 'Đã có tài khoản?',
      switchHref: ROUTES.signIn,
      switchLabel: 'Đăng nhập',
    });
  } else if (pathname.startsWith(ROUTES.signIn)) {
    document.title = 'Talosmine — Đăng nhập';
    screen = authScreen({
      mode: 'signIn',
      title: 'Đăng nhập',
      lead: 'Đăng nhập để lưu công cụ, tạo bộ sưu tập và theo dõi những cập nhật mới nhất.',
      dividerLabel: 'hoặc',
      submitLabel: 'Đăng nhập',
      pendingLabel: 'Đang đăng nhập…',
      switchPrompt: 'Chưa có tài khoản?',
      switchHref: ROUTES.register,
      switchLabel: 'Đăng ký',
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
render();
