/**
 * Login Page
 * Main login page with complete authentication flow
 */

import React from 'react';
import { withAuth } from '../../hooks/useAuth.js';
import LoginForm from '../../components/auth/LoginForm.jsx';

const LoginPage = () => {
  return (
    <div>
      <LoginForm />
    </div>
  );
};

// Don't require auth for login page, but redirect if already logged in
export default function Login() {
  return <LoginPage />;
}