-- Migration: 20261106000005_discovery_menus_and_public_media.sql
-- Description: Discovery filters, PostGIS spatial indexing, menu catalog and public media storage
-- Fulfills: EPIC-005 (Discovery, menus and public media)

-- ============================================================================
-- 1. Restaurant Discovery Enhancements (Publication Status, Price Tier, Media)
-- ============================================================================
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'PUBLISHED';
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS price_tier VARCHAR(5) NOT NULL DEFAULT '$$';
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS media_gallery JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
    ALTER TABLE restaurants ADD CONSTRAINT chk_restaurants_status 
        CHECK (status IN ('PUBLISHED', 'UNPUBLISHED', 'RETIRED'));
EXCEPTION WHEN duplicate_object THEN
    NULL;
END
$$;

DO $$
BEGIN
    ALTER TABLE restaurants ADD CONSTRAINT chk_restaurants_price_tier 
        CHECK (price_tier IN ('$', '$$', '$$$', '$$$$'));
EXCEPTION WHEN duplicate_object THEN
    NULL;
END
$$;

-- Synchronize PostGIS geography location if PostGIS extension is available
DO $$
BEGIN
    UPDATE restaurants
    SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
    WHERE longitude IS NOT NULL AND latitude IS NOT NULL AND location IS NULL;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Skipping location geography point synchronization (PostGIS not enabled)';
END
$$;

-- Spatial and Discovery Indexes
DO $$
BEGIN
    CREATE INDEX IF NOT EXISTS idx_restaurants_location ON restaurants USING gist(location);
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Skipping GiST index on location (PostGIS not enabled)';
END
$$;

CREATE INDEX IF NOT EXISTS idx_restaurants_discovery ON restaurants(status, is_published, price_tier);
CREATE INDEX IF NOT EXISTS idx_restaurants_lat_lng ON restaurants(latitude, longitude);

-- ============================================================================
-- 2. Menu Categories Catalog
-- ============================================================================
CREATE TABLE IF NOT EXISTS menu_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_menu_categories_restaurant ON menu_categories(restaurant_id, display_order);

-- ============================================================================
-- 3. Menu Items Catalog
-- ============================================================================
CREATE TABLE IF NOT EXISTS menu_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    category_id UUID REFERENCES menu_categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    price_minor INTEGER NOT NULL CHECK (price_minor >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    is_available BOOLEAN NOT NULL DEFAULT true,
    dietary_tags TEXT[] NOT NULL DEFAULT '{}',
    image_url TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant ON menu_items(restaurant_id, display_order);
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id, display_order);

-- ============================================================================
-- 4. Public Restaurant Media (Photos, Galleries, Storage Boundaries)
-- ============================================================================
CREATE TABLE IF NOT EXISTS restaurant_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    caption TEXT,
    media_type VARCHAR(20) NOT NULL DEFAULT 'IMAGE' CHECK (media_type IN ('IMAGE', 'FLOOR_PREVIEW', 'HERO')),
    is_featured BOOLEAN NOT NULL DEFAULT false,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_restaurant_media_restaurant ON restaurant_media(restaurant_id, display_order);

-- ============================================================================
-- 5. Row Level Security (RLS) Policies
-- ============================================================================

-- 5.1 Menu Categories RLS
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS menu_categories_public_read ON menu_categories;
CREATE POLICY menu_categories_public_read ON menu_categories
    FOR SELECT
    USING (
        is_active = true AND EXISTS (
            SELECT 1 FROM restaurants r
            WHERE r.id = menu_categories.restaurant_id
              AND r.is_published = true
              AND r.status = 'PUBLISHED'
        )
    );

DROP POLICY IF EXISTS menu_categories_staff_manage ON menu_categories;
CREATE POLICY menu_categories_staff_manage ON menu_categories
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM restaurant_memberships m
            WHERE m.restaurant_id = menu_categories.restaurant_id
              AND m.user_id = auth.uid()
              AND m.role IN ('OWNER', 'MANAGER')
              AND m.status = 'ACTIVE'
        )
    );

-- 5.2 Menu Items RLS
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS menu_items_public_read ON menu_items;
CREATE POLICY menu_items_public_read ON menu_items
    FOR SELECT
    USING (
        is_available = true AND EXISTS (
            SELECT 1 FROM restaurants r
            WHERE r.id = menu_items.restaurant_id
              AND r.is_published = true
              AND r.status = 'PUBLISHED'
        )
    );

DROP POLICY IF EXISTS menu_items_staff_manage ON menu_items;
CREATE POLICY menu_items_staff_manage ON menu_items
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM restaurant_memberships m
            WHERE m.restaurant_id = menu_items.restaurant_id
              AND m.user_id = auth.uid()
              AND m.role IN ('OWNER', 'MANAGER')
              AND m.status = 'ACTIVE'
        )
    );

-- 5.3 Restaurant Media RLS
ALTER TABLE restaurant_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS restaurant_media_public_read ON restaurant_media;
CREATE POLICY restaurant_media_public_read ON restaurant_media
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM restaurants r
            WHERE r.id = restaurant_media.restaurant_id
              AND r.is_published = true
              AND r.status = 'PUBLISHED'
        )
    );

DROP POLICY IF EXISTS restaurant_media_staff_manage ON restaurant_media;
CREATE POLICY restaurant_media_staff_manage ON restaurant_media
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM restaurant_memberships m
            WHERE m.restaurant_id = restaurant_media.restaurant_id
              AND m.user_id = auth.uid()
              AND m.role IN ('OWNER', 'MANAGER')
              AND m.status = 'ACTIVE'
        )
    );
