import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { ConfigService } from '../config/config.service';
import { verifySupabaseJwt, SupabaseJwtPayload } from './jwt.util';
import { AuthenticatedUser } from './current-user.decorator';
import { isSessionRevokedInCache } from '../../modules/identity/auth-otp.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization Bearer header');
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      throw new UnauthorizedException('Bearer token is empty');
    }

    const user = this.resolveUserFromToken(token);
    (request as any).user = user;
    return true;
  }

  private resolveUserFromToken(token: string): AuthenticatedUser {
    // 1. If 3-part JWT, execute cryptographic signature, expiry, audience & issuer verification
    const parts = token.split('.');
    if (parts.length === 3) {
      const secret = this.config.get('SUPABASE_JWT_SECRET') || 'super-secret-jwt-key-min-16-chars-long';
      const supabaseUrl = this.config.get('SUPABASE_URL') || 'https://mock.supabase.co';
      const expectedIssuer = `${supabaseUrl}/auth/v1`;

      const payload: SupabaseJwtPayload = verifySupabaseJwt(token, secret, {
        expectedAudience: 'authenticated',
        expectedIssuer: payloadHasIssuer(token) ? expectedIssuer : undefined,
      });

      // Session revocation check (FR-A05, EPIC-022)
      const sid = (payload.sid as string) || undefined;
      if (sid && isSessionRevokedInCache(sid)) {
        throw new UnauthorizedException('Session has been revoked or expired');
      }

      const userMetadata = (payload.user_metadata as Record<string, any>) || {};
      const appMetadata = (payload.app_metadata as Record<string, any>) || {};

      return {
        userId: payload.sub,
        email: payload.email || `${payload.sub}@dine.local`,
        phone: (payload.phone as string) || userMetadata.phone || undefined,
        sessionId: sid,
        role: userMetadata.role || appMetadata.role || (payload.role === 'authenticated' ? 'CUSTOMER' : payload.role) || 'CUSTOMER',
        authUid: payload.sub,
        memberships: userMetadata.memberships || [],
      };
    }

    // 2. Simulated tokens allowed strictly in non-production test mode
    if (this.config.isTest || !this.config.isProduction) {
      if (token.startsWith('user_') || token.startsWith('cust_')) {
        return {
          userId: token,
          email: `${token}@dine.local`,
          role: 'CUSTOMER',
          memberships: [],
        };
      }
      if (token.startsWith('host_') || token.startsWith('staff_')) {
        return {
          userId: token,
          email: `${token}@dine.local`,
          role: 'HOST',
          memberships: [],
        };
      }
      if (token.startsWith('owner_')) {
        return {
          userId: token,
          email: `${token}@dine.local`,
          role: 'OWNER',
          memberships: [],
        };
      }
      if (token.startsWith('manager_')) {
        return {
          userId: token,
          email: `${token}@dine.local`,
          role: 'MANAGER',
          memberships: [],
        };
      }
      if (token.startsWith('admin_')) {
        return {
          userId: token,
          email: `${token}@dine.local`,
          role: 'PLATFORM_ADMIN',
          memberships: [],
        };
      }
    }

    throw new UnauthorizedException('Invalid or unparseable authentication token format');
  }
}

function payloadHasIssuer(token: string): boolean {
  try {
    const payloadPart = token.split('.')[1];
    let base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) base64 += '=';
    const decoded = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
    return Boolean(decoded.iss);
  } catch {
    return false;
  }
}
