/**
 * Buyback Requests API
 * Multi-auth, multi-store buyback management system
 */

import { authMiddleware } from '../utils/middleware.js';
import { query, transaction } from '../utils/database.js';
import { validateAndSanitize, validateBuybackItems } from '../utils/validation.js';
import { sendNotification } from '../utils/notifications.js';
import { uploadFiles } from '../utils/fileUpload.js';
import { generateVerificationToken, checkRateLimit } from '../utils/authVerification.js';

/**
 * Main API Handler
 */
export default async function handler(req, res) {
  // CORS configuration
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    return res.status(200).end();
  }

  switch (req.method) {
    case 'GET':
      return await authMiddleware(getBuybackRequests)(req, res);
    case 'POST':
      return await createBuybackRequest(req, res);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

/**
 * Get buyback requests with filtering and pagination
 * GET /api/buyback
 */
async function getBuybackRequests(req, res) {
  try {
    // Permission check (store staff can only see their store's requests)
    if (!['store_staff', 'store_manager', 'admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ error: '権限がありません' });
    }
    
    const { 
      status,
      store_id,
      email,
      phone,
      request_number,
      priority_level,
      auth_method,
      date_from,
      date_to,
      page = 1,
      limit = 50,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = req.query;
    
    // Build base query
    let sql = `
      SELECT 
        br.id,
        br.request_number,
        br.customer_name,
        br.email,
        br.phone,
        br.status,
        br.priority_level,
        br.total_items_count,
        br.estimated_total_value,
        br.preferred_store_id,
        br.application_type,
        br.auth_method,
        br.created_at,
        br.updated_at,
        br.assigned_staff_id,
        br.reviewed_by,
        br.reviewed_at,
        s.name as store_name,
        staff.raw_user_meta_data->>'name' as staff_name,
        reviewer.raw_user_meta_data->>'name' as reviewer_name,
        (
          SELECT COUNT(*) 
          FROM buyback_appraisals ba 
          WHERE ba.request_id = br.id
        ) as appraisal_count,
        (
          SELECT COALESCE(SUM(ba.appraised_value), 0)
          FROM buyback_appraisals ba 
          WHERE ba.request_id = br.id
        ) as total_appraised_value
      FROM buyback_requests br
      LEFT JOIN stores s ON br.preferred_store_id = s.id
      LEFT JOIN auth.users staff ON br.assigned_staff_id = staff.id
      LEFT JOIN auth.users reviewer ON br.reviewed_by = reviewer.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 0;
    
    // Store access restriction for store staff
    if (['store_staff', 'store_manager'].includes(req.user.role)) {
      paramCount++;
      sql += ` AND br.preferred_store_id = $${paramCount}`;
      params.push(req.user.store_id);
    }
    
    // Apply filters
    if (status) {
      paramCount++;
      sql += ` AND br.status = $${paramCount}`;
      params.push(status);
    }
    
    if (store_id && ['admin', 'super_admin'].includes(req.user.role)) {
      paramCount++;
      sql += ` AND br.preferred_store_id = $${paramCount}`;
      params.push(store_id);
    }
    
    if (email) {
      paramCount++;
      sql += ` AND br.email ILIKE $${paramCount}`;
      params.push(`%${email}%`);
    }
    
    if (phone) {
      paramCount++;
      sql += ` AND br.phone ILIKE $${paramCount}`;
      params.push(`%${phone}%`);
    }
    
    if (request_number) {
      paramCount++;
      sql += ` AND br.request_number ILIKE $${paramCount}`;
      params.push(`%${request_number}%`);
    }
    
    if (priority_level) {
      paramCount++;
      sql += ` AND br.priority_level = $${paramCount}`;
      params.push(priority_level);
    }
    
    if (auth_method) {
      paramCount++;
      sql += ` AND br.auth_method = $${paramCount}`;
      params.push(auth_method);
    }
    
    if (date_from) {
      paramCount++;
      sql += ` AND br.created_at >= $${paramCount}`;
      params.push(date_from);
    }
    
    if (date_to) {
      paramCount++;
      sql += ` AND br.created_at <= $${paramCount}`;
      params.push(date_to + ' 23:59:59');
    }
    
    // Get total count for pagination
    const countSql = sql.replace(
      /SELECT[\s\S]*?FROM/,
      'SELECT COUNT(*) as total FROM'
    );
    const { rows: countResult } = await query(countSql, params);
    const total = parseInt(countResult[0].total);
    
    // Apply sorting and pagination
    const allowedSortFields = [
      'created_at', 'updated_at', 'status', 'priority_level', 
      'estimated_total_value', 'customer_name', 'request_number'
    ];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
    const safeSortOrder = ['ASC', 'DESC'].includes(sortOrder.toUpperCase()) ? 
                         sortOrder.toUpperCase() : 'DESC';
    
    sql += ` ORDER BY br.${safeSortBy} ${safeSortOrder}`;
    sql += ` LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, (page - 1) * limit);
    
    const { rows } = await query(sql, params);
    
    res.json({
      requests: rows,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1
      },
      filters: {
        status,
        store_id,
        email,
        phone,
        request_number,
        priority_level,
        auth_method,
        date_from,
        date_to
      }
    });
    
  } catch (error) {
    console.error('Get buyback requests error:', error);
    res.status(500).json({ 
      error: 'サーバーエラーが発生しました',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * Create new buyback request
 * POST /api/buyback
 */
async function createBuybackRequest(req, res) {
  try {
    const clientIP = req.ip || req.connection?.remoteAddress || 'unknown';
    
    // Rate limiting check
    const rateLimit = await checkRateLimit(clientIP, 'create_request');
    if (rateLimit.isLimited) {
      return res.status(429).json({ 
        error: 'リクエストが多すぎます。しばらく待ってから再試行してください。',
        resetTime: rateLimit.resetTime
      });
    }

    const {
      customer_name,
      email,
      phone,
      address,
      postal_code,
      preferred_contact_method = 'email',
      auth_method = 'guest',
      auth_identifier,
      items_description,
      item_categories = [],
      application_type = 'online',
      preferred_store_id,
      preferred_pickup_date,
      preferred_pickup_time,
      customer_notes,
      priority_level = 'normal'
    } = req.body;
    
    // Validate items first
    const itemsValidation = validateBuybackItems(items_description);
    if (!itemsValidation.isValid) {
      return res.status(400).json({ 
        error: '商品情報に問題があります',
        details: itemsValidation.errors
      });
    }

    // Basic validation
    const validations = {};
    
    // Authentication method specific validation
    if (auth_method === 'email' || preferred_contact_method === 'email') {
      if (!email) {
        return res.status(400).json({ error: 'メールアドレスが必要です' });
      }
      validations.email = validateAndSanitize(email, 'email');
    }
    
    if (auth_method === 'phone' || preferred_contact_method === 'phone') {
      if (!phone) {
        return res.status(400).json({ error: '電話番号が必要です' });
      }
      validations.phone = validateAndSanitize(phone, 'phone');
    }
    
    if (customer_name) {
      validations.customer_name = validateAndSanitize(customer_name, 'name');
    }

    if (address) {
      validations.address = validateAndSanitize(address, 'text', { maxLength: 500 });
    }

    if (postal_code) {
      validations.postal_code = validateAndSanitize(postal_code, 'postal_code');
    }

    // Check validation errors
    const hasErrors = Object.values(validations).some(v => !v.isValid);
    if (hasErrors) {
      const errors = Object.fromEntries(
        Object.entries(validations)
          .filter(([_, v]) => v.error)
          .map(([k, v]) => [k, v.error])
      );
      return res.status(400).json({ error: 'バリデーションエラー', details: errors });
    }

    // Validate store exists and is active
    if (preferred_store_id) {
      const { rows: storeRows } = await query(`
        SELECT id, name, is_active 
        FROM stores 
        WHERE id = $1
      `, [preferred_store_id]);

      if (storeRows.length === 0 || !storeRows[0].is_active) {
        return res.status(400).json({ error: '指定された店舗が見つかりません' });
      }
    }

    // Validate pickup date (must be future date)
    if (preferred_pickup_date) {
      const pickupDate = new Date(preferred_pickup_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (pickupDate < today) {
        return res.status(400).json({ error: '希望お引き取り日は本日以降の日付を指定してください' });
      }
    }
    
    // Handle file uploads (product images)
    let attachment_urls = [];
    if (req.files && req.files.length > 0) {
      try {
        const uploadResult = await uploadFiles(req.files, 'buyback-requests', {
          maxFiles: 10,
          maxSize: 5 * 1024 * 1024 // 5MB per file
        });
        attachment_urls = uploadResult.map(file => file.url);
      } catch (uploadError) {
        console.error('File upload error:', uploadError);
        return res.status(400).json({ 
          error: 'ファイルアップロードに失敗しました',
          details: uploadError.message
        });
      }
    }
    
    // Generate verification token for guest applications
    let verification_token = null;
    if (auth_method === 'guest') {
      verification_token = generateVerificationToken();
    }
    
    // Extract and deduplicate categories
    const extracted_categories = [...new Set([
      ...item_categories,
      ...itemsValidation.items.map(item => item.category).filter(Boolean)
    ])];

    // Calculate estimated total value
    const estimated_total_value = itemsValidation.items.reduce(
      (sum, item) => sum + (item.estimated_value || 0), 
      0
    );
    
    // Use transaction for data consistency
    const result = await transaction(async (client) => {
      // Create buyback request
      const { rows } = await client.query(`
        INSERT INTO buyback_requests (
          customer_name, email, phone, address, postal_code,
          preferred_contact_method, auth_method, auth_identifier,
          verification_token, items_description, item_categories,
          total_items_count, estimated_total_value, application_type, 
          preferred_store_id, preferred_pickup_date, preferred_pickup_time,
          customer_notes, priority_level, attachment_urls,
          ip_address, user_agent, referrer_url
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
          $15, $16, $17, $18, $19, $20, $21, $22, $23
        )
        RETURNING *
      `, [
        validations.customer_name?.value || null,
        validations.email?.value || null,
        validations.phone?.value || null,
        validations.address?.value || null,
        validations.postal_code?.value || null,
        preferred_contact_method,
        auth_method,
        auth_identifier,
        verification_token,
        JSON.stringify(itemsValidation.items),
        extracted_categories,
        itemsValidation.items.length,
        estimated_total_value,
        application_type,
        preferred_store_id,
        preferred_pickup_date || null,
        preferred_pickup_time || null,
        customer_notes || null,
        priority_level,
        attachment_urls,
        clientIP,
        req.get('User-Agent') || null,
        req.get('Referer') || null
      ]);
      
      return rows[0];
    });
    
    // Send notifications (async, don't block response)
    setTimeout(async () => {
      try {
        // Notify store staff
        if (preferred_store_id) {
          await sendNotification({
            type: 'new_buyback_request',
            store_id: preferred_store_id,
            request_id: result.id,
            request_number: result.request_number,
            message: `新しい買取申請（${result.request_number}）が到着しました`
          });
        }
        
        // Send confirmation to customer
        if (validations.email?.value) {
          await sendNotification({
            type: 'buyback_request_confirmation',
            recipient_email: validations.email.value,
            request_number: result.request_number,
            verification_token: verification_token,
            template_data: {
              customer_name: validations.customer_name?.value,
              items_count: itemsValidation.items.length,
              estimated_value: estimated_total_value
            }
          });
        }
      } catch (notificationError) {
        console.error('Notification error:', notificationError);
      }
    }, 100);
    
    res.status(201).json({
      message: '買取申請を受け付けました',
      request: {
        id: result.id,
        request_number: result.request_number,
        status: result.status,
        verification_token: auth_method === 'guest' ? verification_token : undefined,
        tracking_url: `${process.env.FRONTEND_URL || ''}/track/${result.request_number}${
          verification_token ? `?token=${verification_token}` : ''
        }`
      }
    });
    
  } catch (error) {
    console.error('Create buyback request error:', error);
    res.status(500).json({ 
      error: 'サーバーエラーが発生しました',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}