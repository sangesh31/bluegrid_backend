-- Fix RLS policies for profiles table
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

-- Create new policies for profiles
CREATE POLICY "Users can view their own profile"
  ON public.profiles 
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can manage all profiles"
  ON public.profiles
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'::user_role
    )
  );

-- Fix RLS policies for pipe_reports table
DROP POLICY IF EXISTS "Users can create their own reports" ON public.pipe_reports;
DROP POLICY IF EXISTS "Users can view their own reports" ON public.pipe_reports;
DROP POLICY IF EXISTS "Admins can view all reports" ON public.pipe_reports;
DROP POLICY IF EXISTS "Admins can update all reports" ON public.pipe_reports;
DROP POLICY IF EXISTS "Plumbers can view their assigned reports" ON public.pipe_reports;
DROP POLICY IF EXISTS "Plumbers can update their assigned reports" ON public.pipe_reports;

-- Recreate policies for pipe_reports
CREATE POLICY "Users can create their own reports"
  ON public.pipe_reports
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own reports"
  ON public.pipe_reports
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all reports"
  ON public.pipe_reports
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'::user_role
    )
  );

CREATE POLICY "Admins can update all reports"
  ON public.pipe_reports
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'::user_role
    )
  );

CREATE POLICY "Plumbers can view their assigned reports"
  ON public.pipe_reports
  FOR SELECT
  USING (
    assigned_plumber_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'plumber'::user_role
    )
  );

CREATE POLICY "Plumbers can update their assigned reports"
  ON public.pipe_reports
  FOR UPDATE
  USING (assigned_plumber_id = auth.uid())
  WITH CHECK (assigned_plumber_id = auth.uid());

-- Fix handle_new_user function to include all required fields
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, phone, address)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'),
    'user'::user_role,
    NULL,
    NULL
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
