/**
 * Authentication Callback Page
 * Handles OAuth callbacks and redirects
 */

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { authService } from '../../lib/auth/supabase-auth.js';

export default function AuthCallback() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const router = useRouter();

  useEffect(() => {
    handleCallback();
  }, []);

  const handleCallback = async () => {
    try {
      // Get the session from the URL fragments
      const { data, error } = await authService.supabase.auth.getSession();
      
      if (error) {
        throw error;
      }

      if (data.session) {
        // Successful authentication
        const redirectTo = sessionStorage.getItem('redirectAfterLogin') || '/dashboard';
        sessionStorage.removeItem('redirectAfterLogin');
        router.push(redirectTo);
      } else {
        // No session found
        throw new Error('認証に失敗しました');
      }
    } catch (error) {
      console.error('Auth callback error:', error);
      setError(error.message);
      
      // Redirect to login page after 3 seconds
      setTimeout(() => {
        router.push('/auth/login');
      }, 3000);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <h2 className="mt-4 text-xl font-semibold text-gray-900">
            認証中...
          </h2>
          <p className="mt-2 text-gray-600">
            しばらくお待ちください
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
            <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="mt-4 text-xl font-semibold text-gray-900">
            認証エラー
          </h2>
          <p className="mt-2 text-gray-600 max-w-md">
            {error}
          </p>
          <p className="mt-2 text-sm text-gray-500">
            3秒後にログインページにリダイレクトします...
          </p>
          <div className="mt-6">
            <button
              onClick={() => router.push('/auth/login')}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              ログインページへ
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}