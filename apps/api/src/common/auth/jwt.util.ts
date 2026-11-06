import * as crypto from 'crypto';
import { UnauthorizedException } from '@nestjs/common';

export interface SupabaseJwtPayload {
  sub: string;
  email?: string;
  role?: string;
  aud?: string;
  iss?: string;
  exp?: number;
  iat?: number;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface VerifyJwtOptions {
  expectedAudience?: string;
  expectedIssuer?: string;
  clockToleranceSeconds?: number;
}

function base64UrlEncode(data: string | Buffer): string {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * Sign a Supabase HS256 JWT using HMAC-SHA256.
 */
export function signSupabaseToken(
  payload: Partial<SupabaseJwtPayload> & { sub: string },
  secret: string,
  options?: { expiresInSeconds?: number; issuer?: string; audience?: string }
): string {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: SupabaseJwtPayload = {
    aud: options?.audience ?? 'authenticated',
    iss: options?.issuer ?? 'https://mock.supabase.co/auth/v1',
    iat: now,
    exp: now + (options?.expiresInSeconds ?? 3600),
    role: 'authenticated',
    ...payload,
  };

  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(fullPayload));

  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest();
  const signatureB64 = base64UrlEncode(signature);

  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

/**
 * Verify Supabase HS256 JWT signature, expiry, audience, and issuer.
 */
export function verifySupabaseJwt(
  token: string,
  secret: string,
  options: VerifyJwtOptions = {}
): SupabaseJwtPayload {
  if (!token || typeof token !== 'string') {
    throw new UnauthorizedException('Missing token');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new UnauthorizedException('Malformed JWT token structure');
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  // 1. Verify Header
  let header: { alg?: string; typ?: string };
  try {
    header = JSON.parse(base64UrlDecode(headerB64));
  } catch {
    throw new UnauthorizedException('Invalid JWT header format');
  }

  if (header.alg !== 'HS256') {
    throw new UnauthorizedException(`Unsupported JWT algorithm: ${header.alg}`);
  }

  // 2. Verify Signature with constant-time comparison
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest();
  const expectedSignatureB64 = base64UrlEncode(expectedSignature);

  const sigBuffer = Buffer.from(signatureB64, 'utf8');
  const expectedSigBuffer = Buffer.from(expectedSignatureB64, 'utf8');

  if (sigBuffer.length !== expectedSigBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedSigBuffer)) {
    throw new UnauthorizedException('Invalid JWT signature');
  }

  // 3. Decode & Verify Payload
  let payload: SupabaseJwtPayload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64));
  } catch {
    throw new UnauthorizedException('Invalid JWT payload format');
  }

  const now = Math.floor(Date.now() / 1000);
  const tolerance = options.clockToleranceSeconds ?? 0;

  // 4. Verify Expiration
  if (payload.exp !== undefined && payload.exp + tolerance <= now) {
    throw new UnauthorizedException('Token has expired');
  }

  // 5. Verify Audience
  const expectedAud = options.expectedAudience ?? 'authenticated';
  if (payload.aud && payload.aud !== expectedAud) {
    throw new UnauthorizedException(`Invalid token audience: expected ${expectedAud}, received ${payload.aud}`);
  }

  // 6. Verify Issuer if configured
  if (options.expectedIssuer && payload.iss && payload.iss !== options.expectedIssuer) {
    throw new UnauthorizedException(`Invalid token issuer: expected ${options.expectedIssuer}, received ${payload.iss}`);
  }

  // 7. Verify Subject
  if (!payload.sub || typeof payload.sub !== 'string') {
    throw new UnauthorizedException('Token missing valid subject (sub) claim');
  }

  return payload;
}
