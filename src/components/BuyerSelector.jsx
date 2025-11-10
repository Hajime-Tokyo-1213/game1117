import React, { useState, useEffect } from 'react';
import { getAllBuyers, addBuyer } from '../utils/buyerManager';
import './BuyerSelector.css';

const BuyerSelector = ({ selectedBuyer, onSelectBuyer, onClose }) => {
  const [buyers, setBuyers] = useState([]);
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    companyName: '',
    country: '',
    postalCode: '',
    address: '',
    phone: '',
    email: '',
    notes: ''
  });
  const [error, setError] = useState('');

  useEffect(() => {
    loadBuyers();
  }, []);

  const loadBuyers = () => {
    const allBuyers = getAllBuyers();
    setBuyers(allBuyers);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const validateForm = () => {
    if (!formData.name || !formData.country || !formData.email) {
      setError('必須項目（名前、国、メールアドレス）を入力してください');
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setError('有効なメールアドレスを入力してください');
      return false;
    }

    return true;
  };

  const handleRegister = () => {
    setError('');
    if (!validateForm()) {
      return;
    }

    const result = addBuyer(formData);
    if (result.success) {
      loadBuyers();
      setFormData({
        name: '',
        companyName: '',
        country: '',
        postalCode: '',
        address: '',
        phone: '',
        email: '',
        notes: ''
      });
      setShowRegisterForm(false);
      alert('バイヤーを登録しました');
    } else {
      setError(result.error);
    }
  };

  const filteredBuyers = buyers.filter(buyer =>
    buyer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    buyer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    buyer.country.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (buyer.companyName && buyer.companyName.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="buyer-selector-modal-overlay" onClick={onClose}>
      <div className="buyer-selector-modal" onClick={(e) => e.stopPropagation()}>
        <div className="buyer-selector-header">
          <h2>🌍 バイヤー選択</h2>
          <button className="buyer-selector-close" onClick={onClose}>×</button>
        </div>

        <div className="buyer-selector-content">
          {!showRegisterForm ? (
            <>
              {/* 検索バー */}
              <div className="buyer-search-bar">
                <input
                  type="text"
                  placeholder="名前、メール、国、会社名で検索..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="buyer-search-input"
                />
                <button
                  className="btn-add-buyer"
                  onClick={() => setShowRegisterForm(true)}
                >
                  ➕ 新規バイヤー登録
                </button>
              </div>

              {/* バイヤーリスト */}
              <div className="buyer-list">
                {filteredBuyers.length === 0 ? (
                  <div className="empty-buyers">
                    <p>バイヤーが見つかりません</p>
                    <button
                      className="btn-add-buyer-inline"
                      onClick={() => setShowRegisterForm(true)}
                    >
                      新規バイヤーを登録
                    </button>
                  </div>
                ) : (
                  filteredBuyers.map((buyer) => (
                    <div
                      key={buyer.id || buyer.email}
                      className={`buyer-item ${selectedBuyer?.email === buyer.email ? 'selected' : ''}`}
                      onClick={() => {
                        onSelectBuyer(buyer);
                        onClose();
                      }}
                    >
                      <div className="buyer-item-header">
                        <div className="buyer-name-section">
                          <span className="buyer-name">{buyer.name}</span>
                          {buyer.companyName && (
                            <span className="buyer-company">{buyer.companyName}</span>
                          )}
                          {buyer.source === 'registered_user' && (
                            <span className="buyer-badge">登録ユーザー</span>
                          )}
                        </div>
                        <span className="buyer-country">🌍 {buyer.country}</span>
                      </div>
                      <div className="buyer-item-details">
                        <span className="buyer-email">📧 {buyer.email}</span>
                        {buyer.phone && (
                          <span className="buyer-phone">📞 {buyer.phone}</span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <>
              {/* 新規バイヤー登録フォーム */}
              <div className="buyer-register-form">
                <div className="form-header">
                  <h3>新規バイヤー登録</h3>
                  <button
                    className="btn-back"
                    onClick={() => {
                      setShowRegisterForm(false);
                      setError('');
                      setFormData({
                        name: '',
                        companyName: '',
                        country: '',
                        postalCode: '',
                        address: '',
                        phone: '',
                        email: '',
                        notes: ''
                      });
                    }}
                  >
                    ← 戻る
                  </button>
                </div>

                {error && <div className="error-message">{error}</div>}

                <div className="form-row">
                  <div className="form-group">
                    <label>名前 *</label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleFormChange}
                      placeholder="John Smith"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>会社名（任意）</label>
                    <input
                      type="text"
                      name="companyName"
                      value={formData.companyName}
                      onChange={handleFormChange}
                      placeholder="ABC Trading Co."
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>国 *</label>
                    <input
                      type="text"
                      name="country"
                      value={formData.country}
                      onChange={handleFormChange}
                      placeholder="United States"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>郵便番号（任意）</label>
                    <input
                      type="text"
                      name="postalCode"
                      value={formData.postalCode}
                      onChange={handleFormChange}
                      placeholder="12345"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>住所（任意）</label>
                  <input
                    type="text"
                    name="address"
                    value={formData.address}
                    onChange={handleFormChange}
                    placeholder="123 Main St, City, State"
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>電話番号（任意）</label>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleFormChange}
                      placeholder="+1-234-567-8900"
                    />
                  </div>
                  <div className="form-group">
                    <label>メールアドレス *</label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleFormChange}
                      placeholder="buyer@example.com"
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>備考（任意）</label>
                  <textarea
                    name="notes"
                    value={formData.notes}
                    onChange={handleFormChange}
                    placeholder="特記事項があれば入力してください"
                    rows="3"
                  />
                </div>

                <div className="form-actions">
                  <button
                    className="btn-cancel"
                    onClick={() => {
                      setShowRegisterForm(false);
                      setError('');
                      setFormData({
                        name: '',
                        companyName: '',
                        country: '',
                        postalCode: '',
                        address: '',
                        phone: '',
                        email: '',
                        notes: ''
                      });
                    }}
                  >
                    キャンセル
                  </button>
                  <button
                    className="btn-register"
                    onClick={handleRegister}
                  >
                    登録
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default BuyerSelector;


