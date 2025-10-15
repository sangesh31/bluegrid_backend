-- Temporarily disable the auto-profile creation trigger for staff creation
-- We'll create profiles manually for staff members

DROP TRIGGER IF EXISTS on_user_created ON public.users;
