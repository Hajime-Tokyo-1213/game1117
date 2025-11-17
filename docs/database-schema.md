# データベーススキーマ仕様書

## 概要
Game-F システムのデータベーススキーマ設計書です。PostgreSQL を使用し、古物営業法に準拠した買取・販売管理システムのデータ構造を定義します。

## データベース構成

### 1. ユーザー管理 (User Management)

#### users テーブル
ユーザー基本情報を管理

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | SERIAL | PRIMARY KEY | ユーザーID |
| email | VARCHAR(255) | UNIQUE NOT NULL | メールアドレス |
| password_hash | VARCHAR(255) | NOT NULL | パスワードハッシュ |
| name | VARCHAR(255) | NOT NULL | 氏名 |
| role | VARCHAR(50) | DEFAULT 'customer' | ロール |
| phone | VARCHAR(20) | | 電話番号 |
| address | TEXT | | 住所 |
| postal_code | VARCHAR(10) | | 郵便番号 |
| company_name | VARCHAR(255) | | 会社名 |
| country | VARCHAR(100) | DEFAULT 'Japan' | 国 |
| language | VARCHAR(10) | DEFAULT 'ja' | 言語 |
| email_verified | BOOLEAN | DEFAULT false | メール認証済みフラグ |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 作成日時 |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 更新日時 |

#### user_sessions テーブル
ユーザーセッション管理

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | SERIAL | PRIMARY KEY | セッションID |
| user_id | INTEGER | REFERENCES users(id) | ユーザーID |
| token_hash | VARCHAR(255) | UNIQUE NOT NULL | トークンハッシュ |
| expires_at | TIMESTAMP | NOT NULL | 有効期限 |
| ip_address | INET | | IPアドレス |
| user_agent | TEXT | | ユーザーエージェント |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 作成日時 |

#### roles テーブル
ロール定義

| ロール名 | 説明 | 権限レベル |
|---------|------|-----------|
| admin | システム管理者 | 全権限 |
| manager | マネージャー | 承認・管理権限 |
| staff | スタッフ | 通常業務権限 |
| customer | 顧客 | 基本権限 |
| overseas_buyer | 海外バイヤー | 海外取引権限 |

### 2. 在庫管理 (Inventory Management)

#### products テーブル
商品マスタ

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | SERIAL | PRIMARY KEY | 商品ID |
| sku | VARCHAR(100) | UNIQUE | SKUコード |
| name | VARCHAR(255) | NOT NULL | 商品名 |
| category_id | INTEGER | REFERENCES product_categories(id) | カテゴリID |
| manufacturer_id | INTEGER | REFERENCES manufacturers(id) | メーカーID |
| purchase_price | DECIMAL(10,2) | DEFAULT 0 | 仕入価格 |
| selling_price | DECIMAL(10,2) | DEFAULT 0 | 販売価格 |
| stock_quantity | INTEGER | DEFAULT 0 | 在庫数 |
| reserved_quantity | INTEGER | DEFAULT 0 | 引当数 |
| available_quantity | INTEGER | GENERATED | 利用可能数 |
| condition_grade | VARCHAR(50) | | 状態グレード |
| zaico_item_id | VARCHAR(255) | | Zaico連携ID |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 作成日時 |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 更新日時 |

#### stock_movements テーブル
在庫変動履歴

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | SERIAL | PRIMARY KEY | 変動ID |
| product_id | INTEGER | REFERENCES products(id) | 商品ID |
| movement_type | VARCHAR(50) | NOT NULL | 変動タイプ |
| quantity | INTEGER | NOT NULL | 数量 |
| quantity_before | INTEGER | NOT NULL | 変動前数量 |
| quantity_after | INTEGER | NOT NULL | 変動後数量 |
| reference_type | VARCHAR(50) | | 参照タイプ |
| reference_id | INTEGER | | 参照ID |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 作成日時 |
| created_by | INTEGER | REFERENCES users(id) | 作成者 |

### 3. 古物台帳 (Antiquities Ledger)

#### antiquities_ledger テーブル
古物営業法準拠の台帳

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | SERIAL | PRIMARY KEY | 台帳ID |
| entry_number | VARCHAR(50) | UNIQUE NOT NULL | 台帳番号 |
| transaction_date | DATE | NOT NULL | 取引日 |
| transaction_type | VARCHAR(50) | NOT NULL | 取引種別 |
| counterpart_name | VARCHAR(255) | NOT NULL | 取引相手名 |
| counterpart_address | TEXT | NOT NULL | 取引相手住所 |
| counterpart_phone | VARCHAR(20) | NOT NULL | 取引相手電話 |
| id_document_type | VARCHAR(50) | NOT NULL | 本人確認書類種別 |
| id_document_number | VARCHAR(100) | NOT NULL | 本人確認書類番号 |
| item_name | VARCHAR(255) | NOT NULL | 品名 |
| item_serial_number | VARCHAR(255) | | シリアル番号 |
| quantity | INTEGER | DEFAULT 1 | 数量 |
| unit_price | DECIMAL(10,2) | NOT NULL | 単価 |
| total_amount | DECIMAL(10,2) | NOT NULL | 合計金額 |
| stolen_check_completed | BOOLEAN | DEFAULT false | 盗品照会済み |
| recorded_by | INTEGER | REFERENCES users(id) | 記録者 |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 作成日時 |

### 4. 買取管理 (Buyback Management)

#### buyback_applications テーブル
買取申請

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | SERIAL | PRIMARY KEY | 申請ID |
| application_number | VARCHAR(100) | UNIQUE NOT NULL | 申請番号 |
| customer_id | INTEGER | REFERENCES users(id) | 顧客ID |
| status | buyback_status | DEFAULT 'draft' | ステータス |
| applicant_name | VARCHAR(255) | NOT NULL | 申請者名 |
| applicant_phone | VARCHAR(20) | NOT NULL | 申請者電話 |
| applicant_address | TEXT | NOT NULL | 申請者住所 |
| estimated_amount | DECIMAL(10,2) | DEFAULT 0 | 見積金額 |
| offered_amount | DECIMAL(10,2) | | 提示金額 |
| final_amount | DECIMAL(10,2) | | 最終金額 |
| submitted_at | TIMESTAMP | | 申請日時 |
| reviewed_at | TIMESTAMP | | 査定日時 |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 作成日時 |

#### buyback_items テーブル
買取明細

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | SERIAL | PRIMARY KEY | 明細ID |
| application_id | INTEGER | REFERENCES buyback_applications(id) | 申請ID |
| product_name | VARCHAR(255) | NOT NULL | 商品名 |
| serial_number | VARCHAR(255) | | シリアル番号 |
| quantity | INTEGER | DEFAULT 1 | 数量 |
| condition_grade | VARCHAR(50) | | 状態グレード |
| estimated_price | DECIMAL(10,2) | | 見積価格 |
| offered_price | DECIMAL(10,2) | | 提示価格 |
| final_price | DECIMAL(10,2) | | 最終価格 |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 作成日時 |

### 5. 販売管理 (Sales Management)

#### sales_orders テーブル
販売注文

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | SERIAL | PRIMARY KEY | 注文ID |
| order_number | VARCHAR(100) | UNIQUE NOT NULL | 注文番号 |
| customer_id | INTEGER | REFERENCES users(id) | 顧客ID |
| status | sale_status | DEFAULT 'pending' | ステータス |
| subtotal | DECIMAL(10,2) | NOT NULL DEFAULT 0 | 小計 |
| tax_amount | DECIMAL(10,2) | DEFAULT 0 | 税額 |
| shipping_fee | DECIMAL(10,2) | DEFAULT 0 | 送料 |
| total_amount | DECIMAL(10,2) | NOT NULL DEFAULT 0 | 合計金額 |
| payment_method | VARCHAR(50) | | 支払方法 |
| ordered_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 注文日時 |
| shipped_at | TIMESTAMP | | 発送日時 |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 作成日時 |

#### sales_order_items テーブル
販売注文明細

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | SERIAL | PRIMARY KEY | 明細ID |
| order_id | INTEGER | REFERENCES sales_orders(id) | 注文ID |
| product_id | INTEGER | REFERENCES products(id) | 商品ID |
| product_name | VARCHAR(255) | NOT NULL | 商品名 |
| quantity | INTEGER | DEFAULT 1 | 数量 |
| unit_price | DECIMAL(10,2) | NOT NULL | 単価 |
| total_amount | DECIMAL(10,2) | NOT NULL | 合計金額 |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 作成日時 |

## インデックス戦略

### 主要インデックス
- **ユーザー検索**: email, phone, company_name
- **商品検索**: sku, barcode, name, category_id
- **台帳検索**: entry_number, transaction_date, counterpart_name
- **注文検索**: order_number, customer_id, status, ordered_at

### パフォーマンス最適化
- 日付範囲検索用の複合インデックス
- JSONBカラムのGINインデックス
- 全文検索用のGiSTインデックス（将来実装）

## セキュリティ考慮事項

### データ保護
- パスワードは必ずハッシュ化（bcrypt）
- トークンは暗号化して保存
- 個人情報カラムの暗号化（将来実装）

### アクセス制御
- Row Level Security（RLS）の実装検討
- ロールベースのアクセス制御
- 監査ログの完全記録

### コンプライアンス
- 古物営業法の要件を満たす台帳設計
- 本人確認記録の必須化
- 法定保管期間の自動管理

## マイグレーション戦略

### バージョン管理
- 連番付きマイグレーションファイル
- ロールバックスクリプトの用意
- スキーマバージョンの追跡

### 実行順序
1. 001_initial_schema.sql - 基本テーブル
2. 002_user_management.sql - ユーザー管理拡張
3. 003_inventory_management.sql - 在庫管理
4. 004_antiquities_ledger.sql - 古物台帳
5. 005_buyback_sales.sql - 買取・販売

## 今後の拡張計画

### 短期
- 全文検索機能の追加
- パーティショニングの実装
- 統計情報テーブルの追加

### 中期
- マルチテナント対応
- 暗号化カラムの実装
- リアルタイム同期機能

### 長期
- 分散データベース対応
- NoSQLとのハイブリッド構成
- AIベース価格予測テーブル