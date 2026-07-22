import { NextResponse } from 'next/server';
import * as client from 'openid-client';
import { requireOidcConfig } from '../../../server/env';
import {
  getOidcConfiguration,
  redirectUri,
  SCOPE,
  safeReturnTo,
  TRANSACTION_COOKIE,
  type Transaction,
} from '../../../server/oidc';

/**
 * Chặng 1 của đăng nhập: sinh PKCE + state + nonce, cất vào cookie, rồi đẩy sang IdP.
 *
 * Ba giá trị này bảo vệ ba thứ khác nhau và không thay thế nhau được:
 *   - code_verifier (PKCE): authorization code bị chặn cũng vô dụng nếu không có verifier.
 *   - state: chống CSRF — chứng minh callback này thuộc về phiên đăng nhập ta khởi tạo.
 *   - nonce: buộc id_token phải gắn với chính request này, chống replay token cũ.
 */
export async function GET(request: Request): Promise<Response> {
  const cfg = requireOidcConfig();
  const configuration = await getOidcConfiguration();

  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();
  const nonce = client.randomNonce();

  const params = new URL(request.url).searchParams;
  const returnTo = safeReturnTo(params.get('returnTo'));

  /**
   * Mở thẳng màn hình ĐĂNG KÝ thay vì đăng nhập.
   *
   * `first_screen` là tham số riêng của Logto, không thuộc chuẩn OIDC. Đã kiểm chứng trên
   * bản 1.41 (2026-07-22): `/oidc/auth?...&first_screen=register` chuyển hướng tới
   * `/register`, không có tham số thì tới `/sign-in`.
   *
   * Chỉ nhận đúng MỘT giá trị từ query. Không chuyển tiếp thẳng giá trị người dùng gõ vào
   * tham số của IdP — đó là cách một tham số vô hại trở thành chỗ chèn thứ khác.
   */
  const firstScreen = params.get('screen') === 'register' ? { first_screen: 'register' } : {};

  const authorizationUrl = client.buildAuthorizationUrl(configuration, {
    redirect_uri: redirectUri(cfg),
    scope: SCOPE,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    nonce,
    ...firstScreen,
  });

  const transaction: Transaction = { state, nonce, codeVerifier, returnTo };

  const response = NextResponse.redirect(authorizationUrl.toString(), {
    // Redirect của luồng đăng nhập không bao giờ được cache: mỗi lần phải sinh state mới.
    headers: { 'Cache-Control': 'no-store' },
  });

  response.cookies.set(TRANSACTION_COOKIE, JSON.stringify(transaction), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax', // 'lax' chứ không 'strict': IdP redirect NGƯỢC về ta là cross-site.
    path: '/',
    maxAge: 60 * 10, // 10 phút là quá đủ để đăng nhập; hết hạn thì bắt đầu lại.
  });

  return response;
}
