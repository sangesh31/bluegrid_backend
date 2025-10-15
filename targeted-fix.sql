-- Targeted database fixes based on actual current structure

-- 1. Columns already exist, skip rename operations
-- pipe_reports.assigned_technician_id already exists
-- water_schedules.controller_id already exists
-- pipe_reports.rejection_reason already exists

-- 2. Add missing enum values to report_status (if not already present)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'report_status' AND e.enumlabel = 'awaiting_approval') THEN
    ALTER TYPE public.report_status ADD VALUE 'awaiting_approval';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'report_status' AND e.enumlabel = 'approved') THEN
    ALTER TYPE public.report_status ADD VALUE 'approved';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'report_status' AND e.enumlabel = 'rejected') THEN
    ALTER TYPE public.report_status ADD VALUE 'rejected';
  END IF;
END $$;

-- 3. Drop existing views if they exist (to avoid conflicts)
DROP VIEW IF EXISTS public.reports_with_details CASCADE;
DROP VIEW IF EXISTS public.schedules_with_details CASCADE;

-- 4. Create the database views for easier querying
CREATE OR REPLACE VIEW public.reports_with_details AS
SELECT 
  pr.*,
  u.email as user_email,
  pt.full_name as technician_name,
  pt.phone as technician_phone,
  pa.full_name as approved_by_name
FROM public.pipe_reports pr
LEFT JOIN public.users u ON pr.user_id = u.id
LEFT JOIN public.profiles pt ON pr.assigned_technician_id = pt.id
LEFT JOIN public.profiles pa ON pr.approved_by = pa.id;

CREATE OR REPLACE VIEW public.schedules_with_details AS
SELECT 
  ws.*,
  p.full_name as controller_name,
  p.phone as controller_phone,
  p.address as controller_address
FROM public.water_schedules ws
LEFT JOIN public.profiles p ON ws.controller_id = p.id;

-- 5. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_pipe_reports_assigned_technician ON public.pipe_reports(assigned_technician_id);
CREATE INDEX IF NOT EXISTS idx_pipe_reports_approved_by ON public.pipe_reports(approved_by);
CREATE INDEX IF NOT EXISTS idx_water_schedules_controller ON public.water_schedules(controller_id);

-- 6. Ensure we have a panchayat officer for testing
DO $$
DECLARE
  admin_user_id UUID;
BEGIN
  -- Check if panchayat officer exists
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE role = 'panchayat_officer') THEN
    -- Create admin user
    INSERT INTO public.users (email, password_hash, email_verified)
    VALUES ('admin@bluegrid.com', '$2a$10$rKZqxQxGxvK5yJ5YxJ5YxOeKqxQxGxvK5yJ5YxJ5YxOeKqxQxGxvK', true)
    ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
    RETURNING id INTO admin_user_id;
    
    -- Get the user ID if it already existed
    IF admin_user_id IS NULL THEN
      SELECT id INTO admin_user_id FROM public.users WHERE email = 'admin@bluegrid.com';
    END IF;
    
    -- Create or update profile
    INSERT INTO public.profiles (id, full_name, role, phone, address)
    VALUES (admin_user_id, 'System Administrator', 'panchayat_officer', '+91-9876543210', 'Panchayat Office')
    ON CONFLICT (id) DO UPDATE SET 
      role = 'panchayat_officer',
      full_name = 'System Administrator',
      phone = '+91-9876543210',
      address = 'Panchayat Office';
  END IF;
END $$;
