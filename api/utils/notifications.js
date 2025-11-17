/**
 * Notification System
 * Handles email, SMS, and in-app notifications for buyback system
 */

import { query } from './database.js';

/**
 * Send notification based on type and recipient
 * @param {Object} notification - Notification details
 * @returns {Promise<boolean>} Success status
 */
export async function sendNotification(notification) {
  try {
    const {
      type,
      recipient_email,
      recipient_phone,
      store_id,
      request_id,
      request_number,
      message,
      new_status,
      customer_notes,
      verification_token,
      template_data = {}
    } = notification;

    console.log(`Sending notification: ${type}`, {
      recipient_email,
      recipient_phone,
      store_id,
      request_number
    });

    switch (type) {
      case 'new_buyback_request':
        return await sendNewRequestNotification({
          store_id,
          request_id,
          request_number,
          message
        });

      case 'buyback_request_confirmation':
        return await sendRequestConfirmation({
          recipient_email,
          request_number,
          verification_token,
          template_data
        });

      case 'buyback_status_update':
        return await sendStatusUpdateNotification({
          recipient_email,
          recipient_phone,
          request_number,
          new_status,
          customer_notes,
          template_data
        });

      case 'staff_assignment':
        return await sendStaffAssignmentNotification({
          staff_id: template_data.staff_id,
          request_number,
          request_id
        });

      case 'appraisal_completed':
        return await sendAppraisalNotification({
          recipient_email,
          request_number,
          total_value: template_data.total_value,
          items: template_data.items
        });

      case 'pickup_reminder':
        return await sendPickupReminder({
          recipient_email,
          recipient_phone,
          request_number,
          pickup_date: template_data.pickup_date,
          store_info: template_data.store_info
        });

      default:
        console.warn(`Unknown notification type: ${type}`);
        return false;
    }
  } catch (error) {
    console.error('Notification sending failed:', error);
    return false;
  }
}

/**
 * Send notification to store staff about new buyback request
 */
async function sendNewRequestNotification({ store_id, request_id, request_number, message }) {
  try {
    // Get store staff emails
    const { rows: staffList } = await query(`
      SELECT 
        u.email,
        u.raw_user_meta_data->>'name' as name
      FROM auth.users u
      WHERE 
        u.raw_user_meta_data->>'store_id' = $1
        AND u.raw_user_meta_data->>'role' IN ('store_staff', 'store_manager')
        AND u.email IS NOT NULL
    `, [store_id]);

    if (staffList.length === 0) {
      console.warn(`No staff found for store_id: ${store_id}`);
      return false;
    }

    // Get request details
    const { rows: requestDetails } = await query(`
      SELECT 
        br.*,
        s.name as store_name
      FROM buyback_requests br
      LEFT JOIN stores s ON br.preferred_store_id = s.id
      WHERE br.id = $1
    `, [request_id]);

    if (requestDetails.length === 0) {
      console.warn(`Request not found: ${request_id}`);
      return false;
    }

    const request = requestDetails[0];

    // Send email to each staff member
    for (const staff of staffList) {
      await sendEmail({
        to: staff.email,
        subject: `[買取申請] 新しい申請が到着しました - ${request_number}`,
        template: 'new_buyback_request',
        data: {
          staff_name: staff.name,
          request_number,
          customer_name: request.customer_name || '匿名',
          items_count: request.total_items_count,
          estimated_value: request.estimated_total_value,
          store_name: request.store_name,
          priority_level: request.priority_level,
          application_type: request.application_type,
          created_at: request.created_at,
          management_url: `${process.env.FRONTEND_URL}/admin/buyback/${request_id}`
        }
      });
    }

    // Log notification
    await logNotification({
      type: 'new_buyback_request',
      recipients: staffList.map(s => s.email),
      request_id,
      success: true
    });

    return true;
  } catch (error) {
    console.error('Failed to send new request notification:', error);
    return false;
  }
}

/**
 * Send confirmation email to customer
 */
async function sendRequestConfirmation({ recipient_email, request_number, verification_token, template_data }) {
  try {
    if (!recipient_email) {
      console.warn('No recipient email for confirmation');
      return false;
    }

    await sendEmail({
      to: recipient_email,
      subject: `[買取申請] 申請を受け付けました - ${request_number}`,
      template: 'request_confirmation',
      data: {
        request_number,
        verification_token,
        tracking_url: `${process.env.FRONTEND_URL}/track/${request_number}?token=${verification_token}`,
        estimated_timeline: '3-5営業日',
        support_email: process.env.SUPPORT_EMAIL || 'support@gamestore.jp',
        support_phone: process.env.SUPPORT_PHONE || '03-1234-5678',
        ...template_data
      }
    });

    await logNotification({
      type: 'request_confirmation',
      recipients: [recipient_email],
      request_number,
      success: true
    });

    return true;
  } catch (error) {
    console.error('Failed to send confirmation:', error);
    return false;
  }
}

/**
 * Send status update notification to customer
 */
async function sendStatusUpdateNotification({ 
  recipient_email, 
  recipient_phone, 
  request_number, 
  new_status, 
  customer_notes,
  template_data 
}) {
  try {
    const statusMessages = {
      reviewing: {
        subject: '査定を開始いたします',
        message: 'お預かりした商品の査定を開始いたします。結果は2-3営業日以内にご連絡いたします。'
      },
      appraised: {
        subject: '査定が完了いたしました',
        message: '商品の査定が完了いたしました。査定結果をご確認ください。'
      },
      approved: {
        subject: '買取が承認されました',
        message: 'お客様の買取申請が承認されました。お引き取り日程についてご連絡いたします。'
      },
      rejected: {
        subject: 'お取り扱いできませんでした',
        message: '申し訳ございませんが、今回の商品はお取り扱いできませんでした。'
      },
      completed: {
        subject: '買取手続きが完了いたしました',
        message: '買取手続きが正常に完了いたしました。ご利用ありがとうございました。'
      }
    };

    const statusInfo = statusMessages[new_status];
    if (!statusInfo) {
      console.warn(`Unknown status for notification: ${new_status}`);
      return false;
    }

    // Send email notification
    if (recipient_email) {
      await sendEmail({
        to: recipient_email,
        subject: `[買取申請] ${statusInfo.subject} - ${request_number}`,
        template: 'status_update',
        data: {
          request_number,
          status_message: statusInfo.message,
          customer_notes,
          new_status,
          tracking_url: `${process.env.FRONTEND_URL}/track/${request_number}`,
          ...template_data
        }
      });
    }

    // Send SMS notification for important status updates
    if (recipient_phone && ['approved', 'completed'].includes(new_status)) {
      await sendSMS({
        to: recipient_phone,
        message: `【ゲーム買取】${statusInfo.subject}(${request_number}) 詳細: ${process.env.FRONTEND_URL}/track/${request_number}`
      });
    }

    await logNotification({
      type: 'status_update',
      recipients: [recipient_email, recipient_phone].filter(Boolean),
      request_number,
      status: new_status,
      success: true
    });

    return true;
  } catch (error) {
    console.error('Failed to send status update:', error);
    return false;
  }
}

/**
 * Send pickup reminder notification
 */
async function sendPickupReminder({ recipient_email, recipient_phone, request_number, pickup_date, store_info }) {
  try {
    const reminderMessage = `お預かり日のリマインダーです。${pickup_date}にご来店をお待ちしております。`;

    if (recipient_email) {
      await sendEmail({
        to: recipient_email,
        subject: `[買取申請] お引き取り日のご案内 - ${request_number}`,
        template: 'pickup_reminder',
        data: {
          request_number,
          pickup_date,
          store_info,
          reminder_message: reminderMessage
        }
      });
    }

    if (recipient_phone) {
      await sendSMS({
        to: recipient_phone,
        message: `【ゲーム買取】${reminderMessage}(${request_number}) 店舗: ${store_info.name}`
      });
    }

    return true;
  } catch (error) {
    console.error('Failed to send pickup reminder:', error);
    return false;
  }
}

/**
 * Send email using configured email service
 */
async function sendEmail({ to, subject, template, data }) {
  try {
    // In production, integrate with email service (SendGrid, AWS SES, etc.)
    console.log('Sending email:', { to, subject, template, data });

    // Mock email sending for development
    if (process.env.NODE_ENV === 'development') {
      console.log(`📧 Email sent to ${to}: ${subject}`);
      return true;
    }

    // TODO: Implement actual email sending
    // Example with SendGrid:
    // const sgMail = require('@sendgrid/mail');
    // sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    // await sgMail.send({ to, subject, html: renderTemplate(template, data) });

    return true;
  } catch (error) {
    console.error('Email sending failed:', error);
    throw error;
  }
}

/**
 * Send SMS using configured SMS service
 */
async function sendSMS({ to, message }) {
  try {
    // In production, integrate with SMS service (Twilio, AWS SNS, etc.)
    console.log('Sending SMS:', { to, message });

    // Mock SMS sending for development
    if (process.env.NODE_ENV === 'development') {
      console.log(`📱 SMS sent to ${to}: ${message}`);
      return true;
    }

    // TODO: Implement actual SMS sending
    // Example with Twilio:
    // const client = require('twilio')(accountSid, authToken);
    // await client.messages.create({ body: message, from: twilioNumber, to });

    return true;
  } catch (error) {
    console.error('SMS sending failed:', error);
    throw error;
  }
}

/**
 * Log notification for audit trail
 */
async function logNotification({ type, recipients, request_number, request_id, status, success, error_message }) {
  try {
    await query(`
      INSERT INTO notification_logs (
        type, recipients, request_number, request_id, 
        status, success, error_message, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    `, [
      type,
      JSON.stringify(recipients),
      request_number || null,
      request_id || null,
      status || null,
      success,
      error_message || null
    ]);
  } catch (error) {
    console.error('Failed to log notification:', error);
  }
}

/**
 * Get notification templates for different types
 */
export function getNotificationTemplates() {
  return {
    new_buyback_request: {
      subject: '[買取申請] 新しい申請が到着しました',
      variables: ['staff_name', 'request_number', 'customer_name', 'items_count']
    },
    request_confirmation: {
      subject: '[買取申請] 申請を受け付けました',
      variables: ['request_number', 'tracking_url', 'estimated_timeline']
    },
    status_update: {
      subject: '[買取申請] ステータスが更新されました',
      variables: ['request_number', 'status_message', 'new_status']
    },
    pickup_reminder: {
      subject: '[買取申請] お引き取り日のご案内',
      variables: ['request_number', 'pickup_date', 'store_info']
    }
  };
}

/**
 * Schedule notification for later delivery
 */
export async function scheduleNotification(notification, deliveryDate) {
  try {
    await query(`
      INSERT INTO scheduled_notifications (
        type, notification_data, scheduled_for, created_at
      ) VALUES ($1, $2, $3, NOW())
    `, [
      notification.type,
      JSON.stringify(notification),
      deliveryDate
    ]);

    console.log(`Notification scheduled for ${deliveryDate}:`, notification.type);
    return true;
  } catch (error) {
    console.error('Failed to schedule notification:', error);
    return false;
  }
}

export default {
  sendNotification,
  getNotificationTemplates,
  scheduleNotification
};