/**
 * Jest Test Setup
 * Global configuration for test environment
 */

import { jest } from '@jest/globals';

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.SUPPORT_EMAIL = 'support@test.com';
process.env.SUPPORT_PHONE = '03-1234-5678';

// Mock DOM APIs for React components
Object.defineProperty(window, 'URL', {
  value: {
    createObjectURL: jest.fn(() => 'mock-url'),
    revokeObjectURL: jest.fn()
  }
});

// Mock navigator
Object.defineProperty(window, 'navigator', {
  value: {
    userAgent: 'jest-test-runner'
  }
});

// Global test utilities
global.mockSupabaseResponse = (data, error = null, count = null) => ({
  data,
  error,
  count
});

global.mockSupabaseError = (message) => ({
  data: null,
  error: new Error(message),
  count: null
});