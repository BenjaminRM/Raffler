-- Update status check to allow 'PENDING'
ALTER TABLE raffles DROP CONSTRAINT raffles_status_check;
ALTER TABLE raffles ADD CONSTRAINT raffles_status_check CHECK (status IN ('ACTIVE', 'CLOSED', 'CANCELLED', 'PENDING'));

-- Make fields nullable to support draft creation phase
ALTER TABLE raffles ALTER COLUMN item_title DROP NOT NULL;
ALTER TABLE raffles ALTER COLUMN market_price DROP NOT NULL;
ALTER TABLE raffles ALTER COLUMN total_slots DROP NOT NULL;
ALTER TABLE raffles ALTER COLUMN cost_per_slot DROP NOT NULL;
