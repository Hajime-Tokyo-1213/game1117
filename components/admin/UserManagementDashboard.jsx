/**
 * User Management Dashboard Component
 * Complete admin interface for managing users with filtering, statistics, and bulk operations
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useUserManagement } from '../../lib/users/user-management.js';
import { useAuth } from '../../hooks/useAuth.js';
import toast from 'react-hot-toast';
import './UserManagementDashboard.css';

export const UserManagementDashboard = () => {
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [filters, setFilters] = useState({});
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [bulkActionDialog, setBulkActionDialog] = useState(false);
  const [userEditDialog, setUserEditDialog] = useState({ open: false, user: null });
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0 });
  
  const { 
    loading, 
    error, 
    getUsers, 
    getUserStats, 
    updateUserStatus, 
    updateUserRole, 
    bulkUpdate,
    deleteUser 
  } = useUserManagement();
  
  const { user: currentUser } = useAuth();

  const loadUsers = useCallback(async () => {
    try {
      const result = await getUsers({ 
        ...filters, 
        page: pagination.page, 
        limit: pagination.limit 
      });
      setUsers(result.users);
      setPagination(prev => ({ ...prev, total: result.total, totalPages: result.totalPages }));
    } catch (error) {
      console.error('Failed to load users:', error);
      toast.error('ユーザー一覧の読み込みに失敗しました');
    }
  }, [filters, pagination.page, pagination.limit, getUsers]);

  const loadStats = useCallback(async () => {
    try {
      const statsData = await getUserStats();
      setStats(statsData);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  }, [getUserStats]);

  useEffect(() => {
    loadUsers();
    loadStats();
  }, [loadUsers, loadStats]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleUserSelect = (userId, checked) => {
    if (checked) {
      setSelectedUsers(prev => [...prev, userId]);
    } else {
      setSelectedUsers(prev => prev.filter(id => id !== userId));
    }
  };

  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedUsers(users.map(u => u.id));
    } else {
      setSelectedUsers([]);
    }
  };

  const handleBulkAction = async (action) => {
    if (selectedUsers.length === 0) {
      toast.error('ユーザーを選択してください');
      return;
    }

    try {
      let updates = {};
      let confirmMessage = '';
      
      switch (action) {
        case 'activate':
          updates = { status: 'active' };
          confirmMessage = `${selectedUsers.length}件のユーザーをアクティブにしますか？`;
          break;
        case 'suspend':
          updates = { status: 'suspended' };
          confirmMessage = `${selectedUsers.length}件のユーザーを停止しますか？`;
          break;
        case 'make_staff':
          updates = { role: 'staff' };
          confirmMessage = `${selectedUsers.length}件のユーザーにスタッフ権限を付与しますか？`;
          break;
        case 'make_customer':
          updates = { role: 'customer' };
          confirmMessage = `${selectedUsers.length}件のユーザーを顧客に変更しますか？`;
          break;
        default:
          return;
      }

      if (!confirm(confirmMessage)) return;

      const result = await bulkUpdate(selectedUsers, updates);
      
      if (result.failed.length > 0) {
        toast.error(`${result.failed.length}件の更新に失敗しました`);
      } else {
        toast.success(`${result.succeeded.length}件のユーザーを更新しました`);
      }
      
      setSelectedUsers([]);
      setBulkActionDialog(false);
      await loadUsers();
      await loadStats();
    } catch (error) {
      toast.error('操作に失敗しました: ' + error.message);
    }
  };

  const handleUserStatusChange = async (userId, newStatus) => {
    try {
      const reason = prompt('変更理由を入力してください（任意）:');
      await updateUserStatus(userId, newStatus, reason);
      toast.success('ユーザーステータスを更新しました');
      await loadUsers();
      await loadStats();
    } catch (error) {
      toast.error('ステータスの更新に失敗しました');
    }
  };

  const handleUserRoleChange = async (userId, newRole) => {
    try {
      if (!currentUser?.id) {
        toast.error('権限がありません');
        return;
      }
      
      await updateUserRole(userId, newRole, currentUser.id);
      toast.success('ユーザー権限を更新しました');
      await loadUsers();
      await loadStats();
    } catch (error) {
      toast.error('権限の更新に失敗しました: ' + error.message);
    }
  };

  const handleUserDelete = async (userId) => {
    if (!confirm('このユーザーを削除しますか？この操作は元に戻せません。')) return;
    
    try {
      await deleteUser(userId, currentUser?.id);
      toast.success('ユーザーを削除しました');
      await loadUsers();
      await loadStats();
    } catch (error) {
      toast.error('ユーザーの削除に失敗しました');
    }
  };

  const exportUsers = async () => {
    try {
      const allUsers = await getUsers({ ...filters, limit: 10000 });
      const csv = convertToCSV(allUsers.users);
      downloadCSV(csv, `users-export-${new Date().toISOString().split('T')[0]}.csv`);
      toast.success('ユーザーデータをエクスポートしました');
    } catch (error) {
      toast.error('エクスポートに失敗しました');
    }
  };

  const convertToCSV = (data) => {
    const headers = ['ID', 'Email', 'Name', 'Role', 'Status', 'Phone', 'Last Sign In', 'Created At'];
    const rows = data.map(user => [
      user.id,
      user.email,
      user.name,
      user.role,
      user.status,
      user.phone || '',
      user.last_sign_in ? new Date(user.last_sign_in).toLocaleDateString() : '',
      new Date(user.created_at).toLocaleDateString()
    ]);
    
    return [headers, ...rows].map(row => row.join(',')).join('\n');
  };

  const downloadCSV = (csv, filename) => {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'status-active';
      case 'inactive': return 'status-inactive';
      case 'suspended': return 'status-suspended';
      case 'pending': return 'status-pending';
      default: return 'status-default';
    }
  };

  const getRoleColor = (role) => {
    switch (role) {
      case 'admin': 
      case 'super_admin': return 'role-admin';
      case 'staff': return 'role-staff';
      case 'customer': return 'role-customer';
      default: return 'role-default';
    }
  };

  if (loading && !users.length) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner"></div>
        <p>ユーザー情報を読み込んでいます...</p>
      </div>
    );
  }

  return (
    <div className="user-management-dashboard">
      <div className="dashboard-header">
        <h1>ユーザー管理</h1>
        <p>システム利用者の管理と設定</p>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">👥</div>
            <div className="stat-content">
              <h3>総ユーザー数</h3>
              <div className="stat-value">{stats.total.toLocaleString()}</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">✅</div>
            <div className="stat-content">
              <h3>アクティブ</h3>
              <div className="stat-value active">{stats.active.toLocaleString()}</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">⏸️</div>
            <div className="stat-content">
              <h3>非アクティブ</h3>
              <div className="stat-value inactive">{stats.inactive.toLocaleString()}</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">🆕</div>
            <div className="stat-content">
              <h3>今月の新規</h3>
              <div className="stat-value new">{stats.newThisMonth.toLocaleString()}</div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="filters-section">
        <div className="filters-grid">
          <div className="filter-group">
            <label>検索</label>
            <input
              type="text"
              placeholder="名前またはメールで検索"
              value={filters.search || ''}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              className="filter-input"
            />
          </div>
          
          <div className="filter-group">
            <label>権限</label>
            <select
              value={filters.role || ''}
              onChange={(e) => handleFilterChange('role', e.target.value)}
              className="filter-select"
            >
              <option value="">すべて</option>
              <option value="customer">顧客</option>
              <option value="staff">スタッフ</option>
              <option value="admin">管理者</option>
              <option value="super_admin">スーパー管理者</option>
            </select>
          </div>
          
          <div className="filter-group">
            <label>ステータス</label>
            <select
              value={filters.status || ''}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="filter-select"
            >
              <option value="">すべて</option>
              <option value="active">アクティブ</option>
              <option value="inactive">非アクティブ</option>
              <option value="suspended">停止中</option>
              <option value="pending">承認待ち</option>
            </select>
          </div>
          
          <div className="filter-group">
            <label>ソート</label>
            <select
              value={filters.sort_by || 'created_at'}
              onChange={(e) => handleFilterChange('sort_by', e.target.value)}
              className="filter-select"
            >
              <option value="created_at">登録日</option>
              <option value="last_sign_in">最終ログイン</option>
              <option value="name">名前</option>
              <option value="email">メール</option>
            </select>
          </div>
          
          <div className="filter-actions">
            <button
              onClick={exportUsers}
              className="btn btn-secondary"
              disabled={loading}
            >
              📥 エクスポート
            </button>
          </div>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedUsers.length > 0 && (
        <div className="bulk-actions-bar">
          <span>{selectedUsers.length} 件選択中</span>
          <button
            onClick={() => setBulkActionDialog(true)}
            className="btn btn-primary"
          >
            一括操作
          </button>
        </div>
      )}

      {/* Users Table */}
      <div className="users-table-container">
        <table className="users-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={selectedUsers.length === users.length && users.length > 0}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                />
              </th>
              <th>名前</th>
              <th>メール</th>
              <th>権限</th>
              <th>ステータス</th>
              <th>最終ログイン</th>
              <th>登録日</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedUsers.includes(user.id)}
                    onChange={(e) => handleUserSelect(user.id, e.target.checked)}
                  />
                </td>
                <td>
                  <div className="user-info">
                    {user.avatar_url && (
                      <img src={user.avatar_url} alt={user.name} className="user-avatar" />
                    )}
                    <span>{user.name}</span>
                  </div>
                </td>
                <td>{user.email}</td>
                <td>
                  <span className={`badge ${getRoleColor(user.role)}`}>
                    {user.role}
                  </span>
                </td>
                <td>
                  <span className={`badge ${getStatusColor(user.status)}`}>
                    {user.status}
                  </span>
                </td>
                <td>
                  {user.last_sign_in 
                    ? new Date(user.last_sign_in).toLocaleDateString()
                    : '未ログイン'
                  }
                </td>
                <td>{new Date(user.created_at).toLocaleDateString()}</td>
                <td>
                  <div className="user-actions">
                    <select
                      onChange={(e) => {
                        if (e.target.value === 'change_status') {
                          const newStatus = prompt('新しいステータス (active/inactive/suspended):');
                          if (newStatus) handleUserStatusChange(user.id, newStatus);
                        } else if (e.target.value === 'change_role') {
                          const newRole = prompt('新しい権限 (customer/staff/admin):');
                          if (newRole) handleUserRoleChange(user.id, newRole);
                        } else if (e.target.value === 'delete') {
                          handleUserDelete(user.id);
                        }
                        e.target.value = '';
                      }}
                      className="action-select"
                    >
                      <option value="">操作選択</option>
                      <option value="change_status">ステータス変更</option>
                      <option value="change_role">権限変更</option>
                      <option value="delete">削除</option>
                    </select>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="pagination">
        <button
          onClick={() => setPagination(prev => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
          disabled={pagination.page <= 1}
          className="btn btn-secondary"
        >
          前へ
        </button>
        
        <span className="pagination-info">
          {pagination.page} / {pagination.totalPages} ページ
          （全 {pagination.total} 件）
        </span>
        
        <button
          onClick={() => setPagination(prev => ({ ...prev, page: Math.min(prev.totalPages, prev.page + 1) }))}
          disabled={pagination.page >= pagination.totalPages}
          className="btn btn-secondary"
        >
          次へ
        </button>
      </div>

      {/* Bulk Action Dialog */}
      {bulkActionDialog && (
        <div className="modal-overlay" onClick={() => setBulkActionDialog(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>一括操作</h3>
              <button
                onClick={() => setBulkActionDialog(false)}
                className="modal-close"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <p>{selectedUsers.length} 件のユーザーに対して実行する操作を選択してください。</p>
              <div className="bulk-action-buttons">
                <button
                  onClick={() => handleBulkAction('activate')}
                  className="btn btn-success"
                >
                  アクティブに変更
                </button>
                <button
                  onClick={() => handleBulkAction('suspend')}
                  className="btn btn-warning"
                >
                  アカウント停止
                </button>
                <button
                  onClick={() => handleBulkAction('make_staff')}
                  className="btn btn-info"
                >
                  スタッフ権限付与
                </button>
                <button
                  onClick={() => handleBulkAction('make_customer')}
                  className="btn btn-secondary"
                >
                  顧客に変更
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="error-message">
          エラー: {error}
        </div>
      )}
    </div>
  );
};

export default UserManagementDashboard;