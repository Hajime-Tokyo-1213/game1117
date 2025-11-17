/**
 * Individual Buyback Request Management API
 * Handles CRUD operations for specific buyback requests
 */

import { authMiddleware } from '../utils/middleware.js';
import { query, transaction } from '../utils/database.js';
import { sendNotification } from '../utils/notifications.js';
import { verifyToken } from '../utils/authVerification.js';
import { validateAndSanitize } from '../utils/validation.js';

/**
 * Main API Handler
 */
export default async function handler(req, res) {
  const { id } = req.query;
  
  if (!id) {
    return res.status(400).json({ error: '買取申請IDが必要です' });
  }
  
  switch (req.method) {
    case 'GET':
      // Authentication not required (token-based auth for customers)
      return await getBuybackRequest(req, res, id);
    case 'PUT':
      return await authMiddleware(updateBuybackRequest)(req, res, id);
    case 'DELETE':
      return await authMiddleware(deleteBuybackRequest)(req, res, id);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

/**
 * Get buyback request details (accessible to both customers and staff)
 * GET /api/buyback/[id]
 */
async function getBuybackRequest(req, res, id) {
  try {
    const { token } = req.query; // Customer authentication token
    
    // Get request details with related information
    let sql = `
      SELECT 
        br.*,
        s.name as store_name,
        s.address as store_address,
        s.phone as store_phone,
        s.email as store_email,
        s.opening_hours as store_hours,
        staff.raw_user_meta_data->>'name' as staff_name,
        staff.email as staff_email,
        reviewer.raw_user_meta_data->>'name' as reviewer_name
      FROM buyback_requests br
      LEFT JOIN stores s ON br.preferred_store_id = s.id
      LEFT JOIN auth.users staff ON br.assigned_staff_id = staff.id
      LEFT JOIN auth.users reviewer ON br.reviewed_by = reviewer.id
      WHERE br.id = $1
    `;
    
    const { rows } = await query(sql, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: '買取申請が見つかりません' });
    }
    
    const request = rows[0];
    
    // Access control
    if (req.user) {
      // Staff/admin access
      const hasStaffAccess = ['store_staff', 'store_manager', 'admin', 'super_admin'].includes(req.user.role);
      const hasStoreAccess = req.user.store_id === request.preferred_store_id || ['admin', 'super_admin'].includes(req.user.role);
      
      if (!hasStaffAccess || (['store_staff', 'store_manager'].includes(req.user.role) && !hasStoreAccess)) {
        return res.status(403).json({ error: 'アクセス権限がありません' });
      }
    } else if (token) {
      // Customer token authentication
      if (!verifyToken(token, request.verification_token)) {
        return res.status(403).json({ error: '認証トークンが無効です' });
      }
      // Hide sensitive information from customers
      delete request.internal_notes;
      delete request.ip_address;
      delete request.user_agent;
      delete request.staff_email;
    } else {
      return res.status(401).json({ error: '認証が必要です' });
    }
    
    // Parse items_description JSON
    if (request.items_description) {
      try {
        request.items_description = JSON.parse(request.items_description);
      } catch (parseError) {
        console.warn('Failed to parse items_description:', parseError);
        request.items_description = [];
      }
    }

    // Parse communication_history JSON
    if (request.communication_history) {
      try {
        request.communication_history = JSON.parse(request.communication_history);
      } catch (parseError) {
        console.warn('Failed to parse communication_history:', parseError);
        request.communication_history = [];
      }
    }
    
    // Get appraisal details
    const { rows: appraisals } = await query(`
      SELECT 
        ba.*,
        appraiser.raw_user_meta_data->>'name' as appraiser_name
      FROM buyback_appraisals ba
      LEFT JOIN auth.users appraiser ON ba.appraiser_id = appraiser.id
      WHERE ba.request_id = $1
      ORDER BY ba.created_at DESC
    `, [id]);
    
    // Calculate totals
    const totalAppraisedValue = appraisals.reduce((sum, appraisal) => 
      sum + (parseFloat(appraisal.appraised_value) || 0), 0
    );

    res.json({
      request: {
        ...request,
        total_appraised_value: totalAppraisedValue
      },
      appraisals,
      status_history: await getStatusHistory(id)
    });
    
  } catch (error) {
    console.error('Get buyback request error:', error);
    res.status(500).json({ 
      error: 'サーバーエラーが発生しました',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * Update buyback request (staff only)
 * PUT /api/buyback/[id]
 */
async function updateBuybackRequest(req, res, id) {
  try {
    // Permission check
    if (!['store_staff', 'store_manager', 'admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ error: '権限がありません' });
    }
    
    const {
      status,
      priority_level,
      assigned_staff_id,
      internal_notes,
      customer_notes,
      estimated_total_value,
      preferred_pickup_date,
      preferred_pickup_time,
      appraisals = [], // Appraisal details array
      communication_note // New communication entry
    } = req.body;
    
    // Validate status
    const validStatuses = [
      'draft', 'submitted', 'reviewing', 'appraised', 
      'approved', 'rejected', 'completed', 'cancelled'
    ];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ 
        error: '無効なステータスです',
        validStatuses
      });
    }
    
    // Validate priority level
    const validPriorities = ['low', 'normal', 'high', 'urgent'];
    if (priority_level && !validPriorities.includes(priority_level)) {
      return res.status(400).json({ 
        error: '無効な優先度です',
        validPriorities
      });
    }

    // Get current request for access control and history
    const { rows: currentRows } = await query(`
      SELECT * FROM buyback_requests WHERE id = $1
    `, [id]);

    if (currentRows.length === 0) {
      return res.status(404).json({ error: '買取申請が見つかりません' });
    }

    const currentRequest = currentRows[0];

    // Store access control for store staff
    if (['store_staff', 'store_manager'].includes(req.user.role)) {
      if (currentRequest.preferred_store_id !== req.user.store_id) {
        return res.status(403).json({ error: '他店舗の申請は編集できません' });
      }
    }
    
    // Use transaction for consistency
    const result = await transaction(async (client) => {
      // Prepare communication history update
      let communicationHistory = [];
      try {
        communicationHistory = JSON.parse(currentRequest.communication_history || '[]');
      } catch (parseError) {
        communicationHistory = [];
      }

      // Add new communication entry
      if (communication_note) {
        communicationHistory.push({
          timestamp: new Date().toISOString(),
          staff_id: req.user.id,
          staff_name: req.user.name || 'スタッフ',
          type: 'note',
          content: communication_note
        });
      }

      // Add status change to communication history
      if (status && status !== currentRequest.status) {
        communicationHistory.push({
          timestamp: new Date().toISOString(),
          staff_id: req.user.id,
          staff_name: req.user.name || 'スタッフ',
          type: 'status_change',
          content: `ステータスを「${currentRequest.status}」から「${status}」に変更`,
          old_status: currentRequest.status,
          new_status: status
        });
      }
      
      // Update buyback request
      const { rows } = await client.query(`
        UPDATE buyback_requests 
        SET 
          status = COALESCE($2, status),
          priority_level = COALESCE($3, priority_level),
          assigned_staff_id = COALESCE($4, assigned_staff_id),
          internal_notes = COALESCE($5, internal_notes),
          customer_notes = COALESCE($6, customer_notes),
          estimated_total_value = COALESCE($7, estimated_total_value),
          preferred_pickup_date = COALESCE($8::DATE, preferred_pickup_date),
          preferred_pickup_time = COALESCE($9::TIME, preferred_pickup_time),
          communication_history = $10,
          reviewed_by = CASE 
            WHEN $2 IN ('approved', 'rejected', 'completed') THEN $11
            ELSE reviewed_by
          END,
          reviewed_at = CASE 
            WHEN $2 IN ('approved', 'rejected', 'completed') THEN NOW()
            ELSE reviewed_at
          END,
          updated_at = NOW()
        WHERE id = $1 
        RETURNING *
      `, [
        id, status, priority_level, assigned_staff_id,
        internal_notes, customer_notes, estimated_total_value,
        preferred_pickup_date, preferred_pickup_time, 
        JSON.stringify(communicationHistory), req.user.id
      ]);
      
      if (rows.length === 0) {
        throw new Error('買取申請が見つかりません');
      }
      
      const updatedRequest = rows[0];
      
      // Update appraisals if provided
      if (appraisals.length > 0) {
        // Delete existing appraisals
        await client.query('DELETE FROM buyback_appraisals WHERE request_id = $1', [id]);
        
        // Insert new appraisals
        for (const appraisal of appraisals) {
          const validation = {
            item_name: validateAndSanitize(appraisal.item_name, 'required'),
            item_condition: validateAndSanitize(appraisal.item_condition, 'choice', {
              choices: ['S', 'A', 'B', 'C', 'D', 'JUNK']
            }),
            market_value: validateAndSanitize(appraisal.market_value, 'number', { min: 0 }),
            appraised_value: validateAndSanitize(appraisal.appraised_value, 'number', { min: 0 }),
            appraisal_notes: validateAndSanitize(appraisal.appraisal_notes, 'text', { maxLength: 1000 })
          };

          // Check for validation errors
          const hasValidationErrors = Object.values(validation).some(v => !v.isValid);
          if (hasValidationErrors) {
            throw new Error('査定情報に不正な値が含まれています');
          }

          await client.query(`
            INSERT INTO buyback_appraisals (
              request_id, item_name, item_condition,
              market_value, appraised_value, appraisal_notes,
              appraiser_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [
            id,
            validation.item_name.value,
            validation.item_condition.value || 'B',
            validation.market_value.value || 0,
            validation.appraised_value.value || 0,
            validation.appraisal_notes.value || '',
            req.user.id
          ]);
        }

        // Add appraisal completion to communication history
        const totalAppraisedValue = appraisals.reduce((sum, a) => sum + (parseFloat(a.appraised_value) || 0), 0);
        communicationHistory.push({
          timestamp: new Date().toISOString(),
          staff_id: req.user.id,
          staff_name: req.user.name || 'スタッフ',
          type: 'appraisal_completed',
          content: `査定を完了しました（合計: ¥${totalAppraisedValue.toLocaleString()}）`,
          appraisal_count: appraisals.length,
          total_value: totalAppraisedValue
        });

        // Update communication history with appraisal info
        await client.query(`
          UPDATE buyback_requests 
          SET communication_history = $1
          WHERE id = $2
        `, [JSON.stringify(communicationHistory), id]);
      }
      
      return updatedRequest;
    });
    
    // Send status change notifications (async)
    setTimeout(async () => {
      try {
        if (status && ['reviewing', 'appraised', 'approved', 'rejected', 'completed'].includes(status)) {
          await sendNotification({
            type: 'buyback_status_update',
            recipient_email: result.email,
            recipient_phone: result.phone,
            request_number: result.request_number,
            new_status: status,
            customer_notes: customer_notes,
            template_data: {
              customer_name: result.customer_name,
              store_name: req.user.store_name
            }
          });
        }

        // Send staff assignment notification
        if (assigned_staff_id && assigned_staff_id !== currentRequest.assigned_staff_id) {
          await sendNotification({
            type: 'staff_assignment',
            template_data: {
              staff_id: assigned_staff_id,
              request_number: result.request_number,
              request_id: id
            }
          });
        }

        // Send appraisal completion notification
        if (appraisals.length > 0) {
          const totalValue = appraisals.reduce((sum, a) => sum + (parseFloat(a.appraised_value) || 0), 0);
          await sendNotification({
            type: 'appraisal_completed',
            recipient_email: result.email,
            request_number: result.request_number,
            template_data: {
              total_value: totalValue,
              items: appraisals
            }
          });
        }
      } catch (notificationError) {
        console.error('Notification error:', notificationError);
      }
    }, 100);
    
    res.json({
      message: '買取申請を更新しました',
      request: result
    });
    
  } catch (error) {
    console.error('Update buyback request error:', error);
    res.status(500).json({ 
      error: 'サーバーエラーが発生しました',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * Delete buyback request (admin only)
 * DELETE /api/buyback/[id]
 */
async function deleteBuybackRequest(req, res, id) {
  try {
    // Only admins can delete requests
    if (!['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ error: '削除権限がありません' });
    }
    
    // Get request details before deletion
    const { rows: requestRows } = await query(`
      SELECT request_number, customer_name, status 
      FROM buyback_requests 
      WHERE id = $1
    `, [id]);

    if (requestRows.length === 0) {
      return res.status(404).json({ error: '買取申請が見つかりません' });
    }

    const request = requestRows[0];

    // Prevent deletion of completed requests
    if (request.status === 'completed') {
      return res.status(400).json({ error: '完了済みの申請は削除できません' });
    }
    
    // Delete request and related data (CASCADE will handle appraisals)
    const { rows } = await query(`
      DELETE FROM buyback_requests 
      WHERE id = $1 
      RETURNING request_number
    `, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: '買取申請が見つかりません' });
    }
    
    res.json({
      message: `買取申請（${rows[0].request_number}）を削除しました`,
      deleted_request: {
        id,
        request_number: rows[0].request_number,
        customer_name: request.customer_name
      }
    });
    
  } catch (error) {
    console.error('Delete buyback request error:', error);
    res.status(500).json({ 
      error: 'サーバーエラーが発生しました',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * Get status change history for a request
 * @param {string} requestId - Request ID
 * @returns {Promise<Array>} Status history
 */
async function getStatusHistory(requestId) {
  try {
    // Get communication history that contains status changes
    const { rows } = await query(`
      SELECT communication_history 
      FROM buyback_requests 
      WHERE id = $1
    `, [requestId]);

    if (rows.length === 0 || !rows[0].communication_history) {
      return [];
    }

    const history = JSON.parse(rows[0].communication_history);
    return history.filter(entry => entry.type === 'status_change');

  } catch (error) {
    console.error('Get status history error:', error);
    return [];
  }
}