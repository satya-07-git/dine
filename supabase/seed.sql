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

-- 2. Restaurants (Two distinct tenant restaurants)
INSERT INTO restaurants (id, name, slug, description, timezone, policy_mode, deposit_amount_minor, default_duration_min, turnover_buffer_min)
VALUES 
    ('b0000000-0000-0000-0000-000000000001', 'The Royal Dine Bistro', 'the-royal-dine-bistro', 'Flagship fine dining venue for Dine platform testing', 'Asia/Kolkata', 'FREE_RESERVATION', 0, 90, 15),
    ('b0000000-0000-0000-0000-000000000002', 'The Grand Amber Palace', 'the-grand-amber-palace', 'Second tenant venue for cross-tenant isolation testing', 'Asia/Kolkata', 'DEPOSIT_REQUIRED', 50000, 120, 15)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name;

-- 3. Restaurant Memberships (Roles: OWNER, HOST; Status: ACTIVE, SUSPENDED)
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

-- 4. Opening Hours (All 7 days, 11:00 to 23:00)
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

-- 5. Floors & Floor Plan Versions
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

-- 6. Restaurant Tables (Including T04 for vertical slice concurrency test)
INSERT INTO restaurant_tables (id, floor_id, table_number, capacity, min_covers, zone, x, y, w, h, is_active)
VALUES 
    ('f0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'T01', 2, 1, 'WINDOW', 10.0, 10.0, 2.0, 2.0, true),
    ('f0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 'T02', 2, 1, 'WINDOW', 20.0, 10.0, 2.0, 2.0, true),
    ('f0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000001', 'T03', 4, 2, 'CENTER', 10.0, 30.0, 3.0, 3.0, true),
    ('f0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000001', 'T04', 4, 2, 'CENTER', 20.0, 30.0, 3.0, 3.0, true),
    ('f0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000001', 'T05', 6, 4, 'PRIVATE', 30.0, 30.0, 4.0, 4.0, true),
    ('f0000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000002', 'T01', 4, 2, 'MAIN', 10.0, 10.0, 3.0, 3.0, true)
ON CONFLICT (floor_id, table_number) DO UPDATE SET capacity = EXCLUDED.capacity;

-- 7. Sample Bookings & Waitlist for Customer Ownership Testing
INSERT INTO bookings (id, user_id, restaurant_id, party_size, requested_start, dining_period, status, policy_snapshot)
VALUES 
    ('10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 2, '2026-11-10 19:00:00+00', tstzrange('2026-11-10 19:00:00+00', '2026-11-10 20:45:00+00'), 'CONFIRMED', '{"policy_mode":"FREE_RESERVATION"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO waitlist_entries (id, restaurant_id, user_id, party_size, requested_start, status)
VALUES 
    ('20000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 4, '2026-11-10 20:00:00+00', 'WAITING')
ON CONFLICT (id) DO NOTHING;
