import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { manufacturers, conditions, accessories } from '../data/gameConsoles';
import { getAllConsoles, getConsoleColorList } from '../utils/productMaster';
import { generateManagementNumber } from '../utils/productCodeGenerator';
import './BuybackApplication.css';

const BuybackApplication = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [currentItem, setCurrentItem] = useState({
    productType: 'console', // 'console' or 'software'
    manufacturer: '',
    console: '',
    consoleCustomName: '', // その他（手入力）用のカスタム機種名
    color: '', // カラー（任意）
    softwareName: '',
    condition: '',
    conditionNotes: '', // C評価時の詳細備考
    accessories: '',
    quantity: 1,
    managementNumbers: [] // 管理番号（数量分の配列）
  });
  const [showConfirm, setShowConfirm] = useState(false);
  const [availableConsoles, setAvailableConsoles] = useState([]);
  const [allGameConsoles, setAllGameConsoles] = useState({});

  // コンポーネント初期化時に全機種を読み込み
  useEffect(() => {
    setAllGameConsoles(getAllConsoles());
  }, []);
  
  // 発送方法
  const [shippingInfo, setShippingInfo] = useState({
    shippingMethod: 'customer' // 'customer'(お客様負担) or 'cashOnDelivery'(着払い)
  });

  // メーカー選択時に機種リストを更新
  const handleManufacturerChange = (manufacturerValue) => {
    setCurrentItem({
      ...currentItem,
      manufacturer: manufacturerValue,
      console: '', // 機種選択をリセット
      consoleCustomName: '', // カスタム機種名もリセット
      managementNumbers: [] // 管理番号もリセット
    });
    
    if (manufacturerValue && allGameConsoles[manufacturerValue]) {
      setAvailableConsoles(allGameConsoles[manufacturerValue]);
    } else {
      setAvailableConsoles([]);
    }
  };

  // 機種選択時と数量変更時に管理番号を自動生成
  const handleConsoleChange = (consoleValue) => {
    setCurrentItem({
      ...currentItem,
      console: consoleValue,
      consoleCustomName: '' // 機種変更時にカスタム名をリセット
    });

    // 機種が選択されたら数量分の管理番号を自動生成
    if (currentItem.manufacturer && consoleValue && user) {
      generateManagementNumbersForCurrentItem(consoleValue, currentItem.quantity);
    }
  };

  // 数量変更時も管理番号を再生成
  const handleQuantityChange = (newQuantity) => {
    setCurrentItem({
      ...currentItem,
      quantity: newQuantity
    });

    // 機種が選択済みなら管理番号を再生成
    if (currentItem.manufacturer && currentItem.console && user) {
      generateManagementNumbersForCurrentItem(currentItem.console, newQuantity);
    }
  };

  // 数量分の管理番号を生成するヘルパー関数
  const generateManagementNumbersForCurrentItem = (consoleValue, quantity) => {
    const managementNumbers = [];
    // 同じ商品（メーカー + 機種）のアイテムの総数量を計算
    // 商品が違えば01から始まる
    const sameProductCount = items
      .filter(item => item.manufacturer === currentItem.manufacturer && item.console === consoleValue)
      .reduce((total, item) => total + parseInt(item.quantity), 0);
    
    for (let i = 0; i < quantity; i++) {
      const sequenceNumber = sameProductCount + i + 1;
      const managementNumber = generateManagementNumber(
        user.name,
        currentItem.manufacturer,
        consoleValue,
        sequenceNumber,
        currentItem.productType
      );
      managementNumbers.push(managementNumber);
    }

    setCurrentItem(prev => ({
      ...prev,
      console: consoleValue,
      managementNumbers: managementNumbers
    }));
  };

  const handleAddItem = () => {
    // バリデーション
    if (!currentItem.manufacturer || !currentItem.console || !currentItem.condition) {
      alert('必須項目を入力してください');
      return;
    }

    // その他（手入力）の場合は機種名の入力必須
    if (currentItem.console === 'other-manual' && (!currentItem.consoleCustomName || currentItem.consoleCustomName.trim() === '')) {
      alert('機種名を入力してください');
      return;
    }

    // C評価の場合は備考必須
    if (currentItem.condition === 'C' && (!currentItem.conditionNotes || currentItem.conditionNotes.trim() === '')) {
      alert('C評価の場合は、状態の詳細を備考欄に記入してください');
      return;
    }

    // ゲーム本体の場合は付属品も必須
    if (currentItem.productType === 'console' && !currentItem.accessories) {
      alert('付属品を選択してください');
      return;
    }

    // ソフトの場合はソフト名も必須
    if (currentItem.productType === 'software' && !currentItem.softwareName) {
      alert('ソフト名を入力してください');
      return;
    }

    const manufacturerLabel = manufacturers.find(m => m.value === currentItem.manufacturer)?.label;
    // その他（手入力）の場合は、カスタム入力値を使用
    const consoleLabel = currentItem.console === 'other-manual' 
      ? currentItem.consoleCustomName 
      : availableConsoles.find(c => c.value === currentItem.console)?.label;
    const conditionLabel = conditions.find(c => c.value === currentItem.condition)?.label;
    const colorLabel = currentItem.color || ''; // カラーは任意なのでラベルも任意
    const accessoriesLabel = currentItem.accessories ? accessories.find(a => a.value === currentItem.accessories)?.label : '';

    const newItem = {
      id: Date.now(),
      ...currentItem,
      productTypeLabel: currentItem.productType === 'console' ? 'ゲーム本体' : 'ゲームソフト',
      manufacturerLabel,
      consoleLabel,
      colorLabel,
      conditionLabel,
      accessoriesLabel
    };

    setItems([...items, newItem]);
    setCurrentItem({ 
      productType: 'console',
      manufacturer: '',
      console: '',
      consoleCustomName: '',
      color: '',
      softwareName: '',
      condition: '',
      conditionNotes: '',
      accessories: '',
      quantity: 1,
      managementNumbers: []
    });
    setAvailableConsoles([]);
  };

  const handleRemoveItem = (id) => {
    setItems(items.filter(item => item.id !== id));
  };

  const handleSubmit = () => {
    const status = 'applied'; // 申込済み

    const applicationData = {
      applicationNumber: `BUY-${Date.now()}`,
      type: 'detailed',
      status: status,
      customer: {
        name: user.name,
        birthDate: user.birthDate,
        occupation: user.occupation,
        email: user.email,
        phone: user.phone,
        address: user.address,
        postalCode: user.postalCode
      },
      shippingInfo: shippingInfo,
      items: items,
      date: new Date().toISOString()
    };

    // allApplicationsに追加
    const allApplications = JSON.parse(localStorage.getItem('allApplications') || '[]');
    allApplications.push(applicationData);
    localStorage.setItem('allApplications', JSON.stringify(allApplications));

    console.log('申込データ:', applicationData);
    
    alert(`買取申込を受付けました。\n申込番号: ${applicationData.applicationNumber}`);
    
    // ホーム画面に戻る
    navigate('/');
  };

  const totalQuantity = items.reduce((sum, item) => sum + parseInt(item.quantity), 0);

  return (
    <div className="buyback-container">
      <div className="page-header-with-back">
        <h1>ゲーム機買取申込</h1>
      </div>
      <p className="subtitle">
        お売りいただける商品を入力してください
      </p>

      <div className="form-section">
        <h2>📝 商品登録</h2>
        
        {/* STEP 1: 発送方法 */}
        <div className="shipping-method-section-inline">
          <div className="shipping-method-left">
            <label className="section-label-small">
              <span className="label-icon-small">📦</span>
              <span>STEP 1: 発送方法 *</span>
            </label>
            <div className="shipping-radio-group-inline">
              <label className="shipping-radio-option-inline">
                <input
                  type="radio"
                  value="customer"
                  checked={shippingInfo.shippingMethod === 'customer'}
                  onChange={(e) => setShippingInfo({shippingMethod: e.target.value})}
                />
                <div className="shipping-option-content">
                  <strong>📦 お客様自身での発送</strong>
                  <span className="shipping-option-desc">お客様ご負担で発送してください</span>
                </div>
              </label>

              <label className="shipping-radio-option-inline">
                <input
                  type="radio"
                  value="cashOnDelivery"
                  checked={shippingInfo.shippingMethod === 'cashOnDelivery'}
                  onChange={(e) => setShippingInfo({shippingMethod: e.target.value})}
                />
                <div className="shipping-option-content">
                  <strong>🚚 着払い（ヤマト運輸指定）</strong>
                  <span className="shipping-option-desc">買取見込み金額が20万円以上の場合のみ</span>
                </div>
              </label>
            </div>
          </div>
          <div className="shipping-method-right">
            <div className="shipping-notice-box">
              <p className="notice-text-small">
                ⚠️ <strong>重要なお知らせ</strong><br />
                買取見込み金額が<strong>20万円以上</strong>の場合は<strong>着払い（ヤマト運輸指定）</strong>で発送可能です。<br />
                それ以外の場合は、お客様ご負担での発送となります。
              </p>
            </div>
          </div>
        </div>

        {/* STEP 2: 商品タイプ */}
        <div className="product-type-section detailed-section">
          <label className="section-label-small">
            <span className="label-icon-small">🎮</span>
            <span>STEP 2: 商品タイプ *</span>
          </label>
          <div className="radio-group">
            <label className="radio-label">
              <input
                type="radio"
                value="console"
                checked={currentItem.productType === 'console'}
                onChange={(e) => setCurrentItem({...currentItem, productType: e.target.value, softwareName: ''})}
              />
              <span>ゲーム本体</span>
            </label>
            <label className="radio-label">
              <input
                type="radio"
                value="software"
                checked={currentItem.productType === 'software'}
                onChange={(e) => setCurrentItem({...currentItem, productType: e.target.value})}
              />
              <span>ゲームソフト</span>
            </label>
          </div>
        </div>

        {/* STEP 3: 商品の詳細 */}
        <div className="detailed-select-section">
          <label className="section-label-small">
            <span className="label-icon-small">🏢</span>
            <span>STEP 3: 商品の詳細を入力してください *</span>
          </label>
          
          <div className="product-select">
            <div className="form-group manufacturer-field">
              <label>🏭 メーカー *</label>
              <select 
                value={currentItem.manufacturer} 
                onChange={(e) => handleManufacturerChange(e.target.value)}
              >
                <option value="">選択してください</option>
                {manufacturers.map(mfr => (
                  <option key={mfr.value} value={mfr.value}>{mfr.label}</option>
                ))}
              </select>
            </div>

            <div className="form-group console-field">
              <label>🎮 ゲーム機種 *</label>
              <select 
                value={currentItem.console} 
                onChange={(e) => handleConsoleChange(e.target.value)}
                disabled={!currentItem.manufacturer}
              >
                <option value="">選択してください</option>
                {availableConsoles.map(console => (
                  <option key={console.value} value={console.value}>{console.label}</option>
                ))}
              </select>
            </div>

            {currentItem.console === 'other-manual' && (
              <div className="form-group console-custom-field">
                <label>✏️ 機種名を入力してください *</label>
                <input
                  type="text"
                  value={currentItem.consoleCustomName}
                  onChange={(e) => setCurrentItem({...currentItem, consoleCustomName: e.target.value})}
                  placeholder="例: セガサターン白"
                />
              </div>
            )}

            {currentItem.productType === 'console' && (
              <div className="form-group color-field">
                <label>🎨 カラー（任意）</label>
                <select 
                  value={currentItem.color} 
                  onChange={(e) => setCurrentItem({...currentItem, color: e.target.value})}
                >
                  <option value="">選択しない</option>
                  {getConsoleColorList(currentItem.console).map(color => (
                    <option key={color} value={color}>{color}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="condition-accessories-quantity-row">
              <div className="form-group condition-field">
                <label>⭐ 状態 *</label>
                <select value={currentItem.condition} onChange={(e) => setCurrentItem({...currentItem, condition: e.target.value})}>
                  <option value="">選択してください</option>
                  {conditions.map(condition => (
                    <option key={condition.value} value={condition.value}>{condition.label}</option>
                  ))}
                </select>
              </div>

              {currentItem.productType === 'console' && (
                <div className="form-group accessories-field">
                  <label>📦 付属品 *</label>
                  <select value={currentItem.accessories} onChange={(e) => setCurrentItem({...currentItem, accessories: e.target.value})}>
                    <option value="">選択してください</option>
                    {accessories.map(accessory => (
                      <option key={accessory.value} value={accessory.value}>{accessory.label}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-group quantity-field">
                <label>🔢 数量</label>
                <input 
                  type="number" 
                  min="1" 
                  value={currentItem.quantity}
                  onChange={(e) => handleQuantityChange(parseInt(e.target.value) || 1)}
                />
              </div>
            </div>

            {currentItem.condition === 'C' && (
              <div className="form-group-full-width condition-notes-field">
                <label>📝 状態の詳細 * (C評価は必須)</label>
                <textarea
                  value={currentItem.conditionNotes}
                  onChange={(e) => setCurrentItem({...currentItem, conditionNotes: e.target.value})}
                  placeholder="傷の位置、汚れの程度、動作確認の結果など詳細を記入してください"
                  rows="3"
                  className="condition-notes-textarea"
                />
              </div>
            )}

            {/* 管理番号はスタッフ側で表示するため、お客様画面では非表示 */}
            {/* データとしては生成・保存される */}
          </div>

          {currentItem.productType === 'software' && (
            <div className="software-name-section">
              <div className="form-group form-group-full-width">
                <label>💿 ソフト名 *</label>
                <input
                  type="text"
                  value={currentItem.softwareName}
                  onChange={(e) => setCurrentItem({...currentItem, softwareName: e.target.value})}
                  placeholder="例: ゼルダの伝説 ティアーズ オブ ザ キングダム"
                />
              </div>
            </div>
          )}

          <button onClick={handleAddItem} className="add-button">
            ➕ 商品を追加
          </button>
        </div>
      </div>

      <div className="form-section">
        <div className="list-header">
          <h2>📋 買取リスト</h2>
          {items.length > 0 && (
            <span className="item-count-badge">{items.length}点の商品</span>
          )}
        </div>
        {items.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📦</div>
            <p>商品が追加されていません</p>
          </div>
        ) : (
          <div className="buyback-list">
            {items.map(item => (
              <div key={item.id} className="buyback-item">
                <div className="item-details">
                  <span className="item-type-badge">{item.productTypeLabel}</span>
                  {/* 管理番号はお客様画面では非表示 */}
                  {item.productType === 'software' ? (
                    <>
                      <h4>{item.softwareName}</h4>
                      <p className="console-info">{item.manufacturerLabel} - {item.consoleLabel}</p>
                    </>
                  ) : (
                    <>
                      <h4>{item.manufacturerLabel} - {item.consoleLabel}</h4>
                      {item.colorLabel && <p className="color-info">カラー: {item.colorLabel}</p>}
                    </>
                  )}
                  <p>
                    状態: {item.conditionLabel}
                    {item.productType === 'console' && item.accessoriesLabel && ` / 付属品: ${item.accessoriesLabel}`}
                    {' / 数量: '}{item.quantity}点
                  </p>
                  {item.conditionNotes && (
                    <p className="condition-notes-display">
                      📝 状態詳細: {item.conditionNotes}
                    </p>
                  )}
                </div>
                <button onClick={() => handleRemoveItem(item.id)} className="remove-button">削除</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="submit-section">
          <button onClick={() => setShowConfirm(true)} className="submit-button detailed-submit">
            ✅ 申込内容を確認する
          </button>
        </div>
      )}

      {showConfirm && (
        <div className="modal">
          <div className="modal-content-compact">
            <div className="modal-header">
              <h2>📋 買取申込内容の確認</h2>
              <button className="modal-close" onClick={() => setShowConfirm(false)}>×</button>
            </div>

            <div className="modal-body">
              {/* 商品リスト */}
              <div className="confirm-section">
                <h3>🎮 買取商品（{items.length}点）</h3>
                <div className="confirm-items">
                  {items.map(item => (
                    <div key={item.id} className="confirm-item">
                      {/* 管理番号はお客様画面では非表示 */}
                      <div className="confirm-item-main">
                        <span className="confirm-type-badge">
                          {item.productType === 'console' ? '🎮' : '💿'}
                        </span>
                        <div className="confirm-item-info">
                          {item.productType === 'software' ? (
                            <>
                              <div className="confirm-product-name">{item.softwareName}</div>
                              <div className="confirm-product-sub">{item.manufacturerLabel} - {item.consoleLabel}</div>
                            </>
                          ) : (
                            <>
                              <div className="confirm-product-name">{item.consoleLabel}</div>
                              <div className="confirm-product-sub">
                                {item.manufacturerLabel}
                                {item.colorLabel && ` · ${item.colorLabel}`}
                                {item.accessoriesLabel && ` · ${item.accessoriesLabel}`}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="confirm-item-details">
                        <span className="confirm-condition">{item.conditionLabel}</span>
                        <span className="confirm-quantity">×{item.quantity}</span>
                      </div>
                      {item.conditionNotes && (
                        <div className="confirm-condition-notes">
                          📝 {item.conditionNotes}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="confirm-total">
                  合計 <strong>{totalQuantity}点</strong>
                </div>
              </div>

              {/* 発送情報とお客様情報を2カラムで */}
              <div className="confirm-grid">
                <div className="confirm-section">
                  <h3>📦 発送方法</h3>
                  <div className="confirm-info-box">
                    <p>
                      {shippingInfo.shippingMethod === 'customer' 
                        ? `📦 お客様自身での発送` 
                        : '🚚 着払い（ヤマト運輸指定）'}
                    </p>
                  </div>
                </div>

                <div className="confirm-section">
                  <h3>👤 お客様情報</h3>
                  <div className="confirm-info-box">
                    <p><strong>{user.name}</strong></p>
                    {user.birthDate && (
                      <p className="confirm-detail">🎂 生年月日: {user.birthDate}</p>
                    )}
                    {user.occupation && (
                      <p className="confirm-detail">💼 職業: {user.occupation}</p>
                    )}
                    <p className="confirm-detail">📧 {user.email}</p>
                    <p className="confirm-detail">📞 {user.phone}</p>
                    <p className="confirm-detail">📍 {user.postalCode} {user.address}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button onClick={() => setShowConfirm(false)} className="btn-secondary">
                ← 戻って修正
              </button>
              <button onClick={handleSubmit} className="btn-primary-large">
                ✓ この内容で申込を確定する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BuybackApplication;