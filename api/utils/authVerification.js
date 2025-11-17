/**
 * Authentication Verification Utilities
 * Multi-auth support for buyback system
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { query } from './database.js';

/**
 * Verify customer authentication token
 * @param {string} providedToken - Token provided by customer
 * @param {string} storedToken - Token stored in database
 * @returns {boolean} Verification result
 */
export function verifyToken(providedToken, storedToken) {
  try {
    if (!providedToken || !storedToken) {
      return false;
    }

    // Simple token comparison for guest users
    return crypto.timingSafeEqual(
      Buffer.from(providedToken),
      Buffer.from(storedToken)
    );
  } catch (error) {
    console.error('Token verification error:', error);
    return false;
  }
}

/**
 * Generate verification token for guest users
 * @returns {string} Generated token
 */
export function generateVerificationToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Verify email-based authentication
 * @param {string} email - Email address
 * @param {string} token - Verification token sent to email
 * @returns {Promise<Object>} Verification result
 */
export async function verifyEmailAuth(email, token) {
  try {
    const { rows } = await query(`
      SELECT id, verified_at 
      FROM buyback_requests 
      WHERE email = $1 AND verification_token = $2
      AND created_at > NOW() - INTERVAL '24 hours'
    `, [email, token]);

    if (rows.length === 0) {
      return { 
        verified: false, 
        error: 'Invalid email or verification token' 
      };
    }

    // Mark as verified if not already
    if (!rows[0].verified_at) {
      await query(`
        UPDATE buyback_requests 
        SET verified_at = NOW() 
        WHERE id = $1
      `, [rows[0].id]);
    }

    return { 
      verified: true, 
      requestId: rows[0].id 
    };

  } catch (error) {
    console.error('Email verification error:', error);
    return { 
      verified: false, 
      error: 'Verification failed' 
    };
  }
}

/**
 * Verify phone-based authentication
 * @param {string} phone - Phone number
 * @param {string} code - SMS verification code
 * @returns {Promise<Object>} Verification result
 */
export async function verifyPhoneAuth(phone, code) {
  try {
    // Check SMS verification code (in production, integrate with SMS service)
    const { rows } = await query(`
      SELECT id, verification_data 
      FROM sms_verifications 
      WHERE phone = $1 AND code = $2 
      AND created_at > NOW() - INTERVAL '10 minutes'
      AND used_at IS NULL
    `, [phone, code]);

    if (rows.length === 0) {
      return { 
        verified: false, 
        error: 'Invalid phone number or verification code' 
      };
    }

    // Mark code as used
    await query(`
      UPDATE sms_verifications 
      SET used_at = NOW() 
      WHERE id = $1
    `, [rows[0].id]);

    // Find associated buyback request
    const { rows: requestRows } = await query(`
      SELECT id 
      FROM buyback_requests 
      WHERE phone = $1 AND auth_method = 'phone'
      ORDER BY created_at DESC 
      LIMIT 1
    `, [phone]);

    if (requestRows.length > 0) {
      await query(`
        UPDATE buyback_requests 
        SET verified_at = NOW() 
        WHERE id = $1
      `, [requestRows[0].id]);
    }

    return { 
      verified: true, 
      requestId: requestRows.length > 0 ? requestRows[0].id : null 
    };

  } catch (error) {
    console.error('Phone verification error:', error);
    return { 
      verified: false, 
      error: 'Verification failed' 
    };
  }
}

/**
 * Send SMS verification code
 * @param {string} phone - Phone number
 * @returns {Promise<Object>} Send result
 */
export async function sendSMSVerification(phone) {
  try {
    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store verification code
    await query(`
      INSERT INTO sms_verifications (phone, code, created_at)
      VALUES ($1, $2, NOW())
    `, [phone, code]);

    // Send SMS (mock for development)
    if (process.env.NODE_ENV === 'development') {
      console.log(`SMS Verification Code for ${phone}: ${code}`);
    } else {
      // TODO: Integrate with SMS service (Twilio, AWS SNS, etc.)
      // await sendSMS({ to: phone, message: `認証コード: ${code}` });
    }

    return { 
      success: true, 
      message: 'Verification code sent' 
    };

  } catch (error) {
    console.error('SMS verification send error:', error);
    return { 
      success: false, 
      error: 'Failed to send verification code' 
    };
  }
}

/**
 * Verify social authentication (Google, LINE, etc.)
 * @param {string} provider - Auth provider (google, line, facebook)
 * @param {string} token - Provider access token
 * @returns {Promise<Object>} Verification result
 */
export async function verifySocialAuth(provider, token) {
  try {
    let userInfo = null;

    switch (provider) {
      case 'google':
        userInfo = await verifyGoogleToken(token);
        break;
      case 'line':
        userInfo = await verifyLINEToken(token);
        break;
      case 'facebook':
        userInfo = await verifyFacebookToken(token);
        break;
      default:
        return { 
          verified: false, 
          error: 'Unsupported auth provider' 
        };
    }

    if (!userInfo || !userInfo.id) {
      return { 
        verified: false, 
        error: 'Invalid social auth token' 
      };
    }

    return { 
      verified: true, 
      userInfo,
      authIdentifier: `${provider}:${userInfo.id}`
    };

  } catch (error) {
    console.error('Social auth verification error:', error);
    return { 
      verified: false, 
      error: 'Social authentication failed' 
    };
  }
}

/**
 * Verify Google OAuth token
 * @param {string} token - Google access token
 * @returns {Promise<Object>} User information
 */
async function verifyGoogleToken(token) {
  try {
    // TODO: Implement Google token verification
    // const { OAuth2Client } = require('google-auth-library');
    // const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    // const ticket = await client.verifyIdToken({
    //   idToken: token,
    //   audience: process.env.GOOGLE_CLIENT_ID
    // });
    // const payload = ticket.getPayload();
    // return { id: payload.sub, email: payload.email, name: payload.name };

    // Mock for development
    if (process.env.NODE_ENV === 'development') {
      return {
        id: 'mock_google_id',
        email: 'mock@gmail.com',
        name: 'Mock Google User'
      };
    }

    throw new Error('Google auth not implemented');
  } catch (error) {
    console.error('Google token verification error:', error);
    throw error;
  }
}

/**
 * Verify LINE authentication token
 * @param {string} token - LINE access token
 * @returns {Promise<Object>} User information
 */
async function verifyLINEToken(token) {
  try {
    // TODO: Implement LINE token verification
    // const response = await fetch('https://api.line.me/v2/profile', {
    //   headers: { Authorization: `Bearer ${token}` }
    // });
    // const userInfo = await response.json();
    // return { id: userInfo.userId, name: userInfo.displayName };

    // Mock for development
    if (process.env.NODE_ENV === 'development') {
      return {
        id: 'mock_line_id',
        name: 'Mock LINE User'
      };
    }

    throw new Error('LINE auth not implemented');
  } catch (error) {
    console.error('LINE token verification error:', error);
    throw error;
  }
}

/**
 * Verify Facebook authentication token
 * @param {string} token - Facebook access token
 * @returns {Promise<Object>} User information
 */
async function verifyFacebookToken(token) {
  try {
    // TODO: Implement Facebook token verification
    // const response = await fetch(`https://graph.facebook.com/me?access_token=${token}&fields=id,name,email`);
    // const userInfo = await response.json();
    // return { id: userInfo.id, email: userInfo.email, name: userInfo.name };

    // Mock for development
    if (process.env.NODE_ENV === 'development') {
      return {
        id: 'mock_facebook_id',
        email: 'mock@facebook.com',
        name: 'Mock Facebook User'
      };
    }

    throw new Error('Facebook auth not implemented');
  } catch (error) {
    console.error('Facebook token verification error:', error);
    throw error;
  }
}

/**
 * Generate JWT token for authenticated sessions
 * @param {Object} payload - Token payload
 * @param {string} expiresIn - Token expiration
 * @returns {string} JWT token
 */
export function generateJWT(payload, expiresIn = '24h') {
  try {
    const secret = process.env.JWT_SECRET || 'fallback_secret';
    return jwt.sign(payload, secret, { expiresIn });
  } catch (error) {
    console.error('JWT generation error:', error);
    throw new Error('Token generation failed');
  }
}

/**
 * Verify JWT token
 * @param {string} token - JWT token to verify
 * @returns {Object} Decoded payload or error
 */
export function verifyJWT(token) {
  try {
    const secret = process.env.JWT_SECRET || 'fallback_secret';
    return jwt.verify(token, secret);
  } catch (error) {
    console.error('JWT verification error:', error);
    throw new Error('Invalid or expired token');
  }
}

/**
 * Clean up expired verification codes and tokens
 * @returns {Promise<number>} Number of cleaned records
 */
export async function cleanupExpiredAuth() {
  try {
    const { rows } = await query(`
      WITH deleted AS (
        DELETE FROM sms_verifications 
        WHERE created_at < NOW() - INTERVAL '1 hour'
        RETURNING 1
      )
      SELECT COUNT(*) as count FROM deleted
    `);

    const deletedCount = parseInt(rows[0]?.count || 0);
    
    if (deletedCount > 0) {
      console.log(`Cleaned up ${deletedCount} expired SMS verifications`);
    }

    return deletedCount;
  } catch (error) {
    console.error('Cleanup expired auth error:', error);
    return 0;
  }
}

/**
 * Rate limiting for authentication attempts
 * @param {string} identifier - IP address or email/phone
 * @param {string} action - Action type (login, verify, etc.)
 * @returns {Promise<Object>} Rate limit status
 */
export async function checkRateLimit(identifier, action = 'auth') {
  try {
    const windowMinutes = 15;
    const maxAttempts = action === 'verify' ? 10 : 5;

    const { rows } = await query(`
      SELECT COUNT(*) as attempts
      FROM auth_attempts 
      WHERE identifier = $1 AND action = $2 
      AND created_at > NOW() - INTERVAL '${windowMinutes} minutes'
    `, [identifier, action]);

    const attempts = parseInt(rows[0]?.attempts || 0);
    const remaining = Math.max(0, maxAttempts - attempts);
    const isLimited = attempts >= maxAttempts;

    // Log this attempt
    await query(`
      INSERT INTO auth_attempts (identifier, action, created_at)
      VALUES ($1, $2, NOW())
    `, [identifier, action]);

    return {
      isLimited,
      attempts,
      remaining,
      resetTime: new Date(Date.now() + windowMinutes * 60 * 1000)
    };

  } catch (error) {
    console.error('Rate limit check error:', error);
    return {
      isLimited: false,
      attempts: 0,
      remaining: 5
    };
  }
}

export default {
  verifyToken,
  generateVerificationToken,
  verifyEmailAuth,
  verifyPhoneAuth,
  sendSMSVerification,
  verifySocialAuth,
  generateJWT,
  verifyJWT,
  cleanupExpiredAuth,
  checkRateLimit
};