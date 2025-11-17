-- 古物台帳管理テーブル
-- Migration: 004_antiquities_ledger.sql
-- 古物営業法に準拠した台帳管理

-- 古物商許可証情報テーブル
CREATE TABLE IF NOT EXISTS antiquities_license (
    id SERIAL PRIMARY KEY,
    license_number VARCHAR(100) UNIQUE NOT NULL,
    license_holder VARCHAR(255) NOT NULL,
    license_type VARCHAR(50) NOT NULL,
    issuing_authority VARCHAR(255) NOT NULL,
    issue_date DATE NOT NULL,
    expiry_date DATE,
    business_name VARCHAR(255),
    business_address TEXT NOT NULL,
    business_phone VARCHAR(20) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 古物台帳テーブル（法的要件準拠）
CREATE TABLE IF NOT EXISTS antiquities_ledger (
    id SERIAL PRIMARY KEY,
    entry_number VARCHAR(50) UNIQUE NOT NULL, -- 台帳番号
    transaction_date DATE NOT NULL,
    transaction_time TIME NOT NULL,
    transaction_type VARCHAR(50) NOT NULL CHECK (transaction_type IN ('purchase', 'sale', 'exchange', 'consignment', 'return')),
    
    -- 取引相手情報（本人確認必須項目）
    counterpart_type VARCHAR(50) NOT NULL CHECK (counterpart_type IN ('individual', 'corporation')),
    counterpart_name VARCHAR(255) NOT NULL,
    counterpart_name_kana VARCHAR(255),
    counterpart_address TEXT NOT NULL,
    counterpart_phone VARCHAR(20) NOT NULL,
    counterpart_email VARCHAR(255),
    counterpart_birth_date DATE,
    counterpart_occupation VARCHAR(255),
    counterpart_company VARCHAR(255),
    
    -- 本人確認書類情報
    id_document_type VARCHAR(50) NOT NULL CHECK (id_document_type IN ('drivers_license', 'passport', 'residence_card', 'mynumber_card', 'insurance_card', 'corporate_registry', 'other')),
    id_document_number VARCHAR(100) NOT NULL,
    id_document_issue_date DATE,
    id_document_issuer VARCHAR(255),
    id_verification_method VARCHAR(50) CHECK (id_verification_method IN ('face_to_face', 'online', 'postal')),
    id_verification_date TIMESTAMP NOT NULL,
    id_document_copy_stored BOOLEAN DEFAULT true,
    id_document_copy_path TEXT,
    
    -- 商品情報
    item_category VARCHAR(100) NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    item_model VARCHAR(255),
    item_serial_number VARCHAR(255),
    item_manufacturer VARCHAR(255),
    item_description TEXT,
    item_condition VARCHAR(50),
    item_features TEXT, -- 特徴（傷、刻印等）
    item_accessories TEXT, -- 付属品
    
    -- 数量・金額
    quantity INTEGER DEFAULT 1 CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0),
    total_amount DECIMAL(10,2) NOT NULL CHECK (total_amount >= 0),
    payment_method VARCHAR(50) CHECK (payment_method IN ('cash', 'bank_transfer', 'credit_card', 'check', 'other')),
    
    -- 確認事項
    stolen_check_completed BOOLEAN DEFAULT false,
    stolen_check_date TIMESTAMP,
    stolen_check_result VARCHAR(50),
    age_verification_completed BOOLEAN DEFAULT false,
    
    -- 保管場所
    storage_location VARCHAR(255),
    storage_period_days INTEGER DEFAULT 7, -- 法定保管期間
    can_dispose_after DATE,
    
    -- 関連情報
    related_product_id INTEGER REFERENCES products(id),
    related_transaction_id INTEGER,
    
    -- メタデータ
    images JSONB DEFAULT '[]',
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    
    -- 記録者情報
    recorded_by INTEGER NOT NULL REFERENCES users(id),
    verified_by INTEGER REFERENCES users(id),
    verified_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 古物台帳添付書類テーブル
CREATE TABLE IF NOT EXISTS antiquities_documents (
    id SERIAL PRIMARY KEY,
    ledger_id INTEGER NOT NULL REFERENCES antiquities_ledger(id) ON DELETE CASCADE,
    document_type VARCHAR(50) NOT NULL CHECK (document_type IN ('id_copy', 'contract', 'receipt', 'photo', 'certificate', 'other')),
    document_name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER,
    mime_type VARCHAR(100),
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    uploaded_by INTEGER REFERENCES users(id)
);

-- 盗品照会記録テーブル
CREATE TABLE IF NOT EXISTS stolen_goods_checks (
    id SERIAL PRIMARY KEY,
    ledger_id INTEGER NOT NULL REFERENCES antiquities_ledger(id) ON DELETE CASCADE,
    check_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    check_method VARCHAR(50) CHECK (check_method IN ('police_database', 'manual_check', 'online_system')),
    check_result VARCHAR(50) NOT NULL CHECK (check_result IN ('clear', 'suspicious', 'matched', 'pending')),
    reference_number VARCHAR(100),
    checked_by INTEGER NOT NULL REFERENCES users(id),
    notes TEXT
);

-- 古物営業法違反防止チェックリストテーブル
CREATE TABLE IF NOT EXISTS compliance_checklist (
    id SERIAL PRIMARY KEY,
    ledger_id INTEGER NOT NULL REFERENCES antiquities_ledger(id) ON DELETE CASCADE,
    check_item VARCHAR(255) NOT NULL,
    is_completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMP,
    completed_by INTEGER REFERENCES users(id),
    notes TEXT
);

-- 標準チェックリスト項目
INSERT INTO compliance_checklist (ledger_id, check_item) 
SELECT 0, unnest(ARRAY[
    '本人確認書類の確認',
    '年齢確認（18歳以上）',
    '盗品照会の実施',
    '取引内容の正確な記録',
    '本人確認書類のコピー保管',
    '台帳への記載',
    '保管期間の設定'
]) WHERE false; -- 実際のレコード作成時にトリガーで追加

-- 報告書テンプレートテーブル
CREATE TABLE IF NOT EXISTS antiquities_reports (
    id SERIAL PRIMARY KEY,
    report_type VARCHAR(50) NOT NULL CHECK (report_type IN ('monthly', 'quarterly', 'annual', 'police', 'custom')),
    report_period_start DATE NOT NULL,
    report_period_end DATE NOT NULL,
    report_data JSONB NOT NULL,
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    generated_by INTEGER REFERENCES users(id),
    submitted_to VARCHAR(255),
    submitted_at TIMESTAMP,
    file_path TEXT
);

-- インデックスの作成
CREATE INDEX IF NOT EXISTS idx_antiquities_ledger_entry_number ON antiquities_ledger(entry_number);
CREATE INDEX IF NOT EXISTS idx_antiquities_ledger_date ON antiquities_ledger(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_antiquities_ledger_type ON antiquities_ledger(transaction_type);
CREATE INDEX IF NOT EXISTS idx_antiquities_ledger_counterpart ON antiquities_ledger(counterpart_name);
CREATE INDEX IF NOT EXISTS idx_antiquities_ledger_id_number ON antiquities_ledger(id_document_number);
CREATE INDEX IF NOT EXISTS idx_antiquities_ledger_item ON antiquities_ledger(item_name);
CREATE INDEX IF NOT EXISTS idx_antiquities_ledger_serial ON antiquities_ledger(item_serial_number);
CREATE INDEX IF NOT EXISTS idx_antiquities_ledger_storage ON antiquities_ledger(storage_location);
CREATE INDEX IF NOT EXISTS idx_antiquities_ledger_verified ON antiquities_ledger(verified_at);

CREATE INDEX IF NOT EXISTS idx_antiquities_documents_ledger ON antiquities_documents(ledger_id);
CREATE INDEX IF NOT EXISTS idx_antiquities_documents_type ON antiquities_documents(document_type);

CREATE INDEX IF NOT EXISTS idx_stolen_checks_ledger ON stolen_goods_checks(ledger_id);
CREATE INDEX IF NOT EXISTS idx_stolen_checks_result ON stolen_goods_checks(check_result);
CREATE INDEX IF NOT EXISTS idx_stolen_checks_date ON stolen_goods_checks(check_date DESC);

-- トリガー関数: 台帳番号の自動採番
CREATE OR REPLACE FUNCTION generate_ledger_entry_number()
RETURNS TRIGGER AS $$
DECLARE
    new_number VARCHAR(50);
BEGIN
    -- 年月日-連番 形式で採番 (例: 20240101-0001)
    SELECT TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || 
           LPAD(COALESCE(MAX(SUBSTRING(entry_number FROM 10 FOR 4)::INTEGER), 0) + 1, 4, '0')
    INTO new_number
    FROM antiquities_ledger
    WHERE entry_number LIKE TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-%';
    
    NEW.entry_number := new_number;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- トリガーの作成
CREATE TRIGGER trigger_generate_ledger_number
    BEFORE INSERT ON antiquities_ledger
    FOR EACH ROW
    WHEN (NEW.entry_number IS NULL)
    EXECUTE FUNCTION generate_ledger_entry_number();

-- トリガー関数: コンプライアンスチェックリストの自動生成
CREATE OR REPLACE FUNCTION create_compliance_checklist()
RETURNS TRIGGER AS $$
BEGIN
    -- 買取時のみチェックリストを生成
    IF NEW.transaction_type = 'purchase' THEN
        INSERT INTO compliance_checklist (ledger_id, check_item)
        VALUES 
            (NEW.id, '本人確認書類の確認'),
            (NEW.id, '年齢確認（18歳以上）'),
            (NEW.id, '盗品照会の実施'),
            (NEW.id, '取引内容の正確な記録'),
            (NEW.id, '本人確認書類のコピー保管'),
            (NEW.id, '台帳への記載'),
            (NEW.id, '保管期間の設定');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- トリガーの作成
CREATE TRIGGER trigger_create_compliance_checklist
    AFTER INSERT ON antiquities_ledger
    FOR EACH ROW
    EXECUTE FUNCTION create_compliance_checklist();