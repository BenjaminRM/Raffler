-- Add guild_id to raffles for multi-tenancy support
ALTER TABLE raffles ADD COLUMN guild_id text;

-- Since we can't easily backfill guild_id for existing rows without knowing it, 
-- we will default it to a placeholder if there are rows (or just 'unknown').
-- Ideally, we would truncate, but let's just allow NULL for old rows or update manually if needed.
-- For new rows, we will require it in the application logic, eventually making it NOT NULL.
-- But for this migration, we'll keep it nullable initially to avoid errors on existing data, 
-- or set a default.
ALTER TABLE raffles ALTER COLUMN guild_id SET DEFAULT 'unknown';

-- Add images array column
ALTER TABLE raffles ADD COLUMN images text[];

-- Migrate data: move item_image_url to the first element of images array
UPDATE raffles SET images = ARRAY[item_image_url] WHERE item_image_url IS NOT NULL;

-- Drop the old column
ALTER TABLE raffles DROP COLUMN item_image_url;

-- Update the index to be per-guild for active raffles
DROP INDEX IF EXISTS idx_raffles_status;
CREATE INDEX idx_raffles_status_guild ON raffles(guild_id, status) WHERE status = 'ACTIVE';
