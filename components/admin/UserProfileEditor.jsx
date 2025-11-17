/**
 * User Profile Editor Component
 * Comprehensive profile editing interface with avatar upload and preferences
 */

import React, { useState, useEffect } from 'react';
import { useUserManagement } from '../../lib/users/user-management.js';
import { useAuth } from '../../hooks/useAuth.js';
import { createClient } from '@supabase/supabase-js';
import toast from 'react-hot-toast';
import './UserProfileEditor.css';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export const UserProfileEditor = ({ user: targetUser, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    postal_code: '',
    avatar_url: '',
    preferences: {
      notifications: false,
      newsletter: false,
      two_factor_enabled: false
    }
  });
  
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState(null);
  
  const { user: currentUser, profile, refreshProfile } = useAuth();
  const { updateUser } = useUserManagement();

  useEffect(() => {
    if (targetUser) {
      setFormData({
        name: targetUser.name || '',
        phone: targetUser.phone || '',
        address: targetUser.address || '',
        postal_code: targetUser.postal_code || '',
        avatar_url: targetUser.avatar_url || '',
        preferences: {
          notifications: targetUser.preferences?.notifications || false,
          newsletter: targetUser.preferences?.newsletter || false,
          two_factor_enabled: targetUser.preferences?.two_factor_enabled || false
        }
      });
    }
  }, [targetUser]);

  const handleInputChange = (field, value) => {
    if (field.includes('.')) {
      const [parent, child] = field.split('.');
      setFormData(prev => ({
        ...prev,
        [parent]: {
          ...prev[parent],
          [child]: value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [field]: value
      }));
    }
  };

  const handleAvatarUpload = async (event) => {
    try {
      setUploading(true);
      const file = event.target.files?.[0];
      
      if (!file) return;

      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast.error('画像ファイルを選択してください');
        return;
      }

      // Validate file size (2MB limit)
      if (file.size > 2 * 1024 * 1024) {
        toast.error('ファイルサイズは2MB以下にしてください');
        return;
      }

      const fileExt = file.name.split('.').pop();
      const fileName = `${targetUser.id}-${Date.now()}.${fileExt}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file);

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      // Update form data
      setFormData(prev => ({
        ...prev,
        avatar_url: publicUrl
      }));

      toast.success('アバターを更新しました');
    } catch (error) {
      console.error('Avatar upload error:', error);
      toast.error('アバターの更新に失敗しました: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      setMessage(null);

      // Validate required fields
      if (!formData.name.trim()) {
        setMessage({ type: 'error', text: '名前は必須です' });
        return;
      }

      // Update user profile
      await updateUser(targetUser.id, formData);

      // If editing own profile, refresh profile data
      if (targetUser.id === currentUser?.id) {
        await refreshProfile();
      }

      setMessage({ type: 'success', text: 'プロファイルを更新しました' });
      toast.success('プロファイルを更新しました');

      // Call onSave callback if provided
      if (onSave) {
        onSave();
      }
    } catch (error) {
      console.error('Profile update error:', error);
      setMessage({ type: 'error', text: 'プロファイルの更新に失敗しました: ' + error.message });
      toast.error('プロファイルの更新に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const TabPanel = ({ children, value, index }) => (
    <div hidden={value !== index} className="tab-panel">
      {value === index && children}
    </div>
  );

  if (!targetUser) {
    return (
      <div className="profile-editor-loading">
        <div className="loading-spinner"></div>
        <p>プロファイル情報を読み込んでいます...</p>
      </div>
    );
  }

  return (
    <div className="profile-editor">
      <div className="profile-editor-header">
        <h2>プロファイル設定</h2>
        <p>アカウント情報と設定の管理</p>
        {onClose && (
          <button onClick={onClose} className="close-button">
            ×
          </button>
        )}
      </div>

      {message && (
        <div className={`message ${message.type}`}>
          {message.text}
          <button onClick={() => setMessage(null)} className="message-close">×</button>
        </div>
      )}

      <div className="profile-editor-content">
        {/* Tabs */}
        <div className="tabs">
          <button
            className={`tab ${activeTab === 0 ? 'active' : ''}`}
            onClick={() => setActiveTab(0)}
          >
            基本情報
          </button>
          <button
            className={`tab ${activeTab === 1 ? 'active' : ''}`}
            onClick={() => setActiveTab(1)}
          >
            セキュリティ
          </button>
          <button
            className={`tab ${activeTab === 2 ? 'active' : ''}`}
            onClick={() => setActiveTab(2)}
          >
            設定
          </button>
        </div>

        {/* Basic Information Tab */}
        <TabPanel value={activeTab} index={0}>
          <div className="basic-info-tab">
            <div className="avatar-section">
              <div className="avatar-container">
                {formData.avatar_url ? (
                  <img src={formData.avatar_url} alt={formData.name} className="avatar-image" />
                ) : (
                  <div className="avatar-placeholder">
                    <span>👤</span>
                  </div>
                )}
              </div>
              <label className="avatar-upload-button">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  disabled={uploading}
                  style={{ display: 'none' }}
                />
                {uploading ? '📤 アップロード中...' : '📷 アバター変更'}
              </label>
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="name">名前 *</label>
                <input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  required
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="email">メールアドレス</label>
                <input
                  id="email"
                  type="email"
                  value={targetUser.email}
                  disabled
                  className="form-input disabled"
                />
                <small>メールアドレスは変更できません</small>
              </div>

              <div className="form-group">
                <label htmlFor="phone">電話番号</label>
                <input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="postal_code">郵便番号</label>
                <input
                  id="postal_code"
                  type="text"
                  value={formData.postal_code}
                  onChange={(e) => handleInputChange('postal_code', e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="form-group full-width">
                <label htmlFor="address">住所</label>
                <textarea
                  id="address"
                  value={formData.address}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                  rows={3}
                  className="form-textarea"
                />
              </div>
            </div>
          </div>
        </TabPanel>

        {/* Security Tab */}
        <TabPanel value={activeTab} index={1}>
          <div className="security-tab">
            <div className="info-alert">
              <span>🔒</span>
              <p>アカウントのセキュリティ設定を管理します。</p>
            </div>

            <div className="security-section">
              <div className="security-item">
                <div className="security-header">
                  <h3>🔑 パスワード</h3>
                </div>
                <p>アカウントのパスワードを変更します。</p>
                <a href="/auth/change-password" className="btn btn-secondary">
                  パスワードを変更
                </a>
              </div>

              <div className="security-item">
                <div className="security-header">
                  <h3>🛡️ 二要素認証</h3>
                </div>
                <div className="toggle-setting">
                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={formData.preferences?.two_factor_enabled || false}
                      onChange={(e) => handleInputChange('preferences.two_factor_enabled', e.target.checked)}
                      className="toggle-input"
                    />
                    <span className="toggle-slider"></span>
                    二要素認証を有効にする
                  </label>
                </div>
                {!formData.preferences?.two_factor_enabled && (
                  <p className="security-note">
                    アカウントのセキュリティを強化するために二要素認証を有効にすることをお勧めします。
                  </p>
                )}
              </div>
            </div>
          </div>
        </TabPanel>

        {/* Settings Tab */}
        <TabPanel value={activeTab} index={2}>
          <div className="settings-tab">
            <h3>通知設定</h3>
            
            <div className="settings-group">
              <div className="toggle-setting">
                <label className="toggle-label">
                  <input
                    type="checkbox"
                    checked={formData.preferences?.notifications || false}
                    onChange={(e) => handleInputChange('preferences.notifications', e.target.checked)}
                    className="toggle-input"
                  />
                  <span className="toggle-slider"></span>
                  アプリ通知を有効にする
                </label>
              </div>

              <div className="toggle-setting">
                <label className="toggle-label">
                  <input
                    type="checkbox"
                    checked={formData.preferences?.newsletter || false}
                    onChange={(e) => handleInputChange('preferences.newsletter', e.target.checked)}
                    className="toggle-input"
                  />
                  <span className="toggle-slider"></span>
                  メールマガジンを受け取る
                </label>
              </div>
            </div>
          </div>
        </TabPanel>

        {/* Action Buttons */}
        <div className="profile-editor-actions">
          <button
            onClick={handleSave}
            disabled={loading}
            className="btn btn-primary"
          >
            {loading ? '💾 保存中...' : '💾 変更を保存'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserProfileEditor;