-- Synthetic Seed Data for Dine Backend Platform
-- Idempotent synthetic data for testing, development, and vertical slice validation.

-- 1. Profiles (with auth_uid alignment for Supabase JWT verification)
INSERT INTO profiles (id, auth_uid, full_name, email, phone)
VALUES 
    ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Lead Architect', 'architect@dine.local', '+919876543210'),
    ('a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'Customer Alice', 'alice@customer.local', '+919876543211'),
    ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', 'Customer Bob', 'bob@customer.local', '+919876543212'),
    ('a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000004', 'Host Charlie (Rest 1)', 'charlie@restaurant1.local', '+919876543213'),
    ('a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000005', 'Host Dave (Rest 2)', 'dave@restaurant2.local', '+919876543214'),
    ('a0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000006', 'Suspended Staff Eve', 'eve@suspended.local', '+919876543215')
ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name, auth_uid = EXCLUDED.auth_uid;

-- 2. Restaurants (Two distinct tenant restaurants with full policy attributes)
INSERT INTO restaurants (
    id, name, slug, description, timezone, policy_mode,
    deposit_amount_minor, deposit_currency, default_duration_min, turnover_buffer_min,
    policy_version, min_party_size, max_party_size, lead_time_min_minutes, lead_time_max_days,
    latitude, longitude
)
VALUES 
    (
        'b0000000-0000-0000-0000-000000000001', 'The Royal Dine Bistro', 'the-royal-dine-bistro',
        'Flagship fine dining venue for Dine platform testing', 'Asia/Kolkata', 'FREE_RESERVATION',
        0, 'INR', 90, 15,
        1, 1, 12, 30, 60,
        12.9716, 77.5946
    ),
    (
        'b0000000-0000-0000-0000-000000000002', 'The Grand Amber Palace', 'the-grand-amber-palace',
        'Second tenant venue for cross-tenant isolation testing', 'Asia/Kolkata', 'DEPOSIT_REQUIRED',
        50000, 'INR', 120, 15,
        1, 2, 20, 60, 30,
        19.0760, 72.8777
    )
ON CONFLICT (slug) DO UPDATE SET 
    name = EXCLUDED.name,
    policy_mode = EXCLUDED.policy_mode,
    deposit_amount_minor = EXCLUDED.deposit_amount_minor,
    deposit_currency = EXCLUDED.deposit_currency,
    default_duration_min = EXCLUDED.default_duration_min,
    turnover_buffer_min = EXCLUDED.turnover_buffer_min,
    min_party_size = EXCLUDED.min_party_size,
    max_party_size = EXCLUDED.max_party_size;

-- 3. Cuisines & Associations
INSERT INTO cuisines (id, name, slug)
VALUES 
    ('11000000-0000-0000-0000-000000000001', 'Contemporary Indian', 'contemporary-indian'),
    ('11000000-0000-0000-0000-000000000002', 'Pan-Asian', 'pan-asian'),
    ('11000000-0000-0000-0000-000000000003', 'European Continental', 'european-continental'),
    ('11000000-0000-0000-0000-000000000004', 'Italian Fine Dining', 'italian-fine-dining')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO restaurant_cuisines (restaurant_id, cuisine_id)
VALUES 
    ('b0000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001'),
    ('b0000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000003'),
    ('b0000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000001'),
    ('b0000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000004')
ON CONFLICT DO NOTHING;

-- 4. Initial Policy History Snapshots
INSERT INTO restaurant_policy_history (
    id, restaurant_id, version, policy_mode, deposit_amount_minor, deposit_currency,
    default_duration_min, turnover_buffer_min, min_party_size, max_party_size,
    lead_time_min_minutes, lead_time_max_days, changed_by, change_reason
)
VALUES 
    (
        '22000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 1,
        'FREE_RESERVATION', 0, 'INR', 90, 15, 1, 12, 30, 60,
        'a0000000-0000-0000-0000-000000000001', 'Initial baseline policy configuration'
    ),
    (
        '22000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 1,
        'DEPOSIT_REQUIRED', 50000, 'INR', 120, 15, 2, 20, 60, 30,
        'a0000000-0000-0000-0000-000000000001', 'Initial baseline deposit policy configuration'
    )
ON CONFLICT (restaurant_id, version) DO NOTHING;

-- 5. Restaurant Memberships (Roles: OWNER, HOST; Status: ACTIVE, SUSPENDED)
INSERT INTO restaurant_memberships (id, restaurant_id, user_id, role, status)
VALUES 
    -- Lead Architect is OWNER of Restaurant 1
    ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'OWNER', 'ACTIVE'),
    -- Host Charlie is active HOST in Restaurant 1
    ('c0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'HOST', 'ACTIVE'),
    -- Host Dave is active HOST in Restaurant 2
    ('c0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000005', 'HOST', 'ACTIVE'),
    -- Eve has SUSPENDED membership in Restaurant 1
    ('c0000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000006', 'HOST', 'SUSPENDED')
ON CONFLICT (restaurant_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status;

-- 6. Opening Hours (All 7 days, 11:00 to 23:00)
INSERT INTO opening_hours (restaurant_id, day_of_week, open_time, close_time)
SELECT 
    'b0000000-0000-0000-0000-000000000001',
    day,
    '11:00:00'::time,
    '23:00:00'::time
FROM generate_series(0, 6) AS day
ON CONFLICT DO NOTHING;

INSERT INTO opening_hours (restaurant_id, day_of_week, open_time, close_time)
SELECT 
    'b0000000-0000-0000-0000-000000000002',
    day,
    '11:00:00'::time,
    '23:00:00'::time
FROM generate_series(0, 6) AS day
ON CONFLICT DO NOTHING;

-- 7. Special Closures (Sample scheduled private event / maintenance closure)
INSERT INTO special_closures (id, restaurant_id, start_time, end_time, reason)
VALUES 
    (
        '33000000-0000-0000-0000-000000000001',
        'b0000000-0000-0000-0000-000000000001',
        '2026-12-25 00:00:00+00',
        '2026-12-25 23:59:59+00',
        'Christmas Holiday Private Closure'
    )
ON CONFLICT (id) DO NOTHING;

-- 8. Floors & Floor Plan Versions
INSERT INTO floors (id, restaurant_id, name, floor_number)
VALUES 
    ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Ground Main Dining Room', 1),
    ('d0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'Grand Banquet Floor', 1)
ON CONFLICT DO NOTHING;

INSERT INTO floor_plan_versions (id, floor_id, version_number, svg_layout_url, is_active)
VALUES 
    ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 1, '/static/layouts/floor1_v1.svg', true),
    ('e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', 1, '/static/layouts/floor2_v1.svg', true)
ON CONFLICT DO NOTHING;

-- 9. Restaurant Tables (Including T04 for vertical slice concurrency test)
INSERT INTO restaurant_tables (id, floor_id, table_number, capacity, min_covers, zone, x, y, w, h, is_active)
VALUES 
    ('f0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'T01', 2, 1, 'WINDOW', 10.0, 10.0, 2.0, 2.0, true),
    ('f0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 'T02', 2, 1, 'WINDOW', 20.0, 10.0, 2.0, 2.0, true),
    ('f0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000001', 'T03', 4, 2, 'CENTER', 10.0, 30.0, 3.0, 3.0, true),
    ('f0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000001', 'T04', 4, 2, 'CENTER', 20.0, 30.0, 3.0, 3.0, true),
    ('f0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000001', 'T05', 6, 4, 'PRIVATE', 30.0, 30.0, 4.0, 4.0, true),
    ('f0000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000002', 'T01', 4, 2, 'MAIN', 10.0, 10.0, 3.0, 3.0, true)
ON CONFLICT (floor_id, table_number) DO UPDATE SET capacity = EXCLUDED.capacity;

-- 10. Sample Bookings & Waitlist for Customer Ownership Testing
INSERT INTO bookings (id, user_id, restaurant_id, party_size, requested_start, dining_period, status, policy_snapshot)
VALUES 
    ('10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 2, '2026-11-10 19:00:00+00', tstzrange('2026-11-10 19:00:00+00', '2026-11-10 20:45:00+00'), 'CONFIRMED', '{"policy_mode":"FREE_RESERVATION","deposit_amount_minor":0,"policy_version":1}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO waitlist_entries (id, restaurant_id, user_id, party_size, requested_start, status)
VALUES 
    ('20000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 4, '2026-11-10 20:00:00+00', 'WAITING')
ON CONFLICT (id) DO NOTHING;
