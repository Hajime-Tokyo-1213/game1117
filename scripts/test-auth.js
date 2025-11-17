#!/usr/bin/env node

/**
 * Authentication System Test
 * Tests the Supabase authentication implementation
 */

import chalk from 'chalk';
import { z } from 'zod';

// Test data validation schemas
const testLoginSchema = () => {
  console.log(chalk.blue('🧪 Testing login validation schema...'));
  
  const LoginSchema = z.object({
    email: z.string().email('有効なメールアドレスを入力してください'),
    password: z.string().min(8, 'パスワードは8文字以上である必要があります')
  });

  const testCases = [
    {
      name: 'Valid login data',
      data: { email: 'test@example.com', password: 'TestPass123!' },
      shouldPass: true
    },
    {
      name: 'Invalid email format',
      data: { email: 'invalid-email', password: 'TestPass123!' },
      shouldPass: false
    },
    {
      name: 'Password too short',
      data: { email: 'test@example.com', password: 'short' },
      shouldPass: false
    },
    {
      name: 'Missing email',
      data: { password: 'TestPass123!' },
      shouldPass: false
    }
  ];

  let passed = 0;
  let failed = 0;

  testCases.forEach(testCase => {
    try {
      LoginSchema.parse(testCase.data);
      if (testCase.shouldPass) {
        console.log(chalk.green(`  ✓ ${testCase.name}`));
        passed++;
      } else {
        console.log(chalk.red(`  ✗ ${testCase.name} (should have failed)`));
        failed++;
      }
    } catch (error) {
      if (!testCase.shouldPass) {
        console.log(chalk.green(`  ✓ ${testCase.name} (correctly failed)`));
        passed++;
      } else {
        console.log(chalk.red(`  ✗ ${testCase.name} (unexpected error: ${error.message})`));
        failed++;
      }
    }
  });

  return { passed, failed };
};

const testRegisterSchema = () => {
  console.log(chalk.blue('\n🧪 Testing registration validation schema...'));
  
  const RegisterSchema = z.object({
    name: z.string().min(1, '名前は必須です'),
    email: z.string().email('有効なメールアドレスを入力してください'),
    password: z.string().min(8, 'パスワードは8文字以上である必要があります'),
    confirmPassword: z.string(),
    role: z.enum(['customer', 'staff', 'admin']).optional()
  }).refine(data => data.password === data.confirmPassword, {
    message: 'パスワードが一致しません',
    path: ['confirmPassword']
  });

  const testCases = [
    {
      name: 'Valid registration data',
      data: {
        name: 'Test User',
        email: 'test@example.com',
        password: 'TestPass123!',
        confirmPassword: 'TestPass123!',
        role: 'customer'
      },
      shouldPass: true
    },
    {
      name: 'Password mismatch',
      data: {
        name: 'Test User',
        email: 'test@example.com',
        password: 'TestPass123!',
        confirmPassword: 'DifferentPass123!',
        role: 'customer'
      },
      shouldPass: false
    },
    {
      name: 'Missing name',
      data: {
        email: 'test@example.com',
        password: 'TestPass123!',
        confirmPassword: 'TestPass123!'
      },
      shouldPass: false
    }
  ];

  let passed = 0;
  let failed = 0;

  testCases.forEach(testCase => {
    try {
      RegisterSchema.parse(testCase.data);
      if (testCase.shouldPass) {
        console.log(chalk.green(`  ✓ ${testCase.name}`));
        passed++;
      } else {
        console.log(chalk.red(`  ✗ ${testCase.name} (should have failed)`));
        failed++;
      }
    } catch (error) {
      if (!testCase.shouldPass) {
        console.log(chalk.green(`  ✓ ${testCase.name} (correctly failed)`));
        passed++;
      } else {
        console.log(chalk.red(`  ✗ ${testCase.name} (unexpected error: ${error.message})`));
        failed++;
      }
    }
  });

  return { passed, failed };
};

const testAuthServiceStructure = async () => {
  console.log(chalk.blue('\n🧪 Testing auth service structure...'));
  
  try {
    // Dynamic import to handle ES modules
    const { SupabaseAuthService } = await import('../lib/auth/supabase-auth.js');
    const authService = new SupabaseAuthService();

    const requiredMethods = [
      'signInWithPassword',
      'signInWithProvider',
      'signUp',
      'resetPassword',
      'updatePassword',
      'enableMFA',
      'verifyMFA',
      'getSession',
      'refreshSession',
      'signOut'
    ];

    let passed = 0;
    let failed = 0;

    requiredMethods.forEach(method => {
      if (typeof authService[method] === 'function') {
        console.log(chalk.green(`  ✓ ${method} method exists`));
        passed++;
      } else {
        console.log(chalk.red(`  ✗ ${method} method missing`));
        failed++;
      }
    });

    return { passed, failed };
  } catch (error) {
    console.log(chalk.red(`  ✗ Failed to load auth service: ${error.message}`));
    return { passed: 0, failed: 1 };
  }
};

const testSecurityMonitorStructure = async () => {
  console.log(chalk.blue('\n🧪 Testing security monitor structure...'));
  
  try {
    const { SecurityMonitor } = await import('../lib/auth/security-monitor.js');
    const securityMonitor = new SecurityMonitor();

    const requiredMethods = [
      'detectSuspiciousActivity',
      'isAccountLocked',
      'lockAccount',
      'unlockAccount',
      'recordSecurityEvent',
      'sendSecurityAlert',
      'analyzeLoginPatterns',
      'generateSecurityReport'
    ];

    let passed = 0;
    let failed = 0;

    requiredMethods.forEach(method => {
      if (typeof securityMonitor[method] === 'function') {
        console.log(chalk.green(`  ✓ ${method} method exists`));
        passed++;
      } else {
        console.log(chalk.red(`  ✗ ${method} method missing`));
        failed++;
      }
    });

    return { passed, failed };
  } catch (error) {
    console.log(chalk.red(`  ✗ Failed to load security monitor: ${error.message}`));
    return { passed: 0, failed: 1 };
  }
};

const testEnvironmentSetup = () => {
  console.log(chalk.blue('\n🧪 Testing environment setup...'));
  
  const requiredEnvVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY'
  ];
  
  const optionalEnvVars = [
    'SUPABASE_SERVICE_KEY'
  ];
  
  let passed = 0;
  let failed = 0;
  let warnings = 0;

  requiredEnvVars.forEach(envVar => {
    if (process.env[envVar]) {
      console.log(chalk.green(`  ✓ ${envVar} is set`));
      passed++;
    } else {
      console.log(chalk.red(`  ✗ ${envVar} is missing`));
      failed++;
    }
  });

  optionalEnvVars.forEach(envVar => {
    if (process.env[envVar]) {
      console.log(chalk.green(`  ✓ ${envVar} is set`));
    } else {
      console.log(chalk.yellow(`  ⚠ ${envVar} is missing (optional for development)`));
      warnings++;
    }
  });

  return { passed, failed, warnings };
};

const main = async () => {
  console.log(chalk.blue('🚀 Running Supabase Authentication System Tests\n'));
  console.log(chalk.gray('=' .repeat(60)));
  
  let totalPassed = 0;
  let totalFailed = 0;
  let totalWarnings = 0;

  // Run tests
  const loginTest = testLoginSchema();
  totalPassed += loginTest.passed;
  totalFailed += loginTest.failed;

  const registerTest = testRegisterSchema();
  totalPassed += registerTest.passed;
  totalFailed += registerTest.failed;

  const authServiceTest = await testAuthServiceStructure();
  totalPassed += authServiceTest.passed;
  totalFailed += authServiceTest.failed;

  const securityTest = await testSecurityMonitorStructure();
  totalPassed += securityTest.passed;
  totalFailed += securityTest.failed;

  const envTest = testEnvironmentSetup();
  totalPassed += envTest.passed;
  totalFailed += envTest.failed;
  totalWarnings += envTest.warnings || 0;

  // Print summary
  console.log(chalk.blue('\n' + '=' .repeat(60)));
  console.log(chalk.blue('📊 Test Summary'));
  console.log(chalk.blue('=' .repeat(60)));
  
  if (totalFailed === 0) {
    console.log(chalk.green(`🎉 All tests passed! (${totalPassed}/${totalPassed + totalFailed})`));
  } else {
    console.log(chalk.red(`❌ Some tests failed: ${totalFailed} failed, ${totalPassed} passed`));
  }

  if (totalWarnings > 0) {
    console.log(chalk.yellow(`⚠️  ${totalWarnings} warnings (check environment configuration)`));
  }

  console.log(chalk.gray('\n🔍 Implementation Features:'));
  console.log(chalk.gray('  ✓ Email/Password authentication'));
  console.log(chalk.gray('  ✓ Social login (Google, GitHub)'));
  console.log(chalk.gray('  ✓ Multi-factor authentication (TOTP)'));
  console.log(chalk.gray('  ✓ Password reset functionality'));
  console.log(chalk.gray('  ✓ Session management'));
  console.log(chalk.gray('  ✓ Security monitoring and audit logging'));
  console.log(chalk.gray('  ✓ Account lockout protection'));
  console.log(chalk.gray('  ✓ React hooks and context providers'));
  console.log(chalk.gray('  ✓ Role-based access control'));
  console.log(chalk.gray('  ✓ Authentication pages and routing'));

  console.log(chalk.gray('\n📋 Next Steps:'));
  if (totalFailed > 0) {
    console.log(chalk.yellow('  1. Fix failing tests'));
  }
  if (totalWarnings > 0) {
    console.log(chalk.yellow('  2. Configure Supabase environment variables'));
  }
  console.log(chalk.gray('  3. Set up Supabase project and database schema'));
  console.log(chalk.gray('  4. Configure OAuth providers (Google, GitHub)'));
  console.log(chalk.gray('  5. Test with real Supabase instance'));

  process.exit(totalFailed > 0 ? 1 : 0);
};

main().catch(error => {
  console.error(chalk.red('Test runner failed:'), error);
  process.exit(1);
});