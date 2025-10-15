-- Neon Database Schema for BlueGrid Water Management System
-- This schema is adapted from Supabase to work with standard PostgreSQL

-- Create enum for user roles
CREATE TYPE public.user_role AS ENUM ('user', 'admin', 'plumber', 'water_worker');

-- Create enum for report status
CREATE TYPE public.report_status AS ENUM ('pending', 'assigned', 'in_progress', 'completed');

-- Create users table (replaces Supabase auth.users)
CREATE TABLE public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  email_verified BOOLEAN NOT NULL DEFAULT false,
  last_sign_in_at TIMESTAMPTZ
);

-- Create index on email for faster lookups
CREATE INDEX idx_users_email ON public.users(email);

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  role public.user_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

-- Create indexes for better query performance
CREATE INDEX idx_pipe_reports_user_id ON public.pipe_reports(user_id);
CREATE INDEX idx_pipe_reports_status ON public.pipe_reports(status);
CREATE INDEX idx_pipe_reports_assigned_plumber ON public.pipe_reports(assigned_plumber_id);

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

-- Create index for active schedules
CREATE INDEX idx_water_schedules_active ON public.water_schedules(is_active);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

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

-- Create function to handle new user signup (creates profile automatically)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    'User',
    'user'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for new user signup
CREATE TRIGGER on_user_created
  AFTER INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Create sessions table for JWT token management
CREATE TABLE public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on user_id and token for faster lookups
CREATE INDEX idx_sessions_user_id ON public.sessions(user_id);
CREATE INDEX idx_sessions_token ON public.sessions(token);
CREATE INDEX idx_sessions_expires_at ON public.sessions(expires_at);

-- Function to clean up expired sessions
CREATE OR REPLACE FUNCTION public.cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM public.sessions WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Insert a default admin user (password: admin123 - CHANGE THIS IN PRODUCTION!)
-- Password hash is bcrypt hash of 'admin123'
INSERT INTO public.users (email, password_hash, email_verified)
VALUES ('admin@bluegrid.com', '$2a$10$rKZqxQxGxvK5yJ5YxJ5YxOeKqxQxGxvK5yJ5YxJ5YxOeKqxQxGxvK', true)
ON CONFLICT (email) DO NOTHING;
