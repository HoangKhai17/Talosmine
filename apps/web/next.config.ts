import type { NextConfig } from 'next';

/**
 * DEC-T12: `remotePatterns` cố ý KHÔNG được khai báo ở đây.
 *
 * Browser không load ảnh trực tiếp từ origin ngoài; ảnh đi qua Next image optimizer
 * nên host gốc không lộ ra client và CSP không cần mở cho domain ngoài. Thêm một host
 * ảnh mới là quyết định cần record riêng, không phải sửa config tiện tay.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Không để build lặng lẽ pass khi type sai.
  // (Next 16 bỏ key `eslint` khỏi NextConfig; lint của repo do Biome đảm nhiệm — DEC-T04.)
  typescript: { ignoreBuildErrors: false },

  // Không lộ chi tiết framework/version ra response header.
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // CSP KHÔNG đặt ở đây: nó cần một nonce mới cho mỗi request, mà `headers()`
          // chỉ sinh header tĩnh lúc build. CSP theo DEC-T12 được đặt tại `proxy.ts`.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
