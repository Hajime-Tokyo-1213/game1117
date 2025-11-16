import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { runMigrations } from './utils/migration.js'

// アプリケーション起動時のマイグレーション実行
console.log('=== アプリケーション起動時処理開始 ===');

try {
  const migrationResult = runMigrations();
  console.log('マイグレーション実行結果:', migrationResult);
  
  if (migrationResult.executed) {
    if (migrationResult.hasError) {
      console.error('マイグレーション中にエラーが発生しました');
      console.error('詳細:', migrationResult.executedMigrations);
    } else {
      console.log('マイグレーションが正常に完了しました');
    }
  }
} catch (error) {
  console.error('マイグレーション実行中に予期しないエラーが発生:', error);
  // マイグレーションエラーでもアプリケーションは起動を続行
}

console.log('=== アプリケーション起動時処理完了 ===');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)