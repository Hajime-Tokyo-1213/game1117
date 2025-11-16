import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * 環境固有の暗号化キーを生成
 * @param {string} seed - シード文字列（JWT_SECRET等）
 * @returns {Buffer} 暗号化キー
 */
export const generateEncryptionKey = (seed) => {
  if (!seed) {
    throw new Error('Seed is required for key generation');
  }
  return crypto.scryptSync(seed, 'salt', KEY_LENGTH);
};

/**
 * APIキーを暗号化
 * @param {string} apiKey - 暗号化するAPIキー
 * @param {string} secretSeed - 暗号化キー生成用のシード
 * @returns {string} 暗号化されたAPIキー（Base64エンコード）
 */
export const encryptApiKey = (apiKey, secretSeed) => {
  try {
    if (!apiKey || !secretSeed) {
      throw new Error('API key and secret seed are required');
    }

    const key = generateEncryptionKey(secretSeed);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(apiKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // IV + 暗号化データを結合してBase64エンコード
    const result = Buffer.concat([iv, Buffer.from(encrypted, 'hex')]).toString('base64');
    
    return result;
  } catch (error) {
    throw new Error(`Encryption failed: ${error.message}`);
  }
};

/**
 * APIキーを復号化
 * @param {string} encryptedApiKey - 暗号化されたAPIキー（Base64エンコード）
 * @param {string} secretSeed - 暗号化キー生成用のシード
 * @returns {string} 復号化されたAPIキー
 */
export const decryptApiKey = (encryptedApiKey, secretSeed) => {
  try {
    if (!encryptedApiKey || !secretSeed) {
      throw new Error('Encrypted API key and secret seed are required');
    }

    const key = generateEncryptionKey(secretSeed);
    const data = Buffer.from(encryptedApiKey, 'base64');
    
    if (data.length < IV_LENGTH + 1) {
      throw new Error('Invalid encrypted data format');
    }
    
    // IV + 暗号化データを分離
    const iv = data.subarray(0, IV_LENGTH);
    const encrypted = data.subarray(IV_LENGTH);
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    
    let decrypted = decipher.update(encrypted, null, 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    throw new Error(`Decryption failed: ${error.message}`);
  }
};

/**
 * 暗号化されたAPIキーかどうかを判定
 * @param {string} apiKey - 判定するAPIキー
 * @returns {boolean} 暗号化されている場合はtrue
 */
export const isEncryptedApiKey = (apiKey) => {
  if (!apiKey || typeof apiKey !== 'string') {
    return false;
  }
  
  try {
    const data = Buffer.from(apiKey, 'base64');
    return data.length >= IV_LENGTH + 1;
  } catch {
    return false;
  }
};

/**
 * APIキーを安全に取得（暗号化されている場合は復号化）
 * @param {string} apiKey - APIキー（平文または暗号化済み）
 * @param {string} secretSeed - 暗号化キー生成用のシード
 * @returns {string} 平文のAPIキー
 */
export const getDecryptedApiKey = (apiKey, secretSeed) => {
  if (!apiKey) {
    return '';
  }
  
  if (isEncryptedApiKey(apiKey)) {
    return decryptApiKey(apiKey, secretSeed);
  }
  
  return apiKey;
};