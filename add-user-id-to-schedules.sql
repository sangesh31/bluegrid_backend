-- Add user_id column to water_schedules table to link schedules to specific residents

ALTER TABLE water_schedules 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_water_schedules_user_id ON water_schedules(user_id);

-- Update existing schedules to set user_id to NULL (they won't be linked to specific users)
-- New schedules will have user_id populated
