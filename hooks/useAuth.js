/**
 * Authentication Hook and Context
 * React context and hooks for authentication state management
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { authService } from '../lib/auth/supabase-auth.js';
import toast from 'react-hot-toast';

const AuthContext = createContext(undefined);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;

    // Initialize auth state
    const initializeAuth = async () => {
      try {
        const session = await authService.getSession();
        
        if (mounted) {
          setSession(session);
          setUser(session?.user ?? null);
          
          if (session?.user) {
            await loadUserProfile(session.user.id);
          }
          
          setLoading(false);
          setInitialized(true);
        }
      } catch (error) {
        console.error('Failed to initialize auth:', error);
        if (mounted) {
          setLoading(false);
          setInitialized(true);
        }
      }
    };

    initializeAuth();

    // Listen for auth state changes
    const { data: { subscription } } = authService.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        console.log('Auth state changed:', event, session?.user?.id);
        
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          await loadUserProfile(session.user.id);
        } else {
          setProfile(null);
        }
        
        setLoading(false);

        // Handle routing based on auth events
        handleAuthRouting(event, session);
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleAuthRouting = (event, session) => {
    if (typeof window === 'undefined') return;

    switch (event) {
      case 'SIGNED_IN':
        const redirectTo = sessionStorage.getItem('redirectAfterLogin') || '/dashboard';
        sessionStorage.removeItem('redirectAfterLogin');
        if (router.pathname.startsWith('/auth/')) {
          router.push(redirectTo);
        }
        break;
      
      case 'SIGNED_OUT':
        if (!router.pathname.startsWith('/auth/') && router.pathname !== '/') {
          router.push('/auth/login');
        }
        break;
      
      case 'TOKEN_REFRESHED':
        // Session refreshed successfully
        break;
      
      case 'USER_UPDATED':
        // User metadata updated
        break;
    }
  };

  const loadUserProfile = async (userId) => {
    try {
      const profile = await authService.getUserProfile(userId);
      setProfile(profile);
    } catch (error) {
      console.error('Failed to load user profile:', error);
    }
  };

  const signIn = async (email, password, remember = false) => {
    try {
      const result = await authService.signInWithPassword({ email, password, remember });
      
      if (!result.success) {
        toast.error(result.error || 'ログインに失敗しました');
        return false;
      }
      
      toast.success('ログインしました');
      return true;
    } catch (error) {
      toast.error('ログインに失敗しました');
      return false;
    }
  };

  const signUp = async (userData) => {
    try {
      const result = await authService.signUp(userData);
      
      if (!result.success) {
        toast.error(result.error || '登録に失敗しました');
        return false;
      }
      
      if (result.data?.needsVerification) {
        toast.success('確認メールを送信しました。メールを確認してアカウントを有効化してください。');
      } else {
        toast.success('アカウントを作成しました');
      }
      
      return true;
    } catch (error) {
      toast.error('登録に失敗しました');
      return false;
    }
  };

  const signOut = async () => {
    try {
      const result = await authService.signOut();
      if (result.success) {
        toast.success('ログアウトしました');
      } else {
        toast.error('ログアウトに失敗しました');
      }
    } catch (error) {
      toast.error('ログアウトに失敗しました');
    }
  };

  const resetPassword = async (email) => {
    try {
      const result = await authService.resetPassword(email);
      
      if (!result.success) {
        toast.error(result.error || 'リセットに失敗しました');
        return false;
      }
      
      toast.success('パスワードリセットメールを送信しました');
      return true;
    } catch (error) {
      toast.error('リセットに失敗しました');
      return false;
    }
  };

  const updatePassword = async (newPassword) => {
    try {
      const result = await authService.updatePassword(newPassword);
      
      if (!result.success) {
        toast.error(result.error || 'パスワード更新に失敗しました');
        return false;
      }
      
      toast.success('パスワードを更新しました');
      return true;
    } catch (error) {
      toast.error('パスワード更新に失敗しました');
      return false;
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await loadUserProfile(user.id);
    }
  };

  const refreshSession = async () => {
    try {
      const result = await authService.refreshSession();
      return result.success;
    } catch (error) {
      console.error('Session refresh failed:', error);
      return false;
    }
  };

  // Check if user has specific role
  const hasRole = (requiredRole) => {
    if (!profile) return false;
    
    const roleHierarchy = {
      'customer': 1,
      'staff': 2,
      'admin': 3,
      'super_admin': 4
    };
    
    return roleHierarchy[profile.role] >= roleHierarchy[requiredRole];
  };

  const value = {
    user,
    profile,
    session,
    loading,
    initialized,
    signIn,
    signUp,
    signOut,
    resetPassword,
    updatePassword,
    refreshProfile,
    refreshSession,
    hasRole,
    isAuthenticated: !!user,
    isAdmin: profile?.role === 'admin' || profile?.role === 'super_admin',
    isStaff: profile?.role === 'staff' || profile?.role === 'admin' || profile?.role === 'super_admin'
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// HOC for pages that require authentication
export function withAuth(Component) {
  return function AuthenticatedComponent(props) {
    const { user, loading, initialized } = useAuth();
    const router = useRouter();

    useEffect(() => {
      if (initialized && !loading && !user) {
        sessionStorage.setItem('redirectAfterLogin', router.asPath);
        router.push('/auth/login');
      }
    }, [user, loading, initialized, router]);

    if (!initialized || loading) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
        </div>
      );
    }

    if (!user) {
      return null; // Will redirect
    }

    return <Component {...props} />;
  };
}

// HOC for admin-only pages
export function withAdminAuth(Component) {
  return function AdminComponent(props) {
    const { user, profile, loading, initialized } = useAuth();
    const router = useRouter();

    useEffect(() => {
      if (initialized && !loading) {
        if (!user) {
          router.push('/auth/login');
        } else if (profile && !['admin', 'super_admin'].includes(profile.role)) {
          router.push('/unauthorized');
        }
      }
    }, [user, profile, loading, initialized, router]);

    if (!initialized || loading || !user || !profile) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
        </div>
      );
    }

    if (!['admin', 'super_admin'].includes(profile.role)) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">アクセス権限がありません</h1>
            <p className="text-gray-600 mb-6">このページにアクセスする権限がありません。</p>
            <button
              onClick={() => router.back()}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              戻る
            </button>
          </div>
        </div>
      );
    }

    return <Component {...props} />;
  };
}

// Hook for role-based access control
export function useRoleGuard() {
  const { profile, hasRole } = useAuth();

  const canAccess = (requiredRole) => {
    return hasRole(requiredRole);
  };

  const requireRole = (requiredRole, fallback) => {
    if (!hasRole(requiredRole)) {
      if (typeof fallback === 'function') {
        fallback();
      } else if (typeof fallback === 'string') {
        toast.error(fallback);
      } else {
        toast.error('この操作を実行する権限がありません');
      }
      return false;
    }
    return true;
  };

  return {
    userRole: profile?.role,
    canAccess,
    requireRole,
    isCustomer: profile?.role === 'customer',
    isStaff: hasRole('staff'),
    isAdmin: hasRole('admin'),
    isSuperAdmin: profile?.role === 'super_admin'
  };
}

export default useAuth;