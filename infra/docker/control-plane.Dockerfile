# syntax=docker/dockerfile:1
#
# Talosmine — image cho apps/control-plane (NestJS 11 + Fastify).
#
# MỘT IMAGE, HAI ENTRYPOINT (phase-1 mục 9):
#   - API    : node dist/main-api.js      <- CMD mặc định
#   - Worker : node dist/main-worker.js   <- override `command:` trong compose
# Hai deployment role dùng CHUNG codebase và CHUNG image. Đây là chủ ý kiến trúc:
# worker KHÔNG phải microservice riêng (phase-1 mục 5 ghi rõ "tách worker thành
# microservice" nằm ngoài phạm vi). Build hai image khác nhau sẽ mở đường cho hai
# bản code lệch nhau — đúng thứ đang cố tránh.
#
# BUILD CONTEXT LÀ ROOT CỦA REPO:
#     docker build -f infra/docker/control-plane.Dockerfile -t talosmine/control-plane .
#
# Version lấy từ decision-register bảng D — KHÔNG tự nâng:
#   node 24.18.0 (DEC-T01, khớp .nvmrc và engines.node), pnpm 11.13.1 (DEC-T02).

# ─────────────────────────────────────────────────────────────────────────────
FROM node:24.18.0-bookworm-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.13.1 --activate
WORKDIR /app

# ─────────────────────────────────────────────────────────────────────────────
FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/control-plane/package.json apps/control-plane/
# `tests` là workspace package (pnpm-workspace.yaml) nên lockfile có importer cho nó.
# Thiếu manifest này thì `--frozen-lockfile` fail với ERR_PNPM_OUTDATED_LOCKFILE.
# Chỉ copy manifest, không copy test code.
COPY tests/package.json tests/

# ─────────────────────────────────────────────────────────────────────────────
# deps — có devDependencies vì build là `tsc -p tsconfig.build.json`.
FROM manifests AS deps
RUN pnpm install --frozen-lockfile

# ─────────────────────────────────────────────────────────────────────────────
# prod-deps — runtime dependency, không có typescript/tsx/drizzle-kit.
# drizzle-kit CỐ Ý không có trong image: migration KHÔNG chạy từ container runtime.
# Nó dùng role migration riêng nối trực tiếp PostgreSQL (DEC-T09), còn container này
# chạy bằng role runtime không có CREATE/ALTER/DROP. Giữ drizzle-kit ở đây chỉ tạo
# cám dỗ chạy DDL từ chỗ không được phép.
FROM manifests AS prod-deps
RUN pnpm install --frozen-lockfile --prod --filter @talosmine/control-plane

# ─────────────────────────────────────────────────────────────────────────────
FROM deps AS build
COPY tsconfig.base.json ./
COPY apps/control-plane apps/control-plane
# Output là dist/main-api.js + dist/main-worker.js (rootDir=src nên phẳng, không
# thành dist/src/...). CommonJS — xem apps/control-plane/tsconfig.json.
RUN pnpm --filter @talosmine/control-plane run build

# ─────────────────────────────────────────────────────────────────────────────
# migrate — image RIÊNG chỉ để áp migration, chạy một lần rồi thoát.
#
# VÌ SAO KHÔNG GỘP VÀO `runner`: stage `prod-deps` cố ý không có `drizzle-kit` (xem ghi chú
# ở đó). Migration cần quyền DDL và một session ổn định nối THẲNG PostgreSQL, còn container
# runtime chạy bằng role không có CREATE/ALTER/DROP và đi qua pooler. Gộp hai thứ vào một
# image là mở đường chạy DDL từ chỗ không được phép.
#
# Image này dựng từ stage `deps` nên có đủ devDependency. Nó KHÔNG được deploy như một
# service chạy dài — compose gọi nó một lần với `restart: "no"` rồi để nó thoát.
FROM deps AS migrate
WORKDIR /app/apps/control-plane

# `drizzle.config.ts` đọc `MIGRATION_DATABASE_URL` từ môi trường; thiếu là nó tự ném lỗi
# với thông điệp rõ ràng, nên không cần kiểm lại ở đây.
COPY apps/control-plane/drizzle.config.ts ./
COPY apps/control-plane/drizzle ./drizzle
# `schema: './src/**/schema.ts'` trong config — `drizzle-kit migrate` không đọc schema
# (chỉ `generate` mới cần), nhưng thiếu thư mục thì glob báo lỗi trước khi kịp chạy.
COPY apps/control-plane/src ./src

USER node
CMD ["node_modules/.bin/drizzle-kit", "migrate"]

# ─────────────────────────────────────────────────────────────────────────────
# runner — least privilege.
FROM base AS runner
ENV NODE_ENV=production

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=prod-deps --chown=node:node /app/apps/control-plane/node_modules ./apps/control-plane/node_modules
COPY --from=build --chown=node:node /app/apps/control-plane/dist ./apps/control-plane/dist
COPY --chown=node:node apps/control-plane/package.json ./apps/control-plane/

USER node
WORKDIR /app/apps/control-plane
# API_PORT default 3001 (apps/control-plane/src/shared/env.ts). EXPOSE chỉ là
# metadata, không tự publish port — chỉ Caddy expose ra ngoài (DEC-T11).
EXPOSE 3001

# `node` trực tiếp, không qua pnpm: pnpm sẽ là PID 1 và nuốt SIGTERM, khiến
# container mất graceful shutdown và bị SIGKILL sau timeout.
CMD ["node", "dist/main-api.js"]

# GHI CHÚ — worker dùng CHÍNH image này, chỉ đổi command:
#
#   worker:
#     image: <cùng image với api>
#     command: ["node", "dist/main-worker.js"]
#     # KHÔNG có `ports:` — worker không expose public API (phase-1 mục 9).
#
# GHI CHÚ — read-only filesystem (phase-1 mục 12):
# App này không ghi ra đĩa lúc chạy, nên `read_only: true` + tmpfs /tmp là khả thi.
# Ràng buộc đó thuộc compose, mà compose hiện chưa có service control-plane —
# nên CHƯA được kiểm chứng và không khai ở đây.
