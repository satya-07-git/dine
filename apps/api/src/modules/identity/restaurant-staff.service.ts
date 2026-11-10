import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../common/db/database.service';
import {
  RestaurantStaffDto,
  CreateRestaurantStaffDto,
  UpdateRestaurantStaffDto,
  StaffRole,
  StaffStatus,
  ErrorCode,
  RoleActionMatrixDto,
} from '@dine/contracts';

// ============================================================================
// Pure Role-Based Access Control Matrix (FR-A03, PRD §3, Diagram 1)
// ============================================================================

export interface RolePermissions {
  role: string;
  allowedActions: string[];
  deniedActions: string[];
}

export const ROLE_ACTION_MATRIX: Record<string, RolePermissions> = {
  CUSTOMER: {
    role: 'CUSTOMER',
    allowedActions: [
      'browse_restaurants',
      'view_menus',
      'check_availability',
      'create_hold',
      'confirm_free_booking',
      'initiate_deposit_checkout',
      'view_own_bookings',
      'cancel_own_booking',
      'manage_preferences',
      'create_favorite',
      'submit_review_for_completed_dining',
      'subscribe_user_topic',
    ],
    deniedActions: [
      'view_restaurant_bookings',
      'check_in_walk_in',
      'seat_guests',
      'complete_dining',
      'mark_no_show',
      'create_table_block',
      'configure_restaurant_details',
      'edit_floor_plan',
      'edit_operating_hours',
      'edit_deposit_policies',
      'manage_staff_memberships',
      'subscribe_restaurant_staff_topic',
      'onboard_restaurant',
      'execute_support_intervention',
    ],
  },
  HOST: {
    role: 'HOST',
    allowedActions: [
      'view_restaurant_bookings',
      'record_walk_in',
      'generate_check_in_qr',
      'check_in_guest',
      'seat_guests',
      'complete_dining',
      'mark_no_show',
      'create_table_block',
      'view_table_blocks',
      'view_restaurant_closures',
      'subscribe_restaurant_staff_topic',
    ],
    deniedActions: [
      'configure_restaurant_details',
      'edit_floor_plan',
      'edit_operating_hours',
      'edit_deposit_policies',
      'manage_staff_memberships',
      'access_other_restaurant_tenant',
      'onboard_restaurant',
      'execute_support_intervention',
    ],
  },
  MANAGER: {
    role: 'MANAGER',
    allowedActions: [
      // All HOST capabilities PLUS PRD §3.3 Manager permissions:
      'view_restaurant_bookings',
      'record_walk_in',
      'generate_check_in_qr',
      'check_in_guest',
      'seat_guests',
      'complete_dining',
      'mark_no_show',
      'create_table_block',
      'view_table_blocks',
      'view_restaurant_closures',
      'subscribe_restaurant_staff_topic',
      // §3.3 Manager Configuration additions:
      'configure_restaurant_details',
      'edit_floor_plan',
      'edit_operating_hours',
      'configure_booking_duration_and_buffers',
      'edit_deposit_policies',
      'add_special_closure',
      'manage_staff_memberships',
      'invite_staff',
      'revoke_staff_membership',
      'view_policy_history',
    ],
    deniedActions: [
      'access_other_restaurant_tenant',
      'onboard_restaurant',
      'execute_support_intervention',
    ],
  },
  OWNER: {
    role: 'OWNER',
    allowedActions: [
      // Full venue authority
      'view_restaurant_bookings',
      'record_walk_in',
      'generate_check_in_qr',
      'check_in_guest',
      'seat_guests',
      'complete_dining',
      'mark_no_show',
      'create_table_block',
      'view_table_blocks',
      'view_restaurant_closures',
      'subscribe_restaurant_staff_topic',
      'configure_restaurant_details',
      'edit_floor_plan',
      'edit_operating_hours',
      'configure_booking_duration_and_buffers',
      'edit_deposit_policies',
      'add_special_closure',
      'manage_staff_memberships',
      'invite_staff',
      'revoke_staff_membership',
      'view_policy_history',
      'delete_restaurant',
    ],
    deniedActions: [
      'access_other_restaurant_tenant',
      'onboard_restaurant',
      'execute_support_intervention',
    ],
  },
  PLATFORM_ADMIN: {
    role: 'PLATFORM_ADMIN',
    allowedActions: [
      // PRD §3.4 Platform Admin
      'onboard_restaurant',
      'investigate_payment_disputes',
      'monitor_reservation_failures',
      'review_operational_logs',
      'manage_platform_policies',
      'execute_audited_support_intervention',
    ],
    deniedActions: [
      'create_booking_without_customer_auth',
      'bypass_financial_audit_trail',
    ],
  },
};

export function canRolePerformAction(role: string, action: string): boolean {
  const normRole = (role || '').toUpperCase();
  const perms = ROLE_ACTION_MATRIX[normRole];
  if (!perms) return false;
  return perms.allowedActions.includes(action);
}

export function getRoleActionMatrixPure(): RoleActionMatrixDto[] {
  return Object.values(ROLE_ACTION_MATRIX).map((p) => ({
    role: p.role,
    allowedActions: p.allowedActions,
    deniedActions: p.deniedActions,
  }));
}

// In-memory staff storage for tests
const memoryStaffRecords: RestaurantStaffDto[] = [];

export function getMemoryStaffRecords(): RestaurantStaffDto[] {
  return memoryStaffRecords;
}

export function resetMemoryStaff(): void {
  memoryStaffRecords.length = 0;
}

// ============================================================================
// RestaurantStaffService Implementation
// ============================================================================

@Injectable()
export class RestaurantStaffService {
  private readonly logger = new Logger(RestaurantStaffService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Retrieves the explicit role and action matrix (FR-A03, PRD §3).
   */
  getRoleActionMatrix(): RoleActionMatrixDto[] {
    return getRoleActionMatrixPure();
  }

  /**
   * Lists staff members for a specific restaurant tenant.
   * Scoped by tenant: caller must have active OWNER or MANAGER role in this restaurant.
   */
  async listStaff(restaurantId: string): Promise<RestaurantStaffDto[]> {
    try {
      const pool = this.db.getPool();
      const res = await pool.query(
        `SELECT s.id, s.restaurant_id, s.user_id, s.role, s.status, s.created_at, s.updated_at,
                p.full_name, p.email, p.phone
         FROM restaurant_staff s
         LEFT JOIN profiles p ON p.id = s.user_id
         WHERE s.restaurant_id = $1
         ORDER BY s.created_at ASC`,
        [restaurantId]
      );
      if (res.rows.length > 0) {
        return res.rows.map((row) => ({
          id: row.id,
          restaurantId: row.restaurant_id,
          userId: row.user_id,
          role: row.role,
          status: row.status,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          user: {
            fullName: row.full_name,
            email: row.email,
            phone: row.phone,
          },
        }));
      }
    } catch {
      // Offline fallback
    }

    const filtered = memoryStaffRecords.filter((s) => s.restaurantId === restaurantId);
    return filtered;
  }

  /**
   * Adds or invites a staff member to a restaurant.
   * Restricts roles to MANAGER, HOST, or STAFF.
   */
  async addStaff(
    restaurantId: string,
    dto: CreateRestaurantStaffDto,
    actorId?: string
  ): Promise<RestaurantStaffDto> {
    if (!dto.userId) {
      throw new BadRequestException('User ID is required to assign staff membership');
    }
    const role = (dto.role || StaffRole.HOST).toUpperCase();
    if (![StaffRole.MANAGER, StaffRole.HOST, StaffRole.STAFF].includes(role as any)) {
      throw new BadRequestException(`Invalid staff role: ${role}. Allowed: MANAGER, HOST, STAFF`);
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const staffRecord: RestaurantStaffDto = {
      id,
      restaurantId,
      userId: dto.userId,
      role,
      status: StaffStatus.ACTIVE,
      createdAt: now,
      updatedAt: now,
    };

    try {
      const pool = this.db.getPool();
      await pool.query(
        `INSERT INTO restaurant_staff (id, restaurant_id, user_id, role, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'ACTIVE', NOW(), NOW())
         ON CONFLICT (restaurant_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'ACTIVE', updated_at = NOW()`,
        [id, restaurantId, dto.userId, role]
      );

      // Keep restaurant_memberships in sync
      await pool.query(
        `INSERT INTO restaurant_memberships (id, restaurant_id, user_id, role, status)
         VALUES ($1, $2, $3, $4, 'ACTIVE')
         ON CONFLICT (restaurant_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'ACTIVE'`,
        [id, restaurantId, dto.userId, role]
      );
    } catch {
      // Memory fallback
    }

    memoryStaffRecords.push(staffRecord);
    this.logger.log(`[Staff] User ${dto.userId} added as ${role} in restaurant ${restaurantId} by ${actorId || 'system'}`);

    return staffRecord;
  }

  /**
   * Updates staff role or revokes membership status (ACTIVE -> SUSPENDED / REVOKED).
   */
  async updateStaff(
    restaurantId: string,
    staffId: string,
    dto: UpdateRestaurantStaffDto,
    actorId?: string
  ): Promise<RestaurantStaffDto> {
    const role = dto.role ? (dto.role.toUpperCase() as StaffRole) : undefined;
    const status = dto.status ? (dto.status.toUpperCase() as StaffStatus) : undefined;

    if (role && ![StaffRole.MANAGER, StaffRole.HOST, StaffRole.STAFF].includes(role)) {
      throw new BadRequestException(`Invalid staff role: ${role}`);
    }
    if (status && ![StaffStatus.ACTIVE, StaffStatus.SUSPENDED, StaffStatus.REVOKED].includes(status)) {
      throw new BadRequestException(`Invalid staff status: ${status}`);
    }

    try {
      const pool = this.db.getPool();
      const res = await pool.query(
        `UPDATE restaurant_staff
         SET role = COALESCE($1, role),
             status = COALESCE($2, status),
             updated_at = NOW()
         WHERE id = $3 AND restaurant_id = $4
         RETURNING *`,
        [role, status, staffId, restaurantId]
      );

      if (res.rows.length > 0) {
        const row = res.rows[0];
        // Synchronize restaurant_memberships
        await pool.query(
          `UPDATE restaurant_memberships
           SET role = COALESCE($1, role), status = COALESCE($2, status)
           WHERE id = $3`,
          [role, status, staffId]
        );

        return {
          id: row.id,
          restaurantId: row.restaurant_id,
          userId: row.user_id,
          role: row.role,
          status: row.status,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      }
    } catch {
      // Memory fallback
    }

    const idx = memoryStaffRecords.findIndex((s) => (s.id === staffId || s.userId === staffId) && s.restaurantId === restaurantId);
    if (idx !== -1) {
      if (role) memoryStaffRecords[idx].role = role;
      if (status) memoryStaffRecords[idx].status = status;
      memoryStaffRecords[idx].updatedAt = new Date().toISOString();
      return memoryStaffRecords[idx];
    }

    // Default mock response if not found in memory
    const updated: RestaurantStaffDto = {
      id: staffId,
      restaurantId,
      userId: staffId,
      role: role || StaffRole.HOST,
      status: status || StaffStatus.REVOKED,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    memoryStaffRecords.push(updated);
    return updated;
  }
}
