-- Create enum for user roles
CREATE TYPE public.user_role AS ENUM ('user', 'admin', 'plumber', 'water_worker');

-- Create enum for report status
CREATE TYPE public.report_status AS ENUM ('pending', 'assigned', 'in_progress', 'completed');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  role public.user_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create policies for profiles
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Create pipe damage reports table
CREATE TABLE public.pipe_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  address TEXT NOT NULL,
  location_lat DECIMAL(10, 8),
  location_lng DECIMAL(11, 8),
  photo_url TEXT,
  status public.report_status NOT NULL DEFAULT 'pending',
  assigned_plumber_id UUID REFERENCES public.profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Enable RLS on pipe_reports
ALTER TABLE public.pipe_reports ENABLE ROW LEVEL SECURITY;

-- Create policies for pipe_reports
CREATE POLICY "Users can create their own reports"
  ON public.pipe_reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own reports"
  ON public.pipe_reports FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all reports"
  ON public.pipe_reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update all reports"
  ON public.pipe_reports FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Plumbers can view their assigned reports"
  ON public.pipe_reports FOR SELECT
  USING (
    auth.uid() = assigned_plumber_id OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'plumber'
    )
  );

CREATE POLICY "Plumbers can update their assigned reports"
  ON public.pipe_reports FOR UPDATE
  USING (auth.uid() = assigned_plumber_id);

-- Create water schedules table
CREATE TABLE public.water_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  scheduled_open_time TIMESTAMPTZ NOT NULL,
  scheduled_close_time TIMESTAMPTZ NOT NULL,
  actual_open_time TIMESTAMPTZ,
  actual_close_time TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT false,
  interrupted BOOLEAN NOT NULL DEFAULT false,
  interruption_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on water_schedules
ALTER TABLE public.water_schedules ENABLE ROW LEVEL SECURITY;

-- Create policies for water_schedules
CREATE POLICY "Everyone can view water schedules"
  ON public.water_schedules FOR SELECT
  USING (true);

CREATE POLICY "Water workers can create schedules"
  ON public.water_schedules FOR INSERT
  WITH CHECK (
    auth.uid() = worker_id AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'water_worker'
    )
  );

CREATE POLICY "Water workers can update their schedules"
  ON public.water_schedules FOR UPDATE
  USING (
    auth.uid() = worker_id AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'water_worker'
    )
  );

CREATE POLICY "Admins can manage all schedules"
  ON public.water_schedules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_pipe_reports_updated_at
  BEFORE UPDATE ON public.pipe_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_water_schedules_updated_at
  BEFORE UPDATE ON public.water_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'),
    'user'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();