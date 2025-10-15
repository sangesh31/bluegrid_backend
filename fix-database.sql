-- Complete Database Schema Fix for BlueGrid Water Management System
-- This script fixes all database issues to match the application requirements

-- 1. Fix the report status enum to include all required statuses
DROP TYPE IF EXISTS public.report_status CASCADE;
CREATE TYPE public.report_status AS ENUM (
  'pending', 
  'assigned', 
  'in_progress', 
  'completed', 
  'awaiting_approval', 
  'approved', 
  'rejected'
);

-- 2. Fix the user role enum to match application expectations
DROP TYPE IF EXISTS public.user_role CASCADE;
CREATE TYPE public.user_role AS ENUM (
  'resident', 
  'panchayat_officer', 
  'maintenance_technician', 
  'water_flow_controller'
);

-- 3. Update pipe_reports table structure
ALTER TABLE public.pipe_reports DROP COLUMN IF EXISTS assigned_plumber_id;
ALTER TABLE public.pipe_reports 
ADD COLUMN IF NOT EXISTS assigned_technician_id UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS completion_notes TEXT,
ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Update the status column to use the new enum
ALTER TABLE public.pipe_reports ALTER COLUMN status TYPE public.report_status USING status::text::public.report_status;

-- 4. Update water_schedules table structure
ALTER TABLE public.water_schedules DROP COLUMN IF EXISTS worker_id;
ALTER TABLE public.water_schedules 
ADD COLUMN IF NOT EXISTS controller_id UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS area TEXT;

-- 5. Update profiles table to use correct role enum
ALTER TABLE public.profiles ALTER COLUMN role TYPE public.user_role USING 
  CASE 
    WHEN role::text = 'user' THEN 'resident'::public.user_role
    WHEN role::text = 'admin' THEN 'panchayat_officer'::public.user_role
    WHEN role::text = 'plumber' THEN 'maintenance_technician'::public.user_role
    WHEN role::text = 'water_worker' THEN 'water_flow_controller'::public.user_role
    ELSE role::text::public.user_role
  END;

-- Set default role to resident
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'resident';

-- 6. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_pipe_reports_assigned_technician ON public.pipe_reports(assigned_technician_id);
CREATE INDEX IF NOT EXISTS idx_pipe_reports_approved_by ON public.pipe_reports(approved_by);
CREATE INDEX IF NOT EXISTS idx_water_schedules_controller ON public.water_schedules(controller_id);
CREATE INDEX IF NOT EXISTS idx_water_schedules_area ON public.water_schedules(area);

-- 7. Update the handle_new_user function to use correct role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    'New User',
    'resident'::public.user_role
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. Create a default panchayat officer if none exists
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

-- 9. Clean up any invalid data
UPDATE public.pipe_reports SET status = 'pending' WHERE status IS NULL;
UPDATE public.profiles SET role = 'resident' WHERE role IS NULL;

-- 10. Add constraints to ensure data integrity
ALTER TABLE public.pipe_reports 
ADD CONSTRAINT chk_completion_notes 
CHECK (
  (status IN ('awaiting_approval', 'approved', 'rejected') AND completion_notes IS NOT NULL) 
  OR 
  (status NOT IN ('awaiting_approval', 'approved', 'rejected'))
);

ALTER TABLE public.pipe_reports 
ADD CONSTRAINT chk_rejection_reason 
CHECK (
  (status = 'rejected' AND rejection_reason IS NOT NULL) 
  OR 
  (status != 'rejected')
);

-- 11. Create a view for easier report querying with joined data
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

-- 12. Create a view for schedules with controller details
CREATE OR REPLACE VIEW public.schedules_with_details AS
SELECT 
  ws.*,
  p.full_name as controller_name,
  p.phone as controller_phone,
  p.address as controller_address
FROM public.water_schedules ws
LEFT JOIN public.profiles p ON ws.controller_id = p.id;

COMMIT;
