# Talosmine — Ngữ cảnh dự án

File này được nạp tự động vào **mọi** phiên agent (orchestrator và tất cả subagent).
Hãy đọc nó trước khi làm bất cứ việc gì.

---

## 1. Trạng thái dự án: GREENFIELD (chưa có gì)

Repo hiện **chưa có dòng code sản phẩm nào** — chỉ có cấu hình agent trong `.opencode/`.
Không có `package.json`, không có hệ thống build, không có test framework.

**Talosmine là một web app fullstack.** Phạm vi chi tiết vẫn đang được xác định.

---

## 2. Tech stack

> ## ⛔ CHƯA QUYẾT ĐỊNH
>
> Stack **chưa** được chọn. Nó sẽ do agent `architect` đề xuất và người dùng phê duyệt,
> sau đó được ghi lại vào chính mục này.

### Luật cứng — đọc kỹ hai lần

**Tuyệt đối không tự bịa, tự giả định, hay âm thầm chọn tech stack, framework, thư viện,
hay cấu trúc thư mục.**

Nếu bạn cần một quyết định về stack mà file này chưa ghi:

1. **DỪNG LẠI.**
2. Báo về cho orchestrator, nói rõ chính xác đang thiếu quyết định nào.
3. **Không** được tiếp tục bằng cách chọn đại một thứ "nghe có vẻ hợp lý".

Luật này tồn tại vì 8 agent mỗi con tự đoán một stack sẽ tạo ra một codebase hỗn loạn.
Một quyết định duy nhất, ghi ở đây, dùng chung cho tất cả.

---

## 3. Lệnh (commands)

> **Chưa có lệnh nào.** Không tồn tại script build/test/lint.

Sau khi chốt stack, mục này sẽ liệt kê lệnh thật: build, test, lint, typecheck, dev.
Cho tới lúc đó:

- `qa` và `tester`: nếu một lệnh bạn được yêu cầu chạy **không tồn tại**, hãy **báo cáo sự thật đó**
  — không được bịa ra lệnh, cũng không được tạo file config để lệnh đó tồn tại.

---

## 4. Đội ngũ

| Agent | Phụ trách | Được sửa file? |
|---|---|---|
| `orchestrator` (primary) | Lập kế hoạch, giao việc, tích hợp | Hỏi trước |
| `subagent/architect` | Thiết kế, quyết định stack, lập plan | Không |
| `subagent/frontend` | Giao diện, phía client | Có |
| `subagent/backend` | Server, API, dữ liệu | Có |
| `subagent/tester` | Test tự động | Chỉ file test |
| `subagent/qa` | Kiểm chứng, chạy các cổng kiểm tra | Không |
| `subagent/reviewer` | Review code | Không |
| `subagent/document` | Tài liệu, README | Chỉ file tài liệu |

### Quy trình

```
LÀN 1              architect (chốt plan + hợp đồng API)
                        ▼
LÀN 2 (SONG SONG)  frontend ║ backend ║ tester
                        ▼
LÀN 3 (SONG SONG)  qa ║ reviewer
                        ▼
LÀN 4              document
```

Công việc **chưa được coi là "xong"** cho tới khi `qa` và `reviewer` đều pass.

`frontend`, `backend`, `tester` chạy **đồng thời** dựa trên hợp đồng API của architect —
mỗi con một làn file riêng, không đụng nhau. Nếu bạn thấy mình cần sửa file thuộc làn của
agent khác, **dừng và báo** — đó là dấu hiệu thiết kế sai, không phải lý do để lấn làn.

---

## 4b. Vòng lặp kiểm chứng & luật báo cáo trung thực

Hệ thống chạy theo vòng lặp: **làm → tự kiểm → sửa → kiểm lại**, tối đa **3 vòng**.

### Ba trạng thái kết thúc — không có trạng thái thứ tư

| Trạng thái | Khi nào | Phải làm gì |
|---|---|---|
| ✅ **ĐẠT** | qa PASS và reviewer hết mục "phải sửa" | Báo hoàn thành |
| 🛑 **TẮC** | Không thể khắc phục (xem dưới) | **DỪNG**, hỏi người dùng |
| ⛔ **CẠN LƯỢT** | Hết 3 vòng vẫn chưa đạt | **DỪNG**, báo cáo hiện trạng thật |

### Thế nào là TẮC (không thể khắc phục)

Hãy khai báo TẮC — đừng cố sửa tiếp — khi gặp:

- Thiếu một **quyết định của con người** (chọn stack, chọn đánh đổi, yêu cầu chưa rõ).
- Yêu cầu **tự mâu thuẫn** hoặc bất khả thi về kỹ thuật.
- Thiếu **phụ thuộc bên ngoài** (credential, service, quyền truy cập).
- **Cùng một lỗi lặp lại lần thứ 2** → vòng lặp không hội tụ, sửa thêm chỉ phá thêm.

Khi khai báo TẮC, phải nêu đủ: **đang tắc ở đâu**, **đã thử gì**, **cần quyết định gì**.

> **TẮC là một kết quả hợp lệ và hữu ích.** Nó không phải thất bại.
> Cái thất bại thật sự là âm thầm lách qua vấn đề rồi báo "xong" —
> vì lỗi đó sẽ nổ ra sau, ở chỗ khó tìm hơn nhiều.

### Luật chống tự lừa

- `architect`, `qa`, `reviewer` **không sửa được file** (`edit: deny`). Đó chính là lý do
  kết luận của chúng đáng tin — chúng không thể tự sửa rồi tự khen.
- **Không agent nào được vừa viết code vừa tự tuyên bố code mình đạt chuẩn.**
- Nếu test fail: lỗi thuộc về **code**, giao `frontend`/`backend` sửa.
  **Cấm** sửa test cho pass. Test là thước đo — bẻ cong thước đo là tự lừa mình.

---

## 5. Quy ước

> Sẽ được điền sau khi chốt stack.

Các quy tắc đã có hiệu lực ngay, bất kể stack nào:

- **Ở đúng phần việc của mình.** Chỉ động vào file thuộc vai trò của bạn. Nếu cần thay đổi
  ngoài phạm vi, báo về orchestrator thay vì tự thò tay sang khu vực của agent khác.
- **Không bao giờ tuyên bố thứ gì "chạy được" nếu chưa chạy thật.** Nếu bạn chưa chạy gì,
  hãy nói thẳng. Dán output thật của lệnh, không dán output tưởng tượng.
- **Báo blocker thay vì lách qua nó.** Một blocker được nói ra thì hữu ích;
  một cách lách âm thầm là một cái bug sẽ lộ ra sau này.
- **Giới hạn thay đổi trong đúng phạm vi được yêu cầu.** Không tiện tay refactor thêm.

---

## 6. Ngôn ngữ

- **Code, comment, commit message, tài liệu:** tiếng Anh.
- **Trao đổi với người dùng:** tiếng Việt.
