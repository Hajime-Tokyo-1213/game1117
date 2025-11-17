/**
 * Security Monitor and Audit System
 * Advanced security monitoring, threat detection, and audit logging
 */

import { createClient } from '@supabase/supabase-js';
import toast from 'react-hot-toast';

export class SecurityMonitor {
  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );
    
    this.maxFailedAttempts = 5;
    this.lockoutDuration = 15; // minutes
    this.suspiciousActivityThreshold = 10;
  }

  // Detect suspicious login activity
  async detectSuspiciousActivity(email) {
    try {
      const timeWindow = new Date(Date.now() - 15 * 60 * 1000); // 15 minutes ago
      
      const { data: recentAttempts, error } = await this.supabase
        .from('auth_logs')
        .select('*')
        .eq('email', email)
        .eq('success', false)
        .gte('created_at', timeWindow.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      const failedAttempts = recentAttempts?.length || 0;
      
      // Check for rapid successive attempts from different IPs
      const uniqueIPs = new Set(recentAttempts?.map(attempt => attempt.ip_address));
      const multipleIPAttempts = uniqueIPs.size > 1 && failedAttempts > 3;

      return {
        isSuspicious: failedAttempts >= this.maxFailedAttempts || multipleIPAttempts,
        failedAttempts,
        multipleIPs: multipleIPAttempts,
        shouldLock: failedAttempts >= this.maxFailedAttempts
      };
    } catch (error) {
      console.error('Failed to detect suspicious activity:', error);
      return { isSuspicious: false, failedAttempts: 0 };
    }
  }

  // Check if account is locked
  async isAccountLocked(userId) {
    try {
      const { data: user, error } = await this.supabase
        .from('profiles')
        .select('locked, locked_until, locked_reason')
        .eq('id', userId)
        .single();

      if (error || !user) return false;

      if (user.locked) {
        // Check if lock has expired
        if (user.locked_until) {
          const lockExpiry = new Date(user.locked_until);
          if (Date.now() > lockExpiry.getTime()) {
            // Unlock account
            await this.unlockAccount(userId);
            return false;
          }
        }
        return {
          locked: true,
          reason: user.locked_reason,
          until: user.locked_until
        };
      }

      return false;
    } catch (error) {
      console.error('Failed to check account lock status:', error);
      return false;
    }
  }

  // Lock account due to suspicious activity
  async lockAccount(userId, reason, duration = this.lockoutDuration) {
    try {
      const lockUntil = new Date(Date.now() + duration * 60 * 1000);
      
      const { error } = await this.supabase
        .from('profiles')
        .update({
          locked: true,
          locked_reason: reason,
          locked_at: new Date().toISOString(),
          locked_until: lockUntil.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (error) throw error;

      // Record security event
      await this.recordSecurityEvent(userId, 'account_locked', {
        reason,
        duration_minutes: duration,
        locked_until: lockUntil.toISOString()
      });

      return true;
    } catch (error) {
      console.error('Failed to lock account:', error);
      return false;
    }
  }

  // Unlock account
  async unlockAccount(userId) {
    try {
      const { error } = await this.supabase
        .from('profiles')
        .update({
          locked: false,
          locked_reason: null,
          locked_at: null,
          locked_until: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (error) throw error;

      await this.recordSecurityEvent(userId, 'account_unlocked');
      return true;
    } catch (error) {
      console.error('Failed to unlock account:', error);
      return false;
    }
  }

  // Record security event
  async recordSecurityEvent(userId, eventType, details = {}) {
    try {
      const { error } = await this.supabase
        .from('security_events')
        .insert({
          user_id: userId,
          event_type: eventType,
          details,
          ip_address: await this.getClientIP(),
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'server',
          created_at: new Date().toISOString()
        });

      if (error) throw error;
    } catch (error) {
      console.error('Failed to record security event:', error);
    }
  }

  // Send security alert
  async sendSecurityAlert(userId, alertType, details) {
    try {
      const { error } = await this.supabase
        .from('security_alerts')
        .insert({
          user_id: userId,
          alert_type: alertType,
          severity: this.getAlertSeverity(alertType),
          details,
          resolved: false,
          created_at: new Date().toISOString()
        });

      if (error) throw error;

      // In a real application, you would send email/SMS notifications here
      this.notifySecurityTeam(userId, alertType, details);
    } catch (error) {
      console.error('Failed to send security alert:', error);
    }
  }

  // Get alert severity
  getAlertSeverity(alertType) {
    const severityMap = {
      'multiple_failed_logins': 'medium',
      'account_locked': 'high',
      'suspicious_ip': 'medium',
      'password_breach_attempt': 'high',
      'mfa_bypass_attempt': 'critical',
      'privilege_escalation': 'critical',
      'data_export_anomaly': 'high'
    };
    
    return severityMap[alertType] || 'low';
  }

  // Notify security team (placeholder)
  async notifySecurityTeam(userId, alertType, details) {
    // This would integrate with your notification system
    console.log(`🚨 Security Alert: ${alertType} for user ${userId}`, details);
    
    // Show toast notification for demo purposes
    if (typeof window !== 'undefined') {
      toast.error(`セキュリティアラート: ${this.getAlertMessage(alertType)}`);
    }
  }

  // Get human-readable alert message
  getAlertMessage(alertType) {
    const messages = {
      'multiple_failed_logins': '複数回のログイン失敗が検出されました',
      'account_locked': 'アカウントがロックされました',
      'suspicious_ip': '疑わしいIPアドレスからのアクセスが検出されました',
      'password_breach_attempt': 'パスワード攻撃の可能性が検出されました',
      'mfa_bypass_attempt': '二要素認証の回避試行が検出されました'
    };
    
    return messages[alertType] || '不明なセキュリティイベントが発生しました';
  }

  // Analyze login patterns
  async analyzeLoginPatterns(userId, timeframe = 30) {
    try {
      const startDate = new Date(Date.now() - timeframe * 24 * 60 * 60 * 1000);
      
      const { data: loginHistory, error } = await this.supabase
        .from('auth_logs')
        .select('*')
        .eq('user_id', userId)
        .eq('success', true)
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      const analysis = {
        totalLogins: loginHistory?.length || 0,
        uniqueIPs: new Set(loginHistory?.map(log => log.ip_address)).size,
        uniqueDevices: new Set(loginHistory?.map(log => log.user_agent)).size,
        timePattern: this.analyzeTimePatterns(loginHistory),
        locationPattern: this.analyzeLocationPatterns(loginHistory)
      };

      // Detect anomalies
      if (analysis.uniqueIPs > 5) {
        await this.sendSecurityAlert(userId, 'suspicious_ip', {
          unique_ips: analysis.uniqueIPs,
          timeframe_days: timeframe
        });
      }

      return analysis;
    } catch (error) {
      console.error('Failed to analyze login patterns:', error);
      return null;
    }
  }

  // Analyze time patterns
  analyzeTimePatterns(loginHistory) {
    if (!loginHistory || loginHistory.length === 0) return {};

    const hourCounts = new Array(24).fill(0);
    const dayCounts = new Array(7).fill(0);

    loginHistory.forEach(login => {
      const date = new Date(login.created_at);
      hourCounts[date.getHours()]++;
      dayCounts[date.getDay()]++;
    });

    return {
      mostActiveHour: hourCounts.indexOf(Math.max(...hourCounts)),
      mostActiveDay: dayCounts.indexOf(Math.max(...dayCounts)),
      hourDistribution: hourCounts,
      dayDistribution: dayCounts
    };
  }

  // Analyze location patterns (basic implementation)
  analyzeLocationPatterns(loginHistory) {
    if (!loginHistory || loginHistory.length === 0) return {};

    const ipCounts = {};
    loginHistory.forEach(login => {
      ipCounts[login.ip_address] = (ipCounts[login.ip_address] || 0) + 1;
    });

    const sortedIPs = Object.entries(ipCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5);

    return {
      topIPs: sortedIPs,
      totalUniqueIPs: Object.keys(ipCounts).length
    };
  }

  // Generate security report
  async generateSecurityReport(userId, timeframe = 30) {
    try {
      const endDate = new Date();
      const startDate = new Date(Date.now() - timeframe * 24 * 60 * 60 * 1000);

      // Get security events
      const { data: securityEvents, error: eventsError } = await this.supabase
        .from('security_events')
        .select('*')
        .eq('user_id', userId)
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false });

      if (eventsError) throw eventsError;

      // Get alerts
      const { data: alerts, error: alertsError } = await this.supabase
        .from('security_alerts')
        .select('*')
        .eq('user_id', userId)
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false });

      if (alertsError) throw alertsError;

      // Get login analysis
      const loginAnalysis = await this.analyzeLoginPatterns(userId, timeframe);

      const report = {
        timeframe: { startDate, endDate },
        summary: {
          totalEvents: securityEvents?.length || 0,
          totalAlerts: alerts?.length || 0,
          criticalAlerts: alerts?.filter(a => a.severity === 'critical').length || 0,
          highAlerts: alerts?.filter(a => a.severity === 'high').length || 0
        },
        events: securityEvents || [],
        alerts: alerts || [],
        loginAnalysis,
        recommendations: this.generateRecommendations(securityEvents, alerts, loginAnalysis)
      };

      return report;
    } catch (error) {
      console.error('Failed to generate security report:', error);
      return null;
    }
  }

  // Generate security recommendations
  generateRecommendations(events, alerts, loginAnalysis) {
    const recommendations = [];

    // Check for MFA
    const hasMFA = events?.some(e => e.event_type === 'mfa_enabled');
    if (!hasMFA) {
      recommendations.push({
        type: 'mfa',
        priority: 'high',
        title: '二要素認証を有効にする',
        description: 'アカウントのセキュリティを大幅に向上させるために二要素認証を設定してください。'
      });
    }

    // Check for suspicious login patterns
    if (loginAnalysis?.uniqueIPs > 3) {
      recommendations.push({
        type: 'login_pattern',
        priority: 'medium',
        title: 'ログインパターンの確認',
        description: '複数のIPアドレスからのアクセスが検出されています。不正アクセスがないか確認してください。'
      });
    }

    // Check for recent alerts
    const recentAlerts = alerts?.filter(a => 
      Date.now() - new Date(a.created_at).getTime() < 7 * 24 * 60 * 60 * 1000
    );

    if (recentAlerts?.length > 0) {
      recommendations.push({
        type: 'alerts',
        priority: 'high',
        title: '最近のセキュリティアラートを確認',
        description: '過去7日間にセキュリティアラートが発生しています。詳細を確認してください。'
      });
    }

    return recommendations;
  }

  // Get client IP address
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

  // Cleanup old logs (maintenance function)
  async cleanupOldLogs(retentionDays = 90) {
    try {
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
      
      const { error: logsError } = await this.supabase
        .from('auth_logs')
        .delete()
        .lt('created_at', cutoffDate.toISOString());

      if (logsError) throw logsError;

      const { error: eventsError } = await this.supabase
        .from('security_events')
        .delete()
        .lt('created_at', cutoffDate.toISOString());

      if (eventsError) throw eventsError;

      console.log(`Cleaned up logs older than ${retentionDays} days`);
    } catch (error) {
      console.error('Failed to cleanup old logs:', error);
    }
  }
}

// Singleton instance
export const securityMonitor = new SecurityMonitor();
export default securityMonitor;