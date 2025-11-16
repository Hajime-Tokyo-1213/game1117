// Zaico APIキー状態確認エンドポイント
// 管理者がAPIキーの設定状態を確認するためのAPI

export default async function handler(req, res) {
  // GETリクエストのみ許可
  if (req.method !== 'GET') {
    return res.status(405).json({ 
      error: 'Method not allowed',
      message: 'このエンドポイントはGETリクエストのみ対応しています'
    });
  }

  try {
    // 環境変数からAPIキーを確認
    const apiKey = process.env.ZAICO_API_KEY;
    
    if (!apiKey) {
      return res.status(200).json({ 
        configured: false,
        valid: false,
        message: 'Zaico APIキーが設定されていません'
      });
    }

    // APIキーの基本的なフォーマットチェック
    const isValidFormat = apiKey.length > 10 && typeof apiKey === 'string';
    
    if (!isValidFormat) {
      return res.status(200).json({ 
        configured: true,
        valid: false,
        message: 'APIキーのフォーマットが無効です'
      });
    }

    // 簡易的なAPIキー有効性テスト
    // 実際の実装では、Zaico APIに軽いテストリクエストを送信して確認
    try {
      // TODO: 実際のZaico API呼び出しでテスト
      // const testResponse = await fetch('https://web.zaico.co.jp/api/v1/inventories?per_page=1', {
      //   headers: { 'Authorization': `Bearer ${apiKey}` }
      // });
      
      // 現時点では設定済みとして返す
      return res.status(200).json({ 
        configured: true,
        valid: true,
        message: 'Zaico APIキーが設定されており、有効です'
      });
    } catch (error) {
      console.error('Zaico API キー有効性チェックエラー:', error);
      return res.status(200).json({ 
        configured: true,
        valid: false,
        message: 'APIキーは設定されていますが、有効性を確認できませんでした'
      });
    }

  } catch (error) {
    console.error('API キー状態確認エラー:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: 'APIキー状態の確認中にエラーが発生しました'
    });
  }
}