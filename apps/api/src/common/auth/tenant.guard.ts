import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DatabaseService } from '../db/database.service';
import { AuthenticatedUser } from './current-user.decorator';

export const RESTAURANT_ROLES_KEY = 'restaurant_roles';
export const RequireRestaurantRoles = (...roles: Array<'OWNER' | 'MANAGER' | 'HOST'>) =>
  SetMetadata(RESTAURANT_ROLES_KEY, roles);

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: DatabaseService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser = request.user;

    if (!user || !user.userId) {
      throw new ForbiddenException('Unauthenticated request cannot access tenant resource');
    }

    // Extract restaurant ID from route params, query, body, or headers
    const restaurantId =
      request.params?.restaurantId ||
      request.params?.id ||
      request.body?.restaurant_id ||
      request.body?.restaurantId ||
      request.query?.restaurant_id ||
      request.query?.restaurantId ||
      request.headers?.['x-restaurant-id'];

    if (!restaurantId) {
      // If no restaurant context is targeted, allow next handlers to validate specific resources
      return true;
    }

    // 1. Check if memberships are pre-populated in user token
    let membership = user.memberships?.find((m) => m.restaurantId === restaurantId);

    // 2. Query database for live authoritative status and role
    try {
      const pool = this.db.getPool();
      const res = await pool.query(
        `SELECT role, status FROM restaurant_memberships 
         WHERE restaurant_id = $1 AND user_id = $2 
         LIMIT 1`,
        [restaurantId, user.userId]
      );

      if (res.rows.length > 0) {
        membership = {
          restaurantId,
          role: res.rows[0].role,
          status: res.rows[0].status,
        };
      }
    } catch {
      // If DB is offline or mock mode, rely on user.memberships if available
    }

    if (!membership) {
      throw new ForbiddenException(
        `FORBIDDEN_TENANT_ACCESS: Caller does not have membership in restaurant ${restaurantId}`
      );
    }

    if (membership.status !== 'ACTIVE') {
      throw new ForbiddenException(
        `FORBIDDEN_TENANT_ACCESS: Membership in restaurant ${restaurantId} is ${membership.status}`
      );
    }

    // 3. Check role requirements
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(RESTAURANT_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (requiredRoles && requiredRoles.length > 0) {
      if (!requiredRoles.includes(membership.role)) {
        throw new ForbiddenException(
          `ROLE_NOT_AUTHORIZED: Caller role ${membership.role} lacks required permissions [${requiredRoles.join(
            ', '
          )}] for this restaurant resource`
        );
      }
    }

    // Attach verified tenant membership context to request
    request.membership = membership;
    return true;
  }
}
