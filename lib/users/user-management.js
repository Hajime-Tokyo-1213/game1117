/**
 * User Management Service
 * Comprehensive user management system with filtering, statistics, and bulk operations
 */

import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { useState } from 'react';

// User schemas
const UserProfileSchema = z.object({
  name: z.string().min(1, '名前は必須です'),
  phone: z.string().optional(),
  address: z.string().optional(),
  postal_code: z.string().optional(),
  avatar_url: z.string().url().optional(),
  role: z.enum(['customer', 'staff', 'admin', 'super_admin']).optional(),
  metadata: z.record(z.unknown()).optional(),
  preferences: z.object({
    notifications: z.boolean().optional(),
    newsletter: z.boolean().optional(),
    two_factor_enabled: z.boolean().optional()
  }).optional()
});

const UserFilterSchema = z.object({
  search: z.string().optional(),
  role: z.enum(['customer', 'staff', 'admin', 'super_admin']).optional(),
  status: z.enum(['active', 'inactive', 'suspended', 'pending']).optional(),
  created_from: z.string().datetime().optional(),
  created_to: z.string().datetime().optional(),
  last_sign_in_from: z.string().datetime().optional(),
  last_sign_in_to: z.string().datetime().optional(),
  page: z.number().min(1).optional(),
  limit: z.number().min(1).max(100).optional(),
  sort_by: z.enum(['created_at', 'last_sign_in', 'name', 'email']).optional(),
  sort_order: z.enum(['asc', 'desc']).optional()
});

export class UserManagementService {
  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''
    );

    this.adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );
  }

  // Get users with advanced filtering
  async getUsers(filters = {}) {
    try {
      const validatedFilters = UserFilterSchema.parse(filters);
      const {
        search,
        role,
        status,
        created_from,
        created_to,
        last_sign_in_from,
        last_sign_in_to,
        page = 1,
        limit = 25,
        sort_by = 'created_at',
        sort_order = 'desc'
      } = validatedFilters;

      let query = this.supabase
        .from('profiles')
        .select(`
          id,
          email,
          name,
          phone,
          address,
          postal_code,
          avatar_url,
          role,
          status,
          email_verified,
          two_factor_enabled,
          last_sign_in,
          created_at,
          updated_at,
          metadata,
          preferences
        `, { count: 'exact' });

      // Apply filtering
      if (search) {
        query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
      }

      if (role) {
        query = query.eq('role', role);
      }

      if (status) {
        query = query.eq('status', status);
      }

      if (created_from) {
        query = query.gte('created_at', created_from);
      }

      if (created_to) {
        query = query.lte('created_at', created_to);
      }

      if (last_sign_in_from) {
        query = query.gte('last_sign_in', last_sign_in_from);
      }

      if (last_sign_in_to) {
        query = query.lte('last_sign_in', last_sign_in_to);
      }

      // Sort and pagination
      query = query
        .order(sort_by, { ascending: sort_order === 'asc' })
        .range((page - 1) * limit, page * limit - 1);

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        users: data || [],
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit)
      };
    } catch (error) {
      console.error('Failed to get users:', error);
      throw error;
    }
  }

  // Get user statistics
  async getUserStats() {
    try {
      const [totalResult, activeResult, newThisMonthResult, roleStatsResult] = await Promise.all([
        this.supabase.from('profiles').select('*', { count: 'exact', head: true }),
        this.supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        this.supabase.from('profiles')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
        this.supabase.from('profiles').select('role')
      ]);

      const byRole = roleStatsResult.data?.reduce((acc, user) => {
        acc[user.role] = (acc[user.role] || 0) + 1;
        return acc;
      }, {}) || {};

      return {
        total: totalResult.count || 0,
        active: activeResult.count || 0,
        inactive: (totalResult.count || 0) - (activeResult.count || 0),
        newThisMonth: newThisMonthResult.count || 0,
        byRole
      };
    } catch (error) {
      console.error('Failed to get user stats:', error);
      throw error;
    }
  }

  // Get individual user
  async getUserById(id) {
    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) return null;
      return data;
    } catch (error) {
      console.error('Failed to get user by ID:', error);
      return null;
    }
  }

  // Update user profile
  async updateUserProfile(id, updates) {
    try {
      const validatedUpdates = UserProfileSchema.partial().parse(updates);
      
      const { data, error } = await this.adminSupabase
        .from('profiles')
        .update({
          ...validatedUpdates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      
      // Record user update audit log
      await this.recordUserAction(id, 'profile_updated', { updates: validatedUpdates });
      
      return data;
    } catch (error) {
      console.error('Failed to update user profile:', error);
      throw error;
    }
  }

  // Update user status
  async updateUserStatus(id, status, reason) {
    try {
      const { error } = await this.adminSupabase
        .from('profiles')
        .update({ 
          status, 
          updated_at: new Date().toISOString(),
          metadata: {
            status_changed_at: new Date().toISOString(),
            status_change_reason: reason
          }
        })
        .eq('id', id);

      if (error) throw error;

      // Update Supabase Auth user status too
      if (status === 'suspended') {
        try {
          await this.adminSupabase.auth.admin.updateUserById(id, {
            ban_duration: 'indefinite'
          });
        } catch (authError) {
          console.warn('Failed to update auth user status:', authError);
        }
      } else if (status === 'active') {
        try {
          await this.adminSupabase.auth.admin.updateUserById(id, {
            ban_duration: 'none'
          });
        } catch (authError) {
          console.warn('Failed to update auth user status:', authError);
        }
      }

      await this.recordUserAction(id, 'status_changed', { status, reason });
    } catch (error) {
      console.error('Failed to update user status:', error);
      throw error;
    }
  }

  // Update user role
  async updateUserRole(id, newRole, requesterId) {
    try {
      // Permission check
      const requester = await this.getUserById(requesterId);
      if (!requester || !['admin', 'super_admin'].includes(requester.role)) {
        throw new Error('権限がありません');
      }

      const { error } = await this.adminSupabase
        .from('profiles')
        .update({ 
          role: newRole, 
          updated_at: new Date().toISOString() 
        })
        .eq('id', id);

      if (error) throw error;

      // Update Supabase Auth user metadata
      try {
        await this.adminSupabase.auth.admin.updateUserById(id, {
          user_metadata: { role: newRole }
        });
      } catch (authError) {
        console.warn('Failed to update auth user metadata:', authError);
      }

      await this.recordUserAction(id, 'role_changed', { 
        newRole, 
        changedBy: requesterId 
      });
    } catch (error) {
      console.error('Failed to update user role:', error);
      throw error;
    }
  }

  // Bulk update users
  async bulkUpdateUsers(userIds, updates) {
    const results = {
      succeeded: [],
      failed: []
    };

    for (const userId of userIds) {
      try {
        if (updates.status) {
          await this.updateUserStatus(userId, updates.status);
        }
        if (updates.role) {
          await this.updateUserRole(userId, updates.role, 'admin');
        }
        results.succeeded.push(userId);
      } catch (error) {
        results.failed.push({ id: userId, error: error.message });
      }
    }

    return results;
  }

  // Delete user (logical deletion)
  async deleteUser(id, requesterId) {
    try {
      // Logical deletion (change status instead of actually deleting)
      const { error } = await this.adminSupabase
        .from('profiles')
        .update({ 
          status: 'deleted',
          deleted_at: new Date().toISOString(),
          deleted_by: requesterId,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;

      // Delete from Supabase Auth
      try {
        await this.adminSupabase.auth.admin.deleteUser(id);
      } catch (authError) {
        console.warn('Failed to delete auth user:', authError);
      }

      await this.recordUserAction(id, 'user_deleted', { deletedBy: requesterId });
    } catch (error) {
      console.error('Failed to delete user:', error);
      throw error;
    }
  }

  // Get user activity log
  async getUserActivityLog(userId, page = 1, limit = 50) {
    try {
      const { data, error, count } = await this.supabase
        .from('user_activity_logs')
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range((page - 1) * limit, page * limit - 1);

      if (error) throw error;

      return {
        activities: data || [],
        total: count || 0
      };
    } catch (error) {
      console.error('Failed to get user activity log:', error);
      return { activities: [], total: 0 };
    }
  }

  // Record user action (private)
  async recordUserAction(userId, action, details) {
    try {
      await this.supabase
        .from('user_activity_logs')
        .insert({
          user_id: userId,
          action,
          details,
          ip_address: await this.getClientIP(),
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'server',
          created_at: new Date().toISOString()
        });
    } catch (error) {
      console.error('Failed to record user action:', error);
    }
  }

  async getClientIP() {
    try {
      if (typeof window === 'undefined') return 'server';
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      return data.ip;
    } catch {
      return 'unknown';
    }
  }

  // Get user roles for dropdown
  getRoles() {
    return [
      { value: 'customer', label: '顧客', color: 'primary' },
      { value: 'staff', label: 'スタッフ', color: 'info' },
      { value: 'admin', label: '管理者', color: 'warning' },
      { value: 'super_admin', label: 'スーパー管理者', color: 'error' }
    ];
  }

  // Get user statuses for dropdown
  getStatuses() {
    return [
      { value: 'active', label: 'アクティブ', color: 'success' },
      { value: 'inactive', label: '非アクティブ', color: 'default' },
      { value: 'suspended', label: '停止中', color: 'error' },
      { value: 'pending', label: '承認待ち', color: 'warning' }
    ];
  }
}

// Singleton instance
export const userManagementService = new UserManagementService();

// React Hook for user management
export function useUserManagement() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const getUsers = async (filters) => {
    setLoading(true);
    setError(null);
    try {
      const result = await userManagementService.getUsers(filters);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const getUserStats = async () => {
    try {
      return await userManagementService.getUserStats();
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const updateUser = async (id, updates) => {
    setLoading(true);
    setError(null);
    try {
      const result = await userManagementService.updateUserProfile(id, updates);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const updateUserStatus = async (id, status, reason) => {
    setLoading(true);
    setError(null);
    try {
      await userManagementService.updateUserStatus(id, status, reason);
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const updateUserRole = async (id, role, requesterId) => {
    setLoading(true);
    setError(null);
    try {
      await userManagementService.updateUserRole(id, role, requesterId);
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const bulkUpdate = async (userIds, updates) => {
    setLoading(true);
    setError(null);
    try {
      const result = await userManagementService.bulkUpdateUsers(userIds, updates);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const deleteUser = async (id, requesterId) => {
    setLoading(true);
    setError(null);
    try {
      await userManagementService.deleteUser(id, requesterId);
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const getUserActivity = async (userId, page, limit) => {
    try {
      return await userManagementService.getUserActivityLog(userId, page, limit);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  return {
    loading,
    error,
    getUsers,
    getUserStats,
    updateUser,
    updateUserStatus,
    updateUserRole,
    bulkUpdate,
    deleteUser,
    getUserActivity,
    clearError: () => setError(null)
  };
}

export default userManagementService;