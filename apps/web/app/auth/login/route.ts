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

  const returnTo = safeReturnTo(new URL(request.url).searchParams.get('returnTo'));

  const authorizationUrl = client.buildAuthorizationUrl(configuration, {
    redirect_uri: redirectUri(cfg),
    scope: SCOPE,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    nonce,
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
