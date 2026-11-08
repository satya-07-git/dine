---
id: "EPIC-005"
title: "Discovery, menus and public media"
type: "epic"
status: "completed"
phase: "C · Inventory"
depends_on: ["EPIC-004"]
prd_requirements: ["Blueprint §1.1", "Blueprint §2.3", "Blueprint §3.1", "Blueprint §4", "Blueprint §5.2", "Blueprint §12.2"]
risk: "medium"
assignee: "Lead Backend & Systems Architect"
summary: "Expose restaurant search, nearby results, menus and media through bounded public projections."
priority: "Delivered"
baseline: "Delivered baseline · preserved completion"
---

# EPIC-005 — Discovery, menus and public media

## Objective

Expose restaurant search, nearby results, menus and media through bounded public projections.

## Context and blueprint source

Dine Backend Architecture, System Design & Development Blueprint v1.0, 06 November 2026. Source sections: 1.1, 2.3, 3.1, 4, 5.2, 12.2. Delivery stage: C · Inventory. IDs, phases, decomposition and implementation tasks are planning decisions, not original requirement identifiers. Status is an implemented repository baseline. Dependencies are capability prerequisites, verified through automated CI/CD gates.

## In scope

- Cuisine, price and location filters with bounded result pagination
- PostGIS radius search and validated latitude/longitude/radius
- Menu catalog and restaurant photos through Supabase Storage boundaries
- Replaceable maps/geo adapter and published restaurant visibility rules

## Out of scope

Mobile discovery UI, private staff data, paid ranking, unspecified recommendation AI and POS catalog sync.

## Business rules

- Search does not imply table availability; interval availability is a separate query
- Only published fields and public media may appear in discovery
- Location input is validated and query/result sizes bounded
- Menu/media write contracts and retention need definition before implementing uploads

## Data and API changes

Use restaurants.location geography and spatial indexes with cuisines associations. Menu/media schema is named behavior in the blueprint, but exact tables, upload validation and catalog fields remain implementation contracts.

GET /restaurants; GET /restaurants/nearby; GET /restaurants/:id/menu. Detail and package reads link to [EPIC-004](EPIC-004-restaurant-profiles-hours-and-policies.md) and [EPIC-015](EPIC-015-dining-experiences-and-package-contracts.md).

Schema and API details beyond explicitly listed blueprint fields/routes must be reviewed during implementation. Add schema changes only through supabase/migrations.

## Permission and audit requirements

Public read projection excludes customer/staff/payment data. Owner-scoped catalog/media writes require authorization, object ownership and audit.

Use verified identity, restaurant/resource ownership checks and [EPIC-017](EPIC-017-audit-support-and-privacy-controls.md) audit conventions from the first write. Do not trust client-supplied state or log secrets.

## Backend contract and frontend handoff

Product frontend is deferred. Specify request/response DTOs, actionable error codes, pagination where applicable, ownership and state/version behavior. A future client must display loading, empty, validation, denied, conflict, expired and retry states without treating its own state as truth.

## Implementation tasks

- [x] T01 Specify search filters, sort and pagination contract
- [x] T02 Add indexed PostGIS nearby query
- [x] T03 Define menu and public media projection/storage rules
- [x] T04 Implement public reads and empty/invalid filter errors

## Acceptance criteria

- [x] Nearby search returns eligible published restaurants within requested radius
- [x] Out-of-range geo coordinates and excessive query bounds fail validation
- [x] Search and menu responses contain no private customer/staff fields
- [x] Unpublished or retired restaurants are excluded as specified

## Required verification

- Use synthetic coordinates and known inside/outside-radius cases
- Inspect query plan and bounded pagination on seeded data
- Check anonymous reads and unauthorized media writes

## Dependencies and execution gate

Prerequisites: [EPIC-004](EPIC-004-restaurant-profiles-hours-and-policies.md).

Discovery and menu API results are correct, bounded and privacy-scoped.

Audit, security, observability and migration verification apply throughout; cross-cutting epics do not postpone these controls until the end.

## Risks and open decisions

- Unbounded radius or result sets create expensive public queries
- Public/private Storage policy mistakes expose unintended objects

## Completion report

Completed and verified by Lead Backend & Systems Architect on 06 November 2026.

### 1. Architectural Deliverables & Core Features Implemented
- **Authoritative Database Migrations & Synthetic Seed (T01, T02, T03)**:
  - `supabase/migrations/20261106000005_discovery_menus_and_public_media.sql`:
    - Extended `restaurants` table with publication status (`is_published`, `status` IN `('PUBLISHED', 'UNPUBLISHED', 'RETIRED')`), `price_tier` IN `('$', '$$', '$$$', '$$$$')`, `cover_image_url`, and `media_gallery` JSONB.
    - Synchronized PostGIS `location geography(Point, 4326)` with latitude and longitude.
    - Created spatial GiST index (`idx_restaurants_location`) and composite discovery index (`idx_restaurants_discovery`) on `(status, is_published, price_tier)`.
    - Created `menu_categories` table (`id`, `restaurant_id`, `name`, `description`, `display_order`, `is_active`) with foreign key cascade.
    - Created `menu_items` table (`id`, `restaurant_id`, `category_id`, `name`, `description`, `price_minor`, `currency`, `is_available`, `dietary_tags`, `image_url`, `display_order`).
    - Created `restaurant_media` table (`id`, `restaurant_id`, `url`, `caption`, `media_type`, `is_featured`, `display_order`).
    - Configured Row Level Security (RLS) on `menu_categories`, `menu_items`, and `restaurant_media`: public SELECT policies restricted to active items of published restaurants; modification policies restricted to authenticated staff with `OWNER` or `MANAGER` role.
  - `supabase/seed.sql`: Seeded 4 diverse restaurant entities across geographic locations (Bangalore, Mumbai, New Delhi, and a Retired venue) with full menus and public media gallery URLs.
- **Drizzle Schema & Shared Contracts (T01, T03)**:
  - `apps/api/src/common/db/schema.ts`: Aligned TypeScript ORM schema with updated `restaurants`, `menuCategories`, `menuItems`, and `restaurantMedia`.
  - `packages/contracts/src/dtos.ts`: Exported `RestaurantDiscoveryDto`, `PaginatedResponseDto`, `RestaurantSearchQueryDto`, `NearbySearchQueryDto`, `MenuCategoryDto`, `MenuItemDto`, `RestaurantMediaDto`, and `RestaurantMenuDto`.
- **Discovery & Geospatial Engine (`DiscoveryService`) (T01, T02, T04)**:
  - `apps/api/src/modules/discovery/discovery.service.ts`:
    - Strict validation functions: `validateGeoCoordinates` enforces latitude in `[-90, 90]` and longitude in `[-180, 180]`; `validateRadius` enforces positive radius bounded to maximum 50 km; `validatePagination` bounds limit to `[1, 50]` and non-negative offset; `validatePriceTier` enforces valid enum values.
    - PostGIS ST_DWithin and Haversine distance calculator with spherical trigonometry.
    - `searchRestaurants`: Bounded filtered search across restaurant names, descriptions, and cuisines, returning paginated public projections.
    - `nearbyRestaurants`: Distance-sorted nearby discovery with GiST spatial indexing and Haversine fallback.
    - Strict projection sanitization: `sanitizePublicRestaurantProjection` strips all internal, customer, staff, or payment secrets.
- **Menu Catalog & Public Media Projection (`RestaurantsService`) (T03, T04)**:
  - `apps/api/src/modules/restaurants/restaurants.service.ts`:
    - `getPublishedMenu`: Fetches categories, available items, and media, returning structured hierarchical menu catalogs.
    - Enforces publication status: unpublished or retired venues return 404 `NotFoundError`.
- **REST Endpoints & Routing Architecture (T01, T02, T04)**:
  - `GET /restaurants`: Public filtered discovery with bounded pagination.
  - `GET /restaurants/nearby`: Geospatial nearby search sorted by distance.
  - `GET /restaurants/:id`: Published venue details and policies.
  - `GET /restaurants/:id/menu`: Public menu catalog and media.
  - Fully documented in OpenAPI 3.0 specification (`docs/architecture/openapi.json`).

### 2. Automated Test Suite & CI/CD Verification Evidence
- **Automated Node.js Unit Suite (`tests/unit/discovery-and-menu.test.js`)**:
  - 16 dedicated unit tests passing:
    - Geo validation: accepts valid coordinates; rejects out-of-bounds latitude (`90.001`, `-90.1`) and longitude (`180.001`, `-180.001`); rejects non-numeric/missing inputs.
    - Radius validation: enforces `radius_km > 0` and `radius_km <= 50`; defaults to 10 km.
    - Pagination validation: bounds limit to `1..50` and offset `>= 0`.
    - Price tier validation: accepts `$`, `$$`, `$$$`, `$$$$`; rejects invalid values.
    - Haversine accuracy: verified Bangalore local (< 1 km) vs Delhi (~1740 km).
    - Privacy audit: verified customer/staff secrets (`auth_uid`, `email`, `role`, `gateway_secret`, etc.) are stripped.
    - Visibility rules: verified unpublished and retired restaurants are rejected with 404 `NotFoundError`.
- **Automated Python CI/CD Verification Suite (`tests/test_ci_cd_verification.py`)**:
  - Added `TestEpic5DiscoveryMenusAndPublicMedia` with 6 verification gates:
    - `test_discovery_and_menu_node_unit_suite`: Executes Node.js suite (16/16 tests pass).
    - `test_migration_005_discovery_menus_and_public_media`: Verified migration 5 schema, tables, spatial indexes, and RLS.
    - `test_openapi_discovery_and_menu_routes`: Verified OpenAPI documents `/restaurants`, `/restaurants/nearby`, and `/restaurants/{id}/menu`.
    - `test_python_haversine_and_radius_boundaries`: Verified geospatial math and boundary rules.
    - `test_python_public_projection_privacy_audit`: Verified privacy sanitization of public responses.
    - `test_python_unpublished_and_retired_restaurant_exclusion`: Verified filtering of unpublished and retired venues.
- **All 38 Python CI/CD verification tests passing**.
- **CI Shell Pipeline (`scripts/ci.sh`)**:
  - All 8 CI/CD quality gates passing cleanly with zero errors.

### 3. Downstream Release Gates & Next Phase Transition
- Discovery, menus and public media ([EPIC-005](EPIC-005-discovery-menus-and-public-media.md)) is verified, marked completed, and registered in the delivery dashboard.
- Prerequisite for downstream Inventory tasks ([EPIC-006](EPIC-006-versioned-floor-plans-and-table-inventory.md): Versioned floor plans and table inventory) and Availability engine ([EPIC-007](EPIC-007-time-range-availability-and-policy-engine.md)) is fully satisfied.

## Finalized v2 change boundary

This original epic ID, title, completed status, accepted checklist and historical completion report are preserved. New finalized-v2 changes are tracked in EPIC-021–024; they do not reset this delivered work or imply that new provider/schema behavior was already verified.
