-- Rollback script for 001_initial_schema.sql

-- Drop triggers
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
DROP TRIGGER IF EXISTS update_inventory_updated_at ON inventory;

-- Drop functions
DROP FUNCTION IF EXISTS update_updated_at();

-- Drop indexes
DROP INDEX IF EXISTS idx_audit_logs_created;
DROP INDEX IF EXISTS idx_audit_logs_resource;
DROP INDEX IF EXISTS idx_audit_logs_action;
DROP INDEX IF EXISTS idx_audit_logs_user;

DROP INDEX IF EXISTS idx_sales_date;
DROP INDEX IF EXISTS idx_sales_customer;
DROP INDEX IF EXISTS idx_sales_inventory;
DROP INDEX IF EXISTS idx_sales_number;

DROP INDEX IF EXISTS idx_buyback_items_application;
DROP INDEX IF EXISTS idx_buyback_applications_status;
DROP INDEX IF EXISTS idx_buyback_applications_customer;
DROP INDEX IF EXISTS idx_buyback_applications_number;

DROP INDEX IF EXISTS idx_inventory_category;
DROP INDEX IF EXISTS idx_inventory_status;
DROP INDEX IF EXISTS idx_inventory_product_code;

DROP INDEX IF EXISTS idx_users_active;
DROP INDEX IF EXISTS idx_users_role;
DROP INDEX IF EXISTS idx_users_email;

-- Drop tables in correct order (respecting foreign key constraints)
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS sales CASCADE;
DROP TABLE IF EXISTS buyback_items CASCADE;
DROP TABLE IF EXISTS buyback_applications CASCADE;
DROP TABLE IF EXISTS inventory CASCADE;
DROP TABLE IF EXISTS users CASCADE;