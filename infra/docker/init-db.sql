-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Create initial database schema will be handled by migrations
-- This file is for extensions and initial setup only

-- Set timezone
SET timezone = 'UTC';
