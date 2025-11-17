/**
 * Inventory Statistics API
 * Provides dashboard statistics and analytics for inventory management
 */

import { authMiddleware } from '../utils/middleware.js';
import { query, getOne } from '../utils/database.js';

/**
 * Main API Handler
 */
export default authMiddleware(async function handler(req, res) {
  switch (req.method) {
    case 'GET':
      return await getInventoryStats(req, res);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
});

/**
 * Get inventory statistics
 * GET /api/inventory/stats
 */
async function getInventoryStats(req, res) {
  try {
    // Check permissions (staff or above)
    if (!['staff', 'admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ error: '権限がありません' });
    }

    const { timeframe = '30d' } = req.query;

    // Calculate date range
    const timeframeMap = {
      '7d': 7,
      '30d': 30,
      '90d': 90,
      '1y': 365
    };

    const days = timeframeMap[timeframe] || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get overall inventory summary
    const summaryResult = await query(`
      SELECT 
        COUNT(*) as total_products,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_products,
        SUM(selling_price * stock_quantity) as total_stock_value,
        SUM(stock_quantity) as total_stock_quantity,
        COUNT(DISTINCT category) as total_categories,
        SUM(CASE WHEN stock_quantity <= 5 AND stock_quantity > 0 AND status = 'active' THEN 1 ELSE 0 END) as low_stock_count,
        SUM(CASE WHEN stock_quantity = 0 AND status = 'active' THEN 1 ELSE 0 END) as out_of_stock_count
      FROM products
      WHERE status != 'deleted'
    `);

    // Get category breakdown
    const categoryResult = await query(`
      SELECT 
        category,
        COUNT(*) as product_count,
        SUM(stock_quantity) as total_quantity,
        SUM(selling_price * stock_quantity) as category_value,
        AVG(selling_price) as avg_price
      FROM products
      WHERE status = 'active'
      GROUP BY category
      ORDER BY category_value DESC
    `);

    // Get top selling products (based on stock movements)
    const topProductsResult = await query(`
      SELECT 
        p.id,
        p.name,
        p.category,
        p.selling_price,
        p.stock_quantity,
        COALESCE(sm.total_out, 0) as total_sold
      FROM products p
      LEFT JOIN (
        SELECT 
          product_id,
          SUM(ABS(quantity_change)) as total_out
        FROM stock_movements
        WHERE movement_type IN ('out', 'sale') 
          AND created_at >= $1
        GROUP BY product_id
      ) sm ON p.id = sm.product_id
      WHERE p.status = 'active'
      ORDER BY sm.total_out DESC NULLS LAST
      LIMIT 10
    `, [startDate.toISOString()]);

    // Get recent stock movements summary
    const movementsResult = await query(`
      SELECT 
        movement_type,
        COUNT(*) as movement_count,
        SUM(ABS(quantity_change)) as total_quantity
      FROM stock_movements
      WHERE created_at >= $1
      GROUP BY movement_type
      ORDER BY movement_count DESC
    `, [startDate.toISOString()]);

    // Get stock movement trends (daily)
    const trendsResult = await query(`
      SELECT 
        DATE(created_at) as movement_date,
        movement_type,
        SUM(ABS(quantity_change)) as daily_quantity
      FROM stock_movements
      WHERE created_at >= $1
      GROUP BY DATE(created_at), movement_type
      ORDER BY movement_date DESC
    `, [startDate.toISOString()]);

    // Get low stock alerts
    const lowStockResult = await query(`
      SELECT 
        id,
        name,
        category,
        stock_quantity,
        selling_price
      FROM products
      WHERE status = 'active' 
        AND stock_quantity <= 5 
        AND stock_quantity >= 0
      ORDER BY stock_quantity ASC, name
      LIMIT 20
    `);

    // Get manufacturer breakdown
    const manufacturerResult = await query(`
      SELECT 
        manufacturer,
        COUNT(*) as product_count,
        SUM(stock_quantity) as total_quantity,
        SUM(selling_price * stock_quantity) as manufacturer_value
      FROM products
      WHERE status = 'active' AND manufacturer IS NOT NULL
      GROUP BY manufacturer
      ORDER BY manufacturer_value DESC
      LIMIT 10
    `);

    const summary = summaryResult.rows[0] || {};
    
    res.json({
      summary: {
        totalProducts: parseInt(summary.total_products) || 0,
        activeProducts: parseInt(summary.active_products) || 0,
        totalStockValue: parseFloat(summary.total_stock_value) || 0,
        totalStockQuantity: parseInt(summary.total_stock_quantity) || 0,
        totalCategories: parseInt(summary.total_categories) || 0,
        lowStockCount: parseInt(summary.low_stock_count) || 0,
        outOfStockCount: parseInt(summary.out_of_stock_count) || 0
      },
      categories: categoryResult.rows.map(row => ({
        name: row.category,
        productCount: parseInt(row.product_count),
        totalQuantity: parseInt(row.total_quantity),
        categoryValue: parseFloat(row.category_value) || 0,
        avgPrice: parseFloat(row.avg_price) || 0
      })),
      topProducts: topProductsResult.rows.map(row => ({
        id: row.id,
        name: row.name,
        category: row.category,
        sellingPrice: parseFloat(row.selling_price) || 0,
        stockQuantity: parseInt(row.stock_quantity) || 0,
        totalSold: parseInt(row.total_sold) || 0
      })),
      movements: movementsResult.rows.map(row => ({
        type: row.movement_type,
        count: parseInt(row.movement_count),
        totalQuantity: parseInt(row.total_quantity)
      })),
      trends: trendsResult.rows.map(row => ({
        date: row.movement_date,
        type: row.movement_type,
        quantity: parseInt(row.daily_quantity)
      })),
      lowStockAlerts: lowStockResult.rows.map(row => ({
        id: row.id,
        name: row.name,
        category: row.category,
        stockQuantity: parseInt(row.stock_quantity),
        sellingPrice: parseFloat(row.selling_price) || 0
      })),
      manufacturers: manufacturerResult.rows.map(row => ({
        name: row.manufacturer,
        productCount: parseInt(row.product_count),
        totalQuantity: parseInt(row.total_quantity),
        manufacturerValue: parseFloat(row.manufacturer_value) || 0
      })),
      timeframe: timeframe,
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Get inventory stats error:', error);
    res.status(500).json({ 
      error: 'サーバーエラーが発生しました',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}