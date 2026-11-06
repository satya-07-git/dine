import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/db/database.service';
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from '../../common/errors/app-error';
import {
  RestaurantFloorPlanDto,
  FloorDto,
  RestaurantTableDto,
  UpdateFloorPlanRequestDto,
  UpdateFloorPlanResponseDto,
  UpdateFloorPlanTableDto,
  ErrorCode,
} from '@dine/contracts';

/**
 * Validates table capacity and minimum covers bounds.
 */
export function validateTableCapacity(
  capacity: any,
  minCovers: any = 1
): { capacity: number; minCovers: number } {
  if (
    capacity === undefined ||
    capacity === null ||
    typeof capacity !== 'number' ||
    !Number.isInteger(capacity) ||
    capacity <= 0
  ) {
    throw new ValidationError('Table capacity must be a positive integer');
  }

  const min = minCovers !== undefined && minCovers !== null ? minCovers : 1;
  if (typeof min !== 'number' || !Number.isInteger(min) || min <= 0) {
    throw new ValidationError('Table min_covers must be a positive integer');
  }

  if (min > capacity) {
    throw new ValidationError(
      `Table min_covers (${min}) cannot exceed capacity (${capacity})`
    );
  }

  return { capacity, minCovers: min };
}

/**
 * Validates normalized table geometry coordinates and bounding dimensions.
 */
export function validateTableGeometry(
  x: any,
  y: any,
  w: any,
  h: any
): { x: number; y: number; w: number; h: number } {
  const numX = Number(x);
  const numY = Number(y);
  const numW = Number(w);
  const numH = Number(h);

  if (
    isNaN(numX) ||
    isNaN(numY) ||
    isNaN(numW) ||
    isNaN(numH) ||
    !isFinite(numX) ||
    !isFinite(numY) ||
    !isFinite(numW) ||
    !isFinite(numH)
  ) {
    throw new ValidationError(
      'Table geometry coordinates and dimensions must be finite numbers'
    );
  }

  if (numX < 0 || numY < 0) {
    throw new ValidationError(
      'Table coordinates (x, y) must be non-negative numbers'
    );
  }

  if (numW <= 0 || numH <= 0) {
    throw new ValidationError(
      'Table dimensions (w, h) must be strictly positive numbers'
    );
  }

  if (numX + numW > 1000 || numY + numH > 1000) {
    throw new ValidationError(
      'Table geometry exceeds floor canvas boundary (max 1000 units)'
    );
  }

  return { x: numX, y: numY, w: numW, h: numH };
}

/**
 * Validates an entire floor plan table inventory payload.
 */
export function validateFloorPlanTables(tables: any[]): UpdateFloorPlanTableDto[] {
  if (!Array.isArray(tables) || tables.length === 0) {
    throw new ValidationError('Floor plan must contain at least one table');
  }

  const seenNumbers = new Set<string>();

  return tables.map((t, index) => {
    if (!t || typeof t !== 'object') {
      throw new ValidationError(`Invalid table item at index ${index}`);
    }

    const tableNumber = String(t.table_number || '').trim();
    if (!tableNumber) {
      throw new ValidationError(
        `Table at index ${index} must have a non-empty table_number`
      );
    }

    const upperNumber = tableNumber.toUpperCase();
    if (seenNumbers.has(upperNumber)) {
      throw new ValidationError(
        `Duplicate table_number "${tableNumber}" in floor plan layout`
      );
    }
    seenNumbers.add(upperNumber);

    const { capacity, minCovers } = validateTableCapacity(t.capacity, t.min_covers);
    const { x, y, w, h } = validateTableGeometry(t.x, t.y, t.w, t.h);

    return {
      id: t.id ? String(t.id) : undefined,
      table_number: tableNumber,
      capacity,
      min_covers: minCovers,
      zone: String(t.zone || 'MAIN').trim().toUpperCase(),
      x,
      y,
      w,
      h,
      is_active: t.is_active !== undefined ? Boolean(t.is_active) : true,
    };
  });
}

@Injectable()
export class FloorPlansService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Retrieves active versioned floor plan and stable table geometry for a restaurant.
   * Public projection contains static geometry, capacities, and stable IDs without mutable availability flags.
   */
  async getActiveFloorPlan(restaurantId: string): Promise<RestaurantFloorPlanDto> {
    const pool = this.db.getPool();

    // 1. Verify restaurant existence
    const restRes = await pool.query(
      `SELECT id, name, status, is_published FROM restaurants WHERE id = $1`,
      [restaurantId]
    );
    if (restRes.rows.length === 0) {
      throw new NotFoundError(`Restaurant with ID ${restaurantId} not found`);
    }

    // 2. Query floors for restaurant
    const floorsRes = await pool.query(
      `SELECT id, restaurant_id, name, floor_number, current_version, created_at
       FROM floors
       WHERE restaurant_id = $1
       ORDER BY floor_number ASC, created_at ASC`,
      [restaurantId]
    );

    const floorDtos: FloorDto[] = [];

    for (const fl of floorsRes.rows) {
      // Fetch latest active version
      const verRes = await pool.query(
        `SELECT id, version_number, svg_layout_url, layout_snapshot, is_active
         FROM floor_plan_versions
         WHERE floor_id = $1 AND is_active = true
         ORDER BY version_number DESC
         LIMIT 1`,
        [fl.id]
      );
      const activeVersion = verRes.rows[0];

      // Fetch active physical tables with stable IDs
      const tablesRes = await pool.query(
        `SELECT id, floor_id, table_number, capacity, min_covers, zone, x, y, w, h, is_active, created_at
         FROM restaurant_tables
         WHERE floor_id = $1 AND is_active = true
         ORDER BY table_number ASC`,
        [fl.id]
      );

      const tableDtos: RestaurantTableDto[] = tablesRes.rows.map((t: any) => ({
        id: t.id,
        floor_id: t.floor_id,
        table_number: t.table_number,
        capacity: t.capacity,
        min_covers: t.min_covers,
        zone: t.zone,
        x: parseFloat(t.x),
        y: parseFloat(t.y),
        w: parseFloat(t.w),
        h: parseFloat(t.h),
        is_active: t.is_active,
        created_at: t.created_at ? t.created_at.toISOString() : undefined,
      }));

      floorDtos.push({
        id: fl.id,
        restaurant_id: fl.restaurant_id,
        name: fl.name,
        floor_number: fl.floor_number,
        version_number: activeVersion ? activeVersion.version_number : fl.current_version,
        svg_layout_url: activeVersion ? activeVersion.svg_layout_url : null,
        tables: tableDtos,
        created_at: fl.created_at ? fl.created_at.toISOString() : undefined,
      });
    }

    return {
      restaurant_id: restaurantId,
      floors: floorDtos,
    };
  }

  /**
   * Updates floor plan layout and tables with an optimistic compare-and-update version guard.
   * Protects active holds and confirmed reservations against table deletion and retirement.
   */
  async updateFloorPlan(
    restaurantId: string,
    updateDto: UpdateFloorPlanRequestDto,
    actorId?: string,
    requestId?: string
  ): Promise<UpdateFloorPlanResponseDto> {
    if (!updateDto || !updateDto.floor_id) {
      throw new ValidationError('floor_id is required');
    }
    if (
      updateDto.base_version === undefined ||
      updateDto.base_version === null ||
      typeof updateDto.base_version !== 'number'
    ) {
      throw new ValidationError('base_version is required and must be an integer');
    }

    const validatedTables = validateFloorPlanTables(updateDto.tables);
    const pool = this.db.getPool();

    // 1. Check floor existence & restaurant tenant boundary
    const floorRes = await pool.query(
      `SELECT id, restaurant_id, name, floor_number, current_version FROM floors WHERE id = $1`,
      [updateDto.floor_id]
    );
    if (floorRes.rows.length === 0) {
      throw new NotFoundError(`Floor with ID ${updateDto.floor_id} not found`);
    }

    const floor = floorRes.rows[0];
    if (floor.restaurant_id !== restaurantId) {
      throw new ForbiddenError(
        `Floor ${updateDto.floor_id} does not belong to restaurant ${restaurantId}`
      );
    }

    // 2. Optimistic version guard: base_version must match floor.current_version
    if (floor.current_version !== updateDto.base_version) {
      throw new ConflictError(
        `Floor plan version conflict: current version is ${floor.current_version} but base_version supplied was ${updateDto.base_version}. Reload the latest floor plan layout before saving.`,
        ErrorCode.VERSION_CONFLICT
      );
    }

    // 3. Allocation / Reservation Protection Guard:
    // Check existing tables on this floor to ensure no active holds or bookings are erased.
    const existingTablesRes = await pool.query(
      `SELECT id, table_number, is_active FROM restaurant_tables WHERE floor_id = $1`,
      [floor.id]
    );
    const existingTables: Array<{ id: string; table_number: string; is_active: boolean }> =
      existingTablesRes.rows;
    const existingTableMap = new Map(existingTables.map((t) => [t.id, t]));

    const submittedTableIds = new Set(
      validatedTables.filter((t) => t.id).map((t) => t.id as string)
    );

    // Identify tables being removed (omitted) or explicitly retired (is_active: false)
    const tablesBeingRetired: Array<{ id: string; table_number: string }> = [];
    for (const exTable of existingTables) {
      if (!submittedTableIds.has(exTable.id)) {
        // Table omitted from layout
        tablesBeingRetired.push(exTable);
      } else {
        const sub = validatedTables.find((t) => t.id === exTable.id);
        if (sub && sub.is_active === false && exTable.is_active === true) {
          tablesBeingRetired.push(exTable);
        }
      }
    }

    // Guard: Table cannot be removed or retired if it has active holds or confirmed reservations
    for (const tableToRetire of tablesBeingRetired) {
      const activeAllocRes = await pool.query(
        `SELECT a.id, a.status, a.expires_at, b.status AS booking_status
         FROM table_allocations a
         LEFT JOIN bookings b ON b.id = a.booking_id
         WHERE a.table_id = $1
           AND (
             a.status IN ('HELD', 'OFFER_HELD', 'PAYMENT_PENDING', 'PAYMENT_REVIEW', 'CONFIRMED', 'READY', 'SEATED')
             OR b.status IN ('HOLD_ACTIVE', 'PAYMENT_PENDING', 'PAYMENT_REVIEW', 'CONFIRMED', 'READY', 'SEATED')
           )
           AND (a.expires_at IS NULL OR a.expires_at > NOW())
         LIMIT 1`,
        [tableToRetire.id]
      );

      if (activeAllocRes.rows.length > 0) {
        throw new ConflictError(
          `Cannot remove or retire table "${tableToRetire.table_number}" (${tableToRetire.id}) because it has active holds or confirmed reservations.`,
          ErrorCode.INVENTORY_HOLD_CONFLICT
        );
      }
    }

    // 4. Atomic transaction update
    const newVersion = floor.current_version + 1;

    return await this.db.withTransaction(async (client) => {
      // Optimistic compare-and-update on floor
      const updFloor = await client.query(
        `UPDATE floors
         SET current_version = $1,
             name = COALESCE($2, name),
             updated_at = NOW()
         WHERE id = $3 AND current_version = $4
         RETURNING id, current_version`,
        [newVersion, updateDto.name || null, floor.id, updateDto.base_version]
      );

      if (updFloor.rowCount === 0) {
        throw new ConflictError(
          `Floor plan version conflict: current version was modified concurrently.`,
          ErrorCode.VERSION_CONFLICT
        );
      }

      // Deactivate older version records
      await client.query(
        `UPDATE floor_plan_versions
         SET is_active = false
         WHERE floor_id = $1`,
        [floor.id]
      );

      // Insert new floor plan version snapshot
      await client.query(
        `INSERT INTO floor_plan_versions (
           floor_id, version_number, layout_snapshot, svg_layout_url, created_by, is_active
         ) VALUES ($1, $2, $3, $4, $5, true)`,
        [
          floor.id,
          newVersion,
          JSON.stringify({ tables: validatedTables, name: updateDto.name || floor.name }),
          updateDto.svg_layout_url || null,
          actorId || null,
        ]
      );

      // Update or insert tables
      for (const t of validatedTables) {
        if (t.id && existingTableMap.has(t.id)) {
          // Update existing table preserving its stable identity
          await client.query(
            `UPDATE restaurant_tables
             SET table_number = $1,
                 capacity = $2,
                 min_covers = $3,
                 zone = $4,
                 x = $5,
                 y = $6,
                 w = $7,
                 h = $8,
                 is_active = $9
             WHERE id = $10 AND floor_id = $11`,
            [
              t.table_number,
              t.capacity,
              t.min_covers,
              t.zone,
              t.x,
              t.y,
              t.w,
              t.h,
              t.is_active,
              t.id,
              floor.id,
            ]
          );
        } else {
          // Insert new table
          await client.query(
            `INSERT INTO restaurant_tables (
               floor_id, table_number, capacity, min_covers, zone, x, y, w, h, is_active
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              floor.id,
              t.table_number,
              t.capacity,
              t.min_covers,
              t.zone,
              t.x,
              t.y,
              t.w,
              t.h,
              t.is_active,
            ]
          );
        }
      }

      // Soft-retire omitted tables to ensure historical allocations and bookings remain protected
      for (const tableToRetire of tablesBeingRetired) {
        await client.query(
          `UPDATE restaurant_tables SET is_active = false WHERE id = $1`,
          [tableToRetire.id]
        );
      }

      // Record audit log entry
      await client.query(
        `INSERT INTO audit_logs (
           actor_id, restaurant_id, action, entity_type, entity_id, diff, request_id
         ) VALUES ($1, $2, 'FLOOR_PLAN_UPDATED', 'floor', $3, $4, $5)`,
        [
          actorId || null,
          restaurantId,
          floor.id,
          JSON.stringify({
            from_version: floor.current_version,
            to_version: newVersion,
            tables_count: validatedTables.length,
            retired_count: tablesBeingRetired.length,
          }),
          requestId || null,
        ]
      );

      return {
        success: true,
        floor_id: floor.id,
        version_number: newVersion,
        tables_count: validatedTables.length,
        message: `Floor plan updated successfully to version ${newVersion}`,
      };
    });
  }
}
