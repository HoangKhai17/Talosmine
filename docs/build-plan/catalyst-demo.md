# Kế hoạch một ngày — bản demo nộp Catalyst

> **Mục tiêu:** có một bản deploy được, nhìn đẹp, có kết nối ví testnet và vài sản phẩm chạy
> được, để nộp hồ sơ xin tài trợ Catalyst. **Không phải sản phẩm hoàn chỉnh.**
>
> **Deadline: trong hôm nay.** Mọi quyết định dưới đây tối ưu cho tốc độ, không tối ưu cho
> tuổi thọ.

## 0. Những kỷ luật TẠM GÁC hôm nay — và vì sao ghi ra

Ghi ra để sau này không ai tưởng đây là chuẩn mới của dự án. Đây là **nợ có chủ đích**, nhận
biết trước, trả sau.

| Bình thường | Hôm nay | Lý do |
|---|---|---|
| Nội dung vào CMS | Ảnh + tiêu đề **gắn cứng** | CMS cần migration + trang quản trị |
| App vào bảng `applications` | Sản phẩm demo trong **một file TS tĩnh** | Không cần Postgres → deploy dễ hơn nhiều |
| Chuỗi vào catalog i18n | **Gõ thẳng tiếng Việt** | Ba agent cùng sửa file i18n = xung đột chắc chắn |
| Có test cho mọi thứ | **Không viết test mới** | Nói trước để không ai bất ngờ |
| Spec-first OpenAPI | Không đụng Control Plane | Demo không cần backend |

**Hệ quả tốt ngoài ý muốn:** nếu sản phẩm demo là tĩnh và ví chạy phía client thì **bản demo
không cần Control Plane, không cần Postgres, không cần Logto** — chỉ một app Next. Deploy rút
xuống còn vài phút, thay vì phải giải xong bài toán compose production (mục E1 còn dang dở).

---

## 1. Chia việc cho ba tab — nguyên tắc chống giẫm chân

Ba agent chạy song song trên **cùng một repo**. Thứ giết năng suất không phải tốc độ gõ, mà là
**hai agent sửa cùng một file**. Nên luật cứng:

### Bảng sở hữu file — KHÔNG agent nào được đụng file của agent khác

| File / thư mục | Chủ sở hữu duy nhất |
|---|---|
| `apps/web/proxy.ts` | **Tab 1 — Claude (phiên này)** |
| `apps/web/lib/demo-products.ts` | **Tab 1** |
| `apps/web/app/[locale]/(user)/tools/[key]/**` | **Tab 1** |
| `package.json` + lockfile | **Tab 2 — Claude Code** |
| `apps/web/app/[locale]/(user)/wallet/**` | **Tab 2** |
| `apps/web/components/wallet/**` | **Tab 2** |
| `apps/web/app/[locale]/(user)/page.tsx` + `.module.css` | **Tab 3 — GPT** |
| `apps/web/app/[locale]/(user)/tools/page.tsx` + `.module.css` | **Tab 3** |
| `apps/web/app/globals.css` | **Tab 3** |
| `public/**` (ảnh) | **Tab 3** |
| `apps/web/i18n/messages/*` | **KHÔNG AI** — hôm nay gõ chuỗi thẳng vào JSX |

Ba điểm dễ va nhất, nói trước:

- **`package.json`** — chỉ Tab 2 được cài thư viện. Tab khác cần package thì **nhắn Tab 2**.
- **`proxy.ts`** — chứa CSP. Chỉ Tab 1.
- **`globals.css`** — chỉ Tab 3.

### Thứ tự khởi động

```
Tab 1 chạy TRƯỚC ~20 phút  →  tạo demo-products.ts + mở CSP
                            ↓
        Tab 2 và Tab 3 chạy song song, không phụ thuộc nhau
```

**Tab 2 không phụ thuộc gì cả — bắt đầu được ngay lập tức.**
**Tab 3 cần `demo-products.ts` tồn tại** để render lưới → đợi Tab 1 báo xong mốc M1.

---

## 2. Tab 1 — Claude (phiên này). Nền tảng và phần chặn

Tôi nhận phần cần hiểu codebase nhất, và phần có thể âm thầm phá hỏng hai tab kia.

### 2.1 Mở CSP cho iframe — LÀM TRƯỚC TIÊN

**Nếu bỏ qua bước này, toàn bộ sản phẩm demo hiện ra khung trắng.**

`apps/web/proxy.ts` đang có `default-src 'self'` và **không khai `frame-src`**. Theo chuẩn CSP,
thiếu `frame-src` thì rơi về `default-src` → **mọi iframe từ ngoài đều bị chặn**, và trình duyệt
không báo lỗi gì ngoài một khung trắng — rất tốn thời gian nếu phát hiện muộn.

Việc: thêm `frame-src` cho host của Omni Calculator; rà `connect-src` nếu Tab 2 cần gọi ra ngoài.

### 2.2 `apps/web/lib/demo-products.ts` — hợp đồng nối hai tab

Một mảng tĩnh, không database:

```ts
export interface DemoProduct {
  key: string;          // vào URL /tools/<key>
  title: string;
  description: string;
  category: string;
  image: string;        // đường dẫn trong /public — Tab 3 cung cấp
  iframeSrc: string;    // URL công cụ trên Omni Calculator
}

export const DEMO_PRODUCTS: DemoProduct[] = [ /* 6–9 mục */ ];
```

**Tab 3 đọc mảng này để render lưới; Tab 1 dùng nó cho trang chi tiết.** Đây là điểm nối duy
nhất giữa hai tab, nên nó phải xong trước.

### 2.3 Trang chi tiết `/tools/[key]`

Iframe toàn khung, có tiêu đề và mô tả, đặt `sandbox` hợp lý, có nút quay lại. Không đăng nhập.

### 2.4 Gộp và build cuối

Chạy build sau khi cả ba tab xong, sửa lỗi tích hợp.

---

## 3. Tab 2 — Claude Code. Kết nối ví Cardano

**Bắt đầu ngay, không đợi ai.**

### Nguồn tham khảo

`https://github.com/ADA-BAMBOO/Connect-Wallet-Cardano` — public, TypeScript, Next.js. Lấy lại
phần kết nối ví. Chuẩn **CIP-30**, dùng **Mesh SDK** (`@meshsdk/react`, `@meshsdk/core`).

### Phạm vi HÔM NAY — cắt rõ

**LÀM:**

- Phát hiện ví đã cài (Lace, Eternl, Nami, Yoroi, Typhon…), hiện icon và tên
- Kết nối / ngắt kết nối, tự kết nối lại sau khi tải lại trang
- Hiện địa chỉ payment (rút gọn), số dư ADA, `networkId`
- **Chốt chặn testnet:** `networkId === 1` (mainnet) thì hiện cảnh báo rõ và không cho thao
  tác. Demo Catalyst chạy trên **Preprod**

**KHÔNG LÀM hôm nay** — cần backend, Postgres, Redis, Blockfrost, watcher; không kịp trong ngày:

- Đơn hàng, đối chiếu on-chain, webhook HMAC, faucet, thanh toán stablecoin

### File được phép tạo

- `apps/web/app/[locale]/(user)/wallet/page.tsx` + `.module.css`
- `apps/web/components/wallet/**`
- `package.json` — **chỉ tab này**

### Ba cạm bẫy phải biết trước

1. **Mesh SDK chạy client-only.** Next App Router render ở server trước, nên phải `'use client'`
   và nhiều khả năng cần `dynamic(..., { ssr: false })`. Không xử lý là gặp `window is not
   defined` ngay lúc build — hỏng cả bản deploy.
2. **CSP.** Cần gọi Blockfrost hay endpoint ngoài thì **báo Tab 1** thêm vào `connect-src`. Tự
   sửa `proxy.ts` là giẫm chân Tab 1.
3. Ví là extension trình duyệt — **không tự động hoá test được**, phải bấm tay xác nhận.

---

## 4. Tab 3 — GPT. Giao diện và nội dung tĩnh

**Đợi Tab 1 báo mốc M1 (khoảng 20 phút) rồi bắt đầu.**

### Việc

- **Trang chủ** `app/[locale]/(user)/page.tsx`: hero, tiêu đề, ảnh — **gắn cứng**; bỏ hết dữ
  liệu mẫu cũ (`CATEGORY_TAB_COUNT`, `RESULT_IDS`…)
- **Trang `/tools`**: đọc `DEMO_PRODUCTS` từ `apps/web/lib/demo-products.ts`, render lưới thẻ,
  mỗi thẻ dẫn tới `/tools/<key>`
- Ảnh đặt trong `public/`, đặt tên rõ ràng, rồi **báo tên file cho Tab 1** để điền vào trường
  `image`
- Dọn CSS cho gọn mắt: khoảng cách, cỡ chữ, trạng thái hover

### Ràng buộc

- **Không** sửa `proxy.ts`, `package.json`, `demo-products.ts`, `tools/[key]/**`
- **Không** thêm thư viện — cần gì báo Tab 2
- Chuỗi tiếng Việt gõ thẳng, **không** đụng `i18n/messages/*`
- Dùng lại `container`, `section`, `typeH1`/`typeBody` sẵn có — **đừng dựng hệ thiết kế mới**

---

## 5. Deploy — rủi ro thật sự của ngày hôm nay

Đây là chỗ dễ trượt deadline nhất. Quyết ngay đầu ngày.

**Phương án A — khuyến nghị: deploy CHỈ app Next.**
Sản phẩm demo tĩnh + ví chạy client → không cần Control Plane, Postgres, Logto. Đẩy lên Vercel
xong trong ít phút.
*Đánh đổi:* bản demo **không có đăng nhập**; các trang demo để công khai.

**Phương án B — deploy đủ tầng.** Có đăng nhập Logto, nhưng phải giải xong compose production
(hiện **thiếu hẳn** service `web`, `control-plane`, `caddy` — mục E1). **Rủi ro cao cho một ngày.**

> Nếu hồ sơ Catalyst cần thấy phần đăng nhập: quay video màn hình bản chạy local, còn bản
> deploy đi theo phương án A.

---

## 6. Mốc bàn giao

| Mốc | Ai | Xong thì báo gì |
|---|---|---|
| **M1** | Tab 1 | `demo-products.ts` + CSP xong → **Tab 3 bắt đầu** |
| **M2** | Tab 2 | Kết nối ví chạy trên Preprod, đã bấm tay xác nhận |
| **M3** | Tab 3 | Trang chủ + `/tools` xong; báo tên file ảnh cho Tab 1 |
| **M4** | Tab 1 | Điền `image`, chạy build, sửa lỗi tích hợp |
| **M5** | — | Deploy và bấm thử toàn bộ |

**Quy tắc gộp code:** mỗi tab commit riêng phần của mình. Bảng sở hữu file không chồng lấn nên
gộp sẽ không xung đột — **trừ khi có tab phá luật**.

---

## 7. Nợ kỹ thuật — ghi trước, trả sau

Ghi ngay hôm nay để tuần sau không phải đi tìm:

1. Sản phẩm demo là **iframe của omnicalculator.com**. Về lâu dài **không có giá trị SEO**
   (nội dung thuộc về họ), và việc nhúng **cần xin phép** qua `embed@omnicalculator.com`. Dùng
   cho demo thì được; làm sản phẩm thật thì phải tự viết công cụ.
2. `demo-products.ts` là **tĩnh** — chưa qua bảng `applications`, chưa có `kind`, chưa đi qua
   url-policy.
3. **Chuỗi gõ cứng, không i18n** — bản `en` sẽ thiếu.
4. **Không có test** cho phần thêm hôm nay.
5. Ví mới **kết nối**, chưa thanh toán. Cổng thanh toán đầy đủ nằm ở repo
   `Connect-Wallet-Cardano`, ghép sau.

---

## 8. Nhúng Omni Calculator — sự thật đo được ngày 2026-08-19

Mục này ghi lại kết quả đo thật, vì mọi phỏng đoán trước đó đều sai ít nhất một điểm.

### Iframe trần KHÔNG chạy

`<iframe src="https://www.omnicalculator.com/embed/<slug>">` cho một **khung trắng hoàn
toàn**, và mọi dấu hiệu đều báo "ổn": HTTP 200, không `x-frame-options`, không
`frame-ancestors`, bundle của họ tải đủ, console sạch. Hiện tượng này xảy ra **cả khi mở
thẳng URL embed ngoài site này**, nên nó không liên quan tới CSP, `sandbox` hay tên miền.

**Đây là lý do phép kiểm bằng `curl` đã cho kết luận sai.** `curl` không chạy JavaScript.
Từ nay công cụ nhúng phải kiểm bằng trình duyệt thật, không phải bằng mã trạng thái.

### Giao thức thật

Đọc từ `https://cdn.omnicalculator.com/sdk.js`:

1. iframe mang hash `#id=<n>` (bắt buộc). `&hasLink=&withLogo=&version=` là tuỳ chọn.
2. iframe gửi `{type:'LOADED', calculatorId}` lên trang cha.
3. **Trang cha phải trả lời `{type:'CONFIG', config, currency, showRowControls}`.** Thiếu
   bước này là khung đứng trắng vĩnh viễn.
4. iframe gửi `READY` rồi mới vẽ nội dung.
5. iframe gửi `CHANGE_HEIGHT` mỗi khi nội dung đổi chiều cao.

Đã đo: `version=1` chèn thêm dòng "Dear webmaster: … re-download the widget code" hiển thị
cho người dùng cuối; `version=2` không có.

Cài đặt nằm ở `apps/web/components/tools/omni-embed.tsx`. **Không** nạp `sdk.js` của họ, vì
thêm một script bên thứ ba là phải mở `script-src` — nới đúng hàng rào đắt nhất của hệ thống
để đổi lấy khoảng ba mươi dòng mã.

Chốt chặn: `tests/e2e/omni-embed.spec.ts`, đã kiểm chứng bằng cách phá (bỏ bước `CONFIG` →
test đỏ).

### NỢ GIẤY PHÉP — chưa trả, phải trả trước khi phát hành công khai

Điều khoản nhúng của Omni ([calculator-widgets](https://www.omnicalculator.com/calculator-widgets)):

| Điều kiện | Trạng thái |
|---|---|
| Xin duyệt qua form trên trang máy tính (khai tên, email, **tên miền**) | ❌ chưa làm |
| Logo Omni hiện trong khung | ❌ **đã tắt** bằng `withLogo=false` (yêu cầu chủ dự án 2026-08-19) |
| Dòng "Powered by Omni Calculator" gần khung | ❌ **đã gỡ** theo yêu cầu chủ dự án 2026-08-19 |
| Link về trang gốc của công cụ | ❌ **đã gỡ** cùng lúc |
| Chiều rộng 400px | ⚠️ khung chiếm trọn cột nội dung (~1200px ở desktop) |

Ba dòng ❌ đều là quyết định có ý thức của chủ dự án, không phải sót. Hệ quả: bản nhúng hiện
tại **không đạt ba trong bốn điều kiện** của Omni, nên đơn xin duyệt gần như chắc chắn bị từ
chối nếu nộp nguyên trạng. Muốn được duyệt thì phải đặt lại dòng ghi nguồn và link, rồi đổi
hai cờ trong `omni-embed.tsx` thành `hasLink=true&withLogo=true`.

### Không thể CSS nội dung bên trong khung

Đã hỏi và đã trả lời dứt điểm: **không**. Nội dung khung ở origin khác, chính sách same-origin
chặn cả CSS lẫn JavaScript của trang cha. Đòn bẩy DUY NHẤT là hai thứ ứng dụng của họ chịu
đọc: các cờ trong hash (`hasLink`, `withLogo`, `version`) và đối tượng `CONFIG` gửi qua
`postMessage`. Ngoài hai đường đó thì không có đường nào.

Cụ thể: `withLogo=false` tắt được logo góc dưới phải (đã đo). Banner "Try the new version
now!" thì KHÔNG tắt được — nó là nội dung của chính họ.

Form bắt khai tên miền và kiểm khớp, nên **phải chốt tên miền trước khi đăng ký** — đăng ký
bằng `localhost` là vô nghĩa, và đổi tên miền sau là phải xin lại.

Ràng buộc sâu hơn: **mô hình nhúng không nuôi được cơ chế điểm tín dụng (DEC-B18).** Iframe
trỏ sang bên thứ ba thì Hub không biết người dùng có bấm tính hay không — không đếm được
lượt, không trừ được điểm. Xin phép xong vẫn không giải quyết được điều này. Đó là lý do
cần ít nhất một công cụ tự viết.
