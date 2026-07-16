# Hướng dẫn sử dụng hệ thống Multi-Agent (Main + Sub) — opencode

Tài liệu này mô tả cách vận hành mô hình **1 orchestrator + nhiều subagent** đã dựng cho dự án Talosmine.

---

## 1. Tổng quan mô hình

```
                         ┌─────────────────┐
          bạn  ───────▶  │  ORCHESTRATOR   │  (primary — bạn nói chuyện trực tiếp)
                         │  điều phối/chia │
                         │  việc/tổng hợp  │
                         └────────┬────────┘
                                  │ gọi qua Task tool
        ┌─────────┬───────────┬───┴────┬──────────┬──────────┬──────────┐
        ▼         ▼           ▼        ▼          ▼          ▼          ▼
   architect  frontend    backend   tester      qa       reviewer   document
   (thiết kế) (giao diện) (server)  (viết test) (kiểm thử)(review)   (tài liệu)
```

- **Orchestrator** = agent chính. Bạn chỉ cần nói mục tiêu, nó tự chia việc và gọi các subagent.
- **Subagent** = thợ chuyên môn. Mỗi con chỉ làm đúng phần của mình, quyền hạn bị giới hạn theo vai trò.

---

## 2. Danh sách agent & quyền hạn
 
| Agent | id gọi tay | Vai trò | Được sửa file? | Được chạy lệnh (bash)? |
|---|---|---|---|---|
| Orchestrator | *(chọn bằng Tab)* | Điều phối, chia việc, tổng hợp | Hỏi trước (ask) | Hỏi trước (ask) |
| Architect | `@subagent/architect` | Thiết kế hệ thống, lập plan | ❌ Không | ❌ Không |
| Frontend | `@subagent/frontend` | Code giao diện/client | ✅ Có | ✅ Có |
| Backend | `@subagent/backend` | Code server/API/DB | ✅ Có | ✅ Có |
| Tester | `@subagent/tester` | Viết & chạy test | ✅ Chỉ file test | ✅ Có |
| QA | `@subagent/qa` | Chạy build/lint/test, báo lỗi | ❌ Không | ✅ Có |
| Reviewer | `@subagent/reviewer` | Review code | ❌ Không | ✅ Có |
| Document | `@subagent/document` | Viết tài liệu | ✅ Chỉ file docs | ❌ Không |

> **Ghi chú:** tên có tiền tố `subagent/` vì các file nằm trong folder `.opencode/agent/subagent/`.
> Nếu muốn gọi gọn (`@reviewer`), chuyển file ra thẳng `.opencode/agent/`.

---

## 3. Bắt đầu

1. Mở terminal tại thư mục dự án rồi chạy:
   ```bash
   opencode
   ```
2. Nhấn **`Tab`** để chuyển agent chính sang **orchestrator**.
   (Tab sẽ xoay vòng qua các primary agent: build → plan → orchestrator → ...)
3. Kiểm tra hệ thống có nhận đủ agent không:
   ```bash
   opencode agent list
   ```
   Bạn phải thấy `orchestrator (primary)` và 7 dòng `subagent/... (subagent)`.

---

## 4. Hai cách vận hành

### Cách A — Tự động (khuyên dùng)
Chọn **orchestrator** rồi giao mục tiêu ở mức cao. Nó tự lập kế hoạch và gọi các con.

Ví dụ gõ cho orchestrator:
```
Xây dựng chức năng đăng nhập bằng email + mật khẩu cho dự án.
```
Orchestrator sẽ:
1. Gọi `architect` lập plan (components, API, luồng dữ liệu, tiêu chí hoàn thành).
2. Chia việc: `backend` làm API auth, `frontend` làm màn hình login.
3. Gọi `tester` viết test, `qa` chạy build/lint/test.
4. Gọi `reviewer` review, `document` cập nhật tài liệu.
5. Tổng hợp kết quả báo lại cho bạn.

### Cách B — Gọi tay 1 subagent
Khi bạn chỉ cần đúng 1 việc, dùng `@` ngay trong khung chat:
```
@subagent/reviewer review lại file src/auth/login.ts
@subagent/architect thiết kế module thanh toán
@subagent/tester viết unit test cho hàm validateEmail
```

---

## 5. Quy trình chuẩn của một tính năng (do orchestrator điều phối)

```
1. architect   →  lập plan + tiêu chí hoàn thành
2. backend/frontend  →  hiện thực (chạy song song nếu độc lập)
3. tester      →  viết & chạy test
4. qa          →  build/lint/typecheck + kiểm thử end-to-end
5. reviewer    →  soát bug/bảo mật/chất lượng
6. document    →  cập nhật README/tài liệu
```
Orchestrator **không đánh dấu "xong"** cho tới khi qua được bước qa + reviewer.

---

## 6. Về phân quyền (permission)

Mỗi file agent khai báo `permission` với 3 mức:
- `allow` — cho phép luôn.
- `ask` — hỏi bạn duyệt trước khi chạy.
- `deny` — cấm hẳn (công cụ bị gỡ khỏi agent).

Các khóa quyền hay dùng: `read`, `edit`, `write`, `bash`, `task`, `webfetch`, `websearch`, `glob`, `grep`, `list`.

Ví dụ giới hạn bash chi tiết (chỉ cho phép lệnh an toàn):
```yaml
permission:
  bash:
    "*": ask
    "git status": allow
    "npm run build": allow
    "git push": deny
```

> Chỉ **orchestrator** có `task: allow` (được gọi subagent). Các subagent để `task: deny` để tránh gọi lồng nhau vô hạn.

---

## 7. Tùy chỉnh agent

Mỗi agent là 1 file `.md` trong `.opencode/agent/`. Cấu trúc:

```markdown
---
description: Mô tả ngắn — orchestrator đọc dòng này để quyết định khi nào gọi agent.
mode: subagent            # hoặc "primary"
model: anthropic/claude-sonnet-4-20250514
temperature: 0.2
permission:
  read: allow
  edit: allow
  bash: allow
  task: deny
---

Đây là phần system prompt: mô tả vai trò, nhiệm vụ, và quy tắc của agent.
```

**Muốn đổi model** (kể cả sang provider khác như OpenAI): sửa dòng `model:`, ví dụ
`model: openai/gpt-4o` — nhớ đã khai báo provider/API key trong opencode trước.

**Muốn thêm agent mới** (vd `devops`, `security`): tạo file mới trong
`.opencode/agent/subagent/ten-agent.md` theo mẫu trên, rồi chạy lại `opencode agent list` để kiểm tra.

---

## 8. Mẹo dùng hiệu quả

- Giao việc cho orchestrator kèm **tiêu chí hoàn thành rõ ràng** → nó chia việc chính xác hơn.
- Việc lớn: yêu cầu orchestrator **cho xem plan trước khi code** ("lập plan rồi dừng cho tôi duyệt").
- Nếu một subagent đi sai hướng, gọi tay `@subagent/...` để chỉnh riêng, đỡ tốn token cả pipeline.
- Đặt các con quan trọng (architect, reviewer) ở model mạnh; các con thao tác nhiều để model nhẹ cho tiết kiệm — đây chính là cấu hình hiện tại.
- Xem lại cấu hình bất kỳ agent nào: mở file tương ứng trong `.opencode/agent/`.

---

## 9. Cấu trúc thư mục hiện tại

```
.opencode/agent/
├── orchestrator.md              # agent chính (primary)
└── subagent/
    ├── architect.md
    ├── backend.md
    ├── document.md
    ├── frontend.md
    ├── qa.md
    ├── reviewer.md
    └── tester.md
```

Tài liệu tham khảo chính thức: https://opencode.ai/docs/en/agents/
