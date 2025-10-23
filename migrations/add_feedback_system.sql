-- Add feedback columns to pipe_reports table
ALTER TABLE pipe_reports 
ADD COLUMN IF NOT EXISTS feedback_rating INTEGER CHECK (feedback_rating >= 1 AND feedback_rating <= 5),
ADD COLUMN IF NOT EXISTS feedback_comment TEXT,
ADD COLUMN IF NOT EXISTS feedback_date TIMESTAMP,
ADD COLUMN IF NOT EXISTS has_feedback BOOLEAN DEFAULT FALSE;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_pipe_reports_feedback ON pipe_reports(has_feedback, feedback_rating);

-- Update existing completed reports to allow feedback
UPDATE pipe_reports 
SET has_feedback = FALSE 
WHERE status IN ('completed', 'approved') AND has_feedback IS NULL;

COMMENT ON COLUMN pipe_reports.feedback_rating IS 'Star rating from 1 to 5 given by resident';
COMMENT ON COLUMN pipe_reports.feedback_comment IS 'Feedback comment from resident';
COMMENT ON COLUMN pipe_reports.feedback_date IS 'Date when feedback was submitted';
COMMENT ON COLUMN pipe_reports.has_feedback IS 'Whether resident has submitted feedback';
