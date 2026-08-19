# Image pins — Talosmine compose

> Nguồn sự thật cho digest của mọi image trong `docker-compose.yml` (DEC-T10).
>
> **Vì sao pin digest chứ không chỉ tag:** tag phiên bản là **mutable** — cùng một tag
> có thể bị re-push trỏ sang image khác. Digest `sha256:...` là **bất biến**: nó băm nội
> dung image, nên "cùng digest" đảm bảo "cùng bytes". Không có digest thì build hôm nay và
> build tháng sau có thể ra hai thứ khác nhau dù tag y hệt.

## Cách pin trong compose

Mỗi image ghi **cả tag lẫn digest**:

```yaml
image: supabase/postgres:17.6.1.136@sha256:f371b5f3...
```

Docker resolve theo **digest**; tag chỉ là nhãn cho người đọc biết version. Nếu tag và
digest mâu thuẫn, digest thắng.

## Digest hiện tại

Đọc từ registry ngày 2026-07-17 bằng `docker inspect --format '{{index .RepoDigests 0}}'`
sau khi pull. Chỉ hai service được giữ theo DEC-T10 (`db` + `supavisor`).

| Service | Image | Tag | Digest |
|---|---|---|---|
| `db` | `supabase/postgres` | `17.6.1.136` | `sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00` |
| `supavisor` | `supabase/supavisor` | `2.9.5` | `sha256:31c2f05b13b11069660fdfae2f6cfd37b509748d2710aca121cfee8b16cb8b07` |
| `logto` | `svhd/logto` | `1.41.0` | `sha256:7f79547e3d1fe569a3ecae757968a7cfc579687aa8164eec35113c0adc983c5b` |

## Cách cập nhật khi nâng version

1. Đổi tag trong `docker-compose.yml` sang version mới.
2. `docker pull <image>:<tag_mới>`.
3. `docker inspect --format '{{index .RepoDigests 0}}' <image>:<tag_mới>` để lấy digest.
4. Ghép `image: <image>:<tag_mới>@<digest_mới>` vào compose.
5. Cập nhật bảng trên.
6. Việc nâng version image là một thay đổi có chủ đích — ghi record superseding nếu nó
   đổi major hoặc ảnh hưởng hành vi (ví dụ major PostgreSQL đổi thì spike P1.5 phải chạy lại).

## Ghi chú phạm vi

- **Base image ứng dụng** (`node:24.18.0-bookworm-slim` trong `infra/docker/*.Dockerfile`)
  hiện pin bằng tag, chưa digest. Digest cho base image ứng dụng là yêu cầu của **P8**
  (production hardening), không phải P1. Ghi ở đây để không ai nhầm là bỏ sót.
- **Caddy** (DEC-T11) — ĐÃ thêm vào compose ngày 2026-08-19 cùng với các service ứng dụng.

  | Image | Tag | Digest |
  |---|---|---|
  | `caddy` | `2.10.2-alpine` | `sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d` |

  Digest lấy bằng `docker pull caddy:2.10.2-alpine` rồi đọc `RepoDigests` — KHÔNG chép từ
  trí nhớ hay từ tài liệu. Một digest sai chỉ lộ ra lúc pull trên máy chưa có cache, tức là
  lúc deploy lên server mới, tức là lúc tệ nhất.

- **Image ứng dụng** (`talosmine/web`, `talosmine/control-plane`, `talosmine/control-plane-migrate`)
  build tại chỗ từ `infra/docker/*.Dockerfile`, tag `:local`. Chúng không có digest để pin vì
  không đến từ registry nào. Base image `node:24.18.0-bookworm-slim` được pin bằng TAG trong
  Dockerfile — nâng lên digest là việc của P8 khi có registry riêng.
