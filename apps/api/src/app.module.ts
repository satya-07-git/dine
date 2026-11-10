import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from './common/config/config.module';
import { DatabaseModule } from './common/db/database.module';
import { HealthModule } from './common/health/health.module';
import { RequestCorrelationMiddleware } from './common/logging/request-correlation.middleware';

// Modular Monolith Feature Modules
import { IdentityModule } from './modules/identity/identity.module';
import { RestaurantsModule } from './modules/restaurants/restaurants.module';
import { DiscoveryModule } from './modules/discovery/discovery.module';
import { FloorPlansModule } from './modules/floor-plans/floor-plans.module';
import { AvailabilityModule } from './modules/availability/availability.module';
import { ReservationsModule } from './modules/reservations/reservations.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { WaitlistModule } from './modules/waitlist/waitlist.module';
import { BookingStatusModule } from './modules/booking-status/booking-status.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OwnerOperationsModule } from './modules/owner-operations/owner-operations.module';
import { PackagesModule } from './modules/packages/packages.module';
import { CustomerEngagementModule } from './modules/customer-engagement/customer-engagement.module';
import { AuditSupportModule } from './modules/audit-support/audit-support.module';
import { ObservabilityModule } from './modules/observability/observability.module';
import { ReleaseVerificationModule } from './modules/release-verification/release-verification.module';
import { FutureExtensionsModule } from './modules/future-extensions/future-extensions.module';
import { V2CompatibilityModule } from './modules/v2-compatibility/v2-compatibility.module';
import { RecommendationsModule } from './modules/recommendations/recommendations.module';
import { RealtimeModule } from './modules/realtime/realtime.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    HealthModule,
    IdentityModule,
    RestaurantsModule,
    DiscoveryModule,
    FloorPlansModule,
    AvailabilityModule,
    ReservationsModule,
    PaymentsModule,
    WaitlistModule,
    BookingStatusModule,
    NotificationsModule,
    OwnerOperationsModule,
    PackagesModule,
    CustomerEngagementModule,
    AuditSupportModule,
    ObservabilityModule,
    ReleaseVerificationModule,
    FutureExtensionsModule,
    V2CompatibilityModule,
    RecommendationsModule,
    RealtimeModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestCorrelationMiddleware).forRoutes('*');
  }
}
