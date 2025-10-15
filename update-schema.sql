-- Update role enum to use correct names
ALTER TABLE public.profiles ALTER COLUMN role DROP DEFAULT;
ALTER TABLE public.profiles ALTER COLUMN role TYPE TEXT;

UPDATE public.profiles SET role = 'panchayat_officer' WHERE role = 'admin';
UPDATE public.profiles SET role = 'maintenance_technician' WHERE role = 'plumber';
UPDATE public.profiles SET role = 'water_flow_controller' WHERE role = 'water_worker';
UPDATE public.profiles SET role = 'resident' WHERE role = 'user';

DROP TYPE IF EXISTS public.user_role CASCADE;
CREATE TYPE public.user_role AS ENUM ('resident', 'panchayat_officer', 'maintenance_technician', 'water_flow_controller');

ALTER TABLE public.profiles ALTER COLUMN role TYPE public.user_role USING role::public.user_role;
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'resident';

-- Update report status to include 'in_progress'
ALTER TYPE public.report_status ADD VALUE IF NOT EXISTS 'in_progress';

-- Add approval fields to pipe_reports
ALTER TABLE public.pipe_reports 
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS completion_notes TEXT;

-- Add notification preferences
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL, -- 'water_schedule', 'report_update', 'system'
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON public.notifications(read);

-- Add interruption tracking to water schedules
ALTER TABLE public.water_schedules 
ADD COLUMN IF NOT EXISTS area TEXT,
ADD COLUMN IF NOT EXISTS notification_sent BOOLEAN DEFAULT false;

-- Create index for faster schedule queries
CREATE INDEX IF NOT EXISTS idx_water_schedules_date ON public.water_schedules(scheduled_open_time, scheduled_close_time);
