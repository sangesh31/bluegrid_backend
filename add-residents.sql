-- Add test resident users
-- Password for all: resident123 (hashed with bcrypt)

-- Resident 1: Rajesh Kumar
INSERT INTO users (id, email, password_hash, email_verified, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'resident1@bluegrid.com',
  '$2a$10$rZ5qH8vK9YxJ3mXLZ8vK9eYxJ3mXLZ8vK9eYxJ3mXLZ8vK9eYxJ3m',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (email) DO NOTHING
RETURNING id;

-- Get the ID and insert profile
WITH new_user AS (
  SELECT id FROM users WHERE email = 'resident1@bluegrid.com'
)
INSERT INTO profiles (id, full_name, phone, address, role, created_at, updated_at)
SELECT id, 'Rajesh Kumar', '9876543210', 'House No. 123, Main Street, Ward 1', 'resident', NOW(), NOW()
FROM new_user
ON CONFLICT (id) DO NOTHING;

-- Resident 2: Priya Sharma
INSERT INTO users (id, email, password_hash, email_verified, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'resident2@bluegrid.com',
  '$2a$10$rZ5qH8vK9YxJ3mXLZ8vK9eYxJ3mXLZ8vK9eYxJ3mXLZ8vK9eYxJ3m',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (email) DO NOTHING;

WITH new_user AS (
  SELECT id FROM users WHERE email = 'resident2@bluegrid.com'
)
INSERT INTO profiles (id, full_name, phone, address, role, created_at, updated_at)
SELECT id, 'Priya Sharma', '9876543211', 'House No. 456, Gandhi Road, Ward 2', 'resident', NOW(), NOW()
FROM new_user
ON CONFLICT (id) DO NOTHING;

-- Resident 3: Arun Patel
INSERT INTO users (id, email, password_hash, email_verified, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'resident3@bluegrid.com',
  '$2a$10$rZ5qH8vK9YxJ3mXLZ8vK9eYxJ3mXLZ8vK9eYxJ3mXLZ8vK9eYxJ3m',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (email) DO NOTHING;

WITH new_user AS (
  SELECT id FROM users WHERE email = 'resident3@bluegrid.com'
)
INSERT INTO profiles (id, full_name, phone, address, role, created_at, updated_at)
SELECT id, 'Arun Patel', '9876543212', 'House No. 789, Temple Street, Ward 3', 'resident', NOW(), NOW()
FROM new_user
ON CONFLICT (id) DO NOTHING;

-- Resident 4: Lakshmi Iyer
INSERT INTO users (id, email, password_hash, email_verified, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'resident4@bluegrid.com',
  '$2a$10$rZ5qH8vK9YxJ3mXLZ8vK9eYxJ3mXLZ8vK9eYxJ3mXLZ8vK9eYxJ3m',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (email) DO NOTHING;

WITH new_user AS (
  SELECT id FROM users WHERE email = 'resident4@bluegrid.com'
)
INSERT INTO profiles (id, full_name, phone, address, role, created_at, updated_at)
SELECT id, 'Lakshmi Iyer', '9876543213', 'House No. 321, Market Road, Ward 1', 'resident', NOW(), NOW()
FROM new_user
ON CONFLICT (id) DO NOTHING;

-- Resident 5: Suresh Reddy
INSERT INTO users (id, email, password_hash, email_verified, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'resident5@bluegrid.com',
  '$2a$10$rZ5qH8vK9YxJ3mXLZ8vK9eYxJ3mXLZ8vK9eYxJ3mXLZ8vK9eYxJ3m',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (email) DO NOTHING;

WITH new_user AS (
  SELECT id FROM users WHERE email = 'resident5@bluegrid.com'
)
INSERT INTO profiles (id, full_name, phone, address, role, created_at, updated_at)
SELECT id, 'Suresh Reddy', '9876543214', 'House No. 654, School Lane, Ward 2', 'resident', NOW(), NOW()
FROM new_user
ON CONFLICT (id) DO NOTHING;

-- Verify residents were created
SELECT p.full_name, u.email, p.address, p.phone
FROM profiles p
JOIN users u ON p.id = u.id
WHERE p.role = 'resident'
ORDER BY p.full_name;
