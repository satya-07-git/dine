import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { CustomerEngagementService } from './customer-engagement.service';
import { AuthGuard } from '../../common/auth/auth.guard';
import { TenantGuard, RequireRestaurantRoles } from '../../common/auth/tenant.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/auth/current-user.decorator';
import {
  AddFavoriteRequestDto,
  UpdateCustomerPreferenceDto,
  CreateReviewRequestDto,
  RespondToReviewRequestDto,
  ModerateReviewRequestDto,
} from '@dine/contracts';

@ApiTags('Customer Engagement')
@Controller()
export class CustomerEngagementController {
  constructor(private readonly engagementService: CustomerEngagementService) {}

  // ==========================================================================
  // Public Discovery Endpoints
  // ==========================================================================

  @Get('restaurants/:restaurantId/reviews')
  @ApiOperation({
    summary: 'Get published reviews for a restaurant',
    description:
      'Returns approved public reviews and aggregate rating. Masks customer identity and strips private notes to preserve guest privacy (AC4).',
  })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant UUID' })
  @ApiResponse({ status: 200, description: 'Public reviews and rating summary' })
  @ApiResponse({ status: 404, description: 'Restaurant not found or unpublished' })
  async getPublicReviews(@Param('restaurantId') restaurantId: string) {
    return this.engagementService.getPublicReviews(restaurantId);
  }

  // ==========================================================================
  // Customer Favorites (Authenticated & Repeat-Safe)
  // ==========================================================================

  @Get('me/favorites')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List authenticated customer favorites',
    description: 'Retrieves all restaurants saved as favorites by the caller.',
  })
  @ApiResponse({ status: 200, description: 'Customer favorites list' })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  async getFavorites(@CurrentUser() user: AuthenticatedUser) {
    return this.engagementService.getFavorites(user.userId);
  }

  @Post('me/favorites')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Add a restaurant to favorites',
    description:
      'Repeat-safe write operation. If already favorited, returns existing favorite without duplicate insertion (AC3).',
  })
  @ApiResponse({ status: 201, description: 'Restaurant favorited successfully' })
  @ApiResponse({ status: 200, description: 'Restaurant was already favorited (repeat-safe idempotent)' })
  @ApiResponse({ status: 404, description: 'Restaurant not found or unpublished' })
  async addFavorite(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddFavoriteRequestDto
  ) {
    return this.engagementService.addFavorite(user.userId, dto);
  }

  @Delete('me/favorites/:restaurantId')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Remove a restaurant from favorites',
    description: 'Idempotent deletion of a restaurant from customer favorites.',
  })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant UUID' })
  @ApiResponse({ status: 200, description: 'Restaurant removed from favorites' })
  async removeFavorite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId') restaurantId: string
  ) {
    return this.engagementService.removeFavorite(user.userId, restaurantId);
  }

  @Get('me/favorites/:restaurantId/status')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Check if restaurant is favorited',
    description: 'Returns boolean whether caller has favorited this restaurant.',
  })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant UUID' })
  @ApiResponse({ status: 200, description: 'Favorite status boolean' })
  async isFavorite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId') restaurantId: string
  ) {
    return this.engagementService.isFavorite(user.userId, restaurantId);
  }

  // ==========================================================================
  // Customer Preferences (Private & Bounded)
  // ==========================================================================

  @Get('me/preferences')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get customer dining preferences',
    description:
      'Returns caller personal dining preferences (dietary, seating, allergies). Rejects cross-customer access (AC1).',
  })
  @ApiResponse({ status: 200, description: 'Customer dining preferences' })
  async getPreferences(@CurrentUser() user: AuthenticatedUser) {
    return this.engagementService.getPreferences(user.userId);
  }

  @Put('me/preferences')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update customer dining preferences',
    description:
      'Upserts dietary requirements, seating preferences, and allergy notes. Preserves privacy boundaries.',
  })
  @ApiResponse({ status: 200, description: 'Preferences updated successfully' })
  async updatePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateCustomerPreferenceDto
  ) {
    return this.engagementService.updatePreferences(user.userId, dto);
  }

  // ==========================================================================
  // Verified Dining Reviews (Customer Writes)
  // ==========================================================================

  @Post('restaurants/:restaurantId/reviews')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Submit a verified customer review',
    description:
      'Requires verified dining evidence: booking must be COMPLETED, belong to the caller, and match the restaurant (AC1 & AC2). Single review per booking enforced.',
  })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant UUID' })
  @ApiResponse({ status: 201, description: 'Review submitted successfully' })
  @ApiResponse({ status: 400, description: 'Invalid rating bounds or missing fields' })
  @ApiResponse({ status: 403, description: 'Customer does not own booking' })
  @ApiResponse({ status: 409, description: 'Review already exists for this booking' })
  @ApiResponse({ status: 422, description: 'Review not eligible (booking not COMPLETED)' })
  async createReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId') restaurantId: string,
    @Body() dto: CreateReviewRequestDto
  ) {
    return this.engagementService.createReview(user.userId, restaurantId, dto);
  }

  @Get('me/reviews')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List authenticated customer reviews',
    description: 'Retrieves all reviews authored by the caller.',
  })
  @ApiResponse({ status: 200, description: 'Customer review history' })
  async getCustomerReviews(@CurrentUser() user: AuthenticatedUser) {
    return this.engagementService.getCustomerReviews(user.userId);
  }

  // ==========================================================================
  // Staff Owner Operations (Role & Tenant Gated)
  // ==========================================================================

  @Get('owner/restaurants/:id/reviews')
  @UseGuards(AuthGuard, TenantGuard)
  @RequireRestaurantRoles('OWNER', 'MANAGER')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List all restaurant reviews for staff management',
    description: 'Retrieves reviews for the restaurant including flagged and pending reviews.',
  })
  @ApiParam({ name: 'id', description: 'Restaurant UUID' })
  @ApiResponse({ status: 200, description: 'List of venue reviews' })
  @ApiResponse({ status: 403, description: 'Unauthorized cross-tenant access' })
  async getOwnerReviews(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') restaurantId: string
  ) {
    return this.engagementService.getOwnerReviews(user.userId, restaurantId);
  }

  @Patch('owner/restaurants/:id/reviews/:reviewId/response')
  @UseGuards(AuthGuard, TenantGuard)
  @RequireRestaurantRoles('OWNER', 'MANAGER')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Post an official restaurant response to a customer review',
    description: 'Attaches or updates the venue management response.',
  })
  @ApiParam({ name: 'id', description: 'Restaurant UUID' })
  @ApiParam({ name: 'reviewId', description: 'Review UUID' })
  @ApiResponse({ status: 200, description: 'Response attached successfully' })
  @ApiResponse({ status: 403, description: 'Unauthorized cross-tenant access' })
  async respondToReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') restaurantId: string,
    @Param('reviewId') reviewId: string,
    @Body() dto: RespondToReviewRequestDto
  ) {
    return this.engagementService.respondToReview(user.userId, restaurantId, reviewId, dto);
  }

  @Patch('owner/restaurants/:id/reviews/:reviewId/moderate')
  @UseGuards(AuthGuard, TenantGuard)
  @RequireRestaurantRoles('OWNER', 'MANAGER')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Moderate a customer review',
    description: 'Updates review publication status (PUBLISHED, HIDDEN, FLAGGED) with moderation audit notes.',
  })
  @ApiParam({ name: 'id', description: 'Restaurant UUID' })
  @ApiParam({ name: 'reviewId', description: 'Review UUID' })
  @ApiResponse({ status: 200, description: 'Review status moderated successfully' })
  async moderateReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') restaurantId: string,
    @Param('reviewId') reviewId: string,
    @Body() dto: ModerateReviewRequestDto
  ) {
    return this.engagementService.moderateReview(user.userId, restaurantId, reviewId, dto);
  }

  @Get('owner/restaurants/:id/bookings/:bookingId/preferences')
  @UseGuards(AuthGuard, TenantGuard)
  @RequireRestaurantRoles('OWNER', 'MANAGER', 'HOST')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'View guest dining preferences for a booking',
    description:
      'Allows staff to see dietary requirements and allergies strictly for table service in an active venue booking.',
  })
  @ApiParam({ name: 'id', description: 'Restaurant UUID' })
  @ApiParam({ name: 'bookingId', description: 'Booking UUID' })
  @ApiResponse({ status: 200, description: 'Guest dining preferences' })
  async getBookingPreferencesForStaff(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') restaurantId: string,
    @Param('bookingId') bookingId: string
  ) {
    return this.engagementService.getBookingPreferencesForStaff(user.userId, restaurantId, bookingId);
  }
}
