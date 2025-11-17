/**
 * Comprehensive Validation and Sanitization Utilities
 * For buyback system and general API validation
 */

/**
 * Validate and sanitize input data
 * @param {*} value - Value to validate
 * @param {string} type - Validation type
 * @param {Object} options - Additional validation options
 * @returns {Object} Validation result with isValid, value, and error
 */
export function validateAndSanitize(value, type, options = {}) {
  const result = {
    isValid: false,
    value: null,
    error: null
  };

  try {
    // Handle null/undefined values
    if (value === null || value === undefined) {
      if (options.required || type === 'required') {
        result.error = 'この項目は必須です';
        return result;
      }
      result.isValid = true;
      result.value = null;
      return result;
    }

    // Convert to string for processing
    const strValue = String(value).trim();

    // Handle empty strings
    if (strValue === '') {
      if (options.required || type === 'required') {
        result.error = 'この項目は必須です';
        return result;
      }
      result.isValid = true;
      result.value = null;
      return result;
    }

    switch (type) {
      case 'required':
        result.isValid = true;
        result.value = strValue;
        break;

      case 'email':
        result.value = strValue.toLowerCase();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(result.value)) {
          result.error = '有効なメールアドレスを入力してください';
          return result;
        }
        if (result.value.length > 255) {
          result.error = 'メールアドレスが長すぎます（255文字以内）';
          return result;
        }
        result.isValid = true;
        break;

      case 'phone':
        // Remove all non-digit characters except + and -
        result.value = strValue.replace(/[^\d+\-]/g, '');
        const phoneRegex = /^[\+]?[0-9\-]{10,15}$/;
        if (!phoneRegex.test(result.value)) {
          result.error = '有効な電話番号を入力してください（10-15桁）';
          return result;
        }
        result.isValid = true;
        break;

      case 'postal_code':
        // Japanese postal code format (XXX-XXXX or XXXXXXX)
        result.value = strValue.replace(/[^\d\-]/g, '');
        const postalRegex = /^(\d{3}-\d{4}|\d{7})$/;
        if (!postalRegex.test(result.value)) {
          result.error = '有効な郵便番号を入力してください（例：123-4567）';
          return result;
        }
        // Standardize to XXX-XXXX format
        if (result.value.length === 7) {
          result.value = result.value.slice(0, 3) + '-' + result.value.slice(3);
        }
        result.isValid = true;
        break;

      case 'name':
        result.value = strValue;
        if (result.value.length < 1) {
          result.error = '名前を入力してください';
          return result;
        }
        if (result.value.length > 255) {
          result.error = '名前が長すぎます（255文字以内）';
          return result;
        }
        // Remove dangerous characters but keep international names
        result.value = result.value.replace(/[<>'"&]/g, '');
        result.isValid = true;
        break;

      case 'text':
        result.value = strValue;
        const maxLength = options.maxLength || 1000;
        if (result.value.length > maxLength) {
          result.error = `テキストが長すぎます（${maxLength}文字以内）`;
          return result;
        }
        // Basic XSS protection
        result.value = result.value.replace(/[<>]/g, '');
        result.isValid = true;
        break;

      case 'number':
        const num = parseFloat(strValue);
        if (isNaN(num)) {
          result.error = '有効な数値を入力してください';
          return result;
        }
        if (options.min !== undefined && num < options.min) {
          result.error = `値は${options.min}以上である必要があります`;
          return result;
        }
        if (options.max !== undefined && num > options.max) {
          result.error = `値は${options.max}以下である必要があります`;
          return result;
        }
        result.value = num;
        result.isValid = true;
        break;

      case 'integer':
        const int = parseInt(strValue, 10);
        if (isNaN(int) || !Number.isInteger(int)) {
          result.error = '有効な整数を入力してください';
          return result;
        }
        if (options.min !== undefined && int < options.min) {
          result.error = `値は${options.min}以上である必要があります`;
          return result;
        }
        if (options.max !== undefined && int > options.max) {
          result.error = `値は${options.max}以下である必要があります`;
          return result;
        }
        result.value = int;
        result.isValid = true;
        break;

      case 'url':
        result.value = strValue;
        try {
          new URL(result.value);
          result.isValid = true;
        } catch {
          result.error = '有効なURLを入力してください';
          return result;
        }
        break;

      case 'date':
        const date = new Date(strValue);
        if (isNaN(date.getTime())) {
          result.error = '有効な日付を入力してください';
          return result;
        }
        result.value = date.toISOString().split('T')[0]; // YYYY-MM-DD format
        result.isValid = true;
        break;

      case 'time':
        const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(strValue)) {
          result.error = '有効な時刻を入力してください（HH:MM形式）';
          return result;
        }
        result.value = strValue;
        result.isValid = true;
        break;

      case 'choice':
        if (!options.choices || !Array.isArray(options.choices)) {
          result.error = 'バリデーション設定エラー';
          return result;
        }
        if (!options.choices.includes(strValue)) {
          result.error = `有効な選択肢ではありません: ${options.choices.join(', ')}`;
          return result;
        }
        result.value = strValue;
        result.isValid = true;
        break;

      case 'array':
        if (!Array.isArray(value)) {
          result.error = '配列である必要があります';
          return result;
        }
        if (options.minLength && value.length < options.minLength) {
          result.error = `最低${options.minLength}個の項目が必要です`;
          return result;
        }
        if (options.maxLength && value.length > options.maxLength) {
          result.error = `最大${options.maxLength}個までの項目のみ許可されます`;
          return result;
        }
        result.value = value;
        result.isValid = true;
        break;

      case 'json':
        try {
          result.value = typeof value === 'string' ? JSON.parse(value) : value;
          result.isValid = true;
        } catch {
          result.error = '有効なJSONデータではありません';
          return result;
        }
        break;

      default:
        result.error = `未知のバリデーションタイプ: ${type}`;
        return result;
    }

    return result;
  } catch (error) {
    result.error = 'バリデーション処理でエラーが発生しました';
    console.error('Validation error:', error);
    return result;
  }
}

/**
 * Validate buyback request items
 * @param {Array} items - Array of item objects
 * @returns {Object} Validation result
 */
export function validateBuybackItems(items) {
  const result = {
    isValid: false,
    items: [],
    errors: []
  };

  if (!Array.isArray(items)) {
    result.errors.push('商品情報は配列である必要があります');
    return result;
  }

  if (items.length === 0) {
    result.errors.push('少なくとも1つの商品が必要です');
    return result;
  }

  if (items.length > 50) {
    result.errors.push('一度に申請できる商品は50個までです');
    return result;
  }

  const validCategories = [
    'console', 'handheld', 'software', 'accessory', 'retro',
    'pc_game', 'mobile_game', 'toy', 'collectible', 'other'
  ];

  const validConditions = ['S', 'A', 'B', 'C', 'D', 'JUNK'];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const itemErrors = [];

    // Validate item name
    const nameValidation = validateAndSanitize(item.name, 'required');
    if (!nameValidation.isValid) {
      itemErrors.push(`商品${i + 1}: 商品名 - ${nameValidation.error}`);
    }

    // Validate category
    const categoryValidation = validateAndSanitize(item.category, 'choice', {
      choices: validCategories
    });
    if (!categoryValidation.isValid) {
      itemErrors.push(`商品${i + 1}: カテゴリ - ${categoryValidation.error}`);
    }

    // Validate condition (optional)
    if (item.condition) {
      const conditionValidation = validateAndSanitize(item.condition, 'choice', {
        choices: validConditions
      });
      if (!conditionValidation.isValid) {
        itemErrors.push(`商品${i + 1}: コンディション - ${conditionValidation.error}`);
      }
    }

    // Validate estimated value (optional)
    if (item.estimated_value !== undefined) {
      const valueValidation = validateAndSanitize(item.estimated_value, 'number', {
        min: 0,
        max: 9999999
      });
      if (!valueValidation.isValid) {
        itemErrors.push(`商品${i + 1}: 希望価格 - ${valueValidation.error}`);
      }
    }

    // Validate description (optional)
    if (item.description) {
      const descValidation = validateAndSanitize(item.description, 'text', {
        maxLength: 500
      });
      if (!descValidation.isValid) {
        itemErrors.push(`商品${i + 1}: 説明 - ${descValidation.error}`);
      }
    }

    if (itemErrors.length > 0) {
      result.errors.push(...itemErrors);
    } else {
      result.items.push({
        name: nameValidation.value,
        category: categoryValidation.value,
        condition: item.condition || 'B',
        estimated_value: item.estimated_value || 0,
        description: item.description || '',
        manufacturer: item.manufacturer || '',
        model: item.model || '',
        year: item.year || null
      });
    }
  }

  result.isValid = result.errors.length === 0;
  return result;
}

/**
 * Sanitize HTML content (basic XSS protection)
 * @param {string} html - HTML content to sanitize
 * @returns {string} Sanitized content
 */
export function sanitizeHtml(html) {
  if (typeof html !== 'string') return '';
  
  return html
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Validate file upload
 * @param {Object} file - File object
 * @param {Object} options - Validation options
 * @returns {Object} Validation result
 */
export function validateFileUpload(file, options = {}) {
  const result = {
    isValid: false,
    error: null
  };

  if (!file) {
    result.error = 'ファイルが選択されていません';
    return result;
  }

  // Check file size (default 5MB)
  const maxSize = options.maxSize || 5 * 1024 * 1024;
  if (file.size > maxSize) {
    result.error = `ファイルサイズが大きすぎます（最大${Math.round(maxSize / 1024 / 1024)}MB）`;
    return result;
  }

  // Check file type
  const allowedTypes = options.allowedTypes || ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    result.error = `サポートされていないファイル形式です（${allowedTypes.join(', ')}）`;
    return result;
  }

  // Check filename
  if (file.name.length > 255) {
    result.error = 'ファイル名が長すぎます（255文字以内）';
    return result;
  }

  result.isValid = true;
  return result;
}

/**
 * Validate request number format
 * @param {string} requestNumber - Request number to validate
 * @returns {Object} Validation result
 */
export function validateRequestNumber(requestNumber) {
  const result = {
    isValid: false,
    error: null
  };

  if (!requestNumber || typeof requestNumber !== 'string') {
    result.error = '申請番号が必要です';
    return result;
  }

  // BR{YYYYMMDD}-{NNNN} format
  const requestNumberRegex = /^BR\d{8}-\d{4}$/;
  if (!requestNumberRegex.test(requestNumber)) {
    result.error = '無効な申請番号形式です';
    return result;
  }

  result.isValid = true;
  return result;
}

export default {
  validateAndSanitize,
  validateBuybackItems,
  sanitizeHtml,
  validateFileUpload,
  validateRequestNumber
};