# Tech stack Talosmine

> **Trạng thái:** Stack đã chọn làm đường cơ sở triển khai; hệ thống chưa được bootstrap.

| Hạng mục | Công nghệ sử dụng |
|---|---|
| Frontend | Next.js, TypeScript, responsive web cho trình duyệt desktop, điện thoại và máy tính bảng |
| Backend | Node.js Active LTS tại thời điểm bootstrap, TypeScript strict, NestJS, Fastify adapter, modular monolith |
| API | REST JSON có version, OpenAPI 3.1 |
| Identity/SSO | Auth0 managed; OIDC Authorization Code qua Auth0 SDK với PKCE, `state`, `nonce`; M2M identity riêng từng backend ứng dụng |
| Web security | Next.js BFF; session cookie `HttpOnly`, `Secure`, `SameSite`; CSRF protection; redirect URI allowlist |
| Database | PostgreSQL trong Supabase self-hosted bằng official Docker Compose |
| Data access | Drizzle ORM, Drizzle Kit; SQL transaction có kiểm soát cho hard quota |
| Database runtime | Supavisor connection pooling; Supabase Studio chỉ dùng cho quản trị riêng tư |
| Container/deploy | Docker Compose trên VPS, Caddy reverse proxy/TLS |
| CI/CD | GitHub Actions, GitHub Container Registry |

Supabase được self-host nên dự án tự chịu trách nhiệm backup, WAL/PITR, cập nhật, giám sát và khôi phục. Toàn bộ endpoint Supabase chỉ nằm trong private/internal network; Internet chỉ truy cập ứng dụng qua Caddy. Trong runtime nghiệp vụ, database chỉ được truy cập qua repository của module sở hữu trong Control Plane; worker gọi public application port, không truy cập table trực tiếp. Migration task và Studio là ngoại lệ quản trị có kiểm soát với quyền tối thiểu.
