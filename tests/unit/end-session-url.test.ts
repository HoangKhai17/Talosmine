import { describe, expect, it } from 'vitest';
import { buildEndSessionUrl } from '../../apps/web/server/oidc';

/**
 * URL kết thúc phiên IdP (RP-Initiated Logout).
 *
 * Bối cảnh: trước đây "Đăng xuất" chỉ thu hồi phiên Talosmine, còn phiên Logto (14 ngày) vẫn
 * sống — nên bấm "Đăng nhập" là vào lại tài khoản cũ mà không cần mật khẩu. Trên máy dùng
 * chung đó là lỗ hổng.
 *
 * Hai điều bộ test này khoá lại:
 *   1. Dùng `client_id`, KHÔNG dùng `id_token_hint` — để không phải lưu token của IdP.
 *   2. `post_logout_redirect_uri` giữ NGUYÊN VĂN, vì Logto so khớp chính xác từng ký tự.
 */

const BASE = {
  endSessionEndpoint: 'http://localhost:3001/oidc/session/end',
  clientId: 'app-client-id',
  postLogoutRedirectUri: 'http://localhost:3000',
};

describe('buildEndSessionUrl', () => {
  it('gắn client_id và post_logout_redirect_uri', () => {
    const url = new URL(buildEndSessionUrl(BASE));

    expect(url.origin + url.pathname).toBe('http://localhost:3001/oidc/session/end');
    expect(url.searchParams.get('client_id')).toBe('app-client-id');
    expect(url.searchParams.get('post_logout_redirect_uri')).toBe('http://localhost:3000');
  });

  /**
   * `id_token_hint` là cách thay thế được spec cho phép, nhưng nó buộc phải lưu `id_token`
   * suốt vòng đời phiên. `/auth/callback` cố ý KHÔNG giữ token của IdP — nếu ai đó đổi sang
   * `id_token_hint`, test này đỏ và buộc phải xem lại quyết định đó.
   */
  it('KHÔNG gửi id_token_hint', () => {
    const url = new URL(buildEndSessionUrl(BASE));
    expect(url.searchParams.has('id_token_hint')).toBe(false);
  });

  /**
   * Logto so khớp `post_logout_redirect_uri` CHÍNH XÁC với giá trị đã đăng ký. Thừa một dấu
   * `/` ở cuối là bị từ chối, và lỗi hiện ra ở tận bước confirm — rất khó lần ra.
   */
  it('giữ nguyên văn redirect URI, không thêm dấu `/` ở cuối', () => {
    const url = new URL(buildEndSessionUrl(BASE));
    expect(url.searchParams.get('post_logout_redirect_uri')).not.toMatch(/\/$/);
  });

  it('không nhân đôi tham số khi endpoint đã có query sẵn', () => {
    const url = new URL(
      buildEndSessionUrl({
        ...BASE,
        endSessionEndpoint: 'https://idp.example.com/session/end?tenant=abc',
      }),
    );

    expect(url.searchParams.get('tenant')).toBe('abc');
    expect(url.searchParams.getAll('client_id')).toHaveLength(1);
  });

  it('mã hoá đúng giá trị có ký tự đặc biệt', () => {
    const raw = buildEndSessionUrl({ ...BASE, postLogoutRedirectUri: 'https://a.example/x y' });
    // Khoảng trắng phải được mã hoá; nếu không, URL bị cắt ở chỗ không ai ngờ.
    expect(raw).not.toContain('x y');
    expect(new URL(raw).searchParams.get('post_logout_redirect_uri')).toBe('https://a.example/x y');
  });
});
