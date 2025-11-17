/**
 * Buyback Analytics API
 * Provides statistical analysis and reporting for buyback requests
 */

import { authMiddleware } from '../utils/middleware.js';
import { query } from '../utils/database.js';

/**
 * Main API Handler for analytics
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  return await authMiddleware(getBuybackAnalytics)(req, res);
}

/**
 * Get comprehensive buyback analytics
 * GET /api/buyback/analytics
 */
async function getBuybackAnalytics(req, res) {
  try {
    // Permission check
    if (!['store_staff', 'store_manager', 'admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Analytics access requires staff privileges' });
    }

    const {
      store_id,
      date_from,
      date_to,
      status,
      period = 'month',
      category
    } = req.query;

    // Build base filter conditions
    let conditions = ['1=1'];
    const params = [];
    let paramCount = 0;

    // Store access restriction for store staff
    if (['store_staff', 'store_manager'].includes(req.user.role)) {
      paramCount++;
      conditions.push(`br.preferred_store_id = $${paramCount}`);
      params.push(req.user.store_id);
    } else if (store_id && ['admin', 'super_admin'].includes(req.user.role)) {
      paramCount++;
      conditions.push(`br.preferred_store_id = $${paramCount}`);
      params.push(store_id);
    }

    if (date_from) {
      paramCount++;
      conditions.push(`br.created_at >= $${paramCount}`);
      params.push(date_from);
    }

    if (date_to) {
      paramCount++;
      conditions.push(`br.created_at <= $${paramCount}`);
      params.push(date_to + ' 23:59:59');
    }

    if (status) {
      paramCount++;
      conditions.push(`br.status = $${paramCount}`);
      params.push(status);
    }

    if (category) {
      paramCount++;
      conditions.push(`$${paramCount} = ANY(br.item_categories)`);
      params.push(category);
    }

    const whereClause = conditions.join(' AND ');

    // Run analytics queries in parallel
    const [
      overviewStats,
      statusBreakdown,
      periodTrends,
      categoryStats,
      storeStats,
      authMethodStats,
      averageProcessingTime,
      topValueRequests
    ] = await Promise.all([
      getOverviewStats(whereClause, params),
      getStatusBreakdown(whereClause, params),
      getPeriodTrends(whereClause, params, period),
      getCategoryStats(whereClause, params),
      getStoreStats(whereClause, params, req.user.role),
      getAuthMethodStats(whereClause, params),
      getAverageProcessingTime(whereClause, params),
      getTopValueRequests(whereClause, params)
    ]);

    res.json({
      overview: overviewStats,
      status_breakdown: statusBreakdown,
      trends: periodTrends,
      categories: categoryStats,
      stores: storeStats,
      auth_methods: authMethodStats,
      processing_times: averageProcessingTime,
      top_requests: topValueRequests,
      filters: {
        store_id,
        date_from,
        date_to,
        status,
        period,
        category
      },
      generated_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Buyback analytics error:', error);
    res.status(500).json({
      error: 'Analytics generation failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * Get overview statistics
 */
async function getOverviewStats(whereClause, params) {
  const { rows } = await query(`
    SELECT 
      COUNT(*) as total_requests,
      COUNT(*) FILTER (WHERE status = 'submitted') as pending_requests,
      COUNT(*) FILTER (WHERE status = 'completed') as completed_requests,
      COUNT(*) FILTER (WHERE status = 'rejected') as rejected_requests,
      AVG(estimated_total_value) as avg_estimated_value,
      SUM(estimated_total_value) as total_estimated_value,
      COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as recent_requests,
      (
        SELECT AVG(appraised_value)
        FROM buyback_appraisals ba
        JOIN buyback_requests br2 ON ba.request_id = br2.id
        WHERE ${whereClause}
      ) as avg_appraised_value
    FROM buyback_requests br
    WHERE ${whereClause}
  `, params);

  return rows[0];
}

/**
 * Get status breakdown statistics
 */
async function getStatusBreakdown(whereClause, params) {
  const { rows } = await query(`
    SELECT 
      status,
      COUNT(*) as count,
      ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage,
      AVG(estimated_total_value) as avg_value
    FROM buyback_requests br
    WHERE ${whereClause}
    GROUP BY status
    ORDER BY count DESC
  `, params);

  return rows;
}

/**
 * Get period trends
 */
async function getPeriodTrends(whereClause, params, period) {
  let dateFormat;
  switch (period) {
    case 'day':
      dateFormat = 'YYYY-MM-DD';
      break;
    case 'week':
      dateFormat = 'YYYY-"W"WW';
      break;
    case 'month':
      dateFormat = 'YYYY-MM';
      break;
    case 'year':
      dateFormat = 'YYYY';
      break;
    default:
      dateFormat = 'YYYY-MM';
  }

  const { rows } = await query(`
    SELECT 
      TO_CHAR(created_at, '${dateFormat}') as period,
      COUNT(*) as total_requests,
      COUNT(*) FILTER (WHERE status = 'completed') as completed_requests,
      COUNT(*) FILTER (WHERE status = 'rejected') as rejected_requests,
      AVG(estimated_total_value) as avg_estimated_value,
      SUM(estimated_total_value) as total_estimated_value
    FROM buyback_requests br
    WHERE ${whereClause}
    GROUP BY TO_CHAR(created_at, '${dateFormat}')
    ORDER BY period DESC
    LIMIT 12
  `, params);

  return rows;
}

/**
 * Get category statistics
 */
async function getCategoryStats(whereClause, params) {
  const { rows } = await query(`
    SELECT 
      category,
      COUNT(*) as request_count,
      AVG(estimated_total_value) as avg_estimated_value,
      SUM(estimated_total_value) as total_estimated_value,
      ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
    FROM (
      SELECT 
        UNNEST(item_categories) as category,
        estimated_total_value
      FROM buyback_requests br
      WHERE ${whereClause}
    ) category_data
    GROUP BY category
    ORDER BY request_count DESC
    LIMIT 20
  `, params);

  return rows;
}

/**
 * Get store statistics (admin only)
 */
async function getStoreStats(whereClause, params, userRole) {
  if (!['admin', 'super_admin'].includes(userRole)) {
    return [];
  }

  const { rows } = await query(`
    SELECT 
      s.name as store_name,
      s.id as store_id,
      COUNT(br.id) as total_requests,
      COUNT(br.id) FILTER (WHERE br.status = 'completed') as completed_requests,
      AVG(br.estimated_total_value) as avg_request_value,
      SUM(br.estimated_total_value) as total_request_value,
      COUNT(br.id) FILTER (WHERE br.created_at >= CURRENT_DATE - INTERVAL '30 days') as monthly_requests
    FROM stores s
    LEFT JOIN buyback_requests br ON s.id = br.preferred_store_id
    AND ${whereClause}
    WHERE s.is_active = true
    GROUP BY s.id, s.name
    ORDER BY total_requests DESC
  `, params);

  return rows;
}

/**
 * Get authentication method statistics
 */
async function getAuthMethodStats(whereClause, params) {
  const { rows } = await query(`
    SELECT 
      auth_method,
      COUNT(*) as count,
      ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage,
      AVG(estimated_total_value) as avg_value
    FROM buyback_requests br
    WHERE ${whereClause}
    GROUP BY auth_method
    ORDER BY count DESC
  `, params);

  return rows;
}

/**
 * Get average processing times
 */
async function getAverageProcessingTime(whereClause, params) {
  const { rows } = await query(`
    SELECT 
      'submitted_to_reviewing' as stage,
      AVG(
        EXTRACT(EPOCH FROM (
          (SELECT MIN(timestamp::timestamptz) FROM (
            SELECT jsonb_array_elements(communication_history)->>'timestamp' as timestamp,
                   jsonb_array_elements(communication_history)->>'new_status' as new_status
            FROM buyback_requests
            WHERE id = br.id
          ) ch WHERE new_status = 'reviewing')
          - br.created_at
        )) / 3600
      ) as avg_hours
    FROM buyback_requests br
    WHERE ${whereClause} 
    AND status IN ('reviewing', 'appraised', 'approved', 'completed')
    
    UNION ALL
    
    SELECT 
      'reviewing_to_appraised' as stage,
      AVG(
        EXTRACT(EPOCH FROM (
          (SELECT MIN(timestamp::timestamptz) FROM (
            SELECT jsonb_array_elements(communication_history)->>'timestamp' as timestamp,
                   jsonb_array_elements(communication_history)->>'new_status' as new_status
            FROM buyback_requests
            WHERE id = br.id
          ) ch WHERE new_status = 'appraised')
          - (SELECT MIN(timestamp::timestamptz) FROM (
            SELECT jsonb_array_elements(communication_history)->>'timestamp' as timestamp,
                   jsonb_array_elements(communication_history)->>'new_status' as new_status
            FROM buyback_requests
            WHERE id = br.id
          ) ch WHERE new_status = 'reviewing')
        )) / 3600
      ) as avg_hours
    FROM buyback_requests br
    WHERE ${whereClause}
    AND status IN ('appraised', 'approved', 'completed')
    
    UNION ALL
    
    SELECT 
      'overall_completion' as stage,
      AVG(
        EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600
      ) as avg_hours
    FROM buyback_requests br
    WHERE ${whereClause}
    AND status = 'completed'
  `, params);

  return rows;
}

/**
 * Get top value requests
 */
async function getTopValueRequests(whereClause, params) {
  const { rows } = await query(`
    SELECT 
      br.id,
      br.request_number,
      br.customer_name,
      br.status,
      br.estimated_total_value,
      COALESCE(SUM(ba.appraised_value), 0) as actual_appraised_value,
      br.created_at,
      s.name as store_name
    FROM buyback_requests br
    LEFT JOIN buyback_appraisals ba ON br.id = ba.request_id
    LEFT JOIN stores s ON br.preferred_store_id = s.id
    WHERE ${whereClause}
    GROUP BY br.id, s.name
    ORDER BY br.estimated_total_value DESC
    LIMIT 10
  `, params);

  return rows;
}