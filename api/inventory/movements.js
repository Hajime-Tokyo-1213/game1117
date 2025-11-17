/**
 * Stock Movement Tracking API
 * Handles recording and retrieving inventory movement history
 */

import { authMiddleware } from '../utils/middleware.js';
import { query, getMany, getOne, insert, transaction } from '../utils/database.js';

/**
 * Main API Handler
 */
export default authMiddleware(async function handler(req, res) {
  switch (req.method) {
    case 'GET':
      return await getStockMovements(req, res);
    case 'POST':
      return await recordStockMovement(req, res);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
});

/**
 * Get stock movements with filtering
 * GET /api/inventory/movements
 */
async function getStockMovements(req, res) {
  try {
    const {
      product_id,
      movement_type,
      date_from,
      date_to,
      page = 1,
      limit = 50,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = req.query;
    
    // Build base SQL query
    let sql = `
      SELECT 
        sm.id,
        sm.product_id,
        sm.movement_type,
        sm.quantity_change,
        sm.previous_quantity,
        sm.new_quantity,
        sm.reason,
        sm.reference_id,
        sm.reference_type,
        sm.notes,
        sm.created_by,
        sm.created_at,
        p.name as product_name,
        p.category as product_category,
        u.name as created_by_name
      FROM stock_movements sm
      LEFT JOIN products p ON sm.product_id = p.id
      LEFT JOIN users u ON sm.created_by = u.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 0;
    
    // Apply product filter
    if (product_id) {
      paramCount++;
      sql += ` AND sm.product_id = $${paramCount}`;
      params.push(product_id);
    }
    
    // Apply movement type filter
    if (movement_type) {
      paramCount++;
      sql += ` AND sm.movement_type = $${paramCount}`;
      params.push(movement_type);
    }
    
    // Apply date range filter
    if (date_from) {
      paramCount++;
      sql += ` AND sm.created_at >= $${paramCount}`;
      params.push(date_from);
    }
    
    if (date_to) {
      paramCount++;
      sql += ` AND sm.created_at <= $${paramCount}`;
      params.push(date_to);
    }
    
    // Apply sorting
    const validSortColumns = ['created_at', 'movement_type', 'quantity_change', 'product_name'];
    const validSortOrders = ['ASC', 'DESC'];
    
    if (validSortColumns.includes(sortBy) && validSortOrders.includes(sortOrder.toUpperCase())) {
      if (sortBy === 'product_name') {
        sql += ` ORDER BY p.name ${sortOrder.toUpperCase()}`;
      } else {
        sql += ` ORDER BY sm.${sortBy} ${sortOrder.toUpperCase()}`;
      }
    } else {
      sql += ` ORDER BY sm.created_at DESC`;
    }
    
    // Apply pagination
    const offset = (page - 1) * limit;
    sql += ` LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);
    
    // Execute query
    const { rows } = await query(sql, params);
    
    // Get total count for pagination
    let countSql = `
      SELECT COUNT(*) 
      FROM stock_movements sm
      LEFT JOIN products p ON sm.product_id = p.id
      WHERE 1=1
    `;
    const countParams = [];
    let countParamCount = 0;
    
    // Apply same filters to count query
    if (product_id) {
      countParamCount++;
      countSql += ` AND sm.product_id = $${countParamCount}`;
      countParams.push(product_id);
    }
    
    if (movement_type) {
      countParamCount++;
      countSql += ` AND sm.movement_type = $${countParamCount}`;
      countParams.push(movement_type);
    }
    
    if (date_from) {
      countParamCount++;
      countSql += ` AND sm.created_at >= $${countParamCount}`;
      countParams.push(date_from);
    }
    
    if (date_to) {
      countParamCount++;
      countSql += ` AND sm.created_at <= $${countParamCount}`;
      countParams.push(date_to);
    }
    
    const { rows: countRows } = await query(countSql, countParams);
    const total = parseInt(countRows[0].count);
    
    res.json({
      movements: rows,
      total: total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1
    });
    
  } catch (error) {
    console.error('Get stock movements error:', error);
    res.status(500).json({ 
      error: 'サーバーエラーが発生しました',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * Record stock movement
 * POST /api/inventory/movements
 */
async function recordStockMovement(req, res) {
  try {
    // Check permissions (staff or above)
    if (!['staff', 'admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ error: '権限がありません' });
    }
    
    const {
      product_id,
      movement_type,
      quantity_change,
      reason,
      reference_id,
      reference_type,
      notes
    } = req.body;
    
    // Validate required fields
    if (!product_id || !movement_type || quantity_change === undefined) {
      return res.status(400).json({ 
        error: '商品ID、移動種別、数量変更は必須です',
        details: {
          product_id: !product_id ? '商品IDは必須です' : null,
          movement_type: !movement_type ? '移動種別は必須です' : null,
          quantity_change: quantity_change === undefined ? '数量変更は必須です' : null
        }
      });
    }
    
    // Validate movement type
    const validMovementTypes = ['in', 'out', 'adjustment', 'transfer', 'return', 'damage', 'lost'];
    if (!validMovementTypes.includes(movement_type)) {
      return res.status(400).json({ 
        error: '無効な移動種別です',
        validTypes: validMovementTypes
      });
    }
    
    // Validate quantity change
    if (typeof quantity_change !== 'number' || isNaN(quantity_change)) {
      return res.status(400).json({ error: '数量変更は数値である必要があります' });
    }
    
    // Use transaction to ensure data consistency
    const result = await transaction(async (client) => {
      // Get current product stock
      const productResult = await client.query(
        'SELECT id, name, stock_quantity FROM products WHERE id = $1 FOR UPDATE',
        [product_id]
      );
      
      if (productResult.rows.length === 0) {
        throw new Error('商品が見つかりません');
      }
      
      const product = productResult.rows[0];
      const previousQuantity = product.stock_quantity || 0;
      const newQuantity = previousQuantity + quantity_change;
      
      // Prevent negative stock (unless it's an adjustment)
      if (newQuantity < 0 && movement_type !== 'adjustment') {
        throw new Error(`在庫数がマイナスになります (現在: ${previousQuantity}, 変更: ${quantity_change})`);
      }
      
      // Record stock movement
      const movementData = {
        product_id,
        movement_type,
        quantity_change,
        previous_quantity: previousQuantity,
        new_quantity: newQuantity,
        reason: reason || null,
        reference_id: reference_id || null,
        reference_type: reference_type || null,
        notes: notes || null,
        created_by: req.user.id,
        created_at: new Date().toISOString()
      };
      
      const movementResult = await client.query(`
        INSERT INTO stock_movements (
          product_id, movement_type, quantity_change, previous_quantity, new_quantity,
          reason, reference_id, reference_type, notes, created_by, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `, [
        movementData.product_id,
        movementData.movement_type,
        movementData.quantity_change,
        movementData.previous_quantity,
        movementData.new_quantity,
        movementData.reason,
        movementData.reference_id,
        movementData.reference_type,
        movementData.notes,
        movementData.created_by,
        movementData.created_at
      ]);
      
      // Update product stock quantity
      await client.query(
        'UPDATE products SET stock_quantity = $1, updated_at = $2 WHERE id = $3',
        [newQuantity, new Date().toISOString(), product_id]
      );
      
      return {
        movement: movementResult.rows[0],
        product: {
          id: product.id,
          name: product.name,
          previousQuantity,
          newQuantity
        }
      };
    });
    
    res.status(201).json({
      movement: result.movement,
      product: result.product,
      message: '在庫移動が正常に記録されました'
    });
    
  } catch (error) {
    console.error('Record stock movement error:', error);
    
    // Handle business logic errors
    if (error.message.includes('在庫数がマイナス') || 
        error.message.includes('商品が見つかりません')) {
      return res.status(400).json({ 
        error: error.message
      });
    }
    
    // Handle database constraint errors
    if (error.code === '23503') { // Foreign key violation
      return res.status(400).json({ 
        error: '指定された商品が存在しません',
        details: error.detail
      });
    }
    
    res.status(500).json({ 
      error: 'サーバーエラーが発生しました',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}