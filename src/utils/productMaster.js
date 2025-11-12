// 商品マスタ管理ユーティリティ

import { gameConsoles as defaultConsoles, manufacturers, consoleColorOptions, colors } from '../data/gameConsoles';

const appendYearToLabel = (console) => {
  if (!console?.label) return console;

  const hasYear = typeof console.year === 'number' && console.year > 0;
  const baseLabel = console.label.replace(/（\d{4}）$/u, '');

  if (!hasYear) {
    return { ...console, label: baseLabel };
  }

  return {
    ...console,
    label: `${baseLabel}（${console.year}）`
  };
};

/**
 * 全ての機種リストを取得（デフォルト + カスタム）
 */
export const getAllConsoles = () => {
  const customConsoles = JSON.parse(localStorage.getItem('customGameConsoles') || '{}');
  
  const merged = {};
  manufacturers.forEach(mfr => {
    const mfrValue = mfr.value;
    merged[mfrValue] = [
      ...(defaultConsoles[mfrValue] || []),
      ...(customConsoles[mfrValue] || [])
    ]
      .sort((a, b) => (b.year || 0) - (a.year || 0)) // 新しい順
      .map(appendYearToLabel);
  });
  
  return merged;
};

/**
 * カスタムカラー設定を取得
 */
export const getCustomConsoleColors = () => {
  return JSON.parse(localStorage.getItem('customConsoleColors') || '{}');
};

/**
 * カスタムカラー設定を保存
 */
export const saveCustomConsoleColors = (customColors) => {
  localStorage.setItem('customConsoleColors', JSON.stringify(customColors));
};

/**
 * 指定機種のカラー一覧（公式 + カスタム）を取得
 * 公式カラーが存在しない場合は汎用カラーを返す
 */
export const getConsoleColorList = (consoleValue) => {
  if (!consoleValue) return colors;

  const customColors = getCustomConsoleColors();
  const defaultList = consoleColorOptions[consoleValue] || [];
  const customList = (customColors[consoleValue] || []).map(color => color.name).filter(Boolean);

  const combined = [...defaultList, ...customList].filter(Boolean);

  if (combined.length === 0) {
    return colors;
  }

  return Array.from(new Set(combined));
};

/**
 * 指定機種のカラー詳細情報（公式 + カスタム）を取得
 */
export const getConsoleColorDetails = (consoleValue) => {
  const customColors = getCustomConsoleColors();
  return {
    official: consoleColorOptions[consoleValue] || [],
    custom: customColors[consoleValue] || []
  };
};

/**
 * カスタム商品のみを取得
 */
export const getCustomConsoles = () => {
  return JSON.parse(localStorage.getItem('customGameConsoles') || '{}');
};

/**
 * 次の機種コードを提案
 * @param {string} manufacturer - メーカーコード
 * @returns {string} - 次の番号（例: 18）
 */
export const suggestNextConsoleCode = (manufacturer) => {
  const allConsoles = getAllConsoles();
  const consoles = allConsoles[manufacturer] || [];
  
  if (consoles.length === 0) return '01';
  
  // 既存のコードから数字部分を抽出
  const existingCodes = consoles
    .map(c => c.value)
    .map(v => {
      // 最後の数字部分を抽出（例：switch-lite → lite、ps5-digital → digital）
      const match = v.match(/\d+$/);
      return match ? parseInt(match[0]) : 0;
    });
  
  // 最大値を見つけて+1（ただし、カテゴリを考慮）
  // シンプルに次の番号を提案
  const maxCode = Math.max(...existingCodes, 0);
  
  // 提案：次のカテゴリの開始番号を見つける
  // 00番台が埋まっていたら10番台、それも埋まっていたら20番台...
  const categories = [
    { start: 1, end: 9, label: '00番台' },
    { start: 10, end: 19, label: '10番台' },
    { start: 20, end: 29, label: '20番台' },
    { start: 30, end: 39, label: '30番台' },
    { start: 40, end: 49, label: '40番台' },
    { start: 50, end: 59, label: '50番台' },
    { start: 60, end: 69, label: '60番台' },
    { start: 70, end: 79, label: '70番台' },
    { start: 80, end: 89, label: '80番台' },
    { start: 90, end: 99, label: '90番台' }
  ];
  
  // 各カテゴリで空いている番号を探す
  for (const category of categories) {
    for (let num = category.start; num <= category.end; num++) {
      const codeStr = String(num).padStart(2, '0');
      const exists = consoles.some(c => {
        // value内に数字が含まれているか簡易チェック
        const match = c.value.match(/(\d+)/g);
        if (!match) return false;
        return match.some(m => m === codeStr || parseInt(m) === num);
      });
      
      if (!exists) {
        return codeStr;
      }
    }
  }
  
  return '99'; // 全て埋まっている場合
};

/**
 * 新しい機種を追加
 */
export const addNewConsole = (manufacturer, consoleData) => {
  const customConsoles = getCustomConsoles();
  
  if (!customConsoles[manufacturer]) {
    customConsoles[manufacturer] = [];
  }
  
  // 重複チェック
  const allConsoles = getAllConsoles();
  const exists = allConsoles[manufacturer].some(c => 
    c.value === consoleData.value || c.label === consoleData.label
  );
  
  if (exists) {
    return { success: false, error: 'この機種は既に登録されています' };
  }
  
  // 追加
  customConsoles[manufacturer].push({
    ...consoleData,
    custom: true, // カスタム追加フラグ
    addedAt: new Date().toISOString()
  });
  
  localStorage.setItem('customGameConsoles', JSON.stringify(customConsoles));
  
  return { success: true };
};

/**
 * 機種を編集
 */
export const updateConsole = (manufacturer, oldValue, newConsoleData) => {
  const customConsoles = getCustomConsoles();
  
  if (!customConsoles[manufacturer]) {
    return { success: false, error: '機種が見つかりません' };
  }
  
  // カスタム追加された機種のみ編集可能
  const index = customConsoles[manufacturer].findIndex(c => c.value === oldValue);
  
  if (index === -1) {
    return { success: false, error: 'この機種は編集できません（デフォルト機種）' };
  }
  
  // valueを変更する場合は重複チェック
  if (oldValue !== newConsoleData.value) {
    const allConsoles = getAllConsoles();
    const exists = allConsoles[manufacturer].some(c => 
      c.value === newConsoleData.value && c.value !== oldValue
    );
    
    if (exists) {
      return { success: false, error: 'この機種コードは既に使用されています' };
    }
  }
  
  // 更新
  customConsoles[manufacturer][index] = {
    ...newConsoleData,
    custom: true,
    addedAt: customConsoles[manufacturer][index].addedAt,
    updatedAt: new Date().toISOString()
  };
  
  localStorage.setItem('customGameConsoles', JSON.stringify(customConsoles));
  
  return { success: true };
};

/**
 * 機種を削除
 */
export const deleteConsole = (manufacturer, value) => {
  const customConsoles = getCustomConsoles();
  
  if (!customConsoles[manufacturer]) {
    return { success: false, error: '機種が見つかりません' };
  }
  
  // カスタム追加された機種のみ削除可能
  const index = customConsoles[manufacturer].findIndex(c => c.value === value);
  
  if (index === -1) {
    return { success: false, error: 'この機種は削除できません（デフォルト機種）' };
  }
  
  // 削除前に在庫で使用されていないかチェック
  const inventory = JSON.parse(localStorage.getItem('inventory') || '[]');
  const inUse = inventory.some(item => item.console === value);
  
  if (inUse) {
    return { 
      success: false, 
      error: 'この機種は在庫で使用されているため削除できません' 
    };
  }
  
  // 削除
  customConsoles[manufacturer].splice(index, 1);
  
  // 空になった場合はプロパティごと削除
  if (customConsoles[manufacturer].length === 0) {
    delete customConsoles[manufacturer];
  }
  
  localStorage.setItem('customGameConsoles', JSON.stringify(customConsoles));
  
  return { success: true };
};

/**
 * 機種がカスタム追加されたものかチェック
 */
export const isCustomConsole = (manufacturer, value) => {
  const customConsoles = getCustomConsoles();
  if (!customConsoles[manufacturer]) return false;
  return customConsoles[manufacturer].some(c => c.value === value);
};

/**
 * valueからラベルを生成（自動）
 */
export const generateValueFromLabel = (label) => {
  // 日本語・スペースを除去してケバブケースに
  return label
    .toLowerCase()
    .replace(/[\s　]+/g, '-')
    .replace(/[^\w-]/g, '')
    .replace(/--+/g, '-')
    .trim();
};

