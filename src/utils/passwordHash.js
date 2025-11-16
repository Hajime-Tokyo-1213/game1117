// パスワードハッシュ化ユーティリティ
// bcryptjsを使用した安全なパスワード処理

import bcrypt from 'bcryptjs';

// ハッシュ化設定
const HASH_CONFIG = {
  // ソルトラウンド数（推奨: 10-12、セキュリティとパフォーマンスのバランス）
  saltRounds: 10,
  
  // パスワード要件
  minLength: 8,
  maxLength: 128,
  
  // パフォーマンス設定
  maxHashTime: 5000 // 最大処理時間（ミリ秒）
};

/**
 * パスワードの基本バリデーション
 * @param {string} password - 検証するパスワード
 * @returns {object} バリデーション結果
 */
export const validatePassword = (password) => {
  const errors = [];
  
  if (!password) {
    errors.push('パスワードが入力されていません');
    return { isValid: false, errors };
  }
  
  if (typeof password !== 'string') {
    errors.push('パスワードは文字列である必要があります');
    return { isValid: false, errors };
  }
  
  if (password.length < HASH_CONFIG.minLength) {
    errors.push(`パスワードは${HASH_CONFIG.minLength}文字以上である必要があります`);
  }
  
  if (password.length > HASH_CONFIG.maxLength) {
    errors.push(`パスワードは${HASH_CONFIG.maxLength}文字以下である必要があります`);
  }
  
  // 文字種チェック（推奨）
  const hasLowercase = /[a-z]/.test(password);
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  
  if (!hasLowercase) {
    errors.push('パスワードには小文字を含めることを推奨します');
  }
  
  if (!hasNumbers) {
    errors.push('パスワードには数字を含めることを推奨します');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    strength: {
      hasLowercase,
      hasUppercase,
      hasNumbers,
      hasSpecialChar,
      length: password.length
    }
  };
};

/**
 * パスワードをハッシュ化
 * @param {string} password - ハッシュ化するパスワード
 * @returns {Promise<string>} ハッシュ化されたパスワード
 */
export const hashPassword = async (password) => {
  try {
    console.log('=== パスワードハッシュ化開始 ===');
    const startTime = Date.now();
    
    // パスワードバリデーション
    const validation = validatePassword(password);
    if (!validation.isValid) {
      throw new Error(`パスワードバリデーションエラー: ${validation.errors.join(', ')}`);
    }
    
    // ハッシュ化実行
    console.log(`ソルトラウンド数: ${HASH_CONFIG.saltRounds}`);
    const hashedPassword = await bcrypt.hash(password, HASH_CONFIG.saltRounds);
    
    const endTime = Date.now();
    const processingTime = endTime - startTime;
    console.log(`パスワードハッシュ化完了: ${processingTime}ms`);
    
    // パフォーマンス警告
    if (processingTime > HASH_CONFIG.maxHashTime) {
      console.warn(`⚠️ ハッシュ化処理時間が長すぎます: ${processingTime}ms (上限: ${HASH_CONFIG.maxHashTime}ms)`);
      console.warn('ソルトラウンド数の調整を検討してください');
    }
    
    return hashedPassword;
    
  } catch (error) {
    console.error('パスワードハッシュ化エラー:', error);
    throw new Error(`パスワードハッシュ化に失敗しました: ${error.message}`);
  }
};

/**
 * パスワード検証
 * @param {string} password - 検証するプレーンテキストパスワード
 * @param {string} hashedPassword - 比較対象のハッシュ化パスワード
 * @returns {Promise<boolean>} 検証結果
 */
export const verifyPassword = async (password, hashedPassword) => {
  try {
    console.log('=== パスワード検証開始 ===');
    const startTime = Date.now();
    
    // 入力値バリデーション
    if (!password || !hashedPassword) {
      console.error('パスワード検証: 必要なパラメータが不足しています');
      return false;
    }
    
    if (typeof password !== 'string' || typeof hashedPassword !== 'string') {
      console.error('パスワード検証: パラメータは文字列である必要があります');
      return false;
    }
    
    // ハッシュフォーマット確認（bcryptハッシュは通常$2a$, $2b$, $2y$で始まる）
    if (!hashedPassword.match(/^\$2[abyxy]\$\d+\$/)) {
      console.error('パスワード検証: 無効なハッシュフォーマットです');
      return false;
    }
    
    // 検証実行
    const isValid = await bcrypt.compare(password, hashedPassword);
    
    const endTime = Date.now();
    const processingTime = endTime - startTime;
    console.log(`パスワード検証完了: ${processingTime}ms, 結果: ${isValid ? '成功' : '失敗'}`);
    
    return isValid;
    
  } catch (error) {
    console.error('パスワード検証エラー:', error);
    return false;
  }
};

/**
 * パスワード強度評価
 * @param {string} password - 評価するパスワード
 * @returns {object} 強度評価結果
 */
export const assessPasswordStrength = (password) => {
  const validation = validatePassword(password);
  
  if (!validation.isValid) {
    return {
      score: 0,
      level: 'invalid',
      message: '無効なパスワードです',
      suggestions: validation.errors
    };
  }
  
  const { strength } = validation;
  let score = 0;
  const suggestions = [];
  
  // 長さによるスコア
  if (strength.length >= 12) score += 25;
  else if (strength.length >= 10) score += 20;
  else if (strength.length >= 8) score += 15;
  else suggestions.push('8文字以上にしてください');
  
  // 文字種によるスコア
  if (strength.hasLowercase) score += 15;
  else suggestions.push('小文字を含めてください');
  
  if (strength.hasUppercase) score += 15;
  else suggestions.push('大文字を含めてください');
  
  if (strength.hasNumbers) score += 15;
  else suggestions.push('数字を含めてください');
  
  if (strength.hasSpecialChar) score += 20;
  else suggestions.push('特殊文字を含めてください');
  
  // 連続文字・辞書攻撃チェック（簡易）
  const hasSequential = /123|abc|qwe/i.test(password);
  const hasCommonPattern = /(password|123456|qwerty|admin)/i.test(password);
  
  if (hasSequential) {
    score -= 10;
    suggestions.push('連続した文字は避けてください');
  }
  
  if (hasCommonPattern) {
    score -= 20;
    suggestions.push('一般的なパスワードは避けてください');
  }
  
  // レベル判定
  let level, message;
  if (score >= 80) {
    level = 'very_strong';
    message = '非常に強固なパスワードです';
  } else if (score >= 60) {
    level = 'strong';
    message = '強固なパスワードです';
  } else if (score >= 40) {
    level = 'medium';
    message = '中程度の強度のパスワードです';
  } else if (score >= 20) {
    level = 'weak';
    message = '弱いパスワードです';
  } else {
    level = 'very_weak';
    message = '非常に弱いパスワードです';
  }
  
  return {
    score: Math.max(0, Math.min(100, score)),
    level,
    message,
    suggestions: suggestions.length > 0 ? suggestions : ['パスワード強度は十分です'],
    details: strength
  };
};

/**
 * ソルトラウンド数の動的調整（管理者用）
 * @param {number} targetTime - 目標処理時間（ミリ秒）
 * @returns {Promise<number>} 推奨ソルトラウンド数
 */
export const calibrateSaltRounds = async (targetTime = 100) => {
  console.log('=== ソルトラウンド数自動調整開始 ===');
  console.log(`目標処理時間: ${targetTime}ms`);
  
  const testPassword = 'test_password_for_calibration';
  let optimalRounds = 10;
  
  for (let rounds = 8; rounds <= 15; rounds++) {
    const startTime = Date.now();
    
    try {
      await bcrypt.hash(testPassword, rounds);
      const processingTime = Date.now() - startTime;
      
      console.log(`ラウンド${rounds}: ${processingTime}ms`);
      
      if (processingTime <= targetTime) {
        optimalRounds = rounds;
      } else {
        break;
      }
    } catch (error) {
      console.error(`ラウンド${rounds}でエラー:`, error);
      break;
    }
  }
  
  console.log(`推奨ソルトラウンド数: ${optimalRounds}`);
  return optimalRounds;
};

/**
 * ハッシュ化設定の取得
 * @returns {object} 現在の設定
 */
export const getHashConfig = () => {
  return { ...HASH_CONFIG };
};

/**
 * 基本的な動作テスト
 * @returns {Promise<object>} テスト結果
 */
export const runBasicTests = async () => {
  console.log('=== パスワードハッシュ化基本テスト開始 ===');
  
  const tests = [];
  const testPassword = 'TestPassword123!';
  
  try {
    // ハッシュ化テスト
    const startHashTime = Date.now();
    const hashedPassword = await hashPassword(testPassword);
    const hashTime = Date.now() - startHashTime;
    
    tests.push({
      name: 'ハッシュ化',
      success: !!hashedPassword,
      duration: hashTime,
      result: hashedPassword
    });
    
    // 正しいパスワード検証テスト
    const startVerifyTime = Date.now();
    const isValidCorrect = await verifyPassword(testPassword, hashedPassword);
    const verifyTime = Date.now() - startVerifyTime;
    
    tests.push({
      name: '正しいパスワード検証',
      success: isValidCorrect === true,
      duration: verifyTime,
      result: isValidCorrect
    });
    
    // 間違ったパスワード検証テスト
    const isValidIncorrect = await verifyPassword('WrongPassword', hashedPassword);
    
    tests.push({
      name: '間違ったパスワード検証',
      success: isValidIncorrect === false,
      duration: 0,
      result: isValidIncorrect
    });
    
    // 強度評価テスト
    const strengthAssessment = assessPasswordStrength(testPassword);
    
    tests.push({
      name: '強度評価',
      success: strengthAssessment.score > 0,
      duration: 0,
      result: strengthAssessment
    });
    
    const allSuccess = tests.every(test => test.success);
    
    console.log('=== テスト結果 ===');
    tests.forEach(test => {
      console.log(`${test.name}: ${test.success ? '✅' : '❌'} (${test.duration}ms)`);
    });
    
    return {
      allPassed: allSuccess,
      tests,
      summary: {
        total: tests.length,
        passed: tests.filter(t => t.success).length,
        failed: tests.filter(t => !t.success).length
      }
    };
    
  } catch (error) {
    console.error('テスト実行エラー:', error);
    return {
      allPassed: false,
      error: error.message,
      tests
    };
  }
};

export default {
  hashPassword,
  verifyPassword,
  validatePassword,
  assessPasswordStrength,
  calibrateSaltRounds,
  getHashConfig,
  runBasicTests
};