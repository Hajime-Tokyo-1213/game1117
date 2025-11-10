// バイヤー管理ユーティリティ
// 既存のユーザー登録システム（overseas_customer）からも取得可能

/**
 * 全バイヤーのリストを取得（既存ユーザー + 販売専用バイヤー）
 * @returns {array} - バイヤーの配列
 */
export const getAllBuyers = () => {
  const buyers = [];
  
  // 1. 既存のユーザー登録システムから取得（overseas_customer）
  const users = JSON.parse(localStorage.getItem('registeredUsers') || '[]');
  const existingBuyers = users.filter(u => u.role === 'overseas_customer');
  existingBuyers.forEach(user => {
    buyers.push({
      id: user.email, // メールをIDとして使用
      name: user.name,
      companyName: user.companyName || '',
      email: user.email,
      phone: user.phone || '',
      country: user.country || '',
      postalCode: user.postalCode || '',
      address: user.address || '',
      source: 'registered_user' // 出所を記録
    });
  });
  
  // 2. 販売専用バイヤーリストから取得
  const salesBuyers = JSON.parse(localStorage.getItem('salesBuyers') || '[]');
  salesBuyers.forEach(buyer => {
    // 既にユーザー登録されているバイヤーと重複しないようにチェック
    const exists = buyers.find(b => b.email === buyer.email);
    if (!exists) {
      buyers.push({
        ...buyer,
        source: 'sales_only' // 販売専用
      });
    }
  });
  
  return buyers;
};

/**
 * バイヤーを追加（販売専用）
 * @param {object} buyerData - バイヤー情報
 * @returns {object} - { success: boolean, buyer: object }
 */
export const addBuyer = (buyerData) => {
  try {
    // メールアドレスの重複チェック
    const existingBuyers = getAllBuyers();
    if (existingBuyers.find(b => b.email === buyerData.email)) {
      return { success: false, error: 'このメールアドレスは既に登録されています' };
    }
    
    const salesBuyers = JSON.parse(localStorage.getItem('salesBuyers') || '[]');
    const newBuyer = {
      id: `BUYER-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: buyerData.name,
      companyName: buyerData.companyName || '',
      email: buyerData.email,
      phone: buyerData.phone || '',
      country: buyerData.country || '',
      postalCode: buyerData.postalCode || '',
      address: buyerData.address || '',
      notes: buyerData.notes || '',
      createdAt: new Date().toISOString()
    };
    
    salesBuyers.push(newBuyer);
    localStorage.setItem('salesBuyers', JSON.stringify(salesBuyers));
    
    return { success: true, buyer: newBuyer };
  } catch (error) {
    console.error('バイヤー追加エラー:', error);
    return { success: false, error: error.message };
  }
};

/**
 * バイヤーを更新
 * @param {string} buyerId - バイヤーID
 * @param {object} buyerData - 更新するバイヤー情報
 * @returns {object} - { success: boolean }
 */
export const updateBuyer = (buyerId, buyerData) => {
  try {
    // 販売専用バイヤーのみ更新可能（登録ユーザーは更新しない）
    const salesBuyers = JSON.parse(localStorage.getItem('salesBuyers') || '[]');
    const buyerIndex = salesBuyers.findIndex(b => b.id === buyerId);
    
    if (buyerIndex === -1) {
      return { success: false, error: 'バイヤーが見つかりません' };
    }
    
    salesBuyers[buyerIndex] = {
      ...salesBuyers[buyerIndex],
      ...buyerData,
      updatedAt: new Date().toISOString()
    };
    
    localStorage.setItem('salesBuyers', JSON.stringify(salesBuyers));
    return { success: true };
  } catch (error) {
    console.error('バイヤー更新エラー:', error);
    return { success: false, error: error.message };
  }
};

/**
 * バイヤーを削除（販売専用のみ）
 * @param {string} buyerId - バイヤーID
 * @returns {object} - { success: boolean }
 */
export const deleteBuyer = (buyerId) => {
  try {
    const salesBuyers = JSON.parse(localStorage.getItem('salesBuyers') || '[]');
    const filtered = salesBuyers.filter(b => b.id !== buyerId);
    localStorage.setItem('salesBuyers', JSON.stringify(filtered));
    return { success: true };
  } catch (error) {
    console.error('バイヤー削除エラー:', error);
    return { success: false, error: error.message };
  }
};

/**
 * メールアドレスからバイヤーを検索
 * @param {string} email - メールアドレス
 * @returns {object|null} - バイヤー情報
 */
export const getBuyerByEmail = (email) => {
  const buyers = getAllBuyers();
  return buyers.find(b => b.email === email) || null;
};


