-- 初期スキーマ作成
-- Migration: 001_initial_schema.sql

-- ユーザーテーブル
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'customer',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}'
);

-- ユーザーテーブルのインデックス
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_active ON users(is_active);

-- 在庫テーブル
CREATE TABLE IF NOT EXISTS inventory (
    id SERIAL PRIMARY KEY,
    product_code VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    quantity INTEGER DEFAULT 0 CHECK (quantity >= 0),
    price DECIMAL(10, 2) CHECK (price >= 0),
    cost DECIMAL(10, 2) CHECK (cost >= 0),
    status VARCHAR(50) DEFAULT 'available',
    category VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id),
    metadata JSONB DEFAULT '{}'
);

-- 在庫テーブルのインデックス
CREATE INDEX idx_inventory_product_code ON inventory(product_code);
CREATE INDEX idx_inventory_status ON inventory(status);
CREATE INDEX idx_inventory_category ON inventory(category);

-- 買取申請テーブル
CREATE TABLE IF NOT EXISTS buyback_applications (
    id SERIAL PRIMARY KEY,
    application_number VARCHAR(100) UNIQUE NOT NULL,
    customer_id INTEGER REFERENCES users(id),
    status VARCHAR(50) DEFAULT 'pending',
    total_amount DECIMAL(10, 2),
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP,
    reviewed_by INTEGER REFERENCES users(id),
    completed_at TIMESTAMP,
    notes TEXT,
    metadata JSONB DEFAULT '{}'
);

-- 買取申請アイテムテーブル
CREATE TABLE IF NOT EXISTS buyback_items (
    id SERIAL PRIMARY KEY,
    application_id INTEGER REFERENCES buyback_applications(id) ON DELETE CASCADE,
    product_code VARCHAR(100),
    product_name VARCHAR(255),
    quantity INTEGER CHECK (quantity > 0),
    offered_price DECIMAL(10, 2) CHECK (offered_price >= 0),
    condition VARCHAR(50),
    notes TEXT,
    metadata JSONB DEFAULT '{}'
);

-- 買取申請テーブルのインデックス
CREATE INDEX idx_buyback_applications_number ON buyback_applications(application_number);
CREATE INDEX idx_buyback_applications_customer ON buyback_applications(customer_id);
CREATE INDEX idx_buyback_applications_status ON buyback_applications(status);
CREATE INDEX idx_buyback_items_application ON buyback_items(application_id);

-- 販売記録テーブル
CREATE TABLE IF NOT EXISTS sales (
    id SERIAL PRIMARY KEY,
    sale_number VARCHAR(100) UNIQUE NOT NULL,
    inventory_id INTEGER REFERENCES inventory(id),
    quantity INTEGER CHECK (quantity > 0),
    unit_price DECIMAL(10, 2) CHECK (unit_price >= 0),
    total_price DECIMAL(10, 2) CHECK (total_price >= 0),
    customer_id INTEGER REFERENCES users(id),
    sold_by INTEGER REFERENCES users(id),
    sold_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    payment_method VARCHAR(50),
    metadata JSONB DEFAULT '{}'
);

-- 販売記録テーブルのインデックス
CREATE INDEX idx_sales_number ON sales(sale_number);
CREATE INDEX idx_sales_inventory ON sales(inventory_id);
CREATE INDEX idx_sales_customer ON sales(customer_id);
CREATE INDEX idx_sales_date ON sales(sold_at);

-- 監査ログテーブル
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id INTEGER,
    changes JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 監査ログテーブルのインデックス
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);

-- 更新時刻自動更新関数
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 更新時刻トリガーの作成
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_inventory_updated_at
    BEFORE UPDATE ON inventory
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();