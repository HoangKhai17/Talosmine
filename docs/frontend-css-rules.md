# Quy tắc viết CSS — Talosmine

> **Mục đích:** mọi người (và mọi agent) viết CSS ra cùng một kiểu, tái sử dụng được,
> và không ai phải đoán "dùng giá trị nào".
>
> **Nguồn sự thật của giá trị:** quy chuẩn UI do chủ dự án cung cấp, đã mã hoá thành
> design token trong [`apps/web/app/globals.css`](../apps/web/app/globals.css).
> Sửa quy chuẩn → sửa token, **không** sửa rải rác trong component.

## 0. Chọn công nghệ và vì sao

| Quyết định | Lý do |
|---|---|
| **CSS Modules** (`*.module.css`) | Next.js hỗ trợ sẵn, class tự động scope theo component nên không đụng tên nhau. Không thêm dependency. |
| **CSS custom properties** cho token | Đổi theo breakpoint bằng media query ở một chỗ; component không cần biết đang ở màn hình nào. |
| **KHÔNG dùng Tailwind / UI library** | Nằm ngoài bảng D của [`decision-register.md`](build-plan/decision-register.md). Thêm là thay đổi stack, cần record riêng. |
| **KHÔNG CSS-in-JS** | Thêm runtime, xung đột với CSP nonce và Server Component. |

## 1. Luật cứng — vi phạm là phải sửa

### 1.1. Không bao giờ viết giá trị thô

```css
/* SAI */
.card {
  padding: 24px;
  color: #62625F;
  border-radius: 12px;
}

/* ĐÚNG */
.card {
  padding: var(--space-6);
  color: var(--color-text-secondary);
  border-radius: var(--radius-card);
}
```

**Vì sao:** khi chủ dự án đổi `#62625F`, ta sửa một dòng token thay vì đi tìm 40 chỗ.
Đặc biệt bảng màu đang ghi *"đang chỉnh lại"* — chắc chắn sẽ đổi.

**Ngoại lệ duy nhất:** giá trị `0`, `100%`, `1px` cho border-width, và `auto`.

### 1.2. Chỉ dùng giá trị có trong thang spacing

Thang đã duyệt: `4 8 12 16 20 24 32 40 48 64 80 96 120`.

Cần `30px`? **Không có.** Chọn `32px` (`--space-8`). Nếu thật sự cần giá trị mới,
đó là thay đổi quy chuẩn → hỏi chủ dự án, không tự thêm.

### 1.3. Không `!important`

Nếu cần `!important` thì selector đang sai. CSS Modules đã scope rồi nên gần như không
bao giờ có xung đột thật. Biome sẽ báo lỗi nếu bạn dùng.

**Đúng một ngoại lệ, đã khai trong `biome.json`:** khối `prefers-reduced-motion: reduce`
trong `globals.css`. Nó *phải* thắng specificity của mọi component để thật sự tắt animation
— người bật tuỳ chọn này thường vì chóng mặt/tiền đình, "giảm một phần" là không đủ. Đây là
pattern chuẩn của mọi CSS reset. Ngoại lệ giới hạn đúng một file, không mở rộng.

### 1.4. Không selector lồng sâu quá 2 cấp

```css
/* SAI — mong manh, đổi HTML là vỡ */
.card .header .title span { }

/* ĐÚNG — đặt tên class cho thứ cần style */
.cardTitle { }
```

### 1.5. Không style theo tag hay id

Dùng class. Tag selector (`div`, `p`) chỉ được phép trong `globals.css` cho reset/base.

## 2. Token — bảng tra nhanh

### 2.1. Màu

| Token | Giá trị | Dùng cho |
|---|---|---|
| `--color-bg-primary` | `#FFFFFF` | Nền chính |
| `--color-bg-secondary` | `#F7F7F5` | Nền section phụ, CTA |
| `--color-text-primary` | `#111111` | Tiêu đề, nội dung quan trọng |
| `--color-text-secondary` | `#62625F` | Nội dung mô tả |
| `--color-text-tertiary` | `#8A8A86` | Ngày tháng, thông tin phụ |
| `--color-border-default` | `#E5E5E1` | Viền card, input, divider |
| `--color-border-hover` | `#C9C9C4` | Viền khi hover |
| `--color-button-primary` | `#111111` | Nền nút chính |
| `--color-button-text` | `#FFFFFF` | Chữ trên nút chính |

> Bảng màu đang được chủ dự án chỉnh. Chỉ cần sửa `globals.css`; component không đổi.

### 2.2. Spacing

| Token | px | | Token | px |
|---|---|---|---|---|
| `--space-1` | 4 | | `--space-8` | 32 |
| `--space-2` | 8 | | `--space-10` | 40 |
| `--space-3` | 12 | | `--space-12` | 48 |
| `--space-4` | 16 | | `--space-16` | 64 |
| `--space-5` | 20 | | `--space-20` | 80 |
| `--space-6` | 24 | | `--space-24` | 96 |
| | | | `--space-30` | 120 |

Tên token = px ÷ 4 (trừ vài mốc lớn). `--space-6` = 24px.

**Khoảng cách chuẩn giữa các khối:**

| Vị trí | Token |
|---|---|
| Heading → Description | `--space-4` đến `--space-6` (16–24px) |
| Description → Button | `--space-6` đến `--space-8` (24–32px) |
| Section header → Card grid | `--space-10` (40px) |
| Giữa các card | `--grid-gap` (tự đổi theo breakpoint) |

### 2.3. Typography

Dùng **class tiện ích** trong `globals.css`, không tự set font-size:

```html
<h1 class="typeH1">Tiêu đề</h1>
<p class="typeBody">Nội dung</p>
```

| Class | Desktop (size/line/weight) | Mobile |
|---|---|---|
| `.typeHero` | 64 / 68 / 600 | 40 / 46 / 600 |
| `.typeH1` | 52 / 60 / 600 | 36 / 42 / 600 |
| `.typeH2` | 40 / 48 / 600 | 30 / 38 / 600 |
| `.typeH3` | 28 / 36 / 600 | 24 / 32 / 600 |
| `.typeCardTitle` | 18 / 26 / 600 | 18 / 26 / 600 |
| `.typeBodyLarge` | 18 / 28 / 400 | 16 / 24 / 400 |
| `.typeBody` | 16 / 24 / 400 | 16 / 24 / 400 |
| `.typeBodySmall` | 14 / 21 / 400 | 14 / 20 / 400 |
| `.typeCaption` | 12 / 16 / 500 | 12 / 16 / 500 |

> **Cột Desktop = quy chuẩn của chủ dự án** (đã đối chiếu 2026-07-21, khớp 100%).
> **Cột Mobile là ước lượng TẠM của tôi** — quy chuẩn chưa có bảng cho frame 390px và
> 1024px. Khi có, thay cả cột này lẫn khối `@media` trong `globals.css`.
>
> Lưu ý hệ quả: thang desktop hiện bật từ **768px**, nên màn 1024px nhận hero 64px. Đó là
> cách lấp chỗ trống, không phải chủ đích thiết kế.

**KHÔNG dùng `letter-spacing`.** Quy chuẩn chỉ định nghĩa font-size, line-height và weight.
Từng có tracking âm trên tiêu đề do tôi tự thêm — chủ dự án yêu cầu bỏ (2026-07-21) để chữ
giãn đúng mặc định của font, khớp Figma. Muốn thêm lại thì phải có giá trị từ thiết kế.

Ngoại lệ duy nhất: nhãn chữ in hoa cỡ nhỏ (ví dụ `QUẢN TRỊ` ở header admin) cần giãn nhẹ
để đọc được — đó là vấn đề legibility, không phải thẩm mỹ.

**Font:** Montserrat (chính), Inter (dự phòng) — nạp qua `next/font` (self-host, không gọi
Google CDN nên không phải nới CSP `font-src`).

### 2.4. Bo góc

| Token | px | Dùng cho |
|---|---|---|
| `--radius-button` | 8 | Button |
| `--radius-input` | 8 | Input |
| `--radius-card` | 12 | Tool card, Blog card |
| `--radius-cta` | 16 | CTA box |
| `--radius-tag` | 999 | Tag (bo tròn hoàn toàn) |

### 2.5. Layout — token tự đổi theo breakpoint

| Token | Desktop | Tablet | Mobile |
|---|---|---|---|
| `--container-max` | 1200px | 1200px | 1200px |
| `--container-gutter` | 120px | 32px | 20px |
| `--grid-columns` | 12 | 8 | 4 |
| `--grid-gap` | 24px | 20px | 16px |
| `--section-padding-y` | 96px | 80px | 64px |

Component **không cần** viết media query cho các giá trị này — token tự đổi.

## 3. Breakpoint

```css
/* Mobile first: viết mặc định cho mobile, mở rộng lên */
@media (min-width: 768px)  { /* tablet  */ }
@media (min-width: 1280px) { /* desktop */ }
```

| Tên | Từ | Frame thiết kế |
|---|---|---|
| Mobile | 0 | 390px |
| Tablet | 768px | 1024px |
| Desktop | 1280px | 1920px |

> **Đây là quyết định của tôi**, không phải từ quy chuẩn (quy chuẩn chỉ nêu frame thiết kế,
> không nêu điểm ngắt). `1280px` để container 1200 + gutter 120 hai bên có đủ chỗ thở.
> Chủ dự án chỉnh lại được — sửa ở `globals.css`, component không đổi.

## 4. Cấu trúc file

```
apps/web/
  app/
    globals.css              ← token + reset + class typography. CHỈ ở đây có giá trị thô.
    (user)/page.tsx
    (user)/page.module.css   ← CSS của riêng page đó
  components/
    Button/
      Button.tsx
      Button.module.css      ← CSS của riêng component đó
```

**Luật:** mỗi component/page có file `.module.css` riêng, đặt cạnh nó. Không có file
`styles.css` dùng chung khổng lồ.

## 5. Đặt tên class

`camelCase` — vì trong TSX viết `styles.cardTitle` tự nhiên hơn `styles['card-title']`.

```css
/* Button.module.css */
.button { }
.buttonPrimary { }
.buttonDisabled { }
```

Tên mô tả **vai trò**, không mô tả hình thức:

```css
.dangerButton { }   /* ĐÚNG — vai trò */
.redButton { }      /* SAI — mai đổi sang cam thì tên nói dối */
```

## 6. Lưới cột — kiến trúc bố cục

Đây là phần quan trọng nhất của tài liệu. Bố cục sai lưới thì mọi thứ khác đúng cũng vô ích.

### 6.1. Số cột theo breakpoint

| Breakpoint | Cột | Gutter | Gap |
|---|---|---|---|
| Mobile (0) | **4** | 20px | 16px |
| Tablet (768px) | **8** | 32px | 20px |
| Desktop (1280px) | **12** | 120px | 24px |

Đây là chuẩn responsive của Figma, không phải phát minh riêng.

> **Vì sao không 12 cột ở mọi breakpoint:** trên màn 390px, một cột của lưới 12 chỉ rộng
> khoảng 28px — hẹp hơn một ký tự. Chia 12 ở đó là chia trên giấy chứ không dùng được.

### 6.2. Bốn class có sẵn trong `globals.css`

```html
<section class="section">        <!-- padding trên/dưới theo breakpoint -->
  <div class="container grid">   <!-- container: bề ngang + gutter · grid: cột -->
    <div class="…">              <!-- con TRỰC TIẾP mới nằm trên cột -->
    <ul class="gridRow">         <!-- danh sách: chiếm cả hàng rồi chia lại cột -->
  </div>
</section>
```

Thêm `gridDebug` vào `<body>` để hiện vạch cột và đối chiếu với Figma bằng mắt. Chỉ dùng
lúc dev.

### 6.3. Khai số cột trong module

```css
/* page.module.css */
.heroHeading { grid-column: span 4; }                            /* mobile 4/4 */
@media (min-width: 768px)  { .heroHeading { grid-column: span 6; } }  /* tablet 6/8 */
@media (min-width: 1280px) { .heroHeading { grid-column: span 7; } }  /* desktop 7/12 */
```

Căn giữa trên lưới thì chỉ định cột bắt đầu, **không** dùng `max-width` + `margin: auto`:

```css
.sectionHeaderCenter { grid-column: 3 / span 8; }   /* 8 cột giữa của 12 */
```

### 6.4. Ba luật bắt buộc

**1. Không `max-width` bằng px để giới hạn bề ngang khối.** Bề ngang đến từ số cột.

```css
.hero { max-width: 720px; }        /* SAI — con số không ai giải thích được */
.heroHeading { grid-column: span 7; }  /* ĐÚNG — 7/12 cột, khớp Figma */
```

Ngoại lệ duy nhất: giới hạn theo đơn vị chữ (`max-width: 60ch`) cho đoạn văn dài, vì đó là
ràng buộc về độ dài dòng đọc được, không phải bố cục.

**2. Không khai lại `display: grid` + `grid-template-columns` trong module.** Dùng `grid`
hoặc `gridRow`. Khai lại ở nhiều nơi thì sớm muộn chúng lệch nhau — đã từng xảy ra: `.grid`
bị khai 4 lần ở 2 file trước khi sửa (2026-07-21).

Ngoại lệ: lưới **nội bộ** của một component (ví dụ thẻ blog chia ảnh trái / chữ phải). Đó
không phải lưới trang nên khai riêng là đúng.

**3. Chỉ con TRỰC TIẾP của `.grid` mới đặt được `grid-column`.** Bọc thêm một `<div>` là
phần tử bên trong rơi khỏi lưới. Đây là lỗi hay gặp nhất.

```html
<div class="container grid">
  <div>                          <!-- SAI: lớp bọc này ăn hết 1 cột -->
    <div class="…span 6">…</div> <!-- span 6 không còn nghĩa gì -->
  </div>
</div>
```

Cần giữ thẻ ngữ nghĩa ở giữa (ví dụ `<ul>` cho danh sách) thì dùng `gridRow` — nó chiếm
trọn bề ngang rồi chia lại đúng số cột đó, nên con vẫn nằm khít lưới cha.

### 6.5. Grid hay flex?

- **Grid** đặt khối theo **cột ngang** — quan hệ với bố cục trang.
- **Flex** xếp nội dung **theo chiều dọc bên trong** một khối — nhịp của riêng khối đó.

Một ô lưới thường là flex column ở bên trong. Hai việc khác nhau, không thay thế nhau.

## 7. Accessibility — bắt buộc, không phải tuỳ chọn

Đây là ràng buộc của phase-1 mục 10, không phải sở thích:

- **Focus phải nhìn thấy được.** Không bao giờ `outline: none` mà không thay bằng thứ khác
  rõ ràng. Có test Playwright kiểm điều này.
- **Không tràn ngang** ở mọi viewport. Cũng có test kiểm.
- **Tôn trọng `prefers-reduced-motion`** — bọc mọi animation:

  ```css
  @media (prefers-reduced-motion: no-preference) {
    .card { transition: border-color 150ms ease; }
  }
  ```

- Trạng thái không được **chỉ** phân biệt bằng màu (người mù màu không thấy).

## 8. Danh sách kiểm trước khi commit CSS

- [ ] Không có màu / px / radius viết thô (trừ ngoại lệ ở 1.1)
- [ ] Mọi spacing nằm trong thang đã duyệt
- [ ] Không `!important`
- [ ] Selector không lồng quá 2 cấp
- [ ] Dùng class typography thay vì tự set font-size
- [ ] Focus nhìn thấy được
- [ ] Đã thử ở cả ba viewport (390 / 1024 / 1920)
- [ ] `pnpm lint` xanh

## 9. Khi quy chuẩn thay đổi

1. Sửa token trong `globals.css`.
2. **Không** sửa component — nếu phải sửa, nghĩa là component đã viết sai (hardcode).
3. Chạy `pnpm test:e2e` để chắc responsive/accessibility không vỡ.
4. Cập nhật bảng token trong file này.
