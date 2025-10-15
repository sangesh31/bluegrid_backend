-- Fix the handle_new_user trigger function to use correct enum values

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
