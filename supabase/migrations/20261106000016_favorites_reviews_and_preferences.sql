-- Authoritative SQL Migration: Favorites, Reviews and Customer Preferences (EPIC-016)
-- Conforms to ADR-001, ADR-002, Blueprint §1.1, §4, §16.2, and POL-012/POL-013.

-- 1. Favorites Table (Unique customer-restaurant relation)
CREATE TABLE IF NOT EXISTS favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_restaurant_favorite UNIQUE (user_id, restaurant_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_restaurant_id ON favorites(restaurant_id);

-- 2. Customer Preferences Table (Private dining preferences)
CREATE TABLE IF NOT EXISTS customer_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    dietary_requirements TEXT[] NOT NULL DEFAULT '{}',
    seating_preference VARCHAR(50) NOT NULL DEFAULT 'ANY',
    allergies TEXT[] NOT NULL DEFAULT '{}',
    special_notes TEXT,
    marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_preferences_user ON customer_preferences(user_id);

-- 3. Reviews Table (Verified dining evidence reviews)
CREATE TABLE IF NOT EXISTS reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title VARCHAR(150),
    comment TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('PENDING_REVIEW', 'PUBLISHED', 'HIDDEN', 'FLAGGED')),
    moderation_notes TEXT,
    owner_response TEXT,
    owner_responded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_booking_review UNIQUE (booking_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_restaurant_status ON reviews(restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_booking_id ON reviews(booking_id);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for Favorites
CREATE POLICY favorites_user_select ON favorites
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY favorites_user_insert ON favorites
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY favorites_user_delete ON favorites
    FOR DELETE USING (auth.uid() = user_id);

-- 6. RLS Policies for Customer Preferences
CREATE POLICY preferences_user_select ON customer_preferences
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY preferences_user_modify ON customer_preferences
    FOR ALL USING (auth.uid() = user_id);

-- 7. RLS Policies for Reviews
-- Public read for published reviews
CREATE POLICY reviews_public_select ON reviews
    FOR SELECT USING (status = 'PUBLISHED');

-- Customers can view their own reviews regardless of status
CREATE POLICY reviews_user_select ON reviews
    FOR SELECT USING (auth.uid() = user_id);

-- Customers can insert reviews for their own bookings
CREATE POLICY reviews_user_insert ON reviews
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Restaurant staff (OWNER/MANAGER) can view and moderate all reviews for their venue
CREATE POLICY reviews_staff_manage ON reviews
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM restaurant_memberships
            WHERE restaurant_memberships.restaurant_id = reviews.restaurant_id
              AND restaurant_memberships.user_id = auth.uid()
              AND restaurant_memberships.status = 'ACTIVE'
              AND restaurant_memberships.role IN ('OWNER', 'MANAGER')
        )
    );
