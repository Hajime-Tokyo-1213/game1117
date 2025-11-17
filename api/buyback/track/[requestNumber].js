/**
 * Customer Tracking API
 * Allows customers to track their buyback request status
 */

import { query } from '../../utils/database.js';
import { verifyToken, checkRateLimit } from '../../utils/authVerification.js';
import { validateRequestNumber } from '../../utils/validation.js';

/**
 * Main API Handler for request tracking
 */
export default async function handler(req, res) {
  const { requestNumber } = req.query;
  const { token, email, phone } = req.query;
  
  try {
    // Rate limiting
    const clientIP = req.ip || req.connection?.remoteAddress || 'unknown';
    const rateLimit = await checkRateLimit(clientIP, 'track_request');
    if (rateLimit.isLimited) {
      return res.status(429).json({ 
        error: 'リクエストが多すぎます。しばらく待ってから再試行してください。',
        resetTime: rateLimit.resetTime
      });
    }

    // Validate request number format
    const requestNumberValidation = validateRequestNumber(requestNumber);
    if (!requestNumberValidation.isValid) {
      return res.status(400).json({ 
        error: requestNumberValidation.error
      });
    }

    // Get request details with authentication
    const { rows } = await query(`
      SELECT 
        br.id,
        br.request_number,
        br.status,
        br.priority_level,
        br.customer_name,
        br.total_items_count,
        br.estimated_total_value,
        br.preferred_pickup_date,
        br.preferred_pickup_time,
        br.customer_notes,
        br.communication_history,
        br.created_at,
        br.updated_at,
        br.verification_token,
        br.email,
        br.phone,
        br.auth_method,
        s.name as store_name,
        s.address as store_address,
        s.phone as store_phone,
        s.email as store_email,
        s.opening_hours as store_hours,
        (
          SELECT COALESCE(SUM(ba.appraised_value), 0)
          FROM buyback_appraisals ba 
          WHERE ba.request_id = br.id
        ) as total_appraised_value,
        (
          SELECT COUNT(*)
          FROM buyback_appraisals ba 
          WHERE ba.request_id = br.id
        ) as appraisal_count
      FROM buyback_requests br
      LEFT JOIN stores s ON br.preferred_store_id = s.id
      WHERE br.request_number = $1
    `, [requestNumber]);
    
    if (rows.length === 0) {
      return res.status(404).json({ 
        error: '該当する申請が見つかりません',
        hint: 'Request number format: BR{YYYYMMDD}-{NNNN}'
      });
    }
    
    const request = rows[0];
    
    // Authentication verification
    let authenticated = false;
    
    if (token) {
      // Token-based authentication (for guest users)
      authenticated = verifyToken(token, request.verification_token);
    } else if (email) {
      // Email-based authentication
      authenticated = (email.toLowerCase() === request.email?.toLowerCase());
    } else if (phone) {
      // Phone-based authentication
      authenticated = (phone === request.phone);
    }
    
    if (!authenticated) {
      return res.status(403).json({ 
        error: '認証情報が一致しません',
        hint: 'Please provide a valid verification token, email, or phone number'
      });
    }

    // Parse communication history
    let communicationHistory = [];
    if (request.communication_history) {
      try {
        communicationHistory = JSON.parse(request.communication_history);
        // Filter to customer-visible entries only
        communicationHistory = communicationHistory.filter(entry => 
          entry.type === 'status_change' || entry.type === 'customer_note'
        );
      } catch (parseError) {
        console.warn('Failed to parse communication history:', parseError);
      }
    }
    
    // Progress status mapping
    const statusProgress = {
      draft: { 
        step: 1, 
        label: '下書き', 
        progress: 5,
        description: '申請の準備中です',
        color: 'gray'
      },
      submitted: { 
        step: 2, 
        label: '申請受付', 
        progress: 20,
        description: '申請を受け付けました。確認中です',
        color: 'blue'
      },
      reviewing: { 
        step: 3, 
        label: '査定中', 
        progress: 50,
        description: '商品の査定を行っています',
        color: 'yellow'
      },
      appraised: { 
        step: 4, 
        label: '査定完了', 
        progress: 75,
        description: '査定が完了しました。結果をご確認ください',
        color: 'orange'
      },
      approved: { 
        step: 5, 
        label: '承認済み', 
        progress: 90,
        description: '買取が承認されました。お手続きをお進めください',
        color: 'green'
      },
      completed: { 
        step: 6, 
        label: '取引完了', 
        progress: 100,
        description: '買取手続きが完了いたしました',
        color: 'green'
      },
      rejected: { 
        step: 0, 
        label: 'お取り扱い不可', 
        progress: 0,
        description: '申し訳ございませんが、今回はお取り扱いできませんでした',
        color: 'red'
      },
      cancelled: { 
        step: 0, 
        label: 'キャンセル', 
        progress: 0,
        description: 'お客様によりキャンセルされました',
        color: 'gray'
      }
    };

    // Get appraisal details if status is appraised or later
    let appraisals = [];
    if (['appraised', 'approved', 'completed'].includes(request.status)) {
      const { rows: appraisalRows } = await query(`
        SELECT 
          item_name,
          item_condition,
          market_value,
          appraised_value,
          appraisal_notes,
          created_at
        FROM buyback_appraisals
        WHERE request_id = $1
        ORDER BY created_at ASC
      `, [request.id]);
      
      appraisals = appraisalRows;
    }

    // Calculate estimated completion time
    const getEstimatedCompletion = (status, createdAt) => {
      const created = new Date(createdAt);
      const businessDaysToAdd = {
        submitted: 3,
        reviewing: 2,
        appraised: 1,
        approved: 0
      };
      
      const daysToAdd = businessDaysToAdd[status] || 0;
      const estimated = new Date(created);
      estimated.setDate(estimated.getDate() + daysToAdd);
      
      return estimated;
    };

    // Prepare customer-safe response
    const response = {
      request: {
        id: request.id,
        request_number: request.request_number,
        status: request.status,
        priority_level: request.priority_level,
        customer_name: request.customer_name,
        total_items_count: request.total_items_count,
        estimated_total_value: request.estimated_total_value,
        total_appraised_value: parseFloat(request.total_appraised_value) || 0,
        appraisal_count: parseInt(request.appraisal_count) || 0,
        preferred_pickup_date: request.preferred_pickup_date,
        preferred_pickup_time: request.preferred_pickup_time,
        customer_notes: request.customer_notes,
        created_at: request.created_at,
        updated_at: request.updated_at,
        progress: statusProgress[request.status] || statusProgress.submitted,
        estimated_completion: getEstimatedCompletion(request.status, request.created_at)
      },
      store: request.store_name ? {
        name: request.store_name,
        address: request.store_address,
        phone: request.store_phone,
        email: request.store_email,
        opening_hours: request.store_hours
      } : null,
      appraisals,
      communication_history: communicationHistory,
      timeline: generateTimeline(request.status, request.created_at, request.updated_at),
      next_steps: getNextSteps(request.status, request),
      contact_info: {
        support_email: process.env.SUPPORT_EMAIL || 'support@gamestore.jp',
        support_phone: process.env.SUPPORT_PHONE || '03-1234-5678',
        business_hours: '平日 10:00-18:00'
      }
    };
    
    res.json(response);
    
  } catch (error) {
    console.error('Track request error:', error);
    res.status(500).json({ 
      error: 'サーバーエラーが発生しました',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * Generate timeline for request progress
 * @param {string} currentStatus - Current request status
 * @param {string} createdAt - Request creation timestamp
 * @param {string} updatedAt - Last update timestamp
 * @returns {Array} Timeline array
 */
function generateTimeline(currentStatus, createdAt, updatedAt) {
  const timeline = [];
  const statusOrder = ['submitted', 'reviewing', 'appraised', 'approved', 'completed'];
  const currentIndex = statusOrder.indexOf(currentStatus);

  const statusLabels = {
    submitted: '申請受付',
    reviewing: '査定開始',
    appraised: '査定完了',
    approved: '買取承認',
    completed: '取引完了'
  };

  statusOrder.forEach((status, index) => {
    timeline.push({
      status,
      label: statusLabels[status],
      completed: index <= currentIndex,
      current: index === currentIndex,
      timestamp: index === 0 ? createdAt : (index === currentIndex ? updatedAt : null)
    });
  });

  return timeline;
}

/**
 * Get next steps based on current status
 * @param {string} status - Current status
 * @param {Object} request - Request object
 * @returns {Array} Next steps array
 */
function getNextSteps(status, request) {
  const nextSteps = [];

  switch (status) {
    case 'submitted':
      nextSteps.push({
        action: 'wait',
        title: '査定開始をお待ちください',
        description: 'スタッフが商品の査定を開始します。通常2-3営業日で完了予定です。'
      });
      break;

    case 'reviewing':
      nextSteps.push({
        action: 'wait',
        title: '査定結果をお待ちください',
        description: '商品の査定を行っています。完了次第ご連絡いたします。'
      });
      break;

    case 'appraised':
      nextSteps.push({
        action: 'review',
        title: '査定結果をご確認ください',
        description: '査定が完了しました。金額をご確認いただき、承認をお待ちしております。'
      });
      if (request.total_appraised_value > 0) {
        nextSteps.push({
          action: 'contact',
          title: '承認のご連絡',
          description: '査定金額にご納得いただけましたら、店舗までご連絡ください。'
        });
      }
      break;

    case 'approved':
      nextSteps.push({
        action: 'pickup',
        title: 'お引き取り手続き',
        description: 'ご都合の良い日時に店舗までお越しください。身分証明書をお持ちください。'
      });
      if (request.preferred_pickup_date) {
        nextSteps.push({
          action: 'schedule',
          title: `予定日: ${request.preferred_pickup_date}`,
          description: '予定日の変更をご希望の場合は、事前にご連絡ください。'
        });
      }
      break;

    case 'completed':
      nextSteps.push({
        action: 'complete',
        title: 'お取引完了',
        description: 'ありがとうございました。またのご利用をお待ちしております。'
      });
      break;

    case 'rejected':
      nextSteps.push({
        action: 'contact',
        title: 'お問い合わせ',
        description: 'ご不明な点がございましたら、サポートまでお気軽にお問い合わせください。'
      });
      break;

    case 'cancelled':
      nextSteps.push({
        action: 'reapply',
        title: '再申請',
        description: '再度買取をご希望の場合は、新しい申請を作成してください。'
      });
      break;

    default:
      nextSteps.push({
        action: 'wait',
        title: 'お待ちください',
        description: 'スタッフが確認中です。'
      });
  }

  return nextSteps;
}