# JWT実装セットアップガイド

## 必要なパッケージのインストール

JWT機能を使用するために、以下のパッケージをインストールしてください：

```bash
npm install js-cookie
```

## 環境設定

`.env`ファイルを作成し、以下の環境変数を設定してください：

```env
# JWT設定（本番環境ではサーバーサイドで管理）
REACT_APP_JWT_EXPIRES_IN=7d
REACT_APP_TOKEN_STORAGE_METHOD=cookie
```

## セキュリティに関する重要な注意事項

**⚠️ 警告**: 現在の実装はデモ・教育目的のものです。

### 本番環境での推奨事項

1. **サーバーサイドでのJWT生成**
   - JWTの生成と署名は必ずサーバーサイドで行う
   - 秘密鍵は絶対にクライアントサイドに露出させない

2. **適切な署名アルゴリズム**
   - HS256、RS256などの安全なアルゴリズムを使用
   - 現在の実装は署名なし（"alg": "none"）で危険

3. **セキュアな通信**
   - 必ずHTTPS経由で通信
   - 中間者攻撃を防ぐ

4. **トークンの保存**
   - HttpOnly Cookieの使用を推奨
   - XSS攻撃からの保護

5. **CSRF対策**
   - CSRFトークンの併用
   - SameSite Cookieの設定

6. **適切な有効期限**
   - アクセストークン：15分〜1時間
   - リフレッシュトークン：7日〜30日

## 使用方法

```javascript
import { saveToken, getToken, removeToken } from './utils/jwt';

// ログイン後（本来はサーバーからトークンを受け取る）
const token = serverResponse.token; // サーバーから取得
saveToken(token);

// APIリクエスト時
const authHeader = getAuthHeader();
fetch('/api/protected', {
  headers: {
    ...authHeader,
    'Content-Type': 'application/json'
  }
});

// ログアウト時
removeToken();
```

## 今後の実装予定

1. サーバーサイドAPI連携
2. リフレッシュトークンメカニズム
3. トークン自動更新
4. セッション管理の強化