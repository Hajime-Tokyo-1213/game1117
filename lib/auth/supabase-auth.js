/**
 * Supabase Authentication Service
 * Complete authentication system with MFA, social login, and security monitoring
 */

import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import toast from 'react-hot-toast';

// Authentication schemas
const LoginSchema = z.object({
  email: z.string().email('有効なメールアドレスを入力してください'),
  password: z.string().min(8, 'パスワードは8文字以上である必要があります')
});

const RegisterSchema = LoginSchema.extend({
  name: z.string().min(1, '名前は必須です'),
  confirmPassword: z.string(),
  role: z.enum(['customer', 'staff', 'admin']).optional()
}).refine(data => data.password === data.confirmPassword, {
  message: 'パスワードが一致しません',
  path: ['confirmPassword']
});

const ResetPasswordSchema = z.object({
  email: z.string().email('有効なメールアドレスを入力してください')
});

export class SupabaseAuthService {
  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''
    );

    // Admin client for RLS bypass (server-side only)
    this.adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_KEY || '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );
  }

  // Email/Password authentication
  async signInWithPassword(credentials) {
    try {
      // Data validation
      const validatedData = LoginSchema.parse(credentials);

      const { data, error } = await this.supabase.auth.signInWithPassword({
        email: validatedData.email,
        password: validatedData.password
      });

      if (error) {
        // Record login attempt (failure)
        await this.recordLoginAttempt(validatedData.email, false, error.message);
        throw error;
      }

      if (!data.user || !data.session) {
        throw new Error('認証データが不正です');
      }

      // Get user profile
      const profile = await this.getUserProfile(data.user.id);
      
      if (!profile) {
        throw new Error('ユーザープロファイルが見つかりません');
      }

      // Record successful login
      await this.recordLoginAttempt(validatedData.email, true);
      await this.updateLastSignIn(data.user.id);

      // Session persistence settings
      if (credentials.remember) {
        await this.supabase.auth.updateUser({
          data: { remember_me: true }
        });
      }

      return {
        success: true,
        data: {
          user: data.user,
          session: data.session,
          profile
        }
      };

    } catch (error) {
      return {
        success: false,
        error: this.getErrorMessage(error)
      };
    }
  }

  // Social login
  async signInWithProvider(provider) {
    try {
      const { data, error } = await this.supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback`,
          scopes: provider === 'google' ? 'openid email profile' : undefined
        }
      });

      if (error) throw error;

      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: this.getErrorMessage(error)
      };
    }
  }

  // User registration
  async signUp(userData) {
    try {
      // Data validation
      const validatedData = RegisterSchema.parse(userData);

      const { data, error } = await this.supabase.auth.signUp({
        email: validatedData.email,
        password: validatedData.password,
        options: {
          data: {
            name: validatedData.name,
            role: validatedData.role || 'customer',
            ...userData.metadata
          }
        }
      });

      if (error) throw error;

      // Create profile in profiles table
      if (data.user) {
        await this.createUserProfile(data.user.id, {
          email: validatedData.email,
          name: validatedData.name,
          role: validatedData.role || 'customer',
          metadata: userData.metadata || {}
        });
      }

      return {
        success: true,
        data: {
          user: data.user,
          needsVerification: !data.session // Email confirmation needed
        }
      };

    } catch (error) {
      return {
        success: false,
        error: this.getErrorMessage(error)
      };
    }
  }

  // Password reset
  async resetPassword(email) {
    try {
      const validatedData = ResetPasswordSchema.parse({ email });

      const { error } = await this.supabase.auth.resetPasswordForEmail(
        validatedData.email,
        {
          redirectTo: `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/reset-password`
        }
      );

      if (error) throw error;

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: this.getErrorMessage(error)
      };
    }
  }

  // Update password
  async updatePassword(newPassword) {
    try {
      if (newPassword.length < 8) {
        throw new Error('パスワードは8文字以上である必要があります');
      }

      const { error } = await this.supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      // Audit log for password change
      const { data: { user } } = await this.supabase.auth.getUser();
      if (user) {
        await this.recordSecurityEvent(user.id, 'password_changed');
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: this.getErrorMessage(error)
      };
    }
  }

  // Enable MFA
  async enableMFA() {
    try {
      const { data, error } = await this.supabase.auth.mfa.enroll({
        factorType: 'totp'
      });

      if (error) throw error;

      return {
        success: true,
        data: {
          qrCode: data.qr_code,
          secret: data.secret
        }
      };
    } catch (error) {
      return {
        success: false,
        error: this.getErrorMessage(error)
      };
    }
  }

  // Verify MFA
  async verifyMFA(code, challengeId) {
    try {
      const { error } = await this.supabase.auth.mfa.verify({
        factorId: challengeId,
        challengeId,
        code
      });

      if (error) throw error;

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: this.getErrorMessage(error)
      };
    }
  }

  // Session management
  async getSession() {
    const { data: { session } } = await this.supabase.auth.getSession();
    return session;
  }

  async refreshSession() {
    try {
      const { data, error } = await this.supabase.auth.refreshSession();
      
      if (error) throw error;
      
      return {
        success: true,
        data: data.session
      };
    } catch (error) {
      return {
        success: false,
        error: this.getErrorMessage(error)
      };
    }
  }

  // Sign out
  async signOut() {
    try {
      const { error } = await this.supabase.auth.signOut();
      if (error) throw error;
      
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: this.getErrorMessage(error)
      };
    }
  }

  // Private methods
  async getUserProfile(userId) {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !data) return null;
    return data;
  }

  async createUserProfile(userId, profile) {
    await this.supabase
      .from('profiles')
      .insert({
        id: userId,
        ...profile,
        created_at: new Date().toISOString(),
        two_factor_enabled: false,
        email_verified: false
      });
  }

  async updateLastSignIn(userId) {
    await this.supabase
      .from('profiles')
      .update({ 
        last_sign_in: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);
  }

  async recordLoginAttempt(email, success, errorMessage) {
    try {
      await this.supabase
        .from('auth_logs')
        .insert({
          email,
          action: 'login_attempt',
          success,
          error_message: errorMessage,
          ip_address: await this.getClientIP(),
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
          created_at: new Date().toISOString()
        });
    } catch (error) {
      console.error('Failed to record login attempt:', error);
    }
  }

  async recordSecurityEvent(userId, eventType) {
    try {
      await this.supabase
        .from('security_events')
        .insert({
          user_id: userId,
          event_type: eventType,
          ip_address: await this.getClientIP(),
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
          created_at: new Date().toISOString()
        });
    } catch (error) {
      console.error('Failed to record security event:', error);
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

  getErrorMessage(error) {
    if (error.message) return error.message;
    if (typeof error === 'string') return error;
    return '不明なエラーが発生しました';
  }

  // Auth state change listener
  onAuthStateChange(callback) {
    return this.supabase.auth.onAuthStateChange(callback);
  }

  // Get current user
  async getCurrentUser() {
    const { data: { user } } = await this.supabase.auth.getUser();
    return user;
  }
}

// Singleton instance
export const authService = new SupabaseAuthService();
export default authService;