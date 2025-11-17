/**
 * Admin Users Page
 * Main entry point for user management functionality
 */

import React from 'react';
import { UserManagementDashboard } from '../../components/admin/UserManagementDashboard.jsx';
import { useAuth } from '../../hooks/useAuth.js';

export default function AdminUsersPage() {
  const { user, profile } = useAuth();

  // Check admin permissions
  if (!user || !profile || !['admin', 'super_admin'].includes(profile.role)) {
    return (
      <div className="admin-access-denied">
        <h1>アクセス権限がありません</h1>
        <p>この機能を利用するには管理者権限が必要です。</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <UserManagementDashboard />
    </div>
  );
}