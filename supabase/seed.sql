-- Synthetic Seed Data for Dine Backend Platform
-- Idempotent synthetic data for testing, development, and vertical slice validation.

-- 1. Profiles
INSERT INTO profiles (id, full_name, email, phone)
VALUES 
    ('a0000000-0000-0000-0000-000000000001', 'Lead Architect', 'architect@dine.local', '+919876543210'),
    ('a0000000-0000-0000-0000-000000000002', 'Customer Alice', 'alice@customer.local', '+919876543211'),
    ('a0000000-0000-0000-0000-000000000003', 'Customer Bob', 'bob@customer.local', '+919876543212')
ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name;

-- 2. Restaurant
INSERT INTO restaurants (id, name, slug, description, timezone, policy_mode, deposit_amount_minor, default_duration_min, turnover_buffer_min)
VALUES 
    ('b0000000-0000-0000-0000-000000000001', 'The Royal Dine Bistro', 'the-royal-dine-bistro', 'Flagship fine dining venue for Dine platform testing', 'Asia/Kolkata', 'FREE_RESERVATION', 0, 90, 15)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name;

-- 3. Restaurant Membership
INSERT INTO restaurant_memberships (id, restaurant_id, user_id, role, status)
VALUES 
    ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'OWNER', 'ACTIVE')
ON CONFLICT (restaurant_id, user_id) DO UPDATE SET role = EXCLUDED.role;

-- 4. Opening Hours (All 7 days, 11:00 to 23:00)
INSERT INTO opening_hours (restaurant_id, day_of_week, open_time, close_time)
SELECT 
    'b0000000-0000-0000-0000-000000000001',
    day,
    '11:00:00'::time,
    '23:00:00'::time
FROM generate_series(0, 6) AS day
ON CONFLICT DO NOTHING;

-- 5. Floor & Floor Plan Version
INSERT INTO floors (id, restaurant_id, name, floor_number)
VALUES 
    ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Ground Main Dining Room', 1)
ON CONFLICT DO NOTHING;

INSERT INTO floor_plan_versions (id, floor_id, version_number, svg_layout_url, is_active)
VALUES 
    ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 1, '/static/layouts/floor1_v1.svg', true)
ON CONFLICT DO NOTHING;

-- 6. Restaurant Tables (Including T04 for vertical slice concurrency test)
INSERT INTO restaurant_tables (id, floor_id, table_number, capacity, min_covers, zone, x, y, w, h, is_active)
VALUES 
    ('f0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'T01', 2, 1, 'WINDOW', 10.0, 10.0, 2.0, 2.0, true),
    ('f0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 'T02', 2, 1, 'WINDOW', 20.0, 10.0, 2.0, 2.0, true),
    ('f0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000001', 'T03', 4, 2, 'CENTER', 10.0, 30.0, 3.0, 3.0, true),
    ('f0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000001', 'T04', 4, 2, 'CENTER', 20.0, 30.0, 3.0, 3.0, true),
    ('f0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000001', 'T05', 6, 4, 'PRIVATE', 30.0, 30.0, 4.0, 4.0, true)
ON CONFLICT (floor_id, table_number) DO UPDATE SET capacity = EXCLUDED.capacity;
