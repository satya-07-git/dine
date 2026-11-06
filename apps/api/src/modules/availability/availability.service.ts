import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/db/database.service';
import { RestaurantPolicyService } from '../restaurants/restaurant-policy.service';

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly db: DatabaseService,
    private readonly policyService: RestaurantPolicyService
  ) {}

  async checkAvailability(restaurantId: string, partySize: number, dateStr: string) {
    // 1. Evaluate policy eligibility (hours, closures, party size, lead time)
    let eligibility = null;
    try {
      eligibility = await this.policyService.evaluateReservationEligibility(
        restaurantId,
        dateStr,
        partySize
      );
    } catch (err: any) {
      return {
        restaurantId,
        date: dateStr,
        partySize,
        availableSlots: [],
        eligible: false,
        error: err.message,
      };
    }

    if (!eligibility.eligible) {
      return {
        restaurantId,
        date: dateStr,
        partySize,
        availableSlots: [],
        eligible: false,
        reason: eligibility.reason,
        message: eligibility.message,
      };
    }

    // Availability slot calculation engine (EPIC-007)
    return {
      restaurantId,
      date: dateStr,
      partySize,
      eligible: true,
      policySnapshot: eligibility.policySnapshot,
      availableSlots: [],
    };
  }
}
