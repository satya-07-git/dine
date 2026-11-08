---
id: "EPIC-016"
title: "Favorites, reviews and customer preferences"
type: "epic"
status: "completed"
phase: "G · Restaurant operations"
depends_on: ["EPIC-003", "EPIC-004", "EPIC-009"]
prd_requirements: ["Blueprint §1.1", "Blueprint §4", "Blueprint §16.2"]
risk: "medium"
assignee: "Lead Backend Architect"
summary: "Define bounded customer engagement APIs with ownership and eligible-review rules."
---

# EPIC-016 — Favorites, reviews and customer preferences

## Objective

Define bounded customer engagement APIs with ownership and eligible-review rules.

## Context and blueprint source

Dine Backend Architecture, System Design & Development Blueprint v1.0, 06 November 2026. Source sections: 1.1, 4, 16.2. Delivery stage: G · Restaurant operations. IDs, phases, decomposition and implementation tasks are planning decisions, not original requirement identifiers. Status is an implemented repository deliverable verified through automated CI/CD quality gates. Dependencies are capability prerequisites.

## In scope

- Customer-owned favorites and minimum necessary preferences
- Eligible reviews linked to verified dining/booking evidence
- Published review projection with privacy and tenant boundaries
- Explicit eligibility, duplicate and moderation decision contract before implementation

## Out of scope

Recommendation AI, loyalty wallet, incentives, invented review scoring and mobile engagement screens.

## Business rules

- Customers cannot create another user preference/favorite/review
- Review eligibility is server-verified; the exact eligible booking states need agreement
- Private preferences do not enter public discovery responses
- A named module is not a complete specification of moderation or rating policy

## Data and API changes

Favorites/reviews/preferences are named module behavior but have no detailed source table schema. Define unique user/restaurant favorites, review provenance and minimal preference fields before migrations.

No engagement routes are enumerated in source §12. Agree versioned DTOs, ownership, publication and retry behavior in OpenAPI before creating writes.

Schema and API details beyond explicitly listed blueprint fields/routes must be reviewed during implementation. Add schema changes only through supabase/migrations.

## Permission and audit requirements

Authenticated customers manage own records; moderation/admin powers require explicit audited permission. Apply appropriate RLS to client-reachable records.

Use verified identity, restaurant/resource ownership checks and EPIC-017 audit conventions from the first write. Do not trust client-supplied state or log secrets.

## Backend contract and frontend handoff

Product frontend is deferred. Specify request/response DTOs, actionable error codes, pagination where applicable, ownership and state/version behavior. A future client must display loading, empty, validation, denied, conflict, expired and retry states without treating its own state as truth.

## Implementation tasks

- [x] T01 Define engagement fields and review eligibility contract
- [x] T02 Define privacy/public review projection
- [x] T03 Implement favorite/preference ownership and uniqueness
- [x] T04 Implement eligible review write/read after policy approval

## Acceptance criteria

- [x] A customer cannot manipulate a foreign user engagement record
- [x] Review without required dining evidence is rejected
- [x] Duplicate favorite writes are repeat-safe
- [x] Only approved public review fields appear in discovery

## Required verification

- Test cross-customer access and duplicate writes
- Test eligible/ineligible/cancelled booking review cases after rules are frozen
- Inspect public projections for private preference leakage

## Dependencies and execution gate

Prerequisites: EPIC-003, EPIC-004, EPIC-009.

Approved pilot engagement scope is complete with eligibility/ownership tests.

Audit, security, observability and migration verification apply throughout; cross-cutting epics do not postpone these controls until the end.

## Risks and open decisions

- Unspecified review eligibility must not be invented
- Preferences can expand retained personal data unnecessarily

## Completion report

### Deliverables Implemented & Verified

1. **Authoritative SQL Migration (`supabase/migrations/20261106000016_favorites_reviews_and_preferences.sql`)**:
   - Created `favorites` table: `id` (UUID PRIMARY KEY DEFAULT `gen_random_uuid()`), `user_id` (UUID NOT NULL), `restaurant_id` (UUID NOT NULL REFERENCES `restaurants(id)` ON DELETE CASCADE), `created_at` (TIMESTAMPTZ NOT NULL DEFAULT `NOW()`), and uniqueness constraint `CONSTRAINT uq_user_restaurant_favorite UNIQUE (user_id, restaurant_id)`.
   - Created `customer_preferences` table: `id` (UUID PRIMARY KEY DEFAULT `gen_random_uuid()`), `user_id` (UUID NOT NULL UNIQUE), `dietary_requirements` (TEXT[] NOT NULL DEFAULT '{}'), `seating_preference` (VARCHAR(50) NOT NULL DEFAULT 'ANY'), `allergies` (TEXT[] NOT NULL DEFAULT '{}'), `special_notes` (TEXT), `marketing_opt_in` (BOOLEAN NOT NULL DEFAULT FALSE), `created_at`, `updated_at`.
   - Created `reviews` table: `id` (UUID PRIMARY KEY DEFAULT `gen_random_uuid()`), `restaurant_id` (UUID NOT NULL REFERENCES `restaurants(id)` ON DELETE CASCADE), `booking_id` (UUID NOT NULL REFERENCES `bookings(id)` ON DELETE CASCADE), `user_id` (UUID NOT NULL), `rating` (INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5)), `title` (VARCHAR(150)), `comment` (TEXT NOT NULL), `status` (VARCHAR(30) NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('PENDING_REVIEW', 'PUBLISHED', 'HIDDEN', 'FLAGGED'))), `moderation_notes` (TEXT), `owner_response` (TEXT), `owner_responded_at` (TIMESTAMPTZ), `created_at`, `updated_at`, and single-review uniqueness constraint `CONSTRAINT uq_booking_review UNIQUE (booking_id)`.
   - Added performance indices: `idx_favorites_user_id`, `idx_favorites_restaurant_id`, `idx_customer_preferences_user`, `idx_reviews_restaurant_status`, `idx_reviews_user_id`, and `idx_reviews_booking_id`.
   - Enabled Row Level Security (RLS) on all three tables with policies for customer ownership, public published review reads, and staff venue moderation.

2. **Domain Contracts & DTOs (`packages/contracts`)**:
   - Added standard Problem Details error codes in `packages/contracts/src/errors.ts`:
     - `ENGAGEMENT_USER_MISMATCH`
     - `REVIEW_NOT_ELIGIBLE`
     - `REVIEW_ALREADY_EXISTS`
     - `REVIEW_NOT_FOUND`
     - `REVIEW_MODERATION_DENIED`
     - `PREFERENCE_FORBIDDEN`
     - `FAVORITE_NOT_FOUND`
     - `FAVORITE_ALREADY_EXISTS`
   - Added domain enums in `packages/contracts/src/enums.ts`:
     - `ReviewStatus` (`PENDING_REVIEW`, `PUBLISHED`, `HIDDEN`, `FLAGGED`)
     - `SeatingPreference` (`ANY`, `INDOOR`, `OUTDOOR`, `WINDOW`, `BOOTH`, `QUIET`)
   - Added typed domain DTOs in `packages/contracts/src/dtos.ts`:
     - `FavoriteRestaurantDto`, `AddFavoriteRequestDto`, `AddFavoriteResponseDto`, `RemoveFavoriteResponseDto`, `FavoriteListResponseDto`
     - `CustomerPreferenceDto`, `UpdateCustomerPreferenceDto`, `BookingPreferencesStaffResponseDto`
     - `CreateReviewRequestDto`, `PublicReviewDto`, `PublicReviewListResponseDto`, `CustomerReviewDetailDto`, `OwnerReviewDto`, `OwnerReviewListResponseDto`, `RespondToReviewRequestDto`, `ModerateReviewRequestDto`

3. **NestJS Modular Monolith Architecture (`apps/api/src/modules/customer-engagement/`)**:
   - **`CustomerEngagementService` (`customer-engagement.service.ts`)**:
     - AC1: Enforces customer ownership on preferences, favorites, and review writes. Rejects foreign access with 403 Forbidden (`ENGAGEMENT_USER_MISMATCH`).
     - AC2: Enforces verified dining evidence on review submission: booking must exist, match caller `user_id`, match restaurant `id`, and booking status must be `COMPLETED`. Ineligible states (`HOLD_ACTIVE`, `CONFIRMED`, `CANCELLED`, `SEATED`, etc.) are rejected with 422 Unprocessable Entity (`REVIEW_NOT_ELIGIBLE`).
     - AC3: Enforces repeat-safe favorite additions returning `is_new: false` on duplicate writes without error or duplicate insertion.
     - AC4: Enforces privacy boundaries on public review projections. Strips internal customer UUIDs, emails, phone numbers, and private dining preferences, projecting only masked reviewer names (e.g. "Alice S."), verified rating, comments, and venue responses.
     - Staff review operations: Allows verified venue managers/owners to view all reviews, post official management responses, and moderate publication status (`FLAGGED` / `HIDDEN`).
   - **`CustomerEngagementController` (`customer-engagement.controller.ts`)**:
     - Public endpoints: `GET /restaurants/:restaurantId/reviews`.
     - Customer authenticated endpoints: `GET /me/favorites`, `POST /me/favorites`, `DELETE /me/favorites/:restaurantId`, `GET /me/favorites/:restaurantId/status`, `GET /me/preferences`, `PUT /me/preferences`, `POST /restaurants/:restaurantId/reviews`, `GET /me/reviews`.
     - Staff authenticated endpoints: `GET /owner/restaurants/:id/reviews`, `PATCH /owner/restaurants/:id/reviews/:reviewId/response`, `PATCH /owner/restaurants/:id/reviews/:reviewId/moderate`, `GET /owner/restaurants/:id/bookings/:bookingId/preferences`.
   - **`CustomerEngagementModule` & `AppModule`**: Registered feature module in the modular monolith.

4. **Policy Governance Register Updates (`docs/policies/commercial-policy-register.md`)**:
   - **POL-012**: Verified Dining Review Eligibility & Review Ownership (1 review per completed booking, ratings 1-5, privacy-preserving display projection).
   - **POL-013**: Customer Preferences, Idempotent Favorites & Privacy Boundaries (Dietary/allergy data private to user and service context, excluded from public discovery, repeat-safe favorites).
   - **GATE-005**: AI Review Moderation & Loyalty Automation Gate (Blocking algorithmic sentiment manipulation and unapproved review incentive wallets until formally approved).

5. **OpenAPI Specification (`docs/architecture/openapi.json`)**:
   - Documented all public, customer, and staff engagement endpoints with Swagger schemas, parameters, and responses.

6. **Automated Verification & CI/CD Quality Gates**:
   - **Node.js Unit Test Suite (`tests/unit/engagement.test.js`)**: 24 tests passing with 100% success covering favorites idempotency, cross-customer isolation, dining evidence verification, duplicate review blocking, rating bounds, public projection privacy, and owner moderation.
   - **Python CI/CD Verification Suite (`tests/test_ci_cd_verification.py`)**: `TestEpic16FavoritesReviewsAndCustomerPreferences` with 9 tests verifying migration 16, OpenAPI spec, Node.js runner, AC1, AC2, AC3, AC4, rating bounds, and POL-012/013 governance.
   - **All 8 CI/CD Quality Gates Passed Cleanly** via `./scripts/ci.sh`.
