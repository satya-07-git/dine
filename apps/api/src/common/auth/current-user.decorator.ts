import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface UserMembership {
  restaurantId: string;
  role: 'OWNER' | 'MANAGER' | 'HOST';
  status: 'ACTIVE' | 'INVITED' | 'SUSPENDED';
}

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role?: string;
  phone?: string;
  sessionId?: string;
  authUid?: string;
  restaurantId?: string;
  memberships?: UserMembership[];
}

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  }
);
