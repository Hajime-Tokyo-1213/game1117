// ゲーム機のマスターデータ（新しい順）

export const manufacturers = [
  { value: 'nintendo', label: '任天堂' },
  { value: 'sony', label: 'SONY' },
  { value: 'microsoft', label: 'マイクロソフト' },
  { value: 'other', label: 'その他' }
];

export const gameConsoles = {
  nintendo: [
    { value: 'switch-2', label: 'Nintendo Switch 2', year: 2025, country: 'China' },
    { value: 'switch', label: 'Nintendo Switch', year: 2017, country: 'China' },
    { value: 'switch-lite', label: 'Nintendo Switch Lite', year: 2019, country: 'China' },
    { value: 'switch-oled', label: 'Nintendo Switch（有機ELモデル）', year: 2021, country: 'China' },
    { value: 'new-2ds-ll', label: 'Newニンテンドー2DS LL', year: 2017, country: 'China' },
    { value: 'wii-u', label: 'Wii U', year: 2012, country: 'China' },
    { value: 'wii', label: 'Wii', year: 2006, country: 'China' },
    { value: 'new-3ds-ll', label: 'Newニンテンドー3DS LL', year: 2014, country: 'China' },
    { value: 'new-3ds', label: 'Newニンテンドー3DS', year: 2014, country: 'China' },
    { value: '3ds-ll', label: 'ニンテンドー3DS LL', year: 2012, country: 'China' },
    { value: '3ds', label: 'ニンテンドー3DS', year: 2011, country: 'China' },
    { value: 'dsi', label: 'ニンテンドーDSi', year: 2008, country: 'China' },
    { value: 'ds-lite', label: 'ニンテンドーDS Lite', year: 2006, country: 'China' },
    { value: 'ds', label: 'ニンテンドーDS', year: 2004, country: 'China' },
    { value: 'gamecube', label: 'ゲームキューブ', year: 2001, country: 'China' },
    { value: 'gba-sp', label: 'ゲームボーイアドバンスSP', year: 2003, country: 'China' },
    { value: 'gba', label: 'ゲームボーイアドバンス', year: 2001, country: 'China' },
    { value: 'gbc', label: 'ゲームボーイカラー', year: 1998, country: 'China' },
    { value: 'n64', label: 'NINTENDO64', year: 1996, country: 'Japan' },
    { value: 'sfc', label: 'スーパーファミコン', year: 1990, country: 'Japan' },
    { value: 'gb', label: 'ゲームボーイ', year: 1989, country: 'Japan' },
    { value: 'fc', label: 'ファミリーコンピュータ', year: 1983, country: 'Japan' },
    { value: 'other-manual', label: 'その他（手入力）', year: 0, country: 'China' }
  ],
  sony: [
    { value: 'ps5', label: 'PlayStation 5', year: 2020, country: 'China' },
    { value: 'ps5-digital', label: 'PlayStation 5 デジタル・エディション', year: 2020, country: 'China' },
    { value: 'ps4-pro', label: 'PlayStation 4 Pro', year: 2016, country: 'China' },
    { value: 'ps4', label: 'PlayStation 4', year: 2013, country: 'China' },
    { value: 'ps-vita-2000', label: 'PlayStation Vita (PCH-2000シリーズ)', year: 2013, country: 'China' },
    { value: 'ps-vita-1000', label: 'PlayStation Vita (PCH-1000シリーズ)', year: 2011, country: 'China' },
    { value: 'psp-3000', label: 'PSP (PSP-3000シリーズ)', year: 2008, country: 'China' },
    { value: 'psp-2000', label: 'PSP (PSP-2000シリーズ)', year: 2007, country: 'China' },
    { value: 'psp-1000', label: 'PSP (PSP-1000シリーズ)', year: 2004, country: 'China' },
    { value: 'ps3', label: 'PlayStation 3', year: 2006, country: 'China' },
    { value: 'psp-go', label: 'PSP go', year: 2009, country: 'China' },
    { value: 'ps2', label: 'PlayStation 2', year: 2000, country: 'China' },
    { value: 'ps1', label: 'PlayStation', year: 1994, country: 'Japan' },
    { value: 'other-manual', label: 'その他（手入力）', year: 0, country: 'China' }
  ],
  microsoft: [
    { value: 'xbox-series-x', label: 'Xbox Series X', year: 2020, country: 'China' },
    { value: 'xbox-series-s', label: 'Xbox Series S', year: 2020, country: 'China' },
    { value: 'xbox-one-x', label: 'Xbox One X', year: 2017, country: 'China' },
    { value: 'xbox-one-s', label: 'Xbox One S', year: 2016, country: 'China' },
    { value: 'xbox-one', label: 'Xbox One', year: 2013, country: 'China' },
    { value: 'xbox-360', label: 'Xbox 360', year: 2005, country: 'China' },
    { value: 'xbox', label: 'Xbox', year: 2002, country: 'China' },
    { value: 'other-manual', label: 'その他（手入力）', year: 0, country: 'China' }
  ],
  other: [
    { value: 'dreamcast', label: 'ドリームキャスト', year: 1998, country: 'China' },
    { value: 'wonderswan', label: 'ワンダースワン', year: 1999, country: 'China' },
    { value: 'saturn', label: 'セガサターン', year: 1994, country: 'Japan' },
    { value: 'neogeo', label: 'ネオジオ', year: 1990, country: 'Japan' },
    { value: 'pc-engine', label: 'PCエンジン', year: 1987, country: 'Japan' },
    { value: 'other-manual', label: 'その他（手入力）', year: 0, country: 'China' }
  ]
};

export const colors = [
  'ホワイト',
  'ブラック',
  'ブルー',
  'レッド',
  'グレー',
  'ピンク',
  'イエロー',
  'グリーン',
  'パープル',
  'オレンジ',
  'ターコイズ',
  'コーラル',
  'ネオンブルー',
  'ネオンレッド',
  'その他'
];

export const consoleColorOptions = {
  'switch-lite': [
    'ハイラルエディション',
    'あつまれ どうぶつの森セット ～しずえアロハ柄～',
    'あつまれ どうぶつの森セット ～まめきち＆つぶきちアロハ柄～',
    'ディアルガ・パルキア',
    'ブルー',
    'コーラル',
    'イエロー',
    'グレー',
    'ターコイズ',
    'その他'
  ],
  'switch-oled': [
    'ホワイト',
    'ネオンブルー・ネオンレッド',
    'マリオレッド',
    'ゼルダの伝説 ティアーズ オブ ザ キングダムエディション',
    'スプラトゥーン3エディション',
    'スカーレット・バイオレットエディション',
    'その他'
  ],
  'new-3ds': [
    'ブラック',
    'ホワイト',
    'その他'
  ],
  'new-3ds-ll': [
    'メタリックブルー',
    'メタリックブラック',
    'パールホワイト',
    'メタリックレッド',
    'ライム×ブラック',
    'ピンク×ホワイト',
    'サムスエディション',
    'ソルガレオ・ルナアーラ【ブラック】',
    'ピカチュウ【イエロー】',
    'モンスターハンタークロス 狩猟生活スタートパック',
    'ファイアーエムブレムif エディション',
    'スーパーファミコン エディション',
    'どうぶつの森 ハッピーホームデザイナー パック',
    'ゼルダの伝説 ムジュラの仮面 3D パック',
    '大乱闘スマッシュブラザーズ エディション',
    'その他'
  ],
  '3ds': [
    'ピュアホワイト',
    'クリアブラック',
    'メタリックレッド',
    'ライトブルー',
    'グロスピンク',
    'コバルトブルー',
    'アイスホワイト',
    'ミスティピンク',
    'フレアレッド',
    'コスモブラック',
    'アクアブルー',
    'その他'
  ],
  '3ds-ll': [
    'ミント×ホワイト',
    'ブラック',
    'ブルー×ブラック',
    'ピンク×ホワイト',
    'シルバー×ブラック',
    'レッド×ブラック',
    'ホワイト',
    'その他'
  ],
  'ds-lite': [
    'クリムゾン／ブラック',
    'ターコイズ／ブラック',
    'グロスシルバー',
    'ノーブルピンク',
    'ジェットブラック',
    'エナメルネイビー',
    'アイスブルー',
    'クリスタルホワイト',
    'その他'
  ],
  'ds': [
    'メタリックピンク',
    'グラファイトブラック',
    'ターコイズブルー',
    'ピュアホワイト',
    'プラチナシルバー',
    'その他'
  ],
  'wii': [
    'ホワイト',
    'ブラック',
    'その他'
  ],
  'gba': [
    'ミルキーブルー',
    'ホワイト',
    'バイオレット',
    'ミルキーピンク',
    'オレンジ',
    'ブラック',
    'ゴールド',
    'シルバー',
    'その他'
  ],
  'gba-sp': [
    'オニキスブラック',
    'パールブルー',
    'パールピンク',
    'アズライトブルー',
    'パールホワイト',
    'パールグリーン',
    'パールレッド',
    'パールオレンジ',
    'ファミコンカラー',
    'トライバル',
    'その他'
  ],
  'gbc': [
    'ベリー',
    'グレープ',
    'アクアブルー',
    'ライムグリーン',
    'ダンデライオン',
    'クリアパープル',
    'クリアグリーン',
    'クリアオレンジ',
    'その他'
  ],
  'new-2ds-ll': [
    'ブラック×ターコイズ',
    'ホワイト×オレンジ',
    'ブラック×ライム',
    'ラベンダー×ホワイト',
    'モンスターボール エディション',
    'ゼルネアス・イベルタル エディション',
    'ハイリアの盾 エディション',
    'その他'
  ],
  'ps-vita-2000': [
    'ブラック（Wi-Fiモデル）',
    'ホワイト（Wi-Fiモデル）',
    'ライムグリーン/ホワイト（Wi-Fiモデル）',
    'ライトブルー/ホワイト（Wi-Fiモデル）',
    'ピンク/ブラック（Wi-Fiモデル）',
    'カーキ/ブラック（Wi-Fiモデル）',
    'ライトピンク/ホワイト（Wi-Fiモデル）',
    'グレイシャー・ホワイト（Wi-Fiモデル）',
    'アクア・ブルー（Wi-Fiモデル）',
    'ネオン・オレンジ（Wi-Fiモデル）',
    'シルバー（Wi-Fiモデル）',
    'メタリック・レッド（Wi-Fiモデル）',
    'その他'
  ],
  'ps-vita-1000': [
    'クリスタル・ブラック（Wi-Fiモデル）',
    'クリスタル・ホワイト（Wi-Fiモデル）',
    'コズミック・レッド（Wi-Fiモデル）',
    'サファイア・ブルー（Wi-Fiモデル）',
    'その他'
  ],
  'psp-3000': [
    'ピアノ・ブラック',
    'パール・ホワイト',
    'ミスティック・シルバー',
    'ブロッサム・ピンク',
    'ラディアント・レッド',
    'バイブラント・ブルー',
    'スピリティッド・グリーン',
    'ブライト・イエロー',
    'その他'
  ],
  'psp-2000': [
    'ブラック',
    'ホワイト',
    'ローズ・ピンク',
    'ラベンダー・パープル',
    'メタリック・ブルー',
    'ミント・グリーン',
    'アイス・シルバー',
    'フェリシア・ブルー',
    'ディープレッド',
    'マット・ブロンズ',
    'その他'
  ],
  'psp-1000': [
    'ブラック',
    'ホワイト',
    'ピンク',
    'ブルー',
    'シルバー',
    'ゴールド',
    'その他'
  ],
  'psp-go': [
    'ピアノ・ブラック',
    'パール・ホワイト',
    'その他'
  ]
};

export const conditions = [
  { value: 'S', label: 'S（極美品・未使用に近い）' },
  { value: 'A', label: 'A（美品・目立つ傷なし）' },
  { value: 'B', label: 'B（使用感あり・通常使用可）' },
  { value: 'C', label: 'C（傷・汚れあり・動作に問題なし）' }
];

export const accessories = [
  { value: 'complete', label: '完備（箱・説明書・充電器等すべてあり）' },
  { value: 'no-box', label: '箱なし' },
  { value: 'no-manual', label: '説明書なし' },
  { value: 'partial', label: '付属品一部なし' },
  { value: 'body-only', label: '本体のみ' }
];





