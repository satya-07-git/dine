import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthOtpService } from './auth-otp.service';
import { AuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/auth/current-user.decorator';
import { RateLimit, RateLimiterGuard } from '../../common/auth/rate-limiter.guard';
import {
  RequestOtpRequestDto,
  RequestOtpResponseDto,
  VerifyOtpRequestDto,
  AuthSessionDto,
  RefreshTokenRequestDto,
  LogoutRequestDto,
  LogoutResponseDto,
} from '@dine/contracts';

@ApiTags('Identity & Access')
@Controller()
export class AuthOtpController {
  constructor(private readonly authOtpService: AuthOtpService) {}

  @Post(['auth/otp/request', 'api/v1/auth/otp/request', 'v1/auth/otp/request'])
  @UseGuards(RateLimiterGuard)
  @RateLimit({ maxRequests: 5, windowMs: 60000 })
  @ApiOperation({
    summary: 'Request phone OTP challenge (FR-A01, PRD §11.1)',
    description: 'Generates a 6-digit cryptographic challenge with rate limiting (max 3/10m) and enumeration protection. OTP value is redacted from responses and logs.',
  })
  @ApiResponse({ status: 201, description: 'OTP challenge generated successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request: Invalid phone number' })
  @ApiResponse({ status: 429, description: 'Too Many Requests: Rate limit exceeded' })
  async requestOtp(@Body() body: RequestOtpRequestDto): Promise<RequestOtpResponseDto> {
    return this.authOtpService.requestOtp(body);
  }

  @Post(['auth/otp/verify', 'api/v1/auth/otp/verify', 'v1/auth/otp/verify'])
  @ApiOperation({
    summary: 'Verify phone OTP and issue revocable session (FR-A01, FR-A02)',
    description: 'Verifies the 6-digit OTP code against salt/hash, consumes challenge, provisions profile, and returns an authenticated session with JWT and refresh token.',
  })
  @ApiResponse({ status: 200, description: 'OTP verified successfully; session issued' })
  @ApiResponse({ status: 400, description: 'Bad Request: Invalid OTP format or missing challenge' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Incorrect or expired OTP, or attempt budget exceeded' })
  async verifyOtp(@Body() body: VerifyOtpRequestDto): Promise<AuthSessionDto> {
    return this.authOtpService.verifyOtp(body);
  }

  @Post(['auth/refresh', 'api/v1/auth/refresh', 'v1/auth/refresh'])
  @ApiOperation({
    summary: 'Refresh session with token rotation & reuse detection (FR-A05)',
    description: 'Rotates the refresh token and issues a new access token. Replay of an already-used or revoked token revokes the entire session family.',
  })
  @ApiResponse({ status: 200, description: 'Session refreshed with new access and rotated refresh token' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Invalid, expired, or replayed refresh token' })
  async refreshToken(@Body() body: RefreshTokenRequestDto): Promise<AuthSessionDto> {
    return this.authOtpService.refreshToken(body);
  }

  @Post(['auth/logout', 'api/v1/auth/logout', 'v1/auth/logout'])
  @ApiOperation({
    summary: 'Revoke session and log out (FR-A05, PRD §11.1)',
    description: 'Immediately revokes the session and its refresh token. Revoked sessions are blocked from subsequent API calls and private room subscriptions.',
  })
  @ApiResponse({ status: 200, description: 'Session revoked successfully' })
  async logout(
    @Body() body: LogoutRequestDto,
    @Req() req: any
  ): Promise<LogoutResponseDto> {
    const authHeader = req.headers?.authorization;
    let sessionId = body?.sessionId;
    if (!sessionId && authHeader && authHeader.startsWith('Bearer ')) {
      // Decode sid from token if available
      try {
        const payloadPart = authHeader.substring(7).trim().split('.')[1];
        if (payloadPart) {
          const decoded = JSON.parse(Buffer.from(payloadPart, 'base64').toString('utf8'));
          if (decoded.sid) sessionId = decoded.sid;
        }
      } catch {}
    }
    return this.authOtpService.logout(sessionId, body?.refreshToken);
  }
}
