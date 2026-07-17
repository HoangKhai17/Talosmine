# syntax=docker/dockerfile:1
#
# Talosmine — image cho apps/web (Next.js 16).
#
# BUILD CONTEXT LÀ ROOT CỦA REPO, không phải apps/web:
#     docker build -f infra/docker/web.Dockerfile -t talosmine/web .
# Lý do: đây là pnpm workspace. Lockfile, pnpm-workspace.yaml và tsconfig.base.json
# nằm ở root; build từ apps/web sẽ không thấy chúng nên không thể
# `--frozen-lockfile` được.
#
# Version lấy từ decision-register bảng D — KHÔNG tự nâng:
#   node 24.18.0 (DEC-T01, khớp .nvmrc và engines.node), pnpm 11.13.1 (DEC-T02).

# ─────────────────────────────────────────────────────────────────────────────
FROM node:24.18.0-bookworm-slim AS base
# corepack hỏi xác nhận khi tải package manager — trong CI không ai trả lời được.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# `packageManager` trong root package.json đã pin pnpm@11.13.1; `prepare --activate`
# khoá nó tường minh để image không phụ thuộc vào việc corepack đọc đúng field đó.
RUN corepack enable && corepack prepare pnpm@11.13.1 --activate
WORKDIR /app

# ─────────────────────────────────────────────────────────────────────────────
# manifests — tách stage riêng để layer cache chỉ vỡ khi package.json/lockfile đổi,
# không vỡ mỗi lần sửa một dòng code.
FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/control-plane/package.json apps/control-plane/
# `tests` là workspace package (pnpm-workspace.yaml) nên lockfile có importer cho nó.
# Thiếu manifest này thì `--frozen-lockfile` fail với ERR_PNPM_OUTDATED_LOCKFILE —
# dù image web chẳng dùng gì từ tests. Chỉ copy manifest, không copy test code.
COPY tests/package.json tests/

# ─────────────────────────────────────────────────────────────────────────────
# deps — cài đủ cả devDependencies vì `next build` có typecheck
# (next.config.ts đặt typescript.ignoreBuildErrors=false: build KHÔNG được lặng lẽ
# pass khi type sai).
FROM manifests AS deps
# --frozen-lockfile: lockfile lệch thì FAIL, không tự sửa (DEC-T02).
RUN pnpm install --frozen-lockfile

# ─────────────────────────────────────────────────────────────────────────────
# prod-deps — node_modules chỉ có dependency runtime, dùng cho stage cuối.
# Cài lại từ manifests (không phải copy rồi prune) để chắc chắn không có devDep nào
# lọt vào image chạy thật.
FROM manifests AS prod-deps
RUN pnpm install --frozen-lockfile --prod --filter @talosmine/web

# ─────────────────────────────────────────────────────────────────────────────
FROM deps AS build
COPY tsconfig.base.json ./
COPY apps/web apps/web
# NODE_ENV=production để Next build đúng chế độ production (proxy.ts đọc biến này
# để quyết định CSP: bản dev nới 'unsafe-eval'/'unsafe-inline' cho React Refresh,
# bản production thì KHÔNG. Build nhầm chế độ = tự nới CSP ở production).
ENV NODE_ENV=production
RUN pnpm --filter @talosmine/web run build

# ─────────────────────────────────────────────────────────────────────────────
# runner — least privilege.
FROM base AS runner
ENV NODE_ENV=production
# Next đọc PORT/HOSTNAME của `next start`.
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Image node:* có sẵn user `node` (uid 1000). Dùng nó thay vì tạo user mới.
# --chown ngay lúc COPY: Next cần ghi vào .next/cache lúc chạy (image optimizer).
# Nếu file thuộc root còn process chạy bằng `node`, cache fail lúc runtime chứ
# không fail lúc build — đúng loại lỗi phát hiện muộn.
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=prod-deps --chown=node:node /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=build --chown=node:node /app/apps/web/.next ./apps/web/.next
COPY --chown=node:node apps/web/package.json apps/web/next.config.ts ./apps/web/

USER node
WORKDIR /app/apps/web
EXPOSE 3000

# Không dùng `pnpm start`: nó thêm một process trung gian nuốt tín hiệu, khiến
# container không shutdown sạch khi nhận SIGTERM. Gọi thẳng binary của next.
# (pnpm đặt bin của dependency trong node_modules/.bin CỦA CHÍNH package đó —
# apps/web/node_modules/.bin/next — chứ không hoisted lên root như npm.)
CMD ["node_modules/.bin/next", "start"]

# GHI CHÚ — read-only filesystem (phase-1 mục 12):
# Container này CHẠY ĐƯỢC với `read_only: true` chỉ khi được cấp tmpfs cho
# /app/apps/web/.next/cache và /tmp. Ràng buộc đó thuộc về compose, mà compose
# hiện chưa có service `web` — nên chưa khai ở đây và CHƯA được kiểm chứng.
